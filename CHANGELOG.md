# Changelog

## 1.1.0 — 2026-10-26

### Added

- **`stack-cve` supplement.** Every audit now reads the homepage's (or the
  audited page's) response headers and HTML for a PHP version with known CVEs,
  using claude-seo 2.5.0's stack CVE reference. claude-seo added this check to
  its `seo-technical` skill only, and audits run the `seo-technical` agent, so
  without the supplement it never ran. It is reported as a warning at most:
  an outside read cannot confirm an unpatched build.
- **`npm run doctor` shows the claude-seo install scope**, and warns when more
  than one enabled install has a different version. They share one Python
  runtime, so setting up one can leave the other broken. The warning prints the
  update command for the older one.
- **Audit only some of a site's language versions.** `/new-audit <url>
  --languages et,ru` covers just those versions, and the Studio's New report
  dialog offers them as checkboxes, read from the homepage's hreflang. The
  homepage's own language is detected, never assumed, and a URL belongs to the
  version with the longest root that contains it, so a language served at `/`
  works whatever it is. Crawl, supplements, Search Console totals and Core Web
  Vitals stay inside the chosen versions; robots.txt, security headers and
  backlinks stay site-wide. The cover names the versions, the rest are listed
  under "Not covered", and the report is saved as `<site>--et-ru.json` so it
  never overwrites the whole-site one. Afterwards the Studio lists any finding
  whose evidence points at a version that was not chosen.
- **Model, effort and subagents for Studio audits.** The New report dialog can
  run an audit on Opus or Sonnet, at a chosen effort, and put every subagent on
  Sonnet. Left alone, an audit uses your Claude Code settings as before.
- **Resume a stopped audit.** A failed or cancelled audit continues its own
  Claude session from where it stopped, so a run cut off by a usage limit does
  not pay for its finished subagents again.
- **Express edition.** `npm run report -- <slug> --express`, or Full / Express
  above the Studio's preview, renders a short free excerpt of the same report:
  the cover with the full issue counts, the summary, scores and measured data,
  and only the key findings. Those are the top 5 by severity and impact unless
  picked with ⚡ on the findings board. The roadmap stays in the full report;
  custom sections and the closing note appear in both. An "Express audit note"
  at the end says how many issues the audit found and what the full audit
  adds, or any text you write there, with `{shown}` and `{total}` filled in.
- **Core Web Vitals and Lighthouse scores can be edited in the Studio**: the
  device, field or lab source, measured URL, LCP, INP, CLS and the four
  Lighthouse scores. Scores outside 0–100 fail validation.

### Fixed

- **`check-social.ts` output was cut off at 64 KB on macOS** when piped, so a
  large site's results reached the audit as broken JSON.
- **`check-social.ts` reads sitemaps with an ordinary user agent.** Some sites
  refuse their sitemap to Twitterbot, which left only the homepage checked.
  Pages are still fetched as Twitterbot.

### Changed

- **claude-seo 2.5.0** is the verified release (was 2.4.2).
- **Each finding group starts on a new page** in the PDF: critical, warnings,
  opportunities and passed checks. Before, only the first one did, and a tall
  first card could leave a group heading alone at the bottom of a page.
- **Competitor claims need results from the site's own market.** `/new-audit`
  and `/new-page-audit` only compare a site with competitors when the search
  results come from its country and languages, which claude-seo gets through
  DataForSEO. Its fallback, WebSearch, always searches from the US. Without
  DataForSEO, a finding keeps the problem seen on the site itself, drops the
  comparison, and competitor rankings are listed under "Not covered".
- **`social-tags` no longer requires `twitter:title`, `twitter:description`
  or `twitter:image`.** X falls back to the matching `og:` tags, so their
  absence is not an issue. `twitter:card` is still required, since nothing
  replaces it.
- **`audit/coverage.json` matches claude-seo 2.5.0's audit.** `seo-backlinks`
  is expected on every site audit, since claude-seo always includes its keyless
  Common Crawl metrics. `seo-dataforseo` is expected when DataForSEO is
  connected, and `seo-matomo` when Matomo is configured. claude-seo 2.5.0 names
  `seo-matomo` without shipping it, so it lands in "Not covered".
- **The Method section is written for the site owner**: where the data came
  from, which period it covers and what the report leaves out, without SEO
  jargon. The claude-seo version and sample sizes move to one closing line.

### Upgrading

1. `git pull`
2. `claude plugin marketplace update agricidaniel-claude-seo`, then
   `claude plugin update claude-seo@agricidaniel-claude-seo`
3. `npm run doctor`

Existing reports render unchanged. Render their PDFs again to get the new page
breaks. Reports audited before 1.1.0 may compare the site with competitors
from US search results: check those findings against the site's own Google
domain before sending them.

## 1.0.0 — 2026-10-15

First release.
