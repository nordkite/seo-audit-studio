import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadStrings, t, formatDate, formatNumber, type Strings } from "./i18n.ts";
import { loadBrand, type Brand } from "./brand.ts";
import {
  SEVERITIES,
  type CoreWebVitalsMetrics,
  type Finding,
  type Lang,
  type Report,
  type SearchConsoleMetrics,
  type Section,
  type Severity,
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
 * The brand mark for one surface. With no dark variant, the cover knocks the
 * regular logo out to white (see .logo--knockout); with no logo at all, the
 * brand name stands in as a wordmark.
 */
function logo(brand: Brand, { onDark = false } = {}): string {
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

  const rows = (gsc.topQueries ?? [])
    .slice(0, 10)
    .map(
      (q) => `
        <tr>
          <td>${esc(q.query)}</td>
          <td class="num">${n(q.clicks)}</td>
          <td class="num">${n(q.impressions)}</td>
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

/**
 * Field data (CrUX: real Chrome users, p75) and lab data (one Lighthouse run)
 * are not interchangeable, and a client reading the PDF cannot tell them apart
 * — so the source is always printed, never implied.
 */
function coreWebVitalsSection(cwv: CoreWebVitalsMetrics, s: Strings, locale: string): string {
  const n = numberFormat(locale);
  const secs = (ms: number) => `${n(ms / 1000, { maximumFractionDigits: 1 })} s`;
  const cell = (metric: CwvMetric, value: number, shown: string) =>
    metricCell(shown, metric.toUpperCase(), {
      tone: RATING_TONE[cwvRating(metric, value)],
      sub: s.metrics.ratings[cwvRating(metric, value)],
    });

  const cells = [
    cwv.lcp != null ? cell("lcp", cwv.lcp, secs(cwv.lcp)) : "",
    cwv.inp != null ? cell("inp", cwv.inp, `${n(Math.round(cwv.inp))} ms`) : "",
    cwv.cls != null ? cell("cls", cwv.cls, n(cwv.cls, { maximumFractionDigits: 2 })) : "",
    cwv.performance != null ? metricCell(n(cwv.performance), s.metrics.performance) : "",
  ].join("");

  const source = cwv.source === "field" ? s.metrics.fieldNote : s.metrics.labNote;
  const device = s.metrics.devices[cwv.strategy ?? ""] ?? cwv.strategy ?? "";

  return `
    <section class="section section--metrics">
      <div class="section__head">
        <h2>${esc(s.sections.coreWebVitals)}</h2>
        <span class="section__count">${esc(device)}</span>
      </div>
      <p class="section__hint">${esc(source)}</p>
      <div class="glance glance--metrics">${cells}</div>
      ${cwv.url ? `<p class="metrics__note">${esc(s.meta.evidence)}: ${esc(cwv.url)}</p>` : ""}
    </section>`;
}

/** The brand's font first, then the stylesheet's system stack as fallback. */
const SYSTEM_SANS = `"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif`;

function fontStack(brand: Brand): string {
  return brand.font ? `"${brand.font.family}", ${SYSTEM_SANS}` : SYSTEM_SANS;
}

/**
 * The brand colour and font go in as custom properties; report.css derives
 * its tints from the one and sets every text style in the other.
 */
function shell(lang: Lang, title: string, body: string, brand: Brand): string {
  const css = readFileSync(join(ROOT, "templates", "report.css"), "utf8");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
${brand.font ? `<style>${brand.font.css}</style>` : ""}
<style>${css}</style>
<style>:root { --brand: ${brand.primary}; --font-sans: ${fontStack(brand)}; }</style>
</head>
<body>${body}</body>
</html>`;
}

function severityCounts(report: Report): Record<Severity, number> {
  return Object.fromEntries(
    SEVERITIES.map((sev) => [sev, report.findings.filter((f) => f.severity === sev).length])
  ) as Record<Severity, number>;
}

/** Cover page — rendered as its own zero-margin document so it bleeds. */
export function renderCover(report: Report, lang: Lang): string {
  const s = loadStrings(lang);
  const brand = loadBrand();
  const sourceLang = report.meta.sourceLang ?? "en";
  const { locale } = s;
  const m = report.meta;

  const counts = severityCounts(report);
  const band = scoreBand(m.score);
  const onBrand = brand.cover === "brand";

  const countItems = SEVERITIES.map(
    (sev) => `
      <li class="t-${sev}">
        <b>${counts[sev]}</b>
        <span><i class="dot"></i>${esc(s.severity[sev])}</span>
      </li>`
  ).join("");

  return shell(
    lang,
    `${s.doc.kicker} — ${m.site}`,
    `
<div class="cover${onBrand ? " cover--brand" : ""}">
  <div class="cover__top">
    <div class="cover__logo">${logo(brand, { onDark: onBrand })}</div>
    <div class="cover__tag">${esc(formatDate(m.auditedAt, locale))}</div>
  </div>

  <div class="cover__title">
    <div class="cover__kicker">${esc(s.doc.kicker)}</div>
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
    <div>
      <dt>${esc(s.doc.pagesAnalyzed)}</dt>
      <dd>${esc(formatNumber(m.pagesAnalyzed, locale))}</dd>
    </div>
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
    brand
  );
}

/** Body pages — rendered with margins so the running header/footer fit. */
export function renderBody(report: Report, lang: Lang): string {
  const s = loadStrings(lang);
  const brand = loadBrand();
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
    `${s.doc.kicker} — ${m.site}`,
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
    <div class="method">${esc(t(report.method, lang, sourceLang))}</div>
  </section>

  ${report.metrics?.searchConsole ? searchConsoleSection(report.metrics.searchConsole, s, s.locale) : ""}
  ${report.metrics?.coreWebVitals ? coreWebVitalsSection(report.metrics.coreWebVitals, s, s.locale) : ""}

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
    <div class="endslug__logo">${logo(brand)}</div>
    <div class="endslug__text">
      ${brandLink(brand)}<br>
      ${contact ? `${contact}<br>` : ""}
      ${esc(s.doc.confidential)}
    </div>
  </div>

</main>`,
    brand
  );
}

/**
 * Puppeteer renders header/footer templates in an isolated context: no page
 * CSS, no external assets, and a default font-size of ~0. Everything must be
 * inline, and page.pdf() margins must reserve vertical room or these clip.
 */
export function runningTemplates(report: Report, lang: Lang): { header: string; footer: string } {
  const s = loadStrings(lang);
  const brand = loadBrand();
  const m = report.meta;
  // These templates do not see the body page's fonts, so the brand font is
  // inlined again into each. Data URIs are the one kind of resource they load.
  const font = fontStack(brand).replace(/"/g, "'");
  const fontCss = brand.font ? `<style>${brand.font.css}</style>` : "";
  const base = `font-family: ${font}; font-size: 7pt; color: #676a73;`;

  const header = `${fontCss}
    <div style="${base} width: 100%; padding: 0 18mm; margin-top: 8mm;
                display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #111318; font-weight: 600;">${esc(m.site)}</span>
      <span>${esc(s.doc.kicker)}</span>
    </div>`;

  const footer = `${fontCss}
    <div style="${base} width: 100%; padding: 0 18mm; margin-bottom: 7mm;
                display: flex; justify-content: space-between; align-items: center;">
      <span>${esc(brand.websiteLabel)}</span>
      <span>${esc(s.doc.page)} <span class="pageNumber"></span> ${esc(s.doc.of)} <span class="totalPages"></span></span>
    </div>`;

  return { header, footer };
}
