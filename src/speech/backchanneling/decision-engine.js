/**
 * Unified Backchanneling Decision Engine
 *
 * Single decision engine that handles all backchanneling modes:
 * - Standard: Basic verbal nods
 * - Enhanced: Context-aware, research-backed
 * - Live: Real-time during speech
 *
 * @module backchanneling/decision-engine
 */
import { getLogger } from '../../utils/safe-logger.js';
import { canAddFeedback, recordFeedback } from '../feedback-coordinator.js';
import { BACKCHANNEL_LIBRARY, getPersonaBackchannelStyle, getSoftBackchannel, normalizePersonaId, } from '../persona-phrases.js';
import { adjustTimingForTopic, getTimingForMode, mergeTimingConfig } from './timing-config.js';
const log = getLogger().child({ module: 'BackchannelEngine' });
const DEFAULT_ADAPTIVE_CONFIG = {
    useLineForEmotional: true,
    emotionalThreshold: 0.6,
    useEnhancedForHeavy: true,
    useStandardForEarly: true,
    earlyTurnThreshold: 3,
};
/**
 * Unified backchanneling decision engine
 *
 * Consolidates logic from:
 * - BackchannelingSystem (backchanneling.ts)
 * - EnhancedBackchannelingEngine (enhanced-backchanneling.ts)
 * - LiveBackchannelingService (live-backchanneling/)
 *
 * New adaptive mode automatically switches between modes based on:
 * - Conversation turn count (early = standard)
 * - Topic weight (heavy = enhanced)
 * - Emotional intensity (high = live)
 * - Breath pause availability (available = live)
 */
export class BackchannelEngine {
    configuredMode;
    baseTiming;
    personaId;
    adaptiveConfig;
    lastBackchannelTime = 0;
    backchannelCount = 0;
    turnBackchannelCount = 0;
    backchannelHistory = [];
    maxHistorySize = 20;
    // Adaptive mode tracking
    modeHistory = [];
    lastAdaptiveMode = 'standard';
    constructor(options) {
        this.configuredMode = options.mode;
        this.personaId = normalizePersonaId(options.personaId ?? 'ferni');
        this.adaptiveConfig = { ...DEFAULT_ADAPTIVE_CONFIG };
        // Get base timing for mode and merge with custom
        // For adaptive mode, use enhanced as the default base timing
        const baseMode = options.mode === 'adaptive' ? 'enhanced' : options.mode;
        const baseTiming = getTimingForMode(baseMode);
        this.baseTiming = options.customTiming
            ? mergeTimingConfig(baseTiming, options.customTiming)
            : baseTiming;
        log.debug({ mode: this.configuredMode, personaId: this.personaId }, 'BackchannelEngine initialized');
    }
    /**
     * Get the current effective mode (for adaptive, this can change per context)
     */
    get mode() {
        return this.configuredMode === 'adaptive' ? this.lastAdaptiveMode : this.configuredMode;
    }
    /**
     * Determine the best mode for the current context (adaptive mode logic)
     */
    determineAdaptiveMode(context) {
        // If not in adaptive mode, return configured mode
        if (this.configuredMode !== 'adaptive') {
            return this.configuredMode;
        }
        // Early conversation → use standard (less intrusive)
        if (this.adaptiveConfig.useStandardForEarly &&
            context.turnCount <= this.adaptiveConfig.earlyTurnThreshold) {
            return 'standard';
        }
        // Breath pause available → can use live mode
        if (context.isBreathPause === true) {
            // High emotional intensity → live mode for immediate support
            if (this.adaptiveConfig.useLineForEmotional &&
                (context.userEmotion.distressLevel > this.adaptiveConfig.emotionalThreshold ||
                    context.userEmotion.intensity > this.adaptiveConfig.emotionalThreshold)) {
                return 'live';
            }
        }
        // Heavy topic → enhanced mode (more thoughtful)
        if (this.adaptiveConfig.useEnhancedForHeavy && context.topicWeight === 'heavy') {
            return 'enhanced';
        }
        // Emotional moment → enhanced for better phrase selection
        if (context.isEmotionalMoment) {
            return 'enhanced';
        }
        // Default to enhanced (best balance)
        return 'enhanced';
    }
    // ==========================================================================
    // MAIN DECISION METHOD
    // ==========================================================================
    /**
     * Decide whether to emit a backchannel
     */
    decide(context) {
        // HUMANIZATION FIX: Check global feedback budget first
        // This prevents stacking with other feedback (prefix, laughter, etc.)
        if (context.sessionId && !canAddFeedback(context.sessionId, 'backchannel', context.turnCount)) {
            return this.noBackchannel('feedback_budget_exceeded');
        }
        // Determine effective mode for adaptive
        const effectiveMode = this.determineAdaptiveMode(context);
        this.lastAdaptiveMode = effectiveMode;
        // Track mode changes for analytics
        if (this.configuredMode === 'adaptive' &&
            (this.modeHistory.length === 0 ||
                this.modeHistory[this.modeHistory.length - 1] !== effectiveMode)) {
            this.modeHistory.push(effectiveMode);
            if (this.modeHistory.length > this.maxHistorySize) {
                this.modeHistory.shift();
            }
            log.debug({ from: this.modeHistory[this.modeHistory.length - 2] ?? 'none', to: effectiveMode }, '🔄 Adaptive mode switched');
        }
        // Get timing for the effective mode, adjusted for topic
        const modeTiming = getTimingForMode(effectiveMode);
        const timing = adjustTimingForTopic(this.baseTiming.minSpeechDuration !== modeTiming.minSpeechDuration
            ? modeTiming
            : this.baseTiming, context.topicWeight);
        // Check timing conditions
        const timingCheck = this.checkTiming(context, timing);
        if (!timingCheck.shouldProceed) {
            return this.noBackchannel(timingCheck.reason);
        }
        // For live mode, check breath pause
        if (effectiveMode === 'live' && !context.isBreathPause) {
            return this.noBackchannel('not_breath_pause');
        }
        // Probability check for live mode
        if (effectiveMode === 'live') {
            const probability = context.isEmotionalMoment
                ? (timing.emotionalProbability ?? 0.4)
                : (timing.baseProbability ?? 0.25);
            if (Math.random() > probability) {
                return this.noBackchannel('probability_skip');
            }
        }
        // Determine emotion type and category
        const emotionType = this.determineEmotionType(context);
        const category = this.selectCategory(context, emotionType, effectiveMode);
        // Select phrase
        const phrase = this.selectPhrase(category, emotionType, effectiveMode);
        if (!phrase) {
            return this.noBackchannel('no_phrase_available');
        }
        // Build SSML
        const ssml = this.buildSsml(phrase, emotionType, effectiveMode);
        // Record this backchannel
        this.recordBackchannel(category, phrase, effectiveMode);
        // HUMANIZATION FIX: Record in global feedback coordinator
        if (context.sessionId) {
            recordFeedback(context.sessionId, 'backchannel');
        }
        // Determine volume and overlap based on mode
        const isLive = effectiveMode === 'live';
        const volumeRatio = isLive ? 0.3 : getPersonaBackchannelStyle(this.personaId).volumeRatio;
        log.debug({
            configuredMode: this.configuredMode,
            effectiveMode,
            category,
            phrase,
            emotionType,
            speechDuration: context.userSpeechDuration,
            pauseDuration: context.currentPauseDuration,
        }, '🎧 Backchannel decision: emit');
        return {
            shouldEmit: true,
            phrase,
            ssml,
            category,
            emotionType,
            timing: effectiveMode === 'live' ? 'immediate' : 'after_pause',
            volumeRatio,
            allowOverlap: isLive,
            reason: this.configuredMode === 'adaptive'
                ? `conditions_met (adaptive→${effectiveMode})`
                : 'conditions_met',
        };
    }
    // ==========================================================================
    // TIMING CHECK
    // ==========================================================================
    checkTiming(context, timing) {
        // Check max per turn
        if (context.backchannelCountThisTurn >= timing.maxPerTurn) {
            return { shouldProceed: false, reason: 'max_per_turn_reached' };
        }
        // Check cooldown
        const timeSinceLast = context.lastBackchannelTime
            ? Date.now() - context.lastBackchannelTime
            : Infinity;
        if (timeSinceLast < timing.cooldownPeriod) {
            return { shouldProceed: false, reason: 'cooldown_not_elapsed' };
        }
        // Check minimum speech duration
        if (context.userSpeechDuration < timing.minSpeechDuration) {
            return { shouldProceed: false, reason: 'speech_too_short' };
        }
        // For non-live modes, check pause duration
        if (this.mode !== 'live') {
            if (context.currentPauseDuration < timing.pauseTriggerDuration) {
                return { shouldProceed: false, reason: 'pause_too_short' };
            }
        }
        return { shouldProceed: true, reason: 'conditions_met' };
    }
    // ==========================================================================
    // EMOTION & CATEGORY SELECTION
    // ==========================================================================
    determineEmotionType(context) {
        const { userEmotion, topicWeight, isEmotionalMoment } = context;
        // Heavy topic or distress → empathetic
        if (topicWeight === 'heavy' || userEmotion.distressLevel > 0.5) {
            return 'empathetic';
        }
        // Moderate distress → supportive
        if (userEmotion.distressLevel > 0.3) {
            return 'supportive';
        }
        // Joy or high intensity → excited
        if (userEmotion.primary === 'joy' || (userEmotion.intensity > 0.7 && isEmotionalMoment)) {
            return 'excited';
        }
        // Engagement signals
        if (userEmotion.intensity > 0.5 || isEmotionalMoment) {
            return 'engaged';
        }
        return 'neutral';
    }
    selectCategory(context, emotionType, effectiveMode) {
        // For live mode, always use simpler acknowledgments
        if (effectiveMode === 'live') {
            return emotionType === 'empathetic' ? 'empathy' : 'acknowledgment';
        }
        // Empathetic → empathy category
        if (emotionType === 'empathetic' || emotionType === 'supportive') {
            return 'empathy';
        }
        // Excited → surprise or agreement
        if (emotionType === 'excited') {
            return Math.random() < 0.5 ? 'surprise' : 'agreement';
        }
        // Question content → thinking
        if (context.recentContent && /\?|what do you think|should I/i.test(context.recentContent)) {
            return 'thinking';
        }
        // Long speech → understanding
        if (context.userSpeechDuration > 8000) {
            return 'understanding';
        }
        // Use persona preferences
        const style = getPersonaBackchannelStyle(this.personaId);
        const preferred = style.preferred;
        if (preferred.length > 0) {
            return preferred[Math.floor(Math.random() * preferred.length)];
        }
        // Default mix
        const defaults = ['acknowledgment', 'encouragement', 'understanding'];
        return defaults[Math.floor(Math.random() * defaults.length)];
    }
    // ==========================================================================
    // PHRASE SELECTION
    // ==========================================================================
    selectPhrase(category, emotionType, effectiveMode) {
        // For live mode, use soft backchannels
        if (effectiveMode === 'live') {
            return getSoftBackchannel(this.personaId, emotionType);
        }
        // Get phrases from library
        const options = [...BACKCHANNEL_LIBRARY[category]];
        if (options.length === 0)
            return null;
        // Filter out recently used phrases
        const recentPhrases = this.backchannelHistory.slice(-5).map((h) => h.phrase);
        const available = options.filter((p) => !recentPhrases.includes(p));
        const pool = available.length > 0 ? available : options;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    // ==========================================================================
    // SSML BUILDING
    // ==========================================================================
    buildSsml(phrase, _emotionType, effectiveMode) {
        const style = getPersonaBackchannelStyle(this.personaId);
        const volumeRatio = effectiveMode === 'live' ? 0.3 : style.volumeRatio;
        const emotionTag = style.emotionTag;
        let ssml = '';
        // Volume wrapper
        if (effectiveMode === 'live') {
            ssml = `<volume ratio="0.75"><speed ratio="0.95">${phrase}</speed></volume>`;
        }
        else {
            ssml = `<volume ratio="${volumeRatio}"/>`;
            if (emotionTag) {
                ssml += `<emotion value="${emotionTag}"/>`;
            }
            ssml += phrase;
            ssml += '<break time="200ms"/>';
        }
        return ssml;
    }
    // ==========================================================================
    // STATE MANAGEMENT
    // ==========================================================================
    recordBackchannel(category, phrase, effectiveMode) {
        const now = Date.now();
        this.lastBackchannelTime = now;
        this.backchannelCount++;
        this.turnBackchannelCount++;
        this.backchannelHistory.push({ category, phrase, time: now, mode: effectiveMode });
        if (this.backchannelHistory.length > this.maxHistorySize) {
            this.backchannelHistory.shift();
        }
    }
    noBackchannel(reason) {
        return {
            shouldEmit: false,
            phrase: null,
            ssml: null,
            category: null,
            emotionType: null,
            timing: 'never',
            volumeRatio: 0,
            allowOverlap: false,
            reason,
        };
    }
    /**
     * Call when a new turn starts
     */
    newTurn() {
        this.turnBackchannelCount = 0;
    }
    /**
     * Reset engine state
     */
    reset() {
        this.lastBackchannelTime = 0;
        this.backchannelCount = 0;
        this.turnBackchannelCount = 0;
        this.backchannelHistory = [];
        log.debug({ mode: this.mode }, 'BackchannelEngine reset');
    }
    /**
     * Get engine statistics
     */
    getStats() {
        return {
            mode: this.mode,
            totalBackchannels: this.backchannelCount,
            turnBackchannels: this.turnBackchannelCount,
            lastBackchannelTime: this.lastBackchannelTime,
            recentCategories: this.backchannelHistory.slice(-5).map((h) => h.category),
        };
    }
    /**
     * Get last backchannel time
     */
    getLastBackchannelTime() {
        return this.lastBackchannelTime;
    }
    /**
     * Get adaptive mode statistics (only relevant for adaptive mode)
     */
    getAdaptiveModeStats() {
        const modeBreakdown = {
            standard: 0,
            enhanced: 0,
            live: 0,
            adaptive: 0,
        };
        for (const entry of this.backchannelHistory) {
            modeBreakdown[entry.mode]++;
        }
        return {
            isAdaptive: this.configuredMode === 'adaptive',
            currentEffectiveMode: this.lastAdaptiveMode,
            modeHistory: [...this.modeHistory],
            modeBreakdown,
        };
    }
}
// ============================================================================
// FACTORY FUNCTION
// ============================================================================
/**
 * Create a backchannel engine for a specific mode
 */
export function createBackchannelEngine(options) {
    return new BackchannelEngine(options);
}
//# sourceMappingURL=decision-engine.js.map