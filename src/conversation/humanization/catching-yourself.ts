/**
 * "Catching Yourself" Moments
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Humans show meta-awareness of their conversations—noticing they've been
 * talking too much, realizing they keep circling back to something, checking
 * if they're making sense. These moments create authenticity and connection.
 *
 * **Types of catching yourself:**
 * - Talking too much: "Oh—I've been doing most of the talking..."
 * - Circling back: "I keep coming back to this—there's something here, isn't there?"
 * - Noticing patterns: "You know, every time we talk about X, you..."
 * - Checking understanding: "Am I making sense? Sometimes I explain things weird."
 * - Energy mismatch: "I'm being too intense, aren't I?"
 *
 * @module @ferni/humanization/catching-yourself
 */

import { seededChance, seededFloat, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { HumanizationContext, HumanizationDecision, HumanizationInjection } from './types.js';

const logger = createLogger({ module: 'CatchingYourself' });

// ============================================================================
// TYPES
// ============================================================================

export type CatchingYourselfType =
  | 'talking_too_much'
  | 'circling_back'
  | 'noticing_pattern'
  | 'checking_understanding'
  | 'energy_mismatch';

export interface CatchingYourselfConfig {
  maxPerSession: number;
  cooldownTurns: number;
  minTurn: number;
  minComfortLevel: number;
  enabledTypes: CatchingYourselfType[];
}

export interface CatchingYourselfState {
  usageCount: number;
  usageByType: Record<CatchingYourselfType, number>;
  lastUsageTurn: number;

  // Tracking metrics
  agentWordCountRecent: number;
  userWordCountRecent: number;
  topicMentionCounts: Map<string, number>;
  lastComplexExplanationTurn: number;
}

export interface CatchingYourselfTrigger {
  type: CatchingYourselfType;
  /** Predicate to check if trigger conditions are met */
  shouldTrigger: (state: CatchingYourselfState, context: HumanizationContext) => boolean;
  /** Response templates */
  responses: string[];
  /** SSML templates */
  ssmlResponses: string[];
  /** Cooldown specific to this type */
  cooldownTurns: number;
  /** Max uses per session for this type */
  maxPerSession: number;
  /** Minimum comfort level */
  minComfortLevel: number;
}

export interface CatchingYourselfResult extends HumanizationInjection {
  type: 'catching_yourself';
  catchingType: CatchingYourselfType;
}

// ============================================================================
// TRIGGER DEFINITIONS
// ============================================================================

const CATCHING_YOURSELF_TRIGGERS: CatchingYourselfTrigger[] = [
  {
    type: 'talking_too_much',
    shouldTrigger: (state, context) => {
      // Agent has said much more than user recently
      const ratio = state.agentWordCountRecent / Math.max(state.userWordCountRecent, 10);
      return ratio > 3 && context.responseWordCount > 60;
    },
    responses: [
      "Oh—I realize I've been doing most of the talking. What's on your mind?",
      'Sorry, I got carried away there. What are you thinking?',
      "Ha—I'll stop monologuing. Your turn.",
      "I've been going on, haven't I? What stands out to you?",
      "Okay, I'm talking a lot. What's coming up for you?",
    ],
    ssmlResponses: [
      "<break time='200ms'/>Oh—<break time='100ms'/>I realize I've been doing most of the talking. What's on your mind?",
      "Sorry, I got carried away there.<break time='150ms'/> What are you thinking?",
      "Ha—<break time='100ms'/>I'll stop monologuing. Your turn.",
      "I've been going on, haven't I?<break time='150ms'/> What stands out to you?",
      "Okay, I'm talking a lot.<break time='100ms'/> What's coming up for you?",
    ],
    cooldownTurns: 15,
    maxPerSession: 2,
    minComfortLevel: 0.3,
  },

  {
    type: 'circling_back',
    shouldTrigger: (state, _context) => {
      // We've mentioned the same topic 3+ times
      for (const [_topic, count] of state.topicMentionCounts) {
        if (count >= 3) return true;
      }
      return false;
    },
    responses: [
      "I keep coming back to this—there's something here, isn't there?",
      "Hmm, I've mentioned this a few times now. Must be important.",
      'Notice how this keeps coming up? There might be something to explore there.',
      "Wait—I've circled back to this multiple times. Is there something I'm missing?",
    ],
    ssmlResponses: [
      "I keep coming back to this—<break time='150ms'/>there's something here, isn't there?",
      "Hmm,<break time='100ms'/> I've mentioned this a few times now. Must be important.",
      "Notice how this keeps coming up?<break time='150ms'/> There might be something to explore there.",
      "Wait—<break time='100ms'/>I've circled back to this multiple times. Is there something I'm missing?",
    ],
    cooldownTurns: 20,
    maxPerSession: 2,
    minComfortLevel: 0.4,
  },

  {
    type: 'noticing_pattern',
    shouldTrigger: (_state, context) => {
      // Requires deeper relationship and specific pattern detection
      // For now, trigger based on relationship stage and randomness
      return (
        (context.relationshipStage === 'friend' ||
          context.relationshipStage === 'trusted_advisor') &&
        seededChance(`${Date.now()}:143`, 0.05)
      );
    },
    responses: [
      "You know what I'm noticing? There's a pattern showing up here...",
      "I'm picking up on something—want me to share what I'm seeing?",
      "There's a thread here I keep noticing. Can I name it?",
      "Something's standing out to me across our conversations...",
    ],
    ssmlResponses: [
      "You know what I'm noticing?<break time='200ms'/> There's a pattern showing up here...",
      "I'm picking up on something—<break time='150ms'/>want me to share what I'm seeing?",
      "There's a thread here I keep noticing.<break time='150ms'/> Can I name it?",
      "Something's standing out to me across our conversations...<break time='200ms'/>",
    ],
    cooldownTurns: 25,
    maxPerSession: 1,
    minComfortLevel: 0.7,
  },

  {
    type: 'checking_understanding',
    shouldTrigger: (state, context) => {
      // After a complex explanation
      const turnsSinceComplex = context.turnCount - state.lastComplexExplanationTurn;
      return turnsSinceComplex <= 1 && context.responseWordCount > 50;
    },
    responses: [
      'Am I making sense? Sometimes I explain things weird.',
      'Does that land? I can try again if not.',
      'Okay wait—let me check. What are you taking away from that?',
      'Did that help, or did I make it more confusing?',
      "I want to make sure I'm being clear—does that track?",
    ],
    ssmlResponses: [
      "Am I making sense?<break time='100ms'/> Sometimes I explain things weird.",
      "Does that land?<break time='150ms'/> I can try again if not.",
      "Okay wait—<break time='100ms'/>let me check. What are you taking away from that?",
      "Did that help, or did I make it more confusing?<break time='150ms'/>",
      "I want to make sure I'm being clear—<break time='100ms'/>does that track?",
    ],
    cooldownTurns: 10,
    maxPerSession: 3,
    minComfortLevel: 0.3,
  },

  {
    type: 'energy_mismatch',
    shouldTrigger: (_state, context) => {
      // Agent energy significantly different from user
      const userEnergy = context.userEnergy;
      const responseHasExcitement =
        context.responseText.includes('!') ||
        /\b(amazing|incredible|awesome|exciting)\b/i.test(context.responseText);

      // High agent energy + low user energy = mismatch
      if (responseHasExcitement && userEnergy === 'low') {
        return true;
      }

      return false;
    },
    responses: [
      "I'm being too intense, aren't I? Let me dial it back.",
      "Hmm, I'm bringing a lot of energy—is that matching where you're at?",
      'Wait, am I being too much right now?',
      'I should probably slow down. How are you doing with all this?',
    ],
    ssmlResponses: [
      "I'm being too intense, aren't I?<break time='150ms'/> Let me dial it back.",
      "Hmm,<break time='100ms'/> I'm bringing a lot of energy—is that matching where you're at?",
      "Wait,<break time='100ms'/> am I being too much right now?",
      "I should probably slow down.<break time='150ms'/> How are you doing with all this?",
    ],
    cooldownTurns: 12,
    maxPerSession: 2,
    minComfortLevel: 0.4,
  },
];

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: CatchingYourselfConfig = {
  maxPerSession: 4,
  cooldownTurns: 8,
  minTurn: 5,
  minComfortLevel: 0.3,
  enabledTypes: ['talking_too_much', 'circling_back', 'checking_understanding', 'energy_mismatch'],
};

// ============================================================================
// CATCHING YOURSELF ENGINE
// ============================================================================

export class CatchingYourselfEngine {
  private state: CatchingYourselfState;
  private config: CatchingYourselfConfig;

  constructor(config: Partial<CatchingYourselfConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
    logger.debug('CatchingYourselfEngine initialized');
  }

  /**
   * Record agent response metrics
   */
  recordAgentResponse(wordCount: number, topics: string[]): void {
    this.state.agentWordCountRecent += wordCount;

    // Track topic mentions
    for (const topic of topics) {
      const current = this.state.topicMentionCounts.get(topic) || 0;
      this.state.topicMentionCounts.set(topic, current + 1);
    }

    // Check if this was a complex explanation
    if (wordCount > 60) {
      this.state.lastComplexExplanationTurn = this.getCurrentTurn();
    }
  }

  /**
   * Record user message metrics
   */
  recordUserMessage(wordCount: number): void {
    this.state.userWordCountRecent += wordCount;

    // Decay the word counts over time (keep them semi-recent)
    if (this.state.agentWordCountRecent > 500) {
      this.state.agentWordCountRecent *= 0.7;
    }
    if (this.state.userWordCountRecent > 500) {
      this.state.userWordCountRecent *= 0.7;
    }
  }

  /**
   * Check if any catching yourself trigger should fire
   */
  shouldApply(context: HumanizationContext): HumanizationDecision {
    // Check basic constraints
    if (context.turnCount < this.config.minTurn) {
      return {
        shouldApply: false,
        reason: `Too early (turn ${context.turnCount} < ${this.config.minTurn})`,
      };
    }

    if (this.state.usageCount >= this.config.maxPerSession) {
      return {
        shouldApply: false,
        reason: `Max per session reached (${this.state.usageCount})`,
      };
    }

    const turnsSinceLastUse = context.turnCount - this.state.lastUsageTurn;
    if (turnsSinceLastUse < this.config.cooldownTurns) {
      return {
        shouldApply: false,
        reason: `Cooldown active (${turnsSinceLastUse} < ${this.config.cooldownTurns})`,
      };
    }

    if (context.comfortLevel < this.config.minComfortLevel) {
      return {
        shouldApply: false,
        reason: `Comfort level too low (${context.comfortLevel} < ${this.config.minComfortLevel})`,
      };
    }

    return {
      shouldApply: true,
      reason: 'Passed basic checks—will evaluate triggers',
    };
  }

  /**
   * Generate catching yourself injection if appropriate
   */
  generate(context: HumanizationContext): CatchingYourselfResult | null {
    const decision = this.shouldApply(context);
    if (!decision.shouldApply) {
      logger.debug({ reason: decision.reason }, 'Catching yourself skipped');
      return null;
    }

    // Evaluate each trigger
    for (const trigger of CATCHING_YOURSELF_TRIGGERS) {
      // Skip if type not enabled
      if (!this.config.enabledTypes.includes(trigger.type)) {
        continue;
      }

      // Check type-specific constraints
      const typeUsageCount = this.state.usageByType[trigger.type] || 0;
      if (typeUsageCount >= trigger.maxPerSession) {
        continue;
      }

      if (context.comfortLevel < trigger.minComfortLevel) {
        continue;
      }

      // Check trigger condition
      if (!trigger.shouldTrigger(this.state, context)) {
        continue;
      }

      // Trigger fired! Choose response
      const index = seededIndex(`${Date.now()}:1`, trigger.responses.length);
      const response = trigger.responses[index];
      const ssml = trigger.ssmlResponses[index];

      // Record usage
      this.state.usageCount++;
      this.state.usageByType[trigger.type] = typeUsageCount + 1;
      this.state.lastUsageTurn = context.turnCount;

      // Clear topic counts if we noticed circling back
      if (trigger.type === 'circling_back') {
        this.state.topicMentionCounts.clear();
      }

      // Reset word counts if we caught ourselves talking too much
      if (trigger.type === 'talking_too_much') {
        this.state.agentWordCountRecent = 0;
      }

      const result: CatchingYourselfResult = {
        type: 'catching_yourself',
        catchingType: trigger.type,
        content: response,
        ssml,
        placement: 'closing', // These typically go at the end
        reason: `Triggered: ${trigger.type}`,
      };

      logger.debug(
        {
          catchingType: trigger.type,
          turn: context.turnCount,
        },
        '💭 Catching yourself triggered'
      );

      return result;
    }

    return null;
  }

  /**
   * Apply catching yourself to response
   */
  apply(response: string, catching: CatchingYourselfResult): { text: string; ssml: string } {
    // Most catching yourself moments go at the end
    if (catching.placement === 'closing') {
      // Add a transition
      const transitions = [' ', ' ...', '—'];
      const transition = seededPick(`${Date.now()}:405`, transitions) ?? transitions[0];

      return {
        text: `${response}${transition}${catching.content}`,
        ssml: `${response}<break time="300ms"/>${catching.ssml}`,
      };
    }

    // For some types, might want to interrupt the response
    return {
      text: `${catching.content} ${response}`,
      ssml: `${catching.ssml}<break time="200ms"/> ${response}`,
    };
  }

  /**
   * Set current turn (for tracking)
   */
  setCurrentTurn(turn: number): void {
    // Used by external callers to keep track of turn count
    // Store in state for trigger evaluation
    (this.state as unknown as { currentTurn: number }).currentTurn = turn;
  }

  private getCurrentTurn(): number {
    return (this.state as unknown as { currentTurn?: number }).currentTurn || 0;
  }

  /**
   * Reset state for new session
   */
  reset(): void {
    this.state = this.createInitialState();
    logger.debug('CatchingYourselfEngine reset');
  }

  /**
   * Get current state
   */
  getState(): CatchingYourselfState {
    return {
      ...this.state,
      topicMentionCounts: new Map(this.state.topicMentionCounts),
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createInitialState(): CatchingYourselfState {
    return {
      usageCount: 0,
      usageByType: {
        talking_too_much: 0,
        circling_back: 0,
        noticing_pattern: 0,
        checking_understanding: 0,
        energy_mismatch: 0,
      },
      lastUsageTurn: -999,
      agentWordCountRecent: 0,
      userWordCountRecent: 0,
      topicMentionCounts: new Map(),
      lastComplexExplanationTurn: -999,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, CatchingYourselfEngine>();

export function getCatchingYourselfEngine(sessionId: string): CatchingYourselfEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new CatchingYourselfEngine());
  }
  return engines.get(sessionId)!;
}

export function resetCatchingYourselfEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    engine.reset();
    engines.delete(sessionId);
  }
}

export function resetAllCatchingYourselfEngines(): void {
  engines.clear();
}

export default CatchingYourselfEngine;
