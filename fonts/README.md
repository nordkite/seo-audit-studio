# Fonts

Typefaces the report can be set in. `brand.json` picks one by folder name:

```json
{ "font": "manrope" }
```

Without `font`, the report uses the system stack (Helvetica Neue / Arial).

The renderer looks for `fonts/<name>/font.json` in two places, in this order:

1. **`brand/fonts/<name>/`**: your own fonts. `brand/` is git-ignored, so a
   licensed or proprietary brand typeface never ends up in the shared repo.
2. **`fonts/<name>/`** (this folder): fonts shared by every brand. Only commit
   fonts whose licence allows redistribution, such as SIL OFL (every Google
   Font is OFL or Apache).

Every font file is embedded in the HTML as a data URI and subset into the PDF by
Chrome. Nothing is fetched at render time.

## Adding a font

Example: adding Inter from Google Fonts.

### 1. Get static `woff2` files

Fontsource republishes every Google Font split per weight and per script. Download
the weights you need for each script the reports use: `latin`, `latin-ext`
(Estonian š, ž) and `cyrillic` (Russian).

```bash
mkdir -p fonts/inter && cd fonts/inter
for w in 400 500 600 700; do
  for s in latin latin-ext cyrillic cyrillic-ext; do
    curl -fLO "https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-$s-$w-normal.woff2"
  done
done
```

Then save the font's licence beside them as `OFL.txt` (or `LICENSE.txt`).

**Use static weights, not the variable font.** Chrome writes a variable font
into the PDF as Type 3 glyph outlines. The file grows (by about a quarter on a
typical report), and some PDF viewers render Type 3 text less crisply. Static files embed as ordinary
TrueType.

**The weights to supply are 400, 500, 600 and 700.** `templates/report.css`
uses exactly these. For a missing weight Chrome substitutes the nearest one
supplied, or fakes a bold by smearing a lighter one.

**Check the font covers the report languages.** If the font has no Cyrillic, a
Russian report falls back to Arial for every Cyrillic letter. On the Google
Fonts specimen page, the "Language support" filter lists its scripts.

### 2. Write `font.json`

```json
{
  "family": "Inter",
  "license": "OFL-1.1",
  "source": "https://fonts.google.com/specimen/Inter",
  "faces": [
    {
      "file": "inter-latin-400-normal.woff2",
      "weight": "400",
      "unicodeRange": "U+0000-00FF, U+0131, U+0152-0153, …"
    }
  ]
}
```

One entry in `faces` per file:

| Field | Required | Meaning |
|---|---|---|
| `file` | yes | File name, relative to this `font.json`. `woff2`, `woff`, `ttf` or `otf` |
| `weight` | no | CSS weight, `"400"`. Defaults to 400 |
| `style` | no | `"normal"` or `"italic"`. Defaults to normal |
| `unicodeRange` | no | Which characters this file covers. Needed when a weight is split into several files by script, so Chrome takes each letter from the right one |

`family` is the CSS name the report asks for. `license` and `source` are not
read by the renderer; they record where the files came from.

The `unicodeRange` values for each script are in Fontsource's CSS, for example
`https://cdn.jsdelivr.net/npm/@fontsource/inter/latin-400.css`.
[`manrope/font.json`](manrope/font.json) shows a complete manifest to copy.

A single `ttf` or `otf` that already covers every script needs no
`unicodeRange`: one face per weight is enough.

### 3. Use it

Set `"font": "inter"` in `brand/brand.json` and render:

```bash
npm run report -- <slug> --lang ru
pdffonts "$(ls -t out/SEO-Audit-<slug>-ru-*.pdf | head -1)"
```

`pdffonts` (from poppler) lists every font embedded in the PDF. Expect your
font's weights, plus a monospace font for URLs in evidence. Helvetica or Arial
in the list means some text fell back to the system stack. A few symbols the
font lacks (`→`) do that legitimately. Whole paragraphs mean a missing script
file or a wrong `unicodeRange`.

## Fonts here

| Folder | Family | Licence | Weights | Scripts |
|---|---|---|---|---|
| `manrope/` | Manrope | SIL OFL 1.1 | 400, 500, 600, 700 | Latin, Latin Extended, Cyrillic |
