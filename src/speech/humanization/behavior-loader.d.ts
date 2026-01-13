/**
 * Speech Behavior Loader
 *
 * Unified loader for persona speech behaviors from JSON files.
 * Provides cached, typed access to speech imperfections, thinking sounds,
 * backchannels, and breath sounds.
 *
 * Part of the "Better Than Human" speech humanization system.
 *
 * @module speech/humanization/behavior-loader
 */
import type { PersonaSpeechProfile, ImperfectionCategory, BehaviorSelectionContext, SelectedBehavior, InjectionConfig } from './types.js';
/**
 * Load complete speech profile for a persona
 */
export declare function loadSpeechProfile(personaId: string): Promise<PersonaSpeechProfile>;
/**
 * Clear cache for a persona (useful for testing/hot reload)
 */
export declare function clearSpeechProfileCache(personaId?: string): void;
/**
 * Select an imperfection phrase based on context
 */
export declare function selectImperfection(personaId: string, category: ImperfectionCategory, context: BehaviorSelectionContext): Promise<SelectedBehavior | null>;
/**
 * Select a thinking sound based on context
 */
export declare function selectThinkingSound(personaId: string, context: BehaviorSelectionContext): Promise<SelectedBehavior | null>;
/**
 * Select a backchannel based on context
 */
export declare function selectBackchannel(personaId: string, context: BehaviorSelectionContext): Promise<SelectedBehavior | null>;
/**
 * Get injection config for a persona
 */
export declare function getInjectionConfig(personaId: string): InjectionConfig;
/**
 * Preload speech profiles for all known personas
 */
export declare function preloadAllSpeechProfiles(): Promise<void>;
/**
 * Get cached speech profile synchronously.
 * Returns null if profile hasn't been preloaded.
 * Call preloadAllSpeechProfiles() at startup to enable sync access.
 */
export declare function getSpeechProfileSync(personaId: string): PersonaSpeechProfile | null;
/**
 * Check if speech profiles have been preloaded
 */
export declare function areSpeechProfilesPreloaded(): boolean;
/**
 * Select a thinking sound synchronously (uses cached profile)
 */
export declare function selectThinkingSoundSync(personaId: string, context: BehaviorSelectionContext): SelectedBehavior | null;
/**
 * Select an imperfection synchronously (uses cached profile)
 */
export declare function selectImperfectionSync(personaId: string, category: ImperfectionCategory, context: BehaviorSelectionContext): SelectedBehavior | null;
/**
 * Select a breath sound based on context (async)
 */
export declare function selectBreathSound(personaId: string, context: BehaviorSelectionContext): Promise<SelectedBehavior | null>;
/**
 * Select a breath sound synchronously (uses cached profile)
 */
export declare function selectBreathSoundSync(personaId: string, context: BehaviorSelectionContext): SelectedBehavior | null;
/**
 * Select a laughter response when user laughs
 */
export declare function selectLaughterResponse(personaId: string, context: BehaviorSelectionContext & {
    userLaughed?: boolean;
}): Promise<SelectedBehavior | null>;
/**
 * Select a laughter response synchronously
 */
export declare function selectLaughterResponseSync(personaId: string, context: BehaviorSelectionContext & {
    userLaughed?: boolean;
}): SelectedBehavior | null;
/**
 * Check if it's late night hours
 */
export declare function isLateNightHours(): boolean;
/**
 * Get late night pacing adjustments for a persona
 */
export declare function getLateNightPacing(personaId: string): {
    speedMultiplier: number;
    pauseMultiplier: number;
    energyReduction: number;
} | null;
/**
 * Get a late night greeting for a persona
 */
export declare function getLateNightGreeting(personaId: string, seed?: string): string | null;
export type EnergyLevel = 'very_low' | 'low' | 'neutral' | 'elevated' | 'high';
/**
 * Get energy-matched pacing adjustments
 */
export declare function getEnergyMatchedPacing(personaId: string, userEnergyLevel: EnergyLevel): {
    speedMultiplier: number;
    pauseMultiplier: number;
    energyReduction: number;
    phrase: string | null;
} | null;
/**
 * Check if a callback phrase should be used based on conversation history
 */
export declare function shouldUseCallback(personaId: string, callbackId: string, conversationCount: number): {
    shouldUse: boolean;
    phrase: string | null;
};
/**
 * Celebration intensity levels
 */
export type CelebrationIntensity = 'small' | 'big' | 'growth' | 'effort' | 'quiet' | 'courage' | 'consistency';
/**
 * Detect what type of celebration is appropriate
 */
export declare function detectCelebrationIntensity(userText: string): CelebrationIntensity | null;
/**
 * Select a celebration phrase based on intensity
 */
export declare function selectCelebration(personaId: string, intensity: CelebrationIntensity, seed?: string): SelectedBehavior | null;
/**
 * Sync version of celebration selection
 */
export declare function selectCelebrationSync(personaId: string, context: BehaviorSelectionContext): SelectedBehavior | null;
/**
 * Catchphrase trigger patterns
 * Maps trigger keywords to regex patterns for detection
 */
export declare const CATCHPHRASE_TRIGGERS: Record<string, RegExp[]>;
/**
 * Select a signature catchphrase based on context
 * RARE - should only fire on perfect trigger moments
 */
export declare function selectCatchphrase(personaId: string, userText: string, conversationCount: number, usedThisSession?: Set<string>): {
    phrase: string;
    delivery: string;
    id: string;
} | null;
/**
 * Get a powerful question from the persona (more freely used)
 */
export declare function getPowerfulQuestion(personaId: string, seed?: string): string | null;
/**
 * Get a partnership phrase from the persona
 */
export declare function getPartnershipPhrase(personaId: string, seed?: string): string | null;
export type AnticipationType = 'opening_warmth' | 'between_sessions' | 'returning_after_time' | 'topic_callback' | 'future_looking' | 'growth_reference' | 'journey_acknowledgment';
/**
 * Get an opening anticipation phrase for a returning user
 */
export declare function getSessionOpeningPhrase(personaId: string, context?: {
    daysSinceLastSession?: number;
    isFirstSession?: boolean;
}, seed?: string): string | null;
/**
 * Get a topic callback phrase with {topic} placeholder
 */
export declare function getTopicCallbackPhrase(personaId: string, seed?: string): string | null;
/**
 * Get a future-looking phrase (curiosity, seeds, or hope)
 */
export declare function getFutureLookingPhrase(personaId: string, type?: 'curiosity' | 'seeds' | 'hope', seed?: string): string | null;
/**
 * Get a continuity marker phrase (growth reference or journey acknowledgment)
 */
export declare function getContinuityMarker(personaId: string, type?: 'growth' | 'journey', seed?: string): string | null;
/**
 * Get a pending item follow-up phrase with placeholder
 */
export declare function getPendingItemPhrase(personaId: string, type?: 'goal' | 'person' | 'decision', seed?: string): string | null;
//# sourceMappingURL=behavior-loader.d.ts.map