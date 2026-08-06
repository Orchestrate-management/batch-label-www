# Batchlabel logo pack

Mark: a punched swing tag. Two rule lines, the lower one in clay.

## Files

- `batchlabel-mark.svg` — primary mark, full colour, on warm paper or white.
- `batchlabel-mark-reversed.svg` — for teal or dark backgrounds.
- `batchlabel-mark-mono.svg` — single path, knocked out. Use for foil, stamps, one-colour
  print, or anywhere you need to recolour with `fill`.
- `batchlabel-favicon.svg` — same as primary, sized for a tab icon.
- `batchlabel-touch-icon.svg` — full-bleed source for the iOS home-screen icon. The tag
  fills the canvas here because iOS masks its own rounded corners and paints any
  transparency black.
- `favicon-32x32.png` / `apple-touch-icon.png` — raster fallbacks, generated from the two
  SVGs above (see below).
- `batchlabel-lockup-horizontal.svg` / `-reversed.svg` — mark plus wordmark.

### Icons in `index.html`

SVG is offered first, the 32px PNG is the fallback for browsers that will not take it,
and the 180px apple-touch-icon must be a PNG because Safari ignores SVG for that slot.

### Regenerating the PNGs

They are committed, so this is only needed if the mark changes. On macOS, with no extra
tooling:

```sh
cd public/brand
# Render at the size you want OUT of Quick Look — it corner-pastes rather than scales if
# the SVG's width/height differ from -s, so make them match.
sed 's/width="180"/width="512"/; s/height="180"/height="512"/' \
  batchlabel-touch-icon.svg > /tmp/touch512.svg
qlmanage -t -s 512 -o /tmp /tmp/touch512.svg
cp /tmp/touch512.svg.png apple-touch-icon.png && sips -z 180 180 apple-touch-icon.png
```

Repeat with `batchlabel-favicon.svg` at `-z 32 32` for `favicon-32x32.png`. Always open
the result and look at it — a bad render is silent.

### Regenerating the Open Graph card

`public/og/batchlabel-share.png` is the 1200×630 image every link preview uses. Its source
is `public/og/batchlabel-share.svg`.

`qlmanage -t -s N` always renders into an N×N box, so a 1200×630 SVG comes out
corner-pasted into a 1200×1200 square at nearly twice the size. Render it inside a square
canvas instead and cut the middle back out:

```sh
cd public/og
# Wrap the 630-tall artwork in a 1200x1200 canvas, vertically centred at y=285.
python3 - <<'PY' > /tmp/og-square.svg
import re
art = open('batchlabel-share.svg').read()
body = art[art.index('>', art.index('<svg')) + 1 : art.rindex('</svg>')]
defs = ''
print('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">')
print('<rect width="1200" height="1200" fill="#FFFFFF"></rect>')
print('<g transform="translate(0 285)">' + body + '</g></svg>')
PY
qlmanage -t -s 1200 -o /tmp /tmp/og-square.svg
cp /tmp/og-square.svg.png batchlabel-share.png
sips -c 630 1200 batchlabel-share.png   # -c crops from the centre, which is the artwork
```

Outfit is a webfont and is not installed locally, so Quick Look falls back to Helvetica
Neue, the same fallback `batchlabel-lockup-horizontal.svg` has always used. Open the PNG
and look at it before committing.

In the app the lockup is rendered by `src/components/layout/Logo.tsx` rather than by
loading an SVG file, so the wordmark uses the live Outfit webfont. The component and
`batchlabel-lockup-horizontal.svg` are the same artwork — keep them in step if either
changes.

## Colours

| Role | Hex | Tailwind |
| --- | --- | --- |
| Deep teal (primary) | `#14514F` | `teal-700` |
| Warm clay (accent) | `#B4674A` | `clay-500` |
| Clay, reversed on teal | `#E5A183` | `clay-300` |
| Warm paper (page background) | `#F3EEE6` | `paper` |
| Card white | `#FBF8F3` | `white` |
| Ink | `#1E1B18` | `ink` |
| Band stock (third surface) | `#EDE6D8` | `paper-shade` |
| Deepest teal (reversed bands) | `#0A2B2A` | `teal-900` |
| Muted ink (captions, hints) | `#6F6559` | `ink-muted` |
| Form control boundary | `#8A8378` | `ink-line` |

`white` is deliberately mapped to the brand's card white, not `#FFF` — cards sit on warm
paper, and it is the same value the reversed mark knocks out to. Pure white is only used
where a regulation demands it (see below).

### Measured contrast

Ratios below are WCAG 2.1 relative luminance, computed against the hexes in this table.

| Pair | Ratio | Verdict |
| --- | --- | --- |
| Teal `#14514F` on paper | 7.84:1 | AA and AAA body |
| Teal on card white | 8.55:1 | AA and AAA body |
| Ink on paper | 14.84:1 | AAA |
| `ink-soft` on paper | 8.32:1 | AAA |
| `ink-muted` on paper | 4.94:1 | AA body |
| `ink-muted` on card white | 5.38:1 | AA body |
| `ink-muted` on `paper-deep` | 4.65:1 | AA body |
| `ink-line` on card white | 3.54:1 | AA non-text (1.4.11) |
| Card white on `teal-700` | 8.55:1 | AA and AAA body |
| `clay-600` on paper | 5.01:1 | AA body |
| `clay-300` on `teal-800` | 5.57:1 | AA body |
| `ink-muted` on `paper-shade` | 4.59:1 | AA body |
| `clay-600` on `paper-shade` | 4.66:1 | AA body |
| `ink-line` on `paper-shade` | 3.02:1 | AA non-text (1.4.11) |
| Card white on `teal-900` | 14.24:1 | AA and AAA body |
| `teal-100` on `teal-900` | 11.20:1 | AA and AAA body |

Two corrections to what this file used to say. Teal on paper is 7.84:1, not 8.5:1 — 8.55:1
is teal on *card white*. And `ink-muted` was `#8A7F72`, which measured 3.39:1 on paper and
3.19:1 on the footer band; it is used for normal size body text throughout, so it needed
4.5:1 and did not have it. It is now `#6F6559`.

Do not use opacity modifiers (`text-ink-muted/70` and friends) on text. Every one of them
measured under 3:1.

## Type

Headings: Fraunces 400-700 (`font-display`), variable, with `SOFT` 30 and `WONK` 1 set
once in `src/index.css` and optical sizing left on. Body: IBM Plex Sans 400/500/600
(`font-sans`). Mono: IBM Plex Mono (`font-mono`), which carries UFI codes, batch codes and
every caption set in small caps.

Outfit is still loaded, at 600 only, and is used for exactly one thing: the wordmark in
`src/components/layout/Logo.tsx` (`font-wordmark`). That component and
`batchlabel-lockup-horizontal.svg` are the same artwork, so the lockup is unchanged by the
switch to a serif display face. Do not use `font-wordmark` anywhere else.

All four families are loaded by the single `@import` at the top of `src/index.css`.

## Usage

- Clear space: half the mark height on every side.
- Minimum size: 16px for the mark, 96px wide for the horizontal lockup.
- Do not add gradients, shadows, outlines or rotation.
- The lockup SVGs use live `<text>`. For print or third parties, convert the wordmark to
  outlines, or use the `Logo` component with the Outfit webfont loaded.

## Not brand colours

`src/components/Pictogram.tsx` draws GHS/CLP hazard pictograms. Their red (`#D0021B`) and
white field are set by regulation, not by us. Do not restyle them to the palette.
