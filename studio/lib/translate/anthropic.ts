import Anthropic from "@anthropic-ai/sdk";
import { systemPrompt, userPrompt } from "./prompt.js";

/**
 * Translate through the Claude API with a caller-supplied key.
 *
 * The key arrives per request and is never stored: not on disk, not in the
 * report, not in the backups, not in a log line. That is the whole point of
 * this provider — it is the path that survives becoming a hosted multi-user
 * tool, where "whose key is this" has to be answered per request anyway.
 */

export const DEFAULT_MODEL = "claude-opus-5";

/** Stable across every report, so the schema cache keeps hitting. A schema of
 *  `{ [path]: string }` would change shape per report and recompile each time. */
const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          text: { type: "string" },
        },
        required: ["key", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

function friendly(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return Object.assign(new Error("The Claude API key was rejected. Check it in Settings."), {
      status: 401,
    });
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return Object.assign(
      new Error("That key exists but is not allowed to call the Messages API."),
      { status: 403 }
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return Object.assign(
      new Error("Claude API rate limit hit. Wait a moment and translate again."),
      { status: 429 }
    );
  }
  if (err instanceof Anthropic.APIError) {
    return Object.assign(new Error(`Claude API error ${err.status}: ${err.message}`), {
      status: 502,
    });
  }
  return err;
}

export function available({ apiKey }) {
  return Boolean(apiKey || process.env.ANTHROPIC_API_KEY);
}

export async function translate(fields, { from, to, apiKey, model = DEFAULT_MODEL }) {
  const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 16000,
      system: systemPrompt(
        from,
        to,
        "Return one entry per input key, each with the key verbatim and its translated text."
      ),
      messages: [{ role: "user", content: userPrompt(fields) }],
      output_config: {
        // Translation is a constrained rewrite, not a reasoning problem — the
        // rules are all in the system prompt. Low effort keeps latency and
        // cost down without touching output quality.
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
    });

    if (message.stop_reason === "max_tokens") {
      throw Object.assign(
        new Error("Claude ran out of output space mid-batch. Try translating again."),
        { status: 502 }
      );
    }

    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    const { translations } = JSON.parse(text);

    return {
      translations: Object.fromEntries(translations.map((t) => [t.key, t.text])),
      usage: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
      },
    };
  } catch (err) {
    throw friendly(err);
  }
}
