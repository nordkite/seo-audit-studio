import { useEffect, useRef, useState } from "react";
import { Loader2, Languages } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Doc, Lang } from "@/lib/types";
import { LANG_LABEL } from "@/lib/report";

interface LogLine {
  kind: string;
  text?: string;
  parts?: LogLine[];
  cost?: number;
}

interface Props {
  slug: string;
  lang: Lang | null;
  onClose: () => void;
  onDone: (doc: Doc) => void;
}

/**
 * Runs the real /translate-report slash command via the claude CLI and streams
 * its progress. The editor is locked while this runs: the command rewrites the
 * JSON on disk, so an in-flight buffer would overwrite the translations on the
 * next save.
 */
export function TranslateDialog({ slug, lang, onClose, onDone }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [state, setState] = useState<"running" | "done" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lang) return;
    setLines([]);
    setState("running");
    setError(null);

    const es = new EventSource(`/api/translate/${slug}/${lang}`);
    const push = (l: LogLine) => setLines((prev) => [...prev, l]);

    es.addEventListener("start", () => push({ kind: "system", text: "starting claude…" }));
    es.addEventListener("log", (e) => push(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("done", (e) => {
      onDone(JSON.parse((e as MessageEvent).data));
      setState("done");
      es.close();
    });
    es.addEventListener("error", (e) => {
      const raw = (e as MessageEvent).data;
      setError(raw ? JSON.parse(raw).message : "Connection to the translate stream was lost.");
      setState("error");
      es.close();
    });

    return () => es.close();
  }, [slug, lang, onDone]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  const flat = lines.flatMap((l) => (l.parts ? l.parts : [l]));

  return (
    <Dialog open={lang !== null} onOpenChange={(open) => !open && state !== "running" && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="size-4" />
            Translating into {lang ? LANG_LABEL[lang] : ""}
          </DialogTitle>
          <DialogDescription>
            Running <code className="text-xs">/translate-report {slug} {lang}</code> through the
            Claude Code CLI. Editing is locked until it finishes.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={logRef}
          className="h-72 space-y-1 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs"
        >
          {flat.map((l, i) => (
            <div
              key={i}
              className={cn(
                "leading-relaxed whitespace-pre-wrap",
                l.kind === "tool" && "text-sev-opportunity",
                l.kind === "system" && "text-muted-foreground",
                l.kind === "stderr" && "text-destructive",
                l.kind === "result" && "text-sev-pass"
              )}
            >
              {l.kind === "tool" ? `→ ${l.text}` : l.text}
              {l.cost != null && (
                <span className="ml-2 text-muted-foreground">(${l.cost.toFixed(3)})</span>
              )}
            </div>
          ))}
          {state === "running" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> working…
            </div>
          )}
          {error && <div className="mt-2 whitespace-pre-wrap text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant={state === "done" ? "default" : "outline"} onClick={onClose} disabled={state === "running"}>
            {state === "running" ? "Running…" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
