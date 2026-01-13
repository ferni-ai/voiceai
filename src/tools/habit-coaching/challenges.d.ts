/**
 * 30-Day Challenge Definitions
 *
 * Pre-built challenge programs for common habit goals.
 *
 * @module habit-coaching/challenges
 */
import type { ChallengeDefinition } from './types.js';
export declare const THIRTY_DAY_CHALLENGES: Record<string, ChallengeDefinition>;
/**
 * Get challenge by type
 */
export declare function getChallenge(type: string): ChallengeDefinition | undefined;
/**
 * Get all available challenge types
 */
export declare function getChallengeTypes(): string[];
/**
 * Get challenge day content
 */
export declare function getChallengeDay(type: string, day: number): {
    weekTheme: string;
    dayTask: string;
    intensityNote: string;
} | null;
//# sourceMappingURL=challenges.d.ts.map