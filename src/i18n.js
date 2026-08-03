import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const SUPPORTED_LANGS = ["en", "et", "ru"];

export function loadStrings(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) {
    throw new Error(
      `Unsupported language "${lang}". Supported: ${SUPPORTED_LANGS.join(", ")}`
    );
  }
  return JSON.parse(readFileSync(join(ROOT, "i18n", `${lang}.json`), "utf8"));
}

/**
 * Resolve a translatable field.
 *
 * Report JSON stores every human string as { en, et, ru }. If a translation is
 * missing we fall back to the source language rather than rendering "undefined"
 * — a partially translated report is still a usable report.
 */
export function t(field, lang, sourceLang = "en") {
  if (field == null) return "";
  if (typeof field === "string") return field;
  return field[lang] ?? field[sourceLang] ?? field.en ?? "";
}

/** Returns the langs a report is genuinely translated into. */
export function availableLangs(report) {
  const probe = report.summary ?? {};
  return SUPPORTED_LANGS.filter((l) => typeof probe[l] === "string" && probe[l].length);
}

export function formatDate(iso, locale) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatNumber(n, locale) {
  return new Intl.NumberFormat(locale).format(n);
}
