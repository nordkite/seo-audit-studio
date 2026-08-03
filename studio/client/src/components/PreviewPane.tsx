import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { Lang, Report } from "@/lib/types";

/** A4 width in CSS pixels at 96dpi — report.css is authored in mm. */
const PAGE_PX = (210 / 25.4) * 96;

interface Props {
  report: Report;
  lang: Lang;
}

export function PreviewPane({ report, lang }: Props) {
  const [part, setPart] = useState<"body" | "cover">("body");
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    const t = setTimeout(() => {
      api
        .preview(lang, report, part)
        .then((h) => {
          if (cancelled) return;
          setHtml(h);
          setError(null);
        })
        .catch((e) => !cancelled && setError((e as Error).message))
        .finally(() => !cancelled && setPending(false));
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [report, lang, part]);

  // The report is laid out in millimetres. Render it at true page width and
  // scale the whole frame down, so line breaks fall where they will on paper —
  // letting the iframe reflow to the pane width would misreport the layout.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth - 32) / PAGE_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <Tabs value={part} onValueChange={(v) => setPart(v as "body" | "cover")}>
          <TabsList>
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="cover">Cover</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {pending && <Loader2 className="size-3 animate-spin" />}
          <span title="An iframe is one continuous flow — only the PDF shows real page breaks.">
            approximate · no page breaks
          </span>
        </div>
      </div>

      <div ref={boxRef} className="flex-1 overflow-auto bg-muted/40 p-4">
        {error ? (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: PAGE_PX,
              height: scale ? `calc(100% / ${scale})` : "100%",
            }}
          >
            {/*
              An iframe is a separate document: templates/report.css cannot
              reach the Studio's UI and Tailwind's preflight cannot reach the
              report. Never render this markup inline.
            */}
            <iframe
              title="Report preview"
              srcDoc={html}
              className="min-h-[297mm] w-full border-0 bg-white shadow-lg"
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>
    </div>
  );
}
