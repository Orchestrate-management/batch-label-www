# Batchlabel logo pack

Mark: a punched swing tag. Two rule lines, the lower one in clay.

## Files

- `batchlabel-mark.svg` — primary mark, full colour, on warm paper or white.
- `batchlabel-mark-reversed.svg` — for teal or dark backgrounds.
- `batchlabel-mark-mono.svg` — single path, knocked out. Use for foil, stamps, one-colour
  print, or anywhere you need to recolour with `fill`.
- `batchlabel-favicon.svg` — same as primary, sized for a tab icon. Referenced from
  `index.html` as both the icon and the apple-touch-icon. Export 32px and 180px PNGs from
  it if you later want `favicon.ico` proper.
- `batchlabel-lockup-horizontal.svg` / `-reversed.svg` — mark plus wordmark.

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
