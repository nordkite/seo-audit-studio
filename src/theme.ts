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

/** What a user writes under `cover` or `body` in brand.json. Every field is optional. */
export interface SurfaceConfig {
  background?: string;
  text?: string;
  /** Without it, chosen by how dark `background` is. */
  logo?: LogoVariant;
  /** Corner radius of cards and panels, in mm. 0 is square. */
  radius?: number;
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
  primary: string;
  textSize: TextSize;
  cover: SurfaceConfig;
  body: SurfaceConfig;
}

/** A surface ready to render. */
export interface Surface {
  background: string;
  text: string;
  /** The primary color where it reads on `background`, otherwise `text`. */
  accent: string;
  dark: boolean;
  logo: LogoVariant;
  radius: number;
}

export const DEFAULT_PRIMARY = "#293451";
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
export function resolveSurface(cfg: SurfaceConfig, primary: string): Surface {
  const background = cfg.background ?? DEFAULT_BACKGROUND;
  const text = cfg.text ?? DEFAULT_TEXT;
  const dark = isDark(background);
  return {
    background,
    text,
    // 3:1 is the WCAG floor for large text, which is what the accent sets.
    accent: contrast(primary, background) >= 3 ? primary : text,
    dark,
    logo: cfg.logo ?? (dark ? "logoOnDark" : "logo"),
    radius: cfg.radius ?? DEFAULT_RADIUS,
  };
}
