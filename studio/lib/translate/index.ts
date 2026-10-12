import { readReport, writeReport, httpError } from "../store.ts";
import { chunk, collect, reconcile, type TranslationProvider } from "./prompt.ts";
import * as anthropic from "./anthropic.ts";
import * as cli from "./cli.ts";
import type { Lang } from "../../../src/types.ts";
import type { Provider, Scope, TranslateResult, Usage } from "../types.ts";

/**
 * Run a translation and write the result back into the report.
 *
 * Providers only ever see a flat list of strings and hand back a flat map;
 * everything about the report shape — which fields are translatable, what is
 * stale, how it gets saved — lives here. Adding DeepL or Google means one more
 * module beside anthropic.ts and one more line in PROVIDERS.
 */

export const PROVIDERS: Record<Provider, TranslationProvider> = { api: anthropic, cli };

/** How many provider calls may be in flight at once. */
const CONCURRENCY = 3;

async function pooled<T, R>(batches: T[], limit: number, run: (batch: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(batches.length);
  let next = 0;

  const worker = async () => {
    while (next < batches.length) {
      const i = next++;
      results[i] = await run(batches[i], i);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, batches.length) }, worker));
  return results;
}

export interface TranslateRequest {
  provider?: string;
  apiKey?: string;
  model?: string;
  scope?: Scope;
  signal?: AbortSignal;
}

export async function translateReport(
  slug: string,
  lang: Lang,
  { provider = "cli", apiKey, model, scope = "stale", signal }: TranslateRequest = {}
): Promise<TranslateResult> {
  const impl = PROVIDERS[provider as Provider];
  if (!impl) throw httpError(400, `Unknown translation provider: ${provider}`);

  // Read from disk, not from the editor's buffer: the saved file is what the
  // PDF renders from, so it is what must end up translated.
  const doc = readReport(slug);
  const { report, status } = doc;
  const from: Lang = report.meta?.sourceLang ?? "en";

  if (lang === from) throw httpError(400, `${lang} is the source language of this report`);

  const fields = collect(report, lang, { scope, status });
  if (!fields.length) return { doc, filled: 0, missing: [], unknown: [], batches: 0 };

  const batches = chunk(fields);
  const replies = await pooled(batches, CONCURRENCY, (batch) =>
    impl.translate(batch, { from, to: lang, apiKey, model, signal })
  );

  const translations = Object.assign({}, ...replies.map((r) => r.translations));
  const { applied, missing, unknown } = reconcile(fields, translations);

  for (const field of applied) field.node[lang] = field.text;

  if (applied.length) {
    report.meta.translatedAt = { ...(report.meta.translatedAt ?? {}), [lang]: today() };
  }

  // refreshState only when nothing was left behind. A partial run must not
  // stamp "translated as of this English" onto fields that were skipped —
  // that would clear their stale badge without translating them.
  const saved = writeReport(slug, report, { refreshState: missing.length === 0 });

  return {
    doc: saved,
    filled: applied.length,
    missing,
    unknown,
    batches: batches.length,
    usage: mergeUsage(replies.map((r) => r.usage)),
  };
}

const today = () => new Date().toISOString().slice(0, 10);

function mergeUsage(entries: (Usage | undefined)[]): Usage {
  const total: Record<string, number> = {};
  for (const usage of entries) {
    for (const [k, v] of Object.entries(usage ?? {})) {
      if (typeof v === "number") total[k] = (total[k] ?? 0) + v;
    }
  }
  return total;
}
