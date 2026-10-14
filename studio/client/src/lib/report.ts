import type { Finding, I18n, Lang, Report, Section, Severity } from "./types";

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warnings",
  opportunity: "Opportunities",
  pass: "Passing",
};

export const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "text-sev-critical",
  warning: "text-sev-warning",
  opportunity: "text-sev-opportunity",
  pass: "text-sev-pass",
};

export const LANG_LABEL: Record<Lang, string> = {
  en: "English",
  et: "Eesti",
  ru: "Русский",
};

export const scoreBand = (score: number) =>
  score >= 90 ? "Excellent foundation"
  : score >= 70 ? "Good, room to improve"
  : score >= 50 ? "Needs significant work"
  : "Critical issues";

/** Same bands as the PDF's bandTone(): 70+ is good news, so it reads green, not blue. */
export const scoreTone = (score: number) =>
  score >= 70 ? "var(--sev-pass)"
  : score >= 50 ? "var(--sev-warning)"
  : "var(--sev-critical)";

export const isI18n = (v: unknown): v is I18n =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item"
  );
}

export function uniqueId(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export const bySeverity = (findings: Finding[], sev: Severity) =>
  findings.filter((f) => f.severity === sev);

export const counts = (findings: Finding[]) =>
  Object.fromEntries(
    (["critical", "warning", "opportunity", "pass"] as Severity[]).map((s) => [
      s,
      bySeverity(findings, s).length,
    ])
  ) as Record<Severity, number>;

/**
 * Move a finding, possibly into a different severity group.
 *
 * The renderer filters the flat array by severity and keeps array order inside
 * each group, so relative order within the target group is all that matters —
 * we do not need to keep the array itself grouped.
 */
export function relocate(
  findings: Finding[],
  activeId: string,
  targetSeverity: Severity,
  overId: string | null
): Finding[] {
  const next = findings.slice();
  const from = next.findIndex((f) => f.id === activeId);
  if (from < 0) return findings;

  const [moved] = next.splice(from, 1);
  const updated: Finding = { ...moved, severity: targetSeverity };

  let insertAt: number;
  if (overId && overId !== activeId) {
    const oi = next.findIndex((f) => f.id === overId);
    insertAt = oi < 0 ? next.length : oi;
  } else {
    // Dropped on the column rather than on a card — append to that group.
    let last = -1;
    next.forEach((f, i) => {
      if (f.severity === targetSeverity) last = i;
    });
    insertAt = last + 1;
  }

  next.splice(insertAt, 0, updated);
  return next;
}

export function blankFinding(taken: Iterable<string>, severity: Severity): Finding {
  return {
    id: uniqueId("new-finding", taken),
    severity,
    impact: severity === "pass" ? undefined : "medium",
    effort: severity === "pass" ? undefined : "medium",
    title: { en: "" },
    body: severity === "pass" ? undefined : { en: "" },
  };
}

export function blankSection(taken: Iterable<string>): Section {
  return {
    id: uniqueId("new-section", taken),
    after: "summary",
    breakBefore: false,
    title: { en: "" },
    body: { en: "" },
  };
}

/** Field paths must match studio/lib/state.ts exactly or badges point at nothing. */
export const paths = {
  summary: () => "summary",
  method: () => "method",
  closingNote: () => "closingNote",
  item: (coll: string, id: string, field: string) => `${coll}.${id}.${field}`,
  image: (id: string, field: string) => `sections.${id}.image.${field}`,
};

/** Structured-clone update helper — keeps React state changes explicit. */
export function edit<T>(value: T, mutate: (draft: T) => void): T {
  const draft = structuredClone(value);
  mutate(draft);
  return draft;
}

export const sectionsAt = (report: Report, anchor: string) =>
  (report.sections ?? []).filter((s) => (s.after ?? "summary") === anchor);
