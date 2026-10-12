import { basename } from "node:path";
import { ANCHORS, SEVERITIES, type Anchor, type Report, type Severity } from "./types.ts";

/**
 * Throws if the report cannot be rendered.
 *
 * Shared by the CLI and by Report Studio, which runs it before every write —
 * the two must agree on what a valid report is, so the rules live here rather
 * than in either caller. The input is typed as a Report but is really parsed
 * JSON, so every check below still guards against missing fields.
 */
export function validate(report: Report, path: string): void {
  const problems: string[] = [];
  if (!report.meta) problems.push("missing `meta`");
  else {
    for (const k of ["site", "clientName", "auditedAt", "score", "pagesAnalyzed"] as const) {
      if (report.meta[k] === undefined) problems.push(`missing \`meta.${k}\``);
    }
    const { score } = report.meta;
    if (score !== undefined && (typeof score !== "number" || score < 0 || score > 100)) {
      problems.push("`meta.score` must be a number 0–100");
    }
  }
  if (!Array.isArray(report.findings) || !report.findings.length) {
    problems.push("`findings` must be a non-empty array");
  } else {
    const valid = new Set<Severity>(SEVERITIES);
    report.findings.forEach((f, i) => {
      if (!valid.has(f.severity)) {
        problems.push(`findings[${i}] (${f.id ?? "no id"}): invalid severity "${f.severity}"`);
      }
      if (!f.title) problems.push(`findings[${i}] (${f.id ?? "no id"}): missing title`);
    });
  }

  // Custom sections are optional, but a bad `after` silently drops the section
  // from the PDF rather than erroring — catch it here instead.
  if (report.sections !== undefined) {
    if (!Array.isArray(report.sections)) problems.push("`sections` must be an array");
    else {
      report.sections.forEach((sec, i) => {
        const label = `sections[${i}] (${sec.id ?? "no id"})`;
        if (!sec.title) problems.push(`${label}: missing title`);
        if (sec.after !== undefined && !ANCHORS.includes(sec.after as Anchor)) {
          problems.push(`${label}: invalid anchor "${sec.after}" — use ${ANCHORS.join(" | ")}`);
        }
        if (sec.image && !sec.image.src) problems.push(`${label}: image is missing \`src\``);
      });
    }
  }

  // Measured data is optional, but a missing number renders as "NaN" in a
  // client PDF rather than erroring — so check the shape here.
  const gsc = report.metrics?.searchConsole;
  if (gsc) {
    for (const k of ["clicks", "impressions", "ctr", "position"] as const) {
      if (typeof gsc[k] !== "number") problems.push(`\`metrics.searchConsole.${k}\` must be a number`);
    }
    if (typeof gsc.ctr === "number" && gsc.ctr > 1) {
      problems.push("`metrics.searchConsole.ctr` is a fraction (0.027), not a percentage (2.7)");
    }
    for (const k of ["start", "end"] as const) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(gsc[k] ?? "")) problems.push(`\`metrics.searchConsole.${k}\` must be an ISO date`);
    }
  }
  const cwv = report.metrics?.coreWebVitals;
  if (cwv) {
    if (!["field", "lab"].includes(cwv.source)) {
      problems.push('`metrics.coreWebVitals.source` must be "field" or "lab"');
    }
    for (const k of ["lcp", "inp", "cls", "performance"] as const) {
      if (cwv[k] != null && typeof cwv[k] !== "number") problems.push(`\`metrics.coreWebVitals.${k}\` must be a number`);
    }
    if (typeof cwv.lcp === "number" && cwv.lcp < 50) {
      problems.push("`metrics.coreWebVitals.lcp` is in milliseconds (2300), not seconds (2.3)");
    }
  }

  if (problems.length) {
    throw new Error(
      `Invalid report ${basename(path)}:\n${problems.map((p) => `  · ${p}`).join("\n")}`
    );
  }
}
