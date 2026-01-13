/**
 * Speech Humanizer
 *
 * Main orchestrator for "Better Than Human" speech humanization.
 * Injects persona-specific speech imperfections, thinking sounds,
 * and other human behaviors into agent responses.
 *
 * This is the single entry point called by response-processor.ts.
 *
 * @module speech/humanization/speech-humanizer
 */
import type { BehaviorSelectionContext, HumanizedSpeechResult, ImperfectionCategory } from './types.js';
/**
 * Apply human speech behaviors to an agent response
 *
 * This is the main entry point for the speech humanization system.
 * It loads persona-specific behaviors from JSON files and injects
 * them probabilistically based on context.
 *
 * @param text - The agent's response text
 * @param context - Selection context (persona, emotion, content)
 * @returns Humanized text with applied behaviors
 */
export declare function humanizeSpeech(text: string, context: BehaviorSelectionContext): Promise<HumanizedSpeechResult>;
/**
 * Quick humanization with minimal context
 *
 * Use this when you don't have full context available.
 * Provides reasonable defaults.
 */
export declare function quickHumanize(text: string, personaId: string, turnNumber?: number): Promise<string>;
/**
 * Synchronous humanization for use in sync code paths.
 *
 * IMPORTANT: Call preloadAllSpeechProfiles() at startup to enable sync access.
 * If profiles aren't preloaded, this returns the text unchanged.
 *
 * This is optimized for the persona-fingerprints sync pipeline.
 */
export declare function quickHumanizeSync(text: string, personaId: string, context?: {
    emotion?: string;
    isQuestion?: boolean;
    isCelebration?: boolean;
    isComforting?: boolean;
    turnNumber?: number;
    randomSeed?: string;
    /** User's original message (for callback detection) */
    userText?: string;
    /** Total conversation count with this user */
    conversationCount?: number;
}): string;
/**
 * Get all available imperfection categories for a persona
 */
export declare function getAvailableCategories(personaId: string): Promise<ImperfectionCategory[]>;
export { loadSpeechProfile, clearSpeechProfileCache, preloadAllSpeechProfiles, } from './behavior-loader.js';
export type { BehaviorSelectionContext, SelectedBehavior, HumanizedSpeechResult, ImperfectionCategory, PersonaSpeechProfile, } from './types.js';
//# sourceMappingURL=speech-humanizer.d.ts.map