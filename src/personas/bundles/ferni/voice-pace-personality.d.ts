/**
 * Voice Pace → Personality Integration
 *
 * Adapts personality expressions based on the user's speaking pace and rhythm.
 *
 * Fast talker → Match energy, shorter expressions, quicker injections
 * Slow talker → More deliberate, longer pauses, deeper expressions
 * Rushed → Be efficient, validate their time pressure
 * Relaxed → Take time, add more texture
 *
 * @module personas/bundles/ferni/voice-pace-personality
 */
import type { PaceCategory, EnergyLevel, ConversationTempo, LearnedPacePreferences } from '../../../intelligence/voice-pace-adapter.js';
export interface PacePersonalityAdjustment {
    /** Prefer shorter or longer expressions */
    expressionLength: 'brief' | 'normal' | 'detailed';
    /** Add more or fewer pauses in SSML */
    pauseMultiplier: number;
    /** Preferred injection timing */
    preferredTiming: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';
    /** Whether to include more texture/detail */
    includeTexture: boolean;
    /** Energy level to match */
    targetEnergy: 'low' | 'medium' | 'high';
    /** Should we validate time pressure? */
    acknowledgeRush: boolean;
    /** Maximum expression word count */
    maxExpressionWords: number;
    /** Reason for adjustment */
    reason: string;
}
export interface CurrentPaceContext {
    /** Current speech rate in WPM */
    currentWPM?: number;
    /** Current pace category */
    paceCategory?: PaceCategory;
    /** Current energy level */
    energyLevel?: EnergyLevel;
    /** Current tempo */
    tempo?: ConversationTempo;
    /** Is user rushed right now? */
    seemsRushed?: boolean;
    /** Is user relaxed right now? */
    seemsRelaxed?: boolean;
    /** Time since last user message (ms) */
    responseLatencyMs?: number;
    /** Did user interrupt? */
    wasInterruption?: boolean;
}
/**
 * Get personality adjustment based on voice pace
 */
export declare function getPacePersonalityAdjustment(paceContext: CurrentPaceContext, learnedPreferences?: LearnedPacePreferences): PacePersonalityAdjustment;
/**
 * Apply pace adjustment to an expression
 */
export declare function applyPaceToExpression(expression: string, adjustment: PacePersonalityAdjustment): string;
/**
 * Adjust SSML pause durations
 */
declare function adjustSSMLPauses(text: string, multiplier: number): string;
/**
 * Convert voice pace adapter data to our context format
 */
export declare function fromVoicePaceData(wpm?: number, preferences?: LearnedPacePreferences): CurrentPaceContext;
/**
 * Categorize WPM into pace category
 */
declare function categorizePace(wpm: number): PaceCategory;
export declare const voicePacePersonality: {
    getAdjustment: typeof getPacePersonalityAdjustment;
    applyToExpression: typeof applyPaceToExpression;
    adjustPauses: typeof adjustSSMLPauses;
    fromVoicePaceData: typeof fromVoicePaceData;
    categorizePace: typeof categorizePace;
};
export default voicePacePersonality;
//# sourceMappingURL=voice-pace-personality.d.ts.map