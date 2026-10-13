---
description: Audit a single page with claude-seo's seo-page and write it out as structured report JSON ready for PDF generation.
argument-hint: <page-url> [client name]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, Skill, Agent
---

# New page audit

Audit one URL and emit `reports/<slug>.json`. Arguments: `$ARGUMENTS`

This is the single-page counterpart of `/new-audit`. Read
[new-audit.md](new-audit.md) first: its preflight, severity mapping, evidence
rules, schema and "Do not" list all apply here unchanged. This file only lists
where a page audit differs.

## Steps

0. **Preflight.** Exactly as in `/new-audit` step 0. Stop if `ok` is `false`.

1. **Run claude-seo's single-page analysis** (`seo-page`, the `/seo page <url>`
   flow) on the URL. Do not generate claude-seo's own PDF.

   - If the page serves more than one language or region, also run
     `seo-hreflang` for this URL. `seo-page` only glances at hreflang.
   - Then run `node scripts/check-social.ts <page-url> --page --json`.
     It checks Open Graph and X/Twitter Card tags on this URL only, fetched as
     Twitterbot. `seo-page` does not check `twitter:image`. Map the result
     exactly as `/new-audit` step 1 describes.
   - Do not crawl the rest of the site or run the full-site audit. Site-wide
     issues you notice on the way (robots.txt, sitemap, sitewide headers) may
     be reported only when this page is directly affected, with evidence from
     this page. Otherwise list them under `notCovered` and suggest a full
     `/new-audit`.

2. **Measured data.** Only when the Google APIs check passed:

   - **Core Web Vitals** for this URL, mobile. Use CrUX URL-level field data
     when it exists (`source: "field"`), otherwise the PageSpeed Insights lab
     run (`source: "lab"`). Set `coreWebVitals.url` to the page URL. Many
     single pages have no URL-level CrUX data. Do not substitute origin-level
     data without saying so in `method`.
   - **Search Console**: filter to this page (`page` equals the URL), last 28
     complete days, plus its top 10 queries. Skip it if the property is not in
     the account, as in `/new-audit`.

3. **Map into the schema.** Follow `/new-audit` step 3, with these differences:

   - **Score.** `meta.score` is `seo-page`'s overall page score, not a site
     Health Score. `method` must say this is a single-page score and not
     comparable to a full-site audit's score.
   - **Meta.**
     - `scope: "page"`, `pageUrl`: the audited URL exactly as fetched (after
       redirects; mention a redirect in `method` if there was one).
     - `site`: the domain, as in a site audit. `siteUrl`: the site's homepage.
     - `pagesAnalyzed: 1`.
     - **`slug`**: `<site-slug>--<page-slug>`, for example `example-com--courses` for
       `https://example.com/courses/` or `example-com--home` for the homepage. The
       page slug is the URL path in kebab case, without the language prefix
       when the site uses one only for routing (`/en/pricing` →
       `example-com--en-pricing` if several language versions might be audited
       separately, otherwise `example-com--pricing`). The double hyphen keeps
       page reports apart from the site report and sorted next to it.
   - **Roadmap**: for this page only. Order it as usual.
   - **Schema suggestions.** If `seo-page` produced ready-made JSON-LD, put it
     in a finding's `body` only when it is short. Otherwise describe what to
     add and reference the types.

4. **Write `reports/<slug>.json`** in English only. If the file already exists,
   stop and ask before overwriting it. Run `node src/generate.ts <slug>` and fix
   any validation errors.

5. **Report back**: the page URL, score, finding counts by severity, whether
   CWV came from URL-level field, origin-level field, or lab data, and the next
   steps: `/translate-report <slug> all`, then `/seo-report <slug> --all`.
