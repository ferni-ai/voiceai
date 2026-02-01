/**
 * Empty State Component
 * 
 * Brand-compliant empty states with warm, encouraging copy that builds
 * anticipation for features rather than making users feel like they're 
 * missing out or starting from scratch.
 * 
 * Design principles:
 * - Warm, human language (never "No data available")
 * - Forward-looking, builds anticipation
 * - Acknowledges the user's journey is just beginning
 * - Uses brand colors (warm browns, sage greens)
 * - Lucide-style SVG icons (never emoji)
 * 
 * @module ui/components/empty-state
 */

import { ANALYTICS_ICONS, GROWTH_ICONS, EMOTION_ICONS } from '../icons/shared-icons.js';

// ============================================================================
// TYPES
// ============================================================================

export type EmptyStateType =
  | 'growth-journal'
  | 'pattern-insights'
  | 'memory-lane'
  | 'knowledge-quiz'
  | 'your-story'
  | 'your-year'
  | 'conversation-history'
  | 'contacts'
  | 'music-dashboard'
  | 'activity';

interface EmptyStateConfig {
  icon: string;
  headline: string;
  description: string;
  encouragement?: string;
}

// ============================================================================
// EMPTY STATE CONTENT (Brand Voice)
// ============================================================================

const EMPTY_STATE_CONTENT: Record<EmptyStateType, EmptyStateConfig> = {
  'growth-journal': {
    icon: GROWTH_ICONS.journal,
    headline: "Your growth story is just beginning",
    description: "As we talk, I'll notice patterns and celebrate wins you might not see yourself.",
    encouragement: "Your first reflection will appear soon.",
  },
  
  'pattern-insights': {
    icon: ANALYTICS_ICONS.sparkles,
    headline: "I'm learning your rhythms",
    description: "After a few more conversations, I'll show you patterns that might surprise you.",
    encouragement: "The best insights come from spending time together.",
  },
  
  'memory-lane': {
    icon: GROWTH_ICONS.heart,
    headline: "We're building memories together",
    description: "Every conversation adds to our shared story. Soon you'll have moments worth revisiting.",
    encouragement: "Keep chatting, and this will fill with moments that matter.",
  },
  
  'knowledge-quiz': {
    icon: ANALYTICS_ICONS.brain,
    headline: "I'm still getting to know you",
    description: "Quiz questions are generated from our conversations. The more we talk, the more fun the questions!",
    encouragement: "After a few more chats, I'll have some great questions ready.",
  },
  
  'your-story': {
    icon: GROWTH_ICONS.seedling,
    headline: "Your story is unfolding",
    description: "Every conversation adds a new chapter. Check back as our relationship deepens.",
    encouragement: "The most meaningful insights emerge over time.",
  },
  
  'your-year': {
    icon: ANALYTICS_ICONS.calendar,
    headline: "A year of growth awaits",
    description: "This space will show your journey over time - streaks, milestones, and memories.",
    encouragement: "Start your first conversation to begin tracking your year.",
  },
  
  'conversation-history': {
    icon: ANALYTICS_ICONS.clock,
    headline: "Ready when you are",
    description: "Your conversations will appear here, ready to revisit whenever you like.",
    encouragement: "Every conversation is saved and searchable.",
  },
  
  'contacts': {
    icon: EMOTION_ICONS.grateful,
    headline: "Your world starts here",
    description: "As you mention the people in your life, I'll help you keep track of those relationships.",
    encouragement: "Tell me about someone important to you.",
  },
  
  'music-dashboard': {
    icon: ANALYTICS_ICONS.sparkles,
    headline: "Let's discover your musical self",
    description: "Play some music during our conversations, and I'll learn what moves you.",
    encouragement: "Ask me to play something and let's get started.",
  },
  
  'activity': {
    icon: ANALYTICS_ICONS.trendingUp,
    headline: "Your activity is just getting started",
    description: "This will show your engagement patterns, streaks, and accomplishments.",
    encouragement: "Every check-in adds to your story.",
  },
};

// ============================================================================
// STYLES
// ============================================================================

const EMPTY_STATE_STYLES = `
  .ferni-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-8, 32px) var(--space-6, 24px);
    min-height: 200px;
    gap: var(--space-4, 16px);
  }

  .ferni-empty-state__icon {
    width: 48px;
    height: 48px;
    color: var(--color-accent, #3D5A45);
    opacity: 0.6;
    margin-bottom: var(--space-2, 8px);
  }

  .ferni-empty-state__icon svg {
    width: 100%;
    height: 100%;
  }

  .ferni-empty-state__headline {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-text-primary, #2C2520);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .ferni-empty-state__description {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--color-text-secondary, #5c544a);
    margin: 0;
    max-width: 320px;
  }

  .ferni-empty-state__encouragement {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.4;
    color: var(--color-accent, #3D5A45);
    margin: 0;
    padding: var(--space-2, 8px) var(--space-4, 16px);
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
    border-radius: var(--radius-full, 9999px);
  }

  /* Compact variant */
  .ferni-empty-state--compact {
    padding: var(--space-4, 16px);
    min-height: 120px;
    gap: var(--space-2, 8px);
  }

  .ferni-empty-state--compact .ferni-empty-state__icon {
    width: 32px;
    height: 32px;
    margin-bottom: 0;
  }

  .ferni-empty-state--compact .ferni-empty-state__headline {
    font-size: 0.9375rem;
  }

  .ferni-empty-state--compact .ferni-empty-state__description {
    font-size: 0.8125rem;
    max-width: 280px;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .ferni-empty-state__headline {
      color: var(--color-text-primary-dark, #F5F1E8);
    }

    .ferni-empty-state__description {
      color: var(--color-text-secondary-dark, #e0dbd4);
    }

    .ferni-empty-state__encouragement {
      background: var(--color-accent-subtle-dark, rgba(74, 103, 65, 0.15));
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .ferni-empty-state * {
      animation: none !important;
      transition: none !important;
    }
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  if (document.getElementById('ferni-empty-state-styles')) return;

  const style = document.createElement('style');
  style.id = 'ferni-empty-state-styles';
  style.textContent = EMPTY_STATE_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

/**
 * Create an empty state element for a feature
 * 
 * @param type - The feature type to show empty state for
 * @param compact - Whether to use compact styling (default: false)
 * @returns HTMLElement ready to be inserted into the DOM
 * 
 * @example
 * const emptyState = createEmptyState('growth-journal');
 * container.appendChild(emptyState);
 */
export function createEmptyState(type: EmptyStateType, compact = false): HTMLElement {
  injectStyles();

  const config = EMPTY_STATE_CONTENT[type];
  const container = document.createElement('div');
  container.className = `ferni-empty-state${compact ? ' ferni-empty-state--compact' : ''}`;

  // Icon
  const icon = document.createElement('div');
  icon.className = 'ferni-empty-state__icon';
  icon.innerHTML = config.icon;
  icon.setAttribute('aria-hidden', 'true');
  container.appendChild(icon);

  // Headline
  const headline = document.createElement('h3');
  headline.className = 'ferni-empty-state__headline';
  headline.textContent = config.headline;
  container.appendChild(headline);

  // Description
  const description = document.createElement('p');
  description.className = 'ferni-empty-state__description';
  description.textContent = config.description;
  container.appendChild(description);

  // Encouragement (optional)
  if (config.encouragement && !compact) {
    const encouragement = document.createElement('p');
    encouragement.className = 'ferni-empty-state__encouragement';
    encouragement.textContent = config.encouragement;
    container.appendChild(encouragement);
  }

  return container;
}

/**
 * Get empty state content for a feature (for use with existing components)
 * 
 * @param type - The feature type
 * @returns The content configuration object
 */
export function getEmptyStateContent(type: EmptyStateType): EmptyStateConfig {
  return EMPTY_STATE_CONTENT[type];
}

/**
 * Get all available empty state types
 * 
 * @returns Array of all feature types that have empty states
 */
export function getAvailableEmptyStateTypes(): EmptyStateType[] {
  return Object.keys(EMPTY_STATE_CONTENT) as EmptyStateType[];
}
