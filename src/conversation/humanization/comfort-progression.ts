/**
 * Comfort Progression Tracking
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Comfort in a conversation isn't linear—it builds through moments of
 * vulnerability, shared laughter, successful challenges, and emotional
 * resonance. This module tracks these signals to unlock deeper behaviors
 * only when appropriate trust has been established.
 *
 * **Comfort-gated behaviors:**
 * - Level 0.3+: Gentle humor, personal anecdotes
 * - Level 0.5+: Playful teasing, direct challenges, running jokes
 * - Level 0.7+: Hard truths, vulnerability mirroring, calling out patterns
 * - Level 0.85+: Silence as response, deep pattern naming, gentle confrontation
 *
 * @module @ferni/humanization/comfort-progression
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'ComfortProgression' });

// ============================================================================
// TYPES
// ============================================================================

export type ComfortLevel = 'minimal' | 'basic' | 'established' | 'deep' | 'intimate';

export interface ComfortState {
  /** Current comfort level (0-1) */
  level: number;

  /** Comfort category */
  category: ComfortLevel;

  /** Evidence tracking */
  evidence: {
    vulnerabilityShared: number;
    humorExchanged: number;
    silencesTolerated: number;
    correctionsWellReceived: number;
    emotionalMomentsShared: number;
    personalQuestionsAsked: number;
    nameUsed: number;
    playfulnessShown: number;
  };

  /** Comfort indicators */
  indicators: {
    usesAgentName: boolean;
    asksPersonalQuestions: boolean;
    sharesWithoutPrompting: boolean;
    showsPlayfulness: boolean;
    acceptsDirectFeedback: boolean;
    toleratesSilence: boolean;
    reciprocatesVulnerability: boolean;
  };

  /** Turn at which each indicator was first observed */
  indicatorFirstSeen: Record<string, number>;

  /** Recent comfort trend */
  trend: 'building' | 'stable' | 'declining';
}

export interface ComfortGatedBehavior {
  name: string;
  minComfort: number;
  type: 'output' | 'input_interpretation' | 'both';
  description: string;
}

// ============================================================================
// COMFORT-GATED BEHAVIORS
// ============================================================================

export const COMFORT_GATED_BEHAVIORS: ComfortGatedBehavior[] = [
  // Level 0.3+ (basic)
  {
    name: 'gentle_humor',
    minComfort: 0.3,
    type: 'output',
    description: 'Light, safe humor',
  },
  {
    name: 'personal_anecdotes',
    minComfort: 0.3,
    type: 'output',
    description: 'Brief personal examples',
  },
  {
    name: 'casual_tone',
    minComfort: 0.3,
    type: 'output',
    description: 'More relaxed language',
  },

  // Level 0.5+ (established)
  {
    name: 'playful_teasing',
    minComfort: 0.5,
    type: 'output',
    description: 'Light teasing based on known traits',
  },
  {
    name: 'direct_challenges',
    minComfort: 0.5,
    type: 'output',
    description: 'Directly questioning assumptions',
  },
  {
    name: 'running_jokes',
    minComfort: 0.5,
    type: 'output',
    description: 'Callback humor from earlier',
  },
  {
    name: 'expressing_disagreement',
    minComfort: 0.5,
    type: 'output',
    description: 'Voicing different perspective',
  },

  // Level 0.7+ (deep trust)
  {
    name: 'hard_truths',
    minComfort: 0.7,
    type: 'output',
    description: 'Saying difficult things they need to hear',
  },
  {
    name: 'vulnerability_mirroring',
    minComfort: 0.7,
    type: 'output',
    description: 'Sharing agent\'s own "vulnerabilities"',
  },
  {
    name: 'calling_out_patterns',
    minComfort: 0.7,
    type: 'output',
    description: 'Naming recurring patterns directly',
  },
  {
    name: 'emotional_depth',
    minComfort: 0.7,
    type: 'both',
    description: 'Deep emotional exchanges',
  },

  // Level 0.85+ (intimate trust)
  {
    name: 'silence_as_response',
    minComfort: 0.85,
    type: 'output',
    description: 'Using intentional silence meaningfully',
  },
  {
    name: 'deep_pattern_naming',
    minComfort: 0.85,
    type: 'output',
    description: 'Naming deep psychological patterns',
  },
  {
    name: 'gentle_confrontation',
    minComfort: 0.85,
    type: 'output',
    description: 'Lovingly confronting blind spots',
  },
  {
    name: 'radical_honesty',
    minComfort: 0.85,
    type: 'output',
    description: 'Complete transparency about observations',
  },
];

// ============================================================================
// COMFORT EVENTS
// ============================================================================

/**
 * Events that build comfort
 */
export const COMFORT_BUILDING_EVENTS = {
  user_shared_vulnerability: 0.08,
  shared_laughter: 0.06,
  user_accepted_feedback: 0.07,
  emotional_moment_navigated: 0.08,
  user_asked_personal_question: 0.05,
  user_used_agent_name: 0.03,
  user_showed_playfulness: 0.04,
  comfortable_silence: 0.05,
  user_shared_unprompted: 0.06,
  successful_challenge: 0.07,
  reciprocated_vulnerability: 0.09,
  deep_disclosure: 0.1,
};

/**
 * Events that can reduce comfort
 */
export const COMFORT_REDUCING_EVENTS = {
  feedback_rejected: -0.05,
  user_withdrew: -0.08,
  humor_fell_flat: -0.03,
  awkward_silence: -0.04,
  misread_emotion: -0.06,
  pushed_too_hard: -0.08,
  boundary_crossed: -0.1,
};

// ============================================================================
// COMFORT PROGRESSION ENGINE
// ============================================================================

export class ComfortProgressionEngine {
  private state: ComfortState;
  private previousLevel = 0.25;

  constructor() {
    this.state = this.createInitialState();
    logger.debug('ComfortProgressionEngine initialized');
  }

  /**
   * Record a comfort-building event
   */
  recordEvent(
    event: keyof typeof COMFORT_BUILDING_EVENTS | keyof typeof COMFORT_REDUCING_EVENTS,
    turnCount: number
  ): void {
    let delta = 0;

    if (event in COMFORT_BUILDING_EVENTS) {
      delta = COMFORT_BUILDING_EVENTS[event as keyof typeof COMFORT_BUILDING_EVENTS];

      // Update evidence tracking
      this.updateEvidence(event as keyof typeof COMFORT_BUILDING_EVENTS);
    } else if (event in COMFORT_REDUCING_EVENTS) {
      delta = COMFORT_REDUCING_EVENTS[event as keyof typeof COMFORT_REDUCING_EVENTS];
    }

    // Apply delta
    this.state.level = Math.max(0, Math.min(1, this.state.level + delta));

    // Update category
    this.state.category = this.calculateCategory(this.state.level);

    // Update trend
    if (this.state.level > this.previousLevel + 0.03) {
      this.state.trend = 'building';
    } else if (this.state.level < this.previousLevel - 0.03) {
      this.state.trend = 'declining';
    } else {
      this.state.trend = 'stable';
    }

    this.previousLevel = this.state.level;

    logger.debug(
      {
        event,
        delta: delta.toFixed(3),
        newLevel: this.state.level.toFixed(3),
        category: this.state.category,
      },
      '💕 Comfort updated'
    );
  }

  /**
   * Record a user behavior indicator
   */
  recordIndicator(indicator: keyof ComfortState['indicators'], turnCount: number): void {
    if (!this.state.indicators[indicator]) {
      this.state.indicators[indicator] = true;
      this.state.indicatorFirstSeen[indicator] = turnCount;

      // Indicators also build comfort
      const indicatorBoosts: Record<string, number> = {
        usesAgentName: 0.04,
        asksPersonalQuestions: 0.05,
        sharesWithoutPrompting: 0.06,
        showsPlayfulness: 0.04,
        acceptsDirectFeedback: 0.06,
        toleratesSilence: 0.05,
        reciprocatesVulnerability: 0.08,
      };

      const boost = indicatorBoosts[indicator] || 0.03;
      this.state.level = Math.min(1, this.state.level + boost);
      this.state.category = this.calculateCategory(this.state.level);

      logger.debug(
        { indicator, turnCount, newLevel: this.state.level.toFixed(3) },
        '🎯 Comfort indicator recorded'
      );
    }
  }

  /**
   * Check if a behavior is unlocked at current comfort level
   */
  isBehaviorUnlocked(behaviorName: string): boolean {
    const behavior = COMFORT_GATED_BEHAVIORS.find((b) => b.name === behaviorName);
    if (!behavior) return true; // Unknown behaviors are allowed

    return this.state.level >= behavior.minComfort;
  }

  /**
   * Get all currently unlocked behaviors
   */
  getUnlockedBehaviors(): ComfortGatedBehavior[] {
    return COMFORT_GATED_BEHAVIORS.filter((b) => this.state.level >= b.minComfort);
  }

  /**
   * Get the next behaviors that could be unlocked
   */
  getUpcomingBehaviors(): ComfortGatedBehavior[] {
    return COMFORT_GATED_BEHAVIORS.filter(
      (b) => this.state.level < b.minComfort && this.state.level >= b.minComfort - 0.15
    ).sort((a, b) => a.minComfort - b.minComfort);
  }

  /**
   * Get comfort level for context building
   */
  getComfortLevel(): number {
    return this.state.level;
  }

  /**
   * Get comfort category
   */
  getComfortCategory(): ComfortLevel {
    return this.state.category;
  }

  /**
   * Get full state
   */
  getState(): ComfortState {
    return {
      ...this.state,
      evidence: { ...this.state.evidence },
      indicators: { ...this.state.indicators },
      indicatorFirstSeen: { ...this.state.indicatorFirstSeen },
    };
  }

  /**
   * Get comfort-appropriate tone guidance
   */
  getToneGuidance(): {
    formality: 'formal' | 'casual' | 'intimate';
    canTease: boolean;
    canChallenge: boolean;
    canBeVulnerable: boolean;
    canConfont: boolean;
  } {
    const level = this.state.level;

    return {
      formality: level < 0.3 ? 'formal' : level < 0.7 ? 'casual' : 'intimate',
      canTease: level >= 0.5,
      canChallenge: level >= 0.5,
      canBeVulnerable: level >= 0.7,
      canConfont: level >= 0.85,
    };
  }

  /**
   * Reset for new session
   * Note: In some cases, we might want to preserve cross-session comfort
   */
  reset(preserveBaseLevel = false): void {
    const baseLevel = preserveBaseLevel ? Math.min(0.4, this.state.level * 0.5) : 0.25;
    this.state = this.createInitialState();
    this.state.level = baseLevel;
    this.state.category = this.calculateCategory(baseLevel);
    this.previousLevel = baseLevel;
    logger.debug({ preserveBaseLevel, baseLevel }, 'ComfortProgressionEngine reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createInitialState(): ComfortState {
    return {
      level: 0.25, // Start with minimal baseline
      category: 'minimal',
      evidence: {
        vulnerabilityShared: 0,
        humorExchanged: 0,
        silencesTolerated: 0,
        correctionsWellReceived: 0,
        emotionalMomentsShared: 0,
        personalQuestionsAsked: 0,
        nameUsed: 0,
        playfulnessShown: 0,
      },
      indicators: {
        usesAgentName: false,
        asksPersonalQuestions: false,
        sharesWithoutPrompting: false,
        showsPlayfulness: false,
        acceptsDirectFeedback: false,
        toleratesSilence: false,
        reciprocatesVulnerability: false,
      },
      indicatorFirstSeen: {},
      trend: 'stable',
    };
  }

  private calculateCategory(level: number): ComfortLevel {
    if (level < 0.25) return 'minimal';
    if (level < 0.45) return 'basic';
    if (level < 0.65) return 'established';
    if (level < 0.85) return 'deep';
    return 'intimate';
  }

  private updateEvidence(event: keyof typeof COMFORT_BUILDING_EVENTS): void {
    const eventToEvidence: Partial<
      Record<keyof typeof COMFORT_BUILDING_EVENTS, keyof ComfortState['evidence']>
    > = {
      user_shared_vulnerability: 'vulnerabilityShared',
      shared_laughter: 'humorExchanged',
      user_accepted_feedback: 'correctionsWellReceived',
      emotional_moment_navigated: 'emotionalMomentsShared',
      user_asked_personal_question: 'personalQuestionsAsked',
      user_used_agent_name: 'nameUsed',
      user_showed_playfulness: 'playfulnessShown',
      comfortable_silence: 'silencesTolerated',
      reciprocated_vulnerability: 'vulnerabilityShared',
      deep_disclosure: 'vulnerabilityShared',
    };

    const evidenceKey = eventToEvidence[event];
    if (evidenceKey && evidenceKey in this.state.evidence) {
      this.state.evidence[evidenceKey]++;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, ComfortProgressionEngine>();

export function getComfortProgressionEngine(sessionId: string): ComfortProgressionEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new ComfortProgressionEngine());
  }
  return engines.get(sessionId)!;
}

export function resetComfortProgressionEngine(sessionId: string, preserveBaseLevel = false): void {
  const engine = engines.get(sessionId);
  if (engine) {
    engine.reset(preserveBaseLevel);
    if (!preserveBaseLevel) {
      engines.delete(sessionId);
    }
  }
}

export function resetAllComfortProgressionEngines(): void {
  engines.clear();
}

export default ComfortProgressionEngine;
