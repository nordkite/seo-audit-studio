import { createHash } from "node:crypto";
import { SUPPORTED_LANGS } from "../../src/i18n.js";

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
 * The hashes live under `_translationState`, which both render.js and
 * validate.js ignore — they only read keys they know about.
 */

const COLLECTIONS = ["findings", "roadmap", "notCovered", "sections"];

const isI18n = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export const hash = (text) =>
  createHash("sha256").update(String(text ?? "")).digest("hex").slice(0, 12);

export function slugify(s) {
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

function* itemFields(coll, item, id) {
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
export function* translatableFields(report) {
  if (isI18n(report.summary)) yield { path: "summary", node: report.summary };
  if (isI18n(report.method)) yield { path: "method", node: report.method };

  for (const coll of COLLECTIONS) {
    const items = report[coll];
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
export function ensureIds(report) {
  for (const coll of COLLECTIONS) {
    const items = report[coll];
    if (!Array.isArray(items)) continue;

    const seen = new Set();
    for (const [i, item] of items.entries()) {
      if (!item || typeof item !== "object") continue;
      let id = item.id || slugify(item.title?.en ?? item.title ?? `${coll}-${i + 1}`);
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
export function baseline(report) {
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
export function computeState(report) {
  const source = report.meta?.sourceLang ?? "en";
  const state = {};
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
export function statusFor(report) {
  const source = report.meta?.sourceLang ?? "en";
  const stored = report._translationState ?? {};
  const out = {};

  for (const { path, node } of translatableFields(report)) {
    // An empty source string has nothing to translate. Reporting it as
    // "missing" in every target language would park a permanent count on the
    // language tabs that no amount of translating could clear.
    if (typeof node[source] !== "string" || !node[source].trim()) continue;

    const live = hash(node[source]);
    const langs = {};

    for (const lang of SUPPORTED_LANGS) {
      if (lang === source) {
        langs[lang] = "source";
      } else if (typeof node[lang] !== "string" || !node[lang].length) {
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
export function summarize(status) {
  const totals = {};
  for (const langs of Object.values(status)) {
    for (const [lang, s] of Object.entries(langs)) {
      if (s === "source") continue;
      totals[lang] ??= { current: 0, stale: 0, missing: 0 };
      totals[lang][s]++;
    }
  }
  return totals;
}
