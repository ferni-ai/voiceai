/**
 * Voice Services
 *
 * Services related to voice processing, identification, and authentication.
 */

export * from './cartesia-voice-localization.js';
// Note: dynamic-voice-parameters and voice-humanization-metrics both export VoiceContext
// Import directly from specific modules if you need those types
export {
  calculateVoiceParameters,
  type VoiceParameters,
  type VoiceContext as DynamicVoiceContext,
} from './dynamic-voice-parameters.js';
export * from './voice-adaptation.js';
export * from './voice-antispoofing.js';
export * from './voice-audit-log.js';
export * from './voice-call.js';
export * from './voice-emotion-correlation.js';
export * from './voice-enrollment.js';
export * from './voice-household.js';
export {
  getTurnPredictionMetrics,
  recordTurnPrediction,
  resetMetrics,
  getDashboardData,
  getMetricsJson,
  type TurnPredictionMetrics as HumanizationTurnPredictionMetrics,
  type FeatureMetrics as HumanizationFeatureMetrics,
  type DashboardData,
} from './voice-humanization-metrics.js';
export * from './voice-identification.js';
export * from './voice-liveness.js';
export * from './voice-presence-analytics.js';
export * from './voice-profile-store.js';
export * from './voice-rate-limit.js';
export * from './voice-speaker-change.js';
