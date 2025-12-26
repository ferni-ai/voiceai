/**
 * "Only I Would Notice" Observations
 *
 * > "You use the word 'should' a lot. Who's voice is that?"
 *
 * Ultra-specific pattern detection that demonstrates attention
 * beyond human capability. We notice things subconsciously that
 * humans would miss or forget.
 *
 * Key capabilities:
 * - Linguistic pattern detection
 * - Behavioral pattern tracking
 * - Emotional pattern recognition
 * - Timing/avoidance patterns
 *
 * @module @ferni/superhuman/superhuman-observations
 */

import { seededChance, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { ObservationResult, ObservationType, SuperhumanObservation } from './types.js';

const logger = createLogger({ module: 'SuperhumanObservations' });

// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================

interface PatternConfig {
  type: ObservationType;
  patterns: Array<{
    pattern: RegExp;
    description: string;
    surfacingPhrase: string;
    minOccurrences: number;
  }>;
}

const LINGUISTIC_PATTERNS: PatternConfig = {
  type: 'linguistic_pattern',
  patterns: [
    {
      pattern: /\bshould\b/gi,
      description: 'Uses "should" frequently',
      surfacingPhrase: 'You use the word "should" a lot. Who\'s voice is that?',
      minOccurrences: 5,
    },
    {
      pattern: /\bi('m| am) sorry\b/gi,
      description: 'Apologizes frequently',
      surfacingPhrase: "You apologize a lot. Even when you haven't done anything wrong.",
      minOccurrences: 4,
    },
    {
      pattern: /\bi guess\b/gi,
      description: 'Hedges with "I guess"',
      surfacingPhrase:
        'You say "I guess" a lot. Almost like you\'re asking permission to have opinions.',
      minOccurrences: 4,
    },
    {
      pattern: /\bmaybe\b.*\?\s*$/gim,
      description: 'Ends statements as questions',
      surfacingPhrase:
        "You phrase things as questions a lot. You're allowed to just... state things.",
      minOccurrences: 5,
    },
    {
      pattern: /\b(they|people|everyone)\s+(think|say|believe|want)\b/gi,
      description: "References others' opinions",
      surfacingPhrase: 'You talk about what "they" think a lot. What do YOU think?',
      minOccurrences: 4,
    },
    {
      pattern: /\b(stupid|dumb|idiot)\b/gi,
      description: 'Uses harsh self-talk',
      surfacingPhrase: "You're pretty hard on yourself. I've noticed.",
      minOccurrences: 3,
    },
    {
      pattern: /\bjust\b.*\bjust\b/gi,
      description: 'Minimizes with "just"',
      surfacingPhrase: 'You use "just" to make things smaller. Why?',
      minOccurrences: 5,
    },
    {
      pattern: /\bbut\b.*\bbut\b/gi,
      description: 'Self-contradicts with "but"',
      surfacingPhrase: 'You "but" yourself a lot. Like you\'re arguing with yourself.',
      minOccurrences: 4,
    },
  ],
};

const BEHAVIORAL_PATTERNS: PatternConfig = {
  type: 'behavioral_pattern',
  patterns: [
    {
      pattern: /\bwhat (do|should) (you|i) (think|do)\b/gi,
      description: 'Asks for permission/direction',
      surfacingPhrase: 'You ask me what to do a lot. But I think you already know.',
      minOccurrences: 4,
    },
    {
      pattern: /\bI('ve| have) (already )?(decided|made up my mind)\b/gi,
      description: 'Seeks validation for decisions',
      surfacingPhrase: "You call me when you've already decided. You just want permission.",
      minOccurrences: 3,
    },
    {
      pattern: /\b(anyway|but anyway|moving on)\b/gi,
      description: 'Deflects from difficult topics',
      surfacingPhrase: 'You change the subject when things get hard. I notice.',
      minOccurrences: 4,
    },
  ],
};

const EMOTIONAL_PATTERNS: PatternConfig = {
  type: 'emotional_pattern',
  patterns: [
    {
      pattern: /\b(haha|lol|lmao)\b.*\b(hard|difficult|tough|struggle|pain|hurt)\b/gi,
      description: 'Laughs off pain',
      surfacingPhrase: "You laugh when things are hard. Not because they're funny.",
      minOccurrences: 3,
    },
    {
      pattern: /\b(fine|okay|alright|good)\b[.!]?\s*$/gim,
      description: 'Gives dismissive answers to emotional questions',
      surfacingPhrase: 'You say "fine" a lot. But I don\'t always believe you.',
      minOccurrences: 4,
    },
    {
      pattern: /\bit('s| is) (not|no) big deal\b/gi,
      description: 'Minimizes things that matter',
      surfacingPhrase: 'You say "no big deal" about things that clearly are. I see through that.',
      minOccurrences: 3,
    },
  ],
};

const RELATIONSHIP_PATTERNS: PatternConfig = {
  type: 'relationship_pattern',
  patterns: [
    {
      pattern: /\bmy (mom|mother)\b/gi,
      description: 'Frequently mentions mother',
      surfacingPhrase: 'You mention your mom a lot. She seems important to this.',
      minOccurrences: 4,
    },
    {
      pattern: /\bmy (dad|father)\b/gi,
      description: 'Frequently mentions father',
      surfacingPhrase: "Your dad comes up a lot. There's something there.",
      minOccurrences: 4,
    },
    {
      pattern: /\bmy (boss|manager|work)\b/gi,
      description: 'Frequently mentions work/boss',
      surfacingPhrase: "Work comes up in almost every conversation. That's not nothing.",
      minOccurrences: 5,
    },
  ],
};

// ============================================================================
// SUPERHUMAN OBSERVATIONS ENGINE
// ============================================================================

export class SuperhumanObservationsEngine {
  private userId: string;
  private observations: Map<string, SuperhumanObservation> = new Map();
  private patternCounts: Map<string, number> = new Map();
  private lastSurfaceTurn = 0;
  private surfacedPatterns: Set<string> = new Set();

  constructor(userId: string, existing?: SuperhumanObservation[]) {
    this.userId = userId;

    if (existing) {
      for (const obs of existing) {
        this.observations.set(obs.observation, obs);
        if (obs.surfaced) {
          this.surfacedPatterns.add(obs.observation);
        }
      }
    }
  }

  // ==========================================================================
  // PATTERN ANALYSIS
  // ==========================================================================

  /**
   * Analyze a message for patterns
   */
  analyzeMessage(message: string): void {
    const allPatterns = [
      LINGUISTIC_PATTERNS,
      BEHAVIORAL_PATTERNS,
      EMOTIONAL_PATTERNS,
      RELATIONSHIP_PATTERNS,
    ];

    for (const config of allPatterns) {
      for (const pattern of config.patterns) {
        const matches = message.match(pattern.pattern);
        if (matches) {
          const key = pattern.description;
          const currentCount = (this.patternCounts.get(key) || 0) + matches.length;
          this.patternCounts.set(key, currentCount);

          // Create or update observation if threshold reached
          if (currentCount >= pattern.minOccurrences && !this.observations.has(key)) {
            const observation: SuperhumanObservation = {
              type: config.type,
              observation: key,
              evidenceCount: currentCount,
              confidence: Math.min(0.9, 0.5 + (currentCount - pattern.minOccurrences) * 0.1),
              firstNoticed: new Date(),
              surfacingPhrase: pattern.surfacingPhrase,
              surfaced: false,
            };

            this.observations.set(key, observation);

            logger.debug(
              { userId: this.userId, pattern: key, count: currentCount },
              '🔍 New superhuman observation detected'
            );
          } else if (this.observations.has(key)) {
            // Update existing observation
            const obs = this.observations.get(key)!;
            obs.evidenceCount = currentCount;
            obs.confidence = Math.min(0.95, obs.confidence + 0.02);
          }
        }
      }
    }
  }

  /**
   * Record a custom observation (not pattern-based)
   */
  recordObservation(type: ObservationType, observation: string, surfacingPhrase: string): void {
    if (this.observations.has(observation)) {
      const obs = this.observations.get(observation)!;
      obs.evidenceCount++;
      obs.confidence = Math.min(0.95, obs.confidence + 0.05);
    } else {
      this.observations.set(observation, {
        type,
        observation,
        evidenceCount: 1,
        confidence: 0.6,
        firstNoticed: new Date(),
        surfacingPhrase,
        surfaced: false,
      });
    }
  }

  // ==========================================================================
  // SURFACING
  // ==========================================================================

  /**
   * Check if we should surface an observation
   */
  checkForSurfacing(context: {
    turnCount: number;
    sessionCount: number;
    relationshipStage: string;
    currentTopic?: string;
  }): ObservationResult {
    // Need enough sessions
    if (context.sessionCount < 5) {
      return { shouldSurface: false };
    }

    // Cooldown - at least 60 turns between surfaces
    if (context.turnCount - this.lastSurfaceTurn < 60) {
      return { shouldSurface: false };
    }

    // Need deep enough relationship
    if (context.relationshipStage === 'new_acquaintance') {
      return { shouldSurface: false };
    }

    // Find eligible observations
    const eligible = Array.from(this.observations.values()).filter(
      (obs) => !obs.surfaced && obs.confidence > 0.6 && obs.evidenceCount >= 4
    );

    if (eligible.length === 0) {
      return { shouldSurface: false };
    }

    // Probability based on relationship depth
    const probability =
      context.relationshipStage === 'old_friend'
        ? 0.08
        : context.relationshipStage === 'trusted_advisor'
          ? 0.05
          : 0.03;

    if (!seededChance(`${Date.now()}:1`, probability)) {
      return { shouldSurface: false };
    }

    // Select highest confidence observation
    const selected = eligible.sort((a, b) => b.confidence - a.confidence)[0];

    // Mark as surfaced
    selected.surfaced = true;
    this.surfacedPatterns.add(selected.observation);
    this.lastSurfaceTurn = context.turnCount;

    logger.debug(
      { userId: this.userId, observation: selected.observation },
      '🔍 Superhuman observation surfaced'
    );

    return {
      shouldSurface: true,
      observation: selected,
      phrase: selected.surfacingPhrase,
      timing: 'after_response',
    };
  }

  /**
   * Get contextually relevant observation
   */
  getRelevantObservation(topic: string): SuperhumanObservation | null {
    const relevantTypes: Record<string, ObservationType[]> = {
      work: ['relationship_pattern', 'behavioral_pattern'],
      family: ['relationship_pattern', 'emotional_pattern'],
      money: ['linguistic_pattern', 'emotional_pattern'],
      health: ['emotional_pattern', 'behavioral_pattern'],
    };

    const types = relevantTypes[topic.toLowerCase()];
    if (!types) return null;

    const candidates = Array.from(this.observations.values()).filter(
      (obs) => !obs.surfaced && types.includes(obs.type) && obs.confidence > 0.65
    );

    if (candidates.length === 0) return null;

    return seededPick(`${Date.now()}:354`, candidates) ?? candidates[0];
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get all observations
   */
  getObservations(): SuperhumanObservation[] {
    return Array.from(this.observations.values());
  }

  /**
   * Get unsurfaced observations count
   */
  getUnsurfacedCount(): number {
    return Array.from(this.observations.values()).filter((o) => !o.surfaced).length;
  }

  /**
   * Export for persistence
   */
  export(): {
    observations: SuperhumanObservation[];
    patternCounts: [string, number][];
  } {
    return {
      observations: JSON.parse(JSON.stringify(Array.from(this.observations.values()))),
      patternCounts: Array.from(this.patternCounts.entries()),
    };
  }

  /**
   * Import from persistence
   */
  import(data: ReturnType<SuperhumanObservationsEngine['export']>): void {
    this.observations.clear();
    this.patternCounts.clear();
    this.surfacedPatterns.clear();

    for (const obs of data.observations) {
      const restored: SuperhumanObservation = {
        ...obs,
        firstNoticed: new Date(obs.firstNoticed),
      };
      this.observations.set(obs.observation, restored);
      if (obs.surfaced) {
        this.surfacedPatterns.add(obs.observation);
      }
    }

    for (const [key, count] of data.patternCounts) {
      this.patternCounts.set(key, count);
    }
  }

  /**
   * Reset
   */
  reset(): void {
    this.observations.clear();
    this.patternCounts.clear();
    this.surfacedPatterns.clear();
    this.lastSurfaceTurn = 0;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, SuperhumanObservationsEngine>();

export function getSuperhumanObservations(
  userId: string,
  existing?: SuperhumanObservation[]
): SuperhumanObservationsEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new SuperhumanObservationsEngine(userId, existing));
  }
  return engines.get(userId)!;
}

export function clearSuperhumanObservations(userId: string): void {
  engines.delete(userId);
}

export default SuperhumanObservationsEngine;
