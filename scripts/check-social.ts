#!/usr/bin/env node
/**
 * Checks the social-sharing tags (Open Graph + X/Twitter Card) on every URL in
 * a site's sitemap.
 *
 *   npm run check-social -- https://example.com            human-readable
 *   npm run check-social -- https://example.com --json     used by /new-audit
 *
 * Why this exists: claude-seo 2.4.2 does not check twitter:image (its seo-page
 * checklist stops at card/title/description, and the full audit has no social
 * check at all). In practice X shows a link with no picture when twitter:image
 * is missing, even if og:image is set. A deterministic check here means the gap
 * cannot slip through an audit again. Drop it once claude-seo covers it.
 *
 * Pages are fetched as Twitterbot, so the result is what X's crawler sees.
 * Node built-ins only, like doctor.ts.
 */

interface Issue {
  id: string;
  message: string;
  urls: string[];
}

type Page = { url: string; error: string; tags?: never } | { url: string; tags: [string, string][]; error?: never };

interface ImageCheck {
  url: string;
  status?: number;
  type?: string;
  bytes?: number | null;
  problem?: string;
}

export interface SocialResult {
  site: string;
  userAgent: string;
  pagesChecked: number;
  urls: string[];
  issues: Issue[];
  images: ImageCheck[];
}

const UA = "Twitterbot/1.0";
const MAX_PAGES = 500;
const CONCURRENCY = 5;
const TIMEOUT_MS = 30_000;

// X's documented formats for card images. SVG is not supported.
const X_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// Required on every page. twitter:image is the one claude-seo misses.
const REQUIRED = [
  "og:title",
  "og:description",
  "og:image",
  "og:url",
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:image",
];

// Tags that must appear at most once. og:image and og:locale:alternate may
// legitimately repeat (Open Graph arrays), so they are not listed.
const SINGLE = [
  "og:title",
  "og:description",
  "og:url",
  "og:type",
  "og:site_name",
  "og:locale",
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:image",
];

async function get(url: string, method = "GET"): Promise<Response> {
  const res = await fetch(url, {
    method,
    redirect: "follow",
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** All <meta property|name=… content=…> pairs, in document order. */
function metaTags(html: string): [string, string][] {
  const head = html.split(/<\/head>/i)[0];
  const tags: [string, string][] = [];
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
    }
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key.startsWith("og:") || key.startsWith("twitter:")) tags.push([key, attrs.content ?? ""]);
  }
  return tags;
}

/** Sitemap URLs: robots.txt Sitemap: lines first, then the usual locations. */
async function sitemapUrls(origin: string): Promise<string[]> {
  const seeds: string[] = [];
  try {
    const robots = await (await get(`${origin}/robots.txt`)).text();
    for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) seeds.push(m[1]);
  } catch {}
  if (!seeds.length) seeds.push(`${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`);

  const pages = new Set<string>();
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length && pages.size < MAX_PAGES) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    let xml;
    try {
      const res = await get(sm);
      if (!res.ok) continue;
      xml = await res.text();
    } catch {
      continue;
    }
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else for (const l of locs) if (pages.size < MAX_PAGES) pages.add(l);
  }
  return [...pages];
}

async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

async function checkPage(url: string): Promise<Page> {
  try {
    const res = await get(url);
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    return { url, tags: metaTags(await res.text()) };
  } catch (err) {
    return { url, error: (err as Error).message };
  }
}

async function checkImage(url: string): Promise<ImageCheck> {
  if (!/^https?:\/\//i.test(url)) return { url, problem: "not an absolute URL" };
  try {
    let res = await get(url, "HEAD");
    if (res.status === 405 || res.status === 403) res = await get(url);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const bytes = Number(res.headers.get("content-length")) || null;
    const info = { url, status: res.status, type, bytes };
    if (!res.ok) return { ...info, problem: `HTTP ${res.status}` };
    if (!X_IMAGE_TYPES.includes(type)) return { ...info, problem: `type ${type || "unknown"} is not supported by X` };
    if (bytes && bytes > X_IMAGE_MAX_BYTES) return { ...info, problem: "larger than X's 5 MB limit" };
    return info;
  } catch (err) {
    return { url, problem: (err as Error).message };
  }
}

export async function checkSocial(siteUrl: string): Promise<SocialResult> {
  const origin = new URL(siteUrl).origin;
  const urls = await sitemapUrls(origin);
  if (!urls.length) urls.push(new URL(siteUrl).href);

  const pages = await pool(urls, checkPage);
  const issues = new Map<string, Issue>();
  const add = (id: string, message: string, url: string, detail?: string) => {
    if (!issues.has(id)) issues.set(id, { id, message, urls: [] });
    issues.get(id)!.urls.push(detail ? `${url} — ${detail}` : url);
  };

  const imageUrls = new Map<string, string[]>(); // image URL → pages using it
  for (const p of pages) {
    if (p.tags === undefined) {
      add("fetch-failed", "Page could not be fetched as Twitterbot", p.url, p.error);
      continue;
    }
    const by = new Map<string, string[]>();
    for (const [k, v] of p.tags) by.set(k, [...(by.get(k) ?? []), v]);

    for (const k of REQUIRED) {
      if (!(by.get(k) ?? []).some((v) => v.trim())) add(`missing-${k.replace(":", "-")}`, `Missing ${k}`, p.url);
    }
    for (const k of SINGLE) {
      const vals = by.get(k) ?? [];
      if (vals.length > 1) {
        add(`duplicate-${k.replace(":", "-")}`, `${k} appears more than once`, p.url, vals.map((v) => JSON.stringify(v)).join(" vs "));
      }
    }
    for (const k of ["og:image", "twitter:image"]) {
      for (const v of by.get(k) ?? []) {
        // Kept as written: a relative URL is itself a problem, reported by checkImage.
        if (v.trim()) imageUrls.set(v, [...(imageUrls.get(v) ?? []), p.url]);
      }
    }
  }

  const images = await pool([...imageUrls.keys()], checkImage);
  for (const img of images) {
    if (img.problem) {
      for (const page of imageUrls.get(img.url) ?? []) add("image-broken", "Share image does not work for X", page, `${img.url}: ${img.problem}`);
    }
  }

  return {
    site: origin,
    userAgent: UA,
    pagesChecked: pages.length,
    urls,
    issues: [...issues.values()],
    images,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const site = args.find((a) => !a.startsWith("--"));
  if (!site) {
    console.error("usage: npm run check-social -- <site-url> [--json]");
    process.exit(2);
  }

  const result = await checkSocial(site);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Social tags on ${result.site} — ${result.pagesChecked} pages, fetched as ${result.userAgent}\n`);
    if (!result.issues.length) console.log("  ✓ all required tags present, no duplicates, images load");
    for (const issue of result.issues) {
      console.log(`  ✗ ${issue.message} (${issue.urls.length}/${result.pagesChecked})`);
      for (const u of issue.urls) console.log(`      ${u}`);
    }
  }
  process.exit(result.issues.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
