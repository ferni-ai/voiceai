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
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'EnvironmentTracker' });
// ============================================================================
// CONFIGURATION
// ============================================================================
export const ENVIRONMENT_CONFIG = {
    /** Number of samples for baseline (at ~10 samples/sec, this is ~1 second) */
    BASELINE_SAMPLES: 10,
    /** Maximum age of baseline sample before refresh (ms) */
    BASELINE_MAX_AGE_MS: 30_000,
    /** Threshold for noise increase detection (dB) */
    NOISE_INCREASE_MINOR: 3,
    NOISE_INCREASE_MODERATE: 6,
    NOISE_INCREASE_MAJOR: 12,
    /** Threshold for noise decrease detection (dB) */
    NOISE_DECREASE_THRESHOLD: 6,
    /** Cooldown between similar events (ms) */
    EVENT_COOLDOWN_MS: 10_000,
    /** Duration to keep events in recent list (ms) */
    EVENT_RETENTION_MS: 60_000,
    /** Confidence threshold for events */
    CONFIDENCE_THRESHOLD: 0.6,
    /** TTS adjustments by severity */
    TTS_ADJUSTMENTS: {
        minor: { volumeBoost: 0.05, clarity: false, speed: 1.0, pause: 0 },
        moderate: { volumeBoost: 0.1, clarity: true, speed: 0.95, pause: 100 },
        major: { volumeBoost: 0.15, clarity: true, speed: 0.9, pause: 200 },
    },
    /** Spectral thresholds for event detection */
    SPECTRAL: {
        /** High-frequency energy for doorbell detection */
        DOORBELL_HIGH_FREQ_THRESHOLD: 0.4,
        /** Mid-frequency energy for phone ring */
        PHONE_RING_MID_THRESHOLD: 0.5,
    },
};
// ============================================================================
// ACKNOWLEDGMENT PHRASES
// ============================================================================
/**
 * Persona-agnostic acknowledgment phrases for different events
 * (Persona bundles can override these)
 */
const DEFAULT_ACKNOWLEDGMENTS = {
    noise_increase: [
        "It's getting a bit noisy there.",
        'I can hear some background noise.',
        'Sounds like things are busy around you.',
    ],
    noise_decrease: [],
    new_voice: ['Take your time.', 'I can wait.', "Go ahead, I'm here when you're ready."],
    doorbell: [
        'I heard that—go ahead if you need to get the door.',
        'Take your time if you need to get that.',
        "I'll be here when you're back.",
    ],
    pet_sound: ['Sounds like someone wants attention!', 'I heard a furry friend.'],
    phone_ring: ['I can wait if you need to get that.', 'No rush—take the call if you need to.'],
    music_start: [],
    music_stop: [],
    silence: [],
    crowd_noise: ["Sounds like you're in a busy place.", "I'll speak a bit clearer for you."],
};
// ============================================================================
// SESSION-SCOPED TRACKERS
// ============================================================================
const trackers = new Map();
/**
 * Get or create environment tracker for a session
 */
export function getEnvironmentTracker(sessionId) {
    if (!trackers.has(sessionId)) {
        trackers.set(sessionId, new EnvironmentTracker(sessionId));
    }
    return trackers.get(sessionId);
}
/**
 * Reset environment tracker for a session
 */
export function resetEnvironmentTracker(sessionId) {
    const tracker = trackers.get(sessionId);
    if (tracker) {
        log.debug({ sessionId, eventCount: tracker.getState().recentEvents.length }, 'Resetting environment tracker');
    }
    trackers.delete(sessionId);
}
/**
 * Get count of active trackers
 */
export function getActiveEnvironmentTrackerCount() {
    return trackers.size;
}
// ============================================================================
// ENVIRONMENT TRACKER CLASS
// ============================================================================
export class EnvironmentTracker {
    sessionId;
    baselineSamples = [];
    recentSnapshots = [];
    recentEvents = [];
    lastEventByType = new Map();
    pendingAcknowledgment = null;
    lastMajorEventAt = null;
    constructor(sessionId) {
        this.sessionId = sessionId;
        log.debug({ sessionId }, 'EnvironmentTracker initialized');
    }
    /**
     * Process an audio snapshot
     */
    processSnapshot(snapshot) {
        const now = Date.now();
        // Store snapshot
        this.recentSnapshots.push(snapshot);
        if (this.recentSnapshots.length > 50) {
            this.recentSnapshots.shift();
        }
        // Update baseline
        this.updateBaseline(snapshot);
        // Clean up old events
        this.cleanupOldEvents(now);
        // Detect events
        const event = this.detectEvent(snapshot, now);
        if (event) {
            this.recordEvent(event);
            return event;
        }
        return null;
    }
    /**
     * Update rolling baseline
     */
    updateBaseline(snapshot) {
        const now = Date.now();
        // Remove old baseline samples
        this.baselineSamples = this.baselineSamples.filter((s) => now - s.timestamp < ENVIRONMENT_CONFIG.BASELINE_MAX_AGE_MS);
        // Add new sample if baseline isn't full
        if (this.baselineSamples.length < ENVIRONMENT_CONFIG.BASELINE_SAMPLES) {
            this.baselineSamples.push(snapshot);
        }
        else {
            // Replace oldest sample
            this.baselineSamples.shift();
            this.baselineSamples.push(snapshot);
        }
    }
    /**
     * Get baseline noise level
     */
    getBaselineNoiseDb() {
        if (this.baselineSamples.length === 0) {
            return -40; // Default quiet baseline
        }
        const sum = this.baselineSamples.reduce((acc, s) => acc + s.noiseDb, 0);
        return sum / this.baselineSamples.length;
    }
    /**
     * Detect environment events
     */
    detectEvent(snapshot, now) {
        const baselineDb = this.getBaselineNoiseDb();
        const dbChange = snapshot.noiseDb - baselineDb;
        // Check for noise increase
        if (dbChange > ENVIRONMENT_CONFIG.NOISE_INCREASE_MAJOR) {
            if (this.canEmitEvent('noise_increase', now)) {
                return this.createEvent('noise_increase', 'major', 0.85, dbChange);
            }
        }
        else if (dbChange > ENVIRONMENT_CONFIG.NOISE_INCREASE_MODERATE) {
            if (this.canEmitEvent('noise_increase', now)) {
                return this.createEvent('noise_increase', 'moderate', 0.75, dbChange);
            }
        }
        else if (dbChange > ENVIRONMENT_CONFIG.NOISE_INCREASE_MINOR) {
            if (this.canEmitEvent('noise_increase', now)) {
                return this.createEvent('noise_increase', 'minor', 0.65, dbChange);
            }
        }
        // Check for noise decrease
        if (dbChange < -ENVIRONMENT_CONFIG.NOISE_DECREASE_THRESHOLD) {
            if (this.canEmitEvent('noise_decrease', now)) {
                return this.createEvent('noise_decrease', 'minor', 0.7, dbChange);
            }
        }
        // Check for new voice (speech in a previously quiet environment)
        const previousEnv = this.recentSnapshots[this.recentSnapshots.length - 2]?.environment;
        if (snapshot.hasSpeech && previousEnv === 'quiet' && snapshot.environment === 'speech') {
            if (this.canEmitEvent('new_voice', now)) {
                return this.createEvent('new_voice', 'major', 0.7);
            }
        }
        // Check for crowd noise
        if (snapshot.environment === 'crowd') {
            if (this.canEmitEvent('crowd_noise', now)) {
                return this.createEvent('crowd_noise', 'moderate', 0.65);
            }
        }
        // Check for music
        if (snapshot.hasMusic && previousEnv !== 'music' && snapshot.environment === 'music') {
            if (this.canEmitEvent('music_start', now)) {
                return this.createEvent('music_start', 'minor', 0.6);
            }
        }
        // Check for doorbell pattern (high-frequency burst)
        if (snapshot.bandEnergies.brilliance > ENVIRONMENT_CONFIG.SPECTRAL.DOORBELL_HIGH_FREQ_THRESHOLD &&
            snapshot.bandEnergies.presence > ENVIRONMENT_CONFIG.SPECTRAL.DOORBELL_HIGH_FREQ_THRESHOLD) {
            if (this.canEmitEvent('doorbell', now)) {
                return this.createEvent('doorbell', 'major', 0.6);
            }
        }
        return null;
    }
    /**
     * Check if we can emit an event (respecting cooldown)
     */
    canEmitEvent(type, now) {
        const lastTime = this.lastEventByType.get(type);
        if (!lastTime)
            return true;
        return now - lastTime > ENVIRONMENT_CONFIG.EVENT_COOLDOWN_MS;
    }
    /**
     * Create an event
     */
    createEvent(type, severity, confidence, dbChange) {
        return {
            type,
            severity,
            timestamp: Date.now(),
            confidence,
            dbChange,
        };
    }
    /**
     * Record an event and trigger responses
     */
    recordEvent(event) {
        this.recentEvents.push(event);
        this.lastEventByType.set(event.type, event.timestamp);
        if (event.severity === 'major') {
            this.lastMajorEventAt = event.timestamp;
            this.pendingAcknowledgment = this.generateAcknowledgment(event);
        }
        log.info({
            sessionId: this.sessionId,
            type: event.type,
            severity: event.severity,
            confidence: event.confidence.toFixed(2),
            dbChange: event.dbChange?.toFixed(1),
        }, '🌍 Environment event detected');
    }
    /**
     * Generate acknowledgment for an event
     */
    generateAcknowledgment(event) {
        const phrases = DEFAULT_ACKNOWLEDGMENTS[event.type];
        if (!phrases || phrases.length === 0) {
            return null;
        }
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        return {
            phrase,
            eventType: event.type,
            shouldPause: event.severity === 'major',
            pauseDurationMs: event.severity === 'major' ? 2000 : 500,
        };
    }
    /**
     * Clean up old events
     */
    cleanupOldEvents(now) {
        this.recentEvents = this.recentEvents.filter((e) => now - e.timestamp < ENVIRONMENT_CONFIG.EVENT_RETENTION_MS);
    }
    /**
     * Get current TTS adjustments
     */
    getTtsAdjustments() {
        const recentMajor = this.recentEvents.find((e) => e.severity === 'major');
        const recentModerate = this.recentEvents.find((e) => e.severity === 'moderate');
        const recentMinor = this.recentEvents.find((e) => e.severity === 'minor');
        let adjustment;
        if (recentMajor && Date.now() - recentMajor.timestamp < 30_000) {
            const cfg = ENVIRONMENT_CONFIG.TTS_ADJUSTMENTS.major;
            adjustment = {
                volumeBoost: cfg.volumeBoost,
                clarityMode: cfg.clarity,
                speedMultiplier: cfg.speed,
                extraPauseMs: cfg.pause,
                reason: `Major event: ${recentMajor.type}`,
            };
        }
        else if (recentModerate && Date.now() - recentModerate.timestamp < 20_000) {
            const cfg = ENVIRONMENT_CONFIG.TTS_ADJUSTMENTS.moderate;
            adjustment = {
                volumeBoost: cfg.volumeBoost,
                clarityMode: cfg.clarity,
                speedMultiplier: cfg.speed,
                extraPauseMs: cfg.pause,
                reason: `Moderate event: ${recentModerate.type}`,
            };
        }
        else if (recentMinor && Date.now() - recentMinor.timestamp < 10_000) {
            const cfg = ENVIRONMENT_CONFIG.TTS_ADJUSTMENTS.minor;
            adjustment = {
                volumeBoost: cfg.volumeBoost,
                clarityMode: cfg.clarity,
                speedMultiplier: cfg.speed,
                extraPauseMs: cfg.pause,
                reason: `Minor event: ${recentMinor.type}`,
            };
        }
        else {
            adjustment = {
                volumeBoost: 0,
                clarityMode: false,
                speedMultiplier: 1.0,
                extraPauseMs: 0,
                reason: 'No recent events',
            };
        }
        return adjustment;
    }
    /**
     * Get and consume pending acknowledgment
     */
    consumeAcknowledgment() {
        const ack = this.pendingAcknowledgment;
        this.pendingAcknowledgment = null;
        return ack;
    }
    /**
     * Check if there's a pending acknowledgment
     */
    hasPendingAcknowledgment() {
        return this.pendingAcknowledgment !== null;
    }
    /**
     * Get current state
     */
    getState() {
        const baselineDb = this.getBaselineNoiseDb();
        const currentDb = this.recentSnapshots[this.recentSnapshots.length - 1]?.noiseDb ?? baselineDb;
        const currentEnv = this.recentSnapshots[this.recentSnapshots.length - 1]?.environment ?? 'quiet';
        return {
            sessionId: this.sessionId,
            baselineNoiseDb: baselineDb,
            currentNoiseDb: currentDb,
            noiseChangeDb: currentDb - baselineDb,
            isNoisy: currentDb > baselineDb + ENVIRONMENT_CONFIG.NOISE_INCREASE_MODERATE,
            environment: currentEnv,
            recentEvents: [...this.recentEvents],
            currentAdjustments: this.getTtsAdjustments(),
            pendingAcknowledgment: this.pendingAcknowledgment,
            baselineSampleCount: this.baselineSamples.length,
            lastMajorEventAt: this.lastMajorEventAt,
        };
    }
    /**
     * Reset tracker
     */
    reset() {
        this.baselineSamples = [];
        this.recentSnapshots = [];
        this.recentEvents = [];
        this.lastEventByType.clear();
        this.pendingAcknowledgment = null;
        this.lastMajorEventAt = null;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const environmentTracker = {
    get: getEnvironmentTracker,
    reset: resetEnvironmentTracker,
    getActiveCount: getActiveEnvironmentTrackerCount,
    config: ENVIRONMENT_CONFIG,
};
//# sourceMappingURL=environment-tracker.js.map