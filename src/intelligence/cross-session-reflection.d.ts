/**
 * Cross-Session Reflection System
 *
 * Enables personas to "think about" significant moments between sessions,
 * creating the illusion of an evolving relationship:
 *
 * - "I've been thinking about what you said about your father..."
 * - "Since we last talked, I realized something about what you shared..."
 * - "You know, your comment about [topic] stuck with me..."
 *
 * This makes the AI feel like it has an internal life that continues
 * even when not actively conversing.
 */
import type { UserProfile } from '../types/user-profile.js';
/**
 * A moment worth reflecting on in future sessions
 */
export interface ReflectionMoment {
    id: string;
    /** When the moment occurred */
    timestamp: Date;
    /** Session where moment occurred */
    sessionId: string;
    /** What the user said/shared */
    userStatement: string;
    /** Topic or theme */
    topic: string;
    /** Emotional weight (affects how likely to reflect) */
    emotionalWeight: 'light' | 'medium' | 'heavy';
    /** Type of moment */
    type: 'vulnerability_shared' | 'breakthrough_moment' | 'difficult_admission' | 'meaningful_question' | 'life_update' | 'goal_commitment' | 'fear_expressed' | 'joy_shared';
    /** What the persona might reflect on */
    reflectionSeed: string;
    /** Has this been used in a reflection already? */
    reflectedOn: boolean;
    /** When was it reflected on? */
    reflectedOnAt?: Date;
    /** Persona that heard this (for multi-persona memory) */
    personaId?: string;
}
/**
 * Generated reflection to inject into conversation
 */
export interface GeneratedReflection {
    /** The reflection phrase */
    phrase: string;
    /** Reference to the original moment */
    momentId: string;
    /** Confidence that this is appropriate to share now */
    appropriateness: number;
}
/**
 * Detect if user statement contains a reflection-worthy moment
 */
export declare function detectReflectionMoment(userText: string, topic: string, emotionPrimary: string, emotionIntensity: number, sessionId: string, personaId?: string): ReflectionMoment | null;
/**
 * Templates for generating reflections based on moment type
 */
declare const reflectionTemplates: Record<ReflectionMoment['type'], string[]>;
/**
 * Generate a reflection phrase for a moment
 */
export declare function generateReflection(moment: ReflectionMoment, userName?: string): GeneratedReflection;
/**
 * Calculate how appropriate it is to reflect on this moment now
 */
declare function calculateAppropiateness(moment: ReflectionMoment): number;
/**
 * Select the best reflection moment to use in current session
 */
export declare function selectBestReflection(moments: ReflectionMoment[], currentTopics: string[], currentEmotion: string, turnCount: number): GeneratedReflection | null;
/**
 * Get reflection moments from user profile
 */
export declare function getReflectionMoments(profile: UserProfile | null): ReflectionMoment[];
/**
 * Save a reflection moment to user profile
 */
export declare function saveReflectionMoment(profile: UserProfile, moment: ReflectionMoment): void;
/**
 * Mark a moment as reflected on
 */
export declare function markMomentReflectedOn(profile: UserProfile, momentId: string): void;
export { reflectionTemplates, calculateAppropiateness };
//# sourceMappingURL=cross-session-reflection.d.ts.map