import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { AUDIT_MODELS, EFFORTS, type AuditJob, type AuditRequest, type AuditScope, type ExistingReport, type Preflight, type SiteLanguages } from "@/lib/types";

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
  const [run, setRun] = useState<RunChoice>(loadRunChoice);
  useEffect(() => saveRunChoice(run), [run]);
  const langs = useSiteLanguages(scope === "site" ? url : "");
  // Version ids (first hreflang code) left out of the audit. Empty: all of them.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  useEffect(() => setSkipped(new Set()), [langs.site]);
  const versions = langs.site?.unsupported ? [] : (langs.site?.versions ?? []);
  const choosable = versions.length > 1;
  const chosen = versions.map((v) => v.langs[0]).filter((id) => !skipped.has(id));
  const languages = scope === "site" && choosable && skipped.size ? chosen : undefined;
  const existing = useExistingReport(url, scope, languages);
  const details = [existing?.clientName, existing?.auditedAt && `audited ${existing.auditedAt}`].filter(Boolean);

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
      onStarted(await api.startAudit({ url, scope, clientName, languages, ...runRequest(run) }));
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

      {scope === "site" && url.trim() && (
        <LanguagePicker
          state={langs}
          skipped={skipped}
          onToggle={(id) =>
            setSkipped((s) => {
              const next = new Set(s);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
      )}

      <RunPicker value={run} onChange={setRun} />

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

      {existing && (
        <div className="flex gap-1.5 border border-sev-warning/50 p-2.5 text-xs text-sev-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            {scope === "page" ? "This page" : languages ? "These language versions" : "This site"} already has a
            report: <span className="font-mono">reports/{existing.slug}.json</span>
            {details.length > 0 && ` (${details.join(", ")})`}. The new audit replaces it, edits and
            translations included. A copy is kept in{" "}
            <span className="font-mono">.studio-backups/{existing.slug}/</span>.
          </span>
        </div>
      )}

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
          disabled={
            busy ||
            !url.trim() ||
            !preflight?.ok ||
            auditRunning ||
            (scope === "site" && (langs.loading || (choosable && !chosen.length)))
          }
          title={auditRunning ? "Another audit is running" : undefined}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Start audit
        </Button>
      </DialogFooter>
    </div>
  );
}

interface LanguagesState {
  site: SiteLanguages | null;
  loading: boolean;
  error: string | null;
}

/** The site's language versions, read once the URL has stopped changing. */
function useSiteLanguages(url: string): LanguagesState {
  const [state, setState] = useState<LanguagesState>({ site: null, loading: false, error: null });
  useEffect(() => {
    const host = hostOf(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    if (!url.trim() || !host.includes(".")) {
      setState({ site: null, loading: false, error: null });
      return;
    }
    let live = true;
    setState({ site: null, loading: true, error: null });
    const t = setTimeout(() => {
      api
        .siteLanguages(url.trim())
        .then((site) => live && setState({ site, loading: false, error: null }))
        .catch((e) => live && setState({ site: null, loading: false, error: (e as Error).message }));
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [url]);
  return state;
}

/** The report this audit would overwrite, checked once the inputs have stopped changing. */
function useExistingReport(url: string, scope: AuditScope, languages?: string[]): ExistingReport | null {
  const [report, setReport] = useState<ExistingReport | null>(null);
  const langKey = languages?.join(",") ?? "";
  useEffect(() => {
    setReport(null);
    if (!url.trim()) return;
    let live = true;
    const t = setTimeout(() => {
      api
        .existingReport(url.trim(), scope, langKey ? langKey.split(",") : undefined)
        .then((r) => live && setReport(r.report))
        .catch(() => live && setReport(null)); // a half-typed URL: nothing to warn about yet
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [url, scope, langKey]);
  return report;
}

const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

function LanguagePicker({
  state,
  skipped,
  onToggle,
}: {
  state: LanguagesState;
  skipped: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { site, loading, error } = state;
  const note = (text: ReactNode) => <p className="text-xs text-muted-foreground">{text}</p>;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Language versions</Label>
      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Reading hreflang…
        </div>
      ) : error ? (
        note(<>Could not read the language versions ({error}). The audit will cover the whole site.</>)
      ) : !site ? null : site.unsupported ? (
        note(<>{site.unsupported} The audit will cover all of them.</>)
      ) : site.versions.length <= 1 ? (
        note(
          site.versions.length
            ? `One language version (${languageName(site.versions[0].langs[0])}), so nothing to choose.`
            : "No language declared, so the audit covers the whole site."
        )
      ) : (
        <>
          <div className="max-h-48 divide-y overflow-auto border">
            {site.versions.map((v) => {
              const id = v.langs[0];
              return (
                <label key={v.root} className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-foreground"
                    checked={!skipped.has(id)}
                    onChange={() => onToggle(id)}
                  />
                  <span className="w-40 shrink-0 truncate text-sm" title={v.langs.join(", ")}>
                    {languageName(id)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={v.root}>
                    {v.root.replace(/^https?:\/\//, "")}
                  </span>
                  {v.isRoot && (
                    <span
                      className="shrink-0 text-[10px] text-muted-foreground"
                      title={v.inferred ? "Not in hreflang; read from the homepage's <html lang>" : undefined}
                    >
                      root{v.inferred ? " · html lang" : ""}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {note(
            <>
              Root language: {site.rootLang ? languageName(site.rootLang) : "unknown"}. Unticked versions are
              left out and listed in the report as not covered.
            </>
          )}
        </>
      )}
    </div>
  );
}

/** "default" stands for the user's own Claude Code setting; it is never sent. */
interface RunChoice {
  model: string;
  effort: string;
  subagents: "plugin" | "sonnet";
}

const RUN_KEY = "studio.auditRun";
const RUN_DEFAULT: RunChoice = { model: "default", effort: "default", subagents: "plugin" };

/** The last choice, per browser: a convenience, so the dialog works without it. */
function loadRunChoice(): RunChoice {
  try {
    return { ...RUN_DEFAULT, ...JSON.parse(localStorage.getItem(RUN_KEY) ?? "{}") };
  } catch {
    return RUN_DEFAULT;
  }
}

function saveRunChoice(run: RunChoice) {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* private window: the choice just is not remembered */
  }
}

function runRequest(run: RunChoice): Pick<AuditRequest, "model" | "effort" | "subagents"> {
  return {
    ...((AUDIT_MODELS as readonly string[]).includes(run.model) ? { model: run.model as AuditRequest["model"] } : {}),
    ...((EFFORTS as readonly string[]).includes(run.effort) ? { effort: run.effort as AuditRequest["effort"] } : {}),
    ...(run.subagents === "sonnet" ? { subagents: "sonnet" as const } : {}),
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function RunPicker({ value, onChange }: { value: RunChoice; onChange: (next: RunChoice) => void }) {
  const pickers = [
    {
      key: "model",
      label: "Model",
      options: [["default", "Your setting"], ...AUDIT_MODELS.map((m) => [m, cap(m)])],
    },
    {
      key: "effort",
      label: "Effort",
      options: [["default", "Your setting"], ...EFFORTS.map((e) => [e, cap(e)])],
    },
    {
      key: "subagents",
      label: "Subagents",
      options: [
        ["plugin", "As claude-seo sets"],
        ["sonnet", "All on Sonnet"],
      ],
    },
  ] as const;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        {pickers.map((p) => (
          <div key={p.key} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{p.label}</Label>
            <Select
              value={value[p.key]}
              onValueChange={(v) => onChange({ ...value, [p.key]: v })}
              items={p.options.map(([v, label]) => ({ value: v, label }))}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {p.options.map(([v, label]) => (
                  <SelectItem key={v} value={v} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        &ldquo;Your setting&rdquo; is your Claude Code default. Most of an audit&rsquo;s usage is the subagents;
        claude-seo runs three of them on Opus. All on Sonnet costs less, but those three judge content quality,
        search intent and AI-search visibility, so compare one report before switching for good.
      </p>
    </div>
  );
}
