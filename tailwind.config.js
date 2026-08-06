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
          // Added by the visual pass. The site had two page surfaces, paper and card
          // white, and card white is LIGHTER than paper, so every band boundary stepped
          // the same way and the page read as one flat sheet. This is the third surface,
          // a step darker than paper, used for the trust strip, the product forms, the
          // scope band and the footer.
          //
          // THE VALUE IS SET BY CONTRAST, NOT BY TASTE. It was #E7DECF first, which is
          // the tint this wanted to be, and on it ink-muted measured 4.28:1 and clay-600
          // 4.34:1 — both under the 4.5:1 those two need, and both are used on this
          // surface (the footer small print, and every section eyebrow). ink-line, the
          // boundary a secondary button draws, was 2.97:1 against 1.4.11's 3:1.
          //
          // Measured at this value: ink 13.79:1, ink-soft 7.72:1, ink-muted 4.59:1,
          // clay-600 4.66:1, teal-700 7.28:1, ink-line 3.02:1, clay-500 3.39:1. It is the
          // darkest tint at which every colour the site puts on a band still passes.
          // Darken it and the eyebrow goes first.
          shade: '#EDE6D8',
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
          // Added by the visual pass for reversed surfaces only — the closing call to
          // action and the Maker plan tag — so the darkest thing on a page has depth
          // rather than a single flat fill. Measured: card white on it 14.24:1, teal-100
          // 11.20:1, paper 13.06:1 (that is the reversed focus ring), clay-300 7.01:1.
          900: '#0A2B2A',
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
        // Headings are Fraunces, a soft serif with an optical size axis. The site is
        // about printed labels, so the display face is the one thing on the page that
        // should look set rather than rendered. Body stays IBM Plex Sans because it is
        // the right face for regulated text, and the mono is what carries UFI and batch
        // codes.
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        // Outfit is now loaded for one thing only: the wordmark in the lockup, which has
        // to stay identical to public/brand/batchlabel-lockup-horizontal.svg.
        wordmark: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      maxWidth: {
        prose: '68ch',
        // The measure a legal page is set to. 62 characters is inside the 45-75 band and
        // reads better than the 68ch used for marketing body copy, which is broken up by
        // headings every few lines.
        legal: '62ch',
      },
      boxShadow: {
        // One shadow language, warm rather than neutral grey, so a card lifting off warm
        // paper does not go blue at the edges.
        card: '0 1px 0 rgba(30,27,24,0.04), 0 12px 28px -22px rgba(30,27,24,0.45)',
        lift: '0 1px 0 rgba(30,27,24,0.05), 0 22px 44px -26px rgba(30,27,24,0.5)',
        tag: '0 1px 0 rgba(30,27,24,0.05), 0 18px 40px -28px rgba(30,27,24,0.55)',
      },
      keyframes: {
        'bl-rise': {
          from: { opacity: '0', transform: 'translate3d(0,10px,0)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'bl-rise': 'bl-rise 0.62s cubic-bezier(0.22,0.68,0.24,1) both',
      },
    },
  },
  plugins: [],
}
