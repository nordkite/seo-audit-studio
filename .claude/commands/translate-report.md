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

1. Read `reports/<slug>.json`, `i18n/glossary.json` and
   `i18n/translation-rules.md`.

2. Identify every translatable field missing the target language. Translatable
   fields are `summary`, `method`, and — on each entry of `findings`, `roadmap`,
   `notCovered` and `sections` — `title`, `body`, and `evidence` **when
   `evidence` is an object**. A string `evidence` is a verbatim technical
   reference: leave it alone.

   On a `sections` entry, `image.alt` and `image.caption` are translatable too.
   `image.src` is a file path — never translate it.

3. Translate from `meta.sourceLang` (normally `en`).

4. Write the translations back into the same file, preserving key order and
   the existing English. Set `meta.translatedAt.<lang>` to today's date.

   Leave any `_translationState` key exactly as you found it. It is a
   machine-maintained map of source-text hashes used by Report Studio to detect
   stale translations; the Studio rewrites it after a successful run.

5. Report which fields you filled and confirm nothing was overwritten.

## Translation rules

**Read [i18n/translation-rules.md](../../i18n/translation-rules.md) and follow it.**
Glossary handling, number localisation, register, Estonian length — it is all
there, and it is not restated here on purpose: Report Studio loads the same file
into its system prompt, so a rule written in two places would drift between the
two paths and quietly produce two different house styles.

## After translating

Regenerate the PDFs so the change is visible:

```bash
npm run report -- <slug> --all
```
