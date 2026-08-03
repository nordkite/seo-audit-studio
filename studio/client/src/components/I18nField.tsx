import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FieldStatus, I18n, Lang } from "@/lib/types";

const BADGE: Record<Exclude<FieldStatus, "source">, { text: string; className: string }> = {
  current: { text: "translated", className: "bg-sev-pass/15 text-sev-pass" },
  stale: { text: "stale", className: "bg-sev-warning/20 text-sev-warning" },
  missing: { text: "missing", className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status }: { status?: FieldStatus }) {
  if (!status || status === "source") return null;
  const b = BADGE[status];
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
        b.className
      )}
      title={
        status === "stale"
          ? "The English source changed after this was translated — re-run Translate."
          : status === "missing"
            ? "Not translated yet."
            : "Translated against the current English."
      }
    >
      {b.text}
    </span>
  );
}

interface Props {
  label: string;
  value: I18n | undefined;
  onChange: (next: I18n) => void;
  lang: Lang;
  sourceLang: Lang;
  status?: FieldStatus;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function I18nField({
  label,
  value,
  onChange,
  lang,
  sourceLang,
  status,
  multiline,
  rows = 4,
  placeholder,
  disabled,
}: Props) {
  const current = value?.[lang] ?? "";
  const source = value?.[sourceLang] ?? "";
  const Control = multiline ? Textarea : Input;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <StatusBadge status={status} />
      </div>

      <Control
        value={current}
        rows={multiline ? rows : undefined}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange({ ...(value ?? {}), [lang]: e.target.value })
        }
        className={cn(multiline && "min-h-20 resize-y", "text-sm")}
      />

      {/* Translating is much easier with the source in view. */}
      {lang !== sourceLang && source && (
        <p className="rounded border border-dashed border-border/60 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
          <span className="mr-1.5 font-medium uppercase opacity-60">{sourceLang}</span>
          {source}
        </p>
      )}
    </div>
  );
}
