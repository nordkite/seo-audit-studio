# Nordkite SEO Reports

Branded, multilingual PDF SEO audit reports. Audit data lives as structured JSON;
the PDF is a pure function of `(report, language)`, so the same audit renders in
English, Estonian and Russian without being re-run.

```bash
npm install
npm run report -- naa-ee --all
# → out/SEO-Audit-naa-ee-en.pdf
# → out/SEO-Audit-naa-ee-et.pdf
# → out/SEO-Audit-naa-ee-ru.pdf
```

## Usage

```bash
npm run report -- <slug>                    # source language only
npm run report -- <slug> --lang et          # one language
npm run report -- <slug> --lang et --lang ru
npm run report -- <slug> --all              # every translated language
npm run report -- <slug> -o ~/Desktop       # custom output dir
npm run report -- <slug> --html             # also emit intermediate HTML
npm run report -- --help
```

`<slug>` resolves to `reports/<slug>.json`, or pass a path to any JSON file.

## Workflow

Three slash commands cover the full cycle:

| Command | Does |
|---|---|
| `/new-audit <url>` | Audits a site, writes `reports/<slug>.json` (English) |
| `/translate-report <slug> all` | Fills in `et` and `ru`, cached into the same file |
| `/seo-report <slug> --all` | Renders the PDFs |

Translation is cached into the report JSON, so it is paid once per report rather
than once per render. Adding a fourth language later means translating the JSON —
not re-auditing the site.

## How it fits together

```
reports/<slug>.json     audit data — every human string is { en, et, ru }
i18n/{en,et,ru}.json    report chrome — section titles, labels, score bands
i18n/glossary.json      terms that must never be translated
templates/report.css    print stylesheet (A4, physical units)
src/render.js           (report, lang) → HTML
src/pdf.js              HTML → PDF via headless Chrome, two-pass + merge
src/generate.js         CLI
brand/                  logo, recoloured per surface at render time
```

### Why two passes

Chrome applies `headerTemplate`/`footerTemplate` to every page with no way to skip
the first, so a full-bleed cover and numbered body pages can't come from one pass.
`src/pdf.js` renders the cover at zero margins, the body with margins reserved for
the running header/footer, then merges with `pdf-lib`. Page numbers therefore count
body pages only — which is also correct print convention, since a cover is never
folio'd.

### Print gotchas already handled

- `printBackground: true` **and** `print-color-adjust: exact` — Chrome drops
  background colours without both, which silently kills all severity colour-coding
- `break-inside: avoid` on finding cards, so no finding splits across pages
- Header/footer templates render in an isolated context: no page CSS, no external
  assets, default font-size ~0. Everything in `runningTemplates()` is inlined, and
  the `page.pdf()` margins exceed the template heights or they clip.
- A4, not Letter

## Adding a language

1. Add the code to `SUPPORTED_LANGS` in [src/i18n.js](src/i18n.js)
2. Copy `i18n/en.json` to `i18n/<code>.json` and translate it — this is the fixed
   report chrome, translated once and reused by every report forever
3. Run `/translate-report <slug> <code>` per report to fill in the findings

Cyrillic and Estonian diacritics both render correctly in the current
Helvetica/Arial stack. A language needing other scripts (Greek, CJK) will need an
embedded webfont — see below.

## Fonts

The stylesheet uses a system stack (`Helvetica Neue`/Arial). It covers Latin
Extended and Cyrillic, needs no network access, and embeds cleanly.

To upgrade to a brand typeface, drop a subsetted `woff2` into `brand/`, base64 it
into an `@font-face` inside `templates/report.css`, and set `--font-sans`. It must
be inlined as a data URI — the renderer loads HTML via `setContent`, so there is no
base URL for relative font paths to resolve against.

## Verifying layout changes

```bash
npm run report -- naa-ee --lang en --html
pdftoppm -png -r 90 -f 2 -l 4 out/SEO-Audit-naa-ee-en.pdf out/_check
```

Then look at the PNGs. `pdftoppm` comes from poppler (`brew install poppler`).

## Requirements

Node ≥ 20. `npm install` pulls its own Chromium via Puppeteer.
