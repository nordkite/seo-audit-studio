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
- `npm run studio` — Report Studio, a local editor for the same JSON

## Layout

| Path | Role |
|---|---|
| `reports/*.json` | audit data, the source of truth |
| `assets/<slug>/` | images used by custom sections |
| `i18n/{en,et,ru}.json` | report chrome — labels, section titles, score bands |
| `i18n/glossary.json` | terms that must never be translated |
| `i18n/translation-rules.md` | the translation prompt, shared by the slash command and the Studio |
| `templates/report.css` | print stylesheet |
| `src/render.js` | `(report, lang)` → HTML |
| `src/pdf.js` | HTML → PDF, two-pass cover+body merge |
| `src/validate.js` | report rules, shared by the CLI and the Studio |
| `src/generate.js` | CLI |
| `studio/server.js` | Studio API |
| `studio/lib/translate/` | translation providers — `cli.js`, `anthropic.js` |
| `studio/client/` | Studio UI — React + Tailwind + shadcn/ui |
| `components.json`, `tsconfig.json` | root-level **only** so `npx shadcn@latest add …` resolves; the CLI needs them beside `package.json`. The app's real config is `studio/client/tsconfig.json`. |
| `brand/` | logo, recoloured per surface at render time |

## Report Studio

`npm run studio` serves a local editor on 127.0.0.1:4321. It reads and writes the
same `reports/*.json`, so everything below still applies — it is a view over the
schema, not a second format.

**`_translationState`** is the one thing it adds that the JSON alone does not
express — a map of `field path → hash of the English source at the last
successful translation`. It is how the Studio knows an `et`/`ru` string has gone
stale after its English changed. `render.js` and `validate.js` ignore the key. Do
not hand-edit it; do not delete it when editing a report by hand.

Studio dependencies are all `devDependencies`. `dependencies` is exactly `pdf-lib`
and `puppeteer`, so `npm ci --omit=dev && npm run report` still renders. Keep it
that way.

### Translation providers

`studio/lib/translate/` holds one interface with two implementations. Both send
the same prompt and get back the same `{ field path → translated string }` map;
only the transport and who pays differ.

| | Auth | Runs | Cost |
|---|---|---|---|
| `cli.js` | the user's Claude Code login | this machine only | subscription quota |
| `anthropic.js` | an API key sent per request | anywhere | per token |

`cli.js` is **not** an agent run. It calls `claude -p --system-prompt … --allowedTools ""`
— one turn, no tools, strings in and strings out. The earlier design invoked
`/translate-report` as an agent that read and `Edit`ed the report itself, which
meant ~108 tool calls against a 52 KB file per language. Do not reintroduce that:
the model never needs to touch the file, because `studio/lib/translate/index.js`
applies the result by field path and saves through the normal `writeReport` path.

**The API key is never persisted.** It lives in the browser's localStorage,
travels in the POST body, and is handed straight to the provider. It must not be
logged, written into a report, or stored server-side — that is what makes this
path viable for a hosted multi-user tool later.

Adding DeepL or Google means one more module beside `anthropic.js` and one more
entry in `PROVIDERS`. They would also need a glossary upload per language pair
and a separate number-localisation pass, which the LLM providers get from
`i18n/translation-rules.md` for free.

## Print constraints

This CSS targets paper, not screens. Use physical units (mm, pt). No viewport
units, no fluid scaling, no `rem`-based responsive tokens.

**`templates/report.css` is not a Tailwind surface.** Hand-written CSS only — no
utility classes, no `@apply`, no Tailwind import, and it is excluded from
Tailwind's content glob. The Studio uses Tailwind; the report does not, and the
two must not meet. Tailwind's preflight resets `h1`–`h6` to inherited size and
weight, which would flatten every finding title; report.css sets global
`html`/`body`/`*` rules that would force the Studio to 9.6pt Helvetica.

The Studio keeps them apart by rendering the report inside an `<iframe srcDoc>` —
a separate document with a separate CSS scope. Never inject report HTML into the
React tree with `dangerouslySetInnerHTML`; that is the one move that breaks it,
and it looks fine until the cascade bites.

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

The rules live in **[i18n/translation-rules.md](i18n/translation-rules.md)** and
the protected terms in `i18n/glossary.json`. Both are loaded verbatim by
`/translate-report` and by the Studio's providers, so there is exactly one copy
of the house style. Change it there, not in a prompt.

The short version: technical SEO terms stay in English in every language
(`canonical`, `hreflang`, `sitemap.xml`, `LCP`, `robots.txt`, HTML tags, HTTP
status codes), number formats get localised, and Estonian runs ~15–20% longer
than English so prefer the tighter phrasing.

## Client-facing output

These PDFs go to paying clients under the Nordkite name. Every finding must be
independently verifiable from the evidence given. Do not pad reports with invented
issues, and do not mark something `pass` that was not actually tested — put it in
`notCovered` instead.
