import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ReportSummary } from "@/lib/types";

interface Props {
  reports: ReportSummary[];
  slug: string | null;
  onPick: (slug: string) => void;
  className?: string;
}

/** The report dropdown, shared by the top bar and the home screen. */
export function ReportPicker({ reports, slug, onPick, className }: Props) {
  return (
    // `items` is what makes the trigger show the label instead of the raw
    // value — Base UI's SelectValue renders the value string otherwise.
    <Select
      value={slug ?? ""}
      onValueChange={(v) => v && onPick(v)}
      items={reports.map((r) => ({ value: r.slug, label: `${r.site} — ${r.clientName}` }))}
    >
      <SelectTrigger className={cn("h-8 w-64 text-sm", className)}>
        <SelectValue placeholder="Choose a report…" />
      </SelectTrigger>
      <SelectContent>
        {reports.map((r) => (
          <SelectItem key={r.slug} value={r.slug} disabled={r.broken}>
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
  );
}
