import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Meta, Severity } from "@/lib/types";
import { SEVERITY_CLASS, SEVERITY_LABEL, scoreBand } from "@/lib/report";

const DIAL_TONE = (score: number) =>
  score >= 90 ? "#4ec98a" : score >= 70 ? "#8fd0a8" : score >= 50 ? "#e8b04b" : "#e2705f";

function Dial({ score }: { score: number }) {
  const C = 2 * Math.PI * 45;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * C;
  return (
    <svg viewBox="0 0 120 120" className="size-24 -rotate-90">
      <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" strokeWidth="9" className="text-muted" />
      <circle
        cx="60"
        cy="60"
        r="45"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        stroke={DIAL_TONE(score)}
        strokeDasharray={`${filled.toFixed(2)} ${(C - filled).toFixed(2)}`}
      />
    </svg>
  );
}

interface Props {
  meta: Meta;
  counts: Record<Severity, number>;
  onChange: (next: Meta) => void;
}

const FIELDS: Array<[keyof Meta, string, string?]> = [
  ["site", "Site", "naa.ee"],
  ["siteUrl", "Site URL", "https://naa.ee/"],
  ["clientName", "Client", "Nordic Aviation Academy"],
  ["auditedAt", "Audit date", "2026-07-31"],
];

export function MetaPanel({ meta, counts, onChange }: Props) {
  const set = <K extends keyof Meta>(key: K, value: Meta[K]) => onChange({ ...meta, [key]: value });

  return (
    <Card>
      <CardContent className="grid gap-5 pt-5 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([key, label, placeholder]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                className="text-sm"
                placeholder={placeholder}
                value={(meta[key] as string) ?? ""}
                onChange={(e) => set(key, e.target.value as Meta[typeof key])}
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Pages analysed</Label>
            <Input
              type="number"
              min={0}
              className="text-sm"
              value={meta.pagesAnalyzed ?? 0}
              onChange={(e) => set("pagesAnalyzed", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Score (0–100)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              className="text-sm"
              value={meta.score ?? 0}
              onChange={(e) => set("score", Number(e.target.value))}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Stack (optional, one line)</Label>
            <Input
              className="text-sm"
              placeholder="WordPress 7.0.2 · twentytwentytwo · GA4"
              value={meta.stack ?? ""}
              onChange={(e) => set("stack", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-6 py-4">
          <Dial score={meta.score ?? 0} />
          <div className="-mt-2 text-2xl font-bold tabular-nums">{meta.score ?? 0}</div>
          <div className="text-center text-xs text-muted-foreground">{scoreBand(meta.score ?? 0)}</div>
          <div className="mt-2 flex gap-3 text-[11px]">
            {(Object.keys(counts) as Severity[]).map((s) => (
              <span key={s} className={cn("tabular-nums", SEVERITY_CLASS[s])} title={SEVERITY_LABEL[s]}>
                {counts[s]}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
