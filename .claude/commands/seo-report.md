---
description: Generate a branded PDF SEO report from a report JSON, in one or more languages.
argument-hint: <report-slug> [--lang et|ru|en] [--all] [--express]
allowed-tools: Bash, Read, Glob
---

# Generate PDF SEO report

Generate the client-facing PDF from structured audit data. Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the report.** The first argument is a slug matching `reports/<slug>.json`.
   If no slug was given, list `reports/*.json` and ask which one.

2. **Check translation coverage before rendering.** Read the report JSON and check
   which languages actually have content (probe `summary`). If the user asked for a
   language that is not filled in, tell them and offer to run `/translate-report`
   first — rendering will otherwise fall back to the source language and silently
   ship a half-English PDF to a client.

3. **Generate:**
   ```bash
   npm run report -- <slug> --all          # every translated language
   npm run report -- <slug> --lang et      # one language
   npm run report -- <slug> --lang et --lang ru
   npm run report -- <slug> --all --express  # the free excerpt, see below
   ```

   `--express` renders the express edition from the same report: the cover
   with the full counts, the summary, scores and measured data, then only the
   findings marked for it (`express.findings`, or the top 5 by severity and
   impact). It leaves out the roadmap; custom sections appear in both
   editions. Files are named `SEO-Express-Audit-…`.

4. **Report back** the output paths and file sizes. Do not open the PDFs. If the
   output warned that no brand config was found, say so plainly: the PDF carries
   the placeholder "Your Company" brand and must not go to a client until
   `brand/brand.json` is filled in.

## Verifying layout after template changes

Only needed when `templates/report.css` or `src/render.ts` changed:

```bash
npm run report -- <slug> --lang en --html          # writes intermediate HTML to out/
pdftoppm -png -r 90 -f 2 -l 4 "$(ls -t out/SEO-Audit-<slug>-en-*.pdf | head -1)" out/_check
```

Then Read the PNGs. Check specifically:
- no finding card split across a page boundary
- running header and footer present and not clipped
- background colors present (if they vanished, `printBackground` or
  `print-color-adjust` regressed)

Delete the `_check-*.png` and `*.html` scratch files when done.
