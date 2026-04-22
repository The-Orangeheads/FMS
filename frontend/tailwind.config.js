/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
  extend: {
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
        spartan: ['"League Spartan"', 'sans-serif'],
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
      animation: {
        'slide-up': 'slideUp 400ms cubic-bezier(0.2, 0, 0, 1)',
        'fade-in': 'fadeIn 300ms cubic-bezier(0.2, 0, 0, 1)',
        'fade-out': 'fadeOut 300ms cubic-bezier(0.2, 0, 0, 1)',
        'scale-in': 'scaleIn 300ms cubic-bezier(0.2, 0, 0, 1)',
      },
      keyframes: {
        slideUp: {
          from: {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        fadeIn: {
          from: {
            opacity: '0',
          },
          to: {
            opacity: '1',
          },
        },
        fadeOut: {
          from: {
            opacity: '1',
          },
          to: {
            opacity: '0',
          },
        },
        scaleIn: {
          from: {
            opacity: '0',
            transform: 'scale(0.95)',
          },
          to: {
            opacity: '1',
            transform: 'scale(1)',
          },
        },
      },
    },
  },
  plugins: [],
}
