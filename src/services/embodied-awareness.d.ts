/**
 * Embodied Awareness Service
 *
 * Makes personas feel physically present by tracking:
 * - Physical state continuity (coffee getting cold, needing to stretch)
 * - Session duration awareness ("we've been talking for a while")
 * - Time passing naturally ("it's getting late")
 * - Metacognitive moments ("I notice I've been giving a lot of advice")
 *
 * This creates the feeling that the persona exists in physical space and time.
 */
export interface PhysicalState {
    coffeeStatus: 'hot' | 'warm' | 'cold' | 'empty' | 'refilling' | 'none';
    coffeeRefillCount: number;
    posture: 'sitting' | 'leaning_back' | 'stretching' | 'standing';
    lastStretchTime: number;
    energyLevel: 'high' | 'medium' | 'low';
    notebookMentioned: boolean;
    weatherMentioned: boolean;
    musicMentioned: boolean;
    lastPhysicalType: string | null;
}
export interface MetacognitiveState {
    adviceGivenCount: number;
    questionsAskedCount: number;
    storiesToldCount: number;
    topicChangesCount: number;
    emotionalSupportMoments: number;
    lastSelfReflection: number;
}
export interface SessionAwareness {
    sessionStartTime: number;
    turnCount: number;
    physicalState: PhysicalState;
    metacognitive: MetacognitiveState;
    lastPhysicalMention: number;
    lastMetacognitiveMention: number;
}
/**
 * Update session state after each turn
 */
export declare function updateSessionState(sessionId: string, update: {
    gaveAdvice?: boolean;
    askedQuestion?: boolean;
    toldStory?: boolean;
    changedTopic?: boolean;
    providedEmotionalSupport?: boolean;
}): void;
/**
 * Get a physical state comment if appropriate
 */
export declare function getPhysicalStateComment(sessionId: string, personaId: string): string | null;
/**
 * Get a metacognitive reflection if appropriate
 */
export declare function getMetacognitiveComment(sessionId: string, personaId: string): string | null;
/**
 * Phrases for natural self-correction during speech
 */
export declare const SELF_CORRECTION_PATTERNS: {
    ferni: string[];
    'alex-chen': string[];
    'maya-santos': string[];
    'peter-john': string[];
    'nayan-patel': string[];
    'jordan-taylor': string[];
};
/**
 * Get a self-correction phrase for a persona
 */
export declare function getSelfCorrectionPhrase(personaId: string): string;
/**
 * Generate time-aware phrases based on session and relationship history
 */
export declare function getTemporalAnchor(sessionId: string, lastConversationDate?: Date, personaId?: string): string | null;
/**
 * Clean up session state
 */
export declare function cleanupSession(sessionId: string): void;
/**
 * Get session stats for debugging
 */
export declare function getSessionStats(sessionId: string): SessionAwareness | null;
//# sourceMappingURL=embodied-awareness.d.ts.map