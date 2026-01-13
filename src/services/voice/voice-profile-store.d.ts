/**
 * Voice Profile Firestore Store
 *
 * Handles persistence of voice profiles for speaker authentication.
 *
 * Firestore Schema:
 * ```
 * bogle_users/{userId}/
 *   voice_profile/
 *     profile (document)
 *       - userId: string
 *       - displayName: string
 *       - centroid: number[] (192-dim embedding)
 *       - threshold: number
 *       - qualityScore: number
 *       - verificationCount: number
 *       - enrolledAt: timestamp
 *       - updatedAt: timestamp
 *       - lastVerifiedAt: timestamp
 *       - metadata: { deviceTypes, enrollmentDurationMs, sampleCount }
 *
 *     samples/ (subcollection)
 *       {sampleId}
 *         - embedding: number[] (192-dim)
 *         - collectedAt: timestamp
 *         - durationMs: number
 *         - quality: { snr, clarity, confidence }
 *         - context: { deviceType, environment }
 * ```
 *
 * @module VoiceProfileStore
 */
import type { VoiceProfile } from './voice-enrollment.js';
/**
 * Save a voice profile to Firestore.
 */
export declare function saveVoiceProfile(profile: VoiceProfile): Promise<void>;
/**
 * Load a voice profile from Firestore.
 */
export declare function loadVoiceProfile(userId: string): Promise<VoiceProfile | null>;
/**
 * Check if a user has a voice profile.
 */
export declare function hasVoiceProfile(userId: string): Promise<boolean>;
/**
 * Delete a voice profile.
 */
export declare function deleteVoiceProfile(userId: string): Promise<void>;
/**
 * Update verification count and timestamp.
 */
export declare function recordVerification(userId: string, success: boolean): Promise<void>;
/**
 * Load all voice profiles (for identification across users).
 *
 * Note: For production with many users, implement pagination or
 * use a separate index collection.
 */
export declare function loadAllVoiceProfiles(options?: {
    limit?: number;
}): Promise<VoiceProfile[]>;
/**
 * Get voice profile stats for a user.
 */
export declare function getVoiceProfileStats(userId: string): Promise<{
    exists: boolean;
    enrolledAt?: Date;
    qualityScore?: number;
    verificationCount?: number;
    sampleCount?: number;
    needsReEnrollment?: boolean;
} | null>;
/**
 * Update the voice profile index entry.
 */
export declare function updateVoiceProfileIndex(profile: VoiceProfile): Promise<void>;
/**
 * Load voice profile index for fast identification.
 */
export declare function loadVoiceProfileIndex(): Promise<Array<{
    userId: string;
    centroid: number[];
    threshold: number;
}>>;
/**
 * Remove from voice profile index.
 */
export declare function removeFromVoiceProfileIndex(userId: string): Promise<void>;
//# sourceMappingURL=voice-profile-store.d.ts.map