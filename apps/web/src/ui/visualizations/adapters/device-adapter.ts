/**
 * Device Adapter for Visualization Rendering
 *
 * Provides a unified interface for rendering visualizations across different
 * device types. Handles device detection, context creation, and builder routing.
 *
 * Usage:
 *   const adapter = createDeviceAdapter();
 *   const result = adapter.render(container, 'mood-calendar', data);
 *
 * @module visualizations/adapters/device-adapter
 */

import type {
  DeviceContext,
  DeviceType,
  Platform,
  VisualizationType,
  VisualizationResult,
  MoodCalendarData,
  BurnoutGaugeData,
  LifeTimelineData,
  GrowthRadarData,
  EmotionalArcsData,
  PredictionsData,
  RelationshipNetworkData,
  OpenLoopsData,
  EnergyRingsData,
} from '../types.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DeviceAdapter');
import { buildMoodCalendar } from '../builders/mood-calendar.js';
import { buildBurnoutGauge } from '../builders/burnout-gauge.js';
import { buildLifeTimeline } from '../builders/life-timeline.js';
import { buildGrowthRadar } from '../builders/growth-radar.js';
import { buildEmotionalArcs } from '../builders/emotional-arcs.js';
import { buildPredictions } from '../builders/predictions.js';
import { buildRelationshipNetwork } from '../builders/relationship-network.js';
import { buildOpenLoops } from '../builders/open-loops.js';
import { buildEnergyRings } from '../builders/energy-rings.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Map of visualization types to their data types.
 */
interface VisualizationDataMap {
  'mood-calendar': MoodCalendarData;
  'burnout-gauge': BurnoutGaugeData;
  'life-timeline': LifeTimelineData;
  'growth-radar': GrowthRadarData;
  'emotional-arcs': EmotionalArcsData;
  'predictions': PredictionsData;
  'relationship-network': RelationshipNetworkData;
  'open-loops': OpenLoopsData;
  'energy-rings': EnergyRingsData;
}

/**
 * Builder function type.
 */
type BuilderFn<T> = (
  container: HTMLElement,
  data: T,
  context: DeviceContext
) => VisualizationResult;

/**
 * Device adapter options.
 */
export interface DeviceAdapterOptions {
  /** Force a specific device type (overrides detection) */
  forceDevice?: DeviceType;
  /** Force a specific platform (overrides detection) */
  forcePlatform?: Platform;
  /** Override reduced motion preference */
  prefersReducedMotion?: boolean;
  /** Override dark mode preference */
  isDarkMode?: boolean;
}

/**
 * Device adapter interface.
 */
export interface DeviceAdapter {
  /** Current device context */
  readonly context: DeviceContext;

  /** Render a visualization */
  render<K extends keyof VisualizationDataMap>(
    container: HTMLElement,
    type: K,
    data: VisualizationDataMap[K]
  ): VisualizationResult | null;

  /** Update device context (e.g., on resize) */
  updateContext(): void;

  /** Check if a visualization type is supported */
  isSupported(type: VisualizationType): boolean;
}

// ============================================================================
// BUILDER REGISTRY
// ============================================================================

/**
 * Registry of available builders.
 */
const builders: Partial<Record<VisualizationType, BuilderFn<unknown>>> = {
  'mood-calendar': buildMoodCalendar as BuilderFn<unknown>,
  'burnout-gauge': buildBurnoutGauge as BuilderFn<unknown>,
  'life-timeline': buildLifeTimeline as BuilderFn<unknown>,
  'growth-radar': buildGrowthRadar as BuilderFn<unknown>,
  'emotional-arcs': buildEmotionalArcs as BuilderFn<unknown>,
  'predictions': buildPredictions as BuilderFn<unknown>,
  'relationship-network': buildRelationshipNetwork as BuilderFn<unknown>,
  'open-loops': buildOpenLoops as BuilderFn<unknown>,
  'energy-rings': buildEnergyRings as BuilderFn<unknown>,
};

// ============================================================================
// DEVICE DETECTION
// ============================================================================

/**
 * Detect device type from screen dimensions and user agent.
 */
function detectDeviceType(): DeviceType {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') return 'mobile';

  const width = window.innerWidth;
  const height = window.innerHeight;
  const userAgent = navigator.userAgent.toLowerCase();

  // Watch detection (very small screens, typically < 200px)
  if (width <= 200 || height <= 200) return 'watch';

  // TV detection (very large screens or TV user agents)
  if (
    width >= 1920 &&
    height >= 1080 &&
    (userAgent.includes('tv') ||
      userAgent.includes('webos') ||
      userAgent.includes('tizen'))
  ) {
    return 'tv';
  }

  // Tablet detection (medium screens, 768-1024px)
  if (width >= 768 && width <= 1024) return 'tablet';

  // Desktop detection (large screens)
  if (width > 1024) return 'desktop';

  // Mobile is the default for everything else
  return 'mobile';
}

/**
 * Detect platform from user agent.
 */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'web';

  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('android')) return 'android';
  if (
    userAgent.includes('iphone') ||
    userAgent.includes('ipad') ||
    userAgent.includes('ipod')
  ) {
    return 'ios';
  }

  return 'web';
}

/**
 * Create device context from current environment.
 */
function createDeviceContext(options: DeviceAdapterOptions = {}): DeviceContext {
  const type = options.forceDevice ?? detectDeviceType();
  const platform = options.forcePlatform ?? detectPlatform();

  // Get screen dimensions
  const width = typeof window !== 'undefined' ? window.innerWidth : 375;
  const height = typeof window !== 'undefined' ? window.innerHeight : 812;

  // Check reduced motion preference
  const prefersReducedMotion =
    options.prefersReducedMotion ??
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Check dark mode preference
  const isDarkMode =
    options.isDarkMode ??
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return {
    type,
    platform,
    width,
    height,
    prefersReducedMotion,
    isDarkMode,
  };
}

// ============================================================================
// ADAPTER FACTORY
// ============================================================================

/**
 * Create a device adapter for rendering visualizations.
 *
 * @example
 * ```typescript
 * const adapter = createDeviceAdapter();
 *
 * // Render a mood calendar
 * const result = adapter.render(container, 'mood-calendar', moodData);
 *
 * // Force a specific device for testing
 * const watchAdapter = createDeviceAdapter({ forceDevice: 'watch' });
 * ```
 */
export function createDeviceAdapter(
  options: DeviceAdapterOptions = {}
): DeviceAdapter {
  let context = createDeviceContext(options);

  // Listen for resize events to update context
  if (typeof window !== 'undefined' && !options.forceDevice) {
    let resizeTimeout: ReturnType<typeof setTimeout>;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        context = createDeviceContext(options);
      }, 150);
    });
  }

  return {
    get context() {
      return context;
    },

    render<K extends keyof VisualizationDataMap>(
      container: HTMLElement,
      type: K,
      data: VisualizationDataMap[K]
    ): VisualizationResult | null {
      const builder = builders[type] as BuilderFn<VisualizationDataMap[K]> | undefined;

      if (!builder) {
        log.warn(`No builder found for type: ${type}`);
        return null;
      }

      try {
        return builder(container, data, context);
      } catch (error) {
        log.error(`Error rendering ${type}:`, error);
        return null;
      }
    },

    updateContext() {
      context = createDeviceContext(options);
    },

    isSupported(type: VisualizationType): boolean {
      return type in builders;
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { createDeviceContext, detectDeviceType, detectPlatform };
