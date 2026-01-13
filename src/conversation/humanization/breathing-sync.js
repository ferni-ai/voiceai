/**
 * Breathing Synchronization
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Subtly synchronize agent's speech breathing patterns with detected user
 * breathing, creating subconscious rapport. Research shows that breathing
 * synchronization builds trust and emotional connection.
 *
 * **How it works:**
 * - Detect user's breathing rate and phase from audio
 * - Time agent pauses to align with user's exhale
 * - Gradually shift agent's pacing to match user's rhythm
 * - Use breath sounds at key emotional moments
 *
 * **Note**: This is an advanced feature that requires good breath detection.
 * When detection is uncertain, we fall back to natural pacing.
 *
 * @module @ferni/humanization/breathing-sync
 */
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'BreathingSync' });
// ============================================================================
// BREATH SOUNDS
// ============================================================================
const BREATH_SSML = {
    subtle: '<break time="150ms"/>',
    audible: '<break time="200ms"/><amazon:breath duration="short" volume="soft"/>',
    deep: '<break time="300ms"/><amazon:breath duration="medium" volume="medium"/>',
    sigh: '<break time="250ms"/><amazon:breath duration="medium" volume="soft"/>',
};
// Fallback for TTS that doesn't support amazon:breath
const BREATH_SSML_FALLBACK = {
    subtle: '<break time="150ms"/>',
    audible: '<break time="250ms"/>',
    deep: '<break time="400ms"/>',
    sigh: '<break time="350ms"/>',
};
// ============================================================================
// BREATHING SYNC ENGINE
// ============================================================================
export class BreathingSyncEngine {
    state;
    useAmazonBreathTag;
    constructor(options = {}) {
        this.useAmazonBreathTag = options.useAmazonBreathTag ?? false;
        this.state = this.createInitialState();
        logger.debug('BreathingSyncEngine initialized');
    }
    /**
     * Update with detected user breath pattern
     */
    updateUserPattern(pattern) {
        // Only update if confident enough
        if (pattern.confidence < 0.4) {
            logger.debug({ confidence: pattern.confidence }, 'Breath pattern confidence too low');
            return;
        }
        // Smooth the pattern with previous readings
        if (this.state.userPattern) {
            const alpha = 0.3; // Smoothing factor
            pattern.breathsPerMinute =
                this.state.userPattern.breathsPerMinute * (1 - alpha) + pattern.breathsPerMinute * alpha;
            pattern.cycleDuration =
                this.state.userPattern.cycleDuration * (1 - alpha) + pattern.cycleDuration * alpha;
        }
        this.state.userPattern = pattern;
        this.updateAgentBreathRate();
        logger.debug({
            userBpm: pattern.breathsPerMinute.toFixed(1),
            agentBpm: this.state.agentBreathRate.toFixed(1),
            confidence: pattern.confidence.toFixed(2),
        }, '🫁 Breath pattern updated');
    }
    /**
     * Calculate sync adjustments for a piece of text
     */
    calculateAdjustments(text, emotionalContext) {
        const adjustedBreaks = [];
        const breathMarkers = [];
        // If no pattern or low confidence, return minimal adjustments
        if (!this.state.userPattern || !this.state.enabled) {
            return {
                adjustedBreaks: [],
                overallPacing: 1.0,
                breathMarkers: [],
                syncQuality: 0,
            };
        }
        const pattern = this.state.userPattern;
        // Find natural break points in text
        const breakPoints = this.findNaturalBreaks(text);
        // Calculate which breaks align with user's exhale
        const cycleDuration = pattern.cycleDuration;
        const exhaleStart = pattern.inhaleDuration;
        for (const breakPoint of breakPoints) {
            // Estimate timing at this break point (rough approximation)
            // In practice, this would use actual speech timing
            const estimatedTimeMs = (breakPoint.position / text.length) * (text.length * 50); // ~50ms per char
            // Check if this aligns with exhale phase
            const phasePosition = estimatedTimeMs % cycleDuration;
            const isExhaleAligned = phasePosition >= exhaleStart && phasePosition < cycleDuration * 0.8;
            if (isExhaleAligned || breakPoint.isEmphasis) {
                // This break aligns with exhale - extend it
                const baseDuration = breakPoint.isEmphasis ? 200 : 150;
                const syncBonus = isExhaleAligned ? 50 : 0;
                adjustedBreaks.push({
                    position: breakPoint.position,
                    duration: baseDuration + syncBonus,
                    addBreathSound: Boolean(breakPoint.isEmphasis && emotionalContext?.isEmotional),
                    reason: isExhaleAligned ? 'Exhale-aligned' : 'Emphasis point',
                });
                // Add breath marker for emotional moments
                if (breakPoint.isEmphasis && emotionalContext?.isHeavy) {
                    const breathSsml = this.getBreathSsml('deep');
                    breathMarkers.push({
                        position: breakPoint.position,
                        ssml: breathSsml,
                    });
                }
            }
        }
        // Calculate overall pacing to match breath rhythm
        const overallPacing = this.calculateSyncedPacing(pattern);
        // Calculate sync quality
        const syncQuality = this.calculateSyncQuality(adjustedBreaks, pattern);
        this.state.syncHistory.push(syncQuality);
        if (this.state.syncHistory.length > 10) {
            this.state.syncHistory.shift();
        }
        return {
            adjustedBreaks,
            overallPacing,
            breathMarkers,
            syncQuality,
        };
    }
    /**
     * Apply breathing sync to SSML
     */
    applyToSsml(ssml, adjustments) {
        if (adjustments.adjustedBreaks.length === 0 && adjustments.breathMarkers.length === 0) {
            return ssml;
        }
        let result = ssml;
        // Sort all insertions by position (descending to maintain positions)
        const allInsertions = [
            ...adjustments.adjustedBreaks.map((b) => ({
                position: b.position,
                ssml: `<break time="${b.duration}ms"/>`,
                type: 'break',
            })),
            ...adjustments.breathMarkers.map((b) => ({
                position: b.position,
                ssml: b.ssml,
                type: 'breath',
            })),
        ].sort((a, b) => b.position - a.position);
        // Insert from end to start to maintain positions
        for (const insertion of allInsertions) {
            // Find a good insertion point (after punctuation or space)
            let insertPos = insertion.position;
            while (insertPos < result.length && !/[\s.,!?]/.test(result[insertPos])) {
                insertPos++;
            }
            result = result.slice(0, insertPos) + insertion.ssml + result.slice(insertPos);
        }
        // Apply overall pacing if significant
        if (Math.abs(adjustments.overallPacing - 1.0) > 0.05) {
            const ratePercent = Math.round(adjustments.overallPacing * 100);
            result = `<prosody rate="${ratePercent}%">${result}</prosody>`;
        }
        return result;
    }
    /**
     * Get breath sync state
     */
    getState() {
        return {
            ...this.state,
            syncHistory: [...this.state.syncHistory],
        };
    }
    /**
     * Enable/disable breathing sync
     */
    setEnabled(enabled) {
        this.state.enabled = enabled;
        logger.debug({ enabled }, 'Breathing sync enabled state changed');
    }
    /**
     * Set sync strength (0-1)
     */
    setSyncStrength(strength) {
        this.state.syncStrength = Math.max(0, Math.min(1, strength));
    }
    /**
     * Get average sync quality
     */
    getAverageSyncQuality() {
        if (this.state.syncHistory.length === 0)
            return 0;
        return this.state.syncHistory.reduce((a, b) => a + b, 0) / this.state.syncHistory.length;
    }
    /**
     * Check if we have valid breath data
     */
    hasValidData() {
        return (this.state.userPattern !== null &&
            this.state.userPattern.confidence >= 0.4 &&
            this.state.userPattern.breathsPerMinute >= 8 &&
            this.state.userPattern.breathsPerMinute <= 30);
    }
    /**
     * Reset for new session
     */
    reset() {
        this.state = this.createInitialState();
        logger.debug('BreathingSyncEngine reset');
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    createInitialState() {
        return {
            enabled: true,
            userPattern: null,
            syncStrength: 0.5,
            agentBreathRate: 15, // Default natural rate
            alignmentAccuracy: 0,
            syncHistory: [],
        };
    }
    updateAgentBreathRate() {
        if (!this.state.userPattern)
            return;
        const userRate = this.state.userPattern.breathsPerMinute;
        // Gradually shift toward user's rate
        // Don't shift too far from natural range (12-20 bpm)
        const naturalMin = 12;
        const naturalMax = 20;
        const targetRate = Math.max(naturalMin, Math.min(naturalMax, userRate));
        // Apply sync strength
        const currentRate = this.state.agentBreathRate;
        const newRate = currentRate + (targetRate - currentRate) * this.state.syncStrength * 0.3;
        this.state.agentBreathRate = newRate;
    }
    findNaturalBreaks(text) {
        const breaks = [];
        // Sentence breaks
        const sentencePattern = /[.!?]+/g;
        let match;
        while ((match = sentencePattern.exec(text)) !== null) {
            breaks.push({
                position: match.index + match[0].length,
                type: 'sentence',
                isEmphasis: match[0].includes('!'),
            });
        }
        // Clause breaks (commas, semicolons, dashes)
        const clausePattern = /[,;—–-]/g;
        while ((match = clausePattern.exec(text)) !== null) {
            breaks.push({
                position: match.index + match[0].length,
                type: 'clause',
                isEmphasis: false,
            });
        }
        // Emphasis markers (before important words)
        const emphasisPatterns = [
            /\b(really|truly|actually|honestly|important|crucial)\b/gi,
            /\b(but|however|yet|still)\b/gi,
        ];
        for (const pattern of emphasisPatterns) {
            while ((match = pattern.exec(text)) !== null) {
                breaks.push({
                    position: match.index,
                    type: 'phrase',
                    isEmphasis: true,
                });
            }
        }
        // Sort by position
        return breaks.sort((a, b) => a.position - b.position);
    }
    calculateSyncedPacing(pattern) {
        // Calculate pacing that aligns with breath rhythm
        const targetCycleMs = pattern.cycleDuration;
        const naturalCycleMs = 4000; // ~15 bpm natural
        // Don't adjust too much (0.9 to 1.1)
        const ratio = targetCycleMs / naturalCycleMs;
        return Math.max(0.9, Math.min(1.1, ratio));
    }
    calculateSyncQuality(breaks, pattern) {
        if (breaks.length === 0)
            return 0.5;
        // Count exhale-aligned breaks
        const exhaleAligned = breaks.filter((b) => b.reason.includes('Exhale')).length;
        const alignmentRatio = exhaleAligned / breaks.length;
        // Factor in pattern confidence
        const confidenceWeight = pattern.confidence;
        return alignmentRatio * confidenceWeight;
    }
    getBreathSsml(type) {
        if (this.useAmazonBreathTag) {
            return BREATH_SSML[type];
        }
        return BREATH_SSML_FALLBACK[type];
    }
}
// ============================================================================
// BREATH PATTERN SIMULATOR
// ============================================================================
/**
 * Simulate breath detection for testing
 * In production, this would come from actual audio analysis
 */
export function simulateBreathPattern(hints) {
    let bpm = 15; // Normal
    let depth = 'normal';
    if (hints.isCalm) {
        bpm = 12;
        depth = 'deep';
    }
    else if (hints.isAnxious) {
        bpm = 20;
        depth = 'shallow';
    }
    else if (hints.isTired) {
        bpm = 14;
        depth = 'normal';
    }
    else if (hints.isExcited) {
        bpm = 18;
        depth = 'shallow';
    }
    const cycleDuration = 60000 / bpm;
    const inhaleDuration = cycleDuration * 0.4;
    const exhaleDuration = cycleDuration * 0.5;
    const pauseDuration = cycleDuration * 0.1;
    return {
        breathsPerMinute: bpm,
        cycleDuration,
        inhaleDuration,
        exhaleDuration,
        pauseDuration,
        currentPhase: 'exhale',
        nextExhaleMs: inhaleDuration,
        depth,
        confidence: 0.7,
    };
}
// ============================================================================
// SINGLETON
// ============================================================================
const engines = new Map();
export function getBreathingSyncEngine(sessionId, options) {
    if (!engines.has(sessionId)) {
        engines.set(sessionId, new BreathingSyncEngine(options));
    }
    return engines.get(sessionId);
}
export function resetBreathingSyncEngine(sessionId) {
    const engine = engines.get(sessionId);
    if (engine) {
        engine.reset();
        engines.delete(sessionId);
    }
}
export function resetAllBreathingSyncEngines() {
    engines.clear();
}
export default BreathingSyncEngine;
//# sourceMappingURL=breathing-sync.js.map