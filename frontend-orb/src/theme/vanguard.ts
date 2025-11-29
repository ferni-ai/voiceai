/**
 * Vanguard Brand Colors and Theme
 * Based on Vanguard's official brand guidelines
 */

export const vanguardTheme = {
  colors: {
    // Primary Vanguard Colors
    primary: {
      burgundy: '#8B2332',      // Vanguard's signature burgundy
      darkBurgundy: '#6B1A26',  // Darker variant
      lightBurgundy: '#A73344', // Lighter variant
    },

    // Secondary Colors
    secondary: {
      navy: '#002F6C',          // Deep navy blue
      lightNavy: '#0050A0',     // Lighter navy
      teal: '#006778',          // Teal accent
      gold: '#FFB81C',          // Gold accent
    },

    // Neutral Colors
    neutral: {
      white: '#FFFFFF',
      offWhite: '#F8F8F8',
      lightGray: '#E8E8E8',
      gray: '#CCCCCC',
      darkGray: '#666666',
      charcoal: '#333333',
      black: '#000000',
    },

    // UI Specific Colors
    ui: {
      background: '#0A0A0A',    // Dark background for orb
      surface: '#1A1A1A',       // Surface elements
      border: '#2A2A2A',        // Borders
      text: {
        primary: '#FFFFFF',
        secondary: '#CCCCCC',
        muted: '#888888',
      },
      accent: {
        glow: '#FFB81C',        // Golden glow
        pulse: '#8B2332',       // Burgundy pulse
        ripple: '#006778',      // Teal ripple
      }
    },

    // Orb Gradient Colors
    orb: {
      core: ['#8B2332', '#FFB81C'],        // Burgundy to gold
      inner: ['#002F6C', '#006778'],        // Navy to teal
      outer: ['#6B1A26', '#0050A0'],        // Dark burgundy to light navy
      pulse: '#FFB81C',                     // Gold pulse
      shimmer: 'rgba(255, 184, 28, 0.3)',  // Gold shimmer
    }
  },

  typography: {
    fontFamily: {
      primary: '"Mark Pro", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mono: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem',// 30px
      '4xl': '2.25rem', // 36px
      '5xl': '3rem',    // 48px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    }
  },

  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
    '4xl': '6rem',   // 96px
  },

  animation: {
    duration: {
      instant: '0ms',
      fast: '200ms',
      normal: '300ms',
      slow: '500ms',
      slower: '800ms',
      slowest: '1000ms',
    },
    easing: {
      linear: 'linear',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    }
  },

  effects: {
    blur: {
      sm: '4px',
      md: '8px',
      lg: '16px',
      xl: '24px',
    },
    shadow: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
      glow: '0 0 40px rgba(255, 184, 28, 0.4)',
      orb: '0 0 120px rgba(139, 35, 50, 0.6)',
    },
    glow: {
      sm: '0 0 10px',
      md: '0 0 20px',
      lg: '0 0 40px',
      xl: '0 0 60px',
    }
  },

  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  }
};

export type Theme = typeof vanguardTheme;