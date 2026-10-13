import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AuditJob } from "./types";

/**
 * The server's audit jobs, polled. Fast while one is running, slow otherwise.
 * Polling rather than a stream, so a tab that slept or a laptop that woke up
 * simply catches up on the next tick.
 */
export function useAudits(onFinished: (job: AuditJob) => void) {
  const [jobs, setJobs] = useState<AuditJob[]>([]);
  const seen = useRef(new Map<string, AuditJob["status"]>());
  const finished = useRef(onFinished);
  finished.current = onFinished;

  const refresh = useCallback(async () => {
    try {
      const { jobs: next } = await api.audits();
      for (const j of next) {
        // Only a transition we watched counts, not a job that was over before
        // the page loaded.
        if (seen.current.get(j.id) === "running" && j.status !== "running") finished.current(j);
        seen.current.set(j.id, j.status);
      }
      setJobs(next);
    } catch {
      /* server restarting; try again next tick */
    }
  }, []);

  const running = jobs.some((j) => j.status === "running");

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, running ? 2000 : 15000);
    return () => clearInterval(t);
  }, [refresh, running]);

  return { jobs, active: jobs.find((j) => j.status === "running") ?? null, latest: jobs[0] ?? null, refresh };
}

export function elapsed(job: AuditJob, now = Date.now()) {
  const s = Math.max(0, Math.round(((job.endedAt ?? now) - job.startedAt) / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

/** Site for a bare domain or homepage, page for anything with a path. */
export function guessScope(raw: string): "site" | "page" {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.pathname.replace(/\/+$/, "") === "" && !url.search ? "site" : "page";
  } catch {
    return "site";
  }
}

export function hostOf(raw: string) {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}
