/**
 * Easter Eggs & Delighters
 *
 * Fun surprises and delightful moments that make interactions memorable.
 * These are random, rare events that create a sense of magic and personality.
 *
 * SPECIAL MOMENTS:
 * - Holiday greetings (text-based, voice agent)
 * - Winter Solstice (cinematic visual experience, frontend)
 * - Milestones & Anniversaries
 * - Personality quirks
 */
export interface EasterEggContext {
    conversationCount?: number;
    userSinceDate?: Date | string;
}
export interface DelighterContext {
    dayOfWeek: number;
    hourOfDay: number;
    month: number;
    dayOfMonth: number;
    turnCount: number;
    userName?: string;
    topicsDiscussed: string[];
    lastUserMessage?: string;
    sessionMinutes?: number;
}
export interface EasterEggResult {
    type: 'holiday' | 'seasonal' | 'achievement' | 'random' | 'milestone' | 'callback' | 'personality_quirk' | 'birthday' | 'anniversary' | 'winter_solstice' | 'none';
    response?: string;
    triggered: boolean;
    /**
     * If true, the frontend should trigger a cinematic visual experience
     * instead of (or in addition to) the voice response.
     */
    cinematicExperience?: 'winter-solstice' | 'new-year';
}
/**
 * Reset holiday state (call at session start)
 */
export declare function resetEasterEggState(): void;
/**
 * Check for easter eggs based on user text, persona, and context
 * Returns a result with type and optional response to inject
 */
export declare function checkForEasterEgg(userText: string, personaId: string, context?: EasterEggContext): EasterEggResult;
/**
 * Get a random personality quirk for a persona (for silence filler)
 */
export declare function getRandomQuirk(personaId: string): string | null;
export default checkForEasterEgg;
//# sourceMappingURL=easter-eggs.d.ts.map