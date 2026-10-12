import { spawn } from "node:child_process";
import { ROOT, httpError } from "../store.ts";
import {
  systemPrompt,
  userPrompt,
  type PendingField,
  type ProviderReply,
  type TranslateOptions,
} from "./prompt.ts";
import { EFFORTS, type ModelsResult } from "../types.ts";

/**
 * Translate through the `claude` CLI, on the user's Claude Code login.
 *
 * No API key: Claude Code authenticates with a Claude.ai subscription, so this
 * draws on the subscription's quota. That is the only way to translate without
 * anyone paying per token, which makes it the right default for local single-
 * user work — and unusable for a hosted tool, where one login cannot serve many
 * people. Hence the API provider beside it.
 *
 * Deliberately not an agent run. `--allowedTools ""` and a replaced system
 * prompt turn Claude Code into a plain one-shot model call: text in, text out,
 * one turn. The earlier design let it read and Edit the report itself, which
 * meant ~108 tool calls against a 52 KB file per language — minutes of wall
 * clock, and a heartbeat stream the UI could not tell apart from a hang.
 */

const OUTPUT_SHAPE = `Reply with a JSON object mapping each input key to its translated string, and nothing else.
No prose, no explanation, no markdown code fence.`;

export const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

/** Strip a ```json fence if the model added one anyway. */
function parseLoose(text: unknown): Record<string, string> {
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export function available(): boolean {
  return true; // Presence of the binary is only knowable by running it.
}

/**
 * Claude Code has no command that lists models, but its aliases always resolve
 * to the newest model of each family your plan can use, so this list never
 * goes stale. "" leaves --model off and uses whatever Claude Code is set to.
 */
export function listModels(): ModelsResult {
  const all = [...EFFORTS];
  return {
    source: "aliases",
    models: [
      { value: "", label: "Default — your Claude Code model", efforts: all },
      { value: "fable", label: "Fable — most capable", efforts: all },
      { value: "opus", label: "Opus — latest", efforts: all },
      { value: "sonnet", label: "Sonnet — latest", efforts: all },
      { value: "haiku", label: "Haiku — latest", efforts: all },
    ],
  };
}

export function translate(
  fields: PendingField[],
  { from, to, model, effort, signal }: TranslateOptions
): Promise<ProviderReply> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--system-prompt",
      systemPrompt(from, to, OUTPUT_SHAPE),
      // No tools at all: this is a translation call, not an agent session.
      "--allowedTools",
      "",
      ...(model ? ["--model", model] : []),
      ...(effort ? ["--effort", effort] : []),
    ];

    const child = spawn(CLAUDE_BIN, args, {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });

    signal?.addEventListener("abort", () => child.kill(), { once: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));

    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? httpError(
              503,
              `Could not find the "claude" CLI on PATH. Install Claude Code, or ` +
                `switch to the Claude API provider in Settings.`
            )
          : err
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          httpError(502, `claude exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`)
        );
      }
      try {
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) {
          throw httpError(502, String(envelope.result ?? "claude reported an error"));
        }
        resolve({
          translations: parseLoose(envelope.result),
          usage: { costUsd: envelope.total_cost_usd },
        });
      } catch (err) {
        const e = err as Error & { status?: number };
        reject(
          e.status
            ? e
            : httpError(502, `Could not read the translation back from claude: ${e.message}`)
        );
      }
    });

    child.stdin.end(userPrompt(fields));
  });
}
