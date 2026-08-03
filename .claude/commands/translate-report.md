---
description: Translate a report JSON's findings into Estonian and/or Russian, cached back into the same file.
argument-hint: <report-slug> [et|ru|all]
allowed-tools: Read, Edit, Write, Bash
---

# Translate report

Fill in the missing language variants in a report JSON. Arguments: `$ARGUMENTS`

Translation is cached **into the report file itself**, so it is paid once. Never
re-translate a language that is already populated unless the English source
changed or the user explicitly asks.

## Steps

1. Read `reports/<slug>.json` and `i18n/glossary.json`.

2. Identify every translatable field missing the target language. Translatable
   fields are `summary`, `method`, and — on each entry of `findings`, `roadmap`
   and `notCovered` — `title`, `body`, and `evidence` **when `evidence` is an
   object**. A string `evidence` is a verbatim technical reference: leave it
   alone.

3. Translate from `meta.sourceLang` (normally `en`).

4. Write the translations back into the same file, preserving key order and
   the existing English. Set `meta.translatedAt.<lang>` to today's date.

5. Report which fields you filled and confirm nothing was overwritten.

## Translation rules

**Preserve verbatim — never translate:** every term in
`i18n/glossary.json` → `doNotTranslate`, all HTML tags and attributes
(`<h1>`, `rel="canonical"`, `lang="et"`), all URLs, file paths and slugs, and
HTTP status codes as numerals.

This is not a style preference. Estonian and Russian SEO practitioners use the
English terms; a report saying "kanooniline URL" instead of `canonical` reads as
amateur and is harder to action.

**Localise:** decimal separators (`5.2 s` → `5,2 s`), thousands separators
(`82,763 B` → `82 763 B`), and units where a native form exists (`KB` → `КБ` in
Russian). Keep `ms`, `s`, `KiB` as-is.

**Register:** write for a technical decision-maker, not a search engine. These
reports are read by clients who are paying for clarity. Match the directness of
the English source — do not soften findings in translation.

**Estonian specifically:** runs roughly 15–20% longer than English. Prefer the
tighter phrasing where two options exist; the PDF layout tolerates overflow but
long strings push cards onto later pages and cost you density.

## After translating

Regenerate the PDFs so the change is visible:

```bash
npm run report -- <slug> --all
```
