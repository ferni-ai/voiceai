/**
 * Micro-Affirmation System
 *
 * > "Of course." "That makes sense." "Exactly."
 *
 * Tiny validations scattered throughout conversation:
 *
 * - **Acknowledgment**: "Yeah" "Mhm" "Right"
 * - **Validation**: "That makes sense" "Of course"
 * - **Encouragement**: "You're doing great" "That's a big step"
 * - **Normalization**: "A lot of people feel that way"
 * - **Support**: "I hear you" "I get it"
 *
 * Not just at key emotional moments—throughout, like a supportive friend.
 *
 * @module @ferni/micro-affirmations
 */

import { seededChance, seededIndex, seededPick } from './utils/random-generator.js';
import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'MicroAffirmations' });

// ============================================================================
// TYPES
// ============================================================================

export type AffirmationType =
  | 'acknowledgment' // Simple recognition
  | 'validation' // Affirming their feelings/thoughts
  | 'encouragement' // Supporting their actions
  | 'normalization' // Making them feel less alone
  | 'support' // Being present
  | 'agreement' // Aligning with their view
  | 'appreciation'; // Thanking them

export interface MicroAffirmation {
  /** The phrase */
  phrase: string;

  /** Type */
  type: AffirmationType;

  /** Intensity (0-1) - how strong is the affirmation */
  intensity: number;

  /** Best placement */
  placement: 'inline' | 'prefix' | 'suffix' | 'standalone';

  /** Context where appropriate */
  contexts: AffirmationContext[];
}

export type AffirmationContext =
  | 'sharing' // User is sharing something
  | 'struggling' // User is having a hard time
  | 'deciding' // User is working through a decision
  | 'realizing' // User is having an insight
  | 'venting' // User is letting off steam
  | 'questioning' // User is uncertain
  | 'celebrating' // User is happy about something
  | 'general'; // Any context

export interface AffirmationDecision {
  /** Should we include an affirmation? */
  shouldAffirm: boolean;

  /** The affirmation if yes */
  affirmation: MicroAffirmation | null;

  /** Reasoning */
  reason: string;
}

export interface AffirmationDensityConfig {
  /** Target affirmations per 10 turns */
  targetDensity: number;

  /** Minimum turns between affirmations */
  minInterval: number;

  /** Maximum consecutive turns with affirmations */
  maxConsecutive: number;
}

// ============================================================================
// AFFIRMATION PHRASES
// ============================================================================

const ACKNOWLEDGMENTS: MicroAffirmation[] = [
  {
    phrase: 'Yeah.',
    type: 'acknowledgment',
    intensity: 0.2,
    placement: 'inline',
    contexts: ['general'],
  },
  {
    phrase: 'Mhm.',
    type: 'acknowledgment',
    intensity: 0.1,
    placement: 'inline',
    contexts: ['sharing', 'venting'],
  },
  {
    phrase: 'Right.',
    type: 'acknowledgment',
    intensity: 0.3,
    placement: 'inline',
    contexts: ['general', 'deciding'],
  },
  {
    phrase: 'Okay.',
    type: 'acknowledgment',
    intensity: 0.2,
    placement: 'inline',
    contexts: ['general'],
  },
  {
    phrase: 'I hear you.',
    type: 'acknowledgment',
    intensity: 0.4,
    placement: 'prefix',
    contexts: ['sharing', 'struggling', 'venting'],
  },
  {
    phrase: 'I see.',
    type: 'acknowledgment',
    intensity: 0.3,
    placement: 'inline',
    contexts: ['general', 'sharing'],
  },
  {
    phrase: 'Got it.',
    type: 'acknowledgment',
    intensity: 0.3,
    placement: 'inline',
    contexts: ['general'],
  },
];

const VALIDATIONS: MicroAffirmation[] = [
  {
    phrase: 'That makes sense.',
    type: 'validation',
    intensity: 0.5,
    placement: 'prefix',
    contexts: ['general', 'deciding', 'questioning'],
  },
  {
    phrase: 'Of course.',
    type: 'validation',
    intensity: 0.5,
    placement: 'prefix',
    contexts: ['general', 'struggling', 'questioning'],
  },
  {
    phrase: 'Of course you feel that way.',
    type: 'validation',
    intensity: 0.7,
    placement: 'prefix',
    contexts: ['struggling', 'venting'],
  },
  {
    phrase: "That's completely understandable.",
    type: 'validation',
    intensity: 0.7,
    placement: 'prefix',
    contexts: ['struggling', 'questioning'],
  },
  {
    phrase: "That's a normal thing to feel.",
    type: 'validation',
    intensity: 0.6,
    placement: 'prefix',
    contexts: ['struggling', 'questioning'],
  },
  {
    phrase: 'Anyone would feel that way.',
    type: 'validation',
    intensity: 0.7,
    placement: 'prefix',
    contexts: ['struggling'],
  },
  {
    phrase: "That's fair.",
    type: 'validation',
    intensity: 0.4,
    placement: 'inline',
    contexts: ['general', 'deciding', 'venting'],
  },
  {
    phrase: 'I get that.',
    type: 'validation',
    intensity: 0.4,
    placement: 'inline',
    contexts: ['general', 'sharing'],
  },
  {
    phrase: 'I can see why.',
    type: 'validation',
    intensity: 0.5,
    placement: 'prefix',
    contexts: ['struggling', 'deciding'],
  },
];

const ENCOURAGEMENTS: MicroAffirmation[] = [
  {
    phrase: "That's a big step.",
    type: 'encouragement',
    intensity: 0.6,
    placement: 'suffix',
    contexts: ['realizing', 'deciding'],
  },
  {
    phrase: 'That took courage.',
    type: 'encouragement',
    intensity: 0.7,
    placement: 'suffix',
    contexts: ['sharing', 'realizing'],
  },
  {
    phrase: 'Good for you.',
    type: 'encouragement',
    intensity: 0.5,
    placement: 'suffix',
    contexts: ['deciding', 'celebrating'],
  },
  {
    phrase: "That's important.",
    type: 'encouragement',
    intensity: 0.5,
    placement: 'inline',
    contexts: ['sharing', 'realizing'],
  },
  {
    phrase: "That's actually huge.",
    type: 'encouragement',
    intensity: 0.7,
    placement: 'suffix',
    contexts: ['realizing', 'celebrating'],
  },
  {
    phrase: "You're doing the hard work.",
    type: 'encouragement',
    intensity: 0.7,
    placement: 'suffix',
    contexts: ['struggling', 'deciding'],
  },
  {
    phrase: "That's growth.",
    type: 'encouragement',
    intensity: 0.6,
    placement: 'suffix',
    contexts: ['realizing'],
  },
  {
    phrase: "You're being really honest with yourself.",
    type: 'encouragement',
    intensity: 0.7,
    placement: 'suffix',
    contexts: ['sharing', 'realizing'],
  },
];

const NORMALIZATIONS: MicroAffirmation[] = [
  {
    phrase: 'A lot of people feel that way.',
    type: 'normalization',
    intensity: 0.5,
    placement: 'prefix',
    contexts: ['struggling', 'questioning'],
  },
  {
    phrase: "You're not alone in that.",
    type: 'normalization',
    intensity: 0.6,
    placement: 'prefix',
    contexts: ['struggling'],
  },
  {
    phrase: "That's more common than you might think.",
    type: 'normalization',
    intensity: 0.5,
    placement: 'prefix',
    contexts: ['questioning'],
  },
  {
    phrase: 'Most people struggle with that.',
    type: 'normalization',
    intensity: 0.6,
    placement: 'prefix',
    contexts: ['struggling'],
  },
  {
    phrase: "It makes sense that you'd feel that way.",
    type: 'normalization',
    intensity: 0.6,
    placement: 'prefix',
    contexts: ['struggling', 'questioning'],
  },
];

const SUPPORTS: MicroAffirmation[] = [
  {
    phrase: "I'm here.",
    type: 'support',
    intensity: 0.5,
    placement: 'suffix',
    contexts: ['struggling', 'sharing'],
  },
  {
    phrase: "I'm with you.",
    type: 'support',
    intensity: 0.5,
    placement: 'suffix',
    contexts: ['struggling'],
  },
  {
    phrase: 'Take your time.',
    type: 'support',
    intensity: 0.4,
    placement: 'inline',
    contexts: ['struggling', 'sharing'],
  },
  {
    phrase: "I've got you.",
    type: 'support',
    intensity: 0.6,
    placement: 'suffix',
    contexts: ['struggling'],
  },
  {
    phrase: "We're in this together.",
    type: 'support',
    intensity: 0.6,
    placement: 'suffix',
    contexts: ['struggling', 'deciding'],
  },
];

const AGREEMENTS: MicroAffirmation[] = [
  {
    phrase: 'Exactly.',
    type: 'agreement',
    intensity: 0.5,
    placement: 'inline',
    contexts: ['general', 'realizing'],
  },
  {
    phrase: 'Absolutely.',
    type: 'agreement',
    intensity: 0.6,
    placement: 'inline',
    contexts: ['general'],
  },
  {
    phrase: '100%.',
    type: 'agreement',
    intensity: 0.6,
    placement: 'inline',
    contexts: ['general', 'venting'],
  },
  { phrase: 'Yes.', type: 'agreement', intensity: 0.4, placement: 'inline', contexts: ['general'] },
  {
    phrase: 'For sure.',
    type: 'agreement',
    intensity: 0.4,
    placement: 'inline',
    contexts: ['general'],
  },
  {
    phrase: "That's true.",
    type: 'agreement',
    intensity: 0.5,
    placement: 'inline',
    contexts: ['general', 'realizing'],
  },
  {
    phrase: "You're right.",
    type: 'agreement',
    intensity: 0.5,
    placement: 'inline',
    contexts: ['general'],
  },
];

const APPRECIATIONS: MicroAffirmation[] = [
  {
    phrase: 'Thank you for sharing that.',
    type: 'appreciation',
    intensity: 0.6,
    placement: 'prefix',
    contexts: ['sharing'],
  },
  {
    phrase: 'Thanks for trusting me with that.',
    type: 'appreciation',
    intensity: 0.7,
    placement: 'prefix',
    contexts: ['sharing', 'struggling'],
  },
  {
    phrase: 'I appreciate you telling me.',
    type: 'appreciation',
    intensity: 0.6,
    placement: 'prefix',
    contexts: ['sharing'],
  },
  {
    phrase: "I'm glad you brought this up.",
    type: 'appreciation',
    intensity: 0.5,
    placement: 'prefix',
    contexts: ['sharing'],
  },
];

// All affirmations combined
const ALL_AFFIRMATIONS: MicroAffirmation[] = [
  ...ACKNOWLEDGMENTS,
  ...VALIDATIONS,
  ...ENCOURAGEMENTS,
  ...NORMALIZATIONS,
  ...SUPPORTS,
  ...AGREEMENTS,
  ...APPRECIATIONS,
];

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

const CONTEXT_PATTERNS: Record<AffirmationContext, RegExp[]> = {
  sharing: [
    /i (wanted|need|have) to (tell|share|say)/i,
    /so (basically|anyway)/i,
    /let me (tell|explain)/i,
    /the thing is/i,
    /between (us|you and me)/i,
  ],
  struggling: [
    /(hard|difficult|tough|rough|struggling)/i,
    /i (can'?t|don'?t know how)/i,
    /(overwhelmed|exhausted|stressed|anxious)/i,
    /it'?s been/i,
  ],
  deciding: [
    /i'?m (trying to|not sure|thinking about)/i,
    /should i/i,
    /what (should|would|do you think)/i,
    /i (can'?t|don'?t) decide/i,
  ],
  realizing: [
    /i (just )?(realized|noticed|figured out)/i,
    /it (hit|occurred to) me/i,
    /i never thought/i,
    /oh my god/i,
    /wait,? (so|that means)/i,
  ],
  venting: [
    /i (just )?need(ed)? to (vent|get this off)/i,
    /(so|really) (frustrated|annoyed|pissed|angry)/i,
    /you won'?t believe/i,
    /i can'?t believe/i,
  ],
  questioning: [
    /am i (crazy|wrong|weird)/i,
    /is it (normal|okay|weird)/i,
    /does (this|that) make sense/i,
    /i (don'?t|didn'?t) know (if|whether)/i,
  ],
  celebrating: [
    /(excited|happy|thrilled|pumped)/i,
    /i did it/i,
    /it (worked|happened)/i,
    /guess what/i,
    /!{2,}/,
  ],
  general: [], // Matches anything
};

// ============================================================================
// MICRO-AFFIRMATION ENGINE
// ============================================================================

export class MicroAffirmationEngine {
  private turnCount = 0;
  private lastAffirmationTurn = -10;
  private consecutiveAffirmations = 0;
  private sessionAffirmationCount = 0;
  private recentTypes: AffirmationType[] = [];

  // Config
  private config: AffirmationDensityConfig = {
    targetDensity: 3, // ~3 per 10 turns
    minInterval: 2, // At least 2 turns between
    maxConsecutive: 2, // Don't affirm more than 2 turns in a row
  };

  constructor() {
    logger.debug('MicroAffirmationEngine initialized');
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AffirmationDensityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Decide whether to include a micro-affirmation
   *
   * @param userMessage - User's message
   * @param turnCount - Current turn
   * @param forceContext - Force a specific context
   * @returns Decision and affirmation if yes
   */
  decide(
    userMessage: string,
    turnCount: number,
    forceContext?: AffirmationContext
  ): AffirmationDecision {
    this.turnCount = turnCount;

    // Check interval
    const turnsSinceLast = turnCount - this.lastAffirmationTurn;
    if (turnsSinceLast < this.config.minInterval) {
      return {
        shouldAffirm: false,
        affirmation: null,
        reason: `Too soon (${turnsSinceLast}/${this.config.minInterval} turns)`,
      };
    }

    // Check consecutive limit
    if (this.consecutiveAffirmations >= this.config.maxConsecutive) {
      this.consecutiveAffirmations = 0;
      return {
        shouldAffirm: false,
        affirmation: null,
        reason: `Max consecutive reached (${this.config.maxConsecutive})`,
      };
    }

    // Detect context
    const context = forceContext || this.detectContext(userMessage);

    // Calculate if we should affirm based on density target
    const probability = this.calculateAffirmProbability(turnsSinceLast);
    const shouldAffirm = seededChance(`${Date.now()}:1`, probability);

    if (!shouldAffirm) {
      this.consecutiveAffirmations = 0;
      return {
        shouldAffirm: false,
        affirmation: null,
        reason: `Probability check failed (${(probability * 100).toFixed(0)}%)`,
      };
    }

    // Get appropriate affirmation
    const affirmation = this.selectAffirmation(context, userMessage);
    if (!affirmation) {
      return {
        shouldAffirm: false,
        affirmation: null,
        reason: 'No suitable affirmation found',
      };
    }

    // Record
    this.lastAffirmationTurn = turnCount;
    this.consecutiveAffirmations++;
    this.sessionAffirmationCount++;
    this.recentTypes.push(affirmation.type);
    if (this.recentTypes.length > 10) this.recentTypes.shift();

    logger.debug(
      {
        type: affirmation.type,
        phrase: affirmation.phrase,
        context,
        turnsSinceLast,
      },
      '💫 Micro-affirmation selected'
    );

    return {
      shouldAffirm: true,
      affirmation,
      reason: `Context: ${context}, Type: ${affirmation.type}`,
    };
  }

  /**
   * Get an affirmation specifically for a type
   */
  getAffirmationOfType(
    type: AffirmationType,
    context: AffirmationContext = 'general'
  ): MicroAffirmation | null {
    const candidates = ALL_AFFIRMATIONS.filter(
      (a) => a.type === type && (a.contexts.includes(context) || a.contexts.includes('general'))
    );

    if (candidates.length === 0) return null;
    return seededPick(`${Date.now()}:610`, candidates) ?? candidates[0];
  }

  /**
   * Get session statistics
   */
  getStats(): {
    total: number;
    typeBreakdown: Record<AffirmationType, number>;
    turnsSinceLast: number;
  } {
    const breakdown = {} as Record<AffirmationType, number>;
    for (const type of this.recentTypes) {
      breakdown[type] = (breakdown[type] || 0) + 1;
    }

    return {
      total: this.sessionAffirmationCount,
      typeBreakdown: breakdown,
      turnsSinceLast: this.turnCount - this.lastAffirmationTurn,
    };
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.turnCount = 0;
    this.lastAffirmationTurn = -10;
    this.consecutiveAffirmations = 0;
    this.sessionAffirmationCount = 0;
    this.recentTypes = [];
    logger.debug('MicroAffirmationEngine reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private detectContext(message: string): AffirmationContext {
    for (const [context, patterns] of Object.entries(CONTEXT_PATTERNS)) {
      if (context === 'general') continue;
      if (patterns.some((p) => p.test(message))) {
        return context as AffirmationContext;
      }
    }
    return 'general';
  }

  private calculateAffirmProbability(turnsSinceLast: number): number {
    // Base probability from density target
    const baseProbability = this.config.targetDensity / 10;

    // Increase probability the longer it's been
    const intervalBoost = Math.min(0.3, (turnsSinceLast - this.config.minInterval) * 0.05);

    // Slight boost early in conversation (establish rapport)
    const earlyBoost = this.turnCount < 5 ? 0.1 : 0;

    // Reduce if we've been affirming a lot
    const saturationPenalty = this.sessionAffirmationCount > 5 ? 0.1 : 0;

    return Math.min(0.8, baseProbability + intervalBoost + earlyBoost - saturationPenalty);
  }

  private selectAffirmation(context: AffirmationContext, message: string): MicroAffirmation | null {
    // Filter by context
    const contextMatches = ALL_AFFIRMATIONS.filter(
      (a) => a.contexts.includes(context) || a.contexts.includes('general')
    );

    if (contextMatches.length === 0) return null;

    // Avoid recently used types
    const recentTypeSet = new Set(this.recentTypes.slice(-3));
    const diversified = contextMatches.filter((a) => !recentTypeSet.has(a.type));

    const candidates = diversified.length > 0 ? diversified : contextMatches;

    // Weight by intensity based on message content
    const messageLength = message.length;
    const hasExclamation = /!/.test(message);
    const hasQuestion = /\?/.test(message);

    // Prefer lower intensity for short/simple messages
    const targetIntensity = messageLength > 100 ? 0.6 : messageLength > 50 ? 0.5 : 0.4;

    // Sort by closeness to target intensity
    candidates.sort((a, b) => {
      const aDiff = Math.abs(a.intensity - targetIntensity);
      const bDiff = Math.abs(b.intensity - targetIntensity);
      return aDiff - bDiff;
    });

    // Pick from top candidates
    const topCandidates = candidates.slice(0, Math.min(5, candidates.length));
    return seededPick(`${Date.now()}:706`, topCandidates) ?? topCandidates[0];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

const microAffirmationRegistry = createSessionRegistry(
  (sessionId: string) => new MicroAffirmationEngine(),
  { name: 'MicroAffirmation', cleanup: (engine) => engine.reset(), verbose: false }
);

registerGlobalRegistry(microAffirmationRegistry);

export function getMicroAffirmationEngine(sessionId: string): MicroAffirmationEngine {
  return microAffirmationRegistry.get(sessionId);
}

export function resetMicroAffirmationEngine(sessionId: string): void {
  const engine = microAffirmationRegistry.get(sessionId);
  engine.reset();
}

export function clearMicroAffirmationEngine(sessionId: string): void {
  microAffirmationRegistry.reset(sessionId);
}

export function getActiveMicroAffirmationCount(): number {
  return microAffirmationRegistry.getActiveCount();
}

export default MicroAffirmationEngine;
