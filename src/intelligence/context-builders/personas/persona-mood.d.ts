/**
 * Persona Mood States
 *
 * Gives personas varying moods, energy levels, and even "off days."
 * This is what makes an AI feel alive rather than always "on."
 *
 * A friend isn't always at 100%. Sometimes they're:
 * - Reflective and slow
 * - Extra energized
 * - A bit tired but still present
 * - In a philosophical mood
 * - Feeling playful
 *
 * The mood affects:
 * - Response length
 * - Story frequency
 * - Humor usage
 * - Vulnerability level
 * - Energy in delivery
 */
import type { PersonaConfig } from '../../../personas/types.js';
import type { MoodState } from '../../../types/humanizing-types.js';
export type { MoodState } from '../../../types/humanizing-types.js';
export interface PersonaMood {
    state: MoodState;
    /** Energy level 0-1 */
    energyLevel: number;
    /** Response length preference */
    responseLengthBias: 'shorter' | 'normal' | 'longer';
    /** Story telling frequency */
    storyFrequency: 'low' | 'normal' | 'high';
    /** Humor frequency */
    humorFrequency: 'low' | 'normal' | 'high';
    /** How vulnerable/open the persona is feeling */
    vulnerabilityLevel: 'guarded' | 'normal' | 'open' | 'very_open';
    /** Voice delivery adjustments */
    deliveryAdjustments: {
        speed: number;
        pauseFrequency: 'more' | 'normal' | 'less';
        warmth: number;
    };
    /** Phrases that reflect this mood */
    moodPhrases: string[];
    /** What might trigger a mood shift */
    shiftTriggers: string[];
    /** Duration hint for this mood */
    typicalDuration: 'brief' | 'session' | 'extended';
}
export interface MoodContext {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek: number;
    isWeekend: boolean;
    weatherMood?: 'sunny' | 'rainy' | 'stormy' | 'neutral';
    recentConversationCount: number;
    lastMood?: MoodState;
}
/**
 * Select a mood for the current session based on context
 */
export declare function selectPersonaMood(persona: PersonaConfig, context: MoodContext): PersonaMood;
/**
 * Format mood for prompt injection
 */
export declare function formatMoodForPrompt(mood: PersonaMood): string;
/**
 * Check if mood should shift based on conversation
 */
export declare function shouldMoodShift(currentMood: PersonaMood, userEmotion: string, topicWeight: 'light' | 'medium' | 'heavy'): boolean;
/**
 * Get the appropriate mood shift when one is needed
 */
export declare function getMoodShift(currentMood: MoodState, reason: string): MoodState;
/**
 * Get mood context from current time
 */
export declare function getMoodContext(recentConversationCount?: number, lastMood?: MoodState): MoodContext;
export default selectPersonaMood;
//# sourceMappingURL=persona-mood.d.ts.map