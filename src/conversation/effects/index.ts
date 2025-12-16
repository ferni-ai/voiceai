/**
 * Humanization Effects System
 *
 * A composable effect pattern for conversation humanization.
 * Each effect is a self-contained unit that can:
 * - Decide if it should apply based on context
 * - Generate content to inject into the response
 * - Track its own cooldowns and session limits
 *
 * Usage:
 * ```typescript
 * import {
 *   getEffectCoordinator,
 *   registerDefaultEffects,
 * } from '../conversation/effects/index.js';
 *
 * // At session start
 * const coordinator = getEffectCoordinator(sessionId, personaId);
 * registerDefaultEffects(coordinator, personaId);
 *
 * // For each turn
 * const context = buildEffectContext(input, analysis, mood);
 * const applicable = coordinator.getApplicableEffects(context);
 * const result = await coordinator.applyEffects(text, ssml, applicable, context);
 * ```
 *
 * @module @ferni/conversation/effects
 */

// Types
export type {
  AppliedEffect,
  EffectApplicationResult,
  EffectConfig,
  EffectContext,
  EffectCoordinator,
  EffectResult,
  EffectTracker,
  HumanizationCapability,
  HumanizationEffect,
  SkippedEffect,
  DetectedSignals,
  SessionData,
  EffectPlacement,
} from './types.js';

// Core components
export {
  getEffectCoordinator,
  resetEffectCoordinator,
  resetAllEffectCoordinators,
} from './effect-coordinator.js';

export { getEffectTracker, resetEffectTracker, resetAllEffectTrackers } from './effect-tracker.js';

// Effect factories
export { createBreathSoundEffect } from './presence/breath-sound.effect.js';
export { createFirstTurnNoticingEffect } from './attunement/first-turn-noticing.effect.js';
export { createExcitementInterruptionEffect } from './reactions/excitement-interruption.effect.js';
export { createSpeechFillerEffect } from './naturalness/speech-filler.effect.js';

// Metrics & Observability
export {
  getEffectMetrics,
  resetEffectMetrics,
  effectMetrics,
  type EffectMetricEvent,
  type EffectMetricsSummary,
} from './metrics.js';

// Feature Flags
export {
  getEffectFeatureFlags,
  resetEffectFeatureFlags,
  configureEffectFeatureFlags,
  effectFlags,
  type EffectFeatureConfig,
} from './feature-flags.js';

// Cross-Session Memory
export {
  getEffectMemory,
  resetEffectMemory,
  effectMemory,
  type UserEffectProfile,
  type EffectEngagement,
  type EffectResponse,
} from './cross-session-memory.js';

// Voice Emotion Mapping
export {
  getEffectMappingForEmotion,
  getEffectModifierForEmotion,
  processVoiceEmotionForEffects,
  voiceEmotionEffects,
  type VoiceEmotion,
  type VoiceEmotionSignal,
  type EffectRecommendation,
  type EmotionEffectMapping,
} from './voice-emotion-mapping.js';

// ============================================================================
// DEFAULT EFFECT REGISTRATION
// ============================================================================

import type { EffectCoordinator, HumanizationEffect } from './types.js';
import { createBreathSoundEffect } from './presence/breath-sound.effect.js';
import { createFirstTurnNoticingEffect } from './attunement/first-turn-noticing.effect.js';
import { createExcitementInterruptionEffect } from './reactions/excitement-interruption.effect.js';
import { createSpeechFillerEffect } from './naturalness/speech-filler.effect.js';

/**
 * All available effect factories
 */
const EFFECT_FACTORIES: Array<(personaId: string) => HumanizationEffect> = [
  // Presence effects
  createBreathSoundEffect,

  // Attunement effects
  createFirstTurnNoticingEffect,

  // Reaction effects
  createExcitementInterruptionEffect,

  // Naturalness effects
  createSpeechFillerEffect,
];

/**
 * Register all default effects with a coordinator
 */
export function registerDefaultEffects(coordinator: EffectCoordinator, personaId: string): void {
  for (const factory of EFFECT_FACTORIES) {
    const effect = factory(personaId);
    coordinator.registerEffect(effect);
  }
}

/**
 * Create a coordinator with all default effects registered
 */
export function createCoordinatorWithEffects(
  sessionId: string,
  personaId: string
): EffectCoordinator {
  const { getEffectCoordinator } = require('./effect-coordinator.js');
  const coordinator = getEffectCoordinator(sessionId, personaId);
  registerDefaultEffects(coordinator, personaId);
  return coordinator;
}

// ============================================================================
// CONTEXT BUILDER HELPER
// ============================================================================

import type { ConversationMood } from '../deep-humanization.js';

/**
 * Build an EffectContext from orchestrator input
 */
export function buildEffectContext(
  input: {
    personaId: string;
    sessionId: string;
    userId?: string;
    turnNumber: number;
    sessionMinutes: number;
    userMessage: string;
    rawResponse: string;
    userEmotion?: string;
    topic?: string;
    wasPersonalSharing?: boolean;
    isSeriousContext?: boolean;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    sessionData?: Record<string, unknown>;
  },
  mood: ConversationMood,
  signals: {
    hasEvidence?: boolean;
    isBreakthrough?: boolean;
    hasHesitation?: boolean;
    isDisengaged?: boolean;
    isHighlyEngaged?: boolean;
    isEmotional?: boolean;
    isHeavy?: boolean;
  }
): import('./types.js').EffectContext {
  return {
    personaId: input.personaId,
    sessionId: input.sessionId,
    userId: input.userId,
    turnNumber: input.turnNumber,
    sessionMinutes: input.sessionMinutes,
    userMessage: input.userMessage,
    rawResponse: input.rawResponse,
    userEmotion: input.userEmotion,
    topic: input.topic,
    wasPersonalSharing: input.wasPersonalSharing,
    isSeriousContext: input.isSeriousContext,
    mood,
    signals: {
      hasEvidence: signals.hasEvidence ?? false,
      isBreakthrough: signals.isBreakthrough ?? false,
      hasHesitation: signals.hasHesitation ?? false,
      isDisengaged: signals.isDisengaged ?? false,
      isHighlyEngaged: signals.isHighlyEngaged ?? false,
      isEmotional: signals.isEmotional ?? false,
      isHeavy: signals.isHeavy ?? false,
      isFirstTurn: input.turnNumber <= 1,
    },
    relationshipStage: input.relationshipStage ?? 'acquaintance',
    sessionData: input.sessionData,
  };
}
