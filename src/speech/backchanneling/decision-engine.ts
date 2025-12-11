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
import {
  BACKCHANNEL_LIBRARY,
  getPersonaBackchannelStyle,
  getSoftBackchannel,
  normalizePersonaId,
  type BackchannelCategory,
  type BackchannelEmotionType,
} from '../persona-phrases.js';
import { adjustTimingForTopic, getTimingForMode, mergeTimingConfig } from './timing-config.js';
import type {
  BackchannelContext,
  BackchannelDecision,
  BackchannelEngineOptions,
  BackchannelMode,
  BackchannelTiming,
} from './types.js';

const log = getLogger().child({ module: 'BackchannelEngine' });

// ============================================================================
// UNIFIED BACKCHANNELING ENGINE
// ============================================================================

/**
 * Unified backchanneling decision engine
 *
 * Consolidates logic from:
 * - BackchannelingSystem (backchanneling.ts)
 * - EnhancedBackchannelingEngine (enhanced-backchanneling.ts)
 * - LiveBackchannelingService (live-backchanneling/)
 */
export class BackchannelEngine {
  private readonly mode: BackchannelMode;
  private readonly baseTiming: BackchannelTiming;
  private readonly personaId: string;

  private lastBackchannelTime = 0;
  private backchannelCount = 0;
  private turnBackchannelCount = 0;
  private backchannelHistory: Array<{
    category: BackchannelCategory;
    phrase: string;
    time: number;
  }> = [];
  private readonly maxHistorySize = 20;

  constructor(options: BackchannelEngineOptions) {
    this.mode = options.mode;
    this.personaId = normalizePersonaId(options.personaId ?? 'ferni');

    // Get base timing for mode and merge with custom
    const baseTiming = getTimingForMode(options.mode);
    this.baseTiming = options.customTiming
      ? mergeTimingConfig(baseTiming, options.customTiming)
      : baseTiming;

    log.debug({ mode: this.mode, personaId: this.personaId }, 'BackchannelEngine initialized');
  }

  // ==========================================================================
  // MAIN DECISION METHOD
  // ==========================================================================

  /**
   * Decide whether to emit a backchannel
   */
  decide(context: BackchannelContext): BackchannelDecision {
    // Get timing adjusted for topic
    const timing = adjustTimingForTopic(this.baseTiming, context.topicWeight);

    // Check timing conditions
    const timingCheck = this.checkTiming(context, timing);
    if (!timingCheck.shouldProceed) {
      return this.noBackchannel(timingCheck.reason);
    }

    // For live mode, check breath pause
    if (this.mode === 'live' && !context.isBreathPause) {
      return this.noBackchannel('not_breath_pause');
    }

    // Probability check for live mode
    if (this.mode === 'live') {
      const probability = context.isEmotionalMoment
        ? (timing.emotionalProbability ?? 0.4)
        : (timing.baseProbability ?? 0.25);

      if (Math.random() > probability) {
        return this.noBackchannel('probability_skip');
      }
    }

    // Determine emotion type and category
    const emotionType = this.determineEmotionType(context);
    const category = this.selectCategory(context, emotionType);

    // Select phrase
    const phrase = this.selectPhrase(category, emotionType);
    if (!phrase) {
      return this.noBackchannel('no_phrase_available');
    }

    // Build SSML
    const ssml = this.buildSsml(phrase, emotionType);

    // Record this backchannel
    this.recordBackchannel(category, phrase);

    // Determine volume and overlap based on mode
    const isLive = this.mode === 'live';
    const volumeRatio = isLive ? 0.3 : getPersonaBackchannelStyle(this.personaId).volumeRatio;

    log.debug(
      {
        mode: this.mode,
        category,
        phrase,
        emotionType,
        speechDuration: context.userSpeechDuration,
        pauseDuration: context.currentPauseDuration,
      },
      '🎧 Backchannel decision: emit'
    );

    return {
      shouldEmit: true,
      phrase,
      ssml,
      category,
      emotionType,
      timing: this.mode === 'live' ? 'immediate' : 'after_pause',
      volumeRatio,
      allowOverlap: isLive,
      reason: 'conditions_met',
    };
  }

  // ==========================================================================
  // TIMING CHECK
  // ==========================================================================

  private checkTiming(
    context: BackchannelContext,
    timing: BackchannelTiming
  ): { shouldProceed: boolean; reason: string } {
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

  private determineEmotionType(context: BackchannelContext): BackchannelEmotionType {
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

  private selectCategory(
    context: BackchannelContext,
    emotionType: BackchannelEmotionType
  ): BackchannelCategory {
    // For live mode, always use simpler acknowledgments
    if (this.mode === 'live') {
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
    const defaults: BackchannelCategory[] = ['acknowledgment', 'encouragement', 'understanding'];
    return defaults[Math.floor(Math.random() * defaults.length)];
  }

  // ==========================================================================
  // PHRASE SELECTION
  // ==========================================================================

  private selectPhrase(
    category: BackchannelCategory,
    emotionType: BackchannelEmotionType
  ): string | null {
    // For live mode, use soft backchannels
    if (this.mode === 'live') {
      return getSoftBackchannel(this.personaId, emotionType);
    }

    // Get phrases from library
    const options = [...BACKCHANNEL_LIBRARY[category]];
    if (options.length === 0) return null;

    // Filter out recently used phrases
    const recentPhrases = this.backchannelHistory.slice(-5).map((h) => h.phrase);
    const available = options.filter((p) => !recentPhrases.includes(p));
    const pool = available.length > 0 ? available : options;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ==========================================================================
  // SSML BUILDING
  // ==========================================================================

  private buildSsml(phrase: string, _emotionType: BackchannelEmotionType): string {
    const style = getPersonaBackchannelStyle(this.personaId);
    const volumeRatio = this.mode === 'live' ? 0.3 : style.volumeRatio;
    const emotionTag = style.emotionTag;

    let ssml = '';

    // Volume wrapper
    if (this.mode === 'live') {
      ssml = `<volume level="soft"><speed ratio="0.95">${phrase}</speed></volume>`;
    } else {
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

  private recordBackchannel(category: BackchannelCategory, phrase: string): void {
    const now = Date.now();
    this.lastBackchannelTime = now;
    this.backchannelCount++;
    this.turnBackchannelCount++;

    this.backchannelHistory.push({ category, phrase, time: now });
    if (this.backchannelHistory.length > this.maxHistorySize) {
      this.backchannelHistory.shift();
    }
  }

  private noBackchannel(reason: string): BackchannelDecision {
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
  newTurn(): void {
    this.turnBackchannelCount = 0;
  }

  /**
   * Reset engine state
   */
  reset(): void {
    this.lastBackchannelTime = 0;
    this.backchannelCount = 0;
    this.turnBackchannelCount = 0;
    this.backchannelHistory = [];
    log.debug({ mode: this.mode }, 'BackchannelEngine reset');
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    mode: BackchannelMode;
    totalBackchannels: number;
    turnBackchannels: number;
    lastBackchannelTime: number;
    recentCategories: BackchannelCategory[];
  } {
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
  getLastBackchannelTime(): number {
    return this.lastBackchannelTime;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a backchannel engine for a specific mode
 */
export function createBackchannelEngine(options: BackchannelEngineOptions): BackchannelEngine {
  return new BackchannelEngine(options);
}
