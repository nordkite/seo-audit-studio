# CLAUDE.md

SEO Audit Studio: structured audit JSON → white-label multilingual PDF. Used by
several agencies, each under its own brand, so nothing in tracked files may name
one of them.

## The one rule that matters

**Audit data and presentation are separate.** Findings go into
`reports/<slug>.json` with every human string as `{ en, et, ru }`. The renderer is
a pure function of `(report, lang)`.

Never write audit findings as prose Markdown in this repo. Prose can't be
re-rendered into another language without re-auditing the site, which is the exact
problem this repo exists to solve.

## Where the audit comes from

The audit methodology is the **claude-seo** plugin, declared in
`.claude/settings.json`. It is not copied into this repo. Do not add SEO skills
under `.claude/skills/`: they would compete with claude-seo for the same prompts
and go stale, which is why the earlier copies were removed. This repo owns the
schema, translation and rendering. claude-seo owns what gets checked.

`/new-audit` runs `npm run doctor -- --json` first and stops if claude-seo or its
runtime is missing, rather than quietly running a weaker audit.
`config.claudeSeoVersion` in `package.json` is the release reports were last
verified against.

**What an audit must cover lives in `audit/coverage.json`**, read by both audit
commands. It holds two lists:

- `subagents`: the claude-seo subagents each scope must run. A site audit only
  checks claude-seo spawned them. A page audit spawns them itself, because
  `seo-page` is a single checklist with no subagents. A subagent that did not
  run goes in `notCovered`, never silently.
- `supplements`: this repo's additions for claude-seo's gaps (hreflang, images,
  social tags, keyless Lighthouse, server stack CVE exposure), each with the `gap` it fills and when to
  remove it. A supplement is a claude-seo skill or a deterministic script, never
  a skill under `.claude/skills/`. Add new gap-fillers here, not as prose in a
  command file.

`scripts/check-social.ts` is the one supplement this repo implements itself:
claude-seo's full audit (through 2.5.0) has no social-tag check. It requires
Open Graph and `twitter:card` only, because X falls back to `og:*` for the
title, description and image, so a missing `twitter:image` is not an issue.

`npm run doctor` warns when `coverage.json`'s `claudeSeoVersion` differs from
the installed claude-seo. When it does, re-check each supplement's `gap` and
delete the ones claude-seo now covers.

## Branding is configuration, not code

Whose name, logo and color go on a report comes from `brand/brand.json`, loaded
by `src/brand.ts`. `brand/` is git-ignored; `brand.example/` is the tracked
template. Never hard-code a company name, URL, logo or brand color in
`src/`, `templates/` or the Studio. Add a field to `BrandConfig` instead, and
document it in `brand.example/README.md`. The typeface is brand config too
(`font`), so never hard-code a font family in `report.css`; it reads
`--font-sans`. The same goes for surface colors: `brand.json`'s `cover` and
`body` set `--paper` and `--ink` per document, and every grey, rule and tint in
`report.css` is a `color-mix()` of the two. Never add a literal grey or white
there, or a dark surface breaks. The PDF's author/creator/producer
metadata is the brand name too, so the tool never shows through to a client.

## TypeScript

All code is TypeScript that Node runs directly (type stripping, Node 22.18+).
There is no build step for the Node side, so:

- relative imports end in `.ts`;
- only erasable syntax: no `enum`, `namespace`, or constructor parameter
  properties (`erasableSyntaxOnly` enforces it);
- type-only imports use `import type` (`verbatimModuleSyntax`).

The report schema lives in `src/types.ts` and the Studio API shapes in
`studio/lib/types.ts`. The Studio client re-exports both rather than redefining
them. Run `npm run typecheck` after changing either.

## Commands

- `npm run setup` / `npm run doctor`: install and check the environment
- `/new-audit <url> [--languages et,ru]` — audit a site with claude-seo, write
  `reports/<slug>.json`; with `--languages`, only those language versions
  (`reports/<slug>--et-ru.json`)
- `/new-page-audit <url>` — audit one page with claude-seo's `seo-page`, write
  `reports/<site-slug>--<page-slug>.json` (`meta.scope: "page"`)
- `/translate-report <slug> all` — fill `et`/`ru`, cached into the same file
- `/seo-report <slug> --all` — render PDFs to `out/`; `--express` renders the
  free excerpt of the same report instead (`src/express.ts`)
- `npm run studio` — Report Studio, a local editor for the same JSON
- `npm run typecheck` — both tsconfigs

## Layout

| Path | Role |
|---|---|
| `reports/*.json` | audit data, the source of truth |
| `assets/<slug>/` | images used by custom sections |
| `.audit-work/` | claude-seo's working files during an audit (findings, renders, screenshots). Git-ignored client data; safe to delete once the report is written |
| `i18n/{en,et,ru}.json` | report chrome — labels, section titles, score bands |
| `i18n/glossary.json` | terms that must never be translated |
| `i18n/translation-rules.md` | the translation prompt, shared by the slash command and the Studio |
| `templates/report.css` | print stylesheet |
| `src/types.ts` | report schema and its constants (langs, severities, anchors) |
| `src/brand.ts` | loads and validates `brand/brand.json` |
| `src/theme.ts` | cover/body surface colors and logo choice. No Node imports, so the Studio client shares it |
| `src/render.ts` | `(report, lang, edition)` → HTML |
| `src/express.ts` | which findings the express edition shows. No Node imports, so the Studio client shares it |
| `src/pdf.ts` | HTML → PDF, two-pass cover+body merge |
| `src/validate.ts` | report rules, shared by the CLI and the Studio |
| `src/generate.ts` | CLI |
| `studio/server.ts` | Studio API |
| `studio/lib/translate/` | translation providers — `cli.ts`, `anthropic.ts` |
| `studio/lib/audit.ts` | runs `/new-audit` / `/new-page-audit` from the Studio |
| `studio/lib/keep-awake.ts` | holds off idle sleep while an audit runs (macOS, Windows, Linux) |
| `studio/client/` | Studio UI — React + Tailwind + shadcn/ui |
| `components.json` | root-level **only** so `npx shadcn@latest add …` resolves; the CLI needs it beside `package.json` |
| `tsconfig.json` | type-checks the Node side. Its `paths` entry is unused by that code and exists for the shadcn CLI. The Studio UI's config is `studio/client/tsconfig.json` |
| `fonts/<name>/` | shared typefaces (`woff2` + `font.json`), picked by `brand.json`'s `font`. Guide: `fonts/README.md` |
| `brand/` | the user's white-label config and logos. Git-ignored |
| `brand.example/` | template for `brand/`, copied by `npm run setup` |
| `scripts/doctor.ts`, `scripts/setup.ts` | environment check and setup. Node built-ins only, so they run before `npm install` |
| `studio/lib/types.ts` | Studio API request/response shapes, shared with the client |
| `audit/coverage.json` | subagents each audit scope must run, and supplements for claude-seo's gaps (see above) |
| `scripts/check-social.ts` | Open Graph + X/Twitter Card check on every sitemap URL. Fills a claude-seo gap (see above) |
| `scripts/site-languages.ts` | a site's language versions from hreflang, the sitemap URLs in a chosen subset, and Search Console totals for it. Used by `/new-audit --languages`, `check-social.ts` and the Studio |
| `.claude/settings.json` | declares the claude-seo plugin for this project |

`metrics` in the report JSON (Search Console, Core Web Vitals) is numbers only and
never translated: labels come from `i18n/*.json`, values are formatted per locale.
Keep it that way. A string added there would bypass `/translate-report` and the
Studio's stale-translation tracking.

## Report Studio

`npm run studio` serves a local editor on 127.0.0.1:4321. It reads and writes the
same `reports/*.json`, so everything below still applies — it is a view over the
schema, not a second format.

**`_translationState`** is the one thing it adds that the JSON alone does not
express — a map of `field path → hash of the English source at the last
successful translation`. It is how the Studio knows an `et`/`ru` string has gone
stale after its English changed. `render.ts` and `validate.ts` ignore the key. Do
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
| `cli.ts` | the user's Claude Code login | this machine only | subscription quota |
| `anthropic.ts` | an API key sent per request | anywhere | per token |

`cli.ts` is **not** an agent run. It calls `claude -p --system-prompt … --allowedTools ""`
— one turn, no tools, strings in and strings out. The earlier design invoked
`/translate-report` as an agent that read and `Edit`ed the report itself, which
meant ~108 tool calls against a 52 KB file per language. Do not reintroduce that:
the model never needs to touch the file, because `studio/lib/translate/index.ts`
applies the result by field path and saves through the normal `writeReport` path.

**The API key is never persisted.** It lives in the browser's localStorage,
travels in the POST body, and is handed straight to the provider. It must not be
logged, written into a report, or stored server-side — that is what makes this
path viable for a hosted multi-user tool later.

Adding DeepL or Google means one more module beside `anthropic.ts` and one more
entry in `PROVIDERS`. They would also need a glossary upload per language pair
and a separate number-localisation pass, which the LLM providers get from
`i18n/translation-rules.md` for free.

### Running audits

`studio/lib/audit.ts` starts `/new-audit` or `/new-page-audit` as
`claude -p --output-format stream-json --permission-mode dontAsk`, with the
command's own `allowed-tools` frontmatter as `--allowedTools`. Unlike
translation this **is** an agent run, and has to be: claude-seo needs tools and
subagents. The Studio adds no audit logic of its own. It runs the same command a
person would type, so the method stays in the command files and claude-seo.

- The run is unattended, so anything not allowed is denied, not prompted. Denials
  are listed in the job, because a denied call is a check that never ran.
- The audit commands call scripts as `node scripts/….ts`, never `npm run`. Many
  people keep an `ask` rule on `Bash(npm *)`. An ask rule beats any allow rule,
  and in an unattended run nobody answers it. Keep it that way.
- Doctor runs before the agent starts, and a failed required check refuses the
  run.
- One audit at a time. Jobs live in memory; a Studio restart stops and forgets a
  running one. Raw logs go to `.studio-audits/` (git-ignored).
- Success means a new or changed `reports/*.json` that passes `validate()`.
- The dialog warns when the audit would replace a report (`/api/audits/existing`),
  and the run backs that report up first. A site report is found by its slug,
  which follows from the URL. A page report is found by `meta.pageUrl`, because
  the agent picks the page slug.
- The dialog can set the run's model and effort (`--model`, `--effort`; left
  out, the user's own Claude Code settings) and put every subagent on Sonnet.
  claude-seo's agent files name their own models, so that last one needs
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` in the run's environment, not just
  `CLAUDE_CODE_SUBAGENT_MODEL`.
- A failed or cancelled run keeps its session id, and Resume continues that
  session with `--resume` rather than starting over, so a run stopped by a
  usage limit does not pay for its finished subagents twice. Only jobs still in
  memory can be resumed.
- A site audit can cover some of the site's language versions. The dialog
  reads them from hreflang (`/api/audits/languages`) and passes the ticked ones
  as `--languages`. A version is identified by its root URL, and a URL belongs
  to the longest root containing it, so a language served at `/` works whatever
  that language is. Never assume the root is any particular language.
  Afterwards the Studio writes `meta.languages` and lists findings whose
  evidence points outside the chosen versions.
- `keep-awake.ts` blocks idle sleep for the run's PID with `caffeinate`,
  `SetThreadExecutionState` or `systemd-inhibit`. None of them stop lid-close
  sleep. When it fails, the UI warns instead.

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

Before changing `templates/report.css` or `src/pdf.ts`, read the "Print gotchas"
section of [README.md](README.md) — the two-pass render and the
`print-color-adjust` handling are load-bearing and non-obvious.

After any template change, verify visually. `page.pdf()` fails silently: a broken
`break-inside` or a dropped background produces a valid PDF that just looks wrong.

```bash
npm run report -- <slug> --lang en --html
pdftoppm -png -r 90 -f 2 -l 4 "$(ls -t out/SEO-Audit-<slug>-en-*.pdf | head -1)" out/_check
```

No report is tracked, so use any local one in `reports/`. Pick one with every
section populated (metrics, custom sections, not-covered items).

Check: no finding split across a page boundary, header/footer present and
unclipped, background colors intact.

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

These PDFs go to paying clients under the user's brand. Every finding must be
independently verifiable from the evidence given. Do not pad reports with invented
issues, and do not mark something `pass` that was not actually tested — put it in
`notCovered` instead.
