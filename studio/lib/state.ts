import { createHash } from "node:crypto";
import { SUPPORTED_LANGS } from "../../src/i18n.ts";
import type { I18n, Lang, Report } from "../../src/types.ts";
import type { FieldStatus, FieldStatusMap, Totals } from "./types.ts";

/**
 * Translation staleness.
 *
 * A report stores every human string as { en, et, ru }. Nothing in the render
 * pipeline notices when `en` is edited after `et`/`ru` were written — the PDF
 * just ships with two languages saying different things. That is fine when
 * translation is a deliberate command; it is not fine once a GUI makes English
 * edits trivial.
 *
 * So we record, per field, a hash of the source text as it stood at the last
 * successful translation. A mismatch on load means the translation is stale.
 * The hashes live under `_translationState`, which both render.ts and
 * validate.ts ignore — they only read keys they know about.
 */

const COLLECTIONS = ["findings", "roadmap", "notCovered", "sections"] as const;
type Collection = (typeof COLLECTIONS)[number];

/** A translatable node and its stable path, e.g. `findings.missing-h1.title`. */
export interface Field {
  path: string;
  node: I18n;
}

const isI18n = (v: unknown): v is I18n => v !== null && typeof v === "object" && !Array.isArray(v);

export const hash = (text: unknown): string =>
  createHash("sha256").update(String(text ?? "")).digest("hex").slice(0, 12);

export function slugify(s: unknown): string {
  return (
    String(s ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "") // strip combining marks: õ → o, ä → a
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item"
  );
}

/** Loosely typed on purpose: this walks parsed JSON before validation. */
type Item = Record<string, any>;

function* itemFields(coll: Collection, item: Item, id: string): Generator<Field> {
  const base = `${coll}.${id}`;
  if (isI18n(item.title)) yield { path: `${base}.title`, node: item.title };
  if (isI18n(item.body)) yield { path: `${base}.body`, node: item.body };

  // Evidence is dual-typed: a plain string is a verbatim technical reference
  // (a URL, a filename) and is never translated. Only the object form counts.
  if (coll === "findings" && isI18n(item.evidence)) {
    yield { path: `${base}.evidence`, node: item.evidence };
  }
  if (coll === "sections" && item.image) {
    if (isI18n(item.image.alt)) yield { path: `${base}.image.alt`, node: item.image.alt };
    if (isI18n(item.image.caption)) {
      yield { path: `${base}.image.caption`, node: item.image.caption };
    }
  }
}

/** Every translatable { en, et, ru } node in the report, with a stable path. */
export function* translatableFields(report: Report): Generator<Field> {
  if (isI18n(report.summary)) yield { path: "summary", node: report.summary };
  if (isI18n(report.method)) yield { path: "method", node: report.method };
  if (isI18n(report.closingNote)) yield { path: "closingNote", node: report.closingNote };

  for (const coll of COLLECTIONS) {
    const items: Item[] | undefined = report[coll];
    if (!Array.isArray(items)) continue;
    for (const [i, item] of items.entries()) {
      if (!item || typeof item !== "object") continue;
      yield* itemFields(coll, item, item.id ?? `#${i}`);
    }
  }
}

/**
 * Give every collection entry a stable `id`.
 *
 * Findings already have one. Roadmap steps, notCovered items and sections do
 * not, and staleness has to key off something that survives reordering — array
 * position does not. Mutates in place; persisted on the next save.
 */
export function ensureIds(report: Report): Report {
  for (const coll of COLLECTIONS) {
    const items: Item[] | undefined = report[coll];
    if (!Array.isArray(items)) continue;

    const seen = new Set<string>();
    for (const [i, item] of items.entries()) {
      if (!item || typeof item !== "object") continue;
      let id: string = item.id || slugify(item.title?.en ?? item.title ?? `${coll}-${i + 1}`);
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}-${n}`)) n++;
        id = `${id}-${n}`;
      }
      seen.add(id);
      item.id = id;
    }
  }
  return report;
}

/**
 * Adopt the on-disk state as the baseline for a report that predates tracking.
 *
 * Done at load, not at save, and that ordering is the whole point: baselining
 * on save would hash whatever English the user had just typed, quietly blessing
 * the drift they were about to introduce. Hashing at load pins the baseline to
 * the text as it was when the file was opened.
 */
export function baseline(report: Report): Report {
  // An empty map counts as "no tracking yet", not "nothing is current" — it
  // carries no information, so adopting costs nothing. Without this an empty
  // map would be a permanent trap: every field stuck stale until a full
  // re-translation, with no way back.
  const state = report._translationState;
  if (!state || typeof state !== "object" || !Object.keys(state).length) {
    report._translationState = computeState(report);
  }
  return report;
}

/** Hashes of every source string as it stands right now. */
export function computeState(report: Report): Record<string, string> {
  const source: Lang = report.meta?.sourceLang ?? "en";
  const state: Record<string, string> = {};
  for (const { path, node } of translatableFields(report)) {
    const text = node[source];
    if (typeof text === "string" && text.length) state[path] = hash(text);
  }
  return state;
}

/**
 * Per-field, per-language status for the editor.
 *
 *   source  — this is the language the report was written in
 *   missing — never translated
 *   stale   — translated, but the source has changed since
 *   current — translated against the source text as it stands
 *
 * A translated field with no recorded hash reads as `stale`. Reports written
 * before tracking existed are baselined on load (see `baseline`) so they do not
 * open with every field flagged — after that, a missing hash is a real signal.
 */
export function statusFor(report: Report): FieldStatusMap {
  const source: Lang = report.meta?.sourceLang ?? "en";
  const stored = report._translationState ?? {};
  const out: FieldStatusMap = {};

  for (const { path, node } of translatableFields(report)) {
    // An empty source string has nothing to translate. Reporting it as
    // "missing" in every target language would park a permanent count on the
    // language tabs that no amount of translating could clear.
    const text = node[source];
    if (typeof text !== "string" || !text.trim()) continue;

    const live = hash(text);
    const langs: Partial<Record<Lang, FieldStatus>> = {};

    for (const lang of SUPPORTED_LANGS) {
      const translated = node[lang];
      if (lang === source) {
        langs[lang] = "source";
      } else if (typeof translated !== "string" || !translated.length) {
        langs[lang] = "missing";
      } else if (stored[path] && live && stored[path] === live) {
        langs[lang] = "current";
      } else {
        langs[lang] = "stale";
      }
    }
    out[path] = langs;
  }
  return out;
}

/** Rolled-up counts per language, for the header badges. */
export function summarize(status: FieldStatusMap): Partial<Record<Lang, Totals>> {
  const totals: Partial<Record<Lang, Totals>> = {};
  for (const langs of Object.values(status)) {
    for (const [lang, s] of Object.entries(langs) as [Lang, FieldStatus][]) {
      if (s === "source") continue;
      const t = (totals[lang] ??= { current: 0, stale: 0, missing: 0 });
      t[s]++;
    }
  }
  return totals;
}
