import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteReportDialog } from "@/components/DeleteReportDialog";
import { ReportPicker } from "@/components/ReportPicker";
import { scoreBand, scoreTone } from "@/lib/report";
import { cn } from "@/lib/utils";
import type { ReportSummary } from "@/lib/types";

interface Props {
  reports: ReportSummary[];
  loading: boolean;
  onPick: (slug: string) => void;
  onNew: () => void;
  /** Resolves once the report is gone; rejects to keep the dialog open. */
  onDelete: (slug: string) => Promise<void>;
}

type Sort = "recent" | "score" | "site";

const SORT_LABEL: Record<Sort, string> = {
  recent: "Recent",
  score: "Lowest score",
  site: "A–Z",
};

function formatDate(iso: string | null) {
  if (!iso) return "No date";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function ScoreRing({ score }: { score: number | null }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 48 48" className="size-full -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        {score !== null && (
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            strokeWidth="4"
            stroke={scoreTone(value)}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
        {score ?? "—"}
      </span>
    </div>
  );
}

function ReportCard({
  report,
  onPick,
  onDelete,
}: {
  report: ReportSummary;
  onPick: (slug: string) => void;
  onDelete: (slug: string) => void;
}) {
  // Two sibling buttons, not one inside the other, which HTML forbids.
  return (
    <div className="group relative">
      <button
        type="button"
        disabled={report.broken}
        onClick={() => onPick(report.slug)}
        className={cn(
          "flex size-full flex-col gap-3 border bg-card p-4 text-left transition-all",
          "group-hover:-translate-y-0.5 group-hover:border-foreground/30 group-hover:shadow-md",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:group-hover:translate-y-0 disabled:group-hover:shadow-none"
        )}
      >
        <div className="flex items-start gap-3">
          <ScoreRing score={report.score} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold tracking-tight">{report.site}</span>
              {report.scope === "page" && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  Page
                </Badge>
              )}
              {report.siteLanguages && (
                <Badge variant="outline" className="h-4 px-1 font-mono text-[10px] uppercase">
                  {report.siteLanguages.join(" · ")}
                </Badge>
              )}
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {report.clientName || "—"}
            </div>
            {report.score !== null && (
              <div className="mt-0.5 text-xs text-muted-foreground">{scoreBand(report.score)}</div>
            )}
          </div>
          {/* Room for the delete button, which sits over this corner. */}
          <span className="size-7 shrink-0" />
        </div>

        {report.broken ? (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" /> Could not parse reports/{report.slug}.json
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground">
            <span>{formatDate(report.auditedAt)}</span>
            <span>
              {report.findings} finding{report.findings === 1 ? "" : "s"}
            </span>
            <span className="ml-auto flex gap-1">
              {report.langs.map((l) => (
                <Badge key={l} variant="secondary" className="h-4 px-1 font-mono text-[10px] uppercase">
                  {l}
                </Badge>
              ))}
            </span>
          </div>
        )}
      </button>
      {/* Broken reports stay deletable: often that is all one can do with them. */}
      <Button
        variant="ghost"
        size="icon"
        title={`Delete ${report.slug}`}
        aria-label={`Delete ${report.slug}`}
        onClick={() => onDelete(report.slug)}
        className={cn(
          "absolute top-3 right-3 size-7 text-muted-foreground transition-all",
          "hover:bg-destructive/10 hover:text-destructive",
          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          !report.broken && "group-hover:-translate-y-0.5"
        )}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function Home({ reports, loading, onPick, onNew, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("recent");
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search, the way most list views do.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q
      ? reports.filter((r) =>
          [r.site, r.clientName, r.slug].some((s) => s.toLowerCase().includes(q))
        )
      : reports;
    const sorted = [...hits];
    if (sort === "score") sorted.sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
    if (sort === "site") sorted.sort((a, b) => a.site.localeCompare(b.site));
    return sorted; // "recent" is the server's order
  }, [reports, query, sort]);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-20 pb-16">
        <FileText className="mb-4 size-8 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="text-2xl font-semibold tracking-tight">SEO Audit Studio</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          Open an audit to edit, translate and render it, or start a new one.
        </p>

        <div className="mt-8 flex w-full max-w-lg flex-col gap-2 sm:flex-row">
          <ReportPicker reports={reports} slug={null} onPick={onPick} className="w-full flex-1 data-[size=default]:h-10" />
          <Button className="h-10" onClick={onNew}>
            <Plus className="size-4" /> New report
          </Button>
        </div>

        {reports.length > 0 && (
          <div className="mt-16 w-full">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold tracking-tight">
                All reports{" "}
                <span className="font-normal text-muted-foreground">({reports.length})</span>
              </h2>
              <div className="ml-auto flex items-center gap-1">
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={sort === s ? "secondary" : "ghost"}
                    className="h-7 text-xs"
                    onClick={() => setSort(s)}
                  >
                    {SORT_LABEL[s]}
                  </Button>
                ))}
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                  placeholder="Filter reports"
                  className="h-8 pr-7 pl-8 text-sm"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 border px-1 font-mono text-[10px] text-muted-foreground">
                  /
                </kbd>
              </div>
            </div>

            {shown.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((r) => (
                  <ReportCard key={r.slug} report={r} onPick={onPick} onDelete={setDeleting} />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No report matches “{query}”.
              </p>
            )}
          </div>
        )}

        {!loading && reports.length === 0 && (
          <button
            type="button"
            onClick={onNew}
            className="mt-16 flex w-full max-w-lg flex-col items-center gap-2 border border-dashed p-10 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="size-5" />
            No reports yet. Create one here, or run <code className="font-mono">/new-audit &lt;url&gt;</code>.
          </button>
        )}
      </div>

      <DeleteReportDialog slug={deleting} onClose={() => setDeleting(null)} onDelete={onDelete} />
    </div>
  );
}
