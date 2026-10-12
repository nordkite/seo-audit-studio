import { useEffect, useState } from "react";
import { KeyRound, TerminalSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  ClientScope,
  Effort,
  Health,
  ModelsResult,
  Provider,
  TranslateSettings,
} from "@/lib/types";

const EFFORT_LABEL: Record<Effort, string> = {
  low: "Low — fastest, recommended",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max — slowest",
};

const NO_EFFORT = [{ value: "", label: "Not adjustable" }];

const SCOPES = [
  { value: "stale", label: "Missing and stale only" },
  { value: "all", label: "Everything" },
];

const CARDS: { id: Provider; title: string; blurb: string; Icon: typeof KeyRound }[] = [
  {
    id: "cli",
    title: "Claude Code",
    blurb: "Uses your Claude subscription. No API key, runs on this machine only.",
    Icon: TerminalSquare,
  },
  {
    id: "api",
    title: "Claude API",
    blurb: "Uses your own API key, billed per token. Works anywhere.",
    Icon: KeyRound,
  },
];

export function SettingsDialog({
  open,
  settings,
  health,
  onChange,
  onClose,
}: {
  open: boolean;
  settings: TranslateSettings;
  health: Health | null;
  onChange: (patch: Partial<TranslateSettings>) => void;
  onClose: () => void;
}) {
  const { provider, apiKey, model, effort } = settings;
  const [list, setList] = useState<ModelsResult | null>(null);

  // Ask the server what this provider can run. Debounced, because the API key
  // field changes on every keystroke and each change means a new list.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .models(provider, apiKey, controller.signal)
        .then(setList)
        .catch(() => {
          /* aborted, or the server is down: keep the last list */
        });
    }, provider === "api" ? 400 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [provider, apiKey]);

  const models = list?.models ?? [];
  const known = models.some((m) => m.value === model);
  // A model saved earlier may be missing from a fallback list; show it rather
  // than blank the trigger.
  const options = known || !model ? models : [...models, { value: model, label: model, efforts: [] }];
  const efforts = models.find((m) => m.value === model)?.efforts ?? [];
  const effortOptions = efforts.length
    ? efforts.map((e) => ({ value: e, label: EFFORT_LABEL[e] }))
    : NO_EFFORT;

  // Keep the saved choice valid for what this provider offers: a Claude Code
  // alias means nothing to the API, and not every model takes every effort.
  useEffect(() => {
    if (!list) return;
    const patch: Partial<TranslateSettings> = {};
    const fromList = list.source !== "fallback";
    const validModel = known || (!fromList && (model === "" || model.startsWith("claude-")));
    if (!validModel) patch.model = "";

    const levels = list.models.find((m) => m.value === (patch.model ?? model))?.efforts;
    if (levels) {
      if (!levels.length) patch.effort = "";
      else if (!effort || !levels.includes(effort)) patch.effort = levels.includes("low") ? "low" : levels[0];
    }
    if (Object.keys(patch).length) onChange(patch);
  }, [list, model, effort, known, onChange]);

  const note =
    list?.source === "live"
      ? "Every model your API key can use, newest first."
      : list?.source === "aliases"
        ? "Claude Code picks the newest model in each family your plan includes."
        : list?.error;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Translation</DialogTitle>
          <DialogDescription>
            How Estonian and Russian get written. Both paths use the same prompt and the same
            glossary — only who pays differs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {CARDS.map(({ id, title, blurb, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ provider: id })}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  settings.provider === id
                    ? "border-primary bg-accent"
                    : "hover:bg-accent/50"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-3.5" />
                  {title}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{blurb}</span>
              </button>
            ))}
          </div>

          {settings.provider === "api" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Anthropic API key</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={settings.apiKey}
                onChange={(e) => onChange({ apiKey: e.target.value })}
                placeholder={health?.hasEnvKey ? "using ANTHROPIC_API_KEY from the server" : "sk-ant-…"}
              />
              <p className="text-xs text-muted-foreground">
                Kept in this browser only and sent with each translation request. It is never
                written to the report, the backups, or the server.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Select
              value={model}
              onValueChange={(v) => onChange({ model: v ?? "" })}
              items={options}
            >
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((m) => (
                  <SelectItem key={m.value || "default"} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Thinking effort</Label>
              <Select
                value={effort}
                onValueChange={(v) => onChange({ effort: (v ?? "") as Effort | "" })}
                items={effortOptions}
                disabled={!efforts.length}
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {effortOptions.map((e) => (
                    <SelectItem key={e.value || "none"} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Retranslate</Label>
              <Select
                value={settings.scope}
                onValueChange={(v) => v && onChange({ scope: v as ClientScope })}
                items={SCOPES}
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
