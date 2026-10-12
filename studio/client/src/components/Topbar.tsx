import { FileDown, Languages, Plus, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportPicker } from "@/components/ReportPicker";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";
import type { Doc, Lang, ReportSummary } from "@/lib/types";
import { LANG_LABEL } from "@/lib/report";

interface Props {
  reports: ReportSummary[];
  slug: string | null;
  doc: Doc | null;
  lang: Lang;
  dirty: boolean;
  busy: boolean;
  onPick: (slug: string) => void;
  onHome: () => void;
  onNew: () => void;
  onSave: () => void;
  onTranslate: (lang: Lang) => void;
  onRender: () => void;
  onSettings: () => void;
}

export function Topbar({
  reports,
  slug,
  doc,
  lang,
  dirty,
  busy,
  onPick,
  onHome,
  onNew,
  onSave,
  onTranslate,
  onRender,
  onSettings,
}: Props) {
  const source = doc?.report.meta.sourceLang ?? "en";

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

          <Button variant="ghost" size="sm" onClick={onNew}>
            <Plus className="size-3.5" /> New
          </Button>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {doc && (
          <>
            {dirty && <span className="text-xs text-muted-foreground">unsaved changes</span>}

            <Button size="sm" variant={dirty ? "default" : "outline"} onClick={onSave} disabled={busy || !dirty}>
              <Save className="size-3.5" /> Save
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={busy || lang === source}
              onClick={() => onTranslate(lang)}
              title={
                lang === source
                  ? "Pick Estonian or Russian to translate into"
                  : `Translate into ${LANG_LABEL[lang]}`
              }
            >
              <Languages className="size-3.5" /> Translate
            </Button>

            <Button size="sm" variant="outline" onClick={onRender} disabled={busy}>
              <FileDown className="size-3.5" /> Render PDF
            </Button>

            <Separator orientation="vertical" className="h-5" />
          </>
        )}

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
