# Translation rules

The rules every translation of a report must follow, whoever is doing
the translating.

This file is the single source. It is read verbatim into the system prompt by
`studio/lib/translate/prompt.ts`, and `.claude/commands/translate-report.md`
points here rather than restating it. Edit it once and both paths change. The
list of protected terms is not here — it is `i18n/glossary.json`, which is
injected alongside this file.

## Preserve verbatim — never translate

Every term in `i18n/glossary.json` → `doNotTranslate`, all HTML tags and
attributes (`<h1>`, `rel="canonical"`, `lang="et"`), all URLs, file paths and
slugs, and HTTP status codes as numerals.

This is not a style preference. Estonian and Russian SEO practitioners use the
English terms; a report saying "kanooniline URL" instead of `canonical` reads as
amateur and is harder to action.

## Localise

Decimal separators (`5.2 s` → `5,2 s`), thousands separators (`82,763 B` →
`82 763 B`), and units where a native form exists (`KB` → `КБ` in Russian). Keep
`ms`, `s`, `KiB` as-is.

## Register

Write for a technical decision-maker, not a search engine. These reports are
read by clients who are paying for clarity. Match the directness of the English
source — do not soften findings in translation.

## Estonian specifically

Runs roughly 15–20% longer than English. Prefer the tighter phrasing where two
options exist; the PDF layout tolerates overflow but long strings push cards
onto later pages and cost you density.

## Scope

Translate the text you are given and nothing else. Do not add commentary, do not
expand abbreviations, do not "improve" a finding while translating it. If a
string is a bare technical reference with no prose in it, return it unchanged.
