/**
 * Multi-Platform Visualizations Module
 *
 * This module provides cross-platform visualization builders that adapt
 * to different device types: watch, mobile, tablet, desktop, and TV.
 *
 * Architecture:
 * - Types: Shared data contracts for all platforms
 * - Builders: Device-adaptive visualization renderers
 * - Adapters: Device detection and routing
 * - Utils: Safe DOM utilities
 *
 * Usage:
 * ```typescript
 * import { createDeviceAdapter } from './visualizations';
 *
 * const adapter = createDeviceAdapter();
 * const result = adapter.render(container, 'mood-calendar', data);
 * ```
 *
 * @module visualizations
 */

// Types - the cross-platform data contract
export type {
  DeviceType,
  Platform,
  DeviceContext,
  VisualizationType,
  MoodEntry,
  MoodType,
  MoodCalendarData,
  BurnoutGaugeData,
  LifeTimelineData,
  TimelineChapter,
  GrowthDimension,
  GrowthRadarData,
  EmotionalArcPhase,
  EmotionalArcsData,
  Prediction,
  PredictionsData,
  Relationship,
  RelationshipNetworkData,
  OpenLoop,
  OpenLoopsData,
  EnergyRingsData,
  VisualizationResult,
  VisualizationBuilder,
  VisualizationApiResponse,
  VisualizationColors,
} from './types.js';

export { DEFAULT_COLORS } from './types.js';

// Builders - individual visualization components
export { buildMoodCalendar } from './builders/mood-calendar.js';
export { buildBurnoutGauge } from './builders/burnout-gauge.js';
export { buildLifeTimeline } from './builders/life-timeline.js';
export { buildGrowthRadar } from './builders/growth-radar.js';
export { buildEmotionalArcs } from './builders/emotional-arcs.js';
export { buildPredictions } from './builders/predictions.js';
export { buildRelationshipNetwork } from './builders/relationship-network.js';
export { buildOpenLoops } from './builders/open-loops.js';
export { buildEnergyRings } from './builders/energy-rings.js';

// Adapters - device detection and routing
export {
  createDeviceAdapter,
  createDeviceContext,
  detectDeviceType,
  detectPlatform,
  type DeviceAdapter,
  type DeviceAdapterOptions,
} from './adapters/device-adapter.js';

// Utils - DOM helpers (for building custom visualizations)
export {
  createElement,
  createSvgElement,
  createSvg,
  createPath,
  createCircle,
  createRect,
  createText,
  describeArc,
  createRingPath,
  setStyles,
  createFlexContainer,
  setAriaAttributes,
  createScreenReaderLabel,
  DURATION,
  EASING,
  animate,
} from './utils/dom.js';

// API - data fetching and transformation
export {
  createInsightsClient,
  createMockVisualizationData,
  type InsightsClientOptions,
  type InsightsResult,
} from './api/insights-client.js';

// Firestore - direct data access for real user data
export {
  fetchVisualizationData,
  type FirestoreFetcherOptions,
} from './api/firestore-fetcher.js';

// Native SDK exports - for iOS/Android interop
export {
  visualizationSchemas,
  nativeColorTokens,
  hexToRgb,
  toUIColorString,
  toComposeColorString,
} from './native/index.js';
