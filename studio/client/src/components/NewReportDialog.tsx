import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { guessScope, hostOf } from "@/lib/audits";
import { cn } from "@/lib/utils";
import type { AuditJob, AuditScope, Preflight } from "@/lib/types";

export interface NewReportPrefill {
  url?: string;
  clientName?: string;
}

interface Props {
  open: boolean;
  prefill?: NewReportPrefill;
  auditRunning: boolean;
  onClose: () => void;
  onAuditStarted: (job: AuditJob) => void;
}

export function NewReportDialog({ open, prefill, auditRunning, onClose, onAuditStarted }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{prefill?.url ? `New report for ${hostOf(prefill.url)}` : "New report"}</DialogTitle>
        </DialogHeader>
        {open && (
          <AuditForm prefill={prefill} auditRunning={auditRunning} onClose={onClose} onStarted={onAuditStarted} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditForm({
  prefill,
  auditRunning,
  onClose,
  onStarted,
}: {
  prefill?: NewReportPrefill;
  auditRunning: boolean;
  onClose: () => void;
  onStarted: (job: AuditJob) => void;
}) {
  const [url, setUrl] = useState(prefill?.url ?? "");
  const [clientName, setClientName] = useState(prefill?.clientName ?? "");
  // Follows the URL until the user picks one themselves.
  const [scope, setScope] = useState<AuditScope>(() => guessScope(prefill?.url ?? ""));
  const [scopeTouched, setScopeTouched] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .preflight()
      .then(setPreflight)
      .catch((e) => setPreflight({ ok: false, checks: [{ name: "Studio", required: true, ok: false, detail: e.message }] }));
  }, []);

  const onUrl = (v: string) => {
    setUrl(v);
    if (!scopeTouched) setScope(guessScope(v));
  };

  const start = async () => {
    setBusy(true);
    try {
      onStarted(await api.startAudit({ url, scope, clientName }));
    } catch (e) {
      toast.error((e as Error).message, { duration: 10000 });
    } finally {
      setBusy(false);
    }
  };

  const failed = preflight?.checks.filter((c) => c.required && !c.ok) ?? [];
  const warned = preflight?.checks.filter((c) => c.warn) ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">URL</Label>
        <Input
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="example.com or https://example.com/courses/"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">What to audit</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["site", "Whole site", "/new-audit · crawls the site"],
              ["page", "Single page", "/new-page-audit · this URL only"],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setScope(value);
                setScopeTouched(true);
              }}
              className={cn(
                "border p-2.5 text-left transition-colors",
                scope === value ? "border-foreground bg-muted ring-1 ring-foreground" : "hover:border-foreground/40"
              )}
            >
              <div className="text-sm font-medium">{label}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Client name (optional)</Label>
        <Input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Example Ltd"
        />
      </div>

      <div className="space-y-1.5 border p-2.5 text-xs">
        {!preflight ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Checking claude-seo and Claude Code…
          </div>
        ) : failed.length ? (
          failed.map((c) => (
            <div key={c.name} className="flex gap-1.5 text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>
                <b>{c.name}</b>: {c.detail}
                {c.fix && <span className="block text-muted-foreground">{c.fix}</span>}
              </span>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-sev-pass" /> claude-seo is ready
          </div>
        )}
        {warned.map((c) => (
          <div key={c.name} className="flex gap-1.5 text-sev-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span>
              {c.name}: {c.detail}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Runs on your Claude Code login and takes 10–30 minutes. The Studio keeps the computer
        awake while it runs, but closing a laptop lid still puts it to sleep.
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={start}
          disabled={busy || !url.trim() || !preflight?.ok || auditRunning}
          title={auditRunning ? "Another audit is running" : undefined}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Start audit
        </Button>
      </DialogFooter>
    </div>
  );
}
