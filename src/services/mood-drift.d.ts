/**
 * Mood Drift Service
 *
 * Personas don't maintain a static emotional state. This service tracks
 * how a persona's mood naturally shifts during conversation based on:
 * - Topics discussed (heavy topics affect them too)
 * - User's emotional state (empathic mirroring)
 * - Length of conversation
 * - Wins and struggles shared
 *
 * This creates the feeling of emotional co-regulation - they're not robots
 * dispensing advice, they're FEELING the conversation with you.
 */
export interface MoodState {
    baselineMood: MoodType;
    currentMood: MoodType;
    moodIntensity: number;
    emotionalEnergy: number;
    moodShiftHistory: MoodShift[];
    lastMoodExpression: number;
}
export type MoodType = 'warm' | 'contemplative' | 'energized' | 'heavy' | 'playful' | 'tender' | 'focused' | 'tired' | 'concerned' | 'celebratory';
export interface MoodShift {
    from: MoodType;
    to: MoodType;
    reason: string;
    turn: number;
}
export interface MoodExpression {
    phrase: string;
    moodType: MoodType;
    canExpress: boolean;
}
/**
 * Initialize mood for a session
 */
export declare function initializeMood(sessionId: string, personaId: string): MoodState;
/**
 * Get current mood state
 */
export declare function getMoodState(sessionId: string): MoodState | null;
/**
 * Process conversation context and drift mood accordingly
 */
export declare function processMoodDrift(sessionId: string, personaId: string, context: {
    topics: string[];
    userEmotion?: string;
    userEmotionIntensity?: number;
    wasPersonalSharing?: boolean;
    wasWin?: boolean;
    wasStruggle?: boolean;
    turnCount: number;
}): MoodState;
/**
 * Get a phrase that expresses the current mood state
 */
export declare function getMoodExpression(sessionId: string, personaId: string, turnCount: number): MoodExpression | null;
export declare function cleanupMoodState(sessionId: string): void;
//# sourceMappingURL=mood-drift.d.ts.map