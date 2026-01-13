/**
 * Environment Tracker
 *
 * Tracks environmental audio changes and triggers appropriate responses.
 * Maintains a rolling baseline and detects significant deviations.
 *
 * Key principle: React naturally to the environment, like a human would.
 * - Minor changes → subtle TTS adjustments (louder, clearer)
 * - Major interruptions → verbal acknowledgment ("Take your time")
 *
 * @module ambient-reactivity/environment-tracker
 */
import type { AudioSnapshot, EnvironmentAcknowledgment, EnvironmentEvent, EnvironmentTrackerState, EnvironmentTtsAdjustment } from './types.js';
export declare const ENVIRONMENT_CONFIG: {
    /** Number of samples for baseline (at ~10 samples/sec, this is ~1 second) */
    BASELINE_SAMPLES: number;
    /** Maximum age of baseline sample before refresh (ms) */
    BASELINE_MAX_AGE_MS: number;
    /** Threshold for noise increase detection (dB) */
    NOISE_INCREASE_MINOR: number;
    NOISE_INCREASE_MODERATE: number;
    NOISE_INCREASE_MAJOR: number;
    /** Threshold for noise decrease detection (dB) */
    NOISE_DECREASE_THRESHOLD: number;
    /** Cooldown between similar events (ms) */
    EVENT_COOLDOWN_MS: number;
    /** Duration to keep events in recent list (ms) */
    EVENT_RETENTION_MS: number;
    /** Confidence threshold for events */
    CONFIDENCE_THRESHOLD: number;
    /** TTS adjustments by severity */
    TTS_ADJUSTMENTS: {
        minor: {
            volumeBoost: number;
            clarity: boolean;
            speed: number;
            pause: number;
        };
        moderate: {
            volumeBoost: number;
            clarity: boolean;
            speed: number;
            pause: number;
        };
        major: {
            volumeBoost: number;
            clarity: boolean;
            speed: number;
            pause: number;
        };
    };
    /** Spectral thresholds for event detection */
    SPECTRAL: {
        /** High-frequency energy for doorbell detection */
        DOORBELL_HIGH_FREQ_THRESHOLD: number;
        /** Mid-frequency energy for phone ring */
        PHONE_RING_MID_THRESHOLD: number;
    };
};
/**
 * Get or create environment tracker for a session
 */
export declare function getEnvironmentTracker(sessionId: string): EnvironmentTracker;
/**
 * Reset environment tracker for a session
 */
export declare function resetEnvironmentTracker(sessionId: string): void;
/**
 * Get count of active trackers
 */
export declare function getActiveEnvironmentTrackerCount(): number;
export declare class EnvironmentTracker {
    private sessionId;
    private baselineSamples;
    private recentSnapshots;
    private recentEvents;
    private lastEventByType;
    private pendingAcknowledgment;
    private lastMajorEventAt;
    constructor(sessionId: string);
    /**
     * Process an audio snapshot
     */
    processSnapshot(snapshot: AudioSnapshot): EnvironmentEvent | null;
    /**
     * Update rolling baseline
     */
    private updateBaseline;
    /**
     * Get baseline noise level
     */
    private getBaselineNoiseDb;
    /**
     * Detect environment events
     */
    private detectEvent;
    /**
     * Check if we can emit an event (respecting cooldown)
     */
    private canEmitEvent;
    /**
     * Create an event
     */
    private createEvent;
    /**
     * Record an event and trigger responses
     */
    private recordEvent;
    /**
     * Generate acknowledgment for an event
     */
    private generateAcknowledgment;
    /**
     * Clean up old events
     */
    private cleanupOldEvents;
    /**
     * Get current TTS adjustments
     */
    getTtsAdjustments(): EnvironmentTtsAdjustment;
    /**
     * Get and consume pending acknowledgment
     */
    consumeAcknowledgment(): EnvironmentAcknowledgment | null;
    /**
     * Check if there's a pending acknowledgment
     */
    hasPendingAcknowledgment(): boolean;
    /**
     * Get current state
     */
    getState(): EnvironmentTrackerState;
    /**
     * Reset tracker
     */
    reset(): void;
}
export declare const environmentTracker: {
    get: typeof getEnvironmentTracker;
    reset: typeof resetEnvironmentTracker;
    getActiveCount: typeof getActiveEnvironmentTrackerCount;
    config: {
        /** Number of samples for baseline (at ~10 samples/sec, this is ~1 second) */
        BASELINE_SAMPLES: number;
        /** Maximum age of baseline sample before refresh (ms) */
        BASELINE_MAX_AGE_MS: number;
        /** Threshold for noise increase detection (dB) */
        NOISE_INCREASE_MINOR: number;
        NOISE_INCREASE_MODERATE: number;
        NOISE_INCREASE_MAJOR: number;
        /** Threshold for noise decrease detection (dB) */
        NOISE_DECREASE_THRESHOLD: number;
        /** Cooldown between similar events (ms) */
        EVENT_COOLDOWN_MS: number;
        /** Duration to keep events in recent list (ms) */
        EVENT_RETENTION_MS: number;
        /** Confidence threshold for events */
        CONFIDENCE_THRESHOLD: number;
        /** TTS adjustments by severity */
        TTS_ADJUSTMENTS: {
            minor: {
                volumeBoost: number;
                clarity: boolean;
                speed: number;
                pause: number;
            };
            moderate: {
                volumeBoost: number;
                clarity: boolean;
                speed: number;
                pause: number;
            };
            major: {
                volumeBoost: number;
                clarity: boolean;
                speed: number;
                pause: number;
            };
        };
        /** Spectral thresholds for event detection */
        SPECTRAL: {
            /** High-frequency energy for doorbell detection */
            DOORBELL_HIGH_FREQ_THRESHOLD: number;
            /** Mid-frequency energy for phone ring */
            PHONE_RING_MID_THRESHOLD: number;
        };
    };
};
//# sourceMappingURL=environment-tracker.d.ts.map