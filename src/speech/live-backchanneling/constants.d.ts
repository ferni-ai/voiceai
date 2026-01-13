/**
 * Live Backchanneling Constants
 *
 * Configuration and phrase banks for live backchanneling during user speech.
 *
 * IMPORTANT: Live backchannels are MINIMAL presence signals during user speech.
 * They're NOT meant to be substantial acknowledgments - the LLM handles those
 * in turn responses based on behavioral guidance from dynamic-speech-guidance.ts.
 *
 * Live backchannels should be:
 * - RARE: Low probability, long intervals
 * - SHORT: 1-2 syllables max ("Mm", "Yeah")
 * - SOFT: 30% volume, quick
 * - CONTEXT-AWARE: Only during natural breath pauses
 *
 * For substantial acknowledgments, the LLM generates contextually appropriate
 * responses based on what the user actually said.
 */
export declare const CONFIG: {
    /** Minimum time into turn before live backchannel (ms) */
    readonly MIN_SPEAKING_DURATION: 6000;
    /**
     * Minimum time between backchannels (ms)
     * TIMING FIX (Jan 2026): Increased to 15s to match timing-config.ts
     * Target: ~3-4 backchannels per minute (human parity)
     */
    readonly MIN_INTERVAL: 15000;
    /** Volume ratio for soft backchannels (30% of normal) */
    readonly SOFT_VOLUME_RATIO: 0.3;
    /** Breath pause detection window (ms) - pauses shorter than this are breath pauses */
    readonly BREATH_PAUSE_MAX: 400;
    /** Minimum turns before live backchannels start */
    readonly MIN_TURNS: 5;
    /**
     * Probability of backchannel when conditions are met - LOW to minimize repetition
     * TIMING FIX (Jan 2026): Reduced to 10% to fix "all over the place" feel
     */
    readonly BASE_PROBABILITY: 0.1;
    /**
     * Increased probability for emotional moments - still very conservative
     * TIMING FIX (Jan 2026): Reduced to 20%
     */
    readonly EMOTIONAL_PROBABILITY: 0.2;
};
/**
 * Ultra-short phrases that work well as soft overlays
 * These are different from regular backchannels - they're shorter and softer
 */
export declare const SOFT_BACKCHANNELS: Record<string, Record<string, string[]>>;
/**
 * Configuration for audio-based breath pause detection
 */
export declare const BREATH_PAUSE_CONFIG: {
    /** RMS energy threshold below which we consider silence (0-1 scale) */
    readonly SILENCE_THRESHOLD: 0.02;
    /** Minimum energy to consider "speech" vs ambient noise */
    readonly SPEECH_THRESHOLD: 0.05;
    /** Number of consecutive low-energy frames to confirm pause */
    readonly PAUSE_CONFIRMATION_FRAMES: 3;
    /** Number of consecutive high-energy frames to confirm speech */
    readonly SPEECH_CONFIRMATION_FRAMES: 2;
    /** Smoothing factor for energy (0-1, higher = more smoothing) */
    readonly ENERGY_SMOOTHING: 0.7;
    /** Minimum speaking time before detecting pauses (ms) */
    readonly MIN_SPEAKING_TIME: 1000;
    /** History size for pause duration tracking */
    readonly PAUSE_HISTORY_SIZE: 20;
};
//# sourceMappingURL=constants.d.ts.map