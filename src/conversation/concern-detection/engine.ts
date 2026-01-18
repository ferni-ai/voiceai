/**
 * Concern Detection Engine
 *
 * Main engine that orchestrates concern detection across all signal sources.
 * This is a SUPERHUMAN capability: detecting distress signals that humans would miss.
 *
 * @module @ferni/conversation/concern-detection/engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import { humanizationSignalEmitter } from '../../services/humanization/humanization-signal-emitter.js';

import type {
  AnalysisContext,
  BreathingSignals,
  ConcernApproach,
  ConcernLevel,
  ConcernSignal,
  ConcernState,
  ConcernType,
  ProsodySignals,
  UserBaseline,
} from './types.js';
import { DEFAULT_USER_BASELINE } from './types.js';
import { SOURCE_WEIGHTS } from './patterns.js';
import {
  analyzeLinguistic,
  analyzeBehavioral,
  analyzeProsody,
  analyzeBreathing,
  analyzeTemporal,
  type BehavioralState,
} from './analyzers.js';

const logger = createLogger({ module: 'ConcernDetectionEngine' });

// ============================================================================
// CONCERN DETECTION ENGINE
// ============================================================================

export class ConcernDetectionEngine {
  private signals: ConcernSignal[] = [];
  private previousScore = 0;
  private turnCount = 0;
  private engagementHistory: number[] = [];
  private responseLengthHistory: number[] = [];
  private lastProsodySignals: ProsodySignals | null = null;
  private lastBreathingSignals: BreathingSignals | null = null;
  private userBaseline: UserBaseline = { ...DEFAULT_USER_BASELINE };

  constructor() {
    logger.debug('ConcernDetectionEngine initialized');
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Process a user message and detect concern signals
   */
  analyze(userMessage: string, context: AnalysisContext): ConcernState {
    this.turnCount = context.turnCount;

    // Clear old signals (keep last 5 turns worth)
    this.signals = this.signals.filter((s) => Date.now() - s.timestamp < 5 * 60 * 1000);

    // Create signal adder bound to this instance
    const addSignal = this.addSignal.bind(this);

    // 1. Linguistic analysis
    analyzeLinguistic(userMessage, addSignal, this.signals);

    // 2. Behavioral analysis
    const behavioralState: BehavioralState = {
      responseLengthHistory: this.responseLengthHistory,
      engagementHistory: this.engagementHistory,
      turnCount: this.turnCount,
    };
    const behavioralResult = analyzeBehavioral(
      userMessage,
      {
        engagementLevel: context.engagementLevel,
        responseLatencyMs: context.responseLatencyMs,
        previousTopics: context.previousTopics,
        currentTopic: context.currentTopic,
      },
      behavioralState,
      addSignal
    );
    this.responseLengthHistory = behavioralResult.responseLengthHistory;
    this.engagementHistory = behavioralResult.engagementHistory;

    // 3. Prosody analysis (if available)
    if (context.prosody) {
      analyzeProsody(context.prosody, addSignal);
      this.lastProsodySignals = context.prosody;
    }

    // 4. Breathing analysis (if available)
    if (context.breathing) {
      analyzeBreathing(context.breathing, addSignal);
      this.lastBreathingSignals = context.breathing;
    }

    // 5. Temporal analysis
    if (context.temporal) {
      analyzeTemporal(context.temporal, this.signals, addSignal);
    }

    // 6. Compute overall state
    const state = this.computeState();

    // 7. Emit signals to frontend if elevated
    if (state.level !== 'none') {
      void humanizationSignalEmitter.emit({
        signalType: 'vulnerability',
        intensity: state.score,
      });
    }

    // Log significant detections
    this.logDetection(state);

    return state;
  }

  /**
   * Get current concern state without new analysis
   */
  getCurrentState(): ConcernState {
    return this.computeState();
  }

  /**
   * Update user baseline (learned preferences)
   */
  updateBaseline(metrics: Partial<UserBaseline>): void {
    Object.assign(this.userBaseline, metrics);
    logger.debug({ baseline: this.userBaseline }, 'User baseline updated');
  }

  /**
   * Record positive outcome (concern was addressed successfully)
   */
  recordPositiveOutcome(): void {
    this.signals = this.signals.map((s) => ({
      ...s,
      confidence: s.confidence * 0.7,
    }));
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.signals = [];
    this.previousScore = 0;
    this.turnCount = 0;
    this.engagementHistory = [];
    this.responseLengthHistory = [];
    this.lastProsodySignals = null;
    this.lastBreathingSignals = null;
    logger.debug('ConcernDetectionEngine reset');
  }

  // ==========================================================================
  // STATE COMPUTATION
  // ==========================================================================

  private computeState(): ConcernState {
    // Check for crisis first
    const crisisSignal = this.signals.find((s) => s.type === 'crisis');
    if (crisisSignal) {
      return {
        level: 'crisis',
        score: 1,
        primaryConcern: 'crisis',
        activeSignals: this.signals,
        escalating: true,
        recommendedApproach: 'safety_check',
        responseGuidance:
          'This person may be in crisis. Prioritize safety. Gently ask if they are safe and provide crisis resources.',
      };
    }

    // Calculate weighted score
    let score = 0;
    const concernCounts = new Map<ConcernType, number>();

    for (const signal of this.signals) {
      const weightedConfidence = signal.confidence * (SOURCE_WEIGHTS[signal.source] || 1.0);
      score += weightedConfidence;
      concernCounts.set(signal.type, (concernCounts.get(signal.type) || 0) + 1);
    }

    // Normalize score (0-1)
    score = Math.min(1, score / 3); // 3 strong signals = max

    // Get adaptive thresholds based on context
    const thresholds = this.getAdaptiveThresholds();

    // Determine level using adaptive thresholds
    let level: ConcernLevel;
    if (score < thresholds.none) level = 'none';
    else if (score < thresholds.mild) level = 'mild';
    else if (score < thresholds.moderate) level = 'moderate';
    else if (score < thresholds.elevated) level = 'elevated';
    else level = 'elevated'; // Don't auto-escalate to crisis from score alone

    // Check for hopelessness - automatically elevated
    const hopelessnessSignal = this.signals.find((s) => s.type === 'hopelessness');
    if (hopelessnessSignal && level === 'moderate') {
      level = 'elevated';
    }

    // Find primary concern
    let primaryConcern: ConcernType | null = null;
    let maxCount = 0;
    for (const [type, count] of concernCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        primaryConcern = type;
      }
    }

    // Detect escalation
    const escalating = score > this.previousScore + 0.15;
    this.previousScore = score;

    // Determine approach and guidance
    const { approach, guidance } = this.determineApproach(level, primaryConcern, escalating);

    return {
      level,
      score,
      primaryConcern,
      activeSignals: [...this.signals],
      escalating,
      recommendedApproach: approach,
      responseGuidance: guidance,
    };
  }

  private determineApproach(
    level: ConcernLevel,
    primaryConcern: ConcernType | null,
    escalating: boolean
  ): { approach: ConcernApproach; guidance: string } {
    if (level === 'crisis') {
      return {
        approach: 'safety_check',
        guidance:
          'This person may be in crisis. Prioritize safety above all else. Ask directly if they are safe.',
      };
    }

    if (level === 'elevated' || (level === 'moderate' && escalating)) {
      if (primaryConcern === 'hopelessness') {
        return {
          approach: 'hold_space',
          guidance:
            "This person is expressing hopelessness. Don't try to fix or reframe. Be present. Acknowledge the pain. Only after validation, gently explore what small thing might help.",
        };
      }
      return {
        approach: 'validate_first',
        guidance: `This person is showing signs of ${primaryConcern || 'distress'}. Lead with validation before any suggestions. Slow your pace. "That sounds really hard."`,
      };
    }

    if (level === 'moderate') {
      if (primaryConcern === 'loneliness') {
        return {
          approach: 'gentle_presence',
          guidance:
            "This person may be feeling alone. Your presence matters more than your words. Don't rush to solutions.",
        };
      }
      if (primaryConcern === 'exhaustion') {
        return {
          approach: 'slow_down',
          guidance:
            'This person seems exhausted. Keep your responses shorter. Offer to slow down or take a break.',
        };
      }
      return {
        approach: 'check_in',
        guidance: `Signs of ${primaryConcern || 'concern'} detected. Consider checking in: "How are you really doing right now?"`,
      };
    }

    if (level === 'mild') {
      return {
        approach: 'gentle_presence',
        guidance:
          'Mild concern signals present. Stay attuned. No action needed yet, but watch for escalation.',
      };
    }

    return {
      approach: 'normal',
      guidance: 'No significant concern signals. Continue normally.',
    };
  }

  // ==========================================================================
  // ADAPTIVE THRESHOLDS
  // ==========================================================================

  /**
   * Default concern level thresholds
   */
  private static readonly DEFAULT_THRESHOLDS = {
    none: 0.15, // Score below this = no concern
    mild: 0.35, // Score below this = mild concern
    moderate: 0.55, // Score below this = moderate concern
    elevated: 0.75, // Score below this = elevated concern
  };

  /**
   * Get adaptive thresholds based on context (time, session state, user baseline)
   *
   * Thresholds are LOWERED (more sensitive) when:
   * - Late night (11pm-5am) - people reach out late when really struggling
   * - Long sessions (> 30 min) - sustained distress signals
   * - User has history of masking - they understate concerns
   * - Escalating pattern detected - early intervention helps
   *
   * Thresholds are RAISED (less sensitive) when:
   * - User has naturally high-intensity speech patterns
   * - Early in session (< 5 turns) - give time to settle in
   */
  private getAdaptiveThresholds(): typeof ConcernDetectionEngine.DEFAULT_THRESHOLDS {
    const base = { ...ConcernDetectionEngine.DEFAULT_THRESHOLDS };

    // Late night adjustment (11pm - 5am)
    // People reaching out late at night are more likely genuinely struggling
    const hour = new Date().getHours();
    const isLateNight = hour >= 23 || hour < 5;
    if (isLateNight) {
      // Lower thresholds by ~20% (more sensitive)
      base.none *= 0.8;
      base.mild *= 0.85;
      base.moderate *= 0.85;
      base.elevated *= 0.9;
      logger.debug({ hour }, '🌙 Late night: lowered concern thresholds');
    }

    // Long session adjustment (more than 30 turns suggests deep engagement or prolonged distress)
    if (this.turnCount > 30) {
      // Slightly lower thresholds for sustained sessions
      base.none *= 0.9;
      base.mild *= 0.92;
      base.moderate *= 0.95;
    }

    // Early session grace period (< 5 turns)
    // Don't over-interpret early messages while rapport is building
    if (this.turnCount < 5) {
      // Raise thresholds slightly (less sensitive)
      base.none *= 1.1;
      base.mild *= 1.1;
      base.moderate *= 1.05;
    }

    // User baseline adjustment - if user has naturally higher speech intensity
    if (this.userBaseline.speechIntensity && this.userBaseline.speechIntensity > 0.7) {
      // Raise thresholds for naturally intense speakers
      base.none *= 1.15;
      base.mild *= 1.1;
      base.moderate *= 1.05;
    }

    // Escalation pattern - if signals have been building
    if (this.previousScore > 0.2 && this.signals.length >= 3) {
      // Lower thresholds when we see a pattern building
      base.mild *= 0.9;
      base.moderate *= 0.92;
    }

    // Ensure thresholds stay in valid ranges
    return {
      none: Math.max(0.08, Math.min(0.25, base.none)),
      mild: Math.max(0.2, Math.min(0.45, base.mild)),
      moderate: Math.max(0.4, Math.min(0.65, base.moderate)),
      elevated: Math.max(0.55, Math.min(0.85, base.elevated)),
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private addSignal(
    source: ConcernSignal['source'],
    type: ConcernType,
    confidence: number,
    indicator: string
  ): void {
    const existing = this.signals.find(
      (s) => s.source === source && s.type === type && s.indicator === indicator
    );

    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.timestamp = Date.now();
    } else {
      this.signals.push({
        source,
        type,
        confidence,
        indicator,
        timestamp: Date.now(),
      });
    }
  }

  private logDetection(state: ConcernState): void {
    if (state.level === 'elevated' || state.level === 'crisis') {
      logger.warn(
        {
          level: state.level,
          primaryConcern: state.primaryConcern,
          score: state.score.toFixed(2),
          signals: state.activeSignals.length,
        },
        '⚠️ Elevated concern detected'
      );
    } else if (state.level !== 'none') {
      logger.debug(
        {
          level: state.level,
          primaryConcern: state.primaryConcern,
          score: state.score.toFixed(2),
        },
        '👀 Concern signal detected'
      );
    }
  }
}

export default ConcernDetectionEngine;
