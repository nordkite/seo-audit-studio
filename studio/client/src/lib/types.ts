export const LANGS = ["en", "et", "ru"] as const;
export const SEVERITIES = ["critical", "warning", "opportunity", "pass"] as const;
export const ANCHORS = ["summary", "breakdown", "findings", "roadmap", "notCovered"] as const;
export const LEVELS = ["high", "medium", "low"] as const;

export type Lang = (typeof LANGS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Anchor = (typeof ANCHORS)[number];
export type Level = (typeof LEVELS)[number];

/** Every human string in a report is one of these. */
export type I18n = Partial<Record<Lang, string>>;

/** Per-field, per-language translation state. See studio/lib/state.js. */
export type FieldStatus = "source" | "current" | "stale" | "missing";

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
  clientName: string;
  auditedAt: string;
  pagesAnalyzed: number;
  score: number;
  stack?: string;
  sourceLang?: Lang;
  translatedAt?: Partial<Record<Lang, string>>;
}

export interface Report {
  meta: Meta;
  summary: I18n;
  method: I18n;
  findings: Finding[];
  roadmap?: ListItem[];
  notCovered?: ListItem[];
  sections?: Section[];
  _translationState?: Record<string, string>;
}

export interface Doc {
  slug: string;
  report: Report;
  mtime: number;
  status: Record<string, Record<Lang, FieldStatus>>;
  totals: Partial<Record<Lang, { current: number; stale: number; missing: number }>>;
}

export const PROVIDERS = ["cli", "api"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** How much to retranslate. `stale` also covers anything never translated. */
export type Scope = "stale" | "all";

export interface TranslateSettings {
  provider: Provider;
  /** Only ever held in localStorage and sent per request. Never persisted server-side. */
  apiKey: string;
  model: string;
  scope: Scope;
}

export interface TranslateResult {
  doc: Doc;
  filled: number;
  missing: string[];
  unknown: string[];
  batches: number;
  usage?: { input?: number; output?: number; costUsd?: number };
}

export interface Health {
  ok: boolean;
  langs: Lang[];
  defaultModel: string;
  hasEnvKey: boolean;
}

export interface ReportSummary {
  slug: string;
  site: string;
  clientName: string;
  score: number | null;
  auditedAt: string | null;
  findings: number;
  langs: Lang[];
  broken?: boolean;
}
