import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../store.js";
import { translatableFields } from "../state.js";

/**
 * The one translation prompt, shared by every provider.
 *
 * Both providers translate the same way: hand the model a flat map of
 * `field path → English text` and ask for the same map back in the target
 * language. Nothing here reads or writes the report file — applying the result
 * is the caller's job (see index.js), which is what keeps the providers
 * interchangeable and testable.
 */

const LANG_NAME = { en: "English", et: "Estonian", ru: "Russian" };

/** ~3000 source characters per request. Keeps each response well inside
 *  max_tokens and lets a long report run as a few parallel calls. */
const CHUNK_CHARS = 3000;

export function langName(lang) {
  return LANG_NAME[lang] ?? lang;
}

/**
 * @param outputShape How this provider wants the answer back. The API provider
 *   also enforces a JSON schema; the CLI provider has only these words.
 */
export function systemPrompt(from, to, outputShape) {
  const rules = readFileSync(join(ROOT, "i18n", "translation-rules.md"), "utf8");
  const glossary = JSON.parse(readFileSync(join(ROOT, "i18n", "glossary.json"), "utf8"));

  return `You translate SEO audit copy from ${langName(from)} into ${langName(to)} for Nordkite, an SEO consultancy.

You will be given a JSON object mapping opaque field keys to ${langName(from)} text.
Translate every value. Keys are identifiers, not content: never translate a key,
never invent one, never drop one.

${outputShape}

${rules}

## Protected terms

These must appear verbatim in your output wherever they appear in the source:

${glossary.doNotTranslate.join(", ")}`;
}

/** The user turn: just the payload, so the system prefix stays cacheable. */
export function userPrompt(fields) {
  return JSON.stringify(Object.fromEntries(fields.map((f) => [f.key, f.text])), null, 2);
}

/**
 * Fields that need translating into `lang`.
 *
 * `scope: "missing"` covers untranslated fields only. `"stale"` adds the ones
 * whose English changed since the last run — the default, because a stale
 * translation is a wrong translation that looks finished. `"all"` retranslates
 * everything.
 */
export function collect(report, lang, { scope = "stale", status = {} } = {}) {
  const from = report.meta?.sourceLang ?? "en";
  if (lang === from) return [];

  const out = [];
  for (const { path, node } of translatableFields(report)) {
    const text = node[from];
    if (typeof text !== "string" || !text.trim()) continue;

    const state = status[path]?.[lang] ?? "missing";
    const wanted =
      scope === "all" ||
      state === "missing" ||
      (scope === "stale" && state === "stale");
    if (wanted) out.push({ key: path, text, node });
  }
  return out;
}

/** Split into request-sized batches, keeping long fields in their own batch. */
export function chunk(fields, size = CHUNK_CHARS) {
  const batches = [];
  let current = [];
  let chars = 0;

  for (const field of fields) {
    if (current.length && chars + field.text.length > size) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(field);
    chars += field.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * Match a provider's reply back to what we asked for.
 *
 * Providers return `{ key: text }`. A key we never sent is dropped rather than
 * written — an invented path would land in the report as a phantom field.
 */
export function reconcile(fields, translations) {
  const applied = [];
  const missing = [];

  for (const field of fields) {
    const text = translations[field.key];
    if (typeof text === "string" && text.trim()) applied.push({ ...field, text });
    else missing.push(field.key);
  }

  const unknown = Object.keys(translations).filter(
    (k) => !fields.some((f) => f.key === k)
  );
  return { applied, missing, unknown };
}
