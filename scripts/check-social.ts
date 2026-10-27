#!/usr/bin/env node
/**
 * Checks the social-sharing tags (Open Graph + X/Twitter Card) on every URL in
 * a site's sitemap.
 *
 *   npm run check-social -- https://example.com            human-readable
 *   npm run check-social -- https://example.com --json     used by /new-audit
 *   npm run check-social -- https://example.com/page --page --json
 *                                       that URL only, used by /new-page-audit
 *   npm run check-social -- https://example.com --langs et,ru --json
 *                    only those language versions (see site-languages.ts)
 *
 * Why this exists: claude-seo's full audit (through 2.5.0) has no social-tag
 * check at all, and seo-page lists the tags on one page without checking that
 * the share image works. A deterministic check here covers every sitemap URL.
 * Drop it once claude-seo's audit checks social tags and share images.
 *
 * Pages are fetched as Twitterbot, so the result is what X's crawler sees.
 * Node built-ins only, like doctor.ts.
 */

import { detectLanguages, pick, sitemapUrls, urlsIn } from "./site-languages.ts";

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
  /** The language versions checked, when limited with --langs. */
  languages?: string[];
  urls: string[];
  issues: Issue[];
  images: ImageCheck[];
}

const UA = "Twitterbot/1.0";
const CONCURRENCY = 5;
const TIMEOUT_MS = 30_000;

// X's documented formats for card images. SVG is not supported.
const X_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// Required on every page. X falls back to og:title, og:description and
// og:image when the twitter: ones are missing, but has no fallback for
// twitter:card: without it a link gets the small summary card.
const REQUIRED = ["og:title", "og:description", "og:image", "og:url", "twitter:card"];

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

/**
 * `pageOnly` checks just `siteUrl` instead of every sitemap URL. `langs`
 * keeps the sitemap URLs to those language versions.
 */
export async function checkSocial(siteUrl: string, pageOnly = false, langs?: string[]): Promise<SocialResult> {
  const origin = new URL(siteUrl).origin;
  // Sitemaps are read with an ordinary user agent: some sites refuse them to
  // Twitterbot, and only the pages need to be seen the way X sees them.
  const inLangs = async (l: string[]) => {
    const site = await detectLanguages(siteUrl);
    return urlsIn(site, pick(site, l));
  };
  const urls = pageOnly ? [] : langs ? await inLangs(langs) : await sitemapUrls(origin);
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
    ...(langs ? { languages: langs } : {}),
    urls,
    issues: [...issues.values()],
    images,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const pageOnly = args.includes("--page");
  const i = args.indexOf("--langs");
  const langs = i >= 0 ? args[i + 1]?.split(",") : undefined;
  const site = args.find((a, n) => !a.startsWith("--") && (i < 0 || n !== i + 1));
  if (!site) {
    console.error("usage: npm run check-social -- <url> [--page] [--langs et,ru] [--json]");
    process.exit(2);
  }

  const result = await checkSocial(site, pageOnly, langs);

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
  // Not process.exit(): on macOS a pipe is written asynchronously, and exiting
  // here cuts the JSON off at 64 KB.
  process.exitCode = result.issues.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
