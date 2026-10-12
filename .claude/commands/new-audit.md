---
description: Run a full SEO audit on a site with the claude-seo plugin and write it out as structured report JSON ready for PDF generation.
argument-hint: <url> [client name]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, Skill, Agent
---

# New audit

Audit a site end to end and emit `reports/<slug>.json`. Arguments: `$ARGUMENTS`

The audit methodology comes from the **claude-seo** plugin, not from this repo.
This repo owns the report: the schema, the translation, the PDF. Keeping the two
apart is what lets claude-seo update without touching anything here.

## Steps

0. **Preflight.** Run `npm run --silent doctor -- --json`.

   - If `ok` is `false`, stop. List each failed check with its `fix` and tell the
     user to run `npm run setup` or `npm run doctor`. Do **not** fall back to
     auditing without claude-seo: a weaker audit that looks the same in the PDF
     is worse than no audit.
   - If the `claude-seo plugin` check has `warn: true`, the installed version
     differs from the one these reports were tested against. Say so in one line,
     then continue.
   - Note whether the `Google APIs (optional)` check passed. It decides step 2.

1. **Run the claude-seo audit.** Use the claude-seo plugin's audit (the `/seo audit
   <url>` flow) for the methodology and the parallel subagents. Two overrides:
   do not generate claude-seo's own PDF, and do not offer `/seo google report`;
   this repo's renderer produces the report.

   The audit already delegates to `seo-technical`, `seo-content`,
   `seo-schema`, `seo-sitemap` and the rest of its subagents, plus `seo-local`
   when it detects a local business. Do not run those again: it repeats the
   same checks and only produces duplicate findings to merge. The one gap is
   **`seo-hreflang`**, which the full audit never runs. If the site serves more
   than one language or region, run it as well.

   Then run `npm run --silent check-social -- <url> --json`. It checks Open
   Graph and X/Twitter Card tags on every sitemap URL, fetched as Twitterbot,
   and covers a gap in claude-seo 2.4.2, which never checks `twitter:image`.
   Without that tag X shows shared links with no picture. Each entry in
   `issues` lists the affected URLs. Merge them into one social-tags finding, an
   `opportunity` unless share images are broken. Use the script's results over
   any subagent claim about these tags. If `issues` is empty, add a `pass`.

2. **Collect measured data** for `metrics`. Only when the Google APIs check
   passed. Use claude-seo's `seo-google` skill:

   - **Search Console.** Find the property for this site among the account's
     sites (`sc-domain:<domain>` or a URL prefix). Pull the last 28 complete days
     of clicks, impressions, CTR and average position, plus the top 10 queries by
     clicks. If the site is not in the account, skip `searchConsole` and add a
     `notCovered` entry: the client can grant access by adding the service
     account's email to their property as a Restricted user.
   - **Core Web Vitals.** Mobile, homepage. Use CrUX field data when the origin
     has it (`source: "field"`, p75). Otherwise use the PageSpeed Insights lab
     run (`source: "lab"`). Never label lab numbers as field data.

   Without Google APIs, run PageSpeed Insights through claude-seo only if it
   works with no key. If that also fails, leave `metrics` out and say so in
   `method` and `notCovered`.

3. **Map the claude-seo results into the schema below.** Rules:

   - **Severity.** claude-seo Critical → `critical`. High → `warning`. Medium
     and Low → `opportunity`. Checks it verified as correct → `pass`.
   - **Score.** `meta.score` is claude-seo's SEO Health Score (0–100).
   - **One finding per issue.** Several subagents often report the same problem.
     Merge them into one finding and keep the strongest evidence.
   - **Evidence.** Every non-pass finding needs evidence a reader could check: a
     URL, a header, a file, a measured number.
   - **Roadmap.** Use claude-seo's prioritised action plan, rewritten for a
     client: what to do first, and which items are configuration versus which
     actually move rankings.
   - **Method.** Say what claude-seo measured and how, including the claude-seo
     version from the preflight, and what could not be measured.

4. **Write `reports/<slug>.json`.** Findings in English only.
   `/translate-report` fills in `et` and `ru` afterwards. Run
   `npm run report -- <slug>`: it validates the file and renders the English
   PDF. Fix any validation error it reports.

5. **Report back** the score, finding counts by severity, whether `metrics` came
   from field or lab data, and the next steps: `/translate-report <slug> all`,
   then `/seo-report <slug> --all`.

## Schema

```jsonc
{
  "meta": {
    "slug": "naa-ee",              // kebab-case, becomes the filename
    "site": "naa.ee",              // shown large on the cover
    "siteUrl": "https://naa.ee/",
    // "scope": "page", "pageUrl": "…"  — only for /new-page-audit; omit here
    "clientName": "Nordic Aviation Academy",
    "auditedAt": "2026-07-31",     // ISO date
    "pagesAnalyzed": 17,
    "score": 54,                   // 0-100
    "stack": "WordPress 7.0.2 · …",// optional, one line
    "sourceLang": "en"
  },
  "summary": { "en": "…" },        // 3-5 sentences, executive register
  "method": { "en": "…" },         // how you measured, and what you couldn't
  "metrics": {                     // optional — measured numbers, never translated
    "searchConsole": {             // optional
      "property": "sc-domain:naa.ee",
      "start": "2026-07-03",       // ISO dates, inclusive
      "end": "2026-07-30",
      "clicks": 1234,
      "impressions": 45678,
      "ctr": 0.027,                // a fraction, not a percentage
      "position": 18.4,
      "topQueries": [              // up to 10, by clicks; queries verbatim
        { "query": "lennukool", "clicks": 120, "impressions": 3400, "position": 4.2 }
      ]
    },
    "coreWebVitals": {             // optional
      "url": "https://naa.ee/",
      "strategy": "mobile",        // mobile | desktop
      "source": "field",           // field (CrUX p75) | lab (Lighthouse)
      "lcp": 2830,                 // ms
      "inp": 160,                  // ms — field only; omit for lab
      "cls": 0.04,
      "performance": 64            // optional Lighthouse score 0-100
    }
  },
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

- **`evidence`**: a plain string for a verbatim technical reference (URL, file
  path, header name). An `{ en, et, ru }` object when it is prose such as
  "all URLs", so it can be translated.
- **`severity: "pass"`**: title only, no `body`, `impact` or `effort`. These
  render as a compact list. Include them: showing what is already correct is
  what makes a client trust the critical findings.
- **`roadmap`**: ordered by what to do first, cheapest-highest-leverage first.
  Say plainly which items are configuration and which actually move rankings.
- **`score`**: 90+ excellent, 70–89 good, 50–69 needs significant work, <50
  critical. The cover dial colour follows these bands.
- **`metrics`**: numbers only. The renderer supplies the labels in each
  language, so nothing in `metrics` is ever translated. Report what the API
  returned; do not round before writing it. A metric that is measured badly also
  belongs in `findings` (a poor LCP is a finding), with the number as evidence.
- **`sections`**: optional, for evidence a finding card cannot carry: a SERP
  screenshot, a Lighthouse trace, a crawl diagram. Images live under
  `assets/<slug>/` and are inlined as data URIs at render time, so keep them
  around 1400px wide. That is enough for ~200dpi at the 174mm printed width,
  without bloating the PDF. Do not add a section just to decorate the report.

## Do not

- Do not invent findings to pad the report. A short honest audit beats a long
  padded one, and the client can verify every claim.
- Do not report a finding without evidence a reader could check themselves.
- Do not mark something `pass` you did not actually test. List it under
  `notCovered` instead.
- Do not write audit prose outside `reports/<slug>.json`. Prose cannot be
  re-rendered into another language without re-auditing.
