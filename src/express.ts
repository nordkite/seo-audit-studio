/**
 * The express edition: a short excerpt of a full audit, rendered from the same
 * report with `--express`. The cover keeps the full counts, so the reader sees
 * how much was found; the body shows only the few findings below.
 *
 * No Node imports: the Studio client uses this to mark which findings the
 * excerpt will show.
 */
import { SEVERITIES, type Finding, type Report } from "./types.ts";

/** How many findings an express report shows when none are picked by hand. */
export const EXPRESS_COUNT = 5;

const RANK = { high: 0, medium: 1, low: 2 } as const;
const rank = (v?: string) => RANK[v as keyof typeof RANK] ?? 3;

/**
 * The findings an express report shows, in order: those picked in
 * `report.express.findings`, or else the top EXPRESS_COUNT by severity, then
 * impact, then lowest effort. Passes are never shown; there is nothing to fix.
 */
export function expressFindings(report: Report): Finding[] {
  const open = report.findings.filter((f) => f.severity !== "pass");
  const picked = report.express?.findings;
  if (picked?.length) {
    return picked.map((id) => open.find((f) => f.id === id)).filter((f): f is Finding => Boolean(f));
  }
  return [...open]
    .sort(
      (a, b) =>
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
        rank(a.impact) - rank(b.impact) ||
        rank(b.effort) - rank(a.effort)
    )
    .slice(0, EXPRESS_COUNT);
}
