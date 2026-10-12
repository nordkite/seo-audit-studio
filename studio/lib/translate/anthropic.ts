import Anthropic from "@anthropic-ai/sdk";
import { httpError } from "../store.ts";
import {
  systemPrompt,
  userPrompt,
  type PendingField,
  type ProviderReply,
  type TranslateOptions,
} from "./prompt.ts";
import { EFFORTS, type Effort, type ModelOption, type ModelsResult } from "../types.ts";

/**
 * Translate through the Claude API with a caller-supplied key.
 *
 * The key arrives per request and is never stored: not on disk, not in the
 * report, not in the backups, not in a log line. That is the whole point of
 * this provider — it is the path that survives becoming a hosted multi-user
 * tool, where "whose key is this" has to be answered per request anyway.
 */

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Shown when there is no key to ask the Models API with, or the call fails. */
const FALLBACK: ModelOption[] = [
  { value: "claude-opus-5-5", label: "Claude Opus 5.5", efforts: [...EFFORTS] },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", efforts: [...EFFORTS] },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5", efforts: [...EFFORTS] },
];

function effortsOf(model: Anthropic.ModelInfo): Effort[] {
  const effort = model.capabilities?.effort;
  // No capability data at all: assume the full range rather than hide the control.
  if (!effort) return [...EFFORTS];
  if (!effort.supported) return [];
  return EFFORTS.filter((level) => effort[level]?.supported);
}

/**
 * Every model this key can call, newest first, as the API reports it. The
 * key is used for this one request and not kept, same as for translate().
 */
export async function listModels({ apiKey }: { apiKey?: string }): Promise<ModelsResult> {
  const withDefault = (models: ModelOption[]): ModelOption[] => {
    const def = models.find((m) => m.value === DEFAULT_MODEL);
    return [
      { value: "", label: `Default — ${DEFAULT_MODEL}`, efforts: def?.efforts ?? [...EFFORTS] },
      ...models,
    ];
  };

  if (!available({ apiKey })) {
    return { models: withDefault(FALLBACK), source: "fallback", error: "Add an API key to list your models." };
  }

  try {
    const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
    const models: ModelOption[] = [];
    for await (const m of client.models.list()) {
      models.push({ value: m.id, label: `${m.display_name} — ${m.id}`, efforts: effortsOf(m) });
    }
    return { models: withDefault(models), source: "live" };
  } catch (err) {
    const e = friendly(err) as Error;
    return { models: withDefault(FALLBACK), source: "fallback", error: e.message };
  }
}

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

function friendly(err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError) {
    return httpError(401, "The Claude API key was rejected. Check it in Settings.");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return httpError(403, "That key exists but is not allowed to call the Messages API.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return httpError(429, "Claude API rate limit hit. Wait a moment and translate again.");
  }
  if (err instanceof Anthropic.APIError) {
    return httpError(502, `Claude API error ${err.status}: ${err.message}`);
  }
  return err;
}

export function available({ apiKey }: { apiKey?: string }): boolean {
  return Boolean(apiKey || process.env.ANTHROPIC_API_KEY);
}

export async function translate(
  fields: PendingField[],
  { from, to, apiKey, model = DEFAULT_MODEL, effort }: TranslateOptions
): Promise<ProviderReply> {
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
        // Omitted for models that reject the parameter; the client only sends
        // a level the chosen model listed as supported.
        ...(effort ? { effort } : {}),
        format: { type: "json_schema", schema: SCHEMA },
      },
    });

    if (message.stop_reason === "max_tokens") {
      throw httpError(502, "Claude ran out of output space mid-batch. Try translating again.");
    }

    const block = message.content.find((b) => b.type === "text");
    const { translations }: { translations: { key: string; text: string }[] } = JSON.parse(
      block?.type === "text" ? block.text : ""
    );

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
