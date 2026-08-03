import { basename } from "node:path";

export const SEVERITIES = ["critical", "warning", "opportunity", "pass"];
export const ANCHORS = ["summary", "breakdown", "findings", "roadmap", "notCovered"];

/**
 * Throws if the report cannot be rendered.
 *
 * Shared by the CLI and by Report Studio, which runs it before every write —
 * the two must agree on what a valid report is, so the rules live here rather
 * than in either caller.
 */
export function validate(report, path) {
  const problems = [];
  if (!report.meta) problems.push("missing `meta`");
  else {
    for (const k of ["site", "clientName", "auditedAt", "score", "pagesAnalyzed"]) {
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
    const valid = new Set(SEVERITIES);
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
        if (sec.after !== undefined && !ANCHORS.includes(sec.after)) {
          problems.push(`${label}: invalid anchor "${sec.after}" — use ${ANCHORS.join(" | ")}`);
        }
        if (sec.image && !sec.image.src) problems.push(`${label}: image is missing \`src\``);
      });
    }
  }

  if (problems.length) {
    throw new Error(
      `Invalid report ${basename(path)}:\n${problems.map((p) => `  · ${p}`).join("\n")}`
    );
  }
}
