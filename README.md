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

## Report Studio

A local editor for the same JSON — drag findings between severities, add sections
with images, edit any language side by side with its English source, and see a
live preview rendered by the production renderer.

```bash
npm run studio        # builds the UI, serves on http://127.0.0.1:4321
npm run studio:dev    # Vite with hot reload on :5173, API on :4321
```

It binds to 127.0.0.1 only — it writes to `reports/` and spawns `claude`.

| Button | Does |
|---|---|
| **Save** | Validates, backs up to `.studio-backups/`, writes atomically |
| **Translate** | Fills the current language — see below |
| **Render PDF** | Runs `npm run report -- <slug> --all` |

The theme follows your OS by default; the sun/moon menu in the top right pins it
to light or dark.

### Translating

Two providers, chosen in the settings dialog. They send the same prompt and
return the same result — the difference is who pays.

| | Needs | Runs | Cost |
|---|---|---|---|
| **Claude Code** (default) | your Claude Code login | this machine | subscription quota |
| **Claude API** | your Anthropic API key | anywhere | ~$0.05–0.15 per report per language |

Either way it is one model call per few thousand characters, not an agent
session: the whole of `naa-ee` is 108 fields and ~8,000 characters, which runs in
a handful of parallel requests. The model never touches the file — the server
applies the result by field path and saves it the same way the editor does.

The API key is held in your browser's localStorage and sent with each request.
It is never written to the report, the backups, the server, or a log line. That
is deliberate: it is the same shape a hosted multi-user version would need, where
each person brings their own key.

Set `ANTHROPIC_API_KEY` in the server's environment instead if you would rather
not paste it into the UI.

### Stale translations

Editing English silently invalidates `et` and `ru` — nothing in the render
pipeline notices, and these PDFs go to clients. So the Studio records a hash of
each English string as of the last successful translation, under
`_translationState` in the report JSON, and marks any field whose source has
changed since. Language tabs show the outstanding count; each field shows
`translated` / `stale` / `missing`.

Reports written before this existed are baselined the first time the Studio opens
them, so they do not appear entirely stale.

### Dependency contract

Everything the Studio needs is a `devDependency`. `dependencies` is exactly
`pdf-lib` and `puppeteer`:

```bash
npm ci --omit=dev && npm run report -- naa-ee   # still works
```

Keep it that way — the PDF pipeline should never depend on the editor.

## How it fits together

```
reports/<slug>.json       audit data — every human string is { en, et, ru }
assets/<slug>/            images used by custom sections
i18n/{en,et,ru}.json      report chrome — section titles, labels, score bands
i18n/glossary.json        terms that must never be translated
i18n/translation-rules.md the translation prompt, shared by every path
templates/report.css      print stylesheet (A4, physical units)
src/render.js             (report, lang) → HTML
src/pdf.js                HTML → PDF via headless Chrome, two-pass + merge
src/validate.js           report rules, shared by the CLI and the Studio
src/generate.js           CLI
studio/server.js          Studio API — node:http
studio/lib/translate/     translation providers behind one interface
studio/client/            Studio UI — React + Tailwind + shadcn/ui
brand/                    logo, recoloured per surface at render time
```

`/translate-report` and both Studio providers read
`i18n/translation-rules.md` — glossary handling, number localisation, register,
Estonian length. One copy, so the two paths cannot drift into two house styles.

### Custom sections

Beyond findings, a report can carry hand-authored sections — prose, an image, or
both — for evidence a finding card cannot hold: a SERP screenshot, a crawl
diagram. They slot in after a named built-in section:

```jsonc
"sections": [{
  "id": "serp-preview",
  "after": "summary",              // summary | breakdown | findings | roadmap | notCovered
  "title": { "en": "…", "et": "…", "ru": "…" },
  "body":  { "en": "…" },
  "image": {
    "src": "assets/naa-ee/serp.png",
    "alt":     { "en": "…" },
    "caption": { "en": "…" }
  }
}]
```

Images are inlined as data URIs at render time (there is no base URL — see
*Fonts* below for the same constraint), so size them for print: the printed width
is 174 mm, so ~1400 px gives roughly 200 dpi.

### Why the two stylesheets never meet

`templates/report.css` is for paper and sets global `html`/`body`/`*` rules;
Tailwind is for screens and its preflight resets heading sizes. Each would break
the other, so the Studio renders the report inside an `<iframe srcDoc>` — a
separate document, hence a separate CSS scope. `templates/report.css` is excluded
from Tailwind's content glob and contains no utility classes.

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
