import type {
  Doc,
  Health,
  Lang,
  Report,
  ReportSummary,
  TranslateResult,
  TranslateSettings,
} from "./types";

async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let message = res.statusText;
  try {
    message = (await res.json()).error ?? message;
  } catch {
    /* non-JSON error body — keep the status text */
  }
  throw new Error(message);
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const api = {
  list: () => fetch("/api/reports").then((r) => unwrap<{ reports: ReportSummary[] }>(r)),

  get: (slug: string) => fetch(`/api/report/${slug}`).then((r) => unwrap<Doc>(r)),

  save: (slug: string, report: Report, mtime: number) =>
    fetch(`/api/report/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, mtime }),
    }).then((r) => unwrap<Doc>(r)),

  create: (body: { slug: string; site: string; clientName: string; siteUrl?: string }) =>
    post("/api/reports", body).then((r) => unwrap<Doc>(r)),

  upload: (slug: string, file: File) =>
    fetch(`/api/upload/${slug}`, {
      method: "POST",
      headers: { "x-filename": file.name },
      body: file,
    }).then((r) => unwrap<{ src: string }>(r)),

  health: () => fetch("/api/health").then((r) => unwrap<Health>(r)),

  /**
   * The API key travels in the body, not the URL — URLs end up in logs and
   * browser history. The server hands it straight to the provider and keeps
   * no copy.
   */
  translate: (slug: string, lang: Lang, settings: TranslateSettings, signal?: AbortSignal) =>
    fetch(`/api/translate/${slug}/${lang}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
      signal,
    }).then((r) => unwrap<TranslateResult>(r)),

  render: (slug: string, langs: Lang[]) =>
    post(`/api/render/${slug}`, { langs }).then((r) =>
      unwrap<{ code: number; stdout: string; stderr: string }>(r)
    ),

  /** Renders the editor's live buffer, so the preview never lags a save behind. */
  preview: async (lang: Lang, report: Report, part: "body" | "cover") => {
    const res = await post(`/api/preview/${lang}`, { report, part });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    return res.text();
  },
};
