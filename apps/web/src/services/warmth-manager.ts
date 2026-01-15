/**
 * Warmth Manager - Relationship-Based Visual Evolution
 *
 * The app subtly warms as the relationship deepens - a visual manifestation
 * of the "Better Than Human" brand promise.
 *
 * PHILOSOPHY:
 * - Early stage: minimal, focused, clear
 * - Deep partnership: rich, layered, intimate, warm
 *
 * VISUAL SHIFTS:
 * - Color temperature: cooler → warmer
 * - Animation confidence: standard → unhurried
 * - Glow intensity: subtle → radiant
 * - UI richness: minimal → layered
 *
 * @see docs/audits/VISUAL-STORYTELLING-AUDIT.md
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import {
  relationshipStageService,
  type RelationshipStage,
} from './relationship-stage.service.js';

const log = createLogger('WarmthManager');

// ============================================================================
// TYPES
// ============================================================================

interface WarmthConfig {
  /** Color temperature shift (-1 = cool, 0 = neutral, 1 = very warm) */
  colorTemperature: number;
  /** Animation speed multiplier (lower = more unhurried, confident) */
  animationMultiplier: number;
  /** Glow intensity (0 = none, 1 = radiant) */
  glowIntensity: number;
  /** UI richness (0 = minimal, 1 = full features) */
  uiRichness: number;
  /** Saturation adjustment */
  saturation: number;
  /** Description for debugging */
  description: string;
}

// ============================================================================
// WARMTH CONFIGURATIONS BY STAGE
// ============================================================================

const WARMTH_BY_STAGE: Record<RelationshipStage, WarmthConfig> = {
  'first-meeting': {
    colorTemperature: 0,
    animationMultiplier: 1.0,
    glowIntensity: 0.3,
    uiRichness: 0.2,
    saturation: 1.0,
    description: 'Clean and clear - ready to begin',
  },
  'getting-started': {
    colorTemperature: 0.1,
    animationMultiplier: 1.0,
    glowIntensity: 0.4,
    uiRichness: 0.4,
    saturation: 1.02,
    description: 'Slight warmth - building familiarity',
  },
  'building-trust': {
    colorTemperature: 0.2,
    animationMultiplier: 0.95,
    glowIntensity: 0.55,
    uiRichness: 0.6,
    saturation: 1.04,
    description: 'Growing warmth - trust emerging',
  },
  established: {
    colorTemperature: 0.35,
    animationMultiplier: 0.9,
    glowIntensity: 0.7,
    uiRichness: 0.8,
    saturation: 1.06,
    description: 'Comfortable warmth - solid relationship',
  },
  'deep-partnership': {
    colorTemperature: 0.5,
    animationMultiplier: 0.85,
    glowIntensity: 0.85,
    uiRichness: 1.0,
    saturation: 1.08,
    description: 'Full warmth - deep connection',
  },
};

// ============================================================================
// STATE
// ============================================================================

let currentStage: RelationshipStage | null = null;
let isInitialized = false;
let stageChangeUnsubscribe: (() => void) | null = null;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Apply warmth CSS variables to an element based on relationship stage
 */
export function applyWarmthTheme(
  stage: RelationshipStage,
  element: HTMLElement = document.documentElement
): void {
  const config = WARMTH_BY_STAGE[stage];

  // Set data attribute for CSS targeting
  element.setAttribute('data-relationship-stage', stage);

  // Set CSS custom properties
  element.style.setProperty('--relationship-warmth', String(config.colorTemperature));
  element.style.setProperty('--relationship-animation-multiplier', String(config.animationMultiplier));
  element.style.setProperty('--relationship-glow-intensity', String(config.glowIntensity));
  element.style.setProperty('--relationship-ui-richness', String(config.uiRichness));
  element.style.setProperty('--relationship-saturation', String(config.saturation));

  // Calculate warmth filter (subtle sepia for warmth)
  const warmthFilter = config.colorTemperature > 0
    ? `sepia(${config.colorTemperature * 0.08}) saturate(${config.saturation})`
    : 'none';
  element.style.setProperty('--relationship-warmth-filter', warmthFilter);

  // Compute animation duration modifier for components that want to respect it
  // Lower multiplier = longer duration = more confident/unhurried
  element.style.setProperty(
    '--relationship-duration-modifier',
    String(1 / config.animationMultiplier)
  );

  log.debug(
    { stage, warmth: config.colorTemperature, glow: config.glowIntensity },
    'Applied warmth theme'
  );
}

/**
 * Get the stage order index (0-4, used for progress calculations)
 */
function getStageIndex(stage: RelationshipStage): number {
  const stages: RelationshipStage[] = [
    'first-meeting',
    'getting-started',
    'building-trust',
    'established',
    'deep-partnership',
  ];
  return stages.indexOf(stage);
}

/**
 * Update warmth when stage changes
 */
function handleStageChange(event: { newStage: RelationshipStage; previousStage: RelationshipStage }): void {
  const { newStage, previousStage } = event;

  if (newStage !== currentStage) {
    currentStage = newStage;
    applyWarmthTheme(newStage);

    const newIndex = getStageIndex(newStage);
    const oldIndex = getStageIndex(previousStage);

    if (newIndex > oldIndex) {
      log.info(
        { from: previousStage, to: newStage },
        'Relationship deepened - increasing warmth'
      );
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize warmth manager
 * - Applies initial warmth based on current relationship stage
 * - Subscribes to stage change events
 */
export function initWarmthManager(): void {
  if (isInitialized) {
    log.debug('Warmth manager already initialized');
    return;
  }

  // Get current stage
  currentStage = relationshipStageService.getStage();

  // Apply initial warmth
  applyWarmthTheme(currentStage);

  // Subscribe to stage changes
  stageChangeUnsubscribe = relationshipStageService.onStageChange(handleStageChange);

  isInitialized = true;
  log.info({ stage: currentStage }, 'Warmth manager initialized');
}

/**
 * Dispose warmth manager
 */
export function disposeWarmthManager(): void {
  if (stageChangeUnsubscribe) {
    stageChangeUnsubscribe();
    stageChangeUnsubscribe = null;
  }

  isInitialized = false;
  currentStage = null;
  log.debug('Warmth manager disposed');
}

/**
 * Force update warmth (useful for testing or manual refresh)
 */
export function forceWarmthUpdate(): void {
  currentStage = relationshipStageService.getStage();
  applyWarmthTheme(currentStage);
}

/**
 * Get current warmth configuration
 */
export function getCurrentWarmthConfig(): WarmthConfig | null {
  if (!currentStage) return null;
  return WARMTH_BY_STAGE[currentStage];
}

/**
 * Get warmth config for a specific stage
 */
export function getWarmthConfigForStage(stage: RelationshipStage): WarmthConfig {
  return WARMTH_BY_STAGE[stage];
}

/**
 * Get all warmth configurations
 */
export function getAllWarmthConfigs(): Record<RelationshipStage, WarmthConfig> {
  return { ...WARMTH_BY_STAGE };
}

/**
 * Get adjusted animation duration based on relationship stage
 * Deeper relationships = longer, more confident animations
 * 
 * @param baseDuration - Base duration in ms
 * @returns Adjusted duration considering relationship depth
 * 
 * @example
 * // Use in animations:
 * element.animate(keyframes, { duration: getAdjustedDuration(300) });
 */
export function getAdjustedDuration(baseDuration: number): number {
  const config = getCurrentWarmthConfig();
  if (!config) return baseDuration;
  
  // Lower multiplier = longer duration (more confident/unhurried)
  // e.g., 0.85 multiplier → 1/0.85 = 1.18x duration
  return Math.round(baseDuration / config.animationMultiplier);
}

/**
 * Get adjusted animation configuration based on relationship stage
 * Convenience function that returns both duration and easing
 * 
 * @param baseDuration - Base duration in ms
 * @returns Animation config { duration, easing }
 */
export function getAdjustedAnimationConfig(baseDuration: number): { 
  duration: number; 
  easing: string;
} {
  const config = getCurrentWarmthConfig();
  if (!config) {
    return { duration: baseDuration, easing: EASING.STANDARD };
  }
  
  // Choose easing based on relationship depth
  // Deeper relationships get gentler, more organic easing
  let easing = EASING.STANDARD;
  if (config.animationMultiplier <= 0.9) {
    easing = EASING.GENTLE;
  } else if (config.animationMultiplier <= 0.95) {
    easing = EASING.SPRING_GENTLE;
  }
  
  return {
    duration: getAdjustedDuration(baseDuration),
    easing,
  };
}

// ============================================================================
// CSS INJECTION
// ============================================================================

/**
 * Inject warmth CSS for smooth transitions
 */
export function injectWarmthStyles(): void {
  const styleId = 'warmth-manager-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Smooth transitions for relationship warmth changes */
    :root {
      /* Default values */
      --relationship-warmth: 0;
      --relationship-animation-multiplier: 1;
      --relationship-glow-intensity: 0.3;
      --relationship-ui-richness: 0.2;
      --relationship-saturation: 1;
      --relationship-warmth-filter: none;
      --relationship-duration-modifier: 1;

      /* Smooth transitions when relationship deepens */
      transition:
        --relationship-warmth ${DURATION.DRAMATIC}ms ${EASING.GENTLE},
        --relationship-glow-intensity ${DURATION.DRAMATIC}ms ${EASING.GENTLE},
        --relationship-saturation ${DURATION.DRAMATIC}ms ${EASING.GENTLE};
    }

    /* Apply warmth filter to elements that want it */
    .relationship-warm {
      filter: var(--relationship-warmth-filter, none);
    }

    /* Apply animation timing modifier */
    .relationship-aware-animation {
      animation-duration: calc(var(--base-duration, 1s) * var(--relationship-duration-modifier, 1));
    }

    /* Apply glow intensity to elements */
    .relationship-glow {
      --glow-opacity: var(--relationship-glow-intensity, 0.3);
    }

    /* Stage-specific background tints (very subtle) */
    [data-relationship-stage="deep-partnership"] {
      --color-background-tint: color-mix(
        in oklch,
        var(--color-background-primary) 98%,
        var(--color-warm, #ffd700) 2%
      );
    }

    [data-relationship-stage="established"] {
      --color-background-tint: color-mix(
        in oklch,
        var(--color-background-primary) 99%,
        var(--color-warm, #ffd700) 1%
      );
    }

    /* Avatar glow intensity by stage */
    [data-relationship-stage="first-meeting"] .avatar-glow {
      opacity: 0.3;
    }

    [data-relationship-stage="getting-started"] .avatar-glow {
      opacity: 0.4;
    }

    [data-relationship-stage="building-trust"] .avatar-glow {
      opacity: 0.55;
    }

    [data-relationship-stage="established"] .avatar-glow {
      opacity: 0.7;
    }

    [data-relationship-stage="deep-partnership"] .avatar-glow {
      opacity: 0.85;
    }

    /* Animation confidence by stage (more unhurried at deeper stages) */
    [data-relationship-stage="established"] .confidence-aware,
    [data-relationship-stage="deep-partnership"] .confidence-aware {
      transition-duration: calc(var(--base-transition, 200ms) * 1.15);
    }

    /* Reduced motion respects relationship settings */
    @media (prefers-reduced-motion: reduce) {
      .relationship-aware-animation {
        animation-duration: 0ms !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const warmthManager = {
  init: initWarmthManager,
  dispose: disposeWarmthManager,
  forceUpdate: forceWarmthUpdate,
  getCurrentConfig: getCurrentWarmthConfig,
  getConfigForStage: getWarmthConfigForStage,
  getAllConfigs: getAllWarmthConfigs,
  injectStyles: injectWarmthStyles,
  applyTheme: applyWarmthTheme,
  // Animation helpers
  getAdjustedDuration,
  getAdjustedAnimationConfig,
};

export default warmthManager;
