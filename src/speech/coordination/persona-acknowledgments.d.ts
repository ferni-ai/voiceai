/**
 * Persona-Aware Acknowledgments
 *
 * Intelligent acknowledgment generation based on:
 * - Active persona's voice/personality
 * - Tool context (what we're about to do)
 * - User preferences (learned over time)
 * - Timing context (response time estimate)
 *
 * NO HARDCODED PHRASES - all loaded from persona bundles or learned.
 *
 * @module speech/coordination/persona-acknowledgments
 */
/** Acknowledgment category */
export type AcknowledgmentCategory = 'thinking' | 'searching' | 'calculating' | 'creating' | 'connecting' | 'remembering';
/** Tool-to-category mapping */
export type ToolCategoryMap = Record<string, AcknowledgmentCategory>;
/** Persona acknowledgment set */
export interface PersonaAcknowledgments {
    personaId: string;
    /** Phrases by category */
    phrases: Record<AcknowledgmentCategory, string[]>;
    /** Filler sounds (uh, hmm, let me think) */
    fillers: string[];
    /** Natural pauses ("..." becomes natural pause in TTS) */
    pauseMarker: string;
}
/** User preference learning */
export interface UserAcknowledgmentPreferences {
    userId: string;
    /** Categories user responds well to */
    preferredCategories: AcknowledgmentCategory[];
    /** Specific phrases user has responded positively to */
    preferredPhrases: string[];
    /** Phrases user has seemed annoyed by */
    dislikedPhrases: string[];
    /** Whether user prefers shorter or longer acks */
    lengthPreference: 'short' | 'medium' | 'long';
    /** Sample count for confidence */
    sampleCount: number;
}
/** Context for generating acknowledgment */
export interface AcknowledgmentContext {
    personaId: string;
    userId?: string;
    toolId?: string;
    toolCategory?: AcknowledgmentCategory;
    estimatedWaitMs?: number;
    isFirstAck?: boolean;
    previousAck?: string;
}
declare const DEFAULT_ACKNOWLEDGMENTS: Record<string, PersonaAcknowledgments>;
declare const TOOL_CATEGORIES: ToolCategoryMap;
/**
 * Load user preferences from persistence (call on session start).
 */
export declare function loadUserAcknowledgmentPreferences(userId: string): Promise<void>;
/**
 * Learn from user response to acknowledgment
 */
export declare function recordAcknowledgmentFeedback(userId: string, phrase: string, category: AcknowledgmentCategory, wasPositive: boolean): void;
/**
 * Generate persona-appropriate acknowledgment.
 * INTELLIGENT: No hardcoded phrases, learns from user preferences.
 */
export declare function generateAcknowledgment(context: AcknowledgmentContext): string;
/**
 * Get tool category from tool ID
 */
export declare function getToolCategory(toolId?: string): AcknowledgmentCategory;
/**
 * Preload persona bundle acknowledgments (call on session start)
 */
export declare function preloadPersonaAcknowledgments(personaId: string): Promise<void>;
export { DEFAULT_ACKNOWLEDGMENTS, TOOL_CATEGORIES };
/**
 * Should we even generate an acknowledgment?
 * INTELLIGENT: Based on estimated wait time and user preferences.
 */
export declare function shouldAcknowledge(estimatedWaitMs: number, userId?: string): boolean;
//# sourceMappingURL=persona-acknowledgments.d.ts.map