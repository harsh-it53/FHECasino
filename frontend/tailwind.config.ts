import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-primary)',
        panel: 'var(--bg-secondary)',
        purple: 'var(--accent-purple)',
        cyan: 'var(--accent-cyan)',
        gold: 'var(--accent-gold)',
        success: 'var(--success-green)',
        danger: 'var(--danger-red)',
        text: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
      },
      fontFamily: {
        display: ['var(--font-orbitron)', 'sans-serif'],
        heading: ['var(--font-rajdhani)', 'sans-serif'],
        body: ['var(--font-dm-mono)', 'monospace'],
        numbers: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 30px rgba(124, 58, 237, 0.35)',
        cyan: '0 0 30px rgba(6, 182, 212, 0.25)',
      },
      backgroundImage: {
        grid: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.12) 1px, transparent 0)',
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        pulseGlow: 'pulseGlow 2.8s ease-in-out infinite',
        drift: 'drift 18s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 rgba(124,58,237,0.2)' },
          '50%': { boxShadow: '0 0 30px rgba(124,58,237,0.45)' },
        },
        drift: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}

export default config

