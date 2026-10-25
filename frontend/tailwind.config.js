/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // The original sets the whole UI in Sarabun.
      fontFamily: { sans: ['Sarabun', 'sans-serif'] },
    },
  },
  plugins: [],
}
