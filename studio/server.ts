#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { renderBody, renderCover } from "../src/render.ts";
import { brandSource, readBrandConfig, resolveBrand, themeOf, withTheme } from "../src/brand.ts";
import type { BrandTheme } from "../src/theme.ts";
import { SUPPORTED_LANGS, isLang } from "../src/i18n.ts";
import type { Lang, Report } from "../src/types.ts";
import {
  ROOT,
  assertSlug,
  httpError,
  listReports,
  readReport,
  writeReport,
  reportExists,
  skeleton,
} from "./lib/store.ts";
import { listModels, translateReport } from "./lib/translate/index.ts";
import { cancelAudit, killChild, listJobs, preflight, startAudit } from "./lib/audit.ts";
import { DEFAULT_MODEL } from "./lib/translate/anthropic.ts";
import type { BrandDoc, Health } from "./lib/types.ts";

const PORT = Number(process.env.STUDIO_PORT ?? 4321);
const DIST = join(ROOT, "studio", "client", "dist");
const MAX_BODY = 64 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const json = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

const fail = (res: ServerResponse, err: Error & { status?: number }) =>
  json(res, err.status ?? 500, { error: err.message ?? String(err) });

function readBody(req: IncomingMessage, opts: { asBuffer: true }): Promise<Buffer>;
function readBody(req: IncomingMessage): Promise<any>;
function readBody(req: IncomingMessage, { asBuffer = false } = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(httpError(413, "Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      if (asBuffer) return resolve(buf);
      try {
        resolve(buf.length ? JSON.parse(buf.toString("utf8")) : {});
      } catch (e) {
        reject(httpError(400, `Malformed JSON: ${(e as Error).message}`));
      }
    });
    req.on("error", reject);
  });
}

const assertLang = (lang: unknown): Lang => {
  if (!isLang(lang)) throw httpError(400, `Unsupported language: ${lang}`);
  return lang;
};

/* ---------------------------------------------------------------- static -- */

function serveStatic(res: ServerResponse, pathname: string) {
  if (!existsSync(DIST)) {
    res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<pre style="font:14px ui-monospace,monospace;padding:2rem;line-height:1.6">` +
        `SEO Audit Studio has not been built yet.\n\n` +
        `  npm run studio:build\n\n` +
        `Or run the dev server with hot reload:\n\n  npm run studio:dev\n</pre>`
    );
    return;
  }

  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = join(DIST, rel);

  // Vite emits hashed asset names, so anything that is not a real file is a
  // client-side route — hand it index.html and let the SPA router decide.
  const target = file.startsWith(DIST) && existsSync(file) && extname(file)
    ? file
    : join(DIST, "index.html");

  res.writeHead(200, { "Content-Type": MIME[extname(target)] ?? "application/octet-stream" });
  res.end(readFileSync(target));
}

/* ------------------------------------------------------------- translate -- */

/**
 * Translate a report into one language.
 *
 * A plain request/response, not a stream. The work is one model call per batch
 * of a few thousand characters, so there is no long-running progress to
 * report — and an EventSource could carry neither a request body nor an
 * Authorization header, which is where the API key has to travel.
 *
 * The key is read off the request and handed straight to the provider. It is
 * never logged, never written to disk, and never echoed back.
 */
async function translate(req: IncomingMessage, res: ServerResponse, slug: string, lang: string) {
  assertSlug(slug);

  const { provider, apiKey, model, effort, scope } = await readBody(req);

  // The client hangs up if the user closes the dialog; stop the work with it.
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const result = await translateReport(slug, assertLang(lang), {
    provider,
    apiKey,
    model,
    effort,
    scope,
    signal: controller.signal,
  });

  return json(res, 200, result);
}

/* ----------------------------------------------------------------- brand -- */

function brandDoc(): BrandDoc {
  const { file, isExample } = brandSource();
  const cfg = readBrandConfig(file);
  return {
    theme: themeOf(cfg),
    hasLogo: Boolean(cfg.logo),
    hasLogoOnDark: Boolean(cfg.logoOnDark),
    isExample,
    file,
  };
}

/**
 * brand.json with an edited theme in place of its own, validated. Throws a 400
 * listing the problems rather than letting a bad colour reach the renderer.
 */
function brandWith(theme: BrandTheme) {
  const { dir, file, isExample } = brandSource();
  const cfg = withTheme(readBrandConfig(file), theme);
  try {
    return { cfg, brand: resolveBrand(cfg, dir, { file, isExample }), file, isExample };
  } catch (err) {
    throw httpError(400, (err as Error).message);
  }
}

/**
 * Only the theme is written; every other field in brand.json is carried over
 * untouched. Refused while the example stands in for brand/, which would
 * otherwise rewrite the tracked template.
 */
function saveBrandTheme(theme: BrandTheme): BrandDoc {
  const { cfg, file, isExample } = brandWith(theme);
  if (isExample) throw httpError(409, "No brand/brand.json yet. Run `npm run setup` first.");
  writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
  return brandDoc();
}

/* ---------------------------------------------------------------- routes -- */

async function route(req: IncomingMessage, res: ServerResponse, url: URL) {
  const p = url.pathname;
  const seg = p.split("/").filter(Boolean); // ["api", "report", "example-com--home"]

  if (p === "/api/health") {
    const health: Health = {
      ok: true,
      langs: [...SUPPORTED_LANGS],
      defaultModel: DEFAULT_MODEL,
      // Only whether a key is present, never the key. A key set in the server's
      // environment is a convenience for single-user local work; the UI still
      // lets you supply your own per request.
      hasEnvKey: Boolean(process.env.ANTHROPIC_API_KEY),
    };
    return json(res, 200, health);
  }

  // POST so the API key travels in the body, as it does for translate.
  if (p === "/api/models" && req.method === "POST") {
    const { provider = "cli", apiKey } = await readBody(req);
    return json(res, 200, await listModels(provider, apiKey));
  }

  if (p === "/api/brand" && req.method === "GET") return json(res, 200, brandDoc());
  if (p === "/api/brand" && req.method === "PUT") {
    const { theme } = await readBody(req);
    if (!theme) throw httpError(400, "Missing `theme`");
    return json(res, 200, saveBrandTheme(theme));
  }

  if (p === "/api/reports" && req.method === "GET") {
    return json(res, 200, { reports: listReports() });
  }

  if (p === "/api/reports" && req.method === "POST") {
    const { slug, site, clientName, siteUrl } = await readBody(req);
    assertSlug(slug);
    if (!site || !clientName) throw httpError(400, "site and clientName are required");
    if (reportExists(slug)) throw httpError(409, `Report "${slug}" already exists`);
    return json(res, 201, writeReport(slug, skeleton({ slug, site, clientName, siteUrl })));
  }

  if (p === "/api/audits/preflight" && req.method === "GET") return json(res, 200, await preflight());
  if (p === "/api/audits" && req.method === "GET") return json(res, 200, { jobs: listJobs() });
  if (p === "/api/audits" && req.method === "POST") {
    return json(res, 202, await startAudit(await readBody(req)));
  }
  if (seg[0] === "api" && seg[1] === "audits" && seg[2] && req.method === "DELETE") {
    return json(res, 200, cancelAudit(seg[2]));
  }

  if (seg[0] === "api" && seg[1] === "report" && seg[2]) {
    const slug = assertSlug(seg[2]);
    if (req.method === "GET") return json(res, 200, readReport(slug));
    if (req.method === "PUT") {
      const { report, mtime } = await readBody(req);
      if (!report) throw httpError(400, "Missing `report`");
      return json(res, 200, writeReport(slug, report, { expectedMtime: mtime }));
    }
  }

  // Preview renders the editor's live buffer, not the file on disk — otherwise
  // the preview would lag one save behind every keystroke. The same goes for an
  // unsaved brand theme.
  if (seg[0] === "api" && seg[1] === "preview" && seg[2] && req.method === "POST") {
    const lang = assertLang(seg[2]);
    const {
      report,
      part = "body",
      theme,
    }: { report: Report; part?: string; theme?: BrandTheme } = await readBody(req);
    const brand = theme ? brandWith(theme).brand : undefined;
    const html = part === "cover" ? renderCover(report, lang, brand) : renderBody(report, lang, brand);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (seg[0] === "api" && seg[1] === "upload" && seg[2] && req.method === "POST") {
    const slug = assertSlug(seg[2]);
    const raw = basename(String(req.headers["x-filename"] ?? "image.png"));
    const name = raw.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "") || "image.png";
    if (!MIME[extname(name).toLowerCase()]?.startsWith("image/")) {
      throw httpError(400, `Not an image: ${name}`);
    }
    const dir = join(ROOT, "assets", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), await readBody(req, { asBuffer: true }));
    return json(res, 201, { src: `assets/${slug}/${name}` });
  }

  if (seg[0] === "api" && seg[1] === "render" && seg[2] && req.method === "POST") {
    const slug = assertSlug(seg[2]);
    const { langs = [] }: { langs?: unknown[] } = await readBody(req);
    const args = [
      "src/generate.ts",
      slug,
      ...(langs.length ? langs.flatMap((l) => ["--lang", assertLang(l)]) : ["--all"]),
    ];
    const out = await run(process.execPath, args);
    return json(res, out.code === 0 ? 200 : 500, out);
  }

  if (seg[0] === "api" && seg[1] === "translate" && seg[2] && seg[3] && req.method === "POST") {
    return translate(req, res, seg[2], seg[3]);
  }

  if (p.startsWith("/api/")) throw httpError(404, `No route: ${p}`);

  // Uploaded report images, so the editor can show what it just uploaded.
  // Confined to assets/ — the PDF inlines these as data URIs, this is only
  // for the editor's own thumbnails.
  if (p.startsWith("/assets/")) {
    const file = join(ROOT, decodeURIComponent(p).slice(1));
    if (!file.startsWith(join(ROOT, "assets")) || !existsSync(file)) {
      throw httpError(404, "Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
    return res.end(readFileSync(file));
  }

  return serveStatic(res, p);
}

function run(cmd: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: e.message }));
  });
}

/* ---------------------------------------------------------------- listen -- */

// A running audit sits in its own process group so Cancel can stop all of it,
// which also means Ctrl+C here would not reach it. Take it down on the way out.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    killChild();
    process.exit(0);
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  Promise.resolve()
    .then(() => route(req, res, url))
    .catch((err) => {
      if (res.headersSent) return res.end();
      fail(res, err);
    });
});

// 127.0.0.1 only, deliberately: this process writes to reports/ and spawns
// claude. It must not be reachable from the network.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  SEO Audit Studio  →  http://127.0.0.1:${PORT}\n`);
  if (!existsSync(DIST)) console.log("  ! client not built yet — run: npm run studio:build\n");
});
