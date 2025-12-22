/**
 * Creative You - UI Components
 *
 * Modular components for the Creative You engagement feature.
 */

// Types
export type {
  VideoRecommendation,
  PodcastRecommendation,
  CreativeDNA,
  LearningTrack,
  IntelligentRecommendation,
  ContentMood,
} from './types.js';

// Constants
export { ICONS, MOOD_COLORS, MOOD_LABELS } from './constants.js';

// Styles
export { injectCreativeYouStyles, getCreativeYouStyles } from './styles.js';

// Re-export the main dashboard from parent directory for backward compatibility
// The dashboard will be refactored to use these modules

