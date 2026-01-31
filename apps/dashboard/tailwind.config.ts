import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0F14',
        surface: '#111827',
        card: '#161E2E',
        border: '#1F2937',
        primary: '#4F46E5',
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        muted: '#9CA3AF',
      },
      boxShadow: {
        soft: '0 12px 32px rgba(0,0,0,0.35)',
      },
      borderRadius: {
        xl: '16px',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        pulseSoft: 'pulseSoft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
