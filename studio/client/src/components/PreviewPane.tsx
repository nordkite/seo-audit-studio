import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Palette } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemePanel } from "@/components/ThemePanel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BrandDoc, BrandTheme, Lang, Report } from "@/lib/types";

/** A4 width/height in CSS pixels at 96dpi — report.css is authored in mm. */
const PAGE_PX = (210 / 25.4) * 96;
const PAGE_HEIGHT_PX = (297 / 25.4) * 96;

interface Props {
  report: Report;
  lang: Lang;
  /** The language picker — owned by App, shown in this pane's header. */
  langPicker?: ReactNode;
}

export function PreviewPane({ report, lang, langPicker }: Props) {
  const [part, setPart] = useState<"body" | "cover">("body");
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scale, setScale] = useState(1);
  // brand.json's theme as saved, and the edit the preview is showing.
  const [brand, setBrand] = useState<BrandDoc | null>(null);
  const [theme, setTheme] = useState<BrandTheme | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  // Real height of the rendered document, measured after each load — the
  // report is a continuous flow with no page breaks, so it's rarely exactly
  // one A4 page tall. Falls back to one page while the iframe is (re)loading.
  const [contentHeight, setContentHeight] = useState(PAGE_HEIGHT_PX);
  const boxRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    api
      .brand()
      .then((b) => {
        setBrand(b);
        setTheme(b.theme);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const saveTheme = () => {
    if (!theme) return;
    setSavingTheme(true);
    api
      .saveBrand(theme)
      .then((b) => {
        setBrand(b);
        setTheme(b.theme);
        toast.success("Saved to brand.json");
      })
      .catch((e) => toast.error((e as Error).message, { duration: 8000 }))
      .finally(() => setSavingTheme(false));
  };

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    const t = setTimeout(() => {
      api
        .preview(lang, report, part, theme ?? undefined)
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
  }, [report, lang, part, theme]);

  // A different page is a different document: start it at the top. Edits to
  // the same page keep the reader where they were.
  useEffect(() => {
    boxRef.current?.scrollTo({ top: 0 });
  }, [part]);

  // The height of the content itself, not of the frame. scrollHeight never
  // reports less than the iframe's current height, so a shorter document would
  // inherit the old one's height. Resetting the frame to one page before each
  // reload avoided that, but collapsed the scroll box and threw the reader
  // back to the top on every keystroke. The root element's box is
  // content-sized whatever the frame is.
  const measureContent = () => {
    const root = iframeRef.current?.contentDocument?.documentElement;
    if (root) setContentHeight(Math.ceil(root.getBoundingClientRect().height));
  };

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
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          {langPicker}
          <Tabs value={part} onValueChange={(v) => setPart(v as "body" | "cover")}>
            <TabsList>
              <TabsTrigger value="body">Body</TabsTrigger>
              <TabsTrigger value="cover">Cover</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {pending && <Loader2 className="size-3 animate-spin" />}
          <span title="An iframe is one continuous flow — only the PDF shows real page breaks.">
            approximate · no page breaks
          </span>
          <Button
            variant="ghost"
            size="sm"
            title={`${part === "cover" ? "Cover" : "Body"} colors and logo`}
            aria-pressed={themeOpen}
            disabled={!brand}
            onClick={() => setThemeOpen((o) => !o)}
            className={cn("h-7 text-xs text-foreground", themeOpen && "bg-muted")}
          >
            <Palette /> Customize
          </Button>
        </div>
      </div>

      {themeOpen && brand && theme && (
        <ThemePanel
          part={part}
          saved={brand}
          draft={theme}
          saving={savingTheme}
          onChange={setTheme}
          onReset={() => setTheme(brand.theme)}
          onSave={saveTheme}
        />
      )}

      <div ref={boxRef} className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4">
        {error ? (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          // The outer box carries the real (scaled) footprint so the
          // scrollable ancestor sizes to what's actually visible — a
          // `transform: scale()` on a box does not shrink its layout size,
          // only its paint, so scrolling against that box directly leaves a
          // dead zone below the true bottom of the page.
          <div style={{ width: PAGE_PX * scale, height: contentHeight * scale }}>
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: PAGE_PX,
                height: contentHeight,
              }}
            >
              {/*
                An iframe is a separate document: templates/report.css cannot
                reach the Studio's UI and Tailwind's preflight cannot reach the
                report. Never render this markup inline.
              */}
              <iframe
                ref={iframeRef}
                title="Report preview"
                srcDoc={html}
                onLoad={measureContent}
                className="h-full w-full border-0 bg-white shadow-lg"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
