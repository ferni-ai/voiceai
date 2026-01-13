/**
 * Live Backchanneling Types
 *
 * Type definitions for live backchanneling and breath pause detection.
 */
/**
 * Simplified emotion data for backchannel decisions.
 * Compatible with UserData.lastEmotionAnalysis.
 */
export interface SimpleEmotion {
    primary: string;
    intensity: number;
    distressLevel?: number;
}
export interface LiveBackchannelContext {
    /** Persona ID for persona-specific backchannels */
    personaId: string;
    /** How long has user been speaking this turn (ms) */
    userSpeakingDurationMs: number;
    /** Is the user in a natural breath pause? */
    isBreathPause: boolean;
    /** Current detected emotion (simplified) */
    emotion?: SimpleEmotion;
    /** Turn count in conversation */
    turnCount: number;
    /** Time since last backchannel (ms) */
    timeSinceLastBackchannel: number;
    /** Is the user sharing something emotional? */
    isEmotionalMoment: boolean;
}
export interface LiveBackchannelResult {
    /** Should we emit a backchannel? */
    shouldBackchannel: boolean;
    /** The phrase to say (with SSML for soft volume) */
    phrase: string | null;
    /** Volume ratio (0-1, where 0.3 = 30% of normal) */
    volumeRatio: number;
    /** Whether this can overlap with user speech */
    allowOverlap: boolean;
    /** Reason for the decision */
    reason: string;
}
/**
 * Audio Frame interface (subset of LiveKit AudioFrame)
 */
export interface AudioFrameData {
    data: Int16Array | Uint8Array;
    sampleRate: number;
    channels?: number;
}
//# sourceMappingURL=types.d.ts.map