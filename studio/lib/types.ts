/**
 * Shapes the Studio API sends and receives. Shared by studio/server.ts and the
 * client (studio/client/src/lib/types.ts re-exports them), so a change to a
 * response is a type error on both sides. No Node imports: the client bundles
 * this file.
 */
import type { Lang, Report } from "../../src/types.ts";

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
