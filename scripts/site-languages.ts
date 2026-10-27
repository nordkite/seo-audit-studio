#!/usr/bin/env node
/**
 * Finds a site's language versions and keeps an audit to the ones chosen.
 *
 *   node scripts/site-languages.ts https://example.com              the versions
 *   node scripts/site-languages.ts https://example.com --langs et,ru --json
 *                         + the sitemap URLs inside those versions, used by /new-audit
 *   node scripts/site-languages.ts https://example.com --langs et,ru \
 *     --gsc-pages pages.json --gsc-queries query-page.json --json
 *                         + Search Console totals for those versions only
 *
 * Versions come from the homepage's hreflang alternates (HTML <link> and the
 * HTTP Link header). The homepage's own language is whichever alternate points
 * back at it, or its <html lang> when none does, so the root is never assumed
 * to be any particular language.
 *
 * A URL belongs to the version with the longest root that contains it. That is
 * what makes a root-path version work: with Estonian at / and Russian at /ru/,
 * /ru/kontakt is Russian and /kontakt is Estonian, although / contains both.
 *
 * Node built-ins only, like doctor.ts.
 */

export interface LanguageVersion {
  /** hreflang codes served at this root, lowercased. The first is its id. */
  langs: string[];
  root: string;
  /** Served at the URL the audit starts from. */
  isRoot: boolean;
  /** Not in hreflang: the homepage's own language, read from <html lang>. */
  inferred?: boolean;
}

export interface SiteLanguages {
  url: string;
  /** Where the URL landed after redirects. */
  home: string;
  /** The homepage's language, or null when nothing declares one. */
  rootLang: string | null;
  source: "hreflang" | "html-lang" | "none";
  versions: LanguageVersion[];
  /** Set when versions cannot be told apart by URL, so no subset can be audited. */
  unsupported?: string;
}

const UA = "Mozilla/5.0 (compatible; SEO audit)";
const TIMEOUT_MS = 30_000;
const MAX_PAGES = 500;

export async function get(url: string, ua = UA): Promise<Response> {
  return fetch(url, { redirect: "follow", headers: { "User-Agent": ua }, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** Same page whatever the trailing slash or fragment. */
function norm(u: string): string {
  const url = new URL(u);
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

/** [hreflang, absolute href] pairs from <link> tags and the Link header. */
function alternates(html: string, linkHeader: string | null, base: string): [string, string][] {
  const out: [string, string][] = [];
  const head = html.split(/<\/head>/i)[0];
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(tag);
    if (a.rel?.toLowerCase().split(/\s+/).includes("alternate") && a.hreflang && a.href) out.push([a.hreflang, a.href]);
  }
  for (const m of (linkHeader ?? "").matchAll(/<([^>]+)>([^,]*)/g)) {
    const a = attrs(m[2]);
    if (a.rel?.toLowerCase() === "alternate" && a.hreflang) out.push([a.hreflang, m[1]]);
  }
  return out.flatMap(([lang, href]) => {
    try {
      return [[lang.trim().toLowerCase(), new URL(href, base).href] as [string, string]];
    } catch {
      return [];
    }
  });
}

export async function detectLanguages(raw: string): Promise<SiteLanguages> {
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).href;
  const res = await get(url);
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  const home = res.url || url;
  const html = await res.text();
  const htmlLang = attrs(html.match(/<html\b[^>]*>/i)?.[0] ?? "").lang?.trim().toLowerCase() || null;

  const byRoot = new Map<string, string[]>();
  for (const [lang, href] of alternates(html, res.headers.get("link"), home)) {
    if (lang === "x-default") continue; // a fallback, not a language
    const root = norm(href);
    const langs = byRoot.get(root) ?? [];
    if (!langs.includes(lang)) langs.push(lang);
    byRoot.set(root, langs);
  }

  const homeKey = norm(home);
  const versions: LanguageVersion[] = [...byRoot].map(([root, langs]) => ({ langs, root, isRoot: root === homeKey }));
  // The homepage left out of its own hreflang set still serves a language, and
  // every URL under it that no other root claims is in that language. With no
  // hreflang at all, that is the whole host.
  if (!versions.some((v) => v.isRoot) && (versions.length || htmlLang)) {
    const root = versions.length ? homeKey : `${new URL(home).origin}/`;
    versions.unshift({ langs: [htmlLang ?? "unknown"], root, isRoot: true, inferred: true });
  }
  versions.sort((a, b) => Number(b.isRoot) - Number(a.isRoot) || a.langs[0].localeCompare(b.langs[0]));

  const site: SiteLanguages = {
    url,
    home,
    rootLang: versions.find((v) => v.isRoot)?.langs[0] ?? htmlLang,
    source: byRoot.size ? "hreflang" : htmlLang ? "html-lang" : "none",
    versions,
  };
  if (versions.some((v) => new URL(v.root).search)) {
    site.unsupported = "Language versions differ by query parameter, not by path or host, so they cannot be audited separately.";
  }
  return site;
}

/** The version a URL belongs to: the longest root containing it, or null. */
export function versionOf(url: string, versions: LanguageVersion[]): LanguageVersion | null {
  let u: URL;
  try {
    u = new URL(norm(url));
  } catch {
    return null;
  }
  let best: LanguageVersion | null = null;
  let bestLen = -1;
  for (const v of versions) {
    const r = new URL(v.root);
    if (r.host !== u.host) continue;
    const base = r.pathname.replace(/\/+$/, "");
    if (u.pathname !== r.pathname && u.pathname !== base && !u.pathname.startsWith(`${base}/`)) continue;
    if (base.length > bestLen) {
      best = v;
      bestLen = base.length;
    }
  }
  return best;
}

/** `de` names `de-de` and `de-at` too; `de-at` names only itself. */
const names = (code: string, v: LanguageVersion) =>
  v.langs.some((l) => l === code || (!code.includes("-") && l.split("-")[0] === code));

/** The versions named by `langs`. Throws on a code the site does not have. */
export function pick(site: SiteLanguages, langs: string[]): LanguageVersion[] {
  if (site.unsupported) throw new Error(site.unsupported);
  const wanted = langs.map((l) => l.trim().toLowerCase()).filter(Boolean);
  const unknown = wanted.filter((l) => !site.versions.some((v) => names(l, v)));
  if (unknown.length) {
    const have = site.versions.map((v) => v.langs[0]).join(", ") || "none";
    throw new Error(`No language version ${unknown.join(", ")} on ${site.home} (found: ${have})`);
  }
  return site.versions.filter((v) => wanted.some((l) => names(l, v)));
}

/**
 * Sitemap URLs: robots.txt Sitemap: lines first, then the usual locations.
 * `keep` filters before the page cap, so a cap of 500 means 500 kept pages
 * even when most of the sitemap is other languages.
 */
export async function sitemapUrls(
  origin: string,
  keep: (url: string) => boolean = () => true,
  ua = UA,
  max = MAX_PAGES
): Promise<string[]> {
  const seeds: string[] = [];
  try {
    const robots = await (await get(`${origin}/robots.txt`, ua)).text();
    for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) seeds.push(m[1]);
  } catch {}
  if (!seeds.length) seeds.push(`${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`);

  const pages = new Set<string>();
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length && pages.size < max) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    let xml;
    try {
      const res = await get(sm, ua);
      if (!res.ok) continue;
      xml = await res.text();
    } catch {
      continue;
    }
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else for (const l of locs) if (pages.size < max && !pages.has(l) && keep(l)) pages.add(l);
  }
  return [...pages];
}

/**
 * Sitemap URLs inside the chosen versions, from every host they live on. Each
 * version gets an equal share of the page cap, so a large one listed first in
 * the sitemap cannot crowd out the rest.
 */
export async function urlsIn(site: SiteLanguages, chosen: LanguageVersion[], ua = UA): Promise<string[]> {
  const quota = Math.floor(MAX_PAGES / Math.max(1, chosen.length));
  const taken = new Map<LanguageVersion, number>(chosen.map((v) => [v, 0]));
  const keep = (u: string) => {
    const v = versionOf(u, site.versions);
    if (!v || !taken.has(v) || taken.get(v)! >= quota) return false;
    taken.set(v, taken.get(v)! + 1);
    return true;
  };
  const origins = [...new Set(chosen.map((v) => new URL(v.root).origin))];
  const urls = new Set<string>(chosen.map((v) => v.root));
  for (const origin of origins) {
    for (const u of await sitemapUrls(origin, keep, ua, quota * chosen.length)) urls.add(norm(u));
  }
  return [...urls];
}

interface GscRow {
  page?: string;
  query?: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface GscTotals {
  clicks: number;
  impressions: number;
  /** A fraction, like the report's `ctr`. */
  ctr: number;
  /** Impression-weighted over the matched pages. */
  position: number;
  pages: number;
  topQueries?: { query: string; clicks: number; impressions: number; position: number }[];
}

/**
 * Search Console totals for the chosen versions, from claude-seo's gsc_query.py
 * JSON. gsc_query.py cannot filter by page, so it is asked for every page and
 * this keeps the chosen ones. The sums are by page: a query that shows two of
 * the site's pages counts twice, which property-wide totals do not.
 */
export function gscTotals(
  site: SiteLanguages,
  chosen: LanguageVersion[],
  pages: { rows: GscRow[] },
  queries?: { rows: GscRow[] }
): GscTotals {
  const inChosen = (u?: string) => {
    const v = u ? versionOf(u, site.versions) : null;
    return v !== null && chosen.includes(v);
  };
  const rows = pages.rows.filter((r) => inChosen(r.page));
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const weighted = rows.reduce((n, r) => n + r.position * r.impressions, 0);
  const totals: GscTotals = {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weighted / impressions : 0,
    pages: rows.length,
  };
  if (queries) {
    const by = new Map<string, { clicks: number; impressions: number; weighted: number }>();
    for (const r of queries.rows) {
      if (!r.query || !inChosen(r.page)) continue;
      const q = by.get(r.query) ?? { clicks: 0, impressions: 0, weighted: 0 };
      q.clicks += r.clicks;
      q.impressions += r.impressions;
      q.weighted += r.position * r.impressions;
      by.set(r.query, q);
    }
    totals.topQueries = [...by]
      .map(([query, q]) => ({
        query,
        clicks: q.clicks,
        impressions: q.impressions,
        position: q.impressions ? q.weighted / q.impressions : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 10);
  }
  return totals;
}

async function main() {
  const { readFileSync } = await import("node:fs");
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const json = args.includes("--json");
  const langs = flag("--langs")?.split(",");
  const valued = ["--langs", "--gsc-pages", "--gsc-queries"];
  const site = args.find((a, i) => !a.startsWith("--") && !valued.includes(args[i - 1]));
  if (!site) {
    console.error("usage: node scripts/site-languages.ts <url> [--langs et,ru] [--gsc-pages f] [--gsc-queries f] [--json]");
    process.exit(2);
  }

  try {
    const found = await detectLanguages(site);
    const out: Record<string, unknown> = { ...found };
    if (langs) {
      const chosen = pick(found, langs);
      const urls = await urlsIn(found, chosen);
      Object.assign(out, {
        selected: chosen.map((v) => v.langs[0]),
        excluded: found.versions.filter((v) => !chosen.includes(v)).map((v) => v.langs[0]),
        urls,
      });
      const pagesFile = flag("--gsc-pages");
      if (pagesFile) {
        const queriesFile = flag("--gsc-queries");
        const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
        out.searchConsole = gscTotals(found, chosen, read(pagesFile), queriesFile ? read(queriesFile) : undefined);
      }
    }

    if (json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`Language versions of ${found.home} (from ${found.source}), root language: ${found.rootLang ?? "unknown"}\n`);
      for (const v of found.versions) {
        const mark = Array.isArray(out.selected) ? ((out.selected as string[]).includes(v.langs[0]) ? "✓" : "·") : " ";
        console.log(`  ${mark} ${v.langs.join(", ").padEnd(12)} ${v.root}${v.isRoot ? "  (root)" : ""}${v.inferred ? "  (from <html lang>)" : ""}`);
      }
      if (found.unsupported) console.log(`\n  ${found.unsupported}`);
      if (Array.isArray(out.urls)) console.log(`\n  ${out.urls.length} sitemap URLs in the selected versions`);
    }
  } catch (e) {
    if (json) console.log(JSON.stringify({ error: (e as Error).message }));
    else console.error((e as Error).message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
