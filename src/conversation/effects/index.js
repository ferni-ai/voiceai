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
// Core components
export { getEffectCoordinator, resetEffectCoordinator, resetAllEffectCoordinators, } from './effect-coordinator.js';
export { getEffectTracker, resetEffectTracker, resetAllEffectTrackers } from './effect-tracker.js';
// Effect factories - Presence
export { createBreathSoundEffect } from './presence/breath-sound.effect.js';
export { createMoodSignalEffect } from './presence/mood-signal.effect.js';
export { createPhysicalPresenceEffect } from './presence/physical-presence.effect.js';
// Effect factories - Attunement
export { createFirstTurnNoticingEffect } from './attunement/first-turn-noticing.effect.js';
export { createSpontaneousThoughtEffect } from './attunement/spontaneous-thought.effect.js';
// Effect factories - Reactions
export { createExcitementInterruptionEffect } from './reactions/excitement-interruption.effect.js';
export { createLiveReactionEffect } from './reactions/live-reaction.effect.js';
export { createPlayfulnessEffect } from './reactions/playfulness.effect.js';
// Effect factories - Naturalness
export { createSpeechFillerEffect } from './naturalness/speech-filler.effect.js';
// Metrics & Observability
export { getEffectMetrics, resetEffectMetrics, effectMetrics, } from './metrics.js';
// Feature Flags
export { getEffectFeatureFlags, resetEffectFeatureFlags, configureEffectFeatureFlags, effectFlags, } from './feature-flags.js';
// Cross-Session Memory
export { getEffectMemory, resetEffectMemory, effectMemory, } from './cross-session-memory.js';
// Voice Emotion Mapping
export { getEffectMappingForEmotion, getEffectModifierForEmotion, processVoiceEmotionForEffects, voiceEmotionEffects, } from './voice-emotion-mapping.js';
// Presence effects
import { createBreathSoundEffect } from './presence/breath-sound.effect.js';
import { createMoodSignalEffect } from './presence/mood-signal.effect.js';
import { createPhysicalPresenceEffect } from './presence/physical-presence.effect.js';
// Attunement effects
import { createFirstTurnNoticingEffect } from './attunement/first-turn-noticing.effect.js';
import { createSpontaneousThoughtEffect } from './attunement/spontaneous-thought.effect.js';
// Reaction effects
import { createExcitementInterruptionEffect } from './reactions/excitement-interruption.effect.js';
import { createLiveReactionEffect } from './reactions/live-reaction.effect.js';
import { createPlayfulnessEffect } from './reactions/playfulness.effect.js';
// Naturalness effects
import { createSpeechFillerEffect } from './naturalness/speech-filler.effect.js';
/**
 * All available effect factories
 *
 * These are the 9 core humanization effects that make the agent feel alive:
 * - Presence: breath sounds, mood signals, physical presence
 * - Attunement: first turn noticing, spontaneous thoughts
 * - Reactions: excitement interruptions, live reactions, playfulness
 * - Naturalness: speech fillers
 */
const EFFECT_FACTORIES = [
    // Presence effects - Making the agent feel "alive"
    createBreathSoundEffect,
    createMoodSignalEffect,
    createPhysicalPresenceEffect,
    // Attunement effects - Reading and responding to the user
    createFirstTurnNoticingEffect,
    createSpontaneousThoughtEffect,
    // Reaction effects - Responding to user input
    createExcitementInterruptionEffect,
    createLiveReactionEffect,
    createPlayfulnessEffect,
    // Naturalness effects - Speech imperfections
    createSpeechFillerEffect,
];
/**
 * Register all default effects with a coordinator
 */
export function registerDefaultEffects(coordinator, personaId) {
    for (const factory of EFFECT_FACTORIES) {
        const effect = factory(personaId);
        coordinator.registerEffect(effect);
    }
}
/**
 * Create a coordinator with all default effects registered
 */
export async function createCoordinatorWithEffects(sessionId, personaId) {
    const { getEffectCoordinator } = await import('./effect-coordinator.js');
    const coordinator = getEffectCoordinator(sessionId, personaId);
    registerDefaultEffects(coordinator, personaId);
    return coordinator;
}
/**
 * Build an EffectContext from orchestrator input
 */
export function buildEffectContext(input, mood, signals) {
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
//# sourceMappingURL=index.js.map