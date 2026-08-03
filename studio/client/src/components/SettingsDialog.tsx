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
import { cn } from "@/lib/utils";
import type { Health, Provider, Scope, TranslateSettings } from "@/lib/types";

const MODELS = [
  { value: "", label: "Default" },
  { value: "claude-opus-5", label: "Opus 5 — best quality" },
  { value: "claude-sonnet-5", label: "Sonnet 5 — cheaper" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5 — cheapest" },
];

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
  const models = MODELS.map((m) =>
    m.value === "" && health?.defaultModel
      ? { ...m, label: `Default — ${health.defaultModel}` }
      : m
  );

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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <Select
                value={settings.model}
                onValueChange={(v) => onChange({ model: v ?? "" })}
                items={models}
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.value || "default"} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Retranslate</Label>
              <Select
                value={settings.scope}
                onValueChange={(v) => v && onChange({ scope: v as Scope })}
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
