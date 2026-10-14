import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
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
import {
  DEFAULT_BACKGROUND,
  DEFAULT_TEXT,
  isHex,
  resolveSurface,
  type BrandDoc,
  type BrandTheme,
  type LogoVariant,
  type SurfaceName,
} from "@/lib/types";

const LOGO_LABELS: Record<LogoVariant, string> = {
  logo: "Logo",
  logoOnDark: "Logo on dark",
};

/**
 * Colors and logo for the surface the preview is showing, plus the primary
 * color both share. Edits are a draft: the preview shows them at once, and
 * nothing reaches brand/brand.json until Save.
 */
export function ThemePanel({
  part,
  saved,
  draft,
  saving,
  onChange,
  onReset,
  onSave,
}: {
  part: SurfaceName;
  saved: BrandDoc;
  draft: BrandTheme;
  saving: boolean;
  onChange: (theme: BrandTheme) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const surface = draft[part];
  const resolved = resolveSurface(surface, draft.primary);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.theme);
  const setSurface = (patch: Partial<typeof surface>) =>
    onChange({ ...draft, [part]: { ...surface, ...patch } });

  const auto = resolveSurface({ ...surface, logo: undefined }, draft.primary).logo;
  const missingDark = resolved.logo === "logoOnDark" && !saved.hasLogoOnDark;
  const logoItems = [
    { value: "auto", label: `Auto — ${LOGO_LABELS[auto]}` },
    ...(Object.keys(LOGO_LABELS) as LogoVariant[]).map((v) => ({ value: v, label: LOGO_LABELS[v] })),
  ];

  return (
    <div className="space-y-2 border-b bg-muted/30 px-3 py-2.5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-3 gap-y-2">
        <ColorField
          label="Background"
          value={surface.background ?? DEFAULT_BACKGROUND}
          onChange={(background) => setSurface({ background })}
        />
        <ColorField
          label="Text"
          value={surface.text ?? DEFAULT_TEXT}
          onChange={(text) => setSurface({ text })}
        />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Logo</Label>
          <Select
            value={surface.logo ?? "auto"}
            onValueChange={(v) => setSurface({ logo: v === "auto" ? undefined : (v as LogoVariant) })}
            items={logoItems}
          >
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {logoItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ColorField
          label="Primary (both)"
          value={draft.primary}
          onChange={(primary) => onChange({ ...draft, primary })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={saved.file}>
          {missingDark
            ? "No logoOnDark in brand.json, so the logo is turned white."
            : resolved.accent !== draft.primary
              ? "Primary is too close to this background, so accents use the text color."
              : `Saves to ${saved.isExample ? "brand/brand.json (run npm run setup first)" : "brand.json"}`}
        </span>
        {part === "cover" && surface.background !== draft.primary && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSurface({ background: draft.primary, text: "#ffffff" })}
          >
            Fill with primary
          </Button>
        )}
        <Button variant="ghost" size="xs" disabled={!dirty || saving} onClick={onReset}>
          <RotateCcw />
          Reset
        </Button>
        <Button size="xs" disabled={!dirty || saving || saved.isExample} onClick={onSave}>
          Save to brand.json
        </Button>
      </div>
    </div>
  );
}

/** A swatch for picking plus a hex field for pasting an exact brand color. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  // The text field holds what is typed; only a complete hex reaches the draft,
  // so the preview never renders a half-typed color.
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <Input
          value={text}
          spellCheck={false}
          aria-invalid={!isHex(text)}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (isHex(v)) onChange(v.toLowerCase());
          }}
          className="h-8 font-mono text-xs"
        />
      </div>
    </div>
  );
}
