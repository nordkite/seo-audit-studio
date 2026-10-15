# Brand

Everything that puts your company on a report: name, contact details, logo and
color. `npm run setup` copies this folder to `brand/`. Edit the copy, not this
template. `brand/` is git-ignored, so your branding never ends up in the shared
repo and pulling updates never conflicts with it.

## brand.json

| Field | Required | Used for |
|---|---|---|
| `name` | yes | PDF author metadata, logo alt text, the wordmark when there is no logo |
| `website` | no | "Prepared by" on the cover and the link on the last page |
| `websiteLabel` | no | How the website is printed. Defaults to its host name, `example.com` |
| `email`, `phone` | no | Printed on the last page. Leave empty to omit |
| `logo` | no | Logo for light surfaces. Without one, `name` is set in type |
| `logoOnDark` | no | Logo for dark surfaces. Without one, `logo` is turned solid white where a surface asks for `logoOnDark` |
| `colors.primary` | no | The accent: cover kicker and roadmap steps. 6-digit hex. Lighter tints are derived from it. On a background it would not read on, the accent falls back to that surface's text color |
| `font` | no | Typeface for the whole report, by folder name under `fonts/`: `"manrope"`. Without it, the system sans. See [fonts/README.md](../fonts/README.md) |
| `textSize` | no | Body text size of the report pages: `"small"` (9.4pt, the original size), `"default"` (12pt, 16px), `"medium"` (13pt) or `"large"` (14pt). Headings, labels, tables and score dials scale with it, on the cover too |
| `cover` | no | The cover page's surface, see below |
| `body` | no | Every page after the cover, see below |

## Cover and body surfaces

`cover` and `body` take the same four optional fields:

| Field | Default | |
|---|---|---|
| `background` | `#ffffff` | 6-digit hex |
| `text` | `#121212` | 6-digit hex. Secondary text, rules, card fills and tints are all mixed from `text` and `background`, so these two colors restyle the whole surface |
| `logo` | by background | `"logo"` or `"logoOnDark"`. Left out, a dark background gets `logoOnDark` and a light one `logo`. On the body this is the logo on the last page |
| `radius` | `2` | Corner radius of cards, panels, badges and bars, in mm, from 0 (square) to 10. Every rounded corner on the surface scales with it; circles stay circles |

```json
"cover": { "background": "#1f3a5f", "text": "#ffffff", "logo": "logoOnDark" },
"body":  { "background": "#ffffff", "text": "#121212" }
```

The older shorthands still work: `"cover": "light"` is the default, and
`"cover": "brand"` is a cover in `colors.primary` with white text.

The Studio edits these too: the palette button above the preview shows the
colors of whichever part, Body or Cover, is open. Changes preview at once and
are written to `brand.json` only when you click **Save to brand.json**. That
replaces `colors.primary`, `textSize`, `cover` and `body`, and leaves every other field as
it is.

`logo` and `logoOnDark` are a file in this folder (`logo.svg`) or an
`https://` URL. Local files are embedded in the PDF. A URL is fetched at render
time, so rendering needs the network. Supported types: SVG, PNG, JPG, WebP, GIF.

## Logo tips

- **Use SVG.** It stays sharp at any print size. A PNG should be at least
  1200 px wide.
- **Wide logos fit best.** The cover gives the logo 48 × 14 mm and the last page
  34 × 11 mm. A square icon is scaled down to fit the height.
- **Supply `logoOnDark`** if your logo has more than one color. Turning a
  logo white flattens it to a silhouette and may print slightly softer.

## A brand typeface

`font` names a folder under `fonts/`. The repo ships `fonts/manrope/`. A font
only you may use (a licensed brand typeface) goes in `brand/fonts/<name>/`
instead, which is checked first and stays out of git. How to add one:
[fonts/README.md](../fonts/README.md).

## Several brands from one install

Set `BRAND_DIR` to another folder laid out like this one:

```bash
BRAND_DIR=brands/acme npm run report -- <slug> --all
```
