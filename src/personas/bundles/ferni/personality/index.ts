/**
 * Ferni "Better Than Human" Personality System
 *
 * Unified exports for the personality system.
 *
 * @example
 * ```typescript
 * import { ferniPersonality } from '../personas/bundles/ferni/personality';
 *
 * // In turn processing:
 * const result = await ferniPersonality.processTurn({
 *   sessionId,
 *   userId,
 *   turnCount,
 *   userTranscript: message,
 *   voiceEmotion,
 *   textEmotion: analysis.emotion,
 *   momentum,
 *   topics: analysis.topics,
 *   relationshipStage,
 * });
 *
 * if (result.shouldInject) {
 *   response = ferniPersonality.applyToResponse(response, result);
 * }
 * ```
 *
 * @module personas/bundles/ferni/personality
 */

// Main integration
export {
  ferniPersonality,
  processTurnPersonality,
  applyPersonalityToResponse,
  cleanupPersonalitySession,
  prewarmPersonalitySession,
  type PersonalityTurnInput,
  type PersonalityTurnResult,
} from '../personality-integration.js';

// Expression composition
export {
  composeExpression,
  composeRealtimeNoticing,
  composeTemporalExpression,
  composeConnectionCallback,
  betterThanHumanPersonality,
  type ComposedExpression,
  type PersonalityContext,
  type UserResonanceProfile,
} from '../better-than-human-personality.js';

// Context assembly
export {
  assemblePersonalityContext,
  personalityContextAssembler,
  type ContextAssemblerInput,
} from '../personality-context-assembler.js';

// Real-time noticing
export {
  detectNoticing,
  shouldThrottleNoticing,
  recordNoticing,
  clearNoticingState,
  realtimeNoticing,
  type NoticingInput,
  type NoticingResult,
} from '../realtime-noticing.js';

// Re-export NoticingType separately since it's a type-only export
export type { NoticingType } from '../realtime-noticing.js';

// Cross-session resonance learning
export {
  loadResonanceProfile,
  recordResonanceEvent,
  recordUserTopicMention,
  recordVulnerabilityResponse,
  detectEngagement,
  personalityResonanceStore,
} from '../personality-resonance-store.js';

// LLM-powered expression generation (async, non-blocking)
export {
  getBestExpression,
  requestExpression,
  prewarmCache,
  requestEmotionalExpressions,
  getGeneratedExpression,
  getStats as getLLMExpressionStats,
  clearCache as clearLLMExpressionCache,
  clearGlobalCache as clearGlobalLLMExpressionCache,
  markExpressionEngagement,
  loadPersistedExpressions,
  flushExpressions,
  type ExpressionContext,
  type GeneratedExpression,
} from '../llm-expression-generator.js';

// Legacy pool-based system (for backward compatibility)
export {
  getExpression,
  getRandomExpression,
  getCaughtDoingMoment,
  getSensoryMoment,
  getMusicMention,
  getTravelerReference,
  getVulnerabilityMoment,
  recordTurnComplete,
  getVarietyStats,
  clearSessionVariety,
  type DynamicExpressionResult,
} from '../dynamic-personality.js';

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Telemetry & Transparency
// ═══════════════════════════════════════════════════════════════════════════
export {
  personalityTelemetry,
  startTiming,
  recordTelemetry,
  getSessionMetrics,
  getRecentSnapshots,
  getAllSessionsSummary,
  formatMetricsReport,
  clearSessionMetrics,
  type TelemetrySnapshot,
  type PerformanceMetrics,
} from '../personality-telemetry.js';

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Voice Emotion Integration
// ═══════════════════════════════════════════════════════════════════════════
export {
  voiceEmotionPersonality,
  getVoiceEmotionAdjustment,
  isThemePreferredForVoice,
  shouldAvoidThemeForVoice,
  fromVoiceEmotionResult,
  type VoicePersonalityAdjustment,
  type VoiceEmotionContext,
} from '../voice-emotion-personality.js';

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Memory Callbacks
// ═══════════════════════════════════════════════════════════════════════════
export {
  memoryPersonalityBridge,
  createCallbackFromInsight,
  createDateCallback,
  createAbsenceCallback,
  createGrowthCallback,
  createComfortCallback,
  type MemoryCallback,
  type MemoryPersonalityContext,
} from '../memory-personality-bridge.js';

// Default export
export { ferniPersonality as default } from '../personality-integration.js';

