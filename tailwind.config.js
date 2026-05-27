/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#141414',
        'surface-hover': '#1a1a1a',
        border: '#2a2a2a',
        primary: '#6366f1',
        'primary-hover': '#818cf8',
        text: '#f5f5f5',
        'text-muted': '#a1a1aa',
      },
    },
  },
  plugins: [],
};
