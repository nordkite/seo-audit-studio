# SEO Audit Studio

White-label, multilingual PDF SEO audit reports for agencies and consultants.
Audit data lives as structured JSON; the PDF is a pure function of
`(report, language)`, so the same audit renders in English, Estonian and Russian
without being re-run. Your name, logo and colour go on every page, configured
once in `brand/`.

```bash
npm run setup                      # also creates brand/ from brand.example/
npm run report -- naa-ee --all
# → out/SEO-Audit-naa-ee-en.pdf
# → out/SEO-Audit-naa-ee-et.pdf
# → out/SEO-Audit-naa-ee-ru.pdf
```

## Setup

Rendering PDFs needs only Node. **Auditing** a site also needs Claude Code and
the [claude-seo](https://github.com/AgriciDaniel/claude-seo) plugin, which
supplies the audit methodology and stays current with upstream.

```bash
npm run setup      # npm install + installs the claude-seo plugin + runs the doctor
```

Then open Claude Code in this folder and run, once:

```
/seo setup           # claude-seo's own Python runtime and Chromium
/seo google setup    # optional: Search Console + Core Web Vitals data
```

Check everything at any time with `npm run doctor`. It prints the fix for
anything missing.

## Branding (white label)

Each user's branding lives in `brand/`, which is git-ignored. `npm run setup`
creates it from the tracked template `brand.example/`:

```
brand/
  brand.json         name, website, email, phone, logo file names, colour, font
  logo.svg           for white pages
  logo-on-dark.svg   for dark backgrounds (optional)
  fonts/             your own typefaces (optional, see fonts/README.md)
```

```json
{
  "name": "Acme Digital",
  "website": "https://acme.example",
  "email": "seo@acme.example",
  "phone": "+372 555 0100",
  "logo": "logo.svg",
  "logoOnDark": "logo-on-dark.svg",
  "colors": { "primary": "#1f3a5f" },
  "font": "manrope",
  "cover": { "background": "#1f3a5f", "text": "#ffffff" },
  "body": { "background": "#ffffff", "text": "#121212" }
}
```

Only `name` is required. A logo is a file in `brand/` or an `https://` URL, and
can be SVG, PNG, JPG, WebP or GIF. The primary colour is the accent; its lighter tints
are derived from it. `cover` and `body` set each surface's background, text
colour and logo variant, and every grey in the report is mixed from those two
colours. The Studio's palette button edits them with a live preview. `font`
picks a typeface from `fonts/`. The PDF's author,
creator and producer metadata are set to `name`, so nothing in the file names
this tool. Every field is described in
[brand.example/README.md](brand.example/README.md).

`BRAND_DIR=path/to/brand` points a single run at a different folder, for agencies
rendering under more than one brand. Without `brand/brand.json` the renderer
falls back to the example brand and warns, and the doctor flags it.

**Installing the plugin by hand.** `/plugin` only works in Claude Code's
terminal version (run `claude`, then type it). It does not work in the VS Code
chat or a plain shell. The shell form works anywhere:

```bash
claude plugin marketplace add AgriciDaniel/claude-seo --scope project
claude plugin install claude-seo@agricidaniel-claude-seo --scope project
```

`.claude/settings.json` already declares the plugin, so Claude Code in its
terminal version offers to install it when you trust this folder.

**Python.** claude-seo needs Python 3.10+. Prefer 3.12 or 3.13. Brand-new
releases can lack prebuilt packages for its dependencies (lxml, WeasyPrint),
and setup then fails while compiling them. To use a specific interpreter, set
`CLAUDE_SEO_PYTHON` to its path.

**Tested version.** `config.claudeSeoVersion` in `package.json` is the claude-seo
release these reports were last checked against. The doctor warns when the
installed plugin differs. To move to a new release, update the plugin
(`claude plugin marketplace update agricidaniel-claude-seo`), re-audit a site
you know, compare the result in the Studio, then bump the version.

**Google data for client sites.** The service account only sees properties it
has been added to. Ask the client to add its `client_email` to their Search
Console property as a **Restricted** user. Without access the report skips
the Search Console section and lists it under "not covered".

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
| `/new-audit <url>` | Audits a site with claude-seo, writes `reports/<slug>.json` (English) |
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
src/types.ts              the report schema, shared by the CLI, server and Studio UI
src/brand.ts              loads and checks brand/brand.json
src/render.ts             (report, lang) → HTML
src/pdf.ts                HTML → PDF via headless Chrome, two-pass + merge
src/validate.ts           report rules, shared by the CLI and the Studio
src/generate.ts           CLI
studio/server.ts          Studio API — node:http
studio/lib/translate/     translation providers behind one interface
studio/client/            Studio UI — React + Tailwind + shadcn/ui
brand.example/            white-label template, copied to brand/ (git-ignored) by setup
scripts/doctor.ts         environment check, also the /new-audit preflight
scripts/setup.ts          npm install + claude-seo plugin install + doctor
.claude/settings.json     declares the claude-seo plugin for this project
.claude/commands/         /new-audit, /translate-report, /seo-report
```

### Measured data

`metrics` in the report JSON holds numbers from Search Console and Core Web
Vitals. It is optional, and each sub-block renders as its own section after
"Findings at a glance". The numbers are language-neutral: labels come from
`i18n/*.json`, numbers and dates are formatted per locale, and search queries
print verbatim. Nothing in `metrics` passes through translation. Core Web Vitals
always prints whether it is field data (CrUX, real users) or lab data (one
Lighthouse run), because the two are not interchangeable. The schema is in
[.claude/commands/new-audit.md](.claude/commands/new-audit.md).

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
`src/pdf.ts` renders the cover at zero margins, the body with margins reserved for
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
- The header/footer templates do not see the page's `@font-face` rules either,
  so `runningTemplates()` inlines the brand font into them a second time
- `pdf.ts` waits for `document.fonts.ready` before printing. A webfont is decoded
  when text first needs it, which can be after `load`, and printing earlier sets
  the page in the fallback font without any error
- Fonts are static weights, not variable: Chrome embeds a variable font as Type 3
  outlines, which bloats the PDF
- A4, not Letter

## Adding a language

1. Add the code to `LANGS` in [src/types.ts](src/types.ts)
2. Copy `i18n/en.json` to `i18n/<code>.json` and translate it — this is the fixed
   report chrome, translated once and reused by every report forever
3. Run `/translate-report <slug> <code>` per report to fill in the findings

Check the brand font covers the new language's script (see Fonts below). A font
without it falls back to Arial for those letters.

## Fonts

`"font": "manrope"` in `brand.json` sets the report in Manrope, shipped in
`fonts/manrope/`. Without `font`, it falls back to the system stack (`Helvetica
Neue`/Arial). Adding another typeface is a folder of `woff2` files and a
`font.json`: see [fonts/README.md](fonts/README.md).

`src/brand.ts` inlines every font file as a data URI. The renderer loads HTML
via `setContent`, so there is no base URL for a relative `url()` to resolve
against.

## Verifying layout changes

```bash
npm run report -- naa-ee --lang en --html
pdftoppm -png -r 90 -f 2 -l 4 out/SEO-Audit-naa-ee-en.pdf out/_check
```

Then look at the PNGs. `pdftoppm` comes from poppler (`brew install poppler`).

## TypeScript

Everything is TypeScript, and nothing is compiled. Node 22.18+ runs `.ts` files
directly by stripping the types, so `npm run report` and `npm run studio` start
with no build step and `npm ci --omit=dev` still renders. Two consequences:

- Only erasable syntax: no `enum`, `namespace` or constructor parameter
  properties. `erasableSyntaxOnly` in `tsconfig.json` enforces it.
- Relative imports name the `.ts` file: `import { t } from "./i18n.ts"`.

Types are checked separately: `npm run typecheck` covers the Node side
(`tsconfig.json`) and the Studio UI (`studio/client/tsconfig.json`). The report
schema in `src/types.ts` is shared by both, so a schema change is a type error
everywhere it matters.

## Requirements

Node ≥ 22.18. `npm install` pulls its own Chromium via Puppeteer. `.npmrc` sets
`engine-strict`, so an older Node fails at install with a clear message rather
than at the first `.ts` file.

For auditing, you also need Claude Code, the claude-seo plugin, and Python 3.10+
(3.12 or 3.13 recommended). See [Setup](#setup).
