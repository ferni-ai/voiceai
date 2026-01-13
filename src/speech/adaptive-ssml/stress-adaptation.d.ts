/**
 * Stress Auto-Adaptation
 *
 * Detects user stress from audio signals and gradually modulates TTS parameters
 * (slower pace, calming tone, longer pauses) over 2-3 turns.
 *
 * Key principle: The user should NOT consciously notice the adaptation.
 * Changes should feel natural, not robotic or clinical.
 *
 * @module StressAdaptation
 */
import type { BreathType } from '../breath-detection.js';
/**
 * A single stress reading from one turn
 */
export interface StressReading {
    /** Timestamp of the reading */
    timestamp: number;
    /** Stress level (0-1) from calculateStressLevel() */
    stressLevel: number;
    /** Whether anxiety markers were detected */
    anxietyMarkers: boolean;
    /** Breath pattern type */
    breathPattern: BreathType;
    /** Whether voice tremor was detected */
    voiceTremor: boolean;
    /** Concern level from concern-detection.ts */
    concernLevel: 'none' | 'mild' | 'moderate' | 'high' | 'crisis';
}
/**
 * TTS adjustments to apply based on stress level
 */
export interface StressAdaptation {
    /** Speed multiplier (0.75-1.0, slower when stressed) */
    speedMultiplier: number;
    /** Pause multiplier (1.0-2.0, longer pauses when stressed) */
    pauseMultiplier: number;
    /** Warmth level for emotional tone */
    warmthLevel: 'high' | 'medium' | 'normal';
    /** Cartesia emotion to use */
    emotion: string;
    /** Whether to add verbal acknowledgment (rare, only for high stress) */
    shouldAcknowledge: boolean;
    /** Current adaptation level (0-1) for monitoring */
    adaptationLevel: number;
    /** Explanation of current adaptation */
    reason: string;
}
/**
 * Internal state for the stress adaptation engine
 */
interface StressAdaptationState {
    /** Session ID */
    sessionId: string;
    /** History of stress readings (last N) */
    stressHistory: StressReading[];
    /** Current adaptation level (0-1) */
    adaptationLevel: number;
    /** Turns spent at current level */
    turnsAtCurrentLevel: number;
    /** Timestamp of last adaptation change */
    lastAdaptationChange: number;
    /** Whether we're in active stress adaptation mode */
    isActive: boolean;
}
/**
 * Tunable configuration for stress adaptation behavior
 */
export declare const STRESS_ADAPTATION_CONFIG: {
    /** Maximum readings to keep in history */
    MAX_HISTORY: number;
    /** Maximum adaptation change per turn (prevents jarring shifts) */
    MAX_RAMP_UP_PER_TURN: number;
    MAX_RAMP_DOWN_PER_TURN: number;
    /** Minimum stress change to trigger adaptation change (hysteresis) */
    HYSTERESIS_THRESHOLD: number;
    /** Minimum turns between significant adaptation changes */
    COOLDOWN_TURNS: number;
    /** Stress level thresholds */
    STRESS_MILD: number;
    STRESS_MODERATE: number;
    STRESS_HIGH: number;
    /** Weights for different stress signals */
    WEIGHTS: {
        stressLevel: number;
        anxietyMarkers: number;
        breathPattern: number;
        voiceTremor: number;
        concernLevel: number;
    };
    /** Speed adjustments by adaptation level */
    SPEED: {
        NONE: number;
        MILD: number;
        MODERATE: number;
        HIGH: number;
    };
    /** Pause adjustments by adaptation level */
    PAUSE: {
        NONE: number;
        MILD: number;
        MODERATE: number;
        HIGH: number;
    };
};
/**
 * Get or create the stress adaptation engine for a session
 */
export declare function getStressAdaptationEngine(sessionId: string): StressAdaptationState;
/**
 * Reset the stress adaptation engine for a session
 */
export declare function resetStressAdaptationEngine(sessionId: string): void;
/**
 * Get count of active engines (for monitoring)
 */
export declare function getActiveStressAdaptationCount(): number;
/**
 * Record a new stress reading from the current turn
 */
export declare function recordStressReading(sessionId: string, reading: StressReading): void;
/**
 * Calculate the current stress adaptation to apply
 */
export declare function calculateStressAdaptation(sessionId: string): StressAdaptation;
/**
 * Apply stress adaptation to SSML text
 */
export declare function applyStressAdaptationSsml(text: string, adaptation: StressAdaptation): string;
/**
 * Get current stress adaptation state for monitoring
 */
export declare function getStressAdaptationState(sessionId: string): {
    isActive: boolean;
    adaptationLevel: number;
    historyLength: number;
    turnsAtCurrentLevel: number;
    lastReading: StressReading | null;
} | null;
export declare const stressAdaptation: {
    getEngine: typeof getStressAdaptationEngine;
    reset: typeof resetStressAdaptationEngine;
    record: typeof recordStressReading;
    calculate: typeof calculateStressAdaptation;
    apply: typeof applyStressAdaptationSsml;
    getState: typeof getStressAdaptationState;
    getActiveCount: typeof getActiveStressAdaptationCount;
    config: {
        /** Maximum readings to keep in history */
        MAX_HISTORY: number;
        /** Maximum adaptation change per turn (prevents jarring shifts) */
        MAX_RAMP_UP_PER_TURN: number;
        MAX_RAMP_DOWN_PER_TURN: number;
        /** Minimum stress change to trigger adaptation change (hysteresis) */
        HYSTERESIS_THRESHOLD: number;
        /** Minimum turns between significant adaptation changes */
        COOLDOWN_TURNS: number;
        /** Stress level thresholds */
        STRESS_MILD: number;
        STRESS_MODERATE: number;
        STRESS_HIGH: number;
        /** Weights for different stress signals */
        WEIGHTS: {
            stressLevel: number;
            anxietyMarkers: number;
            breathPattern: number;
            voiceTremor: number;
            concernLevel: number;
        };
        /** Speed adjustments by adaptation level */
        SPEED: {
            NONE: number;
            MILD: number;
            MODERATE: number;
            HIGH: number;
        };
        /** Pause adjustments by adaptation level */
        PAUSE: {
            NONE: number;
            MILD: number;
            MODERATE: number;
            HIGH: number;
        };
    };
};
export {};
//# sourceMappingURL=stress-adaptation.d.ts.map