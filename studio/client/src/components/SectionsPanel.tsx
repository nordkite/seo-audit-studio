import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { I18nField } from "./I18nField";
import { api } from "@/lib/api";
import { ANCHORS, type Anchor, type FieldStatus, type Lang, type Section } from "@/lib/types";
import { blankSection, paths } from "@/lib/report";

const ANCHOR_LABEL: Record<Anchor, string> = {
  summary: "After Executive summary",
  breakdown: "After Findings at a glance",
  findings: "After the finding sections",
  roadmap: "After Recommended order of work",
  notCovered: "After Not covered",
};

interface Props {
  slug: string;
  sections: Section[];
  lang: Lang;
  sourceLang: Lang;
  statusOf: (path: string) => FieldStatus | undefined;
  onChange: (next: Section[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

function SectionEditor({
  slug,
  section,
  lang,
  sourceLang,
  statusOf,
  onChange,
  onDelete,
  onError,
}: {
  slug: string;
  section: Section;
  lang: Lang;
  sourceLang: Lang;
  statusOf: (p: string) => FieldStatus | undefined;
  onChange: (next: Section) => void;
  onDelete: () => void;
  onError: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const { src } = await api.upload(slug, file);
      onChange({ ...section, image: { ...(section.image ?? {}), src } });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Position</Label>
          <Select
            value={section.after ?? "summary"}
            onValueChange={(v) => onChange({ ...section, after: v as Anchor })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANCHORS.map((a) => (
                <SelectItem key={a} value={a}>
                  {ANCHOR_LABEL[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={section.breakBefore ?? false}
            onChange={(e) => onChange({ ...section, breakBefore: e.target.checked })}
          />
          Start on a new page
        </label>

        <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <I18nField
        label="Heading"
        value={section.title}
        onChange={(v) => onChange({ ...section, title: v })}
        lang={lang}
        sourceLang={sourceLang}
        status={statusOf(paths.item("sections", section.id, "title"))}
      />

      <I18nField
        label="Body"
        multiline
        rows={3}
        value={section.body}
        onChange={(v) => onChange({ ...section, body: v })}
        lang={lang}
        sourceLang={sourceLang}
        status={statusOf(paths.item("sections", section.id, "body"))}
      />

      <div className="space-y-2 rounded-md border border-dashed p-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Image</Label>
          {section.image?.src && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onChange({ ...section, image: undefined })}
            >
              <X className="size-3" /> Remove
            </Button>
          )}
        </div>

        {section.image?.src ? (
          <>
            <img
              src={`/${section.image.src}`}
              alt=""
              className="max-h-48 w-full rounded border object-contain"
            />
            <p className="font-mono text-[10px] text-muted-foreground">{section.image.src}</p>
            <I18nField
              label="Alt text"
              value={section.image.alt}
              onChange={(v) => onChange({ ...section, image: { ...section.image!, alt: v } })}
              lang={lang}
              sourceLang={sourceLang}
              status={statusOf(paths.image(section.id, "alt"))}
            />
            <I18nField
              label="Caption"
              value={section.image.caption}
              onChange={(v) => onChange({ ...section, image: { ...section.image!, caption: v } })}
              lang={lang}
              sourceLang={sourceLang}
              status={statusOf(paths.image(section.id, "caption"))}
            />
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-3.5" /> {busy ? "Uploading…" : "Upload image"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Printed 174&nbsp;mm wide — around 1400&nbsp;px gives ~200&nbsp;dpi.
            </p>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

export function SectionsPanel({
  slug,
  sections,
  lang,
  sourceLang,
  statusOf,
  onChange,
  onError,
  disabled,
}: Props) {
  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <SectionEditor
          key={s.id}
          slug={slug}
          section={s}
          lang={lang}
          sourceLang={sourceLang}
          statusOf={statusOf}
          onError={onError}
          onChange={(next) => onChange(sections.map((x) => (x.id === s.id ? next : x)))}
          onDelete={() => onChange(sections.filter((x) => x.id !== s.id))}
        />
      ))}

      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...sections, blankSection(sections.map((s) => s.id))])}
      >
        <Plus className="size-3.5" /> Add section
      </Button>
    </div>
  );
}
