import { spawn } from "node:child_process";
import { ROOT } from "../store.js";
import { systemPrompt, userPrompt } from "./prompt.js";

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
function parseLoose(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export function available() {
  return true; // Presence of the binary is only knowable by running it.
}

export function translate(fields, { from, to, model, signal }) {
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

    child.on("error", (err) => {
      reject(
        err.code === "ENOENT"
          ? Object.assign(
              new Error(
                `Could not find the "claude" CLI on PATH. Install Claude Code, or ` +
                  `switch to the Claude API provider in Settings.`
              ),
              { status: 503 }
            )
          : err
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          Object.assign(
            new Error(`claude exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`),
            { status: 502 }
          )
        );
      }
      try {
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) {
          throw Object.assign(new Error(String(envelope.result ?? "claude reported an error")), {
            status: 502,
          });
        }
        resolve({
          translations: parseLoose(envelope.result),
          usage: { costUsd: envelope.total_cost_usd },
        });
      } catch (err) {
        reject(
          err.status
            ? err
            : Object.assign(
                new Error(`Could not read the translation back from claude: ${err.message}`),
                { status: 502 }
              )
        );
      }
    });

    child.stdin.end(userPrompt(fields));
  });
}
