/**
 * The report schema: what `reports/<slug>.json` holds.
 *
 * One definition for the renderer, the validator, the Studio server and the
 * Studio client. Runtime constants live here too, so the lists of severities and
 * anchors cannot drift between the code that renders them and the code that
 * validates them. No Node imports: the Studio client bundles this file.
 */

export const LANGS = ["en", "et", "ru"] as const;
export const SEVERITIES = ["critical", "warning", "opportunity", "pass"] as const;
/** Where a custom section may be slotted into the body flow. */
export const ANCHORS = ["summary", "breakdown", "findings", "roadmap", "notCovered"] as const;
export const LEVELS = ["high", "medium", "low"] as const;
/** What was audited: a whole site (`/new-audit`) or one URL (`/new-page-audit`). */
export const SCOPES = ["site", "page"] as const;
/** Measured-data sources an audit may draw on, in the order the report lists them. */
export const DATA_SOURCES = ["searchConsole", "analytics", "crux", "pagespeed"] as const;
/**
 * `notConfigured`: no credentials on this machine. `noAccess`: credentials, but
 * not for this site. `noData`: asked, nothing to return (CrUX for a low-traffic
 * site). `failed`: the call errored.
 */
export const SOURCE_STATUSES = ["used", "notConfigured", "noAccess", "noData", "failed"] as const;
/**
 * claude-seo's scoring categories, in the order the report charts them. A full
 * audit scores all seven; seo-page scores five (no performance, no AI search).
 */
export const CATEGORIES = ["technical", "content", "onPage", "schema", "performance", "aiSearch", "images"] as const;
/** Lighthouse's four category scores, as PageSpeed Insights reports them. */
export const LIGHTHOUSE = ["performance", "accessibility", "bestPractices", "seo"] as const;

export type Lang = (typeof LANGS)[number];
export type DataSource = (typeof DATA_SOURCES)[number];
export type SourceStatus = (typeof SOURCE_STATUSES)[number];
export type Category = (typeof CATEGORIES)[number];
export type LighthouseScore = (typeof LIGHTHOUSE)[number];
export type AuditScope = (typeof SCOPES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Anchor = (typeof ANCHORS)[number];
export type Level = (typeof LEVELS)[number];

/** Every human string in a report is one of these. */
export type I18n = Partial<Record<Lang, string>>;

export interface Finding {
  id: string;
  severity: Severity;
  impact?: Level;
  effort?: Level;
  /** A plain string is a verbatim reference (URL, filename) and is never translated. */
  evidence?: string | I18n;
  title: I18n;
  body?: I18n;
}

export interface ListItem {
  id: string;
  title: I18n;
  body?: I18n;
}

export interface Section {
  id: string;
  after?: Anchor;
  breakBefore?: boolean;
  title: I18n;
  body?: I18n;
  image?: { src: string; alt?: I18n; caption?: I18n };
}

export interface Meta {
  slug: string;
  site: string;
  siteUrl?: string;
  /** Defaults to "site". A "page" report must also set `pageUrl`. */
  scope?: AuditScope;
  /** The one URL a page-scope report covers. */
  pageUrl?: string;
  clientName: string;
  auditedAt: string;
  pagesAnalyzed: number;
  score: number;
  stack?: string;
  /** Which measured data the audit had. Fixed values, so nothing here is translated. */
  dataSources?: Partial<Record<DataSource, SourceStatus>>;
  sourceLang?: Lang;
  translatedAt?: Partial<Record<Lang, string>>;
}

/** Numbers only, never translated. Labels come from i18n/*.json. */
export interface SearchConsoleMetrics {
  start: string;
  end: string;
  clicks: number;
  impressions: number;
  /** A fraction (0.027), not a percentage. */
  ctr: number;
  position: number;
  topQueries?: { query: string; clicks: number; impressions: number; position: number }[];
}

export interface CoreWebVitalsMetrics {
  source: "field" | "lab";
  strategy?: string;
  url?: string;
  /** Milliseconds. */
  lcp?: number | null;
  /** Milliseconds. */
  inp?: number | null;
  cls?: number | null;
  /** Lighthouse scores, 0–100, from the same lab run. */
  performance?: number | null;
  accessibility?: number | null;
  bestPractices?: number | null;
  seo?: number | null;
}

export interface Report {
  meta: Meta;
  summary: I18n;
  method: I18n;
  /** Replaces the default confidentiality line at the end of the report. */
  closingNote?: I18n;
  /** Drops that line entirely, custom or default. */
  hideClosingNote?: boolean;
  findings: Finding[];
  /** claude-seo's per-category scores, 0–100. Numbers only; labels come from i18n. */
  scores?: Partial<Record<Category, number>>;
  roadmap?: ListItem[];
  notCovered?: ListItem[];
  sections?: Section[];
  metrics?: {
    searchConsole?: SearchConsoleMetrics;
    coreWebVitals?: CoreWebVitalsMetrics;
  };
  _translationState?: Record<string, string>;
}
