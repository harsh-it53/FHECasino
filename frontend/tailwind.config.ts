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
        canvas: 'var(--background)',
        panel: 'var(--card)',
        accent: 'var(--accent)',
        purple: 'var(--primary)',
        cyan: 'var(--secondary)',
        gold: 'var(--ring)',
        success: 'var(--chart-1)',
        danger: 'var(--destructive)',
        text: 'var(--foreground)',
        muted: 'var(--muted-foreground)',
        borderLine: 'var(--border)',
        primaryFg: 'var(--primary-foreground)',
        secondaryFg: 'var(--secondary-foreground)',
        cardFg: 'var(--card-foreground)',
      },
      fontFamily: {
        display: ['var(--font-orbitron)', 'sans-serif'],
        heading: ['var(--font-rajdhani)', 'sans-serif'],
        body: ['var(--font-dm-mono)', 'monospace'],
        numbers: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      boxShadow: {
        glow: '0 20px 60px rgba(255, 224, 194, 0.18)',
        cyan: '0 18px 54px rgba(100, 74, 64, 0.28)',
      },
      backgroundImage: {
        grid: 'radial-gradient(circle at 1px 1px, rgba(255,224,194,0.08) 1px, transparent 0)',
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
          '0%, 100%': { boxShadow: '0 0 0 rgba(255,224,194,0.18)' },
          '50%': { boxShadow: '0 0 34px rgba(255,224,194,0.28)' },
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
