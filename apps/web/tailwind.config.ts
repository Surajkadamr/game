import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#c9a84c',
          light: '#e8c875',
          dark: '#9a7a2e',
          glow: '#f0d060',
        },
        felt: {
          center: '#1e5631',
          edge: '#0d3318',
          dark: '#0a2410',
        },
        rail: {
          light: '#2c1810',
          dark: '#1a0f08',
        },
        casino: {
          bg: '#050810',
          surface: '#0d1117',
          card: '#111827',
          border: 'rgba(255,255,255,0.08)',
        },
        chip: {
          red: '#e53e3e',
          blue: '#3182ce',
          green: '#38a169',
          black: '#1a202c',
          white: '#f7fafc',
        },
      },
      fontFamily: {
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
        ui: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'gold-glow': '0 0 20px rgba(201,168,76,0.4), 0 0 60px rgba(201,168,76,0.15)',
        'gold-glow-sm': '0 0 10px rgba(201,168,76,0.3)',
        'green-glow': '0 0 20px rgba(56,161,105,0.5), 0 0 40px rgba(56,161,105,0.2)',
        'green-glow-lg': '0 0 30px rgba(56,161,105,0.6), 0 0 80px rgba(56,161,105,0.25)',
        'table': 'inset 0 0 80px rgba(0,0,0,0.6), inset 0 0 20px rgba(201,168,76,0.05)',
        'card': '0 4px 6px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.1)',
        'card-hover': '0 8px 25px rgba(0,0,0,0.6), 0 0 15px rgba(201,168,76,0.3)',
        'player': '0 0 0 3px rgba(201,168,76,0.3), 0 4px 20px rgba(0,0,0,0.5)',
        'active-player': '0 0 0 3px #38a169, 0 0 20px rgba(56,161,105,0.5)',
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'chip-fly': 'chip-fly 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'card-flip': 'card-flip 0.4s ease-in-out',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'winner-appear': 'winner-appear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'timer-warn': 'timer-warn 0.5s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(56,161,105,0.7)', opacity: '1' },
          '50%': { boxShadow: '0 0 0 12px rgba(56,161,105,0)', opacity: '0.8' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'chip-fly': {
          '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' },
          '100%': { transform: 'translate(var(--tx),var(--ty)) scale(0.6)', opacity: '0' },
        },
        'card-flip': {
          '0%': { transform: 'rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'winner-appear': {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'timer-warn': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'felt-gradient': 'radial-gradient(ellipse 80% 60% at 50% 50%, #1e5631 0%, #0d3318 70%, #081e0e 100%)',
        'gold-gradient': 'linear-gradient(135deg, #c9a84c 0%, #e8c875 50%, #c9a84c 100%)',
        'dark-gradient': 'linear-gradient(135deg, #050810 0%, #0d1117 100%)',
        'card-back': 'repeating-linear-gradient(45deg, #1a2744 0px, #1a2744 5px, #0f1a35 5px, #0f1a35 10px)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
};

export default config;
