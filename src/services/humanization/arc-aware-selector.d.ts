/**
 * Arc-Aware Behavior Selector
 *
 * Selects different persona behaviors based on WHERE we are in the
 * emotional arc of the conversation:
 *
 * - OPENING: Settling in, reading the room, light touches
 * - BUILDING: Going deeper, following threads, building trust
 * - PEAK: Fully present, holding space, minimal words
 * - RELEASE: Gentle landing, acknowledging what happened
 * - CLOSING: Natural wrap-up, seeds for next time
 *
 * This is what makes Ferni feel like they're TRACKING the conversation,
 * not just responding to individual messages.
 *
 * @module @ferni/arc-aware-selector
 */
import { type NarrativePhase } from '../../conversation/index.js';
/**
 * The "version" of Ferni that shows up at each phase
 */
export interface PhasePersonality {
    /** Energy level (0-1) */
    energy: number;
    /** Primary focus for this phase */
    focus: 'reading_room' | 'following_threads' | 'holding_space' | 'landing' | 'wrapping';
    /** Response length guidance */
    responseLength: 'minimal' | 'short' | 'balanced' | 'expansive';
    /** Question frequency (0-1, how likely to ask vs. reflect) */
    questionFrequency: number;
    /** Whether to surface inner world content */
    innerWorldActive: boolean;
    /** Whether stories are appropriate */
    storiesAppropriate: boolean;
    /** Silence comfort (0-1, how long to let silences sit) */
    silenceComfort: number;
    /** Voice pacing multiplier (1.0 = normal) */
    pacingMultiplier: number;
    /** Emotional mirroring strength (0-1) */
    mirroringStrength: number;
    /** Guidance for this phase */
    guidance: string[];
}
/**
 * Behavior recommendations from the arc analysis
 */
export interface ArcBehaviorRecommendation {
    phase: NarrativePhase;
    personality: PhasePersonality;
    /** Specific behaviors to enable/disable */
    behaviors: {
        useBackchannels: boolean;
        allowTangents: boolean;
        offerStories: boolean;
        askDeepQuestions: boolean;
        surfaceVulnerability: boolean;
        useInsideReferences: boolean;
        mirrorVocabulary: boolean;
    };
    /** Content suggestions */
    suggestions: {
        transitionPhrase?: string;
        innerWorldContent?: string;
        callbackOpportunity?: string;
    };
}
/**
 * Get behavior recommendation based on current arc phase
 */
export declare function getArcBehaviorRecommendation(currentTurn: number, previousPhase?: NarrativePhase, context?: {
    userEmotion?: string;
    emotionalIntensity?: number;
    topicWeight?: 'light' | 'medium' | 'heavy';
    hasActiveCallback?: boolean;
    relationshipStage?: string;
}): ArcBehaviorRecommendation;
/**
 * Get guidance text for the current phase
 */
export declare function getPhaseGuidance(phase: NarrativePhase): string[];
/**
 * Get the personality configuration for a phase
 */
export declare function getPhasePersonality(phase: NarrativePhase): PhasePersonality;
/**
 * Check if we should surface inner world content
 *
 * HUMANIZATION FIX: Increased probabilities to surface more sensory memories
 * and personal content. The rich inner world content was rarely surfacing
 * due to overly conservative probability gates.
 */
export declare function shouldSurfaceInnerWorld(phase: NarrativePhase, emotionalIntensity: number, relationshipStage: string): boolean;
/**
 * Check if stories are appropriate right now
 */
export declare function areStoriesAppropriate(phase: NarrativePhase, context: {
    userEmotion?: string;
    emotionalIntensity?: number;
    turnsSinceLastStory?: number;
}): boolean;
/**
 * Get recommended response length for current phase
 */
export declare function getRecommendedResponseLength(phase: NarrativePhase, userMessageLength: number): {
    minWords: number;
    maxWords: number;
};
export declare const arcAwareSelector: {
    getRecommendation: typeof getArcBehaviorRecommendation;
    getGuidance: typeof getPhaseGuidance;
    getPersonality: typeof getPhasePersonality;
    shouldSurfaceInnerWorld: typeof shouldSurfaceInnerWorld;
    areStoriesAppropriate: typeof areStoriesAppropriate;
    getRecommendedResponseLength: typeof getRecommendedResponseLength;
};
export default arcAwareSelector;
//# sourceMappingURL=arc-aware-selector.d.ts.map