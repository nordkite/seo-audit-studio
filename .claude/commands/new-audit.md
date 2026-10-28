---
description: Run a full SEO audit on a site with the claude-seo plugin and write it out as structured report JSON ready for PDF generation.
argument-hint: <url> [--languages et,ru] [client name]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, Skill, Agent
---

# New audit

Audit a site end to end and emit `reports/<slug>.json`. Arguments: `$ARGUMENTS`

The first argument is the URL. If the next one is `--languages` followed by
comma-separated hreflang codes, the audit covers only those language versions
of the site (see [Language scope](#language-scope)). Everything after that,
verbatim, is `meta.clientName`: do not split it, shorten it or read part of it
as a page name. With no name given, derive it from the site.

The audit methodology comes from the **claude-seo** plugin, not from this repo.
This repo owns the report: the schema, the translation, the PDF. Keeping the two
apart is what lets claude-seo update without touching anything here.

## Steps

0. **Preflight.** Run `node scripts/doctor.ts --json`.

   Call the scripts in this file with `node`, not `npm run`. The Studio runs
   this command unattended, and many people keep an `ask` rule on `npm` that
   nobody is there to answer, so the call would be denied.

   - If `ok` is `false`, stop. List each failed check with its `fix` and tell the
     user to run `npm run setup` or `npm run doctor`. Do **not** fall back to
     auditing without claude-seo: a weaker audit that looks the same in the PDF
     is worse than no audit.
   - If the `claude-seo plugin` check has `warn: true`, the installed version
     differs from the one these reports were tested against. Say so in one line,
     then continue.
   - Keep `claudeSeo` (the launcher for claude-seo's scripts) and `google`
     (which of Search Console, Analytics and CrUX have credentials). `google`
     is missing when Google APIs are not configured at all.
   - Read **[audit/coverage.json](../../audit/coverage.json)**. It lists what
     this audit must cover: the subagents claude-seo should run, and this
     repo's supplements for claude-seo's gaps. Steps 1 and 2 follow it.
   - With `--languages`, set up the [Language scope](#language-scope) now,
     before anything is crawled.
   - **Working files go in `.audit-work/`.** claude-seo writes its findings,
     renders and screenshots to `{domain}-audit/` in the current folder, which
     is this repo's root. Put that folder under `.audit-work/` instead
     (`.audit-work/{domain}-audit/`), and tell every subagent the same path.
     It is git-ignored: it holds a client's pages, and this repo tracks no
     client data.

1. **Run the claude-seo audit.** Use the claude-seo plugin's audit (the `/seo audit
   <url>` flow) for the methodology and the parallel subagents. Two overrides:
   do not generate claude-seo's own PDF, and do not offer `/seo google report`;
   this repo's renderer produces the report.

   - **Do not spawn the subagents yourself.** The audit spawns those in
     `subagents.site` on its own. Running them again repeats the same checks
     and only produces duplicate findings to merge.
   - **Check coverage afterwards.** Every subagent in `subagents.site.always`
     must have run, and each one in `subagents.site.when` must have run when its
     condition held. For any that did not, or that failed or was denied, add a
     `notCovered` entry naming what it checks, and say so in `method`. Never
     let a check that did not run read as a pass.
   - **Run every supplement** in `supplements` whose `scope` includes `site`
     and whose `when` holds, using its `run` and `target` for site scope.
     Replace `"$CLAUDE_SEO"` with the `claudeSeo` path from the preflight. A
     supplement's results win over any subagent claim on the same check.
   - **`social-tags`** returns `issues`, each listing the affected URLs. Merge
     them into one social-tags finding, an `opportunity` unless share images are
     broken. If `issues` is empty, add a `pass`.
   - **`lighthouse`** feeds `metrics.coreWebVitals` when CrUX field data is
     unavailable (step 2). Its four Lighthouse scores (performance,
     accessibility, best practices, SEO) go in `coreWebVitals` either way; the
     report draws them as gauges.
   - **`stack-cve`** reads only the response it fetched. Do not ask whether
     the client owns the site and do not request any other path
     (`/wp-login.php`, `/xmlrpc.php`): the reference allows that only after the
     owner confirms, and the Studio runs this unattended. Map its bands:
     High (PHP version below the fixed list) → `warning`, "likely exposed,
     confirm with the host", with the `X-Powered-By` value as evidence. Info
     (a PHP signal, version hidden) → `opportunity`, with the signal as
     evidence and the fixed versions in `body`. Pass (no PHP signal) → `pass`,
     and say in `method` that it is an external read, not proof that no PHP
     runs anywhere. Never `critical`: that needs the owner to confirm an
     unpatched build, which an outside audit cannot.

2. **Collect measured data** for `metrics`, and record every source in
   `meta.dataSources` (see Field rules) whether it was used or not.

   - **Search Console.** Only when `google.searchConsole` is true. Use
     claude-seo's `seo-google` skill. Find the property for this site among the
     account's sites (`sc-domain:<domain>` or a URL prefix). Pull the last 28
     complete days of clicks, impressions, CTR and average position, plus the
     top 10 queries by clicks. If the site is not in the account, skip
     `searchConsole` and add a `notCovered` entry: the client can grant access
     by adding the service account's email to their property as a Restricted
     user.
   - **Google Analytics 4.** Only when `google.analytics` is true, and only if
     the configured GA4 property belongs to this site. Record the status; GA4
     numbers do not go into the report yet.
   - **Core Web Vitals.** Mobile, homepage. Use CrUX field data when
     `google.crux` is true and the origin has data (`source: "field"`, p75).
     Otherwise use the `lighthouse` supplement's lab run (`source: "lab"`).
     Never label lab numbers as field data. If both fail, leave
     `coreWebVitals` out and say so in `method` and `notCovered`.

3. **Map the claude-seo results into the schema below.** Rules:

   - **Severity.** claude-seo Critical → `critical`. High → `warning`. Medium
     and Low → `opportunity`. Checks it verified as correct → `pass`.
   - **Score.** `meta.score` is claude-seo's SEO Health Score (0–100), and
     `scores` holds its per-category scores exactly as claude-seo gave them.
     The report charts them. Leave out a category claude-seo did not score.
   - **One finding per issue.** Several subagents often report the same problem.
     Merge them into one finding and keep the strongest evidence.
   - **Evidence.** Every non-pass finding needs evidence a reader could check: a
     URL, a header, a file, a measured number.
   - **Roadmap.** Use claude-seo's prioritised action plan, rewritten for a
     client: what to do first, and which items are configuration versus which
     actually move rankings.
   - **Competitors and rankings.** A claim about who ranks for a query, or what
     competitors do, needs search results from the site's own market: its
     country and languages (google.ee in Estonian and Russian for an Estonian
     site, not google.com). claude-seo gets those only through DataForSEO with
     the location set. WebSearch cannot set a country and searches from the US,
     so its results never back such a claim. Without market results, keep a
     finding whose problem stands on the site's own evidence (no branch pages,
     no landing page for a product line) and drop the competitor comparison
     from it. Add a `notCovered` entry for competitor rankings in that market.
     Positions from the site's own Search Console are real data and need no
     such check.
   - **Method.** Write it for the site owner, not an SEO specialist: a short
     paragraph on where the data came from, which period it covers, and what
     the report leaves out and why. No jargon the client would have to look up:
     "Chrome data from real visitors over the last 28 days", not "CrUX p75
     origin-level"; "a test on a simulated slow mobile connection", not "lab
     run with slow-4G throttling". Terms the findings themselves use (`LCP`,
     `canonical`) are fine. End with one line giving the claude-seo version
     from the preflight and the sample sizes.

4. **Write `reports/<slug>.json`.** With `--languages`, the slug is the site
   slug, two hyphens, then the codes as given joined by hyphens
   (`example-ee--et-ru`), so it never overwrites the whole-site report.
   Findings in English only.
   `/translate-report` fills in `et` and `ru` afterwards. Run
   `node src/generate.ts <slug>`: it validates the file and renders the English
   PDF. Fix any validation error it reports.

5. **Report back** the score, finding counts by severity, `meta.dataSources`,
   the language versions audited and left out (with `--languages`),
   whether `metrics` came from field or lab data, any subagent or supplement
   that did not run, and the next steps: `/translate-report <slug> all`,
   then `/seo-report <slug> --all`.

## Language scope

Without `--languages`, audit every language version of the site. With it
(`--languages et,ru`), audit only those versions. Everything below applies only
then.

- **Find the versions.** Run
  `node scripts/site-languages.ts <url> --langs <codes> --json`. It returns
  `versions` (each a `root` URL and its hreflang `langs`), `rootLang`,
  `selected`, `excluded`, and `urls`: the sitemap URLs inside the selected
  versions. If it returns `error`, stop and report it. Do not fall back to a
  whole-site audit: the person asked for less, and a report covering more
  languages than requested is the wrong report.
- **Which version a URL is in.** The one with the longest `root` that contains
  it. The homepage's language is `rootLang`, never assumed: with Estonian at
  `/` and Russian at `/ru/`, `/ru/kontakt` is Russian and `/kontakt` Estonian;
  on another site the root may be English or Russian.
- **Scope the claude-seo audit.** Before it starts, state the scope: the
  selected roots, the excluded roots, the rule above, and that `urls` is the
  page set. Put the same scope in every subagent's prompt. Crawl from the
  selected roots and never follow links into an excluded version. If `urls`
  holds only the roots (the sitemap could not be read), crawl from the roots
  under the same rule.
- **Site-wide checks stay site-wide:** robots.txt, sitemap discovery, security
  headers, backlinks, the server stack. Report sitemap problems only for URLs
  in the selected versions.
- **hreflang.** Check the annotations on the selected versions' pages. Fetch an
  excluded version only to confirm a return link, and report nothing else
  about it.
- **Supplements.** Run `social-tags` with `--langs <codes>`. `images` picks its
  templates from `urls`. `lighthouse` targets the root of the first selected
  version instead of the homepage. `stack-cve` stays on the homepage.
- **Search Console.** claude-seo's `gsc_query.py` cannot filter by page. Write
  every page's rows and every query+page row to a temporary directory
  (`mktemp -d`):
  `"$CLAUDE_SEO" run gsc_query.py query --property <property> --dimensions page --limit 100000 --json > <dir>/pages.json`,
  and the same with `--dimensions query,page` into `<dir>/queries.json`. Then
  run `node scripts/site-languages.ts <url> --langs <codes> --gsc-pages <dir>/pages.json --gsc-queries <dir>/queries.json --json`.
  Its `searchConsole` holds `clicks`, `impressions`, `ctr` (a fraction),
  `position` and `topQueries` for the selected versions: use those for
  `metrics.searchConsole`, with the start and end dates of the query. Say in
  `method` that the numbers are summed over those versions' pages.
- **Core Web Vitals.** CrUX origin data covers every language on that origin.
  Use URL-level data for the first selected root, or the lab run, and set
  `coreWebVitals.url` to that root.
- **Findings** cover the selected versions only. Each evidence URL must be in
  one of them, except an hreflang return-link finding that names the other
  side. The Studio lists any other evidence URL outside the scope.
- **`meta.pagesAnalyzed`** counts pages in the selected versions only.
  **`meta.languages`** is the codes as given; the cover names them.
- **`notCovered`** gets one entry naming the excluded versions by language and
  root, saying they were left out by choice, not because a check failed.
  `method` says in one sentence which versions were audited.

## Schema

```jsonc
{
  "meta": {
    "slug": "example-com",              // kebab-case, becomes the filename
    "site": "example.com",              // shown large on the cover
    "siteUrl": "https://example.com/",
    // "scope": "page", "pageUrl": "…"  — only for /new-page-audit; omit here
    // "languages": ["et", "ru"]      — only with --languages; see Language scope
    "clientName": "Example Ltd",
    "auditedAt": "2026-07-31",     // ISO date
    "pagesAnalyzed": 17,
    "score": 54,                   // 0-100
    "stack": "WordPress 7.0.2 · …",// optional, one line
    "dataSources": {               // every source, used or not; see Field rules
      "searchConsole": "noAccess",
      "analytics": "notConfigured",
      "crux": "noData",
      "pagespeed": "used"
    },
    "sourceLang": "en"
  },
  "summary": { "en": "…" },        // 3-5 sentences, executive register
  "method": { "en": "…" },         // how you measured, and what you couldn't
  "metrics": {                     // optional — measured numbers, never translated
    "searchConsole": {             // optional
      "property": "sc-domain:example.com",
      "start": "2026-07-03",       // ISO dates, inclusive
      "end": "2026-07-30",
      "clicks": 1234,
      "impressions": 45678,
      "ctr": 0.027,                // a fraction, not a percentage
      "position": 18.4,
      "topQueries": [              // up to 10, by clicks; queries verbatim
        { "query": "example query", "clicks": 120, "impressions": 3400, "position": 4.2 }
      ]
    },
    "coreWebVitals": {             // optional
      "url": "https://example.com/",
      "strategy": "mobile",        // mobile | desktop
      "source": "field",           // field (CrUX p75) | lab (Lighthouse)
      "lcp": 2830,                 // ms
      "inp": 160,                  // ms — field only; omit for lab
      "cls": 0.04,
      "performance": 64,           // Lighthouse scores 0-100, same lab run
      "accessibility": 91,
      "bestPractices": 100,
      "seo": 85
    }
  },
  "scores": {                      // claude-seo's category scores, 0-100
    "technical": 62,               // technical | content | onPage | schema |
    "content": 48,                 // performance | aiSearch | images
    "onPage": 70,
    "schema": 35,
    "performance": 55,
    "aiSearch": 60,
    "images": 65
  },
  "findings": [
    {
      "id": "no-https-redirect",   // stable kebab-case, lets you diff re-audits
      "severity": "critical",      // critical | warning | opportunity | pass
      "impact": "high",            // high | medium | low — omit on `pass`
      "effort": "low",             // high | medium | low — omit on `pass`
      "evidence": "http://example.com/",
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
  critical. The cover dial color follows these bands.
- **`metrics`**: numbers only. The renderer supplies the labels in each
  language, so nothing in `metrics` is ever translated. Report what the API
  returned; do not round before writing it. A metric that is measured badly also
  belongs in `findings` (a poor LCP is a finding), with the number as evidence.
- **`meta.languages`**: only with `--languages`. Leave it out of a
  whole-site audit, even on a multilingual site.
- **`meta.dataSources`**: one entry for each of `searchConsole`, `analytics`,
  `crux` and `pagespeed`. The report prints them as a table under Method, so a
  client can tell "no Search Console numbers because there was no access" from
  "nothing to report". Values:
  - `used`: the report contains its data.
  - `notConfigured`: no credentials for it on this machine (the preflight's
    `google` is missing or says `false`).
  - `noAccess`: credentials work, but not for this site (the site is not in
    the Search Console account, or the GA4 property is another site's).
  - `noData`: asked successfully, nothing came back (CrUX for a low-traffic
    origin).
  - `failed`: the call errored. Put the error in `method`.
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
