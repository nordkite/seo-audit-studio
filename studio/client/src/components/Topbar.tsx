import { FileDown, Languages, Plus, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  onNew,
  onSave,
  onTranslate,
  onRender,
  onSettings,
}: Props) {
  const source = doc?.report.meta.sourceLang ?? "en";

  return (
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
      <span className="text-sm font-semibold tracking-tight">
        SEO Audit <span className="text-muted-foreground">Studio</span>
      </span>

      <Separator orientation="vertical" className="h-5" />

      {/* `items` is what makes the trigger show the label instead of the raw
          value — Base UI's SelectValue renders the value string otherwise. */}
      <Select
        value={slug ?? ""}
        onValueChange={(v) => v && onPick(v)}
        items={reports.map((r) => ({ value: r.slug, label: `${r.site} — ${r.clientName}` }))}
      >
        <SelectTrigger className="h-8 w-64 text-sm">
          <SelectValue placeholder="Choose a report…" />
        </SelectTrigger>
        <SelectContent>
          {reports.map((r) => (
            <SelectItem key={r.slug} value={r.slug}>
              <span className="flex w-full items-center justify-between gap-4">
                <span className="truncate">
                  {r.site} — {r.clientName}
                </span>
                {/* Two audits of the same client are told apart by the filename. */}
                <span className="font-mono text-[11px] text-muted-foreground">{r.slug}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="ghost" size="sm" onClick={onNew}>
        <Plus className="size-3.5" /> New
      </Button>

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
