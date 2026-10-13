import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  copyFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { validate } from "../../src/validate.ts";
import { availableLangs } from "../../src/i18n.ts";
import type { Report } from "../../src/types.ts";
import { ensureIds, baseline, computeState, statusFor, summarize } from "./state.ts";
import type { Doc, ReportSummary } from "./types.ts";

export const ROOT = join(import.meta.dirname, "..", "..");
const REPORTS = join(ROOT, "reports");
const BACKUPS = join(ROOT, ".studio-backups");
const KEEP_BACKUPS = 20;

/** An Error the server turns into an HTTP response with this status. */
export function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

/** Slugs become file paths. Anything outside this shape is rejected outright. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function assertSlug(slug: unknown): string {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    throw httpError(400, `Invalid slug: ${slug}`);
  }
  return slug;
}

export const reportPath = (slug: string) => join(REPORTS, `${assertSlug(slug)}.json`);

export function listReports(): ReportSummary[] {
  if (!existsSync(REPORTS)) return [];
  return readdirSync(REPORTS)
    .filter((f) => f.endsWith(".json"))
    .map((f): ReportSummary => {
      const slug = f.replace(/\.json$/, "");
      try {
        const report: Partial<Report> = JSON.parse(readFileSync(join(REPORTS, f), "utf8"));
        return {
          slug,
          site: report.meta?.site ?? slug,
          clientName: report.meta?.clientName ?? "",
          score: report.meta?.score ?? null,
          auditedAt: report.meta?.auditedAt ?? null,
          findings: report.findings?.length ?? 0,
          langs: availableLangs(report),
          scope: report.meta?.scope ?? "site",
        };
      } catch {
        return {
          slug,
          site: slug,
          clientName: "",
          score: null,
          auditedAt: null,
          findings: 0,
          langs: [],
          scope: "site",
          broken: true,
        };
      }
    })
    .sort((a, b) => String(b.auditedAt).localeCompare(String(a.auditedAt)));
}

/**
 * Read a report for editing.
 *
 * `mtime` goes back to the client and must come back on save — the translate
 * command and a Claude Code session can both rewrite this file while the
 * editor holds it open, and last-write-wins would silently discard their work.
 */
export function readReport(slug: string): Doc {
  const path = reportPath(slug);
  if (!existsSync(path)) throw httpError(404, `No such report: ${slug}`);

  const report = baseline(ensureIds(JSON.parse(readFileSync(path, "utf8"))));
  const status = statusFor(report);

  return {
    slug,
    report,
    mtime: statSync(path).mtimeMs,
    status,
    totals: summarize(status),
  };
}

export function backup(path: string, slug: string): void {
  if (!existsSync(path)) return;
  const dir = join(BACKUPS, slug);
  mkdirSync(dir, { recursive: true });
  copyFileSync(path, join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`));

  const old = readdirSync(dir).sort().slice(0, -KEEP_BACKUPS);
  for (const f of old) unlinkSync(join(dir, f));
}

/**
 * Write a report.
 *
 * Order matters: validate before touching disk, back up before overwriting,
 * and write through a temp file so a crash mid-write cannot leave a truncated
 * JSON file where an audit used to be.
 */
export function writeReport(
  slug: string,
  report: Report,
  { expectedMtime, refreshState = false }: { expectedMtime?: number; refreshState?: boolean } = {}
): Doc {
  const path = reportPath(slug);

  if (expectedMtime != null && existsSync(path)) {
    const actual = statSync(path).mtimeMs;
    // Sub-millisecond drift is filesystem noise, not a real edit.
    if (Math.abs(actual - expectedMtime) > 1) {
      throw httpError(
        409,
        `${slug}.json changed on disk since you opened it — reload before saving, ` +
          `or your edits will overwrite whatever changed it.`
      );
    }
  }

  ensureIds(report);
  validate(report, path);

  // Only a completed translation run may claim the source text is translated.
  // Otherwise keep whatever baseline the client is holding — re-hashing here
  // would bless the very edits we want to flag.
  if (refreshState) report._translationState = computeState(report);
  else baseline(report);

  mkdirSync(REPORTS, { recursive: true });
  backup(path, slug);

  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  renameSync(tmp, path);

  return readReport(slug);
}

/**
 * Delete a report. Its last state goes to .studio-backups/ first: reports are
 * git-ignored, so that copy is the only way back. assets/<slug>/ is left alone.
 */
export function deleteReport(slug: string): void {
  const path = reportPath(slug);
  if (!existsSync(path)) throw httpError(404, `No such report: ${slug}`);
  backup(path, slug);
  unlinkSync(path);
}

export function reportExists(slug: string): boolean {
  return existsSync(reportPath(slug));
}

/** A minimal report that passes validate() — findings must be non-empty. */
export function skeleton({
  slug,
  site,
  clientName,
  siteUrl = "",
}: {
  slug: string;
  site: string;
  clientName: string;
  siteUrl?: string;
}): Report {
  const today = new Date().toISOString().slice(0, 10);
  return {
    meta: {
      slug,
      site,
      siteUrl: siteUrl || `https://${site}/`,
      clientName,
      auditedAt: today,
      pagesAnalyzed: 0,
      score: 50,
      sourceLang: "en",
      translatedAt: {},
    },
    summary: { en: "" },
    method: { en: "" },
    findings: [
      {
        id: "placeholder",
        severity: "critical",
        impact: "high",
        effort: "low",
        title: { en: "Replace this placeholder finding" },
        body: { en: "" },
      },
    ],
    roadmap: [],
    notCovered: [],
    sections: [],
    _translationState: {},
  };
}
