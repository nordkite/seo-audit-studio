import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Topbar } from "@/components/Topbar";
import { MetaPanel } from "@/components/MetaPanel";
import { FindingsBoard } from "@/components/FindingsBoard";
import { ListPanel } from "@/components/ListPanel";
import { SectionsPanel } from "@/components/SectionsPanel";
import { PreviewPane } from "@/components/PreviewPane";
import { LangSelect } from "@/components/LangSelect";
import { TranslateDialog } from "@/components/TranslateDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { I18nField } from "@/components/I18nField";
import { api } from "@/lib/api";
import { LANG_LABEL, counts, edit, paths, slugify } from "@/lib/report";
import { useTranslateSettings } from "@/lib/settings";
import type { Doc, FieldStatus, Health, Lang, Report, ReportSummary } from "@/lib/types";

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
  const [slug, setSlug] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState<Lang | null>(null);
  const [creating, setCreating] = useState(false);
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
    api.list().then((r) => setReports(r.reports)).catch((e) => toast.error(e.message));
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

  const render = useCallback(async () => {
    if (!doc || !slug) return;
    if (dirty) {
      toast.error("Save before rendering — the PDF is generated from the file on disk.");
      return;
    }
    setBusy(true);
    const t = toast.loading(`Rendering ${LANG_LABEL[lang]} PDF…`);
    try {
      // The language on screen, not --all: --all only picks up languages whose
      // summary is translated, so a half-translated tab would silently render
      // as English.
      const out = await api.render(slug, [lang]);
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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar
        reports={reports}
        slug={slug}
        doc={doc}
        lang={lang}
        dirty={dirty}
        busy={busy || translating !== null}
        onPick={load}
        onNew={() => setCreating(true)}
        onSave={save}
        onTranslate={translate}
        onRender={render}
        onSettings={() => setSettingsOpen(true)}
      />

      {!doc ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Choose a report to start editing.
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="min-h-0 space-y-4 overflow-auto p-4">
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
              </div>
            </Section>

            <Section title="Findings">
              <FindingsBoard
                findings={report!.findings}
                lang={lang}
                sourceLang={source}
                statusOf={statusOf}
                disabled={translating !== null}
                onChange={(findings) => update((d) => void (d.findings = findings))}
                onMoved={(m) => toast.info(m)}
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

          <div className="hidden min-h-0 border-l xl:block">
            <PreviewPane
              report={report!}
              lang={lang}
              langPicker={doc && <LangSelect doc={doc} lang={lang} onLang={setLang} />}
            />
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
        onClose={() => setCreating(false)}
        onCreated={async (created) => {
          setCreating(false);
          setReports((await api.list()).reports);
          setDoc(created);
          setSlug(created.slug);
          setDirty(false);
          setTouched(new Set());
        }}
      />

      <Toaster position="bottom-right" richColors />
    </div>
  );
}

function NewReportDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (doc: Doc) => void;
}) {
  const [site, setSite] = useState("");
  const [clientName, setClientName] = useState("");
  const [busy, setBusy] = useState(false);
  const slug = slugify(site);

  const submit = async () => {
    setBusy(true);
    try {
      onCreated(await api.create({ slug, site, clientName }));
      setSite("");
      setClientName("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Site</Label>
            <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="naa.ee" />
            {site && <p className="font-mono text-[11px] text-muted-foreground">reports/{slug}.json</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client name</Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nordic Aviation Academy"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Starts from a placeholder finding, because a report with no findings cannot be
            rendered. Replace it before sending anything to a client.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !site || !clientName}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
