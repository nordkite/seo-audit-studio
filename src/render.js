import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadStrings, t, formatDate, formatNumber } from "./i18n.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const BRAND = {
  name: "Nordkite",
  url: "https://nordkite.eu",
  urlLabel: "nordkite.eu",
  navy: "#293451",
};

const SEVERITIES = ["critical", "warning", "opportunity", "pass"];

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Brand mark, recoloured for whichever surface it sits on. */
function logoSvg({ color } = {}) {
  const raw = readFileSync(join(ROOT, "brand", "nordkite-logo.svg"), "utf8");
  if (!color) return raw;
  return raw.replace(/fill="#293451"/gi, `fill="${color}"`);
}

function scoreBand(score) {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "needsWork";
  return "critical";
}

function bandTone(band) {
  return { excellent: "#4ec98a", good: "#8fd0a8", needsWork: "#e8b04b", critical: "#e2705f" }[band];
}

function scoreDial(score, band) {
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

function findingCard(f, lang, sourceLang, s) {
  const isPass = f.severity === "pass";
  const marker = isPass ? "✓" : "!";
  const foot = [];

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

function severitySection(sev, findings, lang, sourceLang, s, { breakBefore }) {
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

function shell(lang, title, body) {
  const css = readFileSync(join(ROOT, "templates", "report.css"), "utf8");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

/** Cover page — rendered as its own zero-margin document so it bleeds. */
export function renderCover(report, lang) {
  const s = loadStrings(lang);
  const sourceLang = report.meta.sourceLang ?? "en";
  const { locale } = s;
  const m = report.meta;

  const counts = Object.fromEntries(
    SEVERITIES.map((sev) => [sev, report.findings.filter((f) => f.severity === sev).length])
  );
  const band = scoreBand(m.score);
  const countLine = SEVERITIES.filter((sev) => sev !== "pass")
    .map((sev) => `${counts[sev]} ${s.counts[sev]}`)
    .join(" · ");

  return shell(
    lang,
    `${s.doc.kicker} — ${m.site}`,
    `
<div class="cover">
  <div class="cover__logo">${logoSvg({ color: "#FFFFFF" })}</div>

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
      <dd><a href="${BRAND.url}">${esc(BRAND.urlLabel)}</a></dd>
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
</div>`
  );
}

/** Body pages — rendered with margins so the running header/footer fit. */
export function renderBody(report, lang) {
  const s = loadStrings(lang);
  const sourceLang = report.meta.sourceLang ?? "en";
  const m = report.meta;

  const counts = Object.fromEntries(
    SEVERITIES.map((sev) => [sev, report.findings.filter((f) => f.severity === sev).length])
  );

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

  return shell(
    lang,
    `${s.doc.kicker} — ${m.site}`,
    `
<main class="sheet">

  <section class="section">
    <div class="section__head"><h2>${esc(s.sections.summary)}</h2></div>
    <p class="lede">${esc(t(report.summary, lang, sourceLang))}</p>
  </section>

  <section class="section">
    <div class="section__head"><h2>${esc(s.sections.breakdown)}</h2></div>
    <div class="glance">${glance}</div>
    <div class="method">${esc(t(report.method, lang, sourceLang))}</div>
  </section>

  ${SEVERITIES.map((sev, i) =>
    severitySection(sev, report.findings, lang, sourceLang, s, { breakBefore: i === 0 })
  ).join("")}

  ${
    roadmap
      ? `<section class="section section--break">
           <div class="section__head"><h2>${esc(s.sections.roadmap)}</h2></div>
           <ol class="roadmap">${roadmap}</ol>
         </section>`
      : ""
  }

  ${
    notCovered
      ? `<section class="section">
           <div class="section__head"><h2>${esc(s.sections.notCovered)}</h2></div>
           <ul class="notcovered">${notCovered}</ul>
         </section>`
      : ""
  }

  <div class="endslug">
    <div class="endslug__logo">${logoSvg()}</div>
    <div class="endslug__text">
      <a href="${BRAND.url}">${esc(BRAND.urlLabel)}</a><br>
      ${esc(s.doc.confidential)}
    </div>
  </div>

</main>`
  );
}

/**
 * Puppeteer renders header/footer templates in an isolated context: no page
 * CSS, no external assets, and a default font-size of ~0. Everything must be
 * inline, and page.pdf() margins must reserve vertical room or these clip.
 */
export function runningTemplates(report, lang) {
  const s = loadStrings(lang);
  const m = report.meta;
  const base = "font-family: Helvetica, Arial, sans-serif; font-size: 7pt; color: #8a909c;";

  const header = `
    <div style="${base} width: 100%; padding: 0 18mm; margin-top: 8mm;
                display: flex; justify-content: space-between; align-items: center;">
      <span style="color:${BRAND.navy}; font-weight: 700;">${esc(m.site)}</span>
      <span>${esc(s.doc.kicker)}</span>
    </div>`;

  const footer = `
    <div style="${base} width: 100%; padding: 0 18mm; margin-bottom: 7mm;
                display: flex; justify-content: space-between; align-items: center;">
      <span>${esc(BRAND.urlLabel)}</span>
      <span>${esc(s.doc.page)} <span class="pageNumber"></span> ${esc(s.doc.of)} <span class="totalPages"></span></span>
    </div>`;

  return { header, footer };
}
