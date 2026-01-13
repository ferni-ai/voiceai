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
export type { AppliedEffect, EffectApplicationResult, EffectConfig, EffectContext, EffectCoordinator, EffectResult, EffectTracker, HumanizationCapability, HumanizationEffect, SkippedEffect, DetectedSignals, SessionData, EffectPlacement, } from './types.js';
export { getEffectCoordinator, resetEffectCoordinator, resetAllEffectCoordinators, } from './effect-coordinator.js';
export { getEffectTracker, resetEffectTracker, resetAllEffectTrackers } from './effect-tracker.js';
export { createBreathSoundEffect } from './presence/breath-sound.effect.js';
export { createMoodSignalEffect } from './presence/mood-signal.effect.js';
export { createPhysicalPresenceEffect } from './presence/physical-presence.effect.js';
export { createFirstTurnNoticingEffect } from './attunement/first-turn-noticing.effect.js';
export { createSpontaneousThoughtEffect } from './attunement/spontaneous-thought.effect.js';
export { createExcitementInterruptionEffect } from './reactions/excitement-interruption.effect.js';
export { createLiveReactionEffect } from './reactions/live-reaction.effect.js';
export { createPlayfulnessEffect } from './reactions/playfulness.effect.js';
export { createSpeechFillerEffect } from './naturalness/speech-filler.effect.js';
export { getEffectMetrics, resetEffectMetrics, effectMetrics, type EffectMetricEvent, type EffectMetricsSummary, } from './metrics.js';
export { getEffectFeatureFlags, resetEffectFeatureFlags, configureEffectFeatureFlags, effectFlags, type EffectFeatureConfig, } from './feature-flags.js';
export { getEffectMemory, resetEffectMemory, effectMemory, type UserEffectProfile, type EffectEngagement, type EffectResponse, } from './cross-session-memory.js';
export { getEffectMappingForEmotion, getEffectModifierForEmotion, processVoiceEmotionForEffects, voiceEmotionEffects, type VoiceEmotion, type VoiceEmotionSignal, type EffectRecommendation, type EmotionEffectMapping, } from './voice-emotion-mapping.js';
import type { EffectCoordinator } from './types.js';
/**
 * Register all default effects with a coordinator
 */
export declare function registerDefaultEffects(coordinator: EffectCoordinator, personaId: string): void;
/**
 * Create a coordinator with all default effects registered
 */
export declare function createCoordinatorWithEffects(sessionId: string, personaId: string): Promise<EffectCoordinator>;
import type { ConversationMood } from '../deep-humanization/types.js';
/**
 * Build an EffectContext from orchestrator input
 */
export declare function buildEffectContext(input: {
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
}, mood: ConversationMood, signals: {
    hasEvidence?: boolean;
    isBreakthrough?: boolean;
    hasHesitation?: boolean;
    isDisengaged?: boolean;
    isHighlyEngaged?: boolean;
    isEmotional?: boolean;
    isHeavy?: boolean;
}): import('./types.js').EffectContext;
//# sourceMappingURL=index.d.ts.map