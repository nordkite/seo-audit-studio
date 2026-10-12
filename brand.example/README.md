# Brand

Everything that puts your company on a report: name, contact details, logo and
colour. `npm run setup` copies this folder to `brand/`. Edit the copy, not this
template. `brand/` is git-ignored, so your branding never ends up in the shared
repo and pulling updates never conflicts with it.

## brand.json

| Field | Required | Used for |
|---|---|---|
| `name` | yes | PDF author metadata, logo alt text, the wordmark when there is no logo |
| `website` | no | "Prepared by" on the cover and the link on the last page |
| `websiteLabel` | no | How the website is printed. Defaults to its host name, `example.com` |
| `email`, `phone` | no | Printed on the last page. Leave empty to omit |
| `logo` | no | Logo for white surfaces: the light cover and the last page. Without one, `name` is set in type |
| `logoOnDark` | no | Logo for the `"brand"` cover, which is your primary colour. Without one, `logo` is turned solid white |
| `colors.primary` | no | The accent: cover kicker, roadmap steps, and the whole cover when `cover` is `"brand"`. 6-digit hex. Lighter tints are derived from it |
| `font` | no | Typeface for the whole report, by folder name under `fonts/`: `"manrope"`. Without it, the system sans. See [fonts/README.md](../fonts/README.md) |
| `cover` | no | `"light"` (default): a white cover with `logo`. `"brand"`: the cover is set on `colors.primary`, with `logoOnDark` |

`logo` and `logoOnDark` are a file in this folder (`logo.svg`) or an
`https://` URL. Local files are embedded in the PDF. A URL is fetched at render
time, so rendering needs the network. Supported types: SVG, PNG, JPG, WebP, GIF.

## Logo tips

- **Use SVG.** It stays sharp at any print size. A PNG should be at least
  1200 px wide.
- **Wide logos fit best.** The cover gives the logo 48 × 14 mm and the last page
  34 × 11 mm. A square icon is scaled down to fit the height.
- **Supply `logoOnDark`** if your logo has more than one colour. Turning a
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
