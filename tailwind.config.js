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
        background: '#050505',
        surface: 'rgba(255,255,255,0.015)',
        'surface-hover': 'rgba(124,255,158,0.05)',
        border: 'rgba(124,255,158,0.14)',
        // phosphor green accent — luna's oklch(0.86 0.19 145)
        primary: '#5eff9f',
        'primary-dim': '#3ad27f',
        'primary-hover': '#7dffb4',
        glow: '#5eff9f',
        text: '#d7f7e2',
        'text-muted': '#5f8b6f',
        'text-faint': '#3a5544',
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
