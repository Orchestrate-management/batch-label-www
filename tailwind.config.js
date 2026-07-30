export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        // Brand pack (public/brand/README.md). The scale keys are unchanged so no
        // utility classes had to be rewritten; only the values are re-anchored to the
        // brand hexes. Teal on paper is 7.84:1 and 8.55:1 on card white, so it clears
        // WCAG AA and AAA for body text either way.
        paper: {
          DEFAULT: '#F3EEE6', // warm paper — page background
          deep: '#EFE7DA', // slightly deeper band / code chip
          edge: '#E3DACD', // hairline borders
        },
        ink: {
          DEFAULT: '#1E1B18', // brand ink (warm black) — 14.84:1 on paper
          soft: '#4A443D', // 8.32:1 on paper, 9.07:1 on card white
          // Was #8A7F72, which measured 3.39:1 on paper and 3.19:1 on the footer band.
          // It is used for captions, hints, asides and the footer, all of it normal size
          // body text, so it needed 4.5:1 and did not have it. Same hue, darker:
          // 4.94:1 on paper, 5.38:1 on card white, 4.65:1 on paper-deep.
          muted: '#6F6559',
          // Boundary for text inputs, textareas and checkboxes. WCAG 1.4.11 wants 3:1
          // for a control you cannot identify without its border, and an empty input on
          // card white has nothing else to mark it out. border-ink/15 measured 1.35:1.
          // This is 3.25:1 on paper, 3.54:1 on card white, 3.06:1 on paper-deep.
          line: '#8A8378',
        },
        teal: {
          50: '#EAF1F0',
          100: '#D2E1E0',
          600: '#1A6763',
          700: '#14514F', // primary
          800: '#0F3D3B',
        },
        clay: {
          100: '#F6E7DF',
          300: '#E5A183', // accent when reversed on teal
          500: '#B4674A', // accent
          600: '#96543B',
        },
        // Cards sit on warm paper, so "white" is the brand's card white rather than
        // pure #FFF. Overriding it here keeps every existing bg-white/text-white in the
        // codebase on-brand without touching ~22 files, and matches the reversed mark,
        // which knocks out to this same value.
        white: '#FBF8F3',
      },
      fontFamily: {
        display: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
}
