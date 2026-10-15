import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS, type I18n, type Lang, type Report } from "./types.ts";

const ROOT = join(import.meta.dirname, "..");

export const SUPPORTED_LANGS: readonly Lang[] = LANGS;

export function isLang(lang: unknown): lang is Lang {
  return SUPPORTED_LANGS.includes(lang as Lang);
}

/**
 * The fixed report chrome from i18n/<lang>.json. Loosely typed: the shape is
 * whatever those files hold, and render.ts reads it by key.
 */
export type Strings = { locale: string } & Record<string, any>;

export function loadStrings(lang: string): Strings {
  if (!isLang(lang)) {
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
 * — a partially translated report is still a usable report. A blank string
 * counts as missing: clearing a translation in the Studio saves "", and that
 * must fall back too.
 */
export function t(field: string | I18n | null | undefined, lang: Lang, sourceLang: Lang = "en"): string {
  if (field == null) return "";
  if (typeof field === "string") return field;
  const filled = (s: string | undefined) => (s?.trim() ? s : undefined);
  return filled(field[lang]) ?? filled(field[sourceLang]) ?? field.en ?? "";
}

/** Returns the langs a report is genuinely translated into. */
export function availableLangs(report: Partial<Report>): Lang[] {
  const probe: I18n = report.summary ?? {};
  return SUPPORTED_LANGS.filter((l) => typeof probe[l] === "string" && probe[l].length);
}

export function formatDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}
