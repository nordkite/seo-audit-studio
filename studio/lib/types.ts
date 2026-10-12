/**
 * Shapes the Studio API sends and receives. Shared by studio/server.ts and the
 * client (studio/client/src/lib/types.ts re-exports them), so a change to a
 * response is a type error on both sides. No Node imports: the client bundles
 * this file.
 */
import type { Lang, Report } from "../../src/types.ts";
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
