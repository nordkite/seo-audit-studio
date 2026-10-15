import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { LANG_LABEL } from "@/lib/report";
import type { Doc, Lang, TranslateProgress, TranslateResult, TranslateSettings } from "@/lib/types";

interface Props {
  slug: string;
  lang: Lang | null;
  settings: TranslateSettings;
  onClose: () => void;
  onDone: (doc: Doc) => void;
}

/**
 * Runs one translation and reports what it did.
 *
 * A single POST whose response streams progress after each batch. Not an
 * EventSource: the previous version held one open while an agent edited the
 * file field by field; it re-opened on every parent re-render, and each
 * re-open started the work again from scratch.
 */
export function TranslateDialog({ slug, lang, settings, onClose, onDone }: Props) {
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TranslateProgress | null>(null);

  // Read through a ref so the request is not part of the effect's identity:
  // a changed callback or a re-rendered parent must never re-fire it.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!lang) return;

    const abort = new AbortController();
    setResult(null);
    setError(null);
    setProgress(null);
    setBusy(true);

    api
      .translate(slug, lang, settingsRef.current, setProgress, abort.signal)
      .then((r) => {
        setResult(r);
        onDoneRef.current(r.doc);
      })
      .catch((e) => {
        if (abort.signal.aborted) return;
        setError((e as Error).message);
      })
      .finally(() => setBusy(false));

    return () => abort.abort();
  }, [slug, lang]);

  const usage = result?.usage;

  return (
    <Dialog open={lang !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {busy ? "Translating" : error ? "Translation failed" : "Translated"} into{" "}
            {lang ? LANG_LABEL[lang] : ""}
          </DialogTitle>
          <DialogDescription>
            {settings.provider === "api"
              ? "Claude API, using your key."
              : "Claude Code, using your subscription."}
            {busy && " Editing is locked until it finishes."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-24 space-y-2 text-sm">
          {busy && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {progress
                  ? `${progress.fieldsDone} of ${progress.fields} fields translated`
                  : "Reading the report…"}
                {progress && progress.batches > 1 && (
                  <span className="ml-auto text-xs tabular-nums">
                    {progress.batchesDone}/{progress.batches} requests done
                  </span>
                )}
              </div>
              {progress && (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{
                      width: `${(progress.fieldsDone / Math.max(progress.fields, 1)) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {error && <p className="whitespace-pre-wrap text-destructive">{error}</p>}

          {result && !error && (
            <>
              <p className="flex items-center gap-2">
                <Check className="size-4 text-sev-pass" />
                {result.filled === 0
                  ? "Nothing needed translating."
                  : `${result.filled} field${result.filled === 1 ? "" : "s"} translated in ${
                      result.batches
                    } request${result.batches === 1 ? "" : "s"}.`}
              </p>

              {result.missing.length > 0 && (
                <p className="flex items-start gap-2 text-sev-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {result.missing.length} field
                    {result.missing.length === 1 ? "" : "s"} came back empty and stayed
                    untranslated. Run it again to pick them up.
                  </span>
                </p>
              )}

              {usage && (usage.costUsd != null || usage.output != null) && (
                <p className="text-xs text-muted-foreground">
                  {usage.costUsd != null &&
                    `≈ $${usage.costUsd.toFixed(3)}${
                      settings.provider === "api" ? "" : " at API prices, not billed"
                    }`}
                  {usage.input != null &&
                    `${usage.costUsd != null ? " · " : ""}${usage.input} in / ${usage.output} out tokens`}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant={result && !error ? "default" : "outline"} onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
