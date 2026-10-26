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
import { join, resolve } from "node:path";
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

/** Which Google services claude-seo has credentials for. Keys match `meta.dataSources`. */
export interface GoogleServices {
  searchConsole: boolean;
  analytics: boolean;
  crux: boolean;
}

export interface DoctorResult {
  ok: boolean;
  testedVersion: string | undefined;
  /** claude-seo's script launcher, for the `run <script>.py` calls in audit/coverage.json. */
  claudeSeo?: string;
  /** Absent when claude-seo could not be asked. */
  google?: GoogleServices;
  checks: Check[];
}

const INSTALL_PLUGIN = [
  "claude plugin marketplace add AgriciDaniel/claude-seo --scope project",
  `claude plugin install ${PLUGIN_ID} --scope project`,
];

interface PluginInstall {
  id: string;
  enabled: boolean;
  version: string;
  installPath: string;
  scope?: string;
  projectPath?: string;
}

/**
 * claude-seo can be installed at several scopes at once: `npm run setup` adds
 * it at project scope, and a user may also have it user-wide. Prefer the one
 * scoped to this repo, and return the rest so a version skew can be reported:
 * all installs share one Python runtime, so `/seo setup` for one version
 * leaves the other needing setup again.
 */
function findPlugin(list: PluginInstall[]): { plugin: PluginInstall | null; others: PluginInstall[] } {
  const rank = (p: PluginInstall) => (p.scope === "local" ? 0 : p.scope === "project" ? 1 : 2);
  const mine = list
    .filter((p) => p.id === PLUGIN_ID && (!p.projectPath || resolve(p.projectPath) === resolve(ROOT)))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || rank(a) - rank(b));
  return { plugin: mine[0] ?? null, others: mine.slice(1) };
}

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
 * claude-seo keeps its runtime in one of two places: the per-plugin data dir
 * (when it is handed CLAUDE_PLUGIN_DATA) or its own fallback dir
 * (~/Library/Application Support/claude-seo on macOS). Which one `/seo setup`
 * used depends on how Claude Code launched it, and in practice the data dir
 * can exist and be empty while the fallback holds a working runtime. So ask
 * the launcher about both and accept whichever is ready.
 */
function pluginDataDir(): string | null {
  const base = join(homedir(), ".claude", "plugins", "data");
  if (!existsSync(base)) return null;
  const hit = readdirSync(base).find((d) => /^claude-seo[-@]agricidaniel/.test(d));
  return hit ? join(base, hit) : null;
}

function runtimeDoctor(launcher: string, env: NodeJS.ProcessEnv): { ok: boolean; out: string } {
  // The launcher is a bash script, which Windows cannot exec. Do what it does
  // instead: hand runtime.py to the first usable Python.
  const runtime = join(launcher, "..", "runtime.py");
  const attempts: [string, string[]][] =
    process.platform === "win32"
      ? [
          ...(env.CLAUDE_SEO_PYTHON ? [[env.CLAUDE_SEO_PYTHON, [runtime, "doctor"]] as [string, string[]]] : []),
          ["py", ["-3", runtime, "doctor"]],
          ["python3", [runtime, "doctor"]],
          ["python", [runtime, "doctor"]],
        ]
      : [[launcher, ["doctor"]]];

  let last = { ok: false, out: "" };
  for (const [cmd, args] of attempts) {
    try {
      const out = execFileSync(cmd, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
      return { ok: true, out };
    } catch (e) {
      const err = e as { code?: string; stdout?: string; stderr?: string };
      if (err.code === "ENOENT") continue; // that Python is not installed; try the next
      last = { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
      return last;
    }
  }
  return process.platform === "win32" ? { ok: false, out: "requires Python 3.10" } : last;
}

const isReady = (r: { ok: boolean; out: string }) => r.ok && !/setup required|not ready/i.test(r.out);

function checkRuntime(installPath: string): CheckResult {
  const launcher = join(installPath, "scripts", "claude-seo");
  if (!existsSync(launcher)) {
    return { ok: false, detail: "launcher missing from the plugin install", fix: "Reinstall: " + INSTALL_PLUGIN[1] };
  }
  const env = { ...process.env };

  // The launcher's own choice first, then the plugin data dir if that differs.
  let result = runtimeDoctor(launcher, env);
  const data = pluginDataDir();
  if (!isReady(result) && data && !env.CLAUDE_PLUGIN_DATA) {
    const viaData = runtimeDoctor(launcher, { ...env, CLAUDE_PLUGIN_DATA: data });
    if (isReady(viaData)) result = viaData;
  }
  const { ok, out } = result;

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

/**
 * Asks claude-seo which Google services its credentials unlock. GA4 also needs a
 * property ID, so credentials alone do not mean Analytics is available.
 */
function googleServices(launcher: string): GoogleServices | undefined {
  if (process.platform === "win32") return undefined;
  const res = run(launcher, ["run", "google_auth.py", "--check", "--json"]);
  try {
    const { services } = JSON.parse(res.out.slice(res.out.indexOf("{")));
    return {
      searchConsole: Boolean(services.gsc?.available),
      analytics: Boolean(services.ga4?.available),
      crux: Boolean(services.crux?.available),
    };
  } catch {
    return undefined;
  }
}

/**
 * audit/coverage.json lists claude-seo's gaps as of one release. A newer
 * claude-seo may have closed some, which would make a supplement run twice.
 */
function checkCoverage(installed: string): CheckResult {
  try {
    const { claudeSeoVersion } = JSON.parse(readFileSync(join(ROOT, "audit", "coverage.json"), "utf8"));
    return claudeSeoVersion === installed
      ? { ok: true, detail: `reviewed against claude-seo ${claudeSeoVersion}` }
      : {
          ok: true,
          warn: true,
          detail: `reviewed against claude-seo ${claudeSeoVersion}, installed ${installed}`,
          fix: "Re-check each supplement's `gap` in audit/coverage.json, delete any claude-seo now covers, then update `claudeSeoVersion`",
        };
  } catch (err) {
    return { ok: false, detail: (err as Error).message, fix: "Restore audit/coverage.json from git" };
  }
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

  let plugin: PluginInstall | null = null;
  let others: PluginInstall[] = [];
  if (claude.ok) {
    const list = run("claude", ["plugin", "list", "--json"]);
    try {
      ({ plugin, others } = findPlugin(JSON.parse(list.out)));
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
  }

  let claudeSeo: string | undefined;
  let google: GoogleServices | undefined;
  if (plugin?.enabled) {
    const drift = TESTED_VERSION && plugin.version !== TESTED_VERSION;
    const skew = others.filter((p) => p.enabled && p.version !== plugin!.version);
    const newest = [plugin, ...skew].reduce((a, b) => (cmpVersion(a.version, b.version) >= 0 ? a : b)).version;
    const behind = [plugin, ...skew].filter((p) => p.version !== newest);
    const scope = plugin.scope ? ` (${plugin.scope})` : "";
    add("claude-seo plugin", true, {
      ok: true,
      warn: Boolean(drift) || skew.length > 0,
      detail: [
        drift
          ? `${plugin.version}${scope} — reports are tested against ${TESTED_VERSION}; check a reference audit before sending this one to a client`
          : `${plugin.version}${scope}`,
        ...skew.map((p) => `also enabled: ${p.version} (${p.scope ?? "unknown scope"}), sharing one runtime`),
      ].join("; "),
      fix: skew.length
        ? behind.map((p) => `claude plugin update ${PLUGIN_ID}${p.scope ? ` --scope ${p.scope}` : ""}`).join("\n      ")
        : undefined,
    });
    const runtime = checkRuntime(plugin.installPath);
    add("claude-seo runtime", true, runtime);
    add("Audit coverage", true, checkCoverage(plugin.version));
    if (runtime.ok) {
      claudeSeo = join(plugin.installPath, "scripts", "claude-seo");
      google = googleServices(claudeSeo);
    }
  }

  const gcfg = join(homedir(), ".config", "claude-seo", "google-api.json");
  if (!existsSync(gcfg)) {
    add("Google APIs (optional)", false, {
      ok: false,
      detail: "not configured — reports will use keyless PageSpeed lab data only, no Search Console, Analytics or field Core Web Vitals",
      fix: "In Claude Code: /seo google setup",
    });
  } else {
    const on = google
      ? ([["Search Console", google.searchConsole], ["GA4", google.analytics], ["CrUX", google.crux]] as const)
          .map(([name, ok]) => `${name} ${ok ? "✓" : "–"}`)
          .join(", ")
      : "configured";
    add("Google APIs (optional)", false, {
      ok: true,
      warn: Boolean(google && !google.analytics),
      detail: on,
      fix: google && !google.analytics ? "GA4 needs a property ID: add `ga4_property_id` to " + gcfg : undefined,
    });
  }

  const hasModules = existsSync(join(ROOT, "node_modules", "puppeteer"));
  add("PDF renderer (puppeteer)", true, hasModules
    ? { ok: true, detail: "installed" }
    : { ok: false, detail: "node_modules missing", fix: "npm install" });

  const failed = checks.filter((c) => c.required && !c.ok);
  return { ok: failed.length === 0, testedVersion: TESTED_VERSION, claudeSeo, google, checks };
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
