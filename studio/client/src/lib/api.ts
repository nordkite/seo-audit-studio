import type {
  AuditJob,
  AuditRequest,
  BrandDoc,
  BrandTheme,
  Doc,
  Health,
  Lang,
  ModelsResult,
  Preflight,
  Provider,
  Report,
  ReportSummary,
  TranslateEvent,
  TranslateProgress,
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

  remove: (slug: string) =>
    fetch(`/api/report/${slug}`, { method: "DELETE" }).then((r) => unwrap<{ ok: true }>(r)),

  create: (body: { slug: string; site: string; clientName: string; siteUrl?: string }) =>
    post("/api/reports", body).then((r) => unwrap<Doc>(r)),

  upload: (slug: string, file: File) =>
    fetch(`/api/upload/${slug}`, {
      method: "POST",
      headers: { "x-filename": file.name },
      body: file,
    }).then((r) => unwrap<{ src: string }>(r)),

  health: () => fetch("/api/health").then((r) => unwrap<Health>(r)),

  /** POST, not GET, so the API key stays out of the URL. */
  models: (provider: Provider, apiKey: string, signal?: AbortSignal) =>
    fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
      signal,
    }).then((r) => unwrap<ModelsResult>(r)),

  /**
   * The API key travels in the body, not the URL — URLs end up in logs and
   * browser history. The server hands it straight to the provider and keeps
   * no copy.
   */
  translate: async (
    slug: string,
    lang: Lang,
    settings: TranslateSettings,
    onProgress: (p: TranslateProgress) => void,
    signal?: AbortSignal
  ): Promise<TranslateResult> => {
    const res = await fetch(`/api/translate/${slug}/${lang}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
      signal,
    });
    // A failure before the work starts is a plain JSON error, not a stream.
    if (!res.ok || !res.body) return unwrap<TranslateResult>(res);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as TranslateEvent;
        if (event.type === "progress") onProgress(event);
        else if (event.type === "result") return event.result;
        else throw new Error(event.error);
      }
    }
    throw new Error("The translation stopped without a result.");
  },

  render: (slug: string, langs: Lang[]) =>
    post(`/api/render/${slug}`, { langs }).then((r) =>
      unwrap<{ code: number; stdout: string; stderr: string }>(r)
    ),

  preflight: () => fetch("/api/audits/preflight").then((r) => unwrap<Preflight>(r)),

  audits: () => fetch("/api/audits").then((r) => unwrap<{ jobs: AuditJob[] }>(r)),

  startAudit: (body: AuditRequest) => post("/api/audits", body).then((r) => unwrap<AuditJob>(r)),

  cancelAudit: (id: string) =>
    fetch(`/api/audits/${id}`, { method: "DELETE" }).then((r) => unwrap<AuditJob>(r)),

  brand: () => fetch("/api/brand").then((r) => unwrap<BrandDoc>(r)),

  /** Writes the theme into brand/brand.json. Every other brand field is left as it is. */
  saveBrand: (theme: BrandTheme) =>
    fetch("/api/brand", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    }).then((r) => unwrap<BrandDoc>(r)),

  /**
   * Renders the editor's live buffer, so the preview never lags a save behind.
   * A `theme` previews brand colors that have not been saved yet.
   */
  preview: async (lang: Lang, report: Report, part: "body" | "cover", theme?: BrandTheme) => {
    const res = await post(`/api/preview/${lang}`, { report, part, theme });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    return res.text();
  },
};
