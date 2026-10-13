import { CheckCircle2, Loader2, Plus, Settings, XCircle } from "lucide-react";
import { useTick } from "@/components/AuditDialog";
import { elapsed, hostOf } from "@/lib/audits";
import { Button } from "@/components/ui/button";
import { ReportPicker } from "@/components/ReportPicker";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";
import type { AuditJob, Doc, ReportSummary } from "@/lib/types";

interface Props {
  reports: ReportSummary[];
  slug: string | null;
  doc: Doc | null;
  onPick: (slug: string) => void;
  onHome: () => void;
  /** A report for any site. */
  onNew: () => void;
  onSettings: () => void;
  /** The running audit, or the last one until its result has been looked at. */
  audit: AuditJob | null;
  onAudit: () => void;
}

function AuditPill({ job, onClick }: { job: AuditJob; onClick: () => void }) {
  const running = job.status === "running";
  useTick(running);
  return (
    <Button size="sm" variant="outline" onClick={onClick} className="h-7 gap-1.5 text-xs" title="Show audit progress">
      {running ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : job.status === "done" ? (
        <CheckCircle2 className="size-3.5 text-sev-pass" />
      ) : (
        <XCircle className="size-3.5 text-sev-critical" />
      )}
      {running ? "Auditing" : job.status === "done" ? "Audited" : "Audit stopped"} {hostOf(job.url)}
      <span className="font-mono text-muted-foreground tabular-nums">{elapsed(job)}</span>
    </Button>
  );
}

export function Topbar({
  reports,
  slug,
  doc,
  onPick,
  onHome,
  onNew,
  onSettings,
  audit,
  onAudit,
}: Props) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
      <button
        type="button"
        onClick={onHome}
        className="text-sm font-semibold tracking-tight transition-opacity hover:opacity-70"
        title="All reports"
      >
        SEO Audit Studio
      </button>

      {doc && (
        <>
          <Separator orientation="vertical" className="h-5" />

          <ReportPicker reports={reports} slug={slug} onPick={onPick} />
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {audit && <AuditPill job={audit} onClick={onAudit} />}

        <Button size="sm" variant="ghost" onClick={onNew}>
          <Plus className="size-3.5" /> New report
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onSettings}
          title="Translation settings"
        >
          <Settings className="size-4" />
          <span className="sr-only">Translation settings</span>
        </Button>

        <ModeToggle />
      </div>
    </header>
  );
}
