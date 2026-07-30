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

`white` is deliberately mapped to the brand's card white, not `#FFF` — cards sit on warm
paper, and it is the same value the reversed mark knocks out to. Pure white is only used
where a regulation demands it (see below).

Teal on paper is roughly 8.5:1, so it passes WCAG AA and AAA for body text.

## Type

Headings: Outfit 500/600 (`font-display`). Body: IBM Plex Sans 400/500 (`font-sans`).
Mono: IBM Plex Mono (`font-mono`). All three are loaded at the top of `src/index.css`.

## Usage

- Clear space: half the mark height on every side.
- Minimum size: 16px for the mark, 96px wide for the horizontal lockup.
- Do not add gradients, shadows, outlines or rotation.
- The lockup SVGs use live `<text>`. For print or third parties, convert the wordmark to
  outlines, or use the `Logo` component with the Outfit webfont loaded.

## Not brand colours

`src/components/Pictogram.tsx` draws GHS/CLP hazard pictograms. Their red (`#D0021B`) and
white field are set by regulation, not by us. Do not restyle them to the palette.
