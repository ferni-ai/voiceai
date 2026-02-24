/**
 * Injection Builders — Barrel Export
 *
 * Re-exports all builders and types for backward compatibility.
 * Consumers can import from this directory path exactly as before.
 */

// ── Types ───────────────────────────────────────────────────────────────
export type {
  InjectionBuilderContext,
  ScientificCoachingInjectionResult,
  TrustSystemsResult,
  ConversationDynamicsResult,
  HumanLevelFeaturesContext,
  DeepHumanInjectionContext,
  DeepHumanInjectionResult,
  AdvancedHumanizationInjectionContext,
  AdvancedHumanizationInjectionResult,
  EmotionalJourneyContext,
  EmotionalJourneyResult,
  BoundaryCheckContext,
  SemanticIntelligenceInjectionResult,
  PersonaSpecificContextInput,
  ContextBuilderInjection,
  PersonaContextBuilder,
} from './types.js';

// ── Cache ───────────────────────────────────────────────────────────────
export {
  clearNonVolatileInjectionCache,
  getNonVolatileInjectionCacheStats,
} from './cache.js';

// ── Safety & Coaching (Priority 65-99) ──────────────────────────────────
export {
  buildSafetyInjections,
  buildScientificCoachingInjections,
  buildLifeCoachingInjections,
} from './safety-coaching-builders.js';

// ── Trust Systems (Priority 64-90) ──────────────────────────────────────
export { buildTrustSystemsInjections } from './trust-builders.js';

// ── Conversation Dynamics & Human-Level (Priority 35-52) ────────────────
export {
  buildConversationDynamicsInjections,
  buildHumanLevelInjections,
} from './conversation-builders.js';

// ── Deep Human System & Emotional Journey (Priority 50-70) ──────────────
export {
  buildDeepHumanInjections,
  buildEmotionalJourneyInjections,
} from './deep-human-builders.js';

// ── Advanced Humanization & Cross-Persona (Priority 25-55) ──────────────
export {
  buildCrossPersonaInsightsInjection,
  buildAdvancedHumanizationInjections,
  initAdvancedHumanizationSession,
  cleanupAdvancedHumanizationSession,
  recordAdviceGivenToSession,
} from './humanization-builders.js';

// ── Better Than Human (Priority 72-91) ──────────────────────────────────
export {
  buildAmbientAwarenessInjections,
  buildBoundaryCheckInjections,
  buildHealthAwarenessInjections,
  buildUserHealthInjection,
  buildVisualMemoryInjections,
  buildAmbientModeInjections,
  buildHumanTransferInjections,
  buildCrisisHistoryInjection,
} from './better-than-human-builders.js';

// ── Intelligence & Tools (Priority 75-90) ───────────────────────────────
export {
  buildSessionDynamicsInjection,
  buildSemanticIntelligenceInjection,
  buildFunctionCallingReinforcement,
  buildPersonaSpecificContextInjections,
  buildToolHistoryInjection,
  buildServiceAvailabilityInjection,
} from './intelligence-builders.js';
