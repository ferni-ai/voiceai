/**
 * Anticipatory Prosody System
 *
 * Inspired by Sesame AI's ability to react before the user finishes speaking.
 * This module analyzes partial transcripts to prepare emotional responses
 * in advance, creating a more natural, present feeling.
 *
 * Key capabilities:
 * - Detect emotional trajectory from partial input
 * - Prepare appropriate emotional response before user finishes
 * - Generate opening micro-reactions for immediate response
 * - Adjust prosody based on predicted content
 *
 * @module speech/sesame-inspired/anticipatory-prosody
 */
import type { AnticipatedResponse, PartialTranscript, EmotionalTrajectory } from './types.js';
/**
 * Patterns that indicate emotional trajectory in partial speech
 */
declare const TRAJECTORY_PATTERNS: {
    readonly rising_excitement: readonly [RegExp, RegExp, RegExp];
    readonly rising_concern: readonly [RegExp, RegExp];
    readonly falling_sadness: readonly [RegExp, RegExp, RegExp];
    readonly building_frustration: readonly [RegExp, RegExp, RegExp];
    readonly seeking_support: readonly [RegExp, RegExp];
    readonly sharing_vulnerability: readonly [RegExp, RegExp, RegExp];
    readonly expressing_gratitude: readonly [RegExp, RegExp];
    readonly joking_playful: readonly [RegExp, RegExp];
};
/**
 * Detect emotional trajectory from partial transcript
 */
export declare function detectTrajectory(partial: PartialTranscript): EmotionalTrajectory;
/**
 * Get anticipated emotional trajectory type from text
 */
export declare function detectTrajectoryType(text: string): keyof typeof TRAJECTORY_PATTERNS | null;
/**
 * Anticipate emotional response from partial transcript
 *
 * Call this as the user is speaking to prepare the response prosody
 * BEFORE they finish. This is what Sesame calls "voice presence".
 *
 * @param partial - Partial transcript while user is speaking
 * @returns Anticipated response parameters
 */
export declare function anticipateResponse(partial: PartialTranscript): AnticipatedResponse;
/**
 * Check if we should start preparing a response
 *
 * Returns true when we have enough signal to start anticipating
 */
export declare function shouldAnticipate(partial: PartialTranscript): boolean;
/**
 * Generate immediate micro-reaction for user content
 *
 * Use this for very fast (<100ms) reactions to user speech
 */
export declare function getImmediateMicroReaction(text: string, tone?: PartialTranscript['tone']): string | null;
interface AnticipatorySession {
    lastAnticipation: AnticipatedResponse | null;
    lastPartialText: string;
    anticipationCount: number;
}
/**
 * Get or create session state
 */
export declare function getAnticipatorySession(sessionId: string): AnticipatorySession;
/**
 * Update session with new anticipation
 */
export declare function updateAnticipation(sessionId: string, partial: PartialTranscript, anticipation: AnticipatedResponse): void;
/**
 * Get last anticipation for a session
 */
export declare function getLastAnticipation(sessionId: string): AnticipatedResponse | null;
/**
 * Reset session state
 */
export declare function resetAnticipatorySession(sessionId: string): void;
/**
 * Get active session count (for monitoring)
 */
export declare function getActiveAnticipatorySessionCount(): number;
export {};
//# sourceMappingURL=anticipatory-prosody.d.ts.map