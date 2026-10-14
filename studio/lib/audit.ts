import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { validate } from "../../src/validate.ts";
import { ROOT, backup, httpError, reportPath, writeReport } from "./store.ts";
import { keepAwake } from "./keep-awake.ts";
import { CLAUDE_BIN } from "./translate/cli.ts";
import type { AuditJob, AuditRequest, AuditStep, DoctorCheck, Preflight } from "./types.ts";

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

  const check = await preflight();
  if (!check.ok) {
    const failed = check.checks.filter((c) => c.required && !c.ok);
    throw httpError(
      412,
      `Preflight failed: ${failed.map((c) => `${c.name}${c.fix ? ` (${c.fix})` : ""}`).join("; ")}`
    );
  }

  const command = COMMAND[scope];
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`;
  mkdirSync(LOGS, { recursive: true });
  const logPath = join(LOGS, `${id}.jsonl`);
  const log = createWriteStream(logPath);

  const job: AuditJob = {
    id,
    url,
    scope,
    clientName,
    status: "running",
    startedAt: Date.now(),
    steps: [],
    keepAwake: null,
    log: relative(ROOT, logPath),
  };
  jobs.unshift(job);
  jobs.splice(KEEP_JOBS);

  const step = (text: string, nested = false) => {
    const s: AuditStep = { at: Date.now(), text, ...(nested ? { nested } : {}) };
    job.steps.push(s);
    if (job.steps.length > MAX_STEPS) job.steps.splice(0, job.steps.length - MAX_STEPS);
  };

  // The agent writes the report file directly, past the Studio's own backups,
  // and /new-audit overwrites a report of the same site without asking. Keep
  // a copy of the one it is most likely to replace.
  if (scope === "site") {
    const slug = new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/g, "-");
    if (existsSync(reportPath(slug))) {
      backup(reportPath(slug), slug);
      step(`Backed up the existing reports/${slug}.json to .studio-backups/${slug}/`);
    }
  }

  const before = reportMtimes();
  step(`Starting /${command} ${url}`);

  const proc = spawn(
    CLAUDE_BIN,
    [
      "-p",
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
      // Its own process group, so cancelling takes Bash children down too.
      // Not on Windows, where detached means a new console window.
      detached: process.platform !== "win32",
      windowsHide: true,
    }
  );
  child = proc;

  // The prompt goes in on stdin: --allowedTools takes a list and would swallow
  // a positional prompt after it.
  proc.stdin.end(`/${command} ${url}`);

  if (proc.pid) {
    keepAwake(proc.pid).then((k) => {
      job.keepAwake = k;
      if (!k.ok) step(`Could not keep the computer awake (${k.method}: ${k.detail ?? "failed"})`);
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
    if (ev.type === "assistant") {
      const nested = Boolean(ev.parent_tool_use_id);
      for (const block of ev.message?.content ?? []) {
        if (block.type !== "tool_use") continue;
        const text = describe(block.name, block.input ?? {});
        if (text) step(text, nested);
      }
    } else if (ev.type === "result") {
      job.costUsd = ev.total_cost_usd;
      job.message = typeof ev.result === "string" ? ev.result.trim() : undefined;
      if (ev.is_error) job.status = "failed";
      // A denied call is a check that never ran. Say so, so it does not pass
      // unnoticed into a client report.
      const denied: { tool_name: string; tool_input?: Record<string, unknown> }[] = ev.permission_denials ?? [];
      for (const d of denied) {
        step(`Permission denied: ${d.tool_name} ${short(d.tool_input?.command ?? d.tool_input?.url ?? "", 70)}`);
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
    finish(job, before);
  });

  return job;
}

/**
 * The run is only a success if it left a report the renderer will accept.
 * The newest report file written since the start is taken to be its output.
 */
function finish(job: AuditJob, before: Map<string, number>) {
  const written = [...reportMtimes()]
    .filter(([slug, mtime]) => mtime > (before.get(slug) ?? 0) && mtime >= job.startedAt)
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
  try {
    const report = JSON.parse(readFileSync(path, "utf8"));
    validate(report, path);
    // The agent derives a name from the site; the one typed in the Studio wins.
    if (job.clientName && report.meta.clientName !== job.clientName) {
      report.meta.clientName = job.clientName;
      writeReport(slug, report);
    }
    job.status = "done";
  } catch (e) {
    job.status = "failed";
    job.message = `reports/${slug}.json was written but is not valid: ${(e as Error).message}`;
  }
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
