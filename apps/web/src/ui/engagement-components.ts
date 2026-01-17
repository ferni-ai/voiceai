/**
 * Engagement Shared Components
 * 
 * Centralized design system components for the Daily Practice UI.
 * Eliminates duplication and ensures brand consistency.
 * 
 * DESIGN PRINCIPLES:
 *   - All values from design tokens (no hardcoded colors/sizes)
 *   - MA (間) spacing system for rhythm
 *   - Warm, human copy - not clinical
 *   - Pixar-style micro-interactions
 * 
 * ============================================================================
 * BEM NAMING CONVENTIONS
 * ============================================================================
 * 
 * NEW CODE should use the `ferni-` prefix for consistency:
 * 
 *   MODALS (centered floating dialogs):
 *   - .ferni-modal           - Container
 *   - .ferni-modal__backdrop - Blurred overlay
 *   - .ferni-modal__card     - Floating card
 *   - .ferni-modal__header   - Title bar
 *   - .ferni-modal__content  - Scrollable content
 *   - .ferni-modal__footer   - Action buttons
 *   - .ferni-modal--visible  - Open state modifier
 * 
 *   MENUS (slide-in navigation):
 *   - .ferni-menu            - Container
 *   - .ferni-menu__backdrop  - Blurred overlay
 *   - .ferni-menu__panel     - Sliding panel
 *   - .ferni-menu--visible   - Open state modifier
 * 
 *   SHARED COMPONENTS:
 *   - .ferni-btn             - Buttons
 *   - .ferni-card            - Content cards
 *   - .ferni-badge           - Status badges
 *   - .ferni-input           - Form inputs
 * 
 * LEGACY PREFIXES (maintained for backward compatibility):
 *   - .engagement-*          - Engagement/Daily check-in UI
 *   - .predictions-panel__*  - Predictions modal
 *   - .pred-tracker__*       - Prediction tracker
 *   - .settings-menu__*      - Hamburger menu
 * 
 * When updating legacy components, prefer using the shared ferni-modal
 * and ferni-menu base classes with component-specific modifiers.
 */

import { DURATION, EASING } from '../config/animation-constants.js';

// ============================================================================
// DESIGN TOKEN REFERENCES
// ============================================================================

/** 
 * Animation delays using design system timing
 * Use these instead of hardcoded milliseconds
 */
export const STAGGER_DELAYS = {
  /** Micro stagger for list items (50ms base) */
  MICRO: DURATION.MICRO,
  /** Standard stagger for cards (80ms base) */
  CARD: DURATION.FAST - DURATION.MICRO / 2,
  /** Deliberate stagger for emphasis (120ms base) */
  EMPHASIS: DURATION.NORMAL - DURATION.FAST,
} as const;

/**
 * Calculate staggered animation delay
 * @param index - Item index in list
 * @param baseDelay - Base delay from STAGGER_DELAYS
 */
export function getStaggerDelay(index: number, baseDelay: number = STAGGER_DELAYS.CARD): number {
  return index * baseDelay;
}

// ============================================================================
// HUMANIZED COPY
// ============================================================================

/**
 * Weather labels - warm, conversational tone
 * Instead of clinical "Clear skies" → "Feeling bright today"
 */
export const WEATHER_COPY = {
  sunny: {
    label: 'Bright & clear',
    greeting: 'What a beautiful day ahead',
    encouragement: 'Perfect energy for tackling something meaningful',
  },
  'partly-cloudy': {
    label: 'Mixed feelings',
    greeting: 'A bit of everything today',
    encouragement: 'Room for both reflection and action',
  },
  cloudy: {
    label: 'Thoughtful',
    greeting: 'A quieter kind of day',
    encouragement: 'Good for gentle progress',
  },
  rainy: {
    label: 'Processing',
    greeting: 'Taking time to work through things',
    encouragement: 'Be gentle with yourself',
  },
  stormy: {
    label: 'Turbulent',
    greeting: 'Rough waters right now',
    encouragement: 'This too shall pass. One small step.',
  },
  foggy: {
    label: 'Uncertain',
    greeting: 'Finding your way through the mist',
    encouragement: 'Clarity comes with patience',
  },
  rainbow: {
    label: 'Breakthrough',
    greeting: 'Something beautiful emerging',
    encouragement: 'Celebrate how far you\'ve come',
  },
} as const;

/**
 * Energy level labels - supportive, not judgmental
 */
export const ENERGY_COPY = {
  high: { label: 'Energized', note: 'Channel it wisely' },
  medium: { label: 'Balanced', note: 'Steady as she goes' },
  low: { label: 'Conserving', note: 'Honor what you need' },
} as const;

/**
 * Streak milestone messages - celebratory but not over-the-top
 */
export const STREAK_MILESTONES: Record<number, string> = {
  3: 'Three days strong. You\'re building momentum.',
  7: 'A full week! This is becoming part of you.',
  14: 'Two weeks of showing up. That takes real commitment.',
  21: 'Three weeks. Scientists say habits form around now.',
  30: 'A month! You\'ve proven something to yourself.',
  60: 'Two months of dedication. Remarkable.',
  90: 'A quarter year. This is who you are now.',
  100: 'Triple digits. Extraordinary commitment.',
  365: 'A full year. You\'ve changed your life.',
};

/**
 * Empty state messages - encouraging, not guilt-inducing
 */
export const EMPTY_STATE_COPY = {
  noStreaks: {
    title: 'Your journey begins',
    message: 'Start a conversation to create your first practice',
  },
  noWeather: {
    title: 'How are you feeling?',
    message: 'Share your emotional weather to track patterns over time',
  },
  noStats: {
    title: 'Building your story',
    message: 'Your progress will appear here as you engage',
  },
};

// ============================================================================
// SHARED ICONS (SVG)
// ============================================================================

/**
 * Icon library for engagement UI
 * All icons are 24x24 viewBox, stroke-based for flexibility
 */
export const ICONS = {
  // Weather
  sunny: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`,
  
  'partly-cloudy': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3v1m-4.25 2.75l-.7.7m11.95-3.45l-.7.7M5 10a3 3 0 1 1 4.83-2.37"/>
    <path d="M18 10a4 4 0 0 0-7.87-.9A5 5 0 1 0 6 18h12a4 4 0 0 0 0-8z"/>
  </svg>`,
  
  cloudy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 10a4 4 0 0 0-7.87-.9A5 5 0 1 0 6 18h12a4 4 0 0 0 0-8z"/>
  </svg>`,
  
  rainy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 13V21"/>
    <path d="M8 13V21"/>
    <path d="M12 15V23"/>
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
  </svg>`,
  
  stormy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>
    <polyline points="13 11 9 17 15 17 11 23"/>
  </svg>`,
  
  foggy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/>
    <line x1="8" y1="19" x2="8" y2="19.01"/>
    <line x1="8" y1="23" x2="8" y2="23.01"/>
    <line x1="12" y1="21" x2="12" y2="21.01"/>
    <line x1="16" y1="19" x2="16" y2="19.01"/>
    <line x1="16" y1="23" x2="16" y2="23.01"/>
  </svg>`,
  
  rainbow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 17a10 10 0 0 0-20 0"/>
    <path d="M6 17a6 6 0 0 1 12 0"/>
    <path d="M10 17a2 2 0 0 1 4 0"/>
  </svg>`,

  // UI Controls
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`,
  
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 6v6l4 2"/>
  </svg>`,
  
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`,
  
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`,
  
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>`,

  // Tone/mood indicators
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>`,

  sprout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 20h10"/>
    <path d="M10 20c5.5-2.5.8-6.4 3-10"/>
    <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/>
    <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>
  </svg>`,

  flexBicep: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 18.5c1 1 3 1.5 5 1.5s4-.5 5-1.5"/>
    <path d="M16 3h3v12h-3"/>
    <path d="M12 8V3"/>
    <path d="M8 13c1-.5 2-1 3-1s2 .5 3 1"/>
    <path d="M3 8c0 2.5 1 4 2 5s2 2 4 2"/>
    <path d="M5 3v3c0 1 .5 2 1 3"/>
  </svg>`,

  questionMark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <path d="M12 17h.01"/>
  </svg>`,

  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`,

  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`,

  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>`,
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Get an icon by name
 */
export function getIcon(name: IconName): string {
  return ICONS[name] || ICONS.clock;
}

// ============================================================================
// SHARED CSS STYLES
// ============================================================================

/**
 * Base styles for engagement panel components
 * These use CSS variables exclusively - no hardcoded values
 */
export const SHARED_STYLES = `
  /* ========================================
     ENGAGEMENT SHARED STYLES
     Design system compliant components
     ======================================== */

  /* ========================================
     MODAL SYSTEM - Centralized Base Classes
     Use these to ensure consistent modal behavior
     ======================================== */

  /* Modal Container - Full screen overlay */
  .ferni-modal {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 1400);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--ma-silence, 34px);
    opacity: 0;
    visibility: hidden;
    transition: 
      opacity var(--duration-normal, 200ms) var(--ease-gentle),
      visibility var(--duration-normal, 200ms) var(--ease-gentle);
  }

  .ferni-modal--visible {
    opacity: 1;
    visibility: visible;
  }

  /* Modal Backdrop */
  .ferni-modal__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
  }

  /* Modal Card - The floating content container */
  .ferni-modal__card {
    position: relative;
    width: 100%;
    max-width: clamp(294px, 90vw, 420px);
    max-height: 80vh;
    background: var(--color-background-elevated);
    border-radius: var(--radius-2xl, 1.5rem);
    box-shadow: var(--shadow-2xl);
    border: 1px solid var(--color-border-subtle);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: translateY(20px) scale(0.95);
    opacity: 0;
    transition: 
      transform var(--duration-slower, 400ms) var(--ease-spring),
      opacity var(--duration-slower, 400ms) var(--ease-gentle);
  }

  .ferni-modal--visible .ferni-modal__card {
    transform: translateY(0) scale(1);
    opacity: 1;
  }

  /* Modal Header */
  .ferni-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-5, 20px) var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .ferni-modal__title {
    font-family: var(--font-display);
    font-size: var(--text-xl, 1.25rem);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--color-text-primary);
    margin: 0;
  }

  /* Modal Content - Scrollable area */
  .ferni-modal__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5, 20px);
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 16px);
  }

  /* Modal Footer */
  .ferni-modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2, 8px);
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  /* ========================================
     SLIDE-IN MENU SYSTEM (Settings/Navigation)
     ======================================== */

  .ferni-menu {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay, 1300);
    pointer-events: none;
    visibility: hidden;
  }

  .ferni-menu--visible {
    pointer-events: auto;
    visibility: visible;
  }

  .ferni-menu__backdrop {
    position: absolute;
    inset: 0;
    background: var(--backdrop-menu);
    /* Blur removed - cleaner look per user preference */
    opacity: 0;
    transition: opacity var(--duration-normal, 200ms) var(--ease-gentle);
  }

  .ferni-menu--visible .ferni-menu__backdrop {
    opacity: 1;
  }

  .ferni-menu__panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(320px, 100%);
    max-width: 85vw;
    background: var(--color-background-elevated);
    box-shadow: var(--shadow-2xl);
    border-left: 1px solid var(--color-border-subtle);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: translateX(100%);
    transition: transform var(--duration-slower, 400ms) var(--ease-ease-out-expo);
  }

  .ferni-menu--visible .ferni-menu__panel {
    transform: translateX(0);
  }

  /* ========================================
     RESPONSIVE - Modal/Menu adjustments
     ======================================== */
  @media (max-width: clamp(336px, 90vw, 480px)) {
    .ferni-modal {
      /* Respect safe areas on notched devices */
      padding: max(var(--space-4, 16px), env(safe-area-inset-top, 0))
               max(var(--space-4, 16px), env(safe-area-inset-right, 0))
               max(var(--space-4, 16px), env(safe-area-inset-bottom, 0))
               max(var(--space-4, 16px), env(safe-area-inset-left, 0));
    }

    .ferni-modal__card {
      /* Account for safe areas in max height */
      max-height: calc(100vh - env(safe-area-inset-top, 0) - env(safe-area-inset-bottom, 0) - 32px);
      max-height: calc(100dvh - env(safe-area-inset-top, 0) - env(safe-area-inset-bottom, 0) - 32px);
      border-radius: var(--radius-xl, 1.25rem);
      /* iOS smooth scrolling */
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    
    .ferni-modal__content {
      /* Enable momentum scrolling */
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    .ferni-menu__panel {
      width: 100%;
      max-width: none;
      border-left: none;
      /* Safe area padding for full-width menus */
      padding-top: env(safe-area-inset-top, 0);
      padding-bottom: env(safe-area-inset-bottom, 0);
    }
  }
  
  /* iOS Safari specific fixes */
  @supports (-webkit-touch-callout: none) {
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .ferni-modal__card {
        max-height: -webkit-fill-available;
      }
      
      .ferni-modal__content {
        -webkit-overflow-scrolling: touch;
      }
    }
  }
  
  /* Landscape mode - narrower modals */
  @media (orientation: landscape) and (max-height: 500px) {
    .ferni-modal__card {
      max-width: min(90vw, 500px);
      max-height: calc(100vh - env(safe-area-inset-top, 0) - env(safe-area-inset-bottom, 0) - 16px);
    }
    
    .ferni-menu__panel {
      max-width: 50vw;
      /* Landscape safe areas for horizontal notch devices */
      padding-left: env(safe-area-inset-left, 0);
      padding-right: env(safe-area-inset-right, 0);
    }
  }

  /* ========================================
     REDUCED MOTION - Modal/Menu
     ======================================== */
  @media (prefers-reduced-motion: reduce) {
    .ferni-modal,
    .ferni-modal__card,
    .ferni-menu__backdrop,
    .ferni-menu__panel {
      transition: opacity var(--duration-fast, 150ms) linear !important;
      transform: none !important;
    }

    .ferni-modal--visible .ferni-modal__card {
      transform: none !important;
    }

    .ferni-menu--visible .ferni-menu__panel {
      transform: none !important;
    }
  }

  /* -------------------------------------
     PANEL BASE (Legacy - kept for compatibility)
     ------------------------------------- */
  .engagement-panel-base {
    position: fixed;
    z-index: var(--z-overlay, 1300);
    background: var(--color-background-elevated);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--shadow-xl);
  }

  /* -------------------------------------
     CLOSE BUTTON (Shared)
     ------------------------------------- */
  .engagement-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ma-silence, 34px);
    height: var(--ma-silence, 34px);
    padding: 0;
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: 
      background var(--duration-fast, 150ms) var(--ease-gentle),
      color var(--duration-fast, 150ms) var(--ease-gentle),
      transform var(--duration-fast, 150ms) var(--ease-spring),
      box-shadow var(--duration-fast, 150ms) var(--ease-gentle);
    box-shadow: var(--shadow-button-rest);
  }

  .engagement-close-btn:hover {
    background: var(--color-background-tertiary);
    color: var(--color-text-primary);
    border-color: var(--color-border-medium);
    transform: scale(1.05);
    box-shadow: var(--shadow-button-hover);
  }

  .engagement-close-btn:active {
    transform: scale(0.95);
    box-shadow: var(--shadow-button-pressed);
  }

  .engagement-close-btn:focus-visible {
    outline: 2px solid var(--persona-primary, var(--color-accent-primary));
    outline-offset: 2px;
  }

  .engagement-close-btn svg {
    width: 16px;
    height: 16px;
    stroke-width: 2.5;
    opacity: 0.8;
    transition: opacity var(--duration-fast) ease;
  }

  .engagement-close-btn:hover svg {
    opacity: 1;
  }

  /* -------------------------------------
     BACK BUTTON (Shared)
     ------------------------------------- */
  .engagement-back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ma-silence, 34px);
    height: var(--ma-silence, 34px);
    padding: 0;
    background: var(--color-background-tertiary);
    border: none;
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: 
      background var(--duration-fast) var(--ease-gentle),
      color var(--duration-fast) var(--ease-gentle);
  }

  .engagement-back-btn:hover {
    background: var(--color-background-secondary);
    color: var(--color-text-primary);
  }

  .engagement-back-btn svg {
    width: 16px;
    height: 16px;
  }

  /* -------------------------------------
     CARD BASE
     ------------------------------------- */
  .engagement-card-base {
    background: var(--color-background-primary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--ma-rest, 21px);
    animation: engagementCardEnter var(--duration-moderate, 400ms) var(--ease-expo-out) forwards;
    opacity: 0;
    transform: translateY(8px);
  }

  @keyframes engagementCardEnter {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* -------------------------------------
     SECTION HEADER
     ------------------------------------- */
  .engagement-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--ma-pause, 13px);
  }

  .engagement-section-label {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
  }

  /* -------------------------------------
     BADGE
     ------------------------------------- */
  .engagement-badge {
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--color-accent-text);
    background: var(--persona-tint, var(--color-accent-subtle));
    padding: 2px var(--ma-breath, 8px);
    border-radius: var(--radius-full);
  }

  /* -------------------------------------
     PRIMARY BUTTON
     ------------------------------------- */
  .engagement-btn-primary {
    padding: var(--ma-pause, 13px) var(--ma-rest, 21px);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium, 500);
    color: white;
    background: var(--persona-primary, var(--color-accent-primary));
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: 
      background var(--duration-fast) var(--ease-gentle),
      transform var(--duration-fast) var(--ease-spring);
  }

  .engagement-btn-primary:hover {
    background: var(--persona-secondary, var(--color-accent-hover));
    transform: translateY(-1px);
  }

  .engagement-btn-primary:active {
    transform: scale(0.98);
  }

  /* -------------------------------------
     SECONDARY BUTTON
     ------------------------------------- */
  .engagement-btn-secondary {
    padding: var(--ma-pause, 13px) var(--ma-rest, 21px);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium, 500);
    color: var(--color-text-muted);
    background: var(--tonal-surface-2);
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition:
      color var(--duration-fast) var(--ease-gentle),
      background var(--duration-fast) var(--ease-gentle);
  }

  .engagement-btn-secondary:hover {
    color: var(--color-text-primary);
    background: var(--tonal-surface-3);
  }

  .engagement-btn-secondary:active {
    background: var(--tonal-surface-active);
  }

  /* -------------------------------------
     FORM ELEMENTS
     ------------------------------------- */
  .engagement-input,
  .engagement-textarea,
  .engagement-select {
    width: 100%;
    padding: var(--ma-pause, 13px);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    outline: none;
    transition: border-color var(--duration-fast) var(--ease-gentle);
  }

  .engagement-input:focus,
  .engagement-textarea:focus,
  .engagement-select:focus {
    border-color: var(--color-accent-text);
  }

  .engagement-input::placeholder,
  .engagement-textarea::placeholder {
    color: var(--color-text-dimmed);
  }

  /* -------------------------------------
     EMPTY STATE
     ------------------------------------- */
  .engagement-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--ma-meditation, 55px) var(--ma-rest, 21px);
    text-align: center;
  }

  .engagement-empty-icon {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-tertiary);
    border-radius: 50%;
    color: var(--color-text-dimmed);
    margin-bottom: var(--ma-rest, 21px);
  }

  .engagement-empty-icon svg {
    width: 32px;
    height: 32px;
  }

  .engagement-empty-title {
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: var(--font-weight-medium, 500);
    color: var(--color-text-primary);
    margin: 0 0 var(--ma-breath, 8px) 0;
  }

  .engagement-empty-message {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    max-width: min(200px, 100%);
    line-height: var(--leading-normal);
    margin: 0;
  }

  /* -------------------------------------
     STREAK DOTS (Persona-aware)
     ------------------------------------- */
  .engagement-streak-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-border-medium);
    transition: 
      background var(--duration-fast) var(--ease-gentle),
      transform var(--duration-normal) var(--ease-spring);
  }

  .engagement-streak-dot--filled {
    background: var(--persona-primary, var(--color-accent-primary));
    animation: streakDotPop var(--duration-slow, 300ms) var(--ease-spring) forwards;
  }

  @keyframes streakDotPop {
    0% { transform: scale(0); }
    100% { transform: scale(1); }
  }

  /* Persona-specific colors using CSS variables */
  [data-persona="ferni"] .engagement-streak-dot--filled { background: var(--persona-primary); }
  [data-persona="alex-chen"] .engagement-streak-dot--filled { background: var(--persona-primary); }
  [data-persona="maya-santos"] .engagement-streak-dot--filled { background: var(--persona-primary); }
  [data-persona="jordan-taylor"] .engagement-streak-dot--filled { background: var(--persona-primary); }
  [data-persona="nayan-patel"] .engagement-streak-dot--filled { background: var(--persona-primary); }
  [data-persona="peter-john"] .engagement-streak-dot--filled { background: var(--persona-primary); }

  /* -------------------------------------
     DARK THEME (Cedar Night)
     ------------------------------------- */
  [data-theme="midnight"] .engagement-close-btn {
    background: var(--color-background-tertiary);
    border-color: var(--color-border-subtle);
    color: var(--color-text-secondary);
    box-shadow: var(--shadow-button-rest);
  }

  [data-theme="midnight"] .engagement-close-btn:hover {
    background: var(--color-background-secondary);
    border-color: var(--color-border-medium);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-button-hover);
  }

  [data-theme="midnight"] .engagement-close-btn:active {
    box-shadow: var(--shadow-button-pressed);
  }

  [data-theme="midnight"] .engagement-back-btn {
    background: var(--color-background-tertiary);
    color: var(--color-text-secondary);
  }

  [data-theme="midnight"] .engagement-card-base {
    background: var(--color-background-secondary);
    border-color: var(--color-border-subtle);
  }

  [data-theme="midnight"] .engagement-section-label {
    color: var(--color-text-muted);
  }

  [data-theme="midnight"] .engagement-badge {
    color: var(--color-accent-text);
    background: var(--persona-tint);
  }

  [data-theme="midnight"] .engagement-input,
  [data-theme="midnight"] .engagement-textarea,
  [data-theme="midnight"] .engagement-select {
    background: var(--color-background-secondary);
    color: var(--color-text-primary);
    border-color: var(--color-border-subtle);
  }

  [data-theme="midnight"] .engagement-empty-icon {
    background: var(--color-background-tertiary);
    color: var(--color-text-muted);
  }

  [data-theme="midnight"] .engagement-empty-title {
    color: var(--color-text-primary);
  }

  [data-theme="midnight"] .engagement-empty-message {
    color: var(--color-text-secondary);
  }

  /* -------------------------------------
     REDUCED MOTION
     ------------------------------------- */
  @media (prefers-reduced-motion: reduce) {
    .engagement-card-base {
      animation: none;
      opacity: 1;
      transform: none;
    }
    
    .engagement-streak-dot--filled {
      animation: none;
    }
    
    .engagement-close-btn,
    .engagement-back-btn,
    .engagement-btn-primary,
    .engagement-btn-secondary {
      transition: none;
    }
  }
`;

/**
 * Inject shared styles into document
 * Call once during app initialization
 */
let stylesInjected = false;

export function injectSharedStyles(): void {
  if (stylesInjected) return;
  
  const styleId = 'engagement-shared-styles';
  if (document.getElementById(styleId)) {
    stylesInjected = true;
    return;
  }
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = SHARED_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape for HTML attributes
 */
export function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Format a date in a human-friendly way
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return 'Last week';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Get milestone message for streak count
 */
export function getStreakMilestoneMessage(count: number): string | null {
  // Find the highest milestone that's <= count
  const milestones = Object.keys(STREAK_MILESTONES).map(Number).sort((a, b) => b - a);
  for (const milestone of milestones) {
    if (count >= milestone) {
      return STREAK_MILESTONES[milestone] ?? null;
    }
  }
  return null;
}

/**
 * Create animation timing function with design system values
 */
export function createAnimationConfig(
  duration: number = DURATION.MODERATE,
  easing: string = EASING.EXPO_OUT
): KeyframeAnimationOptions {
  return {
    duration,
    easing,
    fill: 'forwards' as FillMode,
  };
}

// ============================================================================
// COMPONENT GENERATORS
// ============================================================================

/**
 * Generate close button HTML
 */
export function renderCloseButton(ariaLabel: string = 'Close'): string {
  return `
    <button class="engagement-close-btn" aria-label="${escapeAttr(ariaLabel)}">
      ${ICONS.close}
    </button>
  `;
}

/**
 * Generate back button HTML
 */
export function renderBackButton(ariaLabel: string = 'Go back'): string {
  return `
    <button class="engagement-back-btn" aria-label="${escapeAttr(ariaLabel)}">
      ${ICONS.back}
    </button>
  `;
}

/**
 * Generate empty state HTML
 */
export function renderEmptyState(
  icon: IconName = 'clock',
  title: string,
  message: string
): string {
  return `
    <div class="engagement-empty-state">
      <div class="engagement-empty-icon">
        ${getIcon(icon)}
      </div>
      <h3 class="engagement-empty-title">${escapeHtml(title)}</h3>
      <p class="engagement-empty-message">${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Generate streak dots HTML
 */
export function renderStreakDots(
  current: number,
  maxDisplay: number = 7,
  personaId?: string
): string {
  const displayCount = Math.min(current, maxDisplay);
  const filled = Array(displayCount)
    .fill(0)
    .map((_, i) => {
      const delay = getStaggerDelay(i, STAGGER_DELAYS.MICRO);
      return `<span class="engagement-streak-dot engagement-streak-dot--filled" style="animation-delay: ${delay}ms"></span>`;
    })
    .join('');

  const emptyCount = maxDisplay - displayCount;
  const empty = emptyCount > 0
    ? Array(emptyCount).fill('<span class="engagement-streak-dot"></span>').join('')
    : '';

  const overflow = current > maxDisplay
    ? '<span class="engagement-streak-overflow">+</span>'
    : '';

  const wrapper = personaId 
    ? `<div class="engagement-streak-dots" data-persona="${escapeAttr(personaId)}">`
    : '<div class="engagement-streak-dots">';

  return `${wrapper}${filled}${empty}${overflow}</div>`;
}

