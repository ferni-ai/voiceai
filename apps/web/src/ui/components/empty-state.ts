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

import { t } from '../../i18n/index.js';
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

/** Stored form: display text lives in i18n keys, resolved by `resolveContent`. */
interface EmptyStateEntry {
  icon: string;
  headlineKey: string;
  descriptionKey: string;
  encouragementKey: string;
}

// ============================================================================
// EMPTY STATE CONTENT (Brand Voice)
// ============================================================================

const EMPTY_STATE_CONTENT: Record<EmptyStateType, EmptyStateEntry> = {
  'growth-journal': {
    icon: GROWTH_ICONS.journal,
    headlineKey: 'emptyState.growthJournal.headline',
    descriptionKey: 'emptyState.growthJournal.description',
    encouragementKey: 'emptyState.growthJournal.encouragement',
  },
  'pattern-insights': {
    icon: ANALYTICS_ICONS.sparkles,
    headlineKey: 'emptyState.patternInsights.headline',
    descriptionKey: 'emptyState.patternInsights.description',
    encouragementKey: 'emptyState.patternInsights.encouragement',
  },
  'memory-lane': {
    icon: GROWTH_ICONS.heart,
    headlineKey: 'emptyState.memoryLane.headline',
    descriptionKey: 'emptyState.memoryLane.description',
    encouragementKey: 'emptyState.memoryLane.encouragement',
  },
  'knowledge-quiz': {
    icon: ANALYTICS_ICONS.brain,
    headlineKey: 'emptyState.knowledgeQuiz.headline',
    descriptionKey: 'emptyState.knowledgeQuiz.description',
    encouragementKey: 'emptyState.knowledgeQuiz.encouragement',
  },
  'your-story': {
    icon: GROWTH_ICONS.seedling,
    headlineKey: 'emptyState.yourStory.headline',
    descriptionKey: 'emptyState.yourStory.description',
    encouragementKey: 'emptyState.yourStory.encouragement',
  },
  'your-year': {
    icon: ANALYTICS_ICONS.calendar,
    headlineKey: 'emptyState.yourYear.headline',
    descriptionKey: 'emptyState.yourYear.description',
    encouragementKey: 'emptyState.yourYear.encouragement',
  },
  'conversation-history': {
    icon: ANALYTICS_ICONS.clock,
    headlineKey: 'emptyState.conversationHistory.headline',
    descriptionKey: 'emptyState.conversationHistory.description',
    encouragementKey: 'emptyState.conversationHistory.encouragement',
  },
  contacts: {
    icon: EMOTION_ICONS.grateful,
    headlineKey: 'emptyState.contacts.headline',
    descriptionKey: 'emptyState.contacts.description',
    encouragementKey: 'emptyState.contacts.encouragement',
  },
  'music-dashboard': {
    icon: ANALYTICS_ICONS.sparkles,
    headlineKey: 'emptyState.musicDashboard.headline',
    descriptionKey: 'emptyState.musicDashboard.description',
    encouragementKey: 'emptyState.musicDashboard.encouragement',
  },
  activity: {
    icon: ANALYTICS_ICONS.trendingUp,
    headlineKey: 'emptyState.activity.headline',
    descriptionKey: 'emptyState.activity.description',
    encouragementKey: 'emptyState.activity.encouragement',
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

function resolveContent(type: EmptyStateType): EmptyStateConfig {
  const { icon, headlineKey, descriptionKey, encouragementKey } = EMPTY_STATE_CONTENT[type];
  return {
    icon,
    headline: t(headlineKey),
    description: t(descriptionKey),
    encouragement: t(encouragementKey),
  };
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

  const config = resolveContent(type);
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
  return resolveContent(type);
}

/**
 * Get all available empty state types
 * 
 * @returns Array of all feature types that have empty states
 */
export function getAvailableEmptyStateTypes(): EmptyStateType[] {
  return Object.keys(EMPTY_STATE_CONTENT) as EmptyStateType[];
}
