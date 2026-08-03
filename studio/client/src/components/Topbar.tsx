import { FileDown, Languages, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { LANGS, type Doc, type Lang, type ReportSummary } from "@/lib/types";
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
  onLang: (lang: Lang) => void;
  onSave: () => void;
  onTranslate: (lang: Lang) => void;
  onRender: () => void;
}

function LangTab({ lang, doc }: { lang: Lang; doc: Doc | null }) {
  const t = doc?.totals?.[lang];
  const source = (doc?.report.meta.sourceLang ?? "en") === lang;
  const outstanding = (t?.stale ?? 0) + (t?.missing ?? 0);

  return (
    <TabsTrigger value={lang} className="gap-1.5">
      {LANG_LABEL[lang]}
      {!source && outstanding > 0 && (
        <span
          className={cn(
            "rounded px-1 text-[10px] tabular-nums",
            t?.stale ? "bg-sev-warning/20 text-sev-warning" : "bg-muted text-muted-foreground"
          )}
          title={`${t?.stale ?? 0} stale, ${t?.missing ?? 0} missing`}
        >
          {outstanding}
        </span>
      )}
    </TabsTrigger>
  );
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
  onLang,
  onSave,
  onTranslate,
  onRender,
}: Props) {
  const source = doc?.report.meta.sourceLang ?? "en";

  return (
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
      <span className="text-sm font-semibold tracking-tight">
        Nordkite <span className="text-muted-foreground">Report Studio</span>
      </span>

      <Separator orientation="vertical" className="h-5" />

      <Select value={slug ?? ""} onValueChange={(v) => v && onPick(v)}>
        <SelectTrigger className="h-8 w-60 text-sm">
          <SelectValue placeholder="Choose a report…" />
        </SelectTrigger>
        <SelectContent>
          {reports.map((r) => (
            <SelectItem key={r.slug} value={r.slug}>
              {r.site} — {r.clientName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="ghost" size="sm" onClick={onNew}>
        <Plus className="size-3.5" /> New
      </Button>

      {doc && (
        <>
          <Separator orientation="vertical" className="h-5" />
          <Tabs value={lang} onValueChange={(v) => onLang(v as Lang)}>
            <TabsList>
              {LANGS.map((l) => (
                <LangTab key={l} lang={l} doc={doc} />
              ))}
            </TabsList>
          </Tabs>

          <div className="ml-auto flex items-center gap-2">
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
                  : `Run /translate-report for ${LANG_LABEL[lang]}`
              }
            >
              <Languages className="size-3.5" /> Translate
            </Button>

            <Button size="sm" variant="outline" onClick={onRender} disabled={busy}>
              <FileDown className="size-3.5" /> Render PDF
            </Button>
          </div>
        </>
      )}
    </header>
  );
}
