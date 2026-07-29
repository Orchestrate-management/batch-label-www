export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#FBF8F3',
          deep: '#F3ECE1',
          edge: '#E7DECF',
        },
        ink: {
          DEFAULT: '#1B2523',
          soft: '#3D4B48',
          muted: '#5F6E6A',
        },
        teal: {
          50: '#EFF5F4',
          100: '#D8E7E5',
          600: '#1A6A62',
          700: '#134F49',
          800: '#0E3B37',
        },
        clay: {
          100: '#F6E7DF',
          500: '#B85F3A',
          600: '#9C4E2E',
        },
      },
      fontFamily: {
        display: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
