#!/usr/bin/env node
/**
 * Checks everything an audit needs and prints the fix for anything missing.
 *
 *   npm run doctor            human-readable checklist
 *   npm run doctor -- --json  machine-readable, used by /new-audit as a preflight
 *
 * Uses Node built-ins only, so it runs before `npm install` and on a machine
 * where nothing else works yet — which is exactly when it is needed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBrand, BRAND_DIR, EXAMPLE_DIR } from "../src/brand.ts";

const ROOT = join(import.meta.dirname, "..");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

export const PLUGIN_ID = "claude-seo@agricidaniel-claude-seo";
export const TESTED_VERSION: string | undefined = PKG.config?.claudeSeoVersion;

/** Node runs this repo's .ts files directly; type stripping is on by default from 22.18. */
const MIN_NODE = "22.18.0";

export interface Check {
  name: string;
  required: boolean;
  ok: boolean;
  warn?: boolean;
  detail: string;
  fix?: string;
}

type CheckResult = Omit<Check, "name" | "required">;

export interface DoctorResult {
  ok: boolean;
  testedVersion: string | undefined;
  checks: Check[];
}

const INSTALL_PLUGIN = [
  "claude plugin marketplace add AgriciDaniel/claude-seo --scope project",
  `claude plugin install ${PLUGIN_ID} --scope project`,
];

function run(cmd: string, args: string[]): { ok: boolean; missing?: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (err.code === "ENOENT") return { ok: false, missing: true, out: "" };
    // claude-seo's launcher reports "setup required" through a non-zero exit;
    // its stdout is still the answer, so keep it.
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() };
  }
}

/** Compare dotted versions numerically: -1, 0 or 1. */
function cmpVersion(a: string, b: string): number {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/**
 * Inside Claude Code the plugin's runtime lives in the per-plugin data dir that
 * Claude Code passes as CLAUDE_PLUGIN_DATA. Run from a plain shell, the launcher
 * would look in its own fallback dir instead and wrongly report "setup required"
 * — so point it at the data dir when one exists.
 */
function pluginDataDir(): string | null {
  const base = join(homedir(), ".claude", "plugins", "data");
  if (!existsSync(base)) return null;
  const hit = readdirSync(base).find((d) => /^claude-seo[-@]agricidaniel/.test(d));
  return hit ? join(base, hit) : null;
}

function checkRuntime(installPath: string): CheckResult {
  const launcher = join(installPath, "scripts", "claude-seo");
  if (!existsSync(launcher)) {
    return { ok: false, detail: "launcher missing from the plugin install", fix: "Reinstall: " + INSTALL_PLUGIN[1] };
  }
  const env = { ...process.env };
  const data = pluginDataDir();
  if (data && !env.CLAUDE_PLUGIN_DATA) env.CLAUDE_PLUGIN_DATA = data;

  let out = "";
  let ok = false;
  try {
    out = execFileSync(launcher, ["doctor"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
    ok = true;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  const ready = ok && !/setup required|not ready/i.test(out);
  const python = out.match(/Python:\s*([\d.]+)/)?.[1];
  const chromium = /Chromium:\s*(installed|ready)/i.test(out);

  if (/CLAUDE_SEO_PYTHON is not a usable/.test(out)) {
    return {
      ok: false,
      detail: `CLAUDE_SEO_PYTHON points to a missing or too-old Python (${env.CLAUDE_SEO_PYTHON})`,
      fix: "Fix or remove CLAUDE_SEO_PYTHON (shell profile or the env block of ~/.claude/settings.json).",
    };
  }
  if (/requires Python 3\.10/.test(out)) {
    return {
      ok: false,
      detail: "no Python 3.10+ found",
      fix: "Install Python 3.12 or 3.13 (python.org or `brew install python@3.13`), then run /seo setup in Claude Code.",
    };
  }
  if (!ready) {
    const newPy = python && cmpVersion(python, "3.14") >= 0;
    return {
      ok: false,
      detail: `setup required${python ? ` (Python ${python})` : ""}`,
      fix:
        "Open Claude Code in this folder and run: /seo setup" +
        (newPy
          ? `\n      Python ${python} is very new — if setup fails building lxml or weasyprint, install Python 3.13 and set CLAUDE_SEO_PYTHON to it.`
          : ""),
    };
  }
  return {
    ok: true,
    detail: `ready${python ? ` (Python ${python})` : ""}${chromium ? "" : ", Chromium missing — screenshots and JS rendering unavailable"}`,
    warn: !chromium,
  };
}

function checkBrand(): CheckResult {
  try {
    const brand = loadBrand();
    if (brand.isExample) {
      return {
        ok: false,
        detail: "no brand/brand.json — reports would go out under the example brand",
        fix: "Run `npm run setup`, then edit brand/brand.json and add your logo",
      };
    }
    const example = JSON.parse(readFileSync(join(EXAMPLE_DIR, "brand.json"), "utf8"));
    if (brand.name === example.name) {
      return { ok: true, warn: true, detail: `still the example values ("${brand.name}")`, fix: `Edit ${join(BRAND_DIR, "brand.json")}` };
    }
    return {
      ok: true,
      warn: !brand.logo,
      detail: brand.logo ? brand.name : `${brand.name} (no logo — the name is printed as a wordmark)`,
    };
  } catch (err) {
    return { ok: false, detail: (err as Error).message, fix: `Fix ${join(BRAND_DIR, "brand.json")}` };
  }
}

export function doctor(): DoctorResult {
  const checks: Check[] = [];
  const add = (name: string, required: boolean, res: CheckResult) => checks.push({ name, required, ...res });

  const node = process.versions.node;
  add(`Node.js ${MIN_NODE}+`, true, cmpVersion(node, MIN_NODE) >= 0
    ? { ok: true, detail: node }
    : { ok: false, detail: node, fix: `Install Node.js ${MIN_NODE} or newer: https://nodejs.org` });

  // Not required: the audit itself does not need it, only the PDF does.
  add("Brand", false, checkBrand());

  const claude = run("claude", ["--version"]);
  add("Claude Code", true, claude.ok
    ? { ok: true, detail: claude.out.split("\n")[0] }
    : { ok: false, detail: "`claude` not on PATH", fix: "Install Claude Code: https://claude.com/claude-code" });

  let plugin: { id: string; enabled: boolean; version: string; installPath: string } | null = null;
  if (claude.ok) {
    const list = run("claude", ["plugin", "list", "--json"]);
    try {
      plugin = JSON.parse(list.out).find((p: { id: string }) => p.id === PLUGIN_ID) ?? null;
    } catch {
      plugin = null;
    }
  }

  if (!plugin) {
    add("claude-seo plugin", true, {
      ok: false,
      detail: "not installed",
      fix: `Run \`npm run setup\`, or:\n      ${INSTALL_PLUGIN.join("\n      ")}`,
    });
  } else if (!plugin.enabled) {
    add("claude-seo plugin", true, { ok: false, detail: `${plugin.version}, disabled`, fix: `claude plugin enable ${PLUGIN_ID}` });
  } else {
    const drift = TESTED_VERSION && plugin.version !== TESTED_VERSION;
    add("claude-seo plugin", true, {
      ok: true,
      warn: Boolean(drift),
      detail: drift
        ? `${plugin.version} — reports are tested against ${TESTED_VERSION}; check a reference audit before sending this one to a client`
        : plugin.version,
    });
    add("claude-seo runtime", true, checkRuntime(plugin.installPath));
  }

  const gcfg = join(homedir(), ".config", "claude-seo", "google-api.json");
  add("Google APIs (optional)", false, existsSync(gcfg)
    ? { ok: true, detail: "configured — Search Console and Core Web Vitals sections available" }
    : { ok: false, detail: "not configured — the report will skip Search Console and field Core Web Vitals", fix: "In Claude Code: /seo google setup" });

  const hasModules = existsSync(join(ROOT, "node_modules", "puppeteer"));
  add("PDF renderer (puppeteer)", true, hasModules
    ? { ok: true, detail: "installed" }
    : { ok: false, detail: "node_modules missing", fix: "npm install" });

  const failed = checks.filter((c) => c.required && !c.ok);
  return { ok: failed.length === 0, testedVersion: TESTED_VERSION, checks };
}

function print(result: DoctorResult) {
  const mark = (c: Check) => (c.ok ? (c.warn ? "!" : "✓") : c.required ? "✗" : "–");
  console.log("\nSEO Audit Studio — environment check\n");
  for (const c of result.checks) {
    console.log(`  ${mark(c)} ${c.name}: ${c.detail}`);
    if ((!c.ok || c.warn) && c.fix) console.log(`      → ${c.fix}`);
  }
  console.log(
    result.ok
      ? "\nReady. Run /new-audit <url> in Claude Code.\n"
      : "\nNot ready — fix the ✗ items above, then run `npm run doctor` again.\n"
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = doctor();
  if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else print(result);
  process.exit(result.ok ? 0 : 1);
}
