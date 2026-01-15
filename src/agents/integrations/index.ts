/**
 * Voice Agent Integrations
 *
 * Modules for integrating advanced speech features into the voice agent.
 *
 * @module agents/integrations
 */

// Speech Metrics Integration
export {
  checkQualityAlerts,
  finalizeSpeechMetrics,
  getActiveAlerts,
  getAlertHistory,
  getAllPersonaMetrics,
  getDashboardData,
  getDashboardDataWithAlerts,
  getGlobalMetricsSnapshot,
  getPersonaMetrics,
  getQualityThresholds,
  getSessionMetricsContext,
  initializeSpeechMetrics,
  logMetricsSummary,
  setQualityThresholds,
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
  type AlertSeverity,
  type BackchannelEvent,
  type PersonaMetrics,
  type QualityAlert,
  type QualityThresholds,
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

// Predictive Intelligence Integration
export {
  initializePredictiveIntelligence,
  cleanupPredictiveIntelligence,
  processForPredictiveIntelligence,
  getPredictiveContextForTurn,
  predictiveIntelligence,
  type TurnObservation,
  type PredictiveIntelligenceResult,
} from './predictive-intelligence-integration.js';

// Speech Orchestrator Integration
export {
  enableSpeechOrchestrator,
  disableSpeechOrchestrator,
  isOrchestratorEnabled,
  initializeSpeechOrchestrator,
  cleanupSpeechOrchestrator,
  humanizeWithOrchestrator,
  processAnticipation,
  getMicroReaction,
  getBackchannelDecision,
  signalNewTurn,
  type OrchestratorHumanizeContext,
  type OrchestratorResult,
  type AnticipationInput,
} from './speech-orchestrator-integration.js';

// Live Backchanneling Integration
export {
  initializeLiveBackchanneling,
  type LiveBackchannelConfig,
  type LiveBackchannelState,
  type LiveBackchannelIntegration,
} from './live-backchanneling-integration.js';

// Voice-Memory Integration (Phase 11: Better Than Human)
export {
  recordVoiceContext,
  getVoiceContext,
  clearVoiceContext,
  calculateEmotionalWeight,
  calculateRetrievalBoost,
  applyRetrievalBoost,
  adaptMemoryDelivery,
  cleanupVoiceMemorySession,
  getVoiceMemoryStats,
  setVoiceMemoryConfig,
  getVoiceMemoryConfig,
  type VoiceContext,
  type EmotionalMemoryWeight,
  type VoiceRetrievalBoost,
  type VoiceMemoryConfig,
} from './voice-memory-integration.js';
