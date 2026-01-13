/**
 * Cognitive Load Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects when a user is mentally overloaded based on speech patterns.
 * Slower speech + longer pauses + more fillers = heavy mental processing.
 *
 * When cognitive load is high, the agent should:
 * - Use shorter sentences
 * - Give more processing time
 * - Simplify language
 * - Avoid rapid-fire questions
 *
 * Research basis:
 * - Cognitive load theory (Sweller, 1988)
 * - Speech rate decreases under cognitive load (Lively et al., 1993)
 * - Disfluency increases with processing difficulty (Clark & Fox Tree, 2002)
 *
 * @module CognitiveLoadDetection
 */
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger().child({ module: 'CognitiveLoad' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
/** Filler words that indicate cognitive processing */
const FILLER_PATTERNS = [
    /\b(um|uh|er|ah|eh|hmm|hm)\b/gi,
    /\b(like)\b(?!\s+(?:to|it|that|this|a|an|the))/gi, // "like" as filler, not comparison
    /\b(you know)\b/gi,
    /\b(I mean)\b/gi,
    /\b(basically)\b/gi,
    /\b(literally)\b/gi,
    /\b(kind of|kinda|sort of|sorta)\b/gi,
];
/** Self-correction patterns */
const SELF_CORRECTION_PATTERNS = [
    /\b(no wait|no, wait|wait no)\b/gi,
    /\b(I mean|what I mean is)\b/gi,
    /\b(actually|well actually)\b/gi,
    /\b(let me rephrase|let me start over)\b/gi,
    /\b(sorry|sorry,)\s+(I meant|what I meant)\b/gi,
    /\b(that's not what I|that's not right)\b/gi,
    /—\s*\w+/g, // Self-interruption with dash
];
/** Incomplete sentence patterns */
const INCOMPLETE_PATTERNS = [
    /\.\.\.\s*$/,
    /,\s*$/,
    /\band\s+(?:and\s+)*$/i,
    /\bso\s*$/i,
    /\bbut\s*$/i,
    /\bbecause\s*$/i,
];
/** Word/phrase repetition pattern */
const REPETITION_PATTERN = /\b(\w+)\s+\1\b/gi;
// ============================================================================
// COGNITIVE LOAD DETECTOR
// ============================================================================
export class CognitiveLoadDetector {
    observations = [];
    maxObservations = 20;
    // User's baseline speech characteristics (learned over time)
    baselineWPM = null;
    baselineFillerRate = null;
    constructor() {
        log.debug('CognitiveLoadDetector initialized');
    }
    // ==========================================================================
    // OBSERVATION & ANALYSIS
    // ==========================================================================
    /**
     * Analyze a user utterance for cognitive load indicators
     */
    analyzeUtterance(text, durationMs, pauseInfo) {
        const observation = this.extractObservation(text, durationMs, pauseInfo);
        this.observations.push(observation);
        // Keep only recent observations
        if (this.observations.length > this.maxObservations) {
            this.observations.shift();
        }
        // Update baseline if we have enough data
        this.updateBaseline();
        // Compute current state
        return this.computeState();
    }
    /**
     * Get current cognitive load state without new observation
     */
    getCurrentState() {
        return this.computeState();
    }
    /**
     * Record response latency (time between agent question and user response)
     */
    recordResponseLatency(latencyMs) {
        if (this.observations.length > 0) {
            // Update most recent observation with response latency
            // This is stored for trend analysis
            log.debug({ latencyMs }, 'Response latency recorded');
        }
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    extractObservation(text, durationMs, pauseInfo) {
        const words = text.split(/\s+/).filter((w) => w.length > 0);
        const wordCount = words.length;
        // Count fillers
        let fillerCount = 0;
        for (const pattern of FILLER_PATTERNS) {
            const matches = text.match(pattern);
            if (matches)
                fillerCount += matches.length;
        }
        // Count self-corrections
        let selfCorrectionCount = 0;
        for (const pattern of SELF_CORRECTION_PATTERNS) {
            const matches = text.match(pattern);
            if (matches)
                selfCorrectionCount += matches.length;
        }
        // Check for incomplete utterance
        let incompleteCount = 0;
        for (const pattern of INCOMPLETE_PATTERNS) {
            if (pattern.test(text)) {
                incompleteCount++;
                break; // Only count once per utterance
            }
        }
        // Count repetitions
        const repetitionMatches = text.match(REPETITION_PATTERN);
        const repetitionCount = repetitionMatches ? repetitionMatches.length : 0;
        return {
            timestamp: Date.now(),
            wordCount,
            durationMs,
            fillerCount,
            pauseCount: pauseInfo?.count ?? 0,
            totalPauseDurationMs: pauseInfo?.totalDurationMs ?? 0,
            selfCorrectionCount,
            incompleteCount,
            repetitionCount,
        };
    }
    updateBaseline() {
        // Need at least 5 observations to establish baseline
        if (this.observations.length < 5)
            return;
        // Use first 5 observations as baseline (assuming start of conversation is "normal")
        const baseline = this.observations.slice(0, 5);
        // Calculate baseline WPM (guard against division by zero)
        const totalWords = baseline.reduce((sum, o) => sum + o.wordCount, 0);
        const totalDuration = baseline.reduce((sum, o) => sum + o.durationMs, 0);
        // Only calculate WPM if we have meaningful duration and words
        if (totalDuration > 0 && totalWords > 0) {
            this.baselineWPM = (totalWords / totalDuration) * 60000;
        }
        else {
            // Use population average WPM when data insufficient
            this.baselineWPM = 150;
        }
        // Calculate baseline filler rate (per 100 words) - guard against division by zero
        const totalFillers = baseline.reduce((sum, o) => sum + o.fillerCount, 0);
        this.baselineFillerRate = totalWords > 0 ? (totalFillers / totalWords) * 100 : 3.0; // Population average
        log.debug({
            baselineWPM: this.baselineWPM?.toFixed(1),
            baselineFillerRate: this.baselineFillerRate?.toFixed(2),
        }, 'Updated baseline');
    }
    computeState() {
        if (this.observations.length === 0) {
            return this.getDefaultState();
        }
        // Use recent observations (last 3-5) for current state
        const recent = this.observations.slice(-Math.min(5, this.observations.length));
        // Calculate indicators
        const indicators = this.calculateIndicators(recent);
        // Determine load level
        const { level, confidence } = this.determineLoadLevel(indicators);
        // Generate guidance
        const guidance = this.generateGuidance(level, indicators);
        // Calculate adjustments
        const shouldSimplify = level === 'high' || level === 'overloaded';
        const shouldPauseMore = level !== 'low';
        const shouldBreakDown = level === 'overloaded';
        // SSML adjustments
        const ssmlAdjustments = {
            speedMultiplier: level === 'overloaded' ? 0.85 : level === 'high' ? 0.9 : 1.0,
            pauseMultiplier: level === 'overloaded' ? 1.5 : level === 'high' ? 1.3 : level === 'medium' ? 1.1 : 1.0,
        };
        const state = {
            level,
            indicators,
            confidence,
            shouldSimplify,
            shouldPauseMore,
            shouldBreakDown,
            guidance,
            ssmlAdjustments,
        };
        if (level !== 'low') {
            log.debug({ level, confidence: confidence.toFixed(2), guidance }, '🧠 Cognitive load detected');
        }
        return state;
    }
    calculateIndicators(observations) {
        const totalWords = observations.reduce((sum, o) => sum + o.wordCount, 0);
        const totalDuration = observations.reduce((sum, o) => sum + o.durationMs, 0);
        const totalFillers = observations.reduce((sum, o) => sum + o.fillerCount, 0);
        const totalPauses = observations.reduce((sum, o) => sum + o.pauseCount, 0);
        const totalPauseDuration = observations.reduce((sum, o) => sum + o.totalPauseDurationMs, 0);
        const totalSelfCorrections = observations.reduce((sum, o) => sum + o.selfCorrectionCount, 0);
        const totalIncomplete = observations.reduce((sum, o) => sum + o.incompleteCount, 0);
        const totalRepetitions = observations.reduce((sum, o) => sum + o.repetitionCount, 0);
        // Calculate current WPM
        const currentWPM = totalDuration > 0 ? (totalWords / totalDuration) * 60000 : 150;
        // Speech rate decline from baseline
        let speechRateDecline = 0;
        if (this.baselineWPM && this.baselineWPM > 0) {
            speechRateDecline = Math.max(0, (this.baselineWPM - currentWPM) / this.baselineWPM);
        }
        // Filler frequency (per 100 words)
        const fillerFrequency = totalWords > 0 ? (totalFillers / totalWords) * 100 : 0;
        // Average pause duration
        const averagePauseDuration = totalPauses > 0 ? totalPauseDuration / totalPauses : 0;
        return {
            speechRateDecline,
            fillerFrequency,
            averagePauseDuration,
            selfCorrections: totalSelfCorrections,
            incompleteUtterances: totalIncomplete,
            responseLatency: 0, // Would be set externally
            repetitionCount: totalRepetitions,
        };
    }
    determineLoadLevel(indicators) {
        let score = 0;
        let factors = 0;
        // Speech rate decline (0-30 points)
        if (indicators.speechRateDecline > 0.3) {
            score += 30;
            factors++;
        }
        else if (indicators.speechRateDecline > 0.2) {
            score += 20;
            factors++;
        }
        else if (indicators.speechRateDecline > 0.1) {
            score += 10;
            factors++;
        }
        // Filler frequency (0-25 points)
        // Normal is ~2-3 per 100 words, high load is 8+
        if (indicators.fillerFrequency > 10) {
            score += 25;
            factors++;
        }
        else if (indicators.fillerFrequency > 6) {
            score += 18;
            factors++;
        }
        else if (indicators.fillerFrequency > 4) {
            score += 10;
            factors++;
        }
        // Self-corrections (0-20 points)
        if (indicators.selfCorrections >= 3) {
            score += 20;
            factors++;
        }
        else if (indicators.selfCorrections >= 2) {
            score += 15;
            factors++;
        }
        else if (indicators.selfCorrections >= 1) {
            score += 8;
            factors++;
        }
        // Incomplete utterances (0-15 points)
        if (indicators.incompleteUtterances >= 2) {
            score += 15;
            factors++;
        }
        else if (indicators.incompleteUtterances >= 1) {
            score += 8;
            factors++;
        }
        // Repetitions (0-10 points)
        if (indicators.repetitionCount >= 3) {
            score += 10;
            factors++;
        }
        else if (indicators.repetitionCount >= 1) {
            score += 5;
            factors++;
        }
        // Determine level
        let level;
        if (score >= 70) {
            level = 'overloaded';
        }
        else if (score >= 45) {
            level = 'high';
        }
        else if (score >= 25) {
            level = 'medium';
        }
        else {
            level = 'low';
        }
        // Confidence based on observation count and factor diversity
        const observationConfidence = Math.min(1, this.observations.length / 5);
        const factorConfidence = factors > 0 ? Math.min(1, factors / 3) : 0.5;
        const confidence = (observationConfidence + factorConfidence) / 2;
        return { level, confidence };
    }
    generateGuidance(level, indicators) {
        switch (level) {
            case 'overloaded':
                return 'User is mentally overloaded. Use very simple language, short sentences, one question at a time. Give extra time to respond.';
            case 'high':
                return 'User is processing heavily. Slow down, avoid complex explanations, be patient with pauses.';
            case 'medium':
                return "User is thinking hard. Don't rush, allow natural pauses, keep sentences moderate length.";
            case 'low':
            default:
                return 'User is processing normally. Conversation can flow naturally.';
        }
    }
    getDefaultState() {
        return {
            level: 'low',
            indicators: {
                speechRateDecline: 0,
                fillerFrequency: 0,
                averagePauseDuration: 0,
                selfCorrections: 0,
                incompleteUtterances: 0,
                responseLatency: 0,
                repetitionCount: 0,
            },
            confidence: 0.5,
            shouldSimplify: false,
            shouldPauseMore: false,
            shouldBreakDown: false,
            guidance: 'Insufficient data for cognitive load assessment.',
            ssmlAdjustments: {
                speedMultiplier: 1.0,
                pauseMultiplier: 1.0,
            },
        };
    }
    /**
     * Reset the detector (new conversation)
     */
    reset() {
        this.observations = [];
        this.baselineWPM = null;
        this.baselineFillerRate = null;
        log.debug('CognitiveLoadDetector reset');
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';
const cognitiveLoadRegistry = createSessionRegistry((sessionId) => new CognitiveLoadDetector(), { name: 'CognitiveLoad', cleanup: (detector) => detector.reset(), verbose: false });
registerGlobalRegistry(cognitiveLoadRegistry);
export function getCognitiveLoadDetector(sessionId) {
    return cognitiveLoadRegistry.get(sessionId);
}
export function resetCognitiveLoadDetector(sessionId) {
    cognitiveLoadRegistry.reset(sessionId);
}
export function resetAllCognitiveLoadDetectors() {
    cognitiveLoadRegistry.resetAll();
}
export function getActiveCognitiveLoadCount() {
    return cognitiveLoadRegistry.getActiveCount();
}
export default CognitiveLoadDetector;
//# sourceMappingURL=cognitive-load.js.map