/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        display: ['"Doto"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: '#04060c',
        surface: 'rgba(255,255,255,0.015)',
        'surface-hover': 'rgb(var(--accent-rgb) / 0.06)',
        border: 'rgb(var(--accent-rgb) / 0.14)',
        // deep "pro" blue accent — single source: --accent-rgb in index.css
        primary: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'primary-dim': 'rgb(var(--accent-dim-rgb) / <alpha-value>)',
        'primary-hover': 'rgb(var(--accent-hover-rgb) / <alpha-value>)',
        glow: 'rgb(var(--accent-rgb) / <alpha-value>)',
        text: '#dbe4f7',
        'text-muted': '#8b9ec9',
        'text-faint': '#54648a',
      },
      letterSpacing: {
        terminal: '0.08em',
      },
      keyframes: {
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.85)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        flicker: {
          '0%, 100%': { opacity: '0.985' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        blink: 'blink 1.1s step-end infinite',
        'pulse-dot': 'pulseDot 1.8s ease-in-out infinite',
        scan: 'scan 7s linear infinite',
        flicker: 'flicker 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
