/**
 * Breath Pattern Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects breath patterns that reveal emotional state:
 * - Sighs often precede disclosure or indicate resignation
 * - Held breath = bracing for something difficult
 * - Deep breath = gathering courage
 * - Shaky breath = held-back tears or anxiety
 * - Release breath = letting go, relief
 *
 * Humans unconsciously notice these patterns. This module gives Ferni
 * that same subtle awareness.
 *
 * Uses Rust-accelerated functions when available via @ferni/audio module
 * for 10-20x speedup on CPU-intensive operations (RMS, ZCR).
 *
 * @module BreathDetection
 */
import { createRequire } from 'module';
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// RUST ACCELERATION (OPTIONAL)
// ============================================================================
// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);
let nativeModule = null;
let loadAttempted = false;
function getNativeModule() {
    if (loadAttempted)
        return nativeModule;
    loadAttempted = true;
    try {
        nativeModule = require('@ferni/audio');
        return nativeModule;
    }
    catch {
        return null;
    }
}
/** Check if Rust acceleration is available for breath detection */
export function isNativeBreathDetectionAvailable() {
    return getNativeModule() !== null;
}
const log = getLogger().child({ module: 'BreathDetection' });
// ============================================================================
// DETECTION THRESHOLDS (Tunable Constants)
// ============================================================================
/**
 * Breath detection configuration constants.
 * These can be tuned for different audio environments or sensitivity needs.
 */
export const BREATH_DETECTION_CONFIG = {
    // Window and analysis settings
    /** Window size in seconds for audio analysis */
    WINDOW_SIZE_SEC: 0.05, // 50ms windows
    /** Minimum features needed for analysis */
    MIN_FEATURES: 5,
    /** Maximum history events to keep */
    MAX_HISTORY: 30,
    // Sigh detection thresholds
    /** Energy ratio threshold for sigh detection (current vs previous) */
    SIGH_ENERGY_RATIO_PREV: 0.8,
    /** Energy ratio threshold for sigh detection (current vs next) */
    SIGH_ENERGY_RATIO_NEXT: 1.5,
    /** Maximum spectral centroid for sigh (Hz) */
    SIGH_MAX_CENTROID: 800,
    /** Confidence for sigh detection */
    SIGH_CONFIDENCE: 0.6,
    // Gasp detection thresholds
    /** Energy ratio threshold for gasp (current vs previous) */
    GASP_ENERGY_RATIO_PREV: 2.0,
    /** Energy ratio threshold for gasp (current vs next) */
    GASP_ENERGY_RATIO_NEXT: 1.5,
    /** Minimum spectral centroid for gasp (Hz) */
    GASP_MIN_CENTROID: 500,
    /** Confidence for gasp detection */
    GASP_CONFIDENCE: 0.5,
    // Held breath detection thresholds
    /** Maximum energy for held breath detection */
    HELD_MAX_ENERGY: 0.01,
    /** Minimum surrounding energy for held breath */
    HELD_MIN_SURROUNDING: 0.05,
    /** Confidence for held breath detection */
    HELD_CONFIDENCE: 0.55,
    // Deep breath detection thresholds
    /** Minimum peak energy for deep breath */
    DEEP_MIN_PEAK: 0.1,
    /** Bell curve edge ratio (edge energy < peak * ratio) */
    DEEP_BELL_RATIO: 0.5,
    /** Confidence for deep breath detection */
    DEEP_CONFIDENCE: 0.5,
    // Variability thresholds for breathing quality
    /** CV threshold for consistent breathing */
    VARIABILITY_CONSISTENT: 0.3,
    /** CV threshold for variable breathing */
    VARIABILITY_VARIABLE: 0.6,
};
// ============================================================================
// BREATH AUDIO SIGNATURES
// ============================================================================
/**
 * Audio characteristics for different breath types
 * These are heuristics based on typical audio signatures
 */
const BREATH_SIGNATURES = {
    sigh: {
        durationRange: [600, 2000], // 600ms - 2s
        energyProfile: 'decreasing', // Energy drops through the sigh
        frequencyRange: [200, 800], // Low frequency emphasis
        description: 'Exhale with energy fade, often with vocalization',
    },
    deep: {
        durationRange: [800, 2500],
        energyProfile: 'bell', // Energy rises then falls (inhale + exhale)
        frequencyRange: [100, 400],
        description: 'Full inhale followed by exhale, deliberate',
    },
    shaky: {
        durationRange: [400, 1500],
        energyProfile: 'irregular', // Uneven energy pattern
        frequencyRange: [200, 1000],
        description: 'Trembling exhale, uneven energy',
    },
    held: {
        durationRange: [500, 3000],
        energyProfile: 'silence', // Gap in audio
        frequencyRange: [0, 100],
        description: 'Absence of breath sound, tension',
    },
    release: {
        durationRange: [300, 1000],
        energyProfile: 'sudden_drop', // Quick energy release
        frequencyRange: [100, 600],
        description: 'Quick exhale, often with slight vocalization',
    },
    gasp: {
        durationRange: [100, 500],
        energyProfile: 'spike', // Sudden energy spike
        frequencyRange: [300, 1200],
        description: 'Sudden sharp inhale',
    },
};
// ============================================================================
// BREATH DETECTOR
// ============================================================================
export class BreathDetector {
    history = [];
    maxHistory = BREATH_DETECTION_CONFIG.MAX_HISTORY;
    constructor() {
        log.debug('BreathDetector initialized');
    }
    /**
     * Detect breath patterns from audio samples
     */
    analyzeAudio(samples, sampleRate) {
        const events = this.detectBreathEvents(samples, sampleRate);
        // Store events
        this.history.push(...events);
        if (this.history.length > this.maxHistory) {
            this.history = this.history.slice(-this.maxHistory);
        }
        // Determine dominant pattern
        const dominantPattern = this.getDominantPattern(events);
        // Assess breathing quality
        const breathingQuality = this.assessBreathingQuality(events);
        // Interpret emotional state
        const emotionalState = this.interpretEmotionalState(dominantPattern, breathingQuality, events);
        // Determine if space is needed
        const needsSpace = this.determineNeedsSpace(events, dominantPattern);
        // Generate guidance
        const guidance = this.generateGuidance(dominantPattern, emotionalState, needsSpace);
        // Confidence based on event detection
        const confidence = events.length > 0 ? events.reduce((sum, e) => sum + e.confidence, 0) / events.length : 0.3;
        const result = {
            events,
            dominantPattern,
            breathingQuality,
            emotionalState,
            needsSpace,
            guidance,
            confidence,
        };
        if (events.length > 0 && dominantPattern !== 'normal') {
            log.debug({ pattern: dominantPattern, quality: breathingQuality, eventCount: events.length }, '🫁 Breath pattern detected');
        }
        return result;
    }
    /**
     * Get breath characteristics over recent history
     */
    getBreathCharacteristics() {
        if (this.history.length < 3) {
            return {
                breathSpeechRatio: 0.1,
                breathsPerMinute: 15,
                variability: 'consistent',
            };
        }
        // Calculate breath-to-speech ratio (approximation)
        const avgDuration = this.history.reduce((sum, e) => sum + e.durationMs, 0) / this.history.length;
        const breathSpeechRatio = Math.min(1, avgDuration / 1000);
        // Estimate breaths per minute based on event frequency
        const timeSpan = this.history.length > 1
            ? this.history[this.history.length - 1].position - this.history[0].position
            : 1;
        const breathsPerMinute = timeSpan > 0 ? (this.history.length / timeSpan) * 60 : 15;
        // Assess variability
        const durations = this.history.map((e) => e.durationMs);
        const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
        const variance = durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length;
        const cv = Math.sqrt(variance) / mean; // Coefficient of variation
        let variability;
        if (cv < BREATH_DETECTION_CONFIG.VARIABILITY_CONSISTENT)
            variability = 'consistent';
        else if (cv < BREATH_DETECTION_CONFIG.VARIABILITY_VARIABLE)
            variability = 'variable';
        else
            variability = 'erratic';
        return { breathSpeechRatio, breathsPerMinute, variability };
    }
    /**
     * Check if a significant breath preceded the current speech
     */
    checkPreSpeechBreath() {
        if (this.history.length === 0)
            return null;
        const recent = this.history[this.history.length - 1];
        if (recent.precedesSpeech && recent.type !== 'normal') {
            return recent;
        }
        return null;
    }
    /**
     * Reset detector
     */
    reset() {
        this.history = [];
        log.debug('BreathDetector reset');
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    detectBreathEvents(samples, sampleRate) {
        const events = [];
        const windowSize = Math.floor(sampleRate * BREATH_DETECTION_CONFIG.WINDOW_SIZE_SEC);
        const hopSize = Math.floor(windowSize / 2);
        // Get Rust module for acceleration (if available)
        const native = getNativeModule();
        // Calculate energy and spectral features for each window
        const features = [];
        for (let i = 0; i < samples.length - windowSize; i += hopSize) {
            const window = samples.slice(i, i + windowSize);
            // Energy (RMS) and Zero Crossings - Use Rust when available for ~10-20x speedup
            let energy;
            let zeroCrossings;
            if (native) {
                energy = native.computeRms(window);
                zeroCrossings = native.computeZcr(window) * window.length; // ZCR returns ratio, convert back
            }
            else {
                // JavaScript fallback for Energy (RMS)
                let energySum = 0;
                for (const sample of window) {
                    energySum += sample * sample;
                }
                energy = Math.sqrt(energySum / window.length);
                // JavaScript fallback for Zero crossings
                zeroCrossings = 0;
                for (let j = 1; j < window.length; j++) {
                    if (Math.sign(window[j]) !== Math.sign(window[j - 1])) {
                        zeroCrossings++;
                    }
                }
            }
            // Spectral centroid approximation
            const spectralCentroid = (zeroCrossings / window.length) * sampleRate;
            features.push({
                position: i / samples.length,
                energy,
                spectralCentroid,
                zeroCrossings,
            });
        }
        if (features.length < BREATH_DETECTION_CONFIG.MIN_FEATURES)
            return events;
        // Look for breath patterns
        // Sighs: low frequency, decreasing energy over 600ms+
        // Deep breaths: bell curve energy pattern
        // Gasps: sudden energy spike with high frequency
        // Held breath: energy gap followed by release
        // Simple heuristic detection
        for (let i = 2; i < features.length - 2; i++) {
            const curr = features[i];
            const prev2 = features[i - 2];
            const next2 = features[i + 2];
            // Detect sigh (decreasing energy, low freq)
            if (curr.energy > prev2.energy * BREATH_DETECTION_CONFIG.SIGH_ENERGY_RATIO_PREV &&
                curr.energy > next2.energy * BREATH_DETECTION_CONFIG.SIGH_ENERGY_RATIO_NEXT &&
                curr.spectralCentroid < BREATH_DETECTION_CONFIG.SIGH_MAX_CENTROID) {
                events.push({
                    type: 'sigh',
                    durationMs: ((hopSize * 4) / sampleRate) * 1000,
                    position: curr.position,
                    precedesSpeech: i < features.length - 5,
                    confidence: BREATH_DETECTION_CONFIG.SIGH_CONFIDENCE,
                    emotionalIndicator: 'Possible resignation, fatigue, or release',
                });
                i += 4; // Skip ahead
                continue;
            }
            // Detect gasp (sudden spike)
            if (curr.energy > prev2.energy * BREATH_DETECTION_CONFIG.GASP_ENERGY_RATIO_PREV &&
                curr.energy > next2.energy * BREATH_DETECTION_CONFIG.GASP_ENERGY_RATIO_NEXT &&
                curr.spectralCentroid > BREATH_DETECTION_CONFIG.GASP_MIN_CENTROID) {
                events.push({
                    type: 'gasp',
                    durationMs: ((hopSize * 2) / sampleRate) * 1000,
                    position: curr.position,
                    precedesSpeech: i < features.length - 3,
                    confidence: BREATH_DETECTION_CONFIG.GASP_CONFIDENCE,
                    emotionalIndicator: 'Surprise, shock, or sudden realization',
                });
                i += 2;
                continue;
            }
            // Detect held breath (energy gap)
            if (curr.energy < BREATH_DETECTION_CONFIG.HELD_MAX_ENERGY &&
                prev2.energy > BREATH_DETECTION_CONFIG.HELD_MIN_SURROUNDING &&
                next2.energy > BREATH_DETECTION_CONFIG.HELD_MIN_SURROUNDING) {
                events.push({
                    type: 'held',
                    durationMs: ((hopSize * 4) / sampleRate) * 1000,
                    position: curr.position,
                    precedesSpeech: true,
                    confidence: BREATH_DETECTION_CONFIG.HELD_CONFIDENCE,
                    emotionalIndicator: 'Bracing, anticipation, or tension',
                });
                i += 2;
                continue;
            }
            // Detect deep breath (bell curve - energy rises then falls over longer period)
            if (i > 3 && i < features.length - 4) {
                const window = features.slice(i - 3, i + 4);
                const energies = window.map((f) => f.energy);
                const peak = Math.max(...energies);
                const peakIdx = energies.indexOf(peak);
                if (peakIdx > 0 &&
                    peakIdx < energies.length - 1 &&
                    peak > BREATH_DETECTION_CONFIG.DEEP_MIN_PEAK) {
                    const isBellCurve = energies[0] < peak * BREATH_DETECTION_CONFIG.DEEP_BELL_RATIO &&
                        energies[energies.length - 1] < peak * BREATH_DETECTION_CONFIG.DEEP_BELL_RATIO;
                    if (isBellCurve) {
                        events.push({
                            type: 'deep',
                            durationMs: ((hopSize * 7) / sampleRate) * 1000,
                            position: curr.position,
                            precedesSpeech: i < features.length - 5,
                            confidence: BREATH_DETECTION_CONFIG.DEEP_CONFIDENCE,
                            emotionalIndicator: 'Gathering courage, centering, or calming',
                        });
                        i += 6;
                        continue;
                    }
                }
            }
        }
        return events;
    }
    getDominantPattern(events) {
        if (events.length === 0)
            return 'normal';
        const counts = new Map();
        for (const e of events) {
            counts.set(e.type, (counts.get(e.type) || 0) + 1);
        }
        let max = 0;
        let dominant = 'normal';
        counts.forEach((count, type) => {
            if (count > max) {
                max = count;
                dominant = type;
            }
        });
        return dominant;
    }
    assessBreathingQuality(events) {
        if (events.length === 0)
            return 'calm';
        const types = events.map((e) => e.type);
        // Shaky or multiple gasps = labored
        if (types.includes('shaky') || types.filter((t) => t === 'gasp').length >= 2) {
            return 'labored';
        }
        // Mix of different patterns = irregular
        const uniqueTypes = new Set(types);
        if (uniqueTypes.size >= 3) {
            return 'irregular';
        }
        // Multiple held breaths = controlled (possibly tense)
        if (types.filter((t) => t === 'held').length >= 2) {
            return 'controlled';
        }
        // Multiple sighs or release = shallow
        if (types.filter((t) => t === 'sigh' || t === 'release').length >= 2) {
            return 'shallow';
        }
        return 'calm';
    }
    interpretEmotionalState(dominant, quality, events) {
        const interpretations = {
            sigh: 'Possible fatigue, resignation, or emotional release',
            held: 'Tension, bracing for something difficult, or trying to maintain control',
            deep: 'Centering, gathering courage, or preparing for something important',
            shaky: 'Strong emotion being held back, possibly anxiety or tears',
            release: 'Letting go, relief, or moving past something',
            gasp: 'Surprise, shock, or sudden emotional impact',
            normal: 'Breathing appears relaxed and natural',
        };
        let state = interpretations[dominant];
        if (quality === 'labored') {
            state += '. Breathing seems effortful - may be under stress.';
        }
        else if (quality === 'irregular') {
            state += '. Breathing pattern is variable - emotional state may be shifting.';
        }
        return state;
    }
    determineNeedsSpace(events, dominant) {
        // These breath patterns suggest giving more space
        const spacePrecedingTypes = ['sigh', 'held', 'shaky', 'deep'];
        if (spacePrecedingTypes.includes(dominant)) {
            return true;
        }
        // Multiple significant breath events = give space
        if (events.filter((e) => e.type !== 'normal').length >= 2) {
            return true;
        }
        return false;
    }
    generateGuidance(dominant, emotionalState, needsSpace) {
        if (!needsSpace && dominant === 'normal') {
            return 'Breathing is natural - conversation can flow normally.';
        }
        const guidance = {
            sigh: "User sighed - acknowledge what they said, don't rush past it.",
            held: 'User held their breath - they may be preparing to share something difficult. Give them space.',
            deep: "User took a deep breath - they're centering themselves. Be patient and present.",
            shaky: 'Breathing seems unsteady - user may be holding back emotion. Be gentle and validating.',
            release: 'User exhaled with relief - acknowledge the release and what led to it.',
            gasp: 'User gasped - check in on what surprised or impacted them.',
            normal: 'Continue conversing naturally.',
        };
        return guidance[dominant];
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';
const breathDetectorRegistry = createSessionRegistry((sessionId) => new BreathDetector(), {
    name: 'BreathDetector',
    cleanup: (detector) => detector.reset(),
    verbose: false,
});
registerGlobalRegistry(breathDetectorRegistry);
export function getBreathDetector(sessionId) {
    return breathDetectorRegistry.get(sessionId);
}
export function resetBreathDetector(sessionId) {
    breathDetectorRegistry.reset(sessionId);
}
export function resetAllBreathDetectors() {
    breathDetectorRegistry.resetAll();
}
export function getActiveBreathDetectorCount() {
    return breathDetectorRegistry.getActiveCount();
}
export default BreathDetector;
//# sourceMappingURL=breath-detection.js.map