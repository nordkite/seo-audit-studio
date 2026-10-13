import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Coffee, Loader2, RotateCcw, Square, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { elapsed } from "@/lib/audits";
import { cn } from "@/lib/utils";
import type { AuditJob } from "@/lib/types";

interface Props {
  job: AuditJob | null;
  open: boolean;
  onClose: () => void;
  onCancel: (job: AuditJob) => void;
  onRetry: (job: AuditJob) => void;
  onOpenReport: (slug: string) => void;
}

const STATUS = {
  running: { label: "Running", className: "bg-sev-opportunity/15 text-sev-opportunity" },
  done: { label: "Done", className: "bg-sev-pass/15 text-sev-pass" },
  failed: { label: "Failed", className: "bg-sev-critical/15 text-sev-critical" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
} as const;

/** Re-render once a second while `on`, for the elapsed clock. */
export function useTick(on: boolean) {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
}

export function AuditDialog({ job, open, onClose, onCancel, onRetry, onOpenReport }: Props) {
  const running = job?.status === "running";
  useTick(open && running);

  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const stepCount = job?.steps.length ?? 0;

  // Follow new steps, unless the user scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [stepCount, open]);

  if (!job) return null;
  const status = STATUS[job.status];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {running && <Loader2 className="size-4 animate-spin" />}
            {job.status === "done" && <CheckCircle2 className="size-4 text-sev-pass" />}
            {job.status === "failed" && <XCircle className="size-4 text-sev-critical" />}
            <span className="truncate">{job.scope === "page" ? "Page audit" : "Site audit"}</span>
            <Badge className={cn("ml-1", status.className)}>{status.label}</Badge>
            <span className="ml-auto pr-6 font-mono text-xs font-normal text-muted-foreground tabular-nums">
              {elapsed(job)}
            </span>
          </DialogTitle>
          <p className="truncate font-mono text-xs text-muted-foreground">{job.url}</p>
        </DialogHeader>

        {running && job.keepAwake && (
          <div
            className={cn(
              "flex items-start gap-2 border p-2.5 text-xs",
              job.keepAwake.ok ? "text-muted-foreground" : "border-sev-warning/50 text-sev-warning"
            )}
          >
            {job.keepAwake.ok ? (
              <>
                <Coffee className="mt-px size-3.5 shrink-0" />
                Keeping the computer awake ({job.keepAwake.method}). Keep the lid open until it
                finishes.
              </>
            ) : (
              <>
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                Sleep can't be blocked on this system ({job.keepAwake.detail ?? job.keepAwake.method}).
                Keep the computer awake until the audit finishes.
              </>
            )}
          </div>
        )}

        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="h-72 overflow-auto border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed"
        >
          {job.steps.map((s, i) => (
            <div key={i} className={cn("flex gap-2", s.nested && "pl-4 text-muted-foreground")}>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {new Date(s.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="break-all">{s.text}</span>
            </div>
          ))}
          {running && <div className="mt-1 animate-pulse text-muted-foreground">…</div>}
        </div>

        {job.message && job.status !== "running" && (
          <div
            className={cn(
              "max-h-40 overflow-auto border p-2.5 text-xs whitespace-pre-wrap",
              job.status === "failed" && "border-sev-critical/40"
            )}
          >
            {job.message}
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          <span>
            Log: <span className="font-mono">{job.log}</span>
          </span>
          {job.costUsd != null && <span>≈ ${job.costUsd.toFixed(2)} at API prices</span>}
        </div>

        <DialogFooter>
          {running ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Run in background
              </Button>
              <Button variant="destructive" onClick={() => onCancel(job)}>
                <Square className="size-3.5" /> Cancel audit
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {job.status !== "done" && (
                <Button variant="outline" onClick={() => onRetry(job)}>
                  <RotateCcw className="size-3.5" /> Retry
                </Button>
              )}
              {job.slug && (
                <Button onClick={() => onOpenReport(job.slug!)}>Open report</Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
