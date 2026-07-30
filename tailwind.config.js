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
        // brand hexes. Teal on paper is ~8.5:1, which clears WCAG AA and AAA for body.
        paper: {
          DEFAULT: '#F3EEE6', // warm paper — page background
          deep: '#EFE7DA', // slightly deeper band / code chip
          edge: '#E3DACD', // hairline borders
        },
        ink: {
          DEFAULT: '#1E1B18', // brand ink (warm black)
          soft: '#4A443D',
          muted: '#8A7F72',
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
