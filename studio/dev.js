#!/usr/bin/env node
/**
 * Dev runner: the API server plus Vite with hot reload.
 *
 * Vite serves the UI on :5173 and proxies /api to the server on :4321 (see
 * studio/client/vite.config.ts). Use `npm run studio` instead for normal work —
 * it builds once and serves everything from a single port.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

function start(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit" });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`\n${name} exited with code ${code}`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const c of children) if (!c.killed) c.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("server", process.execPath, [join(ROOT, "studio", "server.js")]);
start("vite", "npx", ["vite", "--config", join(ROOT, "studio", "client", "vite.config.ts")]);

console.log("\n  Studio dev  →  http://127.0.0.1:5173  (API on :4321)\n");
