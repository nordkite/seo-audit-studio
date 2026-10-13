import { spawn } from "node:child_process";
import type { KeepAwake } from "./types.ts";

/**
 * Stop the machine idle-sleeping while process `pid` runs.
 *
 * A sleeping machine suspends the audit with it, and the network calls it had
 * open do not survive the wake. Each OS has its own way to hold sleep off, and
 * all three release it on their own when `pid` exits, so nothing has to clean
 * up after a crash.
 *
 * None of them stop sleep the user asks for: closing a laptop lid or picking
 * Sleep still suspends. The UI says so.
 *
 * Resolves `ok: false` when the helper is missing or exits straight away
 * (systemd-inhibit without a polkit grant, say), so the UI can warn instead.
 */
export function keepAwake(pid: number): Promise<KeepAwake> {
  const plan = helperFor(pid);
  if (!plan) {
    return Promise.resolve({ ok: false, method: "none", detail: `Not supported on ${process.platform}` });
  }

  return new Promise((resolve) => {
    const child = spawn(plan.cmd, plan.args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (c) => (stderr += c));

    // A helper that is still alive after a moment is holding sleep off.
    const settle = setTimeout(() => resolve({ ok: true, method: plan.method }), 1500);
    child.on("error", (e) => {
      clearTimeout(settle);
      resolve({ ok: false, method: plan.method, detail: e.message });
    });
    child.on("exit", (code) => {
      clearTimeout(settle);
      resolve({ ok: false, method: plan.method, detail: stderr.trim() || `exited with code ${code}` });
    });
  });
}

function helperFor(pid: number): { method: string; cmd: string; args: string[] } | null {
  switch (process.platform) {
    case "darwin":
      // -i idle sleep, -s system sleep while on AC power, -w until pid exits.
      return { method: "caffeinate", cmd: "caffeinate", args: ["-i", "-s", "-w", String(pid)] };

    case "win32": {
      // ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED. Display too,
      // because on Modern Standby laptops a screen turning off is enough to
      // put the machine into standby. The state belongs to the thread, so the
      // script holds it by blocking in Wait-Process until the audit ends.
      const script = [
        `$k = Add-Type -Name P -Namespace W -PassThru -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'`,
        `if ($k::SetThreadExecutionState([uint32]2147483651) -eq 0) { exit 1 }`,
        `Wait-Process -Id ${pid} -ErrorAction SilentlyContinue`,
      ].join("; ");
      return {
        method: "SetThreadExecutionState",
        cmd: "powershell.exe",
        args: ["-NoProfile", "-NonInteractive", "-Command", script],
      };
    }

    case "linux":
      return {
        method: "systemd-inhibit",
        cmd: "systemd-inhibit",
        args: [
          "--what=idle:sleep",
          "--who=SEO Audit Studio",
          "--why=SEO audit running",
          "--mode=block",
          "tail",
          `--pid=${pid}`,
          "-f",
          "/dev/null",
        ],
      };

    default:
      return null;
  }
}
