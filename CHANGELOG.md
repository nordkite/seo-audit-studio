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
