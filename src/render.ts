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

function bandTone(band: Band): string {
  return { excellent: "#4ec98a", good: "#8fd0a8", needsWork: "#e8b04b", critical: "#e2705f" }[band];
}

function scoreDial(score: number, band: Band): string {
  const C = 2 * Math.PI * 45;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * C;
  return `
    <svg class="dial" viewBox="0 0 120 120" role="img" aria-label="${score}/100">
      <circle class="dial__track" cx="60" cy="60" r="45"></circle>
      <circle class="dial__value" cx="60" cy="60" r="45"
              stroke="${bandTone(band)}"
              stroke-dasharray="${filled.toFixed(2)} ${(C - filled).toFixed(2)}"></circle>
      <text class="dial__number" x="60" y="72">${score}</text>
    </svg>`;
}

function findingCard(f: Finding, lang: Lang, sourceLang: Lang, s: Strings): string {
  const isPass = f.severity === "pass";
  const marker = isPass ? "✓" : "!";
  const foot: string[] = [];

  if (f.impact) {
    foot.push(
      `<span class="tag"><b>${esc(s.meta.impact)}</b> ${esc(s.meta[f.impact] ?? f.impact)}</span>`
    );
  }
  if (f.effort) {
    foot.push(
      `<span class="tag"><b>${esc(s.meta.effort)}</b> ${esc(s.meta[f.effort] ?? f.effort)}</span>`
    );
  }
  if (f.evidence) {
    // Evidence is either a verbatim technical reference (URL, filename — plain
    // string, never translated) or descriptive prose ("all pages" — an
    // {en,et,ru} object). t() resolves both.
    const ev = t(f.evidence, lang, sourceLang);
    const verbatim = typeof f.evidence === "string";
    foot.push(
      `<span class="tag${verbatim ? " tag--evidence" : ""}"><b>${esc(s.meta.evidence)}</b> ${esc(ev)}</span>`
    );
  }

  return `
    <article class="finding ${isPass ? "finding--pass " : ""}t-${f.severity}">
      <div class="finding__head">
        <span class="finding__marker">${marker}</span>
        <h3>${esc(t(f.title, lang, sourceLang))}</h3>
      </div>
      ${isPass ? "" : `<div class="finding__body">${esc(t(f.body, lang, sourceLang))}</div>`}
      ${foot.length ? `<div class="finding__foot">${foot.join("")}</div>` : ""}
    </article>`;
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

  return `
    <section class="section${breakBefore ? " section--break" : ""}">
      <div class="section__head">
        <h2>${esc(s.sections[sev])}</h2>
        <span class="section__count">${items.length} ${esc(s.counts[sev])}</span>
      </div>
      <p class="section__hint">${esc(s.sectionHints[sev])}</p>
      ${items.map((f) => findingCard(f, lang, sourceLang, s)).join("")}
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

const RATING_TONE: Record<Rating, string> = {
  good: "var(--pass)",
  needsImprovement: "var(--warning)",
  poor: "var(--critical)",
};

function metricCell(value: string, label: string, { tone, sub }: { tone?: string; sub?: string } = {}): string {
  return `
      <div class="glance__cell"${tone ? ` style="--tone: ${tone}"` : ""}>
        <div class="glance__n">${esc(value)}</div>
        <div class="glance__label">${esc(label)}</div>
        ${sub ? `<div class="glance__sub">${esc(sub)}</div>` : ""}
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

/** The brand colour goes in as a custom property; report.css derives its tints. */
function shell(lang: Lang, title: string, body: string, brand: Brand): string {
  const css = readFileSync(join(ROOT, "templates", "report.css"), "utf8");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${css}</style>
<style>:root { --brand: ${brand.primary}; }</style>
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
  const countLine = SEVERITIES.filter((sev) => sev !== "pass")
    .map((sev) => `${counts[sev]} ${s.counts[sev]}`)
    .join(" · ");

  return shell(
    lang,
    `${s.doc.kicker} — ${m.site}`,
    `
<div class="cover">
  <div class="cover__logo">${logo(brand, { onDark: true })}</div>

  <div class="cover__kicker">${esc(s.doc.kicker)}</div>
  <h1 class="cover__site">${esc(m.site)}</h1>
  <div class="cover__client">${esc(m.clientName)}</div>

  <div class="cover__score">
    ${scoreDial(m.score, band)}
    <div>
      <div class="cover__score-label">${esc(s.score.label)}</div>
      <div class="cover__score-band">${esc(s.score.bands[band])}</div>
      <div class="cover__score-counts">${esc(countLine)}</div>
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
        ? `<div style="grid-column: 1 / -1">
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
      <div class="glance__cell t-${sev}" style="--tone: var(--${sev})">
        <div class="glance__n">${counts[sev]}</div>
        <div class="glance__label">${esc(s.severity[sev])}</div>
      </div>`
  ).join("");

  const roadmap = (report.roadmap ?? [])
    .map(
      (step) => `
      <li>
        <h3>${esc(t(step.title, lang, sourceLang))}</h3>
        <p>${esc(t(step.body, lang, sourceLang))}</p>
      </li>`
    )
    .join("");

  const notCovered = (report.notCovered ?? [])
    .map(
      (item) => `
      <li>
        <h3>${esc(t(item.title, lang, sourceLang))}</h3>
        <p>${esc(t(item.body, lang, sourceLang))}</p>
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
  const base = "font-family: Helvetica, Arial, sans-serif; font-size: 7pt; color: #8a909c;";

  const header = `
    <div style="${base} width: 100%; padding: 0 18mm; margin-top: 8mm;
                display: flex; justify-content: space-between; align-items: center;">
      <span style="color:${brand.primary}; font-weight: 700;">${esc(m.site)}</span>
      <span>${esc(s.doc.kicker)}</span>
    </div>`;

  const footer = `
    <div style="${base} width: 100%; padding: 0 18mm; margin-bottom: 7mm;
                display: flex; justify-content: space-between; align-items: center;">
      <span>${esc(brand.websiteLabel)}</span>
      <span>${esc(s.doc.page)} <span class="pageNumber"></span> ${esc(s.doc.of)} <span class="totalPages"></span></span>
    </div>`;

  return { header, footer };
}
