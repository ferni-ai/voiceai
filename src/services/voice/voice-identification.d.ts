/**
 * Voice Identification Service
 *
 * Combines device-based identification with voice memory for a natural
 * "your voice sounds familiar" experience. This is the main entry point
 * for identifying users in a voice-first way.
 *
 * Flow:
 * 1. Check device_id (instant, same device)
 * 2. If device match, optionally verify voice matches
 * 3. If no device match, search by voice
 * 4. Present natural confirmation UX
 */
import type { UserProfile, VoiceSketch } from '../../types/user-profile.js';
import { type VoiceSearchResult, type VoiceSimilarityResult } from '../memory/voice-memory.js';
/**
 * Result of voice-enhanced identification
 */
export interface VoiceIdentificationResult {
    userId: string;
    profile: UserProfile | null;
    isNew: boolean;
    isReturning: boolean;
    identificationMethod: 'device' | 'voice' | 'both' | 'anonymous';
    voice?: {
        hasSketch: boolean;
        matchConfidence: number;
        needsEnrollment: boolean;
        possibleMatches?: VoiceSearchResult[];
    };
    suggestedAction: 'greet_by_name' | 'verify_identity' | 'suggest_identity' | 'ask_name' | 'enroll_voice';
    contextForAgent: string;
}
/**
 * Voice verification result (for existing users)
 */
export interface VoiceVerificationResult {
    isMatch: boolean;
    confidence: number;
    matchingFeatures: string[];
    divergentFeatures: string[];
    suggestedAction: 'proceed' | 'ask_verification' | 'likely_different_person';
}
/**
 * Update adaptive thresholds based on voice match feedback
 * Call this when user confirms/denies their identity after voice match
 *
 * @param userId - User ID
 * @param matchScore - The score that was calculated
 * @param wasCorrect - Whether the match decision was correct
 * @param profile - User profile (optional, for persistence)
 */
export declare function recordVoiceMatchFeedback(userId: string, matchScore: number, wasCorrect: boolean, profile?: UserProfile | null): Promise<void>;
/**
 * Identify a user using device ID and voice characteristics
 *
 * @param metadata - Job metadata containing device_id, user_name, etc.
 * @param store - Memory store for profile lookup
 * @param currentVoiceSketch - Optional voice sketch from current session
 */
export declare function identifyWithVoice(metadata: Record<string, unknown>, store: {
    getProfile: (userId: string) => Promise<UserProfile | null>;
    listProfiles: (options?: {
        limit?: number;
    }) => Promise<UserProfile[]>;
}, currentVoiceSketch?: VoiceSketch | null): Promise<VoiceIdentificationResult>;
/**
 * Update a user's voice sketch (merge with existing or create new)
 */
export declare function mergeVoiceSketch(existing: VoiceSketch | undefined, newSketch: VoiceSketch): VoiceSketch;
export type { VoiceSearchResult, VoiceSimilarityResult };
declare const _default: {
    identifyWithVoice: typeof identifyWithVoice;
    mergeVoiceSketch: typeof mergeVoiceSketch;
    VOICE_MATCH_THRESHOLD: number;
    VOICE_SUGGEST_THRESHOLD: number;
    VOICE_MISMATCH_THRESHOLD: number;
};
export default _default;
//# sourceMappingURL=voice-identification.d.ts.map