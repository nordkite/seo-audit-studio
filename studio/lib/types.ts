/**
 * Shapes the Studio API sends and receives. Shared by studio/server.ts and the
 * client (studio/client/src/lib/types.ts re-exports them), so a change to a
 * response is a type error on both sides. No Node imports: the client bundles
 * this file.
 */
import type { AuditScope, Lang, Report } from "../../src/types.ts";
import type { BrandTheme } from "../../src/theme.ts";

/** Per-field, per-language translation state. See state.ts. */
export type FieldStatus = "source" | "current" | "stale" | "missing";

export type FieldStatusMap = Record<string, Partial<Record<Lang, FieldStatus>>>;

export interface Totals {
  current: number;
  stale: number;
  missing: number;
}

export interface Doc {
  slug: string;
  report: Report;
  mtime: number;
  status: FieldStatusMap;
  totals: Partial<Record<Lang, Totals>>;
}

export const PROVIDERS = ["cli", "api"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Thinking depth. On current models thinking is always on; effort is the only dial. */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** One entry in the Model dropdown. `value` is what goes to the provider; "" means its default. */
export interface ModelOption {
  value: string;
  label: string;
  /** Effort levels this model accepts. Empty when it takes no effort setting at all. */
  efforts: Effort[];
}

/** POST /api/models. */
export interface ModelsResult {
  models: ModelOption[];
  /** `live`: asked the API with this key. `aliases`: Claude Code's own names. `fallback`: built-in list. */
  source: "live" | "aliases" | "fallback";
  /** Why the live list could not be fetched, when source is `fallback`. */
  error?: string;
}

/** How much to retranslate. `stale` also covers anything never translated. */
export type Scope = "missing" | "stale" | "all";

export interface Usage {
  input?: number;
  output?: number;
  costUsd?: number;
}

export interface TranslateResult {
  doc: Doc;
  filled: number;
  missing: string[];
  unknown: string[];
  batches: number;
  usage?: Usage;
}

/** How far a translation has got. Sent once before the first batch, then after each one. */
export interface TranslateProgress {
  batchesDone: number;
  batches: number;
  fieldsDone: number;
  fields: number;
}

/** One NDJSON line of a /api/translate response. The last line is `result` or `error`. */
export type TranslateEvent =
  | ({ type: "progress" } & TranslateProgress)
  | { type: "result"; result: TranslateResult }
  | { type: "error"; error: string };

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
  scope: AuditScope;
  /** `meta.languages`: the site's language versions covered, when not all. */
  siteLanguages?: string[];
  broken?: boolean;
}

/** GET/PUT /api/brand: the theme part of brand/brand.json. */
export interface BrandDoc {
  theme: BrandTheme;
  /** Which logo files brand.json names, so the editor can say what "logoOnDark" will show. */
  hasLogo: boolean;
  hasLogoOnDark: boolean;
  /** brand/ is missing and the example is standing in. Saving is refused. */
  isExample: boolean;
  /** Where saving writes, for the editor to show. */
  file: string;
}

/* ---------------------------------------------------------------- audits -- */

/** One check from `npm run doctor -- --json`. */
export interface DoctorCheck {
  name: string;
  required: boolean;
  ok: boolean;
  warn?: boolean;
  detail?: string;
  fix?: string;
}

/** GET /api/audits/preflight. An audit is refused while `ok` is false. */
export interface Preflight {
  ok: boolean;
  checks: DoctorCheck[];
}

/** Models an audit can run on. Left out, the user's own Claude Code setting. */
export const AUDIT_MODELS = ["opus", "sonnet"] as const;
export type AuditModel = (typeof AUDIT_MODELS)[number];

export interface AuditRequest {
  url: string;
  scope: AuditScope;
  clientName?: string;
  /** The main agent's model. Left out: the user's Claude Code setting. */
  model?: AuditModel;
  /** Left out: the user's Claude Code setting. */
  effort?: Effort;
  /**
   * `sonnet` runs every subagent on Sonnet, overriding the models claude-seo's
   * agent files name. Left out: as claude-seo defines them.
   */
  subagents?: "sonnet";
  /**
   * Site audits only: the language versions to cover, by their first hreflang
   * code. Left out to cover every version.
   */
  languages?: string[];
}

/** GET /api/audits/existing: the report an audit with these settings would replace. */
export interface ExistingReport {
  slug: string;
  clientName: string;
  auditedAt: string | null;
}

/** One language version, from scripts/site-languages.ts. */
export interface LanguageVersion {
  langs: string[];
  root: string;
  isRoot: boolean;
  inferred?: boolean;
}

/** GET /api/audits/languages?url=…: the site's language versions. */
export interface SiteLanguages {
  url: string;
  home: string;
  rootLang: string | null;
  source: "hreflang" | "html-lang" | "none";
  versions: LanguageVersion[];
  /** Versions cannot be told apart by URL, so only a whole-site audit is possible. */
  unsupported?: string;
}

export type AuditStatus = "running" | "done" | "failed" | "cancelled";

/** One line of progress, read off the agent's tool calls. */
export interface AuditStep {
  at: number;
  text: string;
  /** Inside a subagent rather than the main run. */
  nested?: boolean;
}

/** Whether the machine was kept awake for the run, and how. */
export interface KeepAwake {
  ok: boolean;
  method: string;
  detail?: string;
}

export interface AuditJob extends AuditRequest {
  id: string;
  status: AuditStatus;
  startedAt: number;
  endedAt?: number;
  steps: AuditStep[];
  keepAwake: KeepAwake | null;
  /** The report the run wrote, once it has finished. */
  slug?: string;
  /** Why it failed, or the agent's closing message when it did not. */
  message?: string;
  /** Raw stream-json log, relative to the repo root. */
  log: string;
  /** The Claude session, so a stopped run can be resumed. */
  sessionId?: string;
  /** The job this one resumed. */
  resumedFrom?: string;
  /** For a resumed job, when the original run started. */
  since?: number;
  costUsd?: number;
}
