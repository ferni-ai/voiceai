/**
 * Ambient Reactivity Types
 *
 * Types for detecting and responding to environmental audio changes.
 *
 * @module ambient-reactivity/types
 */
/**
 * Types of environmental changes we can detect
 */
export type EnvironmentEventType = 'noise_increase' | 'noise_decrease' | 'new_voice' | 'doorbell' | 'pet_sound' | 'phone_ring' | 'music_start' | 'music_stop' | 'silence' | 'crowd_noise';
/**
 * Severity of the environmental change
 */
export type EventSeverity = 'minor' | 'moderate' | 'major';
/**
 * An environmental change event
 */
export interface EnvironmentEvent {
    /** Type of event */
    type: EnvironmentEventType;
    /** Severity of the change */
    severity: EventSeverity;
    /** Timestamp of detection */
    timestamp: number;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Change in dB from baseline (for noise events) */
    dbChange?: number;
    /** Duration of the event if ongoing (ms) */
    durationMs?: number;
    /** Additional context */
    context?: string;
}
/**
 * A snapshot of the audio environment
 */
export interface AudioSnapshot {
    /** Timestamp */
    timestamp: number;
    /** Overall noise level (dB) */
    noiseDb: number;
    /** Signal-to-noise ratio (dB) */
    snr: number;
    /** Is speech detected? */
    hasSpeech: boolean;
    /** Is music detected? */
    hasMusic: boolean;
    /** Environment classification */
    environment: 'quiet' | 'speech' | 'music' | 'traffic' | 'wind' | 'crowd';
    /** Spectral centroid (Hz) */
    spectralCentroid: number;
    /** Energy in different frequency bands */
    bandEnergies: {
        subBass: number;
        bass: number;
        lowMid: number;
        mid: number;
        highMid: number;
        presence: number;
        brilliance: number;
    };
}
/**
 * Adjustments to make to TTS based on environment
 */
export interface EnvironmentTtsAdjustment {
    /** Volume boost (0-1, where 0.1 = +10%) */
    volumeBoost: number;
    /** Enable clarity mode (clearer articulation) */
    clarityMode: boolean;
    /** Speed adjustment (1.0 = no change) */
    speedMultiplier: number;
    /** Extra pause at sentence boundaries (ms) */
    extraPauseMs: number;
    /** Reason for adjustment */
    reason: string;
}
/**
 * Verbal acknowledgment for major interruptions
 */
export interface EnvironmentAcknowledgment {
    /** Phrase to speak */
    phrase: string;
    /** Type of event acknowledged */
    eventType: EnvironmentEventType;
    /** Should pause after speaking? */
    shouldPause: boolean;
    /** Pause duration (ms) */
    pauseDurationMs: number;
}
/**
 * State of the environment tracker
 */
export interface EnvironmentTrackerState {
    /** Session ID */
    sessionId: string;
    /** Baseline noise level (dB) */
    baselineNoiseDb: number;
    /** Current noise level (dB) */
    currentNoiseDb: number;
    /** Change from baseline (dB) */
    noiseChangeDb: number;
    /** Is environment currently noisy? */
    isNoisy: boolean;
    /** Current environment classification */
    environment: AudioSnapshot['environment'];
    /** Recent events (last 60 seconds) */
    recentEvents: EnvironmentEvent[];
    /** Current TTS adjustments */
    currentAdjustments: EnvironmentTtsAdjustment;
    /** Pending acknowledgment (if any) */
    pendingAcknowledgment: EnvironmentAcknowledgment | null;
    /** Number of samples in baseline */
    baselineSampleCount: number;
    /** Timestamp of last major event */
    lastMajorEventAt: number | null;
}
//# sourceMappingURL=types.d.ts.map