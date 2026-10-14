import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_PRIMARY,
  LOGO_VARIANTS,
  SURFACES,
  isHex,
  resolveSurface,
  type BrandTheme,
  type Surface,
  type SurfaceConfig,
} from "./theme.ts";

/**
 * White-label configuration: whose name, logo and color go on the report.
 *
 * Lives in `brand/brand.json`, beside the logo files it names. `brand/` is
 * git-ignored so each user's identity stays out of the shared repo; the tracked
 * `brand.example/` is the template that `npm run setup` copies into place.
 * `BRAND_DIR` points at a different folder, for anyone running several brands
 * from one install.
 *
 * Read on every render rather than cached, so the Studio preview picks up an
 * edited logo or color without a restart.
 */

const ROOT = join(import.meta.dirname, "..");
export const BRAND_DIR = resolve(ROOT, process.env.BRAND_DIR ?? "brand");
export const EXAMPLE_DIR = join(ROOT, "brand.example");

/** What a user writes in brand.json. */
export interface BrandConfig {
  name: string;
  website?: string;
  /** Defaults to the website's host name. */
  websiteLabel?: string;
  email?: string;
  phone?: string;
  /** For light surfaces. A path relative to the brand folder, or an https:// URL. */
  logo?: string;
  /** For dark surfaces. Without it, `logo` is knocked out to white. */
  logoOnDark?: string;
  colors?: { primary?: string };
  /**
   * A folder name under `fonts/`: the brand folder's own `fonts/` first, then
   * the shared library at the repo root. Without it, the system sans stack.
   */
  font?: string;
  /**
   * Background, text color and logo of the cover. The older shorthands still
   * work: "light" is the default, "brand" sets the cover on the primary color.
   */
  cover?: SurfaceConfig | LegacyCover;
  /** Background, text color and logo of the body pages. */
  body?: SurfaceConfig;
}

const LEGACY_COVERS = ["light", "brand"] as const;
type LegacyCover = (typeof LEGACY_COVERS)[number];

/** A typeface ready to inline: `@font-face` rules with the files as data URIs. */
export interface BrandFont {
  family: string;
  css: string;
}

/** `fonts/<name>/font.json`. */
interface FontManifest {
  family: string;
  license?: string;
  source?: string;
  faces: { file: string; weight?: string; style?: string; unicodeRange?: string }[];
}

/** What the renderer gets: resolved, validated, logo ready to embed. */
export interface Brand {
  name: string;
  website: string | null;
  websiteLabel: string;
  email: string | null;
  phone: string | null;
  /** An <img> src: a data URI for local files, the URL as-is for remote ones. */
  logo: string | null;
  logoOnDark: string | null;
  primary: string;
  font: BrandFont | null;
  cover: Surface;
  body: Surface;
  /** True when brand/ is missing and the example stands in for it. */
  isExample: boolean;
}

const MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function invalid(file: string, problems: string[]): Error {
  return new Error(`Invalid brand config ${file}:\n${problems.map((p) => `  · ${p}`).join("\n")}`);
}

/**
 * Local logos are inlined as data URIs. pdf.ts loads HTML through
 * setContent(), which has no base URL, so a relative src would resolve to
 * nothing and Chrome would drop the image without an error.
 */
function logoSrc(dir: string, ref: string, field: string, problems: string[]): string | null {
  if (/^https?:\/\//i.test(ref)) return ref;

  const ext = ref.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) {
    problems.push(`\`${field}\`: unsupported type ".${ext}". Use ${Object.keys(MIME).join(", ")}`);
    return null;
  }
  const file = resolve(dir, ref);
  if (!existsSync(file)) {
    problems.push(`\`${field}\`: file not found: ${file}`);
    return null;
  }
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

const FONT_TYPES: Record<string, { mime: string; format: string }> = {
  woff2: { mime: "font/woff2", format: "woff2" },
  woff: { mime: "font/woff", format: "woff" },
  ttf: { mime: "font/ttf", format: "truetype" },
  otf: { mime: "font/otf", format: "opentype" },
};

/**
 * Font files are inlined for the same reason logos are: setContent() has no
 * base URL, so a relative url() in @font-face would load nothing and Chrome
 * would fall back to the next family without an error.
 */
function loadFont(brandDir: string, name: string, problems: string[]): BrandFont | null {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
    problems.push("`font` must be a folder name under fonts/, like \"manrope\"");
    return null;
  }
  const dir = [join(brandDir, "fonts", name), join(ROOT, "fonts", name)].find((d) =>
    existsSync(join(d, "font.json"))
  );
  if (!dir) {
    problems.push(
      `\`font\`: no fonts/${name}/font.json in ${brandDir} or ${ROOT}. See fonts/README.md`
    );
    return null;
  }

  const manifestFile = join(dir, "font.json");
  let manifest: FontManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  } catch (err) {
    problems.push(`\`font\`: could not read ${manifestFile}: ${(err as Error).message}`);
    return null;
  }
  if (typeof manifest.family !== "string" || !manifest.family.trim()) {
    problems.push(`${manifestFile}: \`family\` is required`);
    return null;
  }
  if (!Array.isArray(manifest.faces) || !manifest.faces.length) {
    problems.push(`${manifestFile}: \`faces\` must list at least one font file`);
    return null;
  }

  const family = manifest.family.trim().replace(/["\\]/g, "");
  const rules: string[] = [];
  for (const face of manifest.faces) {
    const ext = face.file?.split(".").pop()?.toLowerCase() ?? "";
    const type = FONT_TYPES[ext];
    const file = resolve(dir, face.file ?? "");
    if (!type) {
      problems.push(`${manifestFile}: "${face.file}" is not ${Object.keys(FONT_TYPES).join(", ")}`);
      continue;
    }
    if (!existsSync(file)) {
      problems.push(`${manifestFile}: file not found: ${file}`);
      continue;
    }
    const data = readFileSync(file).toString("base64");
    rules.push(
      [
        "@font-face {",
        `  font-family: "${family}";`,
        `  font-style: ${face.style ?? "normal"};`,
        `  font-weight: ${face.weight ?? "400"};`,
        `  src: url(data:${type.mime};base64,${data}) format("${type.format}");`,
        face.unicodeRange ? `  unicode-range: ${face.unicodeRange};` : "",
        "}",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return { family, css: rules.join("\n") };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Where brand.json is read from: brand/, or the example when there is none. */
export function brandSource(): { dir: string; file: string; isExample: boolean } {
  const isExample = !existsSync(join(BRAND_DIR, "brand.json"));
  const dir = isExample ? EXAMPLE_DIR : BRAND_DIR;
  return { dir, file: join(dir, "brand.json"), isExample };
}

export function readBrandConfig(file: string): BrandConfig {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`Could not read brand config ${file}: ${(err as Error).message}`);
  }
}

/** A surface's config with the legacy cover shorthands spelled out. */
function surfaceConfig(raw: unknown, primary: string): SurfaceConfig {
  if (raw === "brand") return { background: primary, text: "#ffffff" };
  if (raw === undefined || raw === "light") return {};
  return raw as SurfaceConfig;
}

/** The theme part of a config, as the Studio edits it. */
export function themeOf(cfg: BrandConfig): BrandTheme {
  const primary = cfg.colors?.primary ?? DEFAULT_PRIMARY;
  return {
    primary,
    cover: surfaceConfig(cfg.cover, primary),
    body: surfaceConfig(cfg.body, primary),
  };
}

/** A config with its theme replaced, every other field left as it was. */
export function withTheme(cfg: BrandConfig, theme: BrandTheme): BrandConfig {
  const clean = (s: SurfaceConfig): SurfaceConfig =>
    Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== ""));
  return {
    ...cfg,
    colors: { ...cfg.colors, primary: theme.primary },
    cover: clean(theme.cover),
    body: clean(theme.body),
  };
}

function checkSurface(raw: unknown, field: string, problems: string[]): void {
  if (raw === undefined) return;
  if (field === "cover" && LEGACY_COVERS.includes(raw as LegacyCover)) return;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    const legacy = field === "cover" ? `, or one of ${LEGACY_COVERS.map((c) => `"${c}"`).join(", ")}` : "";
    problems.push(`\`${field}\` must be an object like { "background": "#ffffff", "text": "#121212" }${legacy}`);
    return;
  }
  const s = raw as Record<string, unknown>;
  for (const key of ["background", "text"]) {
    if (s[key] !== undefined && !isHex(s[key])) {
      problems.push(`\`${field}.${key}\` must be a 6-digit hex color, like #ffffff`);
    }
  }
  if (s.logo !== undefined && !LOGO_VARIANTS.includes(s.logo as never)) {
    problems.push(`\`${field}.logo\` must be one of ${LOGO_VARIANTS.map((v) => `"${v}"`).join(", ")}`);
  }
}

export function loadBrand(): Brand {
  const { dir, file, isExample } = brandSource();
  return resolveBrand(readBrandConfig(file), dir, { file, isExample });
}

/**
 * Validates a config and resolves it for the renderer. Separate from
 * loadBrand() so the Studio can check an edited config before writing it, and
 * preview one it has not written yet.
 */
export function resolveBrand(
  cfg: BrandConfig,
  dir: string,
  { file = join(dir, "brand.json"), isExample = false } = {}
): Brand {
  const problems: string[] = [];
  if (typeof cfg.name !== "string" || !cfg.name.trim()) problems.push("`name` is required");

  const primary = cfg.colors?.primary ?? DEFAULT_PRIMARY;
  if (!isHex(primary)) {
    problems.push("`colors.primary` must be a 6-digit hex color, like #293451");
  }

  const logo = cfg.logo ? logoSrc(dir, cfg.logo, "logo", problems) : null;
  const logoOnDark = cfg.logoOnDark ? logoSrc(dir, cfg.logoOnDark, "logoOnDark", problems) : null;

  for (const name of SURFACES) checkSurface(cfg[name], name, problems);

  const font = cfg.font ? loadFont(dir, cfg.font, problems) : null;

  if (problems.length) throw invalid(file, problems);

  const theme = themeOf(cfg);
  const website = cfg.website?.trim() || null;
  return {
    name: cfg.name.trim(),
    website,
    websiteLabel: cfg.websiteLabel?.trim() || (website ? hostOf(website) : cfg.name.trim()),
    email: cfg.email?.trim() || null,
    phone: cfg.phone?.trim() || null,
    logo,
    logoOnDark,
    primary,
    font,
    cover: resolveSurface(theme.cover, primary),
    body: resolveSurface(theme.body, primary),
    isExample,
  };
}
