// The report schema and the API shapes are defined once, server side, and
// shared with the client so the two cannot drift apart.
export * from "../../../../src/types.ts";
export * from "../../../lib/types.ts";
export * from "../../../../src/theme.ts";

import type { Effort, Provider, Scope } from "../../../lib/types.ts";

/** The client only offers `stale` (which includes missing) and `all`. */
export type ClientScope = Extract<Scope, "stale" | "all">;

export interface TranslateSettings {
  provider: Provider;
  /** Only ever held in localStorage and sent per request. Never persisted server-side. */
  apiKey: string;
  model: string;
  /** "" when the chosen model takes no effort setting; then none is sent. */
  effort: Effort | "";
  scope: ClientScope;
}
