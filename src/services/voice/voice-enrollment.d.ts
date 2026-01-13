/**
 * Voice Enrollment Service
 *
 * Handles speaker enrollment, verification, and identification
 * for real-time voice authentication.
 *
 * Features:
 * - Multi-sample enrollment for robust profiles
 * - Adaptive thresholds per user
 * - Continuous authentication during sessions
 * - Speaker change detection
 * - Cross-session voice memory
 *
 * @module VoiceEnrollment
 */
/**
 * Voice profile stored for each enrolled user.
 */
export interface VoiceProfile {
    /** User ID */
    userId: string;
    /** Display name for the profile */
    displayName?: string;
    /** Individual enrollment embeddings */
    embeddings: EnrollmentSample[];
    /** Centroid (average) embedding for fast comparison */
    centroid: number[];
    /** Per-user verification threshold (adaptive) */
    threshold: number;
    /** Quality score of the enrollment (0-1) */
    qualityScore: number;
    /** Number of successful verifications */
    verificationCount: number;
    /** Timestamps */
    enrolledAt: Date;
    updatedAt: Date;
    lastVerifiedAt?: Date;
    /** Metadata */
    metadata: {
        deviceTypes: string[];
        enrollmentDurationMs: number;
        sampleCount: number;
    };
}
/**
 * Individual enrollment sample.
 */
export interface EnrollmentSample {
    /** Embedding vector */
    embedding: number[];
    /** When this sample was collected */
    collectedAt: Date;
    /** Duration of audio in ms */
    durationMs: number;
    /** Quality indicators */
    quality: {
        snr?: number;
        clarity?: number;
        confidence: number;
    };
    /** Device/environment info */
    context?: {
        deviceType?: string;
        environment?: string;
    };
}
/**
 * Enrollment session for collecting samples.
 */
export interface EnrollmentSession {
    userId: string;
    samples: EnrollmentSample[];
    startedAt: Date;
    status: 'collecting' | 'processing' | 'complete' | 'failed';
    requiredSamples: number;
    currentQuality: number;
}
/**
 * Verification result.
 */
export interface VerificationResult {
    /** Whether the user is verified */
    verified: boolean;
    /** Confidence score (0-1) */
    confidence: number;
    /** User ID if verified */
    userId?: string;
    /** Reason for failure */
    reason?: string;
    /** Processing time in ms */
    processingTimeMs: number;
    /** Additional details */
    details?: {
        threshold: number;
        similarity: number;
        method: 'neural' | 'dsp';
    };
}
/**
 * Identification result (who is speaking).
 */
export interface IdentificationResult {
    /** Whether a match was found */
    identified: boolean;
    /** Matched user ID */
    userId?: string;
    /** Confidence score */
    confidence: number;
    /** All candidates above minimum threshold */
    candidates: Array<{
        userId: string;
        similarity: number;
    }>;
    /** Processing time */
    processingTimeMs: number;
}
/**
 * Continuous authentication status.
 */
export interface AuthStatus {
    status: 'verified' | 'suspicious' | 'speaker_changed' | 'unknown';
    confidence: number;
    currentUserId?: string;
    anomalyCount: number;
    message?: string;
}
/** Minimum samples required for enrollment */
declare const MIN_ENROLLMENT_SAMPLES = 3;
/** Recommended samples for good enrollment */
declare const RECOMMENDED_ENROLLMENT_SAMPLES = 5;
/** Maximum samples to store per user */
declare const MAX_ENROLLMENT_SAMPLES = 10;
/** Default verification threshold */
declare const DEFAULT_THRESHOLD = 0.7;
/** Minimum audio duration for enrollment (ms) */
declare const MIN_AUDIO_DURATION_MS = 1000;
/**
 * Start a new enrollment session.
 */
export declare function startEnrollmentSession(userId: string, options?: {
    requiredSamples?: number;
}): EnrollmentSession;
/**
 * Add an audio sample to the enrollment session.
 */
export declare function addEnrollmentSample(session: EnrollmentSession, audio: Float32Array, context?: {
    deviceType?: string;
    environment?: string;
}): Promise<{
    success: boolean;
    session: EnrollmentSession;
    feedback?: string;
}>;
/**
 * Complete enrollment and create voice profile.
 */
export declare function completeEnrollment(session: EnrollmentSession): Promise<{
    success: boolean;
    profile?: VoiceProfile;
    error?: string;
}>;
/**
 * Verify a speaker against their enrolled profile.
 */
export declare function verifyUser(audio: Float32Array, profile: VoiceProfile): Promise<VerificationResult>;
/**
 * Identify a speaker from a list of enrolled profiles.
 */
export declare function identifySpeaker(audio: Float32Array, profiles: VoiceProfile[], options?: {
    minThreshold?: number;
}): Promise<IdentificationResult>;
/**
 * Continuous authenticator for ongoing verification during a session.
 */
export declare class ContinuousAuthenticator {
    private profile;
    private recentEmbeddings;
    private anomalyCount;
    private lastStatus;
    constructor(profile: VoiceProfile);
    /**
     * Process an audio chunk and update authentication status.
     */
    processAudioChunk(audio: Float32Array): Promise<AuthStatus>;
    /**
     * Get current authentication status.
     */
    getStatus(): AuthStatus;
    /**
     * Reset the authenticator state.
     */
    reset(): void;
}
/**
 * Update a voice profile with new samples.
 */
export declare function updateProfile(profile: VoiceProfile, newSamples: EnrollmentSample[]): Promise<VoiceProfile>;
/**
 * Check if a profile needs re-enrollment.
 */
export declare function needsReEnrollment(profile: VoiceProfile): {
    needed: boolean;
    reasons: string[];
};
export { DEFAULT_THRESHOLD, MAX_ENROLLMENT_SAMPLES, MIN_AUDIO_DURATION_MS, MIN_ENROLLMENT_SAMPLES, RECOMMENDED_ENROLLMENT_SAMPLES, };
//# sourceMappingURL=voice-enrollment.d.ts.map