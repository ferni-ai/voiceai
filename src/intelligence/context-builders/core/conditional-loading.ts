/**
 * Context Builder Loader - conditional loading config
 *
 * Which builder categories to skip at load time (feature flags, single-persona
 * mode, no external integrations). Used by loader.ts.
 *
 * @module intelligence/context-builders/core/conditional-loading
 */

import { isFeatureEnabled } from '../../../config/feature-flags.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from './categories.js';

const log = createLogger({ module: 'context-builder-loader' });

/**
 * Categories that can be conditionally skipped based on feature flags or context.
 * This reduces startup time by not loading builders that won't be used.
 */
export interface ConditionalLoadingConfig {
  /** Skip VOICE category if voice emotion analysis is disabled */
  skipVoiceBuilders: boolean;
  /** Skip EXTERNAL category if no external integrations are configured */
  skipExternalBuilders: boolean;
  /** Skip COACHING category if not in coaching mode */
  skipCoachingBuilders: boolean;
  /** Skip TEAM category for single-persona mode */
  skipTeamBuilders: boolean;
}

let conditionalConfig: ConditionalLoadingConfig = {
  skipVoiceBuilders: false,
  skipExternalBuilders: false,
  skipCoachingBuilders: false,
  skipTeamBuilders: false,
};

/**
 * Configure conditional loading options.
 * Call this before ensureBuildersLoaded() to customize which categories load.
 */
export function configureConditionalLoading(config: Partial<ConditionalLoadingConfig>): void {
  conditionalConfig = { ...conditionalConfig, ...config };
  log.debug({ config: conditionalConfig }, 'Conditional loading configured');
}

/**
 * Check if a category should be loaded based on conditional config.
 */
export function shouldLoadCategory(category: BuilderCategory): boolean {
  switch (category) {
    case BuilderCategory.VOICE:
      // Skip if voice emotion analysis is disabled
      if (conditionalConfig.skipVoiceBuilders) {
        return false;
      }
      // Also check feature flag
      if (!isFeatureEnabled('experimental.voiceEmotionDetection')) {
        return false;
      }
      return true;

    case BuilderCategory.EXTERNAL:
      // External integrations often require setup
      return !conditionalConfig.skipExternalBuilders;

    case BuilderCategory.COACHING:
      // Coaching is core functionality, but can be skipped for simpler use cases
      return !conditionalConfig.skipCoachingBuilders;

    case BuilderCategory.TEAM:
      // Multi-persona coordination - skip for single-persona mode
      return !conditionalConfig.skipTeamBuilders;

    // These categories are always required
    case BuilderCategory.SAFETY:
    case BuilderCategory.EMOTIONAL:
    case BuilderCategory.MEMORY:
    case BuilderCategory.PERSONA:
    case BuilderCategory.HUMANIZING:
      return true;

    // Default: load the category
    default:
      return true;
  }
}
