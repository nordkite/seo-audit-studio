import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { validate } from "../../src/validate.ts";
import { detectLanguages, pick, versionOf } from "../../scripts/site-languages.ts";
import type { Report } from "../../src/types.ts";
import { ROOT, backup, httpError, reportPath, writeReport } from "./store.ts";
import { keepAwake } from "./keep-awake.ts";
import { CLAUDE_BIN } from "./translate/cli.ts";
import { AUDIT_MODELS, EFFORTS, type AuditJob, type AuditRequest, type AuditStep, type DoctorCheck, type ExistingReport, type Preflight, type SiteLanguages } from "./types.ts";

/**
 * Run `/new-audit` or `/new-page-audit` from the Studio.
 *
 * Unlike translation this is a real agent run, and has to be: claude-seo needs
 * tools, web fetches and subagents. The Studio only starts the same slash
 * command a person would type, so the audit method still lives in exactly one
 * place (the command files and claude-seo) and the Studio adds none of its own.
 *
 * One audit at a time. Jobs live in memory, so restarting the Studio forgets
 * them and stops a running one; the stream-json log in `.studio-audits/`
 * survives for a look at what happened.
 */

const LOGS = join(ROOT, ".studio-audits");
const REPORTS = join(ROOT, "reports");
const MAX_STEPS = 400;
const KEEP_JOBS = 10;

const jobs: AuditJob[] = [];
let child: ChildProcess | null = null;

const COMMAND = { site: "new-audit", page: "new-page-audit" } as const;

/** `npm run doctor -- --json`, without npm in between. */
export function preflight(): Promise<Preflight> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, ["scripts/doctor.ts", "--json"], { cwd: ROOT });
    let out = "";
    proc.stdout.on("data", (c) => (out += c));
    proc.on("error", (e) =>
      resolve({ ok: false, checks: [{ name: "doctor", required: true, ok: false, detail: e.message }] })
    );
    proc.on("close", () => {
      try {
        const { ok, checks } = JSON.parse(out) as { ok: boolean; checks: DoctorCheck[] };
        resolve({ ok, checks });
      } catch {
        resolve({
          ok: false,
          checks: [{ name: "doctor", required: true, ok: false, detail: "Could not read doctor output" }],
        });
      }
    });
  });
}

/**
 * The tools the command's own frontmatter allows. The run cannot stop to ask,
 * so anything else is denied rather than prompted for, and the command file
 * stays the one place that says what an audit may do.
 */
function allowedTools(command: string): string[] {
  const md = readFileSync(join(ROOT, ".claude", "commands", `${command}.md`), "utf8");
  const line = md.match(/^allowed-tools:\s*(.+)$/m)?.[1] ?? "";
  return line.split(",").map((t) => t.trim()).filter(Boolean);
}

function normalizeUrl(raw: unknown): string {
  const s = String(raw ?? "").trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw httpError(400, `Not a URL: ${s}`);
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) throw httpError(400, `Not a URL: ${s}`);
  return url.href;
}

/** The site's language versions, for the New report dialog to offer. */
export async function siteLanguages(raw: unknown): Promise<SiteLanguages> {
  const url = normalizeUrl(raw);
  try {
    return await detectLanguages(url);
  } catch (e) {
    throw httpError(502, `Could not read ${url}: ${(e as Error).message}`);
  }
}

/** hreflang codes, lowercased and deduplicated. Anything else is refused. */
function languageCodes(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw httpError(400, "languages must be a list of language codes");
  const codes = [...new Set(raw.map((l) => String(l).trim().toLowerCase()).filter(Boolean))];
  const bad = codes.filter((c) => !/^[a-z]{2,3}(-[a-z0-9]{1,8})*$/.test(c));
  if (bad.length) throw httpError(400, `Not a language code: ${bad.join(", ")}`);
  return codes;
}

/** A page by host (without www) and path (without the trailing slash). */
function pageKey(raw: string): string {
  const u = new URL(raw);
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
}

/**
 * The report this audit would overwrite. A site report's slug follows from the
 * URL, as /new-audit names it. A page report's slug is the agent's call (it
 * may drop a language prefix), so it is found by the `pageUrl` it covers.
 */
function findExisting(url: string, scope: "site" | "page", languages: string[]): ExistingReport | null {
  if (!existsSync(REPORTS)) return null;
  const host = new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/g, "-");
  const target = scope === "site" ? (languages.length ? `${host}--${languages.join("-")}` : host) : null;
  const key = pageKey(url);
  for (const f of readdirSync(REPORTS).filter((f) => f.endsWith(".json"))) {
    const slug = f.replace(/\.json$/, "");
    if (target && slug !== target) continue;
    let report: Partial<Report>;
    try {
      report = JSON.parse(readFileSync(join(REPORTS, f), "utf8"));
    } catch {
      if (target) return { slug, clientName: "", auditedAt: null };
      continue;
    }
    const meta = report.meta;
    if (!target) {
      if (meta?.scope !== "page" || !meta.pageUrl) continue;
      try {
        if (pageKey(meta.pageUrl) !== key) continue;
      } catch {
        continue;
      }
    }
    return { slug, clientName: meta?.clientName ?? "", auditedAt: meta?.auditedAt ?? null };
  }
  return null;
}

/** For the New report dialog: what starting this audit would replace. */
export function existingReport(raw: unknown, scopeRaw: unknown, languagesRaw: unknown): ExistingReport | null {
  const scope = scopeRaw === "page" ? "page" : "site";
  return findExisting(normalizeUrl(raw), scope, scope === "site" ? languageCodes(languagesRaw) : []);
}

function reportMtimes(): Map<string, number> {
  if (!existsSync(REPORTS)) return new Map();
  return new Map(
    readdirSync(REPORTS)
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(/\.json$/, ""), statSync(join(REPORTS, f)).mtimeMs])
  );
}

const short = (s: unknown, n = 90) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** A human line for one tool call, or null for calls too small to show. */
function describe(name: string, input: Record<string, unknown>): string | null {
  switch (name) {
    case "Skill":
      return `Running ${input.skill}`;
    case "Agent":
    case "Task":
      return `Subagent ${input.subagent_type ?? ""}: ${short(input.description, 60)}`.replace("  ", " ");
    case "Bash":
      return short(input.description || input.command);
    case "WebFetch":
      return `Fetching ${short(input.url, 80)}`;
    case "WebSearch":
      return `Searching “${short(input.query, 60)}”`;
    case "Write":
    case "Edit":
      return `${name === "Write" ? "Writing" : "Editing"} ${relative(ROOT, String(input.file_path ?? ""))}`;
    default:
      return null; // Read, Glob, Grep: dozens of them, none worth a line
  }
}

export function listJobs(): AuditJob[] {
  return jobs;
}

export async function startAudit(req: AuditRequest): Promise<AuditJob> {
  if (jobs.some((j) => j.status === "running")) {
    throw httpError(409, "An audit is already running. Wait for it or cancel it first.");
  }
  const scope = req.scope === "page" ? "page" : "site";
  const url = normalizeUrl(req.url);
  // Never sent to the agent: claude-seo only needs the URL. finish() writes it
  // into the report, so it goes on the cover exactly as typed.
  const clientName = String(req.clientName ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 120);
  const languages = scope === "site" ? languageCodes(req.languages) : [];

  // Checked here rather than half an hour into the run.
  if (languages.length) {
    try {
      pick(await detectLanguages(url), languages);
    } catch (e) {
      throw httpError(400, (e as Error).message);
    }
  }

  const check = await preflight();
  if (!check.ok) {
    const failed = check.checks.filter((c) => c.required && !c.ok);
    throw httpError(
      412,
      `Preflight failed: ${failed.map((c) => `${c.name}${c.fix ? ` (${c.fix})` : ""}`).join("; ")}`
    );
  }

  const id = newId();
  const job: AuditJob = {
    id,
    url,
    scope,
    clientName,
    ...(languages.length ? { languages } : {}),
    ...runOptions(req),
    status: "running",
    startedAt: Date.now(),
    steps: [],
    keepAwake: null,
    log: relative(ROOT, join(LOGS, `${id}.jsonl`)),
  };
  addJob(job);

  // The agent writes the report file directly, past the Studio's own backups,
  // and nobody is there to answer if it asks before overwriting. Keep a copy
  // of the one it is most likely to replace.
  const existing = findExisting(url, scope, languages);
  if (existing) {
    backup(reportPath(existing.slug), existing.slug);
    step(job, `Backed up the existing reports/${existing.slug}.json to .studio-backups/${existing.slug}/`);
  }

  const prompt = `/${COMMAND[scope]} ${url}${languages.length ? ` --languages ${languages.join(",")}` : ""}`;
  run(job, prompt);
  return job;
}

/**
 * Picks up a failed or cancelled audit where it stopped, in the same Claude
 * session, so the subagents that already reported are not run (and paid for)
 * again. The usual reason is a usage limit hit mid-run.
 */
export function resumeAudit(id: string): AuditJob {
  const old = jobs.find((j) => j.id === id);
  if (!old) throw httpError(404, `No such audit: ${id}`);
  if (old.status !== "failed" && old.status !== "cancelled") {
    throw httpError(409, "Only a failed or cancelled audit can be resumed.");
  }
  if (!old.sessionId) throw httpError(409, "This audit never started a session, so there is nothing to resume. Retry it instead.");
  if (jobs.some((j) => j.status === "running")) {
    throw httpError(409, "An audit is already running. Wait for it or cancel it first.");
  }

  const newJobId = newId();
  const job: AuditJob = {
    id: newJobId,
    url: old.url,
    scope: old.scope,
    clientName: old.clientName,
    ...(old.languages ? { languages: old.languages } : {}),
    ...runOptions(old),
    resumedFrom: old.id,
    since: old.since ?? old.startedAt,
    status: "running",
    startedAt: Date.now(),
    steps: [],
    keepAwake: null,
    log: relative(ROOT, join(LOGS, `${newJobId}.jsonl`)),
  };
  addJob(job);
  step(job, `Resuming session ${old.sessionId}`);
  run(
    job,
    "The audit stopped before it finished, most likely on a usage limit. Continue from where it stopped: " +
      "do not repeat subagents or checks that already reported. If the report is already written, validate it and finish.",
    old.sessionId,
    old.since ?? old.startedAt
  );
  return job;
}

const newId = () => `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`;

function addJob(job: AuditJob) {
  jobs.unshift(job);
  jobs.splice(KEEP_JOBS);
}

function step(job: AuditJob, text: string, nested = false) {
  const s: AuditStep = { at: Date.now(), text, ...(nested ? { nested } : {}) };
  job.steps.push(s);
  if (job.steps.length > MAX_STEPS) job.steps.splice(0, job.steps.length - MAX_STEPS);
}

/** Model, effort and subagent choice, validated. Left out means the user's own Claude Code settings. */
function runOptions(req: Partial<AuditRequest>): Pick<AuditRequest, "model" | "effort" | "subagents"> {
  const out: Pick<AuditRequest, "model" | "effort" | "subagents"> = {};
  if (req.model) {
    if (!(AUDIT_MODELS as readonly string[]).includes(req.model)) throw httpError(400, `Unknown model: ${req.model}`);
    out.model = req.model;
  }
  if (req.effort) {
    if (!(EFFORTS as readonly string[]).includes(req.effort)) throw httpError(400, `Unknown effort: ${req.effort}`);
    out.effort = req.effort;
  }
  if (req.subagents) {
    if (req.subagents !== "sonnet") throw httpError(400, `Unknown subagent choice: ${req.subagents}`);
    out.subagents = req.subagents;
  }
  return out;
}

/**
 * Starts claude for a job, or resumes `session`, and follows it to the end.
 * A resumed run counts a report written any time since `since`, the original
 * start, so one written before the run stopped still counts.
 */
function run(job: AuditJob, prompt: string, session?: string, since?: number) {
  const command = COMMAND[job.scope];
  mkdirSync(LOGS, { recursive: true });
  const log = createWriteStream(join(ROOT, job.log));
  const before = since ? new Map<string, number>() : reportMtimes();
  step(job, session ? "Continuing" : `Starting ${prompt}`);

  const proc = spawn(
    CLAUDE_BIN,
    [
      "-p",
      ...(session ? ["--resume", session] : []),
      ...(job.model ? ["--model", job.model] : []),
      ...(job.effort ? ["--effort", job.effort] : []),
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      ...allowedTools(command),
    ],
    {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      // claude-seo's agents name their own models in their frontmatter; only
      // the FORCE variable overrides that.
      env:
        job.subagents === "sonnet"
          ? { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: "sonnet", CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "1" }
          : process.env,
      // Its own process group, so cancelling takes Bash children down too.
      // Not on Windows, where detached means a new console window.
      detached: process.platform !== "win32",
      windowsHide: true,
    }
  );
  child = proc;

  // The prompt goes in on stdin: --allowedTools takes a list and would swallow
  // a positional prompt after it.
  proc.stdin.end(prompt);

  if (proc.pid) {
    keepAwake(proc.pid).then((k) => {
      job.keepAwake = k;
      if (!k.ok) step(job, `Could not keep the computer awake (${k.method}: ${k.detail ?? "failed"})`);
    });
  }

  let buf = "";
  let stderr = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    log.write(chunk);
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(line);
    }
  });
  proc.stderr.on("data", (c) => (stderr += c));

  function onEvent(line: string) {
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    // Kept so a run that stops on a usage limit can be resumed, not restarted.
    if (typeof ev.session_id === "string") job.sessionId ??= ev.session_id;
    if (ev.type === "assistant") {
      const nested = Boolean(ev.parent_tool_use_id);
      for (const block of ev.message?.content ?? []) {
        if (block.type !== "tool_use") continue;
        const text = describe(block.name, block.input ?? {});
        if (text) step(job, text, nested);
      }
    } else if (ev.type === "result") {
      job.costUsd = ev.total_cost_usd;
      job.message = typeof ev.result === "string" ? ev.result.trim() : undefined;
      if (ev.is_error) job.status = "failed";
      // A denied call is a check that never ran. Say so, so it does not pass
      // unnoticed into a client report.
      const denied: { tool_name: string; tool_input?: Record<string, unknown> }[] = ev.permission_denials ?? [];
      for (const d of denied) {
        step(job, `Permission denied: ${d.tool_name} ${short(d.tool_input?.command ?? d.tool_input?.url ?? "", 70)}`);
      }
      if (denied.length) {
        job.message = `${denied.length} tool call(s) were denied, so some checks may not have run. ` +
          `See the progress list and the log.\n\n${job.message ?? ""}`.trim();
      }
    }
  }

  proc.on("error", (e: NodeJS.ErrnoException) => {
    job.status = "failed";
    job.message =
      e.code === "ENOENT" ? `Could not find the "claude" CLI on PATH. Install Claude Code first.` : e.message;
    job.endedAt = Date.now();
    child = null;
  });

  proc.on("close", (code) => {
    log.end();
    child = null;
    job.endedAt = Date.now();
    if (job.status === "cancelled") return;
    if (code !== 0 && job.status === "running") {
      job.status = "failed";
      job.message ||= stderr.trim() || `claude exited with code ${code}`;
    }
    if (job.status === "failed") return;
    finish(job, before, since ?? job.startedAt).catch((e) => {
      job.status = "failed";
      job.message = (e as Error).message;
    });
  });
}

/**
 * The run is only a success if it left a report the renderer will accept.
 * The newest report file written since the start is taken to be its output.
 */
async function finish(job: AuditJob, before: Map<string, number>, since: number) {
  const written = [...reportMtimes()]
    .filter(([slug, mtime]) => mtime > (before.get(slug) ?? 0) && mtime >= since)
    .sort((a, b) => b[1] - a[1]);

  if (!written.length) {
    job.status = "failed";
    job.message = job.message
      ? `No report was written. The audit's last message:\n\n${job.message}`
      : "The audit finished without writing a report.";
    return;
  }

  const [slug] = written[0];
  job.slug = slug;
  const path = join(REPORTS, `${slug}.json`);
  let report: Report;
  try {
    report = JSON.parse(readFileSync(path, "utf8"));
    validate(report, path);
  } catch (e) {
    job.status = "failed";
    job.message = `reports/${slug}.json was written but is not valid: ${(e as Error).message}`;
    return;
  }
  // The agent derives a name from the site; the one typed in the Studio wins.
  // Same for the language versions: the cover must name the ones chosen.
  let changed = false;
  if (job.clientName && report.meta.clientName !== job.clientName) {
    report.meta.clientName = job.clientName;
    changed = true;
  }
  if (job.languages && report.meta.languages?.join() !== job.languages.join()) {
    report.meta.languages = job.languages;
    changed = true;
  }
  if (changed) writeReport(slug, report);
  if (job.languages) {
    const outside = await outsideLanguages(report, job.url, job.languages);
    if (outside) job.message = `${outside}\n\n${job.message ?? ""}`.trim();
  }
  job.status = "done";
}

/**
 * Findings whose evidence points at a language version that was not chosen.
 * Only a warning: an hreflang finding rightly cites the other side of a broken
 * return link. Anything else there is a check that strayed out of scope.
 */
async function outsideLanguages(report: Report, url: string, languages: string[]): Promise<string | null> {
  let site;
  try {
    site = await detectLanguages(url);
  } catch (e) {
    return `Could not re-read the language versions to check the findings' evidence: ${(e as Error).message}`;
  }
  const chosen = pick(site, languages);
  const lines: string[] = [];
  for (const f of report.findings) {
    if (typeof f.evidence !== "string") continue;
    for (const [u] of f.evidence.matchAll(/https?:\/\/[^\s,;)"'<>]+/g)) {
      const v = versionOf(u, site.versions);
      if (v && !chosen.includes(v)) {
        lines.push(`• ${f.id}: ${u} (${v.langs[0]})`);
        break;
      }
    }
  }
  if (!lines.length) return null;
  return (
    `${lines.length} finding(s) cite pages outside the chosen language versions (${languages.join(", ")}). ` +
    `An hreflang return-link finding may do that; check any other before sending the report.\n${lines.join("\n")}`
  );
}

export function cancelAudit(id: string): AuditJob {
  const job = jobs.find((j) => j.id === id);
  if (!job) throw httpError(404, `No such audit: ${id}`);
  if (job.status !== "running") return job;
  job.status = "cancelled";
  job.endedAt = Date.now();
  job.message = "Cancelled. Any report it had already written is left as it was.";
  killChild();
  return job;
}

/** Kill the run and everything it started. */
export function killChild() {
  const proc = child;
  if (!proc?.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true });
  } else {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      proc.kill("SIGTERM");
    }
  }
}
