#!/usr/bin/env node
/**
 * One-command setup: the steps that are safe to automate, then the doctor.
 *
 *   npm run setup
 *
 * Installs npm dependencies and the claude-seo plugin, and creates brand/ from
 * brand.example/ if it is missing. It does NOT run claude-seo's own
 * `/seo setup` — that has to run inside Claude Code, which gives the plugin its
 * data directory. The doctor says so if it is still due.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { doctor, PLUGIN_ID } from "./doctor.ts";
import { BRAND_DIR, EXAMPLE_DIR } from "../src/brand.ts";

const ROOT = join(import.meta.dirname, "..");

function step(label: string, cmd: string, args: string[]): boolean {
  console.log(`\n→ ${label}\n  $ ${cmd} ${args.join(" ")}`);
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
    return true;
  } catch (err) {
    console.error(`  ✗ ${(err as NodeJS.ErrnoException).code === "ENOENT" ? `\`${cmd}\` not found` : "failed"}`);
    return false;
  }
}

if (!existsSync(join(ROOT, "node_modules", "puppeteer"))) {
  step("Installing npm dependencies", "npm", ["install"]);
}

// Never overwrite an existing brand: it is the user's own, and not in git.
if (!existsSync(join(BRAND_DIR, "brand.json"))) {
  console.log(`\n→ Creating your brand folder\n  ${EXAMPLE_DIR} → ${BRAND_DIR}`);
  cpSync(EXAMPLE_DIR, BRAND_DIR, { recursive: true, errorOnExist: false, force: false });
  console.log("  Edit brand/brand.json and replace the logo files with your own.");
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
  execFileSync(process.execPath, [join(ROOT, "scripts", "doctor.ts")], { stdio: "inherit" });
} catch {
  process.exit(1); // the doctor has already printed what is missing
}
