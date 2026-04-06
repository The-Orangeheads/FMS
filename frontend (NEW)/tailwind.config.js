/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        'surface-muted': 'var(--color-surface-muted)',
        border: 'var(--color-border)',
        foreground: 'var(--color-foreground)',
        'foreground-muted': 'var(--color-foreground-muted)',
        primary: 'var(--color-primary)',
        'on-primary': 'var(--color-on-primary)',
        ring: 'var(--color-ring)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        ui: '10px',
      },
      transitionTimingFunction: {
        material: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [],
}
