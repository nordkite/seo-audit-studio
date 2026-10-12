import { useCallback, useState } from "react";
import type { TranslateSettings } from "./types";

const KEY = "seo-audit-studio-translate";

const DEFAULTS: TranslateSettings = {
  provider: "cli",
  apiKey: "",
  model: "",
  scope: "stale",
};

/**
 * Translation settings, including the API key.
 *
 * localStorage, not the server: the key belongs to whoever is sitting here, and
 * the server has no user to file it under. When this becomes multi-user the key
 * moves to a per-user record and only this hook changes — the request shape and
 * the provider modules stay as they are.
 */
export function useTranslateSettings() {
  const [settings, setSettings] = useState<TranslateSettings>(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return DEFAULTS;
    }
  });

  const update = useCallback((patch: Partial<TranslateSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return [settings, update] as const;
}
