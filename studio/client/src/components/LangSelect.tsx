import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LANGS, type Doc, type Lang } from "@/lib/types";
import { LANG_LABEL } from "@/lib/report";

interface Props {
  doc: Doc;
  lang: Lang;
  onLang: (lang: Lang) => void;
}

/** Stale + missing strings for a translated language; nothing for the source. */
function Outstanding({ doc, lang }: { doc: Doc; lang: Lang }) {
  const t = doc.totals?.[lang];
  const outstanding = (t?.stale ?? 0) + (t?.missing ?? 0);
  if ((doc.report.meta.sourceLang ?? "en") === lang || outstanding === 0) return null;

  return (
    <span
      className={cn(
        "rounded px-1 text-[10px] tabular-nums",
        t?.stale ? "bg-sev-warning/20 text-sev-warning" : "bg-muted text-muted-foreground"
      )}
      title={`${t?.stale ?? 0} stale, ${t?.missing ?? 0} missing`}
    >
      {outstanding}
    </span>
  );
}

export function LangSelect({ doc, lang, onLang }: Props) {
  return (
    // `items` makes the trigger show the label rather than the raw value.
    <Select
      value={lang}
      onValueChange={(v) => v && onLang(v as Lang)}
      items={LANGS.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
    >
      <SelectTrigger size="sm" className="w-36 text-[0.8rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGS.map((l) => (
          <SelectItem key={l} value={l}>
            <span className="flex w-full items-center justify-between gap-3">
              {LANG_LABEL[l]}
              <Outstanding doc={doc} lang={l} />
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
