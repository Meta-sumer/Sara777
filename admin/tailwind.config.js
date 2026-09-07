/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#e8722c',
          dark: '#c85a18',
          soft: '#fdf1e7',
          softer: '#f2cfae',
        },
        ink: '#1b2a4a',
        muted: '#6b7280',
        line: '#e3e6ea',
        sidebar: '#16233d',
        canvas: '#f4f5f7',
        ok: { DEFAULT: '#15803d', soft: '#e7f6ec' },
        bad: { DEFAULT: '#dc2626', soft: '#fdecec' },
      },
      borderRadius: {
        card: '12px',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
