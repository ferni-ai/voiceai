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
  getGlobalMetricsSnapshot,
  getSessionMetricsContext,
  initializeSpeechMetrics,
  logMetricsSummary,
  trackBackchannelQuality,
  trackConversationTurn,
  trackEmotionDetection,
  trackSpeechLatency,
  trackSpeechOperation,
  trackTurnPrediction,
  type SpeechMetricsContext,
} from './speech-metrics-integration.js';

// Dynamic Speed Integration
export {
  applyDynamicSpeed,
  cleanupDynamicSpeed,
  getPersonaBaseSpeed,
  getSessionSpeedTrend,
  type DynamicSpeedOptions,
  type SpeedAdjustedText,
} from './dynamic-speed-integration.js';

// Re-export voice humanization integration
export {
  quickSetupVoiceHumanization,
  type IntegrationResult as VoiceHumanizationIntegration,
} from './voice-humanization-integration.js';
