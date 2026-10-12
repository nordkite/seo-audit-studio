import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { I18nField } from "./I18nField";
import { cn } from "@/lib/utils";
import { LEVELS, type FieldStatus, type Finding, type I18n, type Lang } from "@/lib/types";
import { isI18n, paths } from "@/lib/report";

interface Props {
  finding: Finding;
  lang: Lang;
  sourceLang: Lang;
  statusOf: (path: string) => FieldStatus | undefined;
  onChange: (next: Finding) => void;
  onDelete: () => void;
  disabled?: boolean;
}

export function FindingCard({
  finding,
  lang,
  sourceLang,
  statusOf,
  onChange,
  onDelete,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: finding.id,
    disabled,
  });

  const set = <K extends keyof Finding>(key: K, value: Finding[K]) =>
    onChange({ ...finding, [key]: value });

  const isPass = finding.severity === "pass";
  const evidenceIsProse = isI18n(finding.evidence);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "rounded-lg border bg-card text-card-foreground",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start gap-1 p-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing disabled:opacity-30"
          disabled={disabled}
          aria-label="Drag to reorder or change severity"
        >
          <GripVertical className="size-3.5" />
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-1 rounded px-1 py-0.5 text-left hover:bg-accent/50"
        >
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm leading-snug">
              {finding.title?.[lang] || finding.title?.[sourceLang] || (
                <em className="text-muted-foreground">Untitled finding</em>
              )}
            </span>
            <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
              {finding.id}
            </span>
          </span>
          {open ? (
            <ChevronDown className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t p-3">
          <I18nField
            label="Title"
            value={finding.title}
            onChange={(v) => set("title", v)}
            lang={lang}
            sourceLang={sourceLang}
            status={statusOf(paths.item("findings", finding.id, "title"))}
          />

          {!isPass && (
            <I18nField
              label="Body"
              multiline
              rows={5}
              value={finding.body}
              onChange={(v) => set("body", v)}
              lang={lang}
              sourceLang={sourceLang}
              status={statusOf(paths.item("findings", finding.id, "body"))}
            />
          )}

          {!isPass && (
            <div className="grid grid-cols-2 gap-2">
              {(["impact", "effort"] as const).map((key) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground capitalize">{key}</Label>
                  <Select
                    value={finding[key] ?? "medium"}
                    onValueChange={(v) => set(key, v as Finding["impact"])}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {!isPass && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Evidence</Label>
                <button
                  className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() =>
                    set(
                      "evidence",
                      evidenceIsProse
                        ? ((finding.evidence as I18n)[sourceLang] ?? "")
                        : { [sourceLang]: (finding.evidence as string) ?? "" }
                    )
                  }
                >
                  {evidenceIsProse ? "make verbatim" : "make translatable"}
                </button>
              </div>

              {/* Verbatim evidence is a URL or filename and must survive
                  translation untouched; prose evidence gets translated. */}
              {evidenceIsProse ? (
                <I18nField
                  label="Evidence (prose)"
                  value={finding.evidence as I18n}
                  onChange={(v) => set("evidence", v)}
                  lang={lang}
                  sourceLang={sourceLang}
                  status={statusOf(paths.item("findings", finding.id, "evidence"))}
                />
              ) : (
                <Input
                  className="font-mono text-xs"
                  placeholder="https://example.com/page"
                  value={(finding.evidence as string) ?? ""}
                  onChange={(e) => set("evidence", e.target.value)}
                />
              )}
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            <Label className="text-xs text-muted-foreground">ID</Label>
            <Input
              className="h-7 w-full font-mono text-xs"
              value={finding.id}
              onChange={(e) => set("id", e.target.value)}
            />
          </div>

          <div className="flex justify-end border-t pt-2">
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
