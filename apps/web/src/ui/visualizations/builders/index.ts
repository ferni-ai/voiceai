/**
 * Visualization Builders Index
 *
 * Re-exports all visualization builders for easy importing.
 * Each builder follows the same signature:
 *   (container: HTMLElement, data: T, context: DeviceContext) => VisualizationResult
 *
 * @module visualizations/builders
 */

export { buildMoodCalendar } from './mood-calendar.js';
export type { SmallMultiplesConfig } from './mood-calendar.js';
export { buildBurnoutGauge } from './burnout-gauge.js';
export { buildLifeTimeline } from './life-timeline.js';
export { buildGrowthRadar } from './growth-radar.js';
export { buildEmotionalArcs } from './emotional-arcs.js';
export { buildPredictions } from './predictions.js';
export { buildRelationshipNetwork } from './relationship-network.js';
export { buildOpenLoops } from './open-loops.js';
export { buildEnergyRings } from './energy-rings.js';
export { buildSparklineLifeline } from './sparkline-lifeline.js';
export { buildMicroTrend, injectMicroTrendStyles } from './micro-trend.js';

// Phase 1: Superhuman capability visualizations
export { buildEnergyWave } from './energy-wave.js';
export type { EnergyWaveData } from './energy-wave.js';
export { buildSocialBattery } from './social-battery.js';
export type { SocialBatteryData } from './social-battery.js';
export { buildCelebrationWheel } from './celebration-wheel.js';
export type { CelebrationWheelData } from './celebration-wheel.js';

// Data-ink optimization utilities (Tufte principles)
export {
  analyzeDataInk,
  optimizeSvg,
  generateMinimalCss,
  calculateLieFactor,
  isDistorted,
  getLieFactorSeverity,
  TUFTE_STRICT,
  RELAXED_CONFIG,
  TUFTE_CHECKLIST,
} from './data-ink-optimizer.js';

// Re-export types for convenience
export type {
  MoodCalendarData,
  BurnoutGaugeData,
  LifeTimelineData,
  GrowthRadarData,
  EmotionalArcsData,
  PredictionsData,
  RelationshipNetworkData,
  OpenLoopsData,
  EnergyRingsData,
  DeviceContext,
  VisualizationResult,
} from '../types.js';

// Sparkline types
export type {
  SparklinePoint,
  SparklineData,
  SparklineOptions,
} from './sparkline-lifeline.js';

// Micro-trend types
export type {
  MicroTrendData,
  MicroTrendOptions,
  MicroTrendStyle,
  TrendDirection,
  TrendMagnitude,
} from './micro-trend.js';

// Data-ink optimizer types
export type {
  DataInkAnalysis,
  DataInkIssue,
  DataInkIssueType,
  DataInkSuggestion,
  DataInkConfig,
} from './data-ink-optimizer.js';
