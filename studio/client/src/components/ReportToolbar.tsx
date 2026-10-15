import { useState, type ReactNode } from "react";
import { Languages, Plus, Save, Trash2 } from "lucide-react";
import { DeleteReportDialog } from "@/components/DeleteReportDialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LANG_LABEL } from "@/lib/report";
import type { Lang } from "@/lib/types";

interface Props {
  slug: string;
  site: string;
  /** The language on screen: what Translate acts on. */
  lang: Lang;
  sourceLang: Lang;
  /** The language picker — owned by App, shown beside the actions it drives. */
  langPicker?: ReactNode;
  dirty: boolean;
  /** A save, render or translation is under way. */
  busy: boolean;
  onSave: () => void;
  onTranslate: (lang: Lang) => void;
  /** Another report for the open report's site. */
  onNewForSite: () => void;
  /** Resolves once the report is gone; rejects to keep the dialog open. */
  onDelete: () => Promise<void>;
}

/**
 * Actions on the open report. Same height as the preview pane's header.
 * Everyday work on the left; New and Delete pushed right, with Delete at the
 * far end so it is never next to Save.
 */
export function ReportToolbar({
  slug,
  site,
  lang,
  sourceLang,
  langPicker,
  dirty,
  busy,
  onSave,
  onTranslate,
  onNewForSite,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {langPicker}
      
      <Button size="sm" variant={dirty ? "default" : "outline"} onClick={onSave} disabled={busy || !dirty}>
        <Save className="size-3.5" /> Save
      </Button>

      <Button
        size="sm"
        variant="outline"
        disabled={busy || lang === sourceLang}
        onClick={() => onTranslate(lang)}
        title={
          lang === sourceLang
            ? "Pick Estonian or Russian to translate into"
            : `Translate into ${LANG_LABEL[lang]}`
        }
      >
        <Languages className="size-3.5" /> Translate
      </Button>

      {dirty && <span className="text-xs text-muted-foreground">unsaved changes</span>}

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onNewForSite} title={`New report for ${site}`}>
          <Plus className="size-3.5" /> New
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>

      <DeleteReportDialog
        slug={confirming ? slug : null}
        onClose={() => setConfirming(false)}
        onDelete={() => onDelete()}
      />
    </div>
  );
}
