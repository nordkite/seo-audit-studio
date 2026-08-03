# CLAUDE.md

Nordkite SEO report generator. Structured audit JSON → branded multilingual PDF.

## The one rule that matters

**Audit data and presentation are separate.** Findings go into
`reports/<slug>.json` with every human string as `{ en, et, ru }`. The renderer is
a pure function of `(report, lang)`.

Never write audit findings as prose Markdown in this repo. Prose can't be
re-rendered into another language without re-auditing the site, which is the exact
problem this repo exists to solve.

## Commands

- `/new-audit <url>` — audit a site, write `reports/<slug>.json`
- `/translate-report <slug> all` — fill `et`/`ru`, cached into the same file
- `/seo-report <slug> --all` — render PDFs to `out/`

## Layout

| Path | Role |
|---|---|
| `reports/*.json` | audit data, the source of truth |
| `i18n/{en,et,ru}.json` | report chrome — labels, section titles, score bands |
| `i18n/glossary.json` | terms that must never be translated |
| `templates/report.css` | print stylesheet |
| `src/render.js` | `(report, lang)` → HTML |
| `src/pdf.js` | HTML → PDF, two-pass cover+body merge |
| `src/generate.js` | CLI |
| `brand/` | logo, recoloured per surface at render time |

## Print constraints

This CSS targets paper, not screens. Use physical units (mm, pt). No viewport
units, no fluid scaling, no `rem`-based responsive tokens.

Before changing `templates/report.css` or `src/pdf.js`, read the "Print gotchas"
section of [README.md](README.md) — the two-pass render and the
`print-color-adjust` handling are load-bearing and non-obvious.

After any template change, verify visually. `page.pdf()` fails silently: a broken
`break-inside` or a dropped background produces a valid PDF that just looks wrong.

```bash
npm run report -- naa-ee --lang en --html
pdftoppm -png -r 90 -f 2 -l 4 out/SEO-Audit-naa-ee-en.pdf out/_check
```

Check: no finding split across a page boundary, header/footer present and
unclipped, background colours intact.

## Translation

Technical SEO terms stay in English in every language — `canonical`, `hreflang`,
`sitemap.xml`, `LCP`, `robots.txt`, HTML tags, HTTP status codes. The full list is
`i18n/glossary.json`. Estonian and Russian SEO practitioners use the English terms;
translating them makes reports less usable, not more.

Localise number formats and decimal separators. Estonian text runs ~15–20% longer
than English — the layout tolerates it, but prefer tighter phrasing.

## Client-facing output

These PDFs go to paying clients under the Nordkite name. Every finding must be
independently verifiable from the evidence given. Do not pad reports with invented
issues, and do not mark something `pass` that was not actually tested — put it in
`notCovered` instead.
