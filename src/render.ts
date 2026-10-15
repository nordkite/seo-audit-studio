import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadStrings, t, formatDate, formatNumber, type Strings } from "./i18n.ts";
import { loadBrand, type Brand } from "./brand.ts";
import type { LogoVariant, Surface } from "./theme.ts";
import {
  CATEGORIES,
  DATA_SOURCES,
  LIGHTHOUSE,
  SEVERITIES,
  type CoreWebVitalsMetrics,
  type Finding,
  type Lang,
  type Meta,
  type Report,
  type SearchConsoleMetrics,
  type Section,
  type Severity,
  type SourceStatus,
} from "./types.ts";

const ROOT = join(import.meta.dirname, "..");

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const esc = (s: unknown): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The brand mark a surface asks for. With no dark variant, `logoOnDark` knocks
 * the regular logo out to white (see .logo--knockout); with no logo at all, the
 * brand name stands in as a wordmark.
 */
function logo(brand: Brand, variant: LogoVariant): string {
  const onDark = variant === "logoOnDark";
  if (onDark && brand.logoOnDark) return `<img src="${esc(brand.logoOnDark)}" alt="${esc(brand.name)}">`;
  if (brand.logo) {
    const knockout = onDark ? ` class="logo--knockout"` : "";
    return `<img${knockout} src="${esc(brand.logo)}" alt="${esc(brand.name)}">`;
  }
  return `<span class="wordmark">${esc(brand.name)}</span>`;
}

/** The brand's website as a link, or its name when it has none. */
function brandLink(brand: Brand): string {
  return brand.website
    ? `<a href="${esc(brand.website)}">${esc(brand.websiteLabel)}</a>`
    : esc(brand.name);
}

/** "SEO Audit Report", or "SEO Page Audit" when the report covers one URL. */
function kicker(report: Report, s: Strings): string {
  return report.meta.scope === "page" ? s.doc.kickerPage : s.doc.kicker;
}

/**
 * Inline an image as a data URI.
 *
 * Same constraint as the logo: pdf.ts loads HTML through setContent(), which
 * has no base URL, so a relative src resolves to nothing and Chrome drops the
 * image without erroring. Anything the PDF draws must be embedded in the markup.
 */
function dataUri(relPath: string): string {
  const ext = String(relPath).split(".").pop()!.toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    throw new Error(
      `Unsupported image type ".${ext}" (${relPath}). Supported: ${Object.keys(MIME).join(", ")}`
    );
  }

  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`Image not found: ${relPath}`);

  return `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
}

type Band = "excellent" | "good" | "needsWork" | "critical";

function scoreBand(score: number): Band {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "needsWork";
  return "critical";
}

/** Score bands borrow the severity palette, so a 54 reads as the same amber as a warning. */
function bandTone(band: Band): string {
  return {
    excellent: "var(--pass)",
    good: "var(--pass)",
    needsWork: "var(--warning)",
    critical: "var(--critical)",
  }[band];
}

/** Lucide geometry (24×24, stroked). Drawn inline: the PDF cannot load an icon font. */
const ICON_PATHS = {
  critical: `<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>`,
  warning: `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`,
  opportunity: `<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>`,
  pass: `<path d="M20 6 9 17l-5-5"/>`,
  notCovered: `<circle cx="12" cy="12" r="10" stroke-dasharray="3.2 3.2"/><path d="M8 12h8"/>`,
} as const;

function icon(name: keyof typeof ICON_PATHS): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

function scoreDial(score: number, band: Band, s: Strings): string {
  const C = 2 * Math.PI * 50;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * C;
  return `
    <svg class="dial" viewBox="0 0 120 120" role="img" aria-label="${score}/100">
      <circle class="dial__track" cx="60" cy="60" r="50"></circle>
      <circle class="dial__value" cx="60" cy="60" r="50"
              style="stroke: ${bandTone(band)}"
              stroke-dasharray="${filled.toFixed(2)} ${(C - filled).toFixed(2)}"></circle>
      <text class="dial__number" x="60" y="66">${score}</text>
      <text class="dial__unit" x="60" y="82">${esc(s.score.outOf)}</text>
    </svg>`;
}

/** Impact or effort as a three-step meter plus its word: low ▂, medium ▂▄, high ▂▄▆. */
function level(label: string, value: string, word: string): string {
  const on = { low: 1, medium: 2, high: 3 }[value] ?? 0;
  const bars = [1, 2, 3].map((i) => `<i${i <= on ? ` class="on"` : ""}></i>`).join("");
  return `
        <span class="level">
          <span class="level__k">${esc(label)}</span>
          <span class="meter" aria-hidden="true">${bars}</span>
          <span class="level__v">${esc(word)}</span>
        </span>`;
}

function evidenceBlock(f: Finding, lang: Lang, sourceLang: Lang, s: Strings): string {
  if (!f.evidence) return "";
  // Evidence is either a verbatim technical reference (URL, filename — plain
  // string, never translated) or descriptive prose ("all pages" — an
  // {en,et,ru} object). t() resolves both.
  const verbatim = typeof f.evidence === "string";
  return `
      <div class="evidence${verbatim ? " evidence--verbatim" : ""}">
        <span class="evidence__k">${esc(s.meta.evidence)}</span>
        <span class="evidence__v">${esc(t(f.evidence, lang, sourceLang))}</span>
      </div>`;
}

function findingCard(f: Finding, lang: Lang, sourceLang: Lang, s: Strings): string {
  const levels = [
    f.impact ? level(s.meta.impact, f.impact, s.meta[f.impact] ?? f.impact) : "",
    f.effort ? level(s.meta.effort, f.effort, s.meta[f.effort] ?? f.effort) : "",
  ].join("");
  const body = f.body ? t(f.body, lang, sourceLang) : "";

  return `
    <article class="finding t-${f.severity}">
      <div class="finding__icon">${icon(f.severity)}</div>
      <div class="finding__main">
        <div class="finding__head">
          <h3>${esc(t(f.title, lang, sourceLang))}</h3>
          ${levels ? `<div class="levels">${levels}</div>` : ""}
        </div>
        ${body ? `<p class="finding__body">${esc(body)}</p>` : ""}
        ${evidenceBlock(f, lang, sourceLang, s)}
      </div>
    </article>`;
}

/** A passing finding: one checklist row. Its body is never shown — nothing to act on. */
function checkRow(f: Finding, lang: Lang, sourceLang: Lang, s: Strings): string {
  return `
      <li class="check t-pass">
        <span class="check__icon">${icon("pass")}</span>
        <div>
          <h3>${esc(t(f.title, lang, sourceLang))}</h3>
          ${evidenceBlock(f, lang, sourceLang, s)}
        </div>
      </li>`;
}

function severitySection(
  sev: Severity,
  findings: Finding[],
  lang: Lang,
  sourceLang: Lang,
  s: Strings,
  { breakBefore }: { breakBefore: boolean }
): string {
  const items = findings.filter((f) => f.severity === sev);
  if (!items.length) return "";

  const list =
    sev === "pass"
      ? `<ul class="checks">${items.map((f) => checkRow(f, lang, sourceLang, s)).join("")}</ul>`
      : items.map((f) => findingCard(f, lang, sourceLang, s)).join("");

  return `
    <section class="section${breakBefore ? " section--break" : ""}">
      <div class="section__head t-${sev}">
        <span class="section__icon">${icon(sev)}</span>
        <h2>${esc(s.sections[sev])}</h2>
        <span class="section__count">${items.length} ${esc(s.counts[sev])}</span>
      </div>
      <p class="section__hint">${esc(s.sectionHints[sev])}</p>
      ${list}
    </section>`;
}

/**
 * A hand-authored section — prose, an image, or both. Unlike findings these
 * carry no severity and no audit metadata; they exist so a report can show
 * something a finding card cannot, such as a SERP screenshot.
 */
function customSection(sec: Section, lang: Lang, sourceLang: Lang): string {
  const img = sec.image;
  const figure = img?.src
    ? `
      <figure class="figure">
        <img src="${dataUri(img.src)}" alt="${esc(t(img.alt, lang, sourceLang))}">
        ${img.caption ? `<figcaption>${esc(t(img.caption, lang, sourceLang))}</figcaption>` : ""}
      </figure>`
    : "";

  return `
    <section class="section${sec.breakBefore ? " section--break" : ""}">
      <div class="section__head"><h2>${esc(t(sec.title, lang, sourceLang))}</h2></div>
      ${sec.body ? `<p class="custom__body">${esc(t(sec.body, lang, sourceLang))}</p>` : ""}
      ${figure}
    </section>`;
}

/**
 * Core Web Vitals thresholds (p75), per web.dev. LCP and INP in ms, CLS unitless.
 */
const CWV = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
};

type CwvMetric = keyof typeof CWV;
type Rating = "good" | "needsImprovement" | "poor";

function cwvRating(metric: CwvMetric, value: number): Rating {
  const th = CWV[metric];
  if (value <= th.good) return "good";
  if (value <= th.poor) return "needsImprovement";
  return "poor";
}

/** A rating borrows the severity tone it reads as. */
const RATING_TONE: Record<Rating, Severity> = {
  good: "pass",
  needsImprovement: "warning",
  poor: "critical",
};

function metricCell(
  value: string,
  label: string,
  { tone, sub }: { tone?: Severity; sub?: string } = {}
): string {
  return `
      <div class="glance__cell${tone ? ` t-${tone}` : ""}">
        <div class="glance__label">${esc(label)}</div>
        <div class="glance__n">${esc(value)}</div>
        ${sub ? `<div class="glance__sub"><span class="dot"></span>${esc(sub)}</div>` : ""}
      </div>`;
}

const numberFormat =
  (locale: string) =>
  (v: number, opts?: Intl.NumberFormatOptions): string =>
    new Intl.NumberFormat(locale, opts).format(v);

/**
 * Measured numbers from Search Console. Language-neutral by design: only the
 * labels come from i18n, and queries are what users typed, so they are never
 * translated.
 */
function searchConsoleSection(gsc: SearchConsoleMetrics, s: Strings, locale: string): string {
  const n = numberFormat(locale);
  const cells = [
    metricCell(n(gsc.clicks), s.metrics.clicks),
    metricCell(n(gsc.impressions), s.metrics.impressions),
    metricCell(n(gsc.ctr, { style: "percent", maximumFractionDigits: 1 }), s.metrics.ctr),
    metricCell(n(gsc.position, { maximumFractionDigits: 1 }), s.metrics.position),
  ].join("");

  const queries = (gsc.topQueries ?? []).slice(0, 10);
  // Impressions as a bar beside the number, scaled to the busiest query.
  const most = Math.max(1, ...queries.map((q) => q.impressions));
  const rows = queries
    .map(
      (q) => `
        <tr>
          <td>${esc(q.query)}</td>
          <td class="num">${n(q.clicks)}</td>
          <td class="num"><span class="qbar"><span style="width: ${((q.impressions / most) * 100).toFixed(1)}%"></span></span>${n(q.impressions)}</td>
          <td class="num">${n(q.position, { maximumFractionDigits: 1 })}</td>
        </tr>`
    )
    .join("");

  const period = `${formatDate(gsc.start, locale)} – ${formatDate(gsc.end, locale)}`;

  return `
    <section class="section section--metrics">
      <div class="section__head">
        <h2>${esc(s.sections.searchConsole)}</h2>
        <span class="section__count">${esc(period)}</span>
      </div>
      <p class="section__hint">${esc(s.metrics.searchConsoleNote)}</p>
      <div class="glance glance--metrics">${cells}</div>
      ${
        rows
          ? `<table class="metrics__table">
               <thead><tr>
                 <th>${esc(s.metrics.query)}</th>
                 <th class="num">${esc(s.metrics.clicks)}</th>
                 <th class="num">${esc(s.metrics.impressions)}</th>
                 <th class="num">${esc(s.metrics.position)}</th>
               </tr></thead>
               <tbody>${rows}</tbody>
             </table>`
          : ""
      }
    </section>`;
}

/** Lighthouse's own color bands: 90+ green, 50–89 orange, below 50 red. */
function lighthouseTone(score: number): string {
  return score >= 90 ? "var(--pass)" : score >= 50 ? "var(--warning)" : "var(--critical)";
}

/** One Lighthouse score as a ring, drawn like the cover dial but smaller. */
function gauge(score: number, label: string): string {
  const C = 2 * Math.PI * 40;
  const v = Math.round(Math.max(0, Math.min(100, score)));
  const filled = (v / 100) * C;
  return `
        <figure class="gauge">
          <svg viewBox="0 0 100 100" role="img" aria-label="${esc(label)}: ${v}">
            <circle class="gauge__track" cx="50" cy="50" r="40"></circle>
            <circle class="gauge__value" cx="50" cy="50" r="40" style="stroke: ${lighthouseTone(v)}"
                    stroke-dasharray="${filled.toFixed(2)} ${(C - filled).toFixed(2)}"></circle>
            <text class="gauge__number" x="50" y="59">${v}</text>
          </svg>
          <figcaption>${esc(label)}</figcaption>
        </figure>`;
}

/**
 * A Core Web Vital on Google's scale: good, needs improvement and poor as three
 * tinted bands, the measured value as a marker. The scale runs to 1.5× the
 * poor threshold, further only when the value is beyond that.
 */
function thresholdRow(metric: CwvMetric, value: number, fmt: (v: number) => string, s: Strings): string {
  const th = CWV[metric];
  const max = Math.max(th.poor * 1.5, value * 1.05);
  const pct = (x: number) => ((Math.min(x, max) / max) * 100).toFixed(2);
  const rating = cwvRating(metric, value);
  return `
        <div class="cwv t-${RATING_TONE[rating]}">
          <div class="cwv__name">${metric.toUpperCase()}</div>
          <div class="cwv__track">
            <span class="cwv__band cwv__band--good" style="width: ${pct(th.good)}%"></span>
            <span class="cwv__band cwv__band--mid" style="width: ${(+pct(th.poor) - +pct(th.good)).toFixed(2)}%"></span>
            <span class="cwv__band cwv__band--poor"></span>
            <span class="cwv__mark" style="left: ${pct(value)}%"></span>
            <span class="cwv__tick" style="left: ${pct(th.good)}%">${esc(fmt(th.good))}</span>
            <span class="cwv__tick" style="left: ${pct(th.poor)}%">${esc(fmt(th.poor))}</span>
          </div>
          <div class="cwv__value">
            <b>${esc(fmt(value))}</b>
            <span class="glance__sub"><span class="dot"></span>${esc(s.metrics.ratings[rating])}</span>
          </div>
        </div>`;
}

/**
 * Field data (CrUX: real Chrome users, p75) and lab data (one Lighthouse run)
 * are not interchangeable, and a client reading the PDF cannot tell them apart
 * — so the source is always printed, never implied.
 */
function coreWebVitalsSection(cwv: CoreWebVitalsMetrics, s: Strings, locale: string): string {
  const n = numberFormat(locale);
  const fmt: Record<CwvMetric, (v: number) => string> = {
    lcp: (ms) => `${n(ms / 1000, { maximumFractionDigits: 1 })} s`,
    inp: (ms) => `${n(Math.round(ms))} ms`,
    cls: (v) => n(v, { maximumFractionDigits: 2 }),
  };

  const rows = (Object.keys(CWV) as CwvMetric[])
    .filter((metric) => cwv[metric] != null)
    .map((metric) => thresholdRow(metric, cwv[metric]!, fmt[metric], s))
    .join("");

  const gauges = LIGHTHOUSE.filter((k) => cwv[k] != null)
    .map((k) => gauge(cwv[k]!, s.metrics.lighthouse[k]))
    .join("");

  const source = cwv.source === "field" ? s.metrics.fieldNote : s.metrics.labNote;
  const device = s.metrics.devices[cwv.strategy ?? ""] ?? cwv.strategy ?? "";

  return `
    <section class="section section--metrics">
      <div class="section__head">
        <h2>${esc(s.sections.coreWebVitals)}</h2>
        <span class="section__count">${esc(device)}</span>
      </div>
      <p class="section__hint">${esc(source)}</p>
      ${rows ? `<div class="cwvs">${rows}</div>` : ""}
      ${
        gauges
          ? `<div class="chart__title">${esc(s.metrics.lighthouseTitle)}</div>
             <div class="gauges">${gauges}</div>`
          : ""
      }
      ${cwv.url ? `<p class="metrics__note">${esc(s.meta.evidence)}: ${esc(cwv.url)}</p>` : ""}
    </section>`;
}

/** claude-seo's category scores as bars, colored by the same bands as the cover dial. */
function categoryScores(scores: Report["scores"], s: Strings): string {
  const rows = CATEGORIES.filter((c) => typeof scores?.[c] === "number")
    .map((c) => {
      const v = Math.round(scores![c]!);
      return `
        <div class="bars__row">
          <span class="bars__label">${esc(s.categories[c])}</span>
          <span class="bars__track"><span style="width: ${v}%; background: ${bandTone(scoreBand(v))}"></span></span>
          <span class="bars__n">${v}</span>
        </div>`;
    })
    .join("");
  return rows
    ? `<div class="chart__title">${esc(s.scores.title)}</div>
       <div class="bars">${rows}</div>`
    : "";
}

/** Only a used source reads as good news; the rest are facts, not faults. */
const SOURCE_TONE: Partial<Record<SourceStatus, Severity>> = {
  used: "pass",
  failed: "warning",
};

/**
 * Which measured data the audit had. A client should be able to tell "no
 * Search Console numbers because we had no access" from "no problems found".
 */
function dataSourcesList(sources: Meta["dataSources"], s: Strings): string {
  const rows = DATA_SOURCES.filter((src) => sources?.[src])
    .map((src) => {
      const status = sources![src]!;
      const tone = SOURCE_TONE[status];
      return `
        <div${tone ? ` class="t-${tone}"` : ""}>
          <dt>${esc(s.dataSources.sources[src])}</dt>
          <dd><span class="dot"></span>${esc(s.dataSources.statuses[status])}</dd>
        </div>`;
    })
    .join("");
  return rows
    ? `<div class="sources">
         <div class="sources__title">${esc(s.dataSources.title)}</div>
         <dl>${rows}</dl>
       </div>`
    : "";
}

/** The brand's font first, then the stylesheet's system stack as fallback. */
const SYSTEM_SANS = `"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif`;

function fontStack(brand: Brand): string {
  return brand.font ? `"${brand.font.family}", ${SYSTEM_SANS}` : SYSTEM_SANS;
}

/**
 * The brand color, the surface's colors and the font go in as custom
 * properties. report.css derives every grey, rule and tint from them, so a
 * dark surface needs no rules of its own beyond .surface--dark.
 */
function shell(lang: Lang, title: string, body: string, brand: Brand, surface: Surface): string {
  const css = readFileSync(join(ROOT, "templates", "report.css"), "utf8");
  const vars = [
    `--brand: ${brand.primary}`,
    `--paper: ${surface.background}`,
    `--ink: ${surface.text}`,
    `--accent: ${surface.accent}`,
    `--font-sans: ${fontStack(brand)}`,
  ].join("; ");
  return `<!doctype html>
<html lang="${lang}"${surface.dark ? ` class="surface--dark"` : ""}>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
${brand.font ? `<style>${brand.font.css}</style>` : ""}
<style>${css}</style>
<style>:root { ${vars}; }</style>
</head>
<body>${body}</body>
</html>`;
}

function severityCounts(report: Report): Record<Severity, number> {
  return Object.fromEntries(
    SEVERITIES.map((sev) => [sev, report.findings.filter((f) => f.severity === sev).length])
  ) as Record<Severity, number>;
}

/**
 * The line under the end logo. A custom note that has no translation in `lang`
 * falls back to the chrome default, not to the English note: a Russian PDF
 * should not end on an English sentence.
 */
function closingNote(report: Report, lang: Lang, fallback: string): string {
  return report.closingNote?.[lang]?.trim() || fallback;
}

/**
 * Cover page — rendered as its own zero-margin document so it bleeds.
 *
 * `brand` defaults to brand.json; the Studio passes an unsaved edit of it to
 * preview colors before they are written.
 */
export function renderCover(report: Report, lang: Lang, brand: Brand = loadBrand()): string {
  const s = loadStrings(lang);
  const sourceLang = report.meta.sourceLang ?? "en";
  const { locale } = s;
  const m = report.meta;

  const counts = severityCounts(report);
  const band = scoreBand(m.score);

  const countItems = SEVERITIES.map(
    (sev) => `
      <li class="t-${sev}">
        <b>${counts[sev]}</b>
        <span><i class="dot"></i>${esc(s.severity[sev])}</span>
      </li>`
  ).join("");

  return shell(
    lang,
    `${kicker(report, s)} — ${m.site}`,
    `
<div class="cover">
  <div class="cover__top">
    <div class="cover__logo">${logo(brand, brand.cover.logo)}</div>
    <div class="cover__tag">${esc(formatDate(m.auditedAt, locale))}</div>
  </div>

  <div class="cover__title">
    <div class="cover__kicker">${esc(kicker(report, s))}</div>
    <h1 class="cover__site">${esc(m.site)}</h1>
    <div class="cover__client">${esc(m.clientName)}</div>
  </div>

  <div class="cover__score">
    ${scoreDial(m.score, band, s)}
    <div>
      <div class="cover__score-label">${esc(s.score.label)}</div>
      <div class="cover__score-band">${esc(s.score.bands[band])}</div>
      <ul class="cover__counts">${countItems}</ul>
    </div>
  </div>

  <div class="cover__spacer"></div>

  <dl class="cover__meta">
    <div>
      <dt>${esc(s.doc.preparedFor)}</dt>
      <dd>${esc(m.clientName)}</dd>
    </div>
    <div>
      <dt>${esc(s.doc.preparedBy)}</dt>
      <dd>${brandLink(brand)}</dd>
    </div>
    <div>
      <dt>${esc(s.doc.auditedOn)}</dt>
      <dd>${esc(formatDate(m.auditedAt, locale))}</dd>
    </div>
    ${
      m.scope === "page" && m.pageUrl
        ? `<div class="wide">
             <dt>${esc(s.doc.auditedPage)}</dt>
             <dd>${esc(m.pageUrl)}</dd>
           </div>`
        : `<div>
             <dt>${esc(s.doc.pagesAnalyzed)}</dt>
             <dd>${esc(formatNumber(m.pagesAnalyzed, locale))}</dd>
           </div>`
    }
    ${
      m.stack
        ? `<div class="wide">
             <dt>${esc(s.doc.stack)}</dt>
             <dd>${esc(m.stack)}</dd>
           </div>`
        : ""
    }
  </dl>
</div>`,
    brand,
    brand.cover
  );
}

/** Body pages — rendered with margins so the running header/footer fit. */
export function renderBody(report: Report, lang: Lang, brand: Brand = loadBrand()): string {
  const s = loadStrings(lang);
  const sourceLang = report.meta.sourceLang ?? "en";
  const m = report.meta;

  const counts = severityCounts(report);

  const glance = SEVERITIES.map(
    (sev) => `
      <div class="glance__cell t-${sev}">
        <div class="glance__label"><span class="dot"></span>${esc(s.severity[sev])}</div>
        <div class="glance__n">${counts[sev]}</div>
      </div>`
  ).join("");

  const dist = SEVERITIES.filter((sev) => counts[sev] > 0)
    .map((sev) => `<span class="t-${sev}" style="flex: ${counts[sev]}"></span>`)
    .join("");

  const roadmap = (report.roadmap ?? [])
    .map(
      (step) => `
      <li>
        <div>
          <h3>${esc(t(step.title, lang, sourceLang))}</h3>
          ${step.body ? `<p>${esc(t(step.body, lang, sourceLang))}</p>` : ""}
        </div>
      </li>`
    )
    .join("");

  const notCovered = (report.notCovered ?? [])
    .map(
      (item) => `
      <li>
        <span class="notcovered__icon">${icon("notCovered")}</span>
        <div>
          <h3>${esc(t(item.title, lang, sourceLang))}</h3>
          ${item.body ? `<p>${esc(t(item.body, lang, sourceLang))}</p>` : ""}
        </div>
      </li>`
    )
    .join("");

  // Custom sections slot in after a named built-in section. The built-in flow
  // itself stays fixed — a report always reads summary → breakdown → findings.
  const at = (anchor: string) =>
    (report.sections ?? [])
      .filter((sec) => (sec.after ?? "summary") === anchor)
      .map((sec) => customSection(sec, lang, sourceLang))
      .join("");

  const contact = [brand.email, brand.phone].filter(Boolean).map(esc).join(" · ");

  return shell(
    lang,
    `${kicker(report, s)} — ${m.site}`,
    `
<main class="sheet">

  <section class="section">
    <div class="section__head"><h2>${esc(s.sections.summary)}</h2></div>
    <p class="lede">${esc(t(report.summary, lang, sourceLang))}</p>
  </section>

  ${at("summary")}

  <section class="section">
    <div class="section__head"><h2>${esc(s.sections.breakdown)}</h2></div>
    ${dist ? `<div class="dist" aria-hidden="true">${dist}</div>` : ""}
    <div class="glance">${glance}</div>
    ${categoryScores(report.scores, s)}
    <div class="method">${esc(t(report.method, lang, sourceLang))}</div>
    ${dataSourcesList(m.dataSources, s)}
  </section>

  ${report.metrics?.coreWebVitals ? coreWebVitalsSection(report.metrics.coreWebVitals, s, s.locale) : ""}
  ${report.metrics?.searchConsole ? searchConsoleSection(report.metrics.searchConsole, s, s.locale) : ""}

  ${at("breakdown")}

  ${SEVERITIES.map((sev, i) =>
    severitySection(sev, report.findings, lang, sourceLang, s, { breakBefore: i === 0 })
  ).join("")}

  ${at("findings")}

  ${
    roadmap
      ? `<section class="section section--break">
           <div class="section__head"><h2>${esc(s.sections.roadmap)}</h2></div>
           <ol class="roadmap">${roadmap}</ol>
         </section>`
      : ""
  }

  ${at("roadmap")}

  ${
    notCovered
      ? `<section class="section">
           <div class="section__head"><h2>${esc(s.sections.notCovered)}</h2></div>
           <ul class="notcovered">${notCovered}</ul>
         </section>`
      : ""
  }

  ${at("notCovered")}

  <div class="endslug">
    <div class="endslug__logo">${logo(brand, brand.body.logo)}</div>
    <div class="endslug__text">
      ${[
        brandLink(brand),
        contact,
        report.hideClosingNote ? "" : esc(closingNote(report, lang, s.doc.confidential)),
      ]
        .filter(Boolean)
        .join("<br>")}
    </div>
  </div>

</main>`,
    brand,
    brand.body
  );
}

/**
 * Body page margins in mm, reserved for the running header and footer. Must
 * exceed the templates' heights or they clip.
 */
export const BODY_MARGIN_MM = { top: 20, bottom: 18 } as const;

/**
 * Puppeteer renders header/footer templates in an isolated context: no page
 * CSS, no external assets, and a default font-size of ~0. Everything must be
 * inline, and page.pdf() margins must reserve vertical room or these clip.
 */
export function runningTemplates(
  report: Report,
  lang: Lang,
  brand: Brand = loadBrand()
): { header: string; footer: string } {
  const s = loadStrings(lang);
  const m = report.meta;
  // These templates do not see the body page's fonts or custom properties, so
  // the brand font is inlined again into each and the colors spelled out.
  // Data URIs are the one kind of resource they load.
  const font = fontStack(brand).replace(/"/g, "'");
  const fontCss = brand.font ? `<style>${brand.font.css}</style>` : "";
  const { text, background } = brand.body;
  const faint = `color-mix(in srgb, ${text} 63%, ${background})`;
  const base = `font-family: ${font}; font-size: 7pt; color: ${faint};`;
  // Chrome leaves page margins unpainted whatever the body's background, so a
  // colored body would sit between two white bands. Each template paints its
  // own band. The templates are laid over the whole page, above the content, so
  // the paint must stop at the margin. White needs none.
  const paint = (edge: "top" | "bottom") =>
    /^#f{6}$/i.test(background)
      ? ""
      : `<div style="position: absolute; left: 0; right: 0; ${edge}: 0;
                     height: ${BODY_MARGIN_MM[edge]}mm; background: ${background};
                     -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>`;

  const header = `${fontCss}${paint("top")}
    <div style="${base} position: relative; width: 100%; padding: 0 18mm; margin-top: 8mm;
                display: flex; justify-content: space-between; align-items: center;">
      <span style="color: ${text}; font-weight: 600;">${esc(m.site)}</span>
      <span>${esc(kicker(report, s))}</span>
    </div>`;

  const footer = `${fontCss}${paint("bottom")}
    <div style="${base} position: relative; width: 100%; padding: 0 18mm; margin-bottom: 7mm;
                display: flex; justify-content: space-between; align-items: center;">
      <span>${esc(brand.websiteLabel)}</span>
      <span>${esc(s.doc.page)} <span class="pageNumber"></span> ${esc(s.doc.of)} <span class="totalPages"></span></span>
    </div>`;

  return { header, footer };
}
