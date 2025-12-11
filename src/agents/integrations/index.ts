/**
 * Voice Agent Integrations
 *
 * Modules for integrating advanced speech features into the voice agent.
 *
 * @module agents/integrations
 */

// Speech Metrics Integration
export {
  finalizeSpeechMetrics,
  getAllPersonaMetrics,
  getDashboardData,
  getGlobalMetricsSnapshot,
  getPersonaMetrics,
  getSessionMetricsContext,
  initializeSpeechMetrics,
  logMetricsSummary,
  trackBackchannelEvent,
  trackBackchannelQuality,
  trackConversationTurn,
  trackEmotionDetection,
  trackResponseLatency,
  trackSpeechLatency,
  trackSpeechOperation,
  trackTurnPrediction,
  trackTurnPredictionEvent,
  validateTurnPrediction,
  type BackchannelEvent,
  type PersonaMetrics,
  type SessionSummary,
  type SpeechMetricsContext,
  type TurnPredictionEvent,
} from './speech-metrics-integration.js';

// Dynamic Speed Integration
export {
  applyDynamicSpeed,
  calculatePersonaAdjustedSpeed,
  cleanupDynamicSpeed,
  getPersonaBaseSpeed,
  getPersonaSpeedProfile,
  getSessionSpeedTrend,
  type DynamicSpeedOptions,
  type PersonaSpeedProfile,
  type SpeedAdjustedText,
} from './dynamic-speed-integration.js';

// Re-export voice humanization integration
export {
  quickSetupVoiceHumanization,
  type IntegrationResult as VoiceHumanizationIntegration,
} from './voice-humanization-integration.js';
