import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Topbar } from "@/components/Topbar";
import { ReportToolbar } from "@/components/ReportToolbar";
import { Home } from "@/components/Home";
import { NewReportDialog, type NewReportPrefill } from "@/components/NewReportDialog";
import { AuditDialog } from "@/components/AuditDialog";
import { MetaPanel } from "@/components/MetaPanel";
import { CwvPanel } from "@/components/CwvPanel";
import { FindingsBoard } from "@/components/FindingsBoard";
import { ListPanel } from "@/components/ListPanel";
import { SectionsPanel } from "@/components/SectionsPanel";
import { PreviewPane } from "@/components/PreviewPane";
import { LangSelect } from "@/components/LangSelect";
import { TranslateDialog } from "@/components/TranslateDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { I18nField } from "@/components/I18nField";
import { api } from "@/lib/api";
import { LANG_LABEL, counts, edit, paths } from "@/lib/report";
import { hostOf, useAudits } from "@/lib/audits";
import { useTranslateSettings } from "@/lib/settings";
import { EXPRESS_COUNT, expressFindings } from "@/lib/types";
import type { AuditJob, Doc, Edition, FieldStatus, Health, Lang, Report, ReportSummary } from "@/lib/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function App() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [listing, setListing] = useState(true);
  const [slug, setSlug] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState<Lang | null>(null);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<NewReportPrefill | undefined>();
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  // The finished audit whose result has been seen, so its pill can go away.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, updateSettings] = useTranslateSettings();

  // Paths whose source text changed since the last save. The server owns the
  // real hashes, but waiting for a round trip to flag drift makes the warning
  // arrive too late to be useful.
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const report = doc?.report ?? null;
  const source = (report?.meta.sourceLang ?? "en") as Lang;

  useEffect(() => {
    api
      .list()
      .then((r) => setReports(r.reports))
      .catch((e) => toast.error(e.message))
      .finally(() => setListing(false));
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const load = useCallback(async (next: string) => {
    setBusy(true);
    try {
      const d = await api.get(next);
      setDoc(d);
      setSlug(next);
      setDirty(false);
      setTouched(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshList = useCallback(
    () => api.list().then((r) => setReports(r.reports)).catch(() => {}),
    []
  );

  const goHome = useCallback(() => {
    if (!doc) return;
    if (dirty && !window.confirm("Discard unsaved changes and go back to all reports?")) return;
    setDoc(null);
    setSlug(null);
    setDirty(false);
    setTouched(new Set());
    // Scores and translations may have changed while the report was open.
    refreshList();
  }, [doc, dirty, refreshList]);

  const audits = useAudits((job) => {
    refreshList();
    const host = hostOf(job.url);
    if (job.status === "done") toast.success(`Audit of ${host} finished`, { description: `reports/${job.slug}.json` });
    else if (job.status === "failed") toast.error(`Audit of ${host} failed`);
  });

  const shownAudit = audits.jobs.find((j) => j.id === auditId) ?? audits.latest;
  const pillAudit =
    audits.active ?? (audits.latest && audits.latest.id !== dismissed ? audits.latest : null);

  const showAudit = useCallback((job: AuditJob) => {
    setAuditId(job.id);
    setAuditOpen(true);
  }, []);

  const closeAudit = useCallback(() => {
    setAuditOpen(false);
    if (shownAudit && shownAudit.status !== "running") setDismissed(shownAudit.id);
  }, [shownAudit]);

  const openNew = useCallback(() => {
    setPrefill(undefined);
    setCreating(true);
  }, []);

  /** Another audit of the open report's site, usually a single page of it. */
  const openNewForSite = useCallback(() => {
    const meta = doc?.report.meta;
    if (!meta) return;
    setPrefill({ url: meta.siteUrl ?? `https://${meta.site}/`, clientName: meta.clientName });
    setCreating(true);
  }, [doc]);

  /** Called from a delete confirm dialog; throws to keep the dialog open. */
  const remove = useCallback(
    async (target: string) => {
      try {
        await api.remove(target);
      } catch (e) {
        toast.error((e as Error).message);
        throw e;
      }
      toast.success(`Deleted ${target}`, { description: `A copy is in .studio-backups/${target}/` });
      if (target === slug) {
        setDoc(null);
        setSlug(null);
        setDirty(false);
        setTouched(new Set());
      }
      refreshList();
    },
    [slug, refreshList]
  );

  const update = useCallback(
    (mutate: (draft: Report) => void, touchedPath?: string) => {
      setDoc((d) => (d ? { ...d, report: edit(d.report, mutate) } : d));
      setDirty(true);
      if (touchedPath) setTouched((prev) => new Set(prev).add(touchedPath));
    },
    []
  );

  /** Server status, overridden by anything edited since the last save. */
  const statusOf = useCallback(
    (path: string): FieldStatus | undefined => {
      if (!doc) return undefined;
      const server = doc.status[path]?.[lang];
      if (lang === source) return "source";
      if (touched.has(path) && server !== "missing") return "stale";
      return server;
    },
    [doc, lang, source, touched]
  );

  const save = useCallback(async () => {
    if (!doc || !slug) return;
    setBusy(true);
    try {
      const fresh = await api.save(slug, doc.report, doc.mtime);
      setDoc(fresh);
      setDirty(false);
      setTouched(new Set());
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message, { duration: 8000 });
    } finally {
      setBusy(false);
    }
  }, [doc, slug]);

  const translate = useCallback(
    async (target: Lang) => {
      if (!doc || !slug) return;

      if (settings.provider === "api" && !settings.apiKey && !health?.hasEnvKey) {
        toast.error("Add your Anthropic API key in Translation settings first.");
        setSettingsOpen(true);
        return;
      }

      // Translation reads the file from disk — unsaved edits would be
      // translated in their previous form.
      if (dirty) {
        try {
          const fresh = await api.save(slug, doc.report, doc.mtime);
          setDoc(fresh);
          setDirty(false);
          setTouched(new Set());
        } catch (e) {
          toast.error(`Save before translating failed: ${(e as Error).message}`);
          return;
        }
      }
      setTranslating(target);
    },
    [doc, slug, dirty, settings.provider, settings.apiKey, health?.hasEnvKey]
  );

  const render = useCallback(async (edition: Edition = "full") => {
    if (!doc || !slug) return;
    if (dirty) {
      toast.error("Save before rendering — the PDF is generated from the file on disk.");
      return;
    }
    setBusy(true);
    const t = toast.loading(`Rendering ${edition === "express" ? "express " : ""}${LANG_LABEL[lang]} PDF…`);
    try {
      // The language on screen, not --all: --all only picks up languages whose
      // summary is translated, so a half-translated tab would silently render
      // as English.
      const out = await api.render(slug, [lang], edition);
      if (out.code === 0) {
        // stderr carries the "falling back to English for missing strings" warning.
        const description = [out.stdout.trim(), out.stderr.trim()].filter(Boolean).join("\n");
        toast.success("Rendered to out/", { id: t, description, duration: out.stderr.trim() ? 12000 : undefined });
      } else {
        toast.error("Render failed", { id: t, description: out.stderr || out.stdout, duration: 12000 });
      }
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBusy(false);
    }
  }, [doc, slug, dirty, lang]);

  const findingCounts = useMemo(() => counts(report?.findings ?? []), [report?.findings]);
  const expressIds = useMemo(() => (report ? expressFindings(report).map((f) => f.id) : []), [report]);

  /**
   * Adds a finding to the express report or takes it out. The first toggle
   * starts from the automatic pick, so ticking one more keeps the other five.
   * Taking out the last one goes back to the automatic pick.
   */
  const toggleExpress = (id: string) =>
    update((d) => {
      const current = expressFindings(d).map((f) => f.id);
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      if (next.length) d.express = { findings: next };
      else delete d.express;
    });

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar
        reports={reports}
        slug={slug}
        doc={doc}
        onPick={load}
        onHome={goHome}
        onNew={openNew}
        onSettings={() => setSettingsOpen(true)}
        audit={pillAudit}
        onAudit={() => pillAudit && showAudit(pillAudit)}
      />

      {!doc ? (
        <Home
          reports={reports}
          loading={listing || busy}
          onPick={load}
          onNew={openNew}
          onDelete={remove}
        />
      ) : (
        <div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="flex min-h-0 flex-col">
            <ReportToolbar
              slug={slug!}
              site={report!.meta.site}
              lang={lang}
              sourceLang={source}
              langPicker={doc && <LangSelect doc={doc} lang={lang} onLang={setLang} />}
              dirty={dirty}
              busy={busy || translating !== null}
              onSave={save}
              onTranslate={translate}
              onNewForSite={openNewForSite}
              onDelete={() => remove(slug!)}
            />
            <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
              <MetaPanel
                meta={report!.meta}
                counts={findingCounts}
                disabled={translating !== null}
                onChange={(meta) => update((d) => void (d.meta = meta))}
              />

              <Section title="Executive summary & method">
                <div className="space-y-4">
                  <I18nField
                    label="Executive summary"
                    multiline
                    rows={5}
                    value={report!.summary}
                    onChange={(v) => update((d) => void (d.summary = v), paths.summary())}
                    lang={lang}
                    sourceLang={source}
                    status={statusOf(paths.summary())}
                    disabled={translating !== null}
                  />
                  <I18nField
                    label="Method"
                    multiline
                    rows={4}
                    value={report!.method}
                    onChange={(v) => update((d) => void (d.method = v), paths.method())}
                    lang={lang}
                    sourceLang={source}
                    status={statusOf(paths.method())}
                    disabled={translating !== null}
                  />
                  <div className="space-y-1.5">
                    <I18nField
                      label="Closing note"
                      value={report!.closingNote}
                      onChange={(v) =>
                        update((d) => void (d.closingNote = v), paths.closingNote())
                      }
                      lang={lang}
                      sourceLang={source}
                      status={
                        report!.closingNote && !report!.hideClosingNote
                          ? statusOf(paths.closingNote())
                          : undefined
                      }
                      placeholder="Empty: “Confidential — prepared for the named client only.”"
                      disabled={translating !== null || report!.hideClosingNote}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!report!.hideClosingNote}
                        disabled={translating !== null}
                        onChange={(e) =>
                          update((d) => {
                            if (e.target.checked) delete d.hideClosingNote;
                            else d.hideClosingNote = true;
                          })
                        }
                      />
                      Show closing note at the end of the report
                    </label>
                  </div>
                  <I18nField
                    label="Express audit note"
                    multiline
                    rows={2}
                    value={report!.expressNote}
                    onChange={(v) => update((d) => void (d.expressNote = v), paths.expressNote())}
                    lang={lang}
                    sourceLang={source}
                    status={report!.expressNote ? statusOf(paths.expressNote()) : undefined}
                    placeholder="Empty: “This express report shows {shown} of the {total} issues the audit found. The full audit covers every issue…” {shown} and {total} become the counts."
                    disabled={translating !== null}
                  />
                </div>
              </Section>

              <Section title="Core Web Vitals & Lighthouse">
                <CwvPanel
                  cwv={report!.metrics?.coreWebVitals}
                  disabled={translating !== null}
                  onChange={(cwv) =>
                    update((d) => {
                      if (cwv) d.metrics = { ...d.metrics, coreWebVitals: cwv };
                      else if (d.metrics) {
                        delete d.metrics.coreWebVitals;
                        if (!Object.keys(d.metrics).length) delete d.metrics;
                      }
                    })
                  }
                />
              </Section>

              <Section title="Findings">
                <p className="mb-3 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <Zap className="size-3 fill-current text-sev-warning" />
                  {report!.express?.findings?.length ? (
                    <>
                      The express report shows the {expressIds.length} picked by hand.
                      <button
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={() => update((d) => void delete d.express)}
                      >
                        Back to the automatic top {EXPRESS_COUNT}
                      </button>
                    </>
                  ) : (
                    <>
                      The express report shows the top {EXPRESS_COUNT} by severity and impact. Click ⚡ on a
                      finding to pick your own.
                    </>
                  )}
                </p>
                <FindingsBoard
                  findings={report!.findings}
                  lang={lang}
                  sourceLang={source}
                  statusOf={statusOf}
                  disabled={translating !== null}
                  onChange={(findings) =>
                    update((d) => {
                      d.findings = findings;
                      // A deleted finding, or one dragged to Passing, cannot stay in the express pick.
                      const open = new Set(findings.filter((f) => f.severity !== "pass").map((f) => f.id));
                      const kept = d.express?.findings?.filter((id) => open.has(id));
                      if (kept?.length) d.express = { findings: kept };
                      else delete d.express;
                    })
                  }
                  onMoved={(m) => toast.info(m)}
                  express={expressIds}
                  onToggleExpress={toggleExpress}
                />
              </Section>

              <Section title="Custom sections">
                <SectionsPanel
                  slug={slug!}
                  sections={report!.sections ?? []}
                  lang={lang}
                  sourceLang={source}
                  statusOf={statusOf}
                  disabled={translating !== null}
                  onError={(m) => toast.error(m)}
                  onChange={(sections) => update((d) => void (d.sections = sections))}
                />
              </Section>

              <Section title="Recommended order of work">
                <ListPanel
                  collection="roadmap"
                  numbered
                  items={report!.roadmap ?? []}
                  lang={lang}
                  sourceLang={source}
                  statusOf={statusOf}
                  disabled={translating !== null}
                  onChange={(roadmap) => update((d) => void (d.roadmap = roadmap))}
                />
              </Section>

              <Section title="Not covered by this audit">
                <ListPanel
                  collection="notCovered"
                  items={report!.notCovered ?? []}
                  lang={lang}
                  sourceLang={source}
                  statusOf={statusOf}
                  disabled={translating !== null}
                  onChange={(notCovered) => update((d) => void (d.notCovered = notCovered))}
                />
              </Section>
            </div>
          </div>

          <div className="hidden min-h-0 border-l xl:block">
            <PreviewPane report={report!} lang={lang} busy={busy || translating !== null} onRender={render} />
          </div>
        </div>
      )}

      <TranslateDialog
        slug={slug ?? ""}
        lang={translating}
        settings={settings}
        onClose={() => setTranslating(null)}
        onDone={(fresh) => {
          setDoc(fresh);
          setDirty(false);
          setTouched(new Set());
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        health={health}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />

      <NewReportDialog
        open={creating}
        prefill={prefill}
        auditRunning={audits.active !== null}
        onClose={() => setCreating(false)}
        onAuditStarted={(job) => {
          setCreating(false);
          showAudit(job);
          audits.refresh();
        }}
      />

      <AuditDialog
        job={shownAudit}
        open={auditOpen}
        onClose={closeAudit}
        onCancel={async (job) => {
          try {
            await api.cancelAudit(job.id);
          } catch (e) {
            toast.error((e as Error).message);
          }
          audits.refresh();
        }}
        onResume={async (job) => {
          try {
            showAudit(await api.resumeAudit(job.id));
          } catch (e) {
            toast.error((e as Error).message, { duration: 10000 });
          }
          audits.refresh();
        }}
        onRetry={async (job) => {
          try {
            showAudit(
              await api.startAudit({
                url: job.url,
                scope: job.scope,
                clientName: job.clientName,
                languages: job.languages,
                model: job.model,
                effort: job.effort,
                subagents: job.subagents,
              })
            );
          } catch (e) {
            toast.error((e as Error).message, { duration: 10000 });
          }
          audits.refresh();
        }}
        onOpenReport={(next) => {
          if (dirty && !window.confirm("Discard unsaved changes and open the new report?")) return;
          closeAudit();
          refreshList();
          load(next);
        }}
      />

      <Toaster position="bottom-right" richColors />
    </div>
  );
}
