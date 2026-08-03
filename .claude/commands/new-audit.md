---
description: Run a full SEO audit on a site and write it out as structured report JSON ready for PDF generation.
argument-hint: <url> [client name]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch
---

# New audit

Audit a site end to end and emit `reports/<slug>.json`. Arguments: `$ARGUMENTS`

## Steps

1. **Run the audit.** Use the `seo-audit` skill for the methodology — crawlability,
   meta tags, headings, images, performance signals, structured data, internal
   linking, mobile and accessibility. Use `technical-seo` and `broken-links` for
   depth where relevant.

   State your method honestly in the `method` field, including what you could not
   measure. If PageSpeed Insights quota fails and you fall back to local Lighthouse,
   say so — lab data is not field data and the report must not imply otherwise.

2. **Write `reports/<slug>.json`** in the schema below. Findings in English only;
   `/translate-report` fills in `et` and `ru` afterwards.

3. **Generate the PDF** with `/seo-report <slug>`.

## Schema

```jsonc
{
  "meta": {
    "slug": "naa-ee",              // kebab-case, becomes the filename
    "site": "naa.ee",              // shown large on the cover
    "siteUrl": "https://naa.ee/",
    "clientName": "Nordic Aviation Academy",
    "auditedAt": "2026-07-31",     // ISO date
    "pagesAnalyzed": 17,
    "score": 54,                   // 0-100
    "stack": "WordPress 7.0.2 · …",// optional, one line
    "sourceLang": "en"
  },
  "summary": { "en": "…" },        // 3-5 sentences, executive register
  "method": { "en": "…" },         // how you measured, and what you couldn't
  "findings": [
    {
      "id": "no-https-redirect",   // stable kebab-case, lets you diff re-audits
      "severity": "critical",      // critical | warning | opportunity | pass
      "impact": "high",            // high | medium | low — omit on `pass`
      "effort": "low",             // high | medium | low — omit on `pass`
      "evidence": "http://naa.ee/",
      "title": { "en": "…" },
      "body":  { "en": "…" }       // omit on `pass` — the title carries it
    }
  ],
  "roadmap":    [ { "title": { "en": "…" }, "body": { "en": "…" } } ],
  "notCovered": [ { "title": { "en": "…" }, "body": { "en": "…" } } ],
  "sections":   [                  // optional — prose and/or an image
    {
      "id": "serp-preview",        // stable kebab-case
      "after": "summary",          // summary | breakdown | findings | roadmap | notCovered
      "breakBefore": false,        // force a page break before this section
      "title": { "en": "…" },
      "body":  { "en": "…" },      // optional
      "image": {                   // optional
        "src": "assets/<slug>/serp.png",
        "alt":     { "en": "…" },
        "caption": { "en": "…" }
      }
    }
  ]
}
```

### Field rules

- **`evidence`** — a plain string for a verbatim technical reference (URL, file
  path, header name). An `{ en, et, ru }` object when it is prose such as
  "all URLs", so it can be translated.
- **`severity: "pass"`** — title only, no `body`, `impact` or `effort`. These
  render as a compact list. Include them: showing what is already correct is
  what makes a client trust the critical findings.
- **`roadmap`** — ordered by what to do first, cheapest-highest-leverage first.
  Say plainly which items are configuration and which actually move rankings.
- **`score`** — 90+ excellent, 70–89 good, 50–69 needs significant work, <50
  critical. The cover dial colour follows these bands.
- **`sections`** — optional, for evidence a finding card cannot carry: a SERP
  screenshot, a Lighthouse trace, a crawl diagram. Images live under
  `assets/<slug>/` and are inlined as data URIs at render time, so keep them
  around 1400px wide — enough for ~200dpi at the 174mm printed width, without
  bloating the PDF. Do not add a section just to decorate the report.

## Do not

- Do not invent findings to pad the report. A short honest audit beats a long
  padded one, and the client can verify every claim.
- Do not report a finding without evidence a reader could check themselves.
- Do not mark something `pass` you did not actually test — list it under
  `notCovered` instead.
