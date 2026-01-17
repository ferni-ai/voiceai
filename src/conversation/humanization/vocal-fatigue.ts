/**
 * Vocal Fatigue Modeling
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Over long conversations, humans naturally show vocal fatigue:
 * - Voice energy decreases
 * - Pace slows slightly
 * - Pauses become longer
 * - Thinking markers increase
 *
 * This module models these natural patterns to make long sessions
 * feel more authentic and less robotic.
 *
 * **Key insight**: Fatigue isn't just about sounding tired—it's about
 * showing that the conversation has weight, that we're genuinely present
 * and processing, not just outputting infinite perfectly-energized responses.
 *
 * @module @ferni/humanization/vocal-fatigue
 */

import { seededChance, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'VocalFatigue' });

// ============================================================================
// TYPES
// ============================================================================

export interface FatigueState {
  /** Session duration in minutes */
  sessionMinutes: number;

  /** Turn count */
  turnCount: number;

  /** Heavy topics discussed */
  heavyTopicCount: number;

  /** Accumulated emotional load (0-1) */
  emotionalLoad: number;

  /** Recent high-energy exchanges */
  highEnergyExchanges: number;

  /** Calculated fatigue level (0-1) */
  fatigueLevel: number;

  /** Fatigue trend */
  trend: 'increasing' | 'stable' | 'recovering';
}

export interface FatigueAdjustments {
  /** Speed reduction (0 to -0.15) */
  speedReduction: number;

  /** Pitch lowering (0 to -5%) */
  pitchReduction: string;

  /** Pause multiplier (1.0 to 1.4) */
  pauseMultiplier: number;

  /** Probability of thinking markers */
  thinkingMarkerProbability: number;

  /** Energy ceiling (caps enthusiasm) */
  energyCeiling: number;

  /** Should add fatigue expression? */
  addFatigueExpression: boolean;

  /** Fatigue expression if added */
  fatigueExpression: string | null;
}

export interface FatigueConfig {
  /** Time factor: minutes after which fatigue starts */
  fatigueOnsetMinutes: number;

  /** Time factor: minutes at which fatigue plateaus */
  fatiguePlateauMinutes: number;

  /** Turn factor: turns after which fatigue starts */
  fatigueOnsetTurns: number;

  /** Maximum fatigue level (0-1) */
  maxFatigueLevel: number;

  /** Heavy topic fatigue contribution */
  heavyTopicFatigueFactor: number;

  /** Emotional load fatigue contribution */
  emotionalLoadFatigueFactor: number;

  /** Recovery rate per turn of light content */
  recoveryRate: number;
}

// ============================================================================
// FATIGUE EXPRESSIONS
// ============================================================================

// FATIGUE_EXPRESSIONS: Verbal expressions of fatigue
// NOTE: Do NOT use *asterisk* stage directions - they may be spoken aloud!
// Use words and SSML breaks only.
const FATIGUE_EXPRESSIONS = {
  subtle: [
    // Barely noticeable - for early fatigue
    'Okay...',
    'Let me think...',
    'Hmm...',
  ],

  moderate: [
    // Noticeable but natural - for mid-session
    'Phew...',
    "Okay, let's see...",
    'Give me a second here...',
    'Alright...',
    'Let me catch up here...',
  ],

  pronounced: [
    // Clear fatigue signals - for long sessions
    "Phew, we've covered a lot.",
    'This has been a deep conversation.',
    'My brain is working hard here—in a good way.',
    "We're really getting into it, huh?",
    'Okay, let me gather my thoughts...',
    'This is good, but give me a moment...',
  ],
};

const FATIGUE_SSML = {
  subtle: [
    '<break time="200ms"/>',
    'Okay<break time="150ms"/>...',
    'Let me think<break time="200ms"/>...',
  ],

  moderate: [
    '<break time="300ms"/><prosody rate="95%">Phew</prosody><break time="150ms"/>...',
    '<break time="200ms"/>Okay, let\'s see<break time="200ms"/>...',
    'Give me a second here<break time="250ms"/>...',
    '<break time="350ms"/>',
    '<break time="200ms"/>Alright<break time="150ms"/>...',
  ],

  pronounced: [
    '<break time="300ms"/><prosody rate="90%">Phew, we\'ve covered a lot.</prosody><break time="200ms"/>',
    '<break time="250ms"/>This has been a deep conversation.<break time="200ms"/>',
    'My brain is working hard here—<break time="150ms"/>in a good way.',
    'We\'re really getting into it, huh?<break time="200ms"/>',
    '<break time="300ms"/>Okay, let me gather my thoughts<break time="250ms"/>...',
    '<break time="400ms"/>',
  ],
};

// ============================================================================
// RECOVERY EVENTS
// ============================================================================

/**
 * Events that reduce fatigue
 */
export const FATIGUE_RECOVERY_EVENTS = {
  laughter: -0.1, // Shared laughter refreshes
  topic_change: -0.05, // New topic = slight refresh
  user_breakthrough: -0.15, // Exciting moment energizes
  positive_emotion: -0.05, // Good feelings help
  brief_pause: -0.08, // Natural conversation pause
  user_excitement: -0.1, // User energy is contagious
  light_topic: -0.03, // Light content lets us recover
};

/**
 * Events that increase fatigue
 */
export const FATIGUE_INCREASE_EVENTS = {
  heavy_topic: 0.08, // Emotionally heavy content
  long_response: 0.03, // Extended agent responses
  complex_explanation: 0.05, // Complex material is tiring
  emotional_support: 0.06, // Supporting emotions takes energy
  user_distress: 0.08, // Absorbing distress is draining
  conflict_navigation: 0.07, // Navigating conflict
};

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: FatigueConfig = {
  fatigueOnsetMinutes: 10,
  fatiguePlateauMinutes: 45,
  fatigueOnsetTurns: 15,
  maxFatigueLevel: 0.6,
  heavyTopicFatigueFactor: 0.05,
  emotionalLoadFatigueFactor: 0.15,
  recoveryRate: 0.02,
};

// ============================================================================
// VOCAL FATIGUE ENGINE
// ============================================================================

export class VocalFatigueEngine {
  private state: FatigueState;
  private config: FatigueConfig;
  private sessionStartTime: number;
  private lastFatigueExpressionTurn = -999;

  constructor(config: Partial<FatigueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionStartTime = Date.now();
    this.state = this.createInitialState();
    logger.debug('VocalFatigueEngine initialized');
  }

  /**
   * Update fatigue state based on conversation events
   */
  update(context: {
    turnCount: number;
    topicWeight: 'light' | 'medium' | 'heavy';
    userEmotion?: string;
    userEnergy?: 'high' | 'medium' | 'low';
    responseWordCount: number;
    wasEmotionalSupport?: boolean;
  }): void {
    const {
      turnCount,
      topicWeight,
      userEmotion,
      userEnergy,
      responseWordCount,
      wasEmotionalSupport,
    } = context;

    // Update session duration
    this.state.sessionMinutes = Math.floor((Date.now() - this.sessionStartTime) / 60000);
    this.state.turnCount = turnCount;

    // Track heavy topics
    if (topicWeight === 'heavy') {
      this.state.heavyTopicCount++;
    }

    // Calculate emotional load
    const emotionalEmotions = ['sad', 'anxious', 'overwhelmed', 'grief', 'fear', 'anger'];
    if (userEmotion && emotionalEmotions.includes(userEmotion.toLowerCase())) {
      this.state.emotionalLoad = Math.min(1, this.state.emotionalLoad + 0.1);
    } else if (topicWeight === 'light') {
      // Light topics allow emotional recovery
      this.state.emotionalLoad = Math.max(0, this.state.emotionalLoad - 0.05);
    }

    // Calculate base fatigue from time and turns
    let fatigue = this.calculateBaseFatigue();

    // Add topic weight contribution
    if (topicWeight === 'heavy') {
      fatigue += this.config.heavyTopicFatigueFactor;
    }

    // Add emotional load contribution
    fatigue += this.state.emotionalLoad * this.config.emotionalLoadFatigueFactor;

    // Add long response contribution
    if (responseWordCount > 80) {
      fatigue += FATIGUE_INCREASE_EVENTS.long_response;
    }

    // Add emotional support contribution
    if (wasEmotionalSupport) {
      fatigue += FATIGUE_INCREASE_EVENTS.emotional_support;
    }

    // Apply recovery from positive events
    if (userEnergy === 'high') {
      fatigue -= 0.03;
    }

    // High energy exchanges
    if (userEnergy === 'high') {
      this.state.highEnergyExchanges++;
      if (this.state.highEnergyExchanges > 3) {
        // Sustained high energy is tiring too
        fatigue += 0.02;
      }
    } else {
      // Reset high energy counter
      this.state.highEnergyExchanges = Math.max(0, this.state.highEnergyExchanges - 1);
    }

    // Cap fatigue
    fatigue = Math.max(0, Math.min(this.config.maxFatigueLevel, fatigue));

    // Determine trend
    const previousFatigue = this.state.fatigueLevel;
    if (fatigue > previousFatigue + 0.02) {
      this.state.trend = 'increasing';
    } else if (fatigue < previousFatigue - 0.02) {
      this.state.trend = 'recovering';
    } else {
      this.state.trend = 'stable';
    }

    this.state.fatigueLevel = fatigue;

    logger.debug(
      {
        fatigue: fatigue.toFixed(2),
        sessionMinutes: this.state.sessionMinutes,
        turnCount,
        trend: this.state.trend,
      },
      '😮‍💨 Fatigue updated'
    );
  }

  /**
   * Apply a recovery event
   */
  applyRecovery(event: keyof typeof FATIGUE_RECOVERY_EVENTS): void {
    const recovery = FATIGUE_RECOVERY_EVENTS[event];
    this.state.fatigueLevel = Math.max(0, this.state.fatigueLevel + recovery);
    this.state.trend = 'recovering';
    logger.debug({ event, newFatigue: this.state.fatigueLevel.toFixed(2) }, '💪 Fatigue recovery');
  }

  /**
   * Get current fatigue adjustments for TTS
   */
  getAdjustments(): FatigueAdjustments {
    const fatigue = this.state.fatigueLevel;

    // Speed reduction: 0 at 0 fatigue, up to -0.12 at max
    const speedReduction = fatigue * -0.12;

    // Pitch reduction: 0 at 0 fatigue, up to -4% at max
    const pitchReduction = `${Math.round(fatigue * -4)}%`;

    // Pause multiplier: 1.0 at 0 fatigue, up to 1.35 at max
    const pauseMultiplier = 1 + fatigue * 0.35;

    // Thinking marker probability: 0.1 at 0 fatigue, up to 0.25 at max
    const thinkingMarkerProbability = 0.1 + fatigue * 0.15;

    // Energy ceiling: 1.0 at 0 fatigue, down to 0.7 at max
    const energyCeiling = 1 - fatigue * 0.3;

    // Fatigue expression decision
    const shouldExpressFatigue = this.shouldExpressFatigue();
    const fatigueExpression = shouldExpressFatigue ? this.chooseFatigueExpression() : null;

    return {
      speedReduction,
      pitchReduction,
      pauseMultiplier,
      thinkingMarkerProbability,
      energyCeiling,
      addFatigueExpression: shouldExpressFatigue,
      fatigueExpression,
    };
  }

  /**
   * Apply fatigue adjustments to SSML
   */
  applyToSsml(ssml: string): string {
    const adjustments = this.getAdjustments();

    // Don't modify if fatigue is minimal
    if (this.state.fatigueLevel < 0.1) {
      return ssml;
    }

    let result = ssml;

    // Add fatigue expression at the start if warranted
    if (adjustments.fatigueExpression) {
      result = `${this.getFatigueExpressionSsml()} ${result}`;
      this.lastFatigueExpressionTurn = this.state.turnCount;
    }

    // Wrap with prosody adjustments
    const speedPercent = Math.round((1 + adjustments.speedReduction) * 100);
    if (speedPercent < 97 || adjustments.pitchReduction !== '0%') {
      result = `<prosody rate="${speedPercent}%" pitch="${adjustments.pitchReduction}">${result}</prosody>`;
    }

    // Add longer pauses at sentence boundaries
    if (adjustments.pauseMultiplier > 1.1) {
      const pauseMs = Math.round(150 * adjustments.pauseMultiplier);
      result = result.replace(/([.!?])\s+/g, `$1<break time="${pauseMs}ms"/> `);
    }

    return result;
  }

  /**
   * Get current fatigue state
   */
  getState(): FatigueState {
    return { ...this.state };
  }

  /**
   * Check if fatigue level is significant
   */
  isSignificant(): boolean {
    return this.state.fatigueLevel >= 0.2;
  }

  /**
   * Get fatigue level category
   */
  getFatigueCategory(): 'none' | 'subtle' | 'moderate' | 'pronounced' {
    if (this.state.fatigueLevel < 0.15) return 'none';
    if (this.state.fatigueLevel < 0.3) return 'subtle';
    if (this.state.fatigueLevel < 0.5) return 'moderate';
    return 'pronounced';
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.sessionStartTime = Date.now();
    this.state = this.createInitialState();
    this.lastFatigueExpressionTurn = -999;
    logger.debug('VocalFatigueEngine reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createInitialState(): FatigueState {
    return {
      sessionMinutes: 0,
      turnCount: 0,
      heavyTopicCount: 0,
      emotionalLoad: 0,
      highEnergyExchanges: 0,
      fatigueLevel: 0,
      trend: 'stable',
    };
  }

  private calculateBaseFatigue(): number {
    let fatigue = 0;

    // Time-based fatigue
    const minutesPastOnset = Math.max(
      0,
      this.state.sessionMinutes - this.config.fatigueOnsetMinutes
    );
    const timeRange = this.config.fatiguePlateauMinutes - this.config.fatigueOnsetMinutes;
    const timeFatigue = Math.min(0.3, (minutesPastOnset / timeRange) * 0.3);
    fatigue += timeFatigue;

    // Turn-based fatigue
    const turnsPastOnset = Math.max(0, this.state.turnCount - this.config.fatigueOnsetTurns);
    const turnFatigue = Math.min(0.2, turnsPastOnset * 0.01);
    fatigue += turnFatigue;

    return fatigue;
  }

  private shouldExpressFatigue(): boolean {
    // Don't express fatigue too often
    const turnsSinceLastExpression = this.state.turnCount - this.lastFatigueExpressionTurn;
    if (turnsSinceLastExpression < 15) return false;

    // Need meaningful fatigue
    if (this.state.fatigueLevel < 0.25) return false;

    // Probability based on fatigue level
    const probability = this.state.fatigueLevel * 0.4;
    return seededChance(`${Date.now()}:1`, probability);
  }

  private chooseFatigueExpression(): string {
    const category = this.getFatigueCategory();
    const expressions =
      FATIGUE_EXPRESSIONS[category as keyof typeof FATIGUE_EXPRESSIONS] ||
      FATIGUE_EXPRESSIONS.subtle;

    return seededPick(`${Date.now()}:491`, expressions) ?? expressions[0];
  }

  private getFatigueExpressionSsml(): string {
    const category = this.getFatigueCategory();
    const ssmlExpressions =
      FATIGUE_SSML[category as keyof typeof FATIGUE_SSML] || FATIGUE_SSML.subtle;

    return seededPick(`${Date.now()}:499`, ssmlExpressions) ?? ssmlExpressions[0];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, VocalFatigueEngine>();

export function getVocalFatigueEngine(sessionId: string): VocalFatigueEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new VocalFatigueEngine());
  }
  return engines.get(sessionId)!;
}

export function resetVocalFatigueEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    engine.reset();
    engines.delete(sessionId);
  }
}

export function resetAllVocalFatigueEngines(): void {
  engines.clear();
}

export default VocalFatigueEngine;
