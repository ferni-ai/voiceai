/**
 * Life Coaching User Profile Service
 *
 * Manages user profiles for personalized life coaching.
 * Persists to Firestore for "Better than Human" memory.
 *
 * Schema:
 * - bogle_users/{userId}/life_coaching/profile → LifeCoachingProfile
 */
import type { LifeCoachingProfile, FourTendency, AttachmentStyle, EmotionalState, BoundaryAttempt } from './types.js';
export type { LifeCoachingProfile };
/**
 * Get or create a user's life coaching profile
 */
export declare function getLifeCoachingProfile(userId: string): Promise<LifeCoachingProfile>;
/**
 * Update a user's profile
 */
export declare function updateLifeCoachingProfile(userId: string, updates: Partial<LifeCoachingProfile>): Promise<void>;
/**
 * Analyze text for tendency cues
 */
export declare function detectTendencyCues(text: string): {
    tendency: FourTendency;
    confidence: number;
} | null;
/**
 * Update tendency based on new evidence
 */
export declare function updateTendency(userId: string, tendency: FourTendency, confidence: number): Promise<void>;
export declare function detectAttachmentCues(text: string): {
    style: AttachmentStyle;
    confidence: number;
} | null;
export declare function detectEmotionalState(text: string): EmotionalState | null;
export declare function recordBoundaryAttempt(userId: string, attempt: Omit<BoundaryAttempt, 'date'>): Promise<void>;
export declare function getBoundaryPatterns(userId: string): Promise<{
    successRate: number;
    commonChallenges: string[];
    growth: string[];
}>;
//# sourceMappingURL=user-profile.d.ts.map