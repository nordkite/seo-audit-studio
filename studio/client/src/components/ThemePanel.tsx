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
  autoBorder,
  autoCards,
  autoEvidence,
  autoMuted,
  DEFAULT_BACKGROUND,
  DEFAULT_RADIUS,
  DEFAULT_TEXT,
  isHex,
  isRadius,
  MAX_RADIUS,
  resolveSurface,
  TEXT_SIZES,
  type BrandDoc,
  type BrandTheme,
  type BoxColors,
  type LogoVariant,
  type SurfaceName,
  type TextSize,
} from "@/lib/types";

const LOGO_LABELS: Record<LogoVariant, string> = {
  logo: "Logo",
  logoOnDark: "Logo on dark",
};

type Box = "cards" | "evidence";
const BOX_NAMES: Record<Box, string> = { cards: "Card", evidence: "Evidence" };


const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: "Small",
  default: "Default",
  medium: "Medium",
  large: "Large",
};
const textSizeItems = (Object.keys(TEXT_SIZES) as TextSize[]).map((v) => ({
  value: v,
  label: `${TEXT_SIZE_LABELS[v]} — ${TEXT_SIZES[v]}pt`,
}));

/**
 * Colors, logo and shape of the surface the preview is showing, plus the
 * text size both share. Edits are a draft: the preview shows them at once, and
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
  const resolved = resolveSurface(surface);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.theme);
  const setSurface = (patch: Partial<typeof surface>) =>
    onChange({ ...draft, [part]: { ...surface, ...patch } });
  // Drops cleared keys, and the whole object once empty, so going back to Auto
  // leaves the draft equal to the saved theme.
  const setBox = (box: Box, patch: BoxColors) => {
    const next = Object.fromEntries(
      Object.entries({ ...surface[box], ...patch }).filter(([, v]) => v !== undefined)
    );
    setSurface({ [box]: Object.keys(next).length ? next : undefined });
  };
  const boxAuto: Record<Box, Required<BoxColors>> = {
    cards: autoCards(surface, part),
    evidence: autoEvidence(surface),
  };
  // Evidence boxes are only on the body.
  const boxes: Box[] = part === "body" ? ["cards", "evidence"] : ["cards"];

  const auto = resolveSurface({ ...surface, logo: undefined }).logo;
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
          label="Secondary text"
          value={surface.muted ?? autoMuted(surface, part)}
          onChange={(muted) => setSurface({ muted })}
          onAuto={surface.muted ? () => setSurface({ muted: undefined }) : undefined}
        />
        <ColorField
          label="Border"
          value={surface.border ?? autoBorder(surface, part)}
          onChange={(border) => setSurface({ border })}
          onAuto={surface.border ? () => setSurface({ border: undefined }) : undefined}
        />
        <RadiusField
          value={surface.radius ?? DEFAULT_RADIUS}
          onChange={(radius) => setSurface({ radius })}
        />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Text size (both)</Label>
          <Select
            value={draft.textSize}
            onValueChange={(v) => onChange({ ...draft, textSize: v as TextSize })}
            items={textSizeItems}
          >
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {textSizeItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {boxes.map((box) => (
        <div
          key={box}
          className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-3 gap-y-2 border-t pt-2"
        >
          {(["background", "border", "text"] as const).map((key) => (
            <ColorField
              key={key}
              label={`${BOX_NAMES[box]} ${key}`}
              value={surface[box]?.[key] ?? boxAuto[box][key]}
              onChange={(v) => setBox(box, { [key]: v })}
              onAuto={surface[box]?.[key] ? () => setBox(box, { [key]: undefined }) : undefined}
            />
          ))}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={saved.file}>
          {missingDark
            ? "No logoOnDark in brand.json, so the logo is turned white."
            : `Saves to ${saved.isExample ? "brand/brand.json (run npm run setup first)" : "brand.json"}`}
        </span>
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

/** Corner radius of this surface's cards and panels, in mm. */
function RadiusField({ value, onChange }: { value: number; onChange: (mm: number) => void }) {
  // As with ColorField, only a valid number reaches the draft.
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parse = (v: string) => (v.trim() === "" ? NaN : Number(v));

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Corner radius (mm)</Label>
      <Input
        type="number"
        min={0}
        max={MAX_RADIUS}
        step={0.5}
        value={text}
        aria-invalid={!isRadius(parse(text))}
        onChange={(e) => {
          setText(e.target.value);
          const mm = parse(e.target.value);
          if (isRadius(mm)) onChange(mm);
        }}
        className="h-8 text-sm"
      />
    </div>
  );
}

/** A swatch for picking plus a hex field for pasting an exact brand color. */
function ColorField({
  label,
  value,
  onChange,
  onAuto,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Shown when the value is set explicitly: goes back to the derived color. */
  onAuto?: () => void;
}) {
  // The text field holds what is typed; only a complete hex reaches the draft,
  // so the preview never renders a half-typed color.
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {onAuto && (
          <button
            type="button"
            onClick={onAuto}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Auto
          </button>
        )}
      </div>
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
