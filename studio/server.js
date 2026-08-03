#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { renderBody, renderCover } from "../src/render.js";
import { SUPPORTED_LANGS } from "../src/i18n.js";
import {
  ROOT,
  assertSlug,
  listReports,
  readReport,
  writeReport,
  reportExists,
  skeleton,
} from "./lib/store.js";
import { translateReport } from "./lib/translate/index.js";
import { DEFAULT_MODEL } from "./lib/translate/anthropic.js";

const PORT = Number(process.env.STUDIO_PORT ?? 4321);
const DIST = join(ROOT, "studio", "client", "dist");
const MAX_BODY = 64 * 1024 * 1024;

const MIME = {
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

const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

const fail = (res, err) =>
  json(res, err.status ?? 500, { error: err.message ?? String(err) });

function readBody(req, { asBuffer = false } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
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
        reject(Object.assign(new Error(`Malformed JSON: ${e.message}`), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

const assertLang = (lang) => {
  if (!SUPPORTED_LANGS.includes(lang)) {
    throw Object.assign(new Error(`Unsupported language: ${lang}`), { status: 400 });
  }
  return lang;
};

/* ---------------------------------------------------------------- static -- */

function serveStatic(req, res, pathname) {
  if (!existsSync(DIST)) {
    res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<pre style="font:14px ui-monospace,monospace;padding:2rem;line-height:1.6">` +
        `Report Studio has not been built yet.\n\n` +
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
async function translate(req, res, slug, lang) {
  assertSlug(slug);
  assertLang(lang);

  const { provider, apiKey, model, scope } = await readBody(req);

  // The client hangs up if the user closes the dialog; stop the work with it.
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const result = await translateReport(slug, lang, {
    provider,
    apiKey,
    model,
    scope,
    signal: controller.signal,
  });

  return json(res, 200, result);
}

/* ---------------------------------------------------------------- routes -- */

async function route(req, res, url) {
  const p = url.pathname;
  const seg = p.split("/").filter(Boolean); // ["api", "report", "naa-ee"]

  if (p === "/api/health") {
    return json(res, 200, {
      ok: true,
      langs: SUPPORTED_LANGS,
      defaultModel: DEFAULT_MODEL,
      // Only whether a key is present, never the key. A key set in the server's
      // environment is a convenience for single-user local work; the UI still
      // lets you supply your own per request.
      hasEnvKey: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  }

  if (p === "/api/reports" && req.method === "GET") {
    return json(res, 200, { reports: listReports() });
  }

  if (p === "/api/reports" && req.method === "POST") {
    const { slug, site, clientName, siteUrl } = await readBody(req);
    assertSlug(slug);
    if (!site || !clientName) {
      throw Object.assign(new Error("site and clientName are required"), { status: 400 });
    }
    if (reportExists(slug)) {
      throw Object.assign(new Error(`Report "${slug}" already exists`), { status: 409 });
    }
    return json(res, 201, writeReport(slug, skeleton({ slug, site, clientName, siteUrl })));
  }

  if (seg[0] === "api" && seg[1] === "report" && seg[2]) {
    const slug = assertSlug(seg[2]);
    if (req.method === "GET") return json(res, 200, readReport(slug));
    if (req.method === "PUT") {
      const { report, mtime } = await readBody(req);
      if (!report) throw Object.assign(new Error("Missing `report`"), { status: 400 });
      return json(res, 200, writeReport(slug, report, { expectedMtime: mtime }));
    }
  }

  // Preview renders the editor's live buffer, not the file on disk — otherwise
  // the preview would lag one save behind every keystroke.
  if (seg[0] === "api" && seg[1] === "preview" && seg[2] && req.method === "POST") {
    const lang = assertLang(seg[2]);
    const { report, part = "body" } = await readBody(req);
    const html = part === "cover" ? renderCover(report, lang) : renderBody(report, lang);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (seg[0] === "api" && seg[1] === "upload" && seg[2] && req.method === "POST") {
    const slug = assertSlug(seg[2]);
    const raw = basename(String(req.headers["x-filename"] ?? "image.png"));
    const name = raw.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "") || "image.png";
    if (!MIME[extname(name).toLowerCase()]?.startsWith("image/")) {
      throw Object.assign(new Error(`Not an image: ${name}`), { status: 400 });
    }
    const dir = join(ROOT, "assets", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), await readBody(req, { asBuffer: true }));
    return json(res, 201, { src: `assets/${slug}/${name}` });
  }

  if (seg[0] === "api" && seg[1] === "render" && seg[2] && req.method === "POST") {
    const slug = assertSlug(seg[2]);
    const { langs = [] } = await readBody(req);
    const args = ["src/generate.js", slug, ...(langs.length ? langs.flatMap((l) => ["--lang", assertLang(l)]) : ["--all"])];
    const out = await run(process.execPath, args);
    return json(res, out.code === 0 ? 200 : 500, out);
  }

  if (seg[0] === "api" && seg[1] === "translate" && seg[2] && seg[3] && req.method === "POST") {
    return translate(req, res, seg[2], seg[3]);
  }

  if (p.startsWith("/api/")) throw Object.assign(new Error(`No route: ${p}`), { status: 404 });

  // Uploaded report images, so the editor can show what it just uploaded.
  // Confined to assets/ — the PDF inlines these as data URIs, this is only
  // for the editor's own thumbnails.
  if (p.startsWith("/assets/")) {
    const file = join(ROOT, decodeURIComponent(p).slice(1));
    if (!file.startsWith(join(ROOT, "assets")) || !existsSync(file)) {
      throw Object.assign(new Error("Not found"), { status: 404 });
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
    return res.end(readFileSync(file));
  }

  return serveStatic(req, res, p);
}

function run(cmd, args) {
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

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
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
  console.log(`\n  Nordkite Report Studio  →  http://127.0.0.1:${PORT}\n`);
  if (!existsSync(DIST)) console.log("  ! client not built yet — run: npm run studio:build\n");
});
