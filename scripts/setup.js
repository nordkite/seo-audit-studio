#!/usr/bin/env node
/**
 * One-command setup: the steps that are safe to automate, then the doctor.
 *
 *   npm run setup
 *
 * Installs npm dependencies and the claude-seo plugin. It does NOT run
 * claude-seo's own `/seo setup` — that has to run inside Claude Code, which
 * gives the plugin its data directory. The doctor says so if it is still due.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { doctor, PLUGIN_ID } from "./doctor.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function step(label, cmd, args) {
  console.log(`\n→ ${label}\n  $ ${cmd} ${args.join(" ")}`);
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
    return true;
  } catch (err) {
    console.error(`  ✗ ${err.code === "ENOENT" ? `\`${cmd}\` not found` : "failed"}`);
    return false;
  }
}

if (!existsSync(join(ROOT, "node_modules", "puppeteer"))) {
  step("Installing npm dependencies", "npm", ["install"]);
}

const before = doctor();
const claudeOk = before.checks.find((c) => c.name === "Claude Code")?.ok;
const plugin = before.checks.find((c) => c.name === "claude-seo plugin");

if (claudeOk && plugin && !plugin.ok) {
  if (/disabled/.test(plugin.detail)) {
    step("Enabling claude-seo", "claude", ["plugin", "enable", PLUGIN_ID]);
  } else {
    step("Adding the claude-seo marketplace", "claude", [
      "plugin", "marketplace", "add", "AgriciDaniel/claude-seo", "--scope", "project",
    ]);
    step("Installing claude-seo", "claude", ["plugin", "install", PLUGIN_ID, "--scope", "project"]);
  }
}

try {
  execFileSync(process.execPath, [join(ROOT, "scripts", "doctor.js")], { stdio: "inherit" });
} catch {
  process.exit(1); // the doctor has already printed what is missing
}
