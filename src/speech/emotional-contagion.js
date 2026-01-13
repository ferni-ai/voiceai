/**
 * Emotional Contagion Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Maintains prosodic and emotional continuity across utterances.
 * Humans don't reset their voice between sentences - if they're comforting
 * someone, warmth carries through. If they're excited, energy builds.
 *
 * This service:
 * 1. Tracks emotional "momentum" across turns
 * 2. Provides SSML hints for TTS to maintain continuity
 * 3. Prevents jarring emotional resets between sentences
 * 4. Enables gradual emotional transitions
 *
 * @module EmotionalContagion
 */
import { getLogger } from '../utils/safe-logger.js';
const log = getLogger().child({ module: 'EmotionalContagion' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONTAGION_CONFIG = {
    /** How much recent utterances influence momentum (0-1) */
    MOMENTUM_DECAY: 0.3,
    /** Turns needed to establish stable state */
    STABLE_TURNS: 3,
    /** Maximum warmth duration (turns) before natural decay */
    MAX_WARMTH_TURNS: 10,
    /** Speed at which arousal normalizes */
    AROUSAL_NORMALIZATION_RATE: 0.1,
};
// ============================================================================
// EMOTIONAL CONTAGION SERVICE
// ============================================================================
export class EmotionalContagionService {
    utteranceHistory = [];
    momentum;
    maxHistory = 10;
    sessionId;
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.momentum = this.createInitialMomentum();
        log.debug({ sessionId }, '💫 Emotional contagion service initialized');
    }
    /**
     * Record an utterance's emotional state
     * Call this AFTER each agent utterance is generated
     */
    recordUtterance(state) {
        const fullState = {
            ...state,
            timestamp: Date.now(),
        };
        this.utteranceHistory.push(fullState);
        if (this.utteranceHistory.length > this.maxHistory) {
            this.utteranceHistory.shift();
        }
        // Update momentum
        this.updateMomentum(fullState);
        log.debug({
            emotion: state.emotion,
            valence: state.valence.toFixed(2),
            arousal: state.arousal.toFixed(2),
            warmth: state.warmth,
            momentumTrend: this.momentum.trend,
        }, '💫 Utterance emotional state recorded');
    }
    /**
     * Get prosody hints for the NEXT utterance
     * Call this BEFORE generating TTS
     */
    getContinuityHints(emotionalArc, currentEmotion) {
        const hints = {
            opening: {
                pauseMs: 100,
                softStart: false,
                buildEnergy: false,
            },
            prosody: {
                speedAdjust: 0,
                volumeAdjust: 1.0,
                pitchTendency: 'neutral',
            },
            emotion: {
                tag: 'neutral',
                intensity: 0.5,
            },
            closingWarmth: false,
            reason: 'Default neutral state',
        };
        const reasons = [];
        // Apply momentum-based adjustments
        if (this.momentum.turnsAtState >= CONTAGION_CONFIG.STABLE_TURNS) {
            // Stable emotional state - maintain it
            // High warmth should continue
            if (this.momentum.warmth === 'high') {
                hints.emotion.tag = 'warm';
                hints.emotion.intensity = 0.7;
                hints.prosody.pitchTendency = 'lower'; // Warmer voices tend lower
                hints.prosody.volumeAdjust = 0.95; // Slightly softer
                hints.closingWarmth = true;
                reasons.push('maintaining high warmth');
            }
            // High arousal should continue
            if (this.momentum.arousal > 0.6) {
                hints.prosody.speedAdjust = 0.1; // Slightly faster
                hints.opening.buildEnergy = true;
                hints.prosody.volumeAdjust = Math.min(hints.prosody.volumeAdjust * 1.1, 1.15);
                reasons.push('maintaining high energy');
            }
            // Low arousal (calm) should continue
            if (this.momentum.arousal < 0.4) {
                hints.prosody.speedAdjust = -0.1; // Slower
                hints.opening.pauseMs = 200;
                reasons.push('maintaining calm state');
            }
        }
        // Momentum trend adjustments
        if (this.momentum.trend === 'building') {
            hints.opening.buildEnergy = true;
            hints.prosody.speedAdjust = Math.min(hints.prosody.speedAdjust + 0.05, 0.2);
            reasons.push('energy building');
        }
        else if (this.momentum.trend === 'dissipating') {
            hints.opening.softStart = true;
            hints.prosody.speedAdjust = Math.max(hints.prosody.speedAdjust - 0.05, -0.2);
            reasons.push('energy settling');
        }
        // Incorporate emotional arc if available
        if (emotionalArc) {
            if (emotionalArc.needsEmotionalSupport) {
                hints.emotion.tag = 'empathetic';
                hints.emotion.intensity = 0.8;
                hints.opening.pauseMs = Math.max(hints.opening.pauseMs, 250);
                hints.closingWarmth = true;
                reasons.push('emotional support needed');
            }
            if (emotionalArc.suddenShiftDetected) {
                // After sudden shift, start fresh but gentle
                hints.opening.pauseMs = Math.max(hints.opening.pauseMs, 300);
                hints.opening.softStart = true;
                reasons.push('post-shift gentleness');
            }
            // Apply arc valence
            if (emotionalArc.currentValence > 0.5) {
                hints.emotion.tag = hints.emotion.tag === 'neutral' ? 'positive' : hints.emotion.tag;
                hints.prosody.pitchTendency = 'higher';
                reasons.push('positive arc');
            }
            else if (emotionalArc.currentValence < -0.3) {
                hints.emotion.tag = 'gentle';
                hints.prosody.pitchTendency = 'lower';
                reasons.push('supporting through difficulty');
            }
        }
        // Carry forward from recent utterance
        const lastUtterance = this.utteranceHistory[this.utteranceHistory.length - 1];
        if (lastUtterance) {
            // If last was highly supportive, continue the warmth
            if (lastUtterance.wasSupporting && lastUtterance.warmth === 'high') {
                hints.emotion.tag = 'empathetic';
                hints.closingWarmth = true;
                if (!reasons.includes('maintaining high warmth')) {
                    reasons.push('continuing support');
                }
            }
            // Prevent jarring energy changes
            const arousalDiff = Math.abs(this.momentum.arousal - lastUtterance.arousal);
            if (arousalDiff > 0.3) {
                hints.opening.softStart = true;
                hints.opening.pauseMs = Math.max(hints.opening.pauseMs, 200);
                reasons.push('smoothing energy transition');
            }
        }
        hints.reason = reasons.length > 0 ? reasons.join(', ') : 'Default neutral state';
        // Clamp values
        hints.prosody.speedAdjust = Math.max(-0.3, Math.min(0.3, hints.prosody.speedAdjust));
        hints.prosody.volumeAdjust = Math.max(0.8, Math.min(1.2, hints.prosody.volumeAdjust));
        hints.opening.pauseMs = Math.max(0, Math.min(500, hints.opening.pauseMs));
        return hints;
    }
    /**
     * Apply continuity hints to SSML
     */
    applyContinuityToSsml(text, hints) {
        let result = text;
        // Opening pause
        if (hints.opening.pauseMs >= 100) {
            result = `<break time="${hints.opening.pauseMs}ms"/>${result}`;
        }
        // Soft start: add a tiny pause after first few words
        if (hints.opening.softStart) {
            // Add pause after first comma or after ~3 words
            const words = result.split(' ');
            if (words.length > 3) {
                // Insert soft pause after 2-3 words
                const insertAt = Math.min(3, Math.floor(words.length * 0.2));
                words.splice(insertAt, 0, '<break time="80ms"/>');
                result = words.join(' ');
            }
        }
        // Closing warmth: slow down final phrase
        if (hints.closingWarmth) {
            // Add slight pause before final sentence if multiple sentences
            result = result.replace(/\.\s+([A-Z][^.!?]*[.!?])$/, '.<break time="150ms"/> $1');
        }
        return result;
    }
    /**
     * Get current emotional momentum
     */
    getMomentum() {
        return { ...this.momentum };
    }
    /**
     * Update momentum based on new utterance
     */
    updateMomentum(state) {
        const decay = CONTAGION_CONFIG.MOMENTUM_DECAY;
        // Blend new state with existing momentum
        const newValence = decay * this.momentum.valence + (1 - decay) * state.valence;
        const newArousal = decay * this.momentum.arousal + (1 - decay) * state.arousal;
        // Detect trend
        let trend = 'stable';
        if (state.arousal > this.momentum.arousal + 0.1) {
            trend = 'building';
        }
        else if (state.arousal < this.momentum.arousal - 0.1) {
            trend = 'dissipating';
        }
        // Update warmth (warmth is sticky - doesn't change quickly)
        let newWarmth = this.momentum.warmth;
        if (state.wasSupporting || state.warmth === 'high') {
            newWarmth = 'high';
        }
        else if (this.momentum.turnsAtState > CONTAGION_CONFIG.MAX_WARMTH_TURNS &&
            this.momentum.warmth === 'high') {
            newWarmth = 'medium'; // Natural decay
        }
        // Update turns at state
        const sameState = Math.abs(newValence - this.momentum.valence) < 0.1 &&
            Math.abs(newArousal - this.momentum.arousal) < 0.1;
        this.momentum = {
            valence: newValence,
            arousal: newArousal,
            warmth: newWarmth,
            turnsAtState: sameState ? this.momentum.turnsAtState + 1 : 1,
            trend,
        };
    }
    /**
     * Create initial momentum state
     */
    createInitialMomentum() {
        return {
            valence: 0.2, // Slightly positive default
            arousal: 0.5, // Moderate energy
            warmth: 'medium',
            turnsAtState: 0,
            trend: 'stable',
        };
    }
    /**
     * Reset service state
     */
    reset() {
        this.utteranceHistory = [];
        this.momentum = this.createInitialMomentum();
        log.debug({ sessionId: this.sessionId }, '💫 Emotional contagion reset');
    }
}
// ============================================================================
// SESSION REGISTRY
// ============================================================================
import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';
/**
 * Session registry for emotional contagion services.
 * Provides automatic cleanup and lifecycle management.
 */
const emotionalContagionRegistry = createSessionRegistry((sessionId) => new EmotionalContagionService(sessionId), {
    name: 'EmotionalContagion',
    cleanup: (service) => service.reset(),
    verbose: false,
});
// Register globally for coordinated session cleanup
registerGlobalRegistry(emotionalContagionRegistry);
/**
 * Get or create emotional contagion service for a session
 */
export function getEmotionalContagionService(sessionId) {
    return emotionalContagionRegistry.get(sessionId);
}
/**
 * Reset emotional contagion for a session
 */
export function resetEmotionalContagion(sessionId) {
    emotionalContagionRegistry.reset(sessionId);
}
/**
 * Reset all instances
 */
export function resetAllEmotionalContagion() {
    emotionalContagionRegistry.resetAll();
}
/**
 * Check if a session has emotional contagion service
 */
export function hasEmotionalContagion(sessionId) {
    return emotionalContagionRegistry.has(sessionId);
}
/**
 * Get count of active emotional contagion sessions
 */
export function getActiveEmotionalContagionCount() {
    return emotionalContagionRegistry.getActiveCount();
}
//# sourceMappingURL=emotional-contagion.js.map