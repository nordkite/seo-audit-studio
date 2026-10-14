---
description: Audit a single page with claude-seo's seo-page and write it out as structured report JSON ready for PDF generation.
argument-hint: <page-url> [client name]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, Skill, Agent
---

# New page audit

Audit one URL and emit `reports/<slug>.json`. Arguments: `$ARGUMENTS`

The first argument is the URL. Everything after it, verbatim, is
`meta.clientName`, exactly as in `/new-audit`.

This is the single-page counterpart of `/new-audit`. Read
[new-audit.md](new-audit.md) first: its preflight, severity mapping, evidence
rules, schema and "Do not" list all apply here unchanged. This file only lists
where a page audit differs.

A page audit should be as thorough as a site audit, only narrower. claude-seo's
`seo-page` is a single checklist with no subagents, so this command spawns the
subagents itself.

## Steps

0. **Preflight.** Exactly as in `/new-audit` step 0, including reading
   [audit/coverage.json](../../audit/coverage.json). Stop if `ok` is `false`.

1. **Run the page audit.**

   - **Base checklist.** Run claude-seo's single-page analysis (`seo-page`, the
     `/seo page <url>` flow) on the URL. Do not generate claude-seo's own PDF.
   - **Subagents.** Spawn every agent in `subagents.page.always`, and each one
     in `subagents.page.when` whose condition holds, as `claude-seo:<name>`
     agents in parallel. Tell each one to audit only this URL and not to crawl
     the site. If one fails or is denied, add a `notCovered` entry naming what
     it checks and say so in `method`.
   - **Supplements.** Run every supplement in `supplements` whose `scope`
     includes `page` and whose `when` holds, using its `run` and `target` for
     page scope. Map the results exactly as `/new-audit` step 1 describes.
   - **One finding per issue.** `seo-page` and the subagents overlap heavily.
     Merge their reports of the same problem and keep the strongest evidence.
   - **Stay on the page.** Do not crawl the rest of the site or run the
     full-site audit. Site-wide issues you notice on the way (robots.txt,
     sitemap, sitewide headers) may be reported only when this page is directly
     affected, with evidence from this page. Otherwise list them under
     `notCovered` and suggest a full `/new-audit`.

2. **Measured data.** As in `/new-audit` step 2, including `meta.dataSources`,
   with these differences:

   - **Core Web Vitals** for this URL, mobile. Use CrUX URL-level field data
     when it exists (`source: "field"`), otherwise the `lighthouse`
     supplement's lab run on this URL (`source: "lab"`). Set
     `coreWebVitals.url` to the page URL. Many single pages have no URL-level
     CrUX data. Do not substitute origin-level data without saying so in
     `method`. Without URL-level data, `crux` is `noData`.
   - **Search Console**: filter to this page (`page` equals the URL), last 28
     complete days, plus its top 10 queries. Skip it if the property is not in
     the account, as in `/new-audit`.

3. **Map into the schema.** Follow `/new-audit` step 3, with these differences:

   - **Score.** `meta.score` is `seo-page`'s overall page score, not a site
     Health Score. `method` must say this is a single-page score and not
     comparable to a full-site audit's score. `scores` holds `seo-page`'s five
     category scores (`onPage`, `content`, `technical`, `schema`, `images`).
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
   - **Schema suggestions.** If `seo-page` or `seo-schema` produced ready-made
     JSON-LD, put it in a finding's `body` only when it is short. Otherwise
     describe what to add and reference the types.

4. **Write `reports/<slug>.json`** in English only. If the file already exists,
   stop and ask before overwriting it. Run `node src/generate.ts <slug>` and fix
   any validation errors.

5. **Report back**: the page URL, score, finding counts by severity,
   `meta.dataSources`, whether CWV came from URL-level field, origin-level
   field, or lab data, any subagent or supplement that did not run, and the
   next steps: `/translate-report <slug> all`, then `/seo-report <slug> --all`.
