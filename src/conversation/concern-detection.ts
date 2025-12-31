/**
 * Unified Concern Detection System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: detecting distress signals across multiple
 * channels that humans would miss. A human friend might notice you sound "off"
 * but can't articulate why. Ferni KNOWS why.
 *
 * We aggregate signals from:
 * - **Linguistic patterns**: Word choice, negative spirals, absolutism
 * - **Behavioral shifts**: Engagement drop, response brevity, topic avoidance
 * - **Voice prosody**: Strain, tremor, pitch instability (when available)
 * - **Breathing patterns**: Shallow/rapid breathing indicates anxiety
 * - **Temporal patterns**: Time-of-day vulnerability, day-of-week patterns
 *
 * The magic: We detect concern BEFORE the user explicitly states it,
 * creating the "they understand me" feeling.
 *
 * @module @ferni/concern-detection
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../memory/rust-accelerator.js';

const logger = createLogger({ module: 'ConcernDetection' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// TYPES
// ============================================================================

export type ConcernLevel = 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';

export type ConcernType =
  | 'anxiety'
  | 'sadness'
  | 'overwhelm'
  | 'frustration'
  | 'loneliness'
  | 'fear'
  | 'exhaustion'
  | 'self_doubt'
  | 'hopelessness'
  | 'crisis';

export interface ConcernSignal {
  /** Source of the signal */
  source: 'linguistic' | 'behavioral' | 'prosody' | 'breathing' | 'temporal' | 'combined';

  /** Type of concern detected */
  type: ConcernType;

  /** Confidence (0-1) */
  confidence: number;

  /** Specific indicator that triggered this */
  indicator: string;

  /** When detected */
  timestamp: number;
}

export interface ConcernState {
  /** Current overall concern level */
  level: ConcernLevel;

  /** Numeric score (0-1) */
  score: number;

  /** Primary concern type */
  primaryConcern: ConcernType | null;

  /** All active signals */
  activeSignals: ConcernSignal[];

  /** Is concern escalating? */
  escalating: boolean;

  /** Recommended response approach */
  recommendedApproach: ConcernApproach;

  /** Specific guidance for response */
  responseGuidance: string;
}

export type ConcernApproach =
  | 'normal' // No special handling
  | 'gentle_presence' // Be present, don't probe
  | 'validate_first' // Acknowledge before anything
  | 'slow_down' // Reduce pace and energy
  | 'check_in' // Gently ask how they're doing
  | 'hold_space' // Pure presence, minimal words
  | 'safety_check'; // Crisis protocol

export interface ProsodySignals {
  /** Voice strain indicator (0-1) */
  strain: number;

  /** Pitch instability (0-1) */
  pitchInstability: number;

  /** Speech rate deviation from baseline */
  speechRateDeviation: number;

  /** Pause pattern irregularity */
  pauseIrregularity: number;

  /** Tremor detected */
  tremor: boolean;

  /** Energy level (0-1) */
  energy: number;
}

export interface BreathingSignals {
  /** Breaths per minute (normal: 12-20) */
  breathsPerMinute: number;

  /** Is breathing shallow? */
  shallow: boolean;

  /** Held breath detected */
  heldBreath: boolean;

  /** Sighing frequency */
  sighFrequency: number;
}

export interface TemporalContext {
  /** Current hour (0-23) */
  hour: number;

  /** Day of week (0-6, Sunday=0) */
  dayOfWeek: number;

  /** Is this late night (11pm-4am)? */
  isLateNight: boolean;

  /** Historical vulnerability patterns for this time */
  historicalVulnerability?: number;
}

// ============================================================================
// LINGUISTIC PATTERNS
// ============================================================================

/** Patterns that indicate anxiety */
const ANXIETY_PATTERNS = [
  /\bwhat if\b/i,
  /\bworried about\b/i,
  /\bcan('t|not) stop thinking\b/i,
  /\bkeep(s)? me up\b/i,
  /\bscared (that|of)\b/i,
  /\bpanic(king)?\b/i,
  /\banxious\b/i,
  /\bstress(ed|ing)?\b/i,
  /\bcan('t|not) relax\b/i,
  /\bon edge\b/i,
  /\braceing thoughts\b/i,
];

/** Patterns that indicate sadness/depression */
const SADNESS_PATTERNS = [
  /\bwhat('s| is) the point\b/i,
  /\bdon('t|ot) see the point\b/i,
  /\bfeel(ing)? (so )?(sad|empty|numb|hollow)\b/i,
  /\blost (interest|motivation)\b/i,
  /\bcan('t|not) (get out of bed|function)\b/i,
  /\bno energy\b/i,
  /\bworthless\b/i,
  /\bjust going through the motions\b/i,
  /\bmiss (him|her|them|my)\b/i,
  /\bgrief|grieving|mourning\b/i,
];

/** Patterns that indicate overwhelm */
const OVERWHELM_PATTERNS = [
  /\btoo much\b/i,
  /\bcan('t|not) (handle|cope|deal)\b/i,
  /\boverwhelm(ed|ing)?\b/i,
  /\bdrowning\b/i,
  /\bpiling up\b/i,
  /\bcan('t|not) keep up\b/i,
  /\beverything at once\b/i,
  /\bfalling behind\b/i,
  /\bsinking\b/i,
  /\bburning out\b/i,
];

/** Patterns that indicate frustration/anger */
const FRUSTRATION_PATTERNS = [
  /\bso (frustrated|annoyed|angry|mad)\b/i,
  /\bsick of (this|it)\b/i,
  /\btired of\b/i,
  /\bcan('t|not) take (it|this) anymore\b/i,
  /\bfed up\b/i,
  /\benough (is enough|already)\b/i,
  /\bwhy (won't|can't|doesn't)\b/i,
  /\bnothing (works|helps)\b/i,
];

/** Patterns that indicate loneliness */
const LONELINESS_PATTERNS = [
  /\bno one (understands|cares|listens)\b/i,
  /\ball alone\b/i,
  /\bby myself\b/i,
  /\bisolated\b/i,
  /\blonely|loneliness\b/i,
  /\bno (friends|support|one to talk to)\b/i,
  /\bdisconnected\b/i,
  /\bmissing (connection|people)\b/i,
];

/** Patterns that indicate exhaustion */
const EXHAUSTION_PATTERNS = [
  /\bso tired\b/i,
  /\bexhausted\b/i,
  /\bno energy (left)?\b/i,
  /\bcan('t|not) (go on|continue|keep going)\b/i,
  /\bburnt out|burned out|burnout\b/i,
  /\brun(ning)? on empty\b/i,
  /\bdrained\b/i,
  /\bwiped out\b/i,
];

/** Patterns that indicate self-doubt */
const SELF_DOUBT_PATTERNS = [
  /\bi('m| am) (not good enough|a failure|worthless|stupid)\b/i,
  /\bwhy can('t|not) i\b/i,
  /\bwhat('s| is) wrong with me\b/i,
  /\beveryone else (can|does|is)\b/i,
  /\bi('ll| will) never\b/i,
  /\bi always (mess up|fail|screw up)\b/i,
  /\bimpostor syndrome\b/i,
  /\bnot (smart|capable|worthy) enough\b/i,
];

/** Patterns that indicate hopelessness - ELEVATED CONCERN */
const HOPELESSNESS_PATTERNS = [
  /\bgive up\b/i,
  /\bno point\b/i,
  /\bhopeless\b/i,
  /\bnothing (matters|will change|helps)\b/i,
  /\bcan('t|not) see a way (out|forward)\b/i,
  /\bwhat('s| is) the use\b/i,
  /\btrapped\b/i,
  /\bno (hope|future|way out)\b/i,
];

/** CRISIS PATTERNS - require immediate safety response */
const CRISIS_PATTERNS = [
  /\b(want to |wanna )?end (it|my life|everything)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bdon('t|ot) want to (be here|live|exist)\b/i,
  /\bkill myself\b/i,
  /\bhurt myself\b/i,
  /\bself[- ]harm\b/i,
  /\bbetter off (dead|without me)\b/i,
  /\bno reason to (live|go on)\b/i,
  /\bfinal (goodbye|message)\b/i,
];

/** Negative spiral indicators (absolutist language) */
const ABSOLUTIST_PATTERNS = [
  /\balways\b/i,
  /\bnever\b/i,
  /\beveryone\b/i,
  /\bno one\b/i,
  /\beverything\b/i,
  /\bnothing\b/i,
];

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

  // Baseline metrics for this user (learned over time)
  private userBaseline = {
    avgResponseLength: 50,
    avgEngagement: 0.6,
    avgEnergy: 0.5,
    normalSpeechRate: 1.0,
  };

  constructor() {
    logger.debug('ConcernDetectionEngine initialized');
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Process a user message and detect concern signals
   * This is the main entry point called on each turn
   */
  analyze(
    userMessage: string,
    context: {
      turnCount: number;
      userEmotion?: string;
      engagementLevel?: number;
      responseLatencyMs?: number;
      prosody?: ProsodySignals;
      breathing?: BreathingSignals;
      temporal?: TemporalContext;
      previousTopics?: string[];
      currentTopic?: string;
    }
  ): ConcernState {
    this.turnCount = context.turnCount;

    // Clear old signals (keep last 5 turns worth)
    this.signals = this.signals.filter((s) => Date.now() - s.timestamp < 5 * 60 * 1000);

    // 1. Linguistic analysis
    this.analyzeLinguistic(userMessage);

    // 2. Behavioral analysis
    this.analyzeBehavioral(userMessage, context);

    // 3. Prosody analysis (if available)
    if (context.prosody) {
      this.analyzeProsody(context.prosody);
      this.lastProsodySignals = context.prosody;
    }

    // 4. Breathing analysis (if available)
    if (context.breathing) {
      this.analyzeBreathing(context.breathing);
      this.lastBreathingSignals = context.breathing;
    }

    // 5. Temporal analysis
    if (context.temporal) {
      this.analyzeTemporal(context.temporal);
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
  updateBaseline(metrics: Partial<typeof this.userBaseline>): void {
    Object.assign(this.userBaseline, metrics);
    logger.debug({ baseline: this.userBaseline }, 'User baseline updated');
  }

  /**
   * Record positive outcome (concern was addressed successfully)
   */
  recordPositiveOutcome(): void {
    // Decay active signals more quickly after positive outcome
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
  // LINGUISTIC ANALYSIS
  // ==========================================================================

  private analyzeLinguistic(text: string): void {
    const lowered = text.toLowerCase();

    // CRISIS CHECK FIRST - highest priority
    for (const pattern of CRISIS_PATTERNS) {
      if (pattern.test(lowered)) {
        this.addSignal('linguistic', 'crisis', 0.95, 'Crisis language detected');
        return; // Don't check other patterns
      }
    }

    // Check each concern type
    const checks: Array<{ patterns: RegExp[]; type: ConcernType; weight: number }> = [
      { patterns: HOPELESSNESS_PATTERNS, type: 'hopelessness', weight: 0.85 },
      { patterns: ANXIETY_PATTERNS, type: 'anxiety', weight: 0.7 },
      { patterns: SADNESS_PATTERNS, type: 'sadness', weight: 0.7 },
      { patterns: OVERWHELM_PATTERNS, type: 'overwhelm', weight: 0.7 },
      { patterns: FRUSTRATION_PATTERNS, type: 'frustration', weight: 0.6 },
      { patterns: LONELINESS_PATTERNS, type: 'loneliness', weight: 0.7 },
      { patterns: EXHAUSTION_PATTERNS, type: 'exhaustion', weight: 0.65 },
      { patterns: SELF_DOUBT_PATTERNS, type: 'self_doubt', weight: 0.7 },
    ];

    for (const { patterns, type, weight } of checks) {
      const matches = patterns.filter((p) => p.test(lowered));
      if (matches.length > 0) {
        // More matches = higher confidence
        const confidence = Math.min(0.95, weight + matches.length * 0.1);
        this.addSignal('linguistic', type, confidence, `Pattern: ${type}`);
      }
    }

    // Check for absolutist language (negative spiral indicator)
    const absolutistCount = ABSOLUTIST_PATTERNS.filter((p) => p.test(lowered)).length;
    if (absolutistCount >= 2) {
      // Find the most likely concern type from existing signals
      const existingType = this.signals.find((s) => s.source === 'linguistic')?.type || 'anxiety';
      this.addSignal(
        'linguistic',
        existingType,
        0.3 + absolutistCount * 0.1,
        'Absolutist language spiral'
      );
    }
  }

  // ==========================================================================
  // BEHAVIORAL ANALYSIS
  // ==========================================================================

  private analyzeBehavioral(
    text: string,
    context: {
      engagementLevel?: number;
      responseLatencyMs?: number;
      previousTopics?: string[];
      currentTopic?: string;
    }
  ): void {
    // 🦀 Use Rust for O(1) word counting
    const wordCount = RUST_COUNTING_AVAILABLE ? countWordsRust(text) : text.split(/\s+/).length;

    // Track response length history
    this.responseLengthHistory.push(wordCount);
    if (this.responseLengthHistory.length > 10) {
      this.responseLengthHistory.shift();
    }

    // Track engagement history
    if (context.engagementLevel !== undefined) {
      this.engagementHistory.push(context.engagementLevel);
      if (this.engagementHistory.length > 10) {
        this.engagementHistory.shift();
      }
    }

    // Check for sudden brevity (potential withdrawal)
    if (this.responseLengthHistory.length >= 3) {
      const recent = this.responseLengthHistory.slice(-3);
      const earlier = this.responseLengthHistory.slice(0, -3);

      if (earlier.length > 0) {
        const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;

        if (recentAvg < earlierAvg * 0.4 && earlierAvg > 15) {
          // Significant drop in response length
          this.addSignal('behavioral', 'sadness', 0.5, 'Sudden response brevity (withdrawal)');
        }
      }
    }

    // Check for engagement decline
    if (this.engagementHistory.length >= 4) {
      const recent = this.engagementHistory.slice(-2);
      const earlier = this.engagementHistory.slice(-4, -2);

      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

      if (recentAvg < earlierAvg - 0.25) {
        this.addSignal('behavioral', 'exhaustion', 0.4, 'Engagement decline');
      }
    }

    // Check for topic avoidance
    if (context.previousTopics && context.currentTopic) {
      const heavyTopics = ['death', 'loss', 'trauma', 'abuse', 'suicide', 'divorce'];
      const wasDiscussingHeavy = context.previousTopics.some((t) =>
        heavyTopics.some((h) => t.toLowerCase().includes(h))
      );
      const nowOnLight = !heavyTopics.some((h) => context.currentTopic?.toLowerCase().includes(h));

      if (wasDiscussingHeavy && nowOnLight && wordCount < 20) {
        this.addSignal('behavioral', 'overwhelm', 0.4, 'Topic avoidance after heavy topic');
      }
    }

    // Check for late-night message + short response (potential crisis signal)
    const hour = new Date().getHours();
    if ((hour >= 23 || hour <= 4) && wordCount < 10 && this.turnCount > 5) {
      this.addSignal('behavioral', 'loneliness', 0.35, 'Late night brevity');
    }
  }

  // ==========================================================================
  // PROSODY ANALYSIS
  // ==========================================================================

  private analyzeProsody(prosody: ProsodySignals): void {
    // Voice strain indicates stress/anxiety
    if (prosody.strain > 0.6) {
      this.addSignal('prosody', 'anxiety', prosody.strain * 0.8, 'Voice strain detected');
    }

    // Pitch instability indicates emotional dysregulation
    if (prosody.pitchInstability > 0.5) {
      this.addSignal('prosody', 'overwhelm', prosody.pitchInstability * 0.7, 'Pitch instability');
    }

    // Tremor is a strong signal
    if (prosody.tremor) {
      this.addSignal('prosody', 'fear', 0.75, 'Voice tremor detected');
    }

    // Low energy voice
    if (prosody.energy < 0.3) {
      this.addSignal('prosody', 'exhaustion', 0.6, 'Low voice energy');
    }

    // Speech rate deviation
    if (Math.abs(prosody.speechRateDeviation) > 0.3) {
      if (prosody.speechRateDeviation > 0) {
        // Speaking faster than usual = anxiety
        this.addSignal('prosody', 'anxiety', 0.5, 'Rapid speech');
      } else {
        // Speaking slower = sadness/exhaustion
        this.addSignal('prosody', 'sadness', 0.5, 'Slowed speech');
      }
    }
  }

  // ==========================================================================
  // BREATHING ANALYSIS
  // ==========================================================================

  private analyzeBreathing(breathing: BreathingSignals): void {
    // Rapid breathing (>20 bpm) indicates anxiety
    if (breathing.breathsPerMinute > 20) {
      const intensity = Math.min(1, (breathing.breathsPerMinute - 20) / 10);
      this.addSignal('breathing', 'anxiety', intensity * 0.7, 'Rapid breathing');
    }

    // Shallow breathing
    if (breathing.shallow) {
      this.addSignal('breathing', 'anxiety', 0.5, 'Shallow breathing');
    }

    // Held breath (often precedes difficult admission)
    if (breathing.heldBreath) {
      this.addSignal('breathing', 'fear', 0.6, 'Held breath');
    }

    // Frequent sighing
    if (breathing.sighFrequency > 0.5) {
      this.addSignal('breathing', 'sadness', 0.4, 'Frequent sighing');
    }
  }

  // ==========================================================================
  // TEMPORAL ANALYSIS
  // ==========================================================================

  private analyzeTemporal(temporal: TemporalContext): void {
    // Late night conversations carry higher baseline concern
    if (temporal.isLateNight) {
      // Don't add a signal, but we'll factor this into scoring
      logger.debug('Late night context noted');
    }

    // Historical patterns (if available)
    if (temporal.historicalVulnerability && temporal.historicalVulnerability > 0.5) {
      this.addSignal(
        'temporal',
        'anxiety',
        temporal.historicalVulnerability * 0.5,
        'Historical vulnerability at this time'
      );
    }

    // Sunday evening anxiety (common pattern)
    if (temporal.dayOfWeek === 0 && temporal.hour >= 17 && temporal.hour <= 22) {
      // Light signal - don't over-weight
      // Only add if other signals present
      if (this.signals.length > 0) {
        this.addSignal('temporal', 'anxiety', 0.2, 'Sunday evening pattern');
      }
    }

    // Monday morning (another common stress point)
    if (temporal.dayOfWeek === 1 && temporal.hour >= 6 && temporal.hour <= 10) {
      if (this.signals.length > 0) {
        this.addSignal('temporal', 'overwhelm', 0.2, 'Monday morning pattern');
      }
    }
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
      // Weight by source
      const sourceWeight: Record<ConcernSignal['source'], number> = {
        linguistic: 1.0,
        behavioral: 0.7,
        prosody: 0.9,
        breathing: 0.8,
        temporal: 0.4,
        combined: 1.0,
      };

      const weightedConfidence = signal.confidence * sourceWeight[signal.source];
      score += weightedConfidence;

      // Count by type
      concernCounts.set(signal.type, (concernCounts.get(signal.type) || 0) + 1);
    }

    // Normalize score (0-1)
    score = Math.min(1, score / 3); // 3 strong signals = max

    // Determine level
    let level: ConcernLevel;
    if (score < 0.15) level = 'none';
    else if (score < 0.35) level = 'mild';
    else if (score < 0.55) level = 'moderate';
    else if (score < 0.75) level = 'elevated';
    else level = 'elevated'; // We don't auto-escalate to crisis from score alone

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
  // HELPERS
  // ==========================================================================

  private addSignal(
    source: ConcernSignal['source'],
    type: ConcernType,
    confidence: number,
    indicator: string
  ): void {
    // Check for duplicate signals
    const existing = this.signals.find(
      (s) => s.source === source && s.type === type && s.indicator === indicator
    );

    if (existing) {
      // Update confidence if higher
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
}

// ============================================================================
// SESSION REGISTRY
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

/**
 * Session registry for concern detection engines.
 * Provides automatic cleanup and lifecycle management.
 */
const concernDetectionRegistry = createSessionRegistry(
  (sessionId: string) => new ConcernDetectionEngine(),
  {
    name: 'ConcernDetection',
    cleanup: (engine) => engine.reset(),
    verbose: false,
  }
);

// Register globally for coordinated session cleanup
registerGlobalRegistry(concernDetectionRegistry);

export function getConcernDetectionEngine(sessionId: string): ConcernDetectionEngine {
  return concernDetectionRegistry.get(sessionId);
}

export function resetConcernDetectionEngine(sessionId: string): void {
  concernDetectionRegistry.reset(sessionId);
}

export function resetAllConcernDetectionEngines(): void {
  concernDetectionRegistry.resetAll();
}

export function hasConcernDetectionEngine(sessionId: string): boolean {
  return concernDetectionRegistry.has(sessionId);
}

export function getActiveConcernDetectionCount(): number {
  return concernDetectionRegistry.getActiveCount();
}

export default ConcernDetectionEngine;
