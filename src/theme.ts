/**
 * Surface colors: the background, text color and logo of the cover and of the
 * body pages, as set in brand.json and edited by the Studio.
 *
 * No Node imports: the Studio client bundles this file to show the same
 * defaults and the same automatic logo choice the renderer will make.
 */

export const SURFACES = ["cover", "body"] as const;
export type SurfaceName = (typeof SURFACES)[number];

/** Which brand.json logo field a surface shows. */
export const LOGO_VARIANTS = ["logo", "logoOnDark"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];

/** Colors of a kind of box: the cards, or the evidence box. Every field is optional. */
export interface BoxColors {
  background?: string;
  border?: string;
  /** Its main text; secondary text and labels inside are lighter shades of it. */
  text?: string;
}
export const BOX_KEYS = ["background", "border", "text"] as const;

/** What a user writes under `cover` or `body` in brand.json. Every field is optional. */
export interface SurfaceConfig {
  background?: string;
  text?: string;
  /** Without it, chosen by how dark `background` is. */
  logo?: LogoVariant;
  /** Corner radius of cards and panels, in mm. 0 is square. */
  radius?: number;
  /** Color of borders and dividers. Without it, mixed from `text` and `background`. */
  border?: string;
  /**
   * Cards: the score card on the cover; finding cards, the
   * at-a-glance cells, the method box and the closing brand box on the body.
   * Severity badges and evidence boxes inside them are tinted from the card.
   */
  cards?: BoxColors;
  /**
   * Secondary text: subtitles, descriptions, labels. Labels use a lighter
   * shade of it. Without it, mixed from `text` and `background`.
   */
  muted?: string;
  /** Evidence box colors. Only the body has evidence boxes. */
  evidence?: BoxColors;
}

/**
 * Body text size of the report pages, in pt. report.css is written for a 9.4pt
 * body and multiplies every font size by `--text-scale`, so headings, labels
 * and tables grow with it, on the cover too. 12pt is 16px; small is the
 * original 9.4pt.
 */
export const TEXT_SIZES = { small: 9.4, default: 12, medium: 13, large: 14 } as const;
export type TextSize = keyof typeof TEXT_SIZES;
export const DEFAULT_TEXT_SIZE: TextSize = "default";
const CSS_BODY_PT = 9.4;

export const isTextSize = (v: unknown): v is TextSize =>
  typeof v === "string" && Object.hasOwn(TEXT_SIZES, v);

/** The `--text-scale` factor for a text size. */
export const textScale = (size: TextSize): number => +(TEXT_SIZES[size] / CSS_BODY_PT).toFixed(4);

/** The theme part of brand.json: what the Studio reads and writes. */
export interface BrandTheme {
  textSize: TextSize;
  cover: SurfaceConfig;
  body: SurfaceConfig;
}

/** A surface ready to render. */
export interface Surface {
  background: string;
  text: string;
  dark: boolean;
  logo: LogoVariant;
  radius: number;
  /** Null when the brand leaves it to report.css's automatic mix. */
  border: string | null;
  cards: BoxColors;
  /** Null when the brand leaves it to report.css. */
  muted: string | null;
  evidence: BoxColors;
}

export const DEFAULT_BACKGROUND = "#ffffff";
export const DEFAULT_TEXT = "#121212";
export const DEFAULT_RADIUS = 2;
export const MAX_RADIUS = 10;

export const isRadius = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_RADIUS;

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** WCAG relative luminance of a 6-digit hex color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Dark when white text would read better on it than black. */
export const isDark = (bg: string): boolean => contrast(bg, "#ffffff") > contrast(bg, "#000000");

/** Fills the gaps in a surface config. Assumes its colors are valid hex. */
export function resolveSurface(cfg: SurfaceConfig): Surface {
  const background = cfg.background ?? DEFAULT_BACKGROUND;
  const text = cfg.text ?? DEFAULT_TEXT;
  const dark = isDark(background);
  return {
    background,
    text,
    dark,
    logo: cfg.logo ?? (dark ? "logoOnDark" : "logo"),
    radius: cfg.radius ?? DEFAULT_RADIUS,
    border: cfg.border ?? null,
    cards: cfg.cards ?? {},
    muted: cfg.muted ?? null,
    evidence: cfg.evidence ?? {},
  };
}

/** `a` mixed into `b` by `pct` percent, as CSS color-mix(in srgb) does it. */
export function mix(a: string, b: string, pct: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) => Math.round(ch(a, i) * (pct / 100) + ch(b, i) * (1 - pct / 100)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * The border color report.css uses when a surface sets none, so the Studio
 * can show it. Mirrors --rule, and --c-rule on a dark cover.
 */
export function autoBorder(cfg: SurfaceConfig, part: SurfaceName): string {
  const background = cfg.background ?? DEFAULT_BACKGROUND;
  const pct = part === "cover" && isDark(background) ? 18 : 10;
  return mix(cfg.text ?? DEFAULT_TEXT, background, pct);
}

/** The secondary text color report.css uses when a surface sets none. */
export function autoMuted(cfg: SurfaceConfig, part: SurfaceName): string {
  const background = cfg.background ?? DEFAULT_BACKGROUND;
  const pct = part === "cover" && isDark(background) ? 74 : 70.5;
  return mix(cfg.text ?? DEFAULT_TEXT, background, pct);
}

/**
 * The lighter label shade of a `muted` color: as far below it as the default
 * faint grey sits below the default muted one.
 */
export const faintOf = (muted: string, background: string): string => mix(muted, background, 88);

/** The secondary and label shades of a card's own text color, on its background. */
export function cardShades(text: string, background: string): { muted: string; faint: string } {
  const muted = mix(text, background, 72);
  return { muted, faint: faintOf(muted, background) };
}

/** The card colors report.css uses for whatever a surface leaves unset. */
export function autoCards(cfg: SurfaceConfig, part: SurfaceName): Required<BoxColors> {
  const background = cfg.background ?? DEFAULT_BACKGROUND;
  const text = cfg.text ?? DEFAULT_TEXT;
  return {
    background: part === "cover" && isDark(background) ? mix(text, background, 6) : background,
    border: cfg.border ?? autoBorder(cfg, part),
    text,
  };
}

/** The evidence box colors report.css uses for whatever a body leaves unset. */
export function autoEvidence(cfg: SurfaceConfig): Required<BoxColors> {
  const card = { ...autoCards(cfg, "body"), ...cfg.cards };
  return {
    background: mix(card.text, card.background, 3.4),
    border: card.border,
    text: cfg.cards?.text
      ? cardShades(card.text, card.background).muted
      : (cfg.muted ?? autoMuted(cfg, "body")),
  };
}
