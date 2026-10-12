import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * White-label configuration: whose name, logo and colour go on the report.
 *
 * Lives in `brand/brand.json`, beside the logo files it names. `brand/` is
 * git-ignored so each user's identity stays out of the shared repo; the tracked
 * `brand.example/` is the template that `npm run setup` copies into place.
 * `BRAND_DIR` points at a different folder, for anyone running several brands
 * from one install.
 *
 * Read on every render rather than cached, so the Studio preview picks up an
 * edited logo or colour without a restart.
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
  /** For the dark cover. Without it, `logo` is knocked out to white. */
  logoOnDark?: string;
  colors?: { primary?: string };
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
  /** True when brand/ is missing and the example stands in for it. */
  isExample: boolean;
}

const DEFAULT_PRIMARY = "#293451";

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

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function loadBrand(): Brand {
  const isExample = !existsSync(join(BRAND_DIR, "brand.json"));
  const dir = isExample ? EXAMPLE_DIR : BRAND_DIR;
  const file = join(dir, "brand.json");

  let cfg: BrandConfig;
  try {
    cfg = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`Could not read brand config ${file}: ${(err as Error).message}`);
  }

  const problems: string[] = [];
  if (typeof cfg.name !== "string" || !cfg.name.trim()) problems.push("`name` is required");

  const primary = cfg.colors?.primary ?? DEFAULT_PRIMARY;
  if (!/^#[0-9a-f]{6}$/i.test(primary)) {
    problems.push("`colors.primary` must be a 6-digit hex colour, like #293451");
  }

  const logo = cfg.logo ? logoSrc(dir, cfg.logo, "logo", problems) : null;
  const logoOnDark = cfg.logoOnDark ? logoSrc(dir, cfg.logoOnDark, "logoOnDark", problems) : null;

  if (problems.length) throw invalid(file, problems);

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
    isExample,
  };
}
