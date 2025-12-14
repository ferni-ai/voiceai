/**
 * Conversational Repair Engine
 *
 * > "Wait, I think I misunderstood—let me try again."
 *
 * Detects when miscommunication happened and gracefully recovers:
 *
 * - **Misunderstanding Detection**: Recognize when we got it wrong
 * - **Confusion Signals**: User seems lost or frustrated
 * - **Topic Drift**: We went somewhere they didn't want to go
 * - **Tone Mismatch**: Our energy didn't match theirs
 * - **Graceful Recovery**: Natural repair phrases
 * - **Clarification Requests**: Know when to ask vs. infer
 *
 * Humans repair conversations constantly. This makes Ferni feel attentive.
 *
 * @module @ferni/conversational-repair
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'ConversationalRepair' });

// ============================================================================
// TYPES
// ============================================================================

export type MiscueType =
  | 'misunderstanding' // Got the meaning wrong
  | 'tone_mismatch' // Energy/mood was off
  | 'topic_unwanted' // Went somewhere they didn't want
  | 'assumption_wrong' // Made incorrect assumption
  | 'timing_off' // Advice/question too early/late
  | 'over_interpreted' // Read too much into something
  | 'under_responded' // Didn't give enough
  | 'missed_point' // Focused on wrong thing
  | 'none';

export interface MiscueSignal {
  /** Type of potential miscue */
  type: MiscueType;

  /** Confidence (0-1) */
  confidence: number;

  /** Evidence for detection */
  evidence: string[];

  /** Severity */
  severity: 'minor' | 'moderate' | 'significant';
}

export interface RepairStrategy {
  /** Type of repair */
  type: 'acknowledge' | 'clarify' | 'redirect' | 'apologize' | 'reframe';

  /** Repair phrase */
  phrase: string;

  /** Follow-up question if needed */
  followUp: string | null;

  /** Whether to wait for user response */
  awaitResponse: boolean;
}

export interface RepairDecision {
  /** Should we attempt repair? */
  shouldRepair: boolean;

  /** What went wrong */
  miscue: MiscueSignal;

  /** How to fix it */
  strategy: RepairStrategy | null;

  /** Urgency level */
  urgency: 'low' | 'moderate' | 'high';
}

export interface ConversationTurn {
  speaker: 'user' | 'agent';
  message: string;
  turn: number;
  timestamp: number;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** User signals that suggest misunderstanding */
const MISUNDERSTANDING_SIGNALS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /no,? (i meant|what i mean|i was saying)/i, strength: 0.9 },
  { pattern: /that'?s not (what|quite what|exactly)/i, strength: 0.85 },
  { pattern: /you (misunderstood|misread|missed)/i, strength: 0.95 },
  { pattern: /i (didn'?t|don'?t) mean (that|it)/i, strength: 0.85 },
  { pattern: /no,? (actually|wait)/i, strength: 0.7 },
  { pattern: /let me (clarify|explain|rephrase)/i, strength: 0.8 },
  { pattern: /what i (actually|really) (meant|mean)/i, strength: 0.85 },
  { pattern: /i think you (got|have) the wrong/i, strength: 0.9 },
];

/** User signals suggesting tone mismatch */
const TONE_MISMATCH_SIGNALS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /this isn'?t (funny|a joke|something to)/i, strength: 0.9 },
  { pattern: /i'?m (being|actually) serious/i, strength: 0.8 },
  { pattern: /why (are you|do you seem)/i, strength: 0.6 },
  { pattern: /can you (just|please)( be)?( more)?/i, strength: 0.5 },
  { pattern: /i (don'?t|didn'?t) (need|want) (advice|you to)/i, strength: 0.75 },
  { pattern: /i (just )?want(ed)? (to vent|you to listen)/i, strength: 0.8 },
];

/** Signals that topic went unwanted direction */
const TOPIC_RESISTANCE_SIGNALS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /i (don'?t|didn'?t) (want to|wanna) (talk|go there)/i, strength: 0.85 },
  { pattern: /can we (not|please not|just not)/i, strength: 0.8 },
  { pattern: /let'?s (not|move on|change)/i, strength: 0.7 },
  { pattern: /i'?d rather (not|talk about)/i, strength: 0.75 },
  { pattern: /that'?s not (why|what) i/i, strength: 0.7 },
  { pattern: /i (wasn'?t|didn'?t come here to)/i, strength: 0.8 },
];

/** Signals of confusion */
const CONFUSION_SIGNALS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /^(huh|what)\??$/i, strength: 0.8 },
  { pattern: /i (don'?t|didn'?t) (get|understand|follow)/i, strength: 0.75 },
  { pattern: /what (do you mean|are you|does that)/i, strength: 0.65 },
  { pattern: /i'?m (confused|lost|not sure what)/i, strength: 0.8 },
  { pattern: /where (did|is) (that|this) coming from/i, strength: 0.85 },
  { pattern: /how is (that|this) (related|relevant)/i, strength: 0.75 },
];

/** Signals we missed the point */
const MISSED_POINT_SIGNALS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /that'?s not (the point|what matters|it)/i, strength: 0.9 },
  { pattern: /you'?re (missing|not getting) (the|my)/i, strength: 0.9 },
  { pattern: /the (point|thing|issue) is/i, strength: 0.7 },
  { pattern: /but (that'?s|what) (not|i)/i, strength: 0.6 },
  { pattern: /yes,? but/i, strength: 0.5 },
];

/** Signals of frustration (often indicates repair needed) */
const FRUSTRATION_SIGNALS: Array<{ pattern: RegExp; strength: number }> = [
  { pattern: /never ?mind/i, strength: 0.85 },
  { pattern: /forget (it|i said)/i, strength: 0.85 },
  { pattern: /ugh|argh|sigh/i, strength: 0.7 },
  { pattern: /this (isn'?t|is not) (working|helping)/i, strength: 0.9 },
  { pattern: /(just )?forget it/i, strength: 0.85 },
  { pattern: /whatever/i, strength: 0.6 },
];

// ============================================================================
// REPAIR PHRASES
// ============================================================================

const REPAIR_PHRASES = {
  misunderstanding: [
    'Wait, I think I misunderstood—let me try again.',
    'I hear you saying I got that wrong. Help me understand better?',
    'Let me step back—I think I missed what you were really saying.',
    "I'm sorry, I think I jumped to the wrong conclusion. What did you mean?",
  ],
  tone_mismatch: [
    "I'm sorry—I think I misjudged the tone here. This clearly matters to you.",
    'I hear you. Let me be more present with this.',
    "You're right—I wasn't taking this seriously enough. I'm listening.",
    "I'm sorry. I can hear this is important. Tell me more.",
  ],
  topic_unwanted: [
    "I hear you—let's not go there. What would be more helpful?",
    "Okay, I'll follow your lead. Where do you want to go with this?",
    "Fair enough. I don't want to push you somewhere you don't want to go.",
    "Got it. Let's talk about what you came here for.",
  ],
  assumption_wrong: [
    "I made an assumption there that wasn't right. Let me hear your side.",
    "I shouldn't have assumed that. What's actually going on?",
    "That was me projecting. Tell me what's true for you.",
  ],
  over_interpreted: [
    "I may have read too much into that. Is it simpler than I'm making it?",
    "Sorry—I might be overcomplicating this. What's the core of it?",
    'Let me not overthink this. What do you actually need?',
  ],
  missed_point: [
    "I hear you—I focused on the wrong thing. What's the real issue?",
    "You're right, I missed the point. Help me see it.",
    'I got distracted by the details. What matters most here?',
  ],
  general: [
    'I feel like I might have missed something. Am I on the right track?',
    'Let me check—did I understand that correctly?',
    "I want to make sure I'm hearing you right.",
  ],
};

const CLARIFICATION_QUESTIONS = [
  'Can you help me understand what you meant by that?',
  'I want to make sure I get this—what are you really saying?',
  "Tell me more so I don't miss what's important.",
  'What would help you feel heard right now?',
];

// ============================================================================
// CONVERSATIONAL REPAIR ENGINE
// ============================================================================

export class ConversationalRepairEngine {
  private conversationHistory: ConversationTurn[] = [];
  private repairAttempts: Array<{ turn: number; type: MiscueType; success?: boolean }> = [];
  private turnCount = 0;

  // Track patterns
  private consecutiveMiscues = 0;
  private lastRepairTurn = -10;

  constructor() {
    logger.debug('ConversationalRepairEngine initialized');
  }

  /**
   * Record a conversation turn
   */
  recordTurn(speaker: 'user' | 'agent', message: string, turnCount: number): void {
    this.turnCount = turnCount;
    this.conversationHistory.push({
      speaker,
      message,
      turn: turnCount,
      timestamp: Date.now(),
    });

    // Keep reasonable history
    if (this.conversationHistory.length > 20) {
      this.conversationHistory.shift();
    }
  }

  /**
   * Analyze user message for signs we need to repair
   *
   * @param userMessage - User's latest message
   * @param previousAgentMessage - What we said before
   * @returns Repair decision
   */
  analyze(userMessage: string, previousAgentMessage?: string): RepairDecision {
    const signals: MiscueSignal[] = [];

    // Check all signal types
    const misunderstanding = this.checkSignals(userMessage, MISUNDERSTANDING_SIGNALS);
    if (misunderstanding.confidence > 0) {
      signals.push({ ...misunderstanding, type: 'misunderstanding' });
    }

    const toneMismatch = this.checkSignals(userMessage, TONE_MISMATCH_SIGNALS);
    if (toneMismatch.confidence > 0) {
      signals.push({ ...toneMismatch, type: 'tone_mismatch' });
    }

    const topicResistance = this.checkSignals(userMessage, TOPIC_RESISTANCE_SIGNALS);
    if (topicResistance.confidence > 0) {
      signals.push({ ...topicResistance, type: 'topic_unwanted' });
    }

    const confusion = this.checkSignals(userMessage, CONFUSION_SIGNALS);
    if (confusion.confidence > 0) {
      signals.push({ ...confusion, type: 'misunderstanding' });
    }

    const missedPoint = this.checkSignals(userMessage, MISSED_POINT_SIGNALS);
    if (missedPoint.confidence > 0) {
      signals.push({ ...missedPoint, type: 'missed_point' });
    }

    const frustration = this.checkSignals(userMessage, FRUSTRATION_SIGNALS);
    if (frustration.confidence > 0) {
      // Frustration suggests something went wrong
      const existing = signals.find((s) => s.type === 'misunderstanding');
      if (existing) {
        existing.confidence = Math.min(1, existing.confidence + 0.15);
        existing.severity = 'significant';
      } else {
        signals.push({
          type: 'misunderstanding',
          confidence: frustration.confidence,
          evidence: frustration.evidence,
          severity: 'moderate',
        });
      }
    }

    // No miscue detected
    if (signals.length === 0) {
      this.consecutiveMiscues = 0;
      return {
        shouldRepair: false,
        miscue: { type: 'none', confidence: 0, evidence: [], severity: 'minor' },
        strategy: null,
        urgency: 'low',
      };
    }

    // Get highest confidence signal
    const primaryMiscue = signals.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    // Update tracking
    this.consecutiveMiscues++;

    // Determine if we should repair
    const shouldRepair = this.shouldAttemptRepair(primaryMiscue);

    // Get repair strategy
    const strategy = shouldRepair ? this.getRepairStrategy(primaryMiscue) : null;

    // Determine urgency
    let urgency: RepairDecision['urgency'] = 'low';
    if (primaryMiscue.severity === 'significant' || this.consecutiveMiscues >= 2) {
      urgency = 'high';
    } else if (primaryMiscue.severity === 'moderate' || primaryMiscue.confidence > 0.7) {
      urgency = 'moderate';
    }

    // Record repair attempt
    if (shouldRepair) {
      this.repairAttempts.push({ turn: this.turnCount, type: primaryMiscue.type });
      this.lastRepairTurn = this.turnCount;
    }

    // Emit signal if significant
    if (shouldRepair && urgency !== 'low') {
      void humanizationSignalEmitter.emit({
        signalType: 'repair_needed',
        intensity: primaryMiscue.confidence,
        concernType: primaryMiscue.type,
        concernLevel: urgency === 'high' ? 'elevated' : 'moderate',
      });
    }

    logger.debug(
      {
        miscueType: primaryMiscue.type,
        confidence: primaryMiscue.confidence.toFixed(2),
        shouldRepair,
        urgency,
        consecutiveMiscues: this.consecutiveMiscues,
      },
      '🔧 Repair analysis complete'
    );

    return {
      shouldRepair,
      miscue: primaryMiscue,
      strategy,
      urgency,
    };
  }

  /**
   * Record outcome of repair attempt
   */
  recordRepairOutcome(success: boolean): void {
    const lastAttempt = this.repairAttempts[this.repairAttempts.length - 1];
    if (lastAttempt) {
      lastAttempt.success = success;

      if (success) {
        this.consecutiveMiscues = 0;
      }
    }
    logger.debug({ success }, 'Repair outcome recorded');
  }

  /**
   * Get a general check-in phrase to verify understanding
   */
  getCheckInPhrase(): string {
    const phrases = [
      'Am I understanding you correctly?',
      'Is that close to what you mean?',
      'Does that land right?',
      'Am I on the right track?',
      "Is that what you're getting at?",
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Get repair statistics
   */
  getStats(): {
    totalAttempts: number;
    successRate: number;
    typeBreakdown: Record<MiscueType, number>;
  } {
    const typeBreakdown = {} as Record<MiscueType, number>;
    let successCount = 0;
    let outcomeCount = 0;

    for (const attempt of this.repairAttempts) {
      typeBreakdown[attempt.type] = (typeBreakdown[attempt.type] || 0) + 1;
      if (attempt.success !== undefined) {
        outcomeCount++;
        if (attempt.success) successCount++;
      }
    }

    return {
      totalAttempts: this.repairAttempts.length,
      successRate: outcomeCount > 0 ? successCount / outcomeCount : 0,
      typeBreakdown,
    };
  }

  /**
   * Reset for new conversation
   */
  reset(): void {
    this.conversationHistory = [];
    this.repairAttempts = [];
    this.turnCount = 0;
    this.consecutiveMiscues = 0;
    this.lastRepairTurn = -10;
    logger.debug('ConversationalRepairEngine reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private checkSignals(
    message: string,
    patterns: Array<{ pattern: RegExp; strength: number }>
  ): { confidence: number; evidence: string[]; severity: MiscueSignal['severity'] } {
    const matches: Array<{ pattern: string; strength: number }> = [];

    for (const { pattern, strength } of patterns) {
      if (pattern.test(message)) {
        matches.push({ pattern: pattern.source, strength });
      }
    }

    if (matches.length === 0) {
      return { confidence: 0, evidence: [], severity: 'minor' };
    }

    const maxStrength = Math.max(...matches.map((m) => m.strength));
    const boost = Math.min(0.15, (matches.length - 1) * 0.05);

    let severity: MiscueSignal['severity'] = 'minor';
    if (maxStrength > 0.85) severity = 'significant';
    else if (maxStrength > 0.7) severity = 'moderate';

    return {
      confidence: Math.min(1, maxStrength + boost),
      evidence: matches.map((m) => `Matched: ${m.pattern.slice(0, 25)}...`),
      severity,
    };
  }

  private shouldAttemptRepair(miscue: MiscueSignal): boolean {
    // High confidence = definitely repair
    if (miscue.confidence > 0.8) return true;

    // Significant severity = repair
    if (miscue.severity === 'significant') return true;

    // Don't repair too frequently
    if (this.turnCount - this.lastRepairTurn < 2) return false;

    // Multiple consecutive miscues = definitely repair
    if (this.consecutiveMiscues >= 2) return true;

    // Moderate threshold
    return miscue.confidence > 0.65;
  }

  private getRepairStrategy(miscue: MiscueSignal): RepairStrategy {
    const type = miscue.type as keyof typeof REPAIR_PHRASES;
    const phrases = REPAIR_PHRASES[type] || REPAIR_PHRASES.general;
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    let strategyType: RepairStrategy['type'] = 'acknowledge';
    let followUp: string | null = null;
    let awaitResponse = false;

    switch (miscue.type) {
      case 'misunderstanding':
        strategyType = 'clarify';
        followUp =
          CLARIFICATION_QUESTIONS[Math.floor(Math.random() * CLARIFICATION_QUESTIONS.length)];
        awaitResponse = true;
        break;

      case 'tone_mismatch':
        strategyType = 'apologize';
        awaitResponse = true;
        break;

      case 'topic_unwanted':
        strategyType = 'redirect';
        followUp = 'What would be more helpful to talk about?';
        awaitResponse = true;
        break;

      case 'missed_point':
        strategyType = 'reframe';
        followUp = "Help me see what I'm missing?";
        awaitResponse = true;
        break;

      default:
        strategyType = 'acknowledge';
        awaitResponse = true;
    }

    return {
      type: strategyType,
      phrase,
      followUp,
      awaitResponse,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

const conversationalRepairRegistry = createSessionRegistry(
  (sessionId: string) => new ConversationalRepairEngine(),
  { name: 'ConversationalRepair', cleanup: (engine) => engine.reset(), verbose: false }
);

registerGlobalRegistry(conversationalRepairRegistry);

export function getConversationalRepairEngine(sessionId: string): ConversationalRepairEngine {
  return conversationalRepairRegistry.get(sessionId);
}

export function resetConversationalRepairEngine(sessionId: string): void {
  const engine = conversationalRepairRegistry.get(sessionId);
  engine.reset();
}

export function clearConversationalRepairEngine(sessionId: string): void {
  conversationalRepairRegistry.reset(sessionId);
}

export function getActiveConversationalRepairCount(): number {
  return conversationalRepairRegistry.getActiveCount();
}

export default ConversationalRepairEngine;
