/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,njk,md,js}',
    './_site/**/*.html',
  ],
  theme: {
    extend: {
      // Ferni Design System Colors
      colors: {
        // Zen Theme (Light Mode) - Primary
        paper: {
          DEFAULT: '#faf8f5',
          cream: '#fffdfb',
          sand: '#f5f2ed',
          warm: '#ebe6df',
        },
        ink: {
          DEFAULT: '#2c2520',
          muted: '#5c544a',
          light: '#756a5e',
          faded: '#857a6e',
        },
        // Persona Colors
        ferni: {
          DEFAULT: '#4a6741',
          dark: '#3d5a35',
          light: '#5a7751',
          glow: 'rgba(74, 103, 65, 0.28)',
          tint: 'rgba(74, 103, 65, 0.06)',
        },
        peter: {
          DEFAULT: '#3a6b73',
          dark: '#2d5359',
          glow: 'rgba(58, 107, 115, 0.28)',
        },
        alex: {
          DEFAULT: '#5a6b8a',
          dark: '#4a5a73',
          glow: 'rgba(90, 107, 138, 0.28)',
        },
        maya: {
          DEFAULT: '#a67a6a',
          dark: '#8a635a',
          glow: 'rgba(166, 122, 106, 0.28)',
        },
        jordan: {
          DEFAULT: '#c4856a',
          dark: '#a86d55',
          glow: 'rgba(196, 133, 106, 0.28)',
        },
        nayan: {
          DEFAULT: '#8a7a6a',
          dark: '#6d5f52',
          glow: 'rgba(138, 122, 106, 0.28)',
        },
        // Semantic
        success: '#3d7a52',
        error: '#b5453a',
        warning: '#a67c35',
        info: '#3a6b9c',
        // Night theme colors for dark sections
        night: {
          DEFAULT: '#1a1512',
          deep: '#0f0d0b',
          warm: '#2a2420',
        },
      },
      
      // Typography
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      
      fontSize: {
        'display-2xl': ['clamp(4rem, 12vw, 8rem)', { lineHeight: '0.95', letterSpacing: '-0.04em', fontWeight: '800' }],
        'display-xl': ['clamp(3rem, 8vw, 6rem)', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-lg': ['clamp(2.25rem, 5vw, 4rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['clamp(1.75rem, 4vw, 2.5rem)', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        'body-xl': ['1.375rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body-lg': ['1.125rem', { lineHeight: '1.7', fontWeight: '400' }],
        'eyebrow': ['0.75rem', { lineHeight: '1', letterSpacing: '0.15em', fontWeight: '600' }],
      },
      
      // MA Spacing (Japanese breathing room)
      spacing: {
        'ma-breath': '8px',
        'ma-pause': '13px',
        'ma-rest': '21px',
        'ma-silence': '34px',
        'ma-meditation': '55px',
        'ma-contemplation': '89px',
        'ma-vastness': '144px',
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
      },
      
      // Border Radius
      borderRadius: {
        'none': '0',
        'xs': '0.25rem',
        'sm': '0.5rem',
        'md': '0.75rem',
        'lg': '1rem',
        'xl': '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        '4xl': '2.5rem',
        'full': '9999px',
      },
      
      // Shadows (Zen theme)
      boxShadow: {
        'xs': '0 1px 2px rgba(44, 37, 32, 0.04)',
        'sm': '0 2px 4px rgba(44, 37, 32, 0.06)',
        'md': '0 4px 8px rgba(44, 37, 32, 0.08), 0 2px 4px rgba(44, 37, 32, 0.04)',
        'lg': '0 8px 16px rgba(44, 37, 32, 0.08), 0 4px 8px rgba(44, 37, 32, 0.04)',
        'xl': '0 16px 32px rgba(44, 37, 32, 0.1), 0 8px 16px rgba(44, 37, 32, 0.05)',
        '2xl': '0 24px 48px rgba(44, 37, 32, 0.12), 0 12px 24px rgba(44, 37, 32, 0.06)',
        'glow-ferni': '0 0 40px rgba(74, 103, 65, 0.35), 0 0 80px rgba(74, 103, 65, 0.2)',
        'glow-soft': '0 0 20px rgba(74, 103, 65, 0.15)',
        'inner': 'inset 0 2px 4px rgba(44, 37, 32, 0.04)',
        'inner-glow': 'inset 0 0 30px rgba(255, 255, 255, 0.1)',
      },
      
      // Enhanced Animations
      animation: {
        'breathe': 'breathe 4s ease-in-out infinite',
        'breathe-slow': 'breathe 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.5s ease-out infinite',
        'pulse-ring-slow': 'pulse-ring 4s ease-out infinite',
        'fade-in': 'fade-in 0.6s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in-down': 'fade-in-down 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slide-down 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scale-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'glow': 'glow 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 10s ease-in-out infinite',
        'wave': 'wave 1.2s ease-in-out infinite',
        'orbit': 'orbit 30s linear infinite',
        'orbit-reverse': 'orbit 30s linear infinite reverse',
        'shimmer': 'shimmer 2s linear infinite',
        'reveal-up': 'reveal-up 1s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'reveal-scale': 'reveal-scale 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'typing': 'typing 0.8s steps(12) forwards',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        'breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(60px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-60px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(74, 103, 65, 0.3)' },
          '50%': { boxShadow: '0 0 50px rgba(74, 103, 65, 0.5), 0 0 80px rgba(74, 103, 65, 0.3)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'wave': {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(0.4)' },
        },
        'orbit': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'reveal-up': {
          '0%': { opacity: '0', transform: 'translateY(80px) scale(0.95)', filter: 'blur(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        },
        'reveal-scale': {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'typing': {
          '0%': { width: '0' },
          '100%': { width: '100%' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      
      // Transitions
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.45, 0, 0.55, 1)',
        'expo-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'expo-in-out': 'cubic-bezier(0.87, 0, 0.13, 1)',
        'back-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
        '800': '800ms',
        '1000': '1000ms',
        '1200': '1200ms',
      },
      
      // Backdrop blur
      backdropBlur: {
        'xs': '2px',
        '3xl': '64px',
      },
      
      // Z-index
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
      
      // Container
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          lg: '4rem',
          xl: '5rem',
          '2xl': '6rem',
        },
      },
      
      // Aspect ratio
      aspectRatio: {
        'golden': '1.618',
      },
      
      // Background image
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
}
