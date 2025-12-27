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
export { buildBurnoutGauge } from './burnout-gauge.js';
export { buildLifeTimeline } from './life-timeline.js';
export { buildGrowthRadar } from './growth-radar.js';
export { buildEmotionalArcs } from './emotional-arcs.js';
export { buildPredictions } from './predictions.js';
export { buildRelationshipNetwork } from './relationship-network.js';
export { buildOpenLoops } from './open-loops.js';
export { buildEnergyRings } from './energy-rings.js';

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
