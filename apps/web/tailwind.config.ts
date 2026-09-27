import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { canvas: '#0b1016', panel: '#111a22', border: '#26333e', ink: '#e5edf2', muted: '#91a2af', mint: '#5fe3b5', amber: '#f1bd72', danger: '#f08082' },
    fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['"SFMono-Regular"', 'Consolas', 'ui-monospace', 'monospace'] },
    boxShadow: { panel: '0 12px 40px rgba(0,0,0,.13)' }
  } },
  plugins: []
} satisfies Config;
