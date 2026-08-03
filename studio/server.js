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

const PORT = Number(process.env.STUDIO_PORT ?? 4321);
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
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
 * Run the real /translate-report command and stream its progress.
 *
 * This is deliberately not an API call: translation already exists as a
 * reviewed slash command with the glossary rules baked in, and reimplementing
 * it against the Messages API would mean two prompts to keep in sync.
 *
 * Bash is withheld — the command ends by running `npm run report`, and the
 * Studio owns rendering.
 */
function translate(req, res, slug, lang) {
  assertSlug(slug);
  assertLang(lang);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const args = [
    "-p",
    `/translate-report ${slug} ${lang}`,
    "--output-format",
    "stream-json",
    "--verbose",
    "--allowedTools",
    "Read,Edit,Write",
    "--permission-mode",
    "acceptEdits",
  ];

  send("start", { slug, lang, command: `${CLAUDE_BIN} ${args.join(" ")}` });

  let child;
  try {
    child = spawn(CLAUDE_BIN, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    send("error", { message: err.message });
    return res.end();
  }

  child.on("error", (err) => {
    send("error", {
      message:
        err.code === "ENOENT"
          ? `Could not find the "claude" CLI on PATH. Run this yourself instead:\n` +
            `  claude -p "/translate-report ${slug} ${lang}"`
          : err.message,
    });
    res.end();
  });

  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        send("log", describe(JSON.parse(line)));
      } catch {
        send("log", { kind: "raw", text: line });
      }
    }
  });

  child.stderr.on("data", (c) => send("log", { kind: "stderr", text: c.toString("utf8") }));

  child.on("close", (code) => {
    if (code !== 0) {
      send("error", { message: `claude exited with code ${code}` });
      return res.end();
    }
    try {
      // The command rewrote the file; re-hash so the source text now on disk
      // counts as translated, which is what clears the stale badges.
      const { report } = readReport(slug);
      send("done", writeReport(slug, report, { refreshState: true }));
    } catch (err) {
      send("error", { message: err.message });
    }
    res.end();
  });

  req.on("close", () => child.kill());
}

/** Turn a stream-json event into one readable progress line. */
function describe(ev) {
  if (ev.type === "system") return { kind: "system", text: `session ${ev.session_id ?? ""}`.trim() };
  if (ev.type === "assistant") {
    const parts = [];
    for (const b of ev.message?.content ?? []) {
      if (b.type === "text" && b.text.trim()) parts.push({ kind: "text", text: b.text.trim() });
      if (b.type === "tool_use") parts.push({ kind: "tool", text: b.name });
    }
    return parts.length === 1 ? parts[0] : { kind: "group", parts };
  }
  if (ev.type === "result") {
    return {
      kind: ev.is_error ? "stderr" : "result",
      text: ev.result ?? (ev.is_error ? "failed" : "done"),
      cost: ev.total_cost_usd,
      turns: ev.num_turns,
    };
  }
  return { kind: "event", text: ev.type };
}

/* ---------------------------------------------------------------- routes -- */

async function route(req, res, url) {
  const p = url.pathname;
  const seg = p.split("/").filter(Boolean); // ["api", "report", "naa-ee"]

  if (p === "/api/health") {
    return json(res, 200, { ok: true, langs: SUPPORTED_LANGS, claudeBin: CLAUDE_BIN });
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

  if (seg[0] === "api" && seg[1] === "translate" && seg[2] && seg[3]) {
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
