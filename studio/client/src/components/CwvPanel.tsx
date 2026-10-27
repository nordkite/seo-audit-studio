import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIGHTHOUSE, type CoreWebVitalsMetrics } from "@/lib/types";

interface Props {
  cwv: CoreWebVitalsMetrics | undefined;
  /** `undefined` removes the section from the report. */
  onChange: (next: CoreWebVitalsMetrics | undefined) => void;
  disabled?: boolean;
}

const SCORE_LABEL: Record<(typeof LIGHTHOUSE)[number], string> = {
  performance: "Performance",
  accessibility: "Accessibility",
  bestPractices: "Best practices",
  seo: "SEO",
};

const VITALS = [
  ["lcp", "LCP (ms)", 1],
  ["inp", "INP (ms)", 1],
  ["cls", "CLS", 0.01],
] as const;

/**
 * Core Web Vitals and Lighthouse scores. Numbers only, never translated: the
 * labels in the PDF come from i18n. One section shows one device, so the
 * scores entered here must come from a run on the device picked.
 */
export function CwvPanel({ cwv, onChange, disabled }: Props) {
  if (!cwv) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange({ source: "lab", strategy: "mobile" })}
      >
        <Plus className="size-3.5" /> Add Core Web Vitals
      </Button>
    );
  }

  /** An empty field leaves the number out of the report rather than printing 0. */
  const setNumber = (key: keyof CoreWebVitalsMetrics, raw: string, max?: number) => {
    const next = { ...cwv };
    if (raw.trim() === "") delete next[key];
    else {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      (next as Record<string, unknown>)[key] = max === undefined ? Math.max(0, n) : Math.min(max, Math.max(0, n));
    }
    onChange(next);
  };

  const num = (key: keyof CoreWebVitalsMetrics, label: string, step: number, max?: number) => (
    <div key={key} className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        disabled={disabled}
        type="number"
        min={0}
        max={max}
        step={step}
        className="text-sm tabular-nums"
        value={(cwv[key] as number | null | undefined) ?? ""}
        onChange={(e) => setNumber(key, e.target.value, max)}
      />
    </div>
  );

  const select = (
    key: "strategy" | "source",
    label: string,
    options: readonly (readonly [string, string])[]
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={cwv[key] ?? options[0][0]}
        onValueChange={(v) => onChange({ ...cwv, [key]: v })}
        items={options.map(([value, l]) => ({ value, label: l }))}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 w-full text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([value, l]) => (
            <SelectItem key={value} value={value}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        {select("strategy", "Device", [
          ["mobile", "Mobile"],
          ["desktop", "Desktop"],
        ])}
        {select("source", "Vitals from", [
          ["field", "Real users (CrUX)"],
          ["lab", "Lab test (Lighthouse)"],
        ])}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Measured URL</Label>
          <Input
            disabled={disabled}
            className="text-sm"
            placeholder="https://example.com/"
            value={cwv.url ?? ""}
            onChange={(e) => onChange({ ...cwv, url: e.target.value || undefined })}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">{VITALS.map(([key, label, step]) => num(key, label, step))}</div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium">Lighthouse scores (0–100)</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LIGHTHOUSE.map((key) => num(key, SCORE_LABEL[key], 1, 100))}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          The PDF labels this whole block with the device above, so enter scores from a run on that device.
          Mobile Lighthouse scores swing widely between runs; PageSpeed Insights&rsquo; desktop tab usually
          scores far higher than its mobile one. An empty field is left out of the report.
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" /> Remove
        </Button>
      </div>
    </div>
  );
}
