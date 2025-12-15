/**
 * Behavioral Pattern Detector
 *
 * Detects recurring behavioral patterns across conversations.
 * Helps personas respond appropriately to user tendencies.
 *
 * Philosophy: The deepest kind of understanding isn't remembering what someone
 * said, but noticing patterns they might not even see themselves. "You always
 * doubt yourself before big decisions, but you always figure it out."
 *
 * @module memory/behavioral-pattern-detector
 */

import { createLogger } from '../utils/safe-logger.js';
import type {
  IBehavioralPatternDetector,
  BehavioralPattern,
  PatternType,
  ConversationTurn,
} from './interfaces/index.js';

const log = createLogger({ module: 'BehavioralPatternDetector' });

// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================

interface PatternDefinition {
  type: PatternType;
  description: string;
  implication: string;
  suggestedResponse: string;
  detectPatterns: {
    /** Regex patterns that indicate this behavior */
    indicators: RegExp[];
    /** Minimum matches to consider a potential pattern */
    minMatches: number;
    /** Context indicators (what situation they're in when this happens) */
    contextIndicators?: RegExp[];
  };
}

const PATTERN_DEFINITIONS: PatternDefinition[] = [
  {
    type: 'pre_decision_doubt',
    description: 'Tends to express doubt and uncertainty before major decisions',
    implication: 'They need reassurance during decision-making, but usually make good choices',
    suggestedResponse:
      'Acknowledge the difficulty while reminding them of past successful decisions',
    detectPatterns: {
      indicators: [
        /(?:I|we) don't know (?:if|whether|what)/gi,
        /(?:should|could|might) I/gi,
        /(?:I'm|I am) not sure/gi,
        /what if (?:I|it|this)/gi,
        /(?:torn|conflicted|uncertain) (?:about|between)/gi,
        /(?:scared|afraid) to (?:make|choose)/gi,
        /both options (?:seem|look|feel)/gi,
      ],
      minMatches: 3,
      contextIndicators: [
        /decision/gi,
        /choice/gi,
        /job offer/gi,
        /relationship/gi,
        /move|moving/gi,
      ],
    },
  },
  {
    type: 'deflection_processing',
    description: 'Processes difficult emotions by talking about practical matters',
    implication: 'Emotional conversations may happen through the lens of logistics',
    suggestedResponse: 'Let them discuss logistics while gently acknowledging underlying feelings',
    detectPatterns: {
      indicators: [
        /anyway|but anyway/gi,
        /(?:let's|let me) talk about something else/gi,
        /(?:practically|logistically) speaking/gi,
        /the thing is/gi,
        /(?:focus|focusing) on (?:what|the)/gi,
      ],
      minMatches: 2,
      contextIndicators: [
        /feel|feeling|felt/gi,
        /emotional|emotions/gi,
        /hard|difficult/gi,
        /loss|grief|sad/gi,
      ],
    },
  },
  {
    type: 'late_night_vulnerability',
    description: 'More open and vulnerable during late-night conversations',
    implication: 'Late-night sessions may go deeper; match their openness',
    suggestedResponse: 'Create space for deeper sharing without pushing',
    detectPatterns: {
      indicators: [], // Detected by time of day, not text patterns
      minMatches: 0,
    },
  },
  {
    type: 'progress_minimization',
    description: 'Tends to minimize their own progress and achievements',
    implication: 'They need their progress reflected back to them',
    suggestedResponse: 'Actively celebrate progress and push back gently on minimization',
    detectPatterns: {
      indicators: [
        /(?:it's|it was) (?:just|only|nothing)/gi,
        /(?:anyone|everybody) could/gi,
        /(?:not a big deal|no big deal)/gi,
        /(?:I|we) (?:barely|hardly)/gi,
        /(?:got lucky|was lucky)/gi,
        /(?:doesn't|didn't) really count/gi,
        /(?:I'm|I am) not (?:that|very)/gi,
      ],
      minMatches: 3,
    },
  },
  {
    type: 'conflict_avoidance',
    description: 'Avoids discussing conflicts or disagreements',
    implication: 'They may need a safe space to process conflict feelings',
    suggestedResponse: 'Create safety for discussing difficult interpersonal situations',
    detectPatterns: {
      indicators: [
        /(?:I|we) don't want to (?:cause|start)/gi,
        /(?:keep|keeping) the peace/gi,
        /(?:it's|it is) not worth (?:it|fighting)/gi,
        /(?:let|letting) it go/gi,
        /(?:avoid|avoiding) (?:the|a) confrontation/gi,
        /(?:I'll|I will) just (?:let|accept)/gi,
      ],
      minMatches: 2,
    },
  },
  {
    type: 'future_anxiety',
    description: 'Gets anxious about future unknowns and what-ifs',
    implication: 'Grounding in the present moment may help',
    suggestedResponse: 'Acknowledge uncertainty while focusing on what they can control now',
    detectPatterns: {
      indicators: [
        /what if (?:something|things|it)/gi,
        /(?:worried|worrying) about (?:the|what)/gi,
        /(?:scared|afraid) of (?:the|what)/gi,
        /(?:don't|can't) know what (?:will|could)/gi,
        /(?:thinking|think) too far ahead/gi,
        /(?:future|uncertainty) (?:scares|worries)/gi,
      ],
      minMatches: 3,
    },
  },
  {
    type: 'comparison_trap',
    description: 'Compares themselves unfavorably to others',
    implication: 'They may benefit from focus on their own journey',
    suggestedResponse: 'Redirect focus to their unique path and progress',
    detectPatterns: {
      indicators: [
        /(?:everyone|everybody|others) (?:else|seems)/gi,
        /(?:compared|comparing) to/gi,
        /(?:should|supposed to) be (?:further|more)/gi,
        /(?:behind|ahead) (?:of|compared)/gi,
        /(?:they|she|he) (?:already|has)/gi,
        /(?:at my age|by now)/gi,
      ],
      minMatches: 2,
    },
  },
  {
    type: 'perfectionism',
    description: 'Sets impossibly high standards for themselves',
    implication: 'They may need permission to be imperfect',
    suggestedResponse: 'Validate effort over outcome; celebrate "good enough"',
    detectPatterns: {
      indicators: [
        /(?:has|have) to be (?:perfect|right)/gi,
        /(?:not|isn't|wasn't) (?:good|perfect) enough/gi,
        /(?:should|could) have (?:done|been) (?:better|more)/gi,
        /(?:failed|failing|failure)/gi,
        /(?:can't|couldn't) (?:make|afford) (?:a|any) mistake/gi,
        /(?:100%|hundred percent|completely)/gi,
      ],
      minMatches: 3,
    },
  },
  {
    type: 'help_resistance',
    description: 'Struggles to accept help or support from others',
    implication: 'Offering help may need to be done carefully',
    suggestedResponse: 'Frame support as collaboration rather than charity',
    detectPatterns: {
      indicators: [
        /(?:I|we) (?:can|should) (?:do|handle) (?:it|this) (?:myself|alone)/gi,
        /(?:don't|can't) (?:want|need) (?:to|any) (?:bother|burden)/gi,
        /(?:hate|don't like) asking (?:for|anyone)/gi,
        /(?:should|supposed to) be (?:able|strong)/gi,
        /(?:I'll|I will) figure it out/gi,
      ],
      minMatches: 2,
    },
  },
  {
    type: 'celebration_deflection',
    description: 'Deflects or minimizes when receiving praise or celebration',
    implication: 'They may need practice receiving positive feedback',
    suggestedResponse: 'Be persistent but gentle with acknowledgment; notice the deflection',
    detectPatterns: {
      indicators: [
        /(?:oh|well|I mean)(?:,| ) (?:it's|that's) (?:just|nothing)/gi,
        /(?:don't|stop) (?:need|have) to/gi,
        /(?:change|changing) the subject/gi,
        /(?:anyway|but anyway)/gi,
        /(?:thanks|thank you) (?:but|,)/gi,
        /(?:not really|not that)/gi,
      ],
      minMatches: 2,
      contextIndicators: [
        /congratulations/gi,
        /proud of you/gi,
        /great job/gi,
        /amazing/gi,
        /celebrate/gi,
      ],
    },
  },
];

// ============================================================================
// BEHAVIORAL PATTERN DETECTOR IMPLEMENTATION
// ============================================================================

interface DetectionAccumulator {
  pattern: PatternDefinition;
  matches: Array<{
    context: string;
    behavior: string;
    timestamp: Date;
    turnIndex: number;
  }>;
}

export class BehavioralPatternDetector implements IBehavioralPatternDetector {
  private patterns = new Map<string, BehavioralPattern[]>(); // userId -> patterns

  /**
   * Analyze conversation turns for behavioral patterns
   */
  async analyzeForPatterns(
    turns: ConversationTurn[],
    existingPatterns: BehavioralPattern[]
  ): Promise<BehavioralPattern[]> {
    const accumulators = new Map<PatternType, DetectionAccumulator>();

    // Initialize accumulators for each pattern type
    for (const def of PATTERN_DEFINITIONS) {
      accumulators.set(def.type, { pattern: def, matches: [] });
    }

    // Analyze each user turn
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (turn.role !== 'user') continue;

      const { content } = turn;
      const timestamp = turn.timestamp || new Date();

      // Check each pattern
      for (const [patternType, accumulator] of accumulators.entries()) {
        const def = accumulator.pattern;

        // Check indicators
        for (const indicator of def.detectPatterns.indicators) {
          const matches = content.matchAll(new RegExp(indicator));
          for (const match of matches) {
            // If there are context indicators, check those too
            let inContext = true;
            if (def.detectPatterns.contextIndicators) {
              inContext = def.detectPatterns.contextIndicators.some((ctx) => ctx.test(content));
            }

            if (inContext) {
              accumulator.matches.push({
                context: this.getContext(turns, i),
                behavior: match[0],
                timestamp,
                turnIndex: i,
              });
            }
          }
        }
      }
    }

    // Convert accumulators to patterns
    const now = new Date();
    const detectedPatterns: BehavioralPattern[] = [];

    for (const [patternType, accumulator] of accumulators.entries()) {
      const def = accumulator.pattern;
      if (accumulator.matches.length >= def.detectPatterns.minMatches) {
        // Check if pattern already exists
        const existing = existingPatterns.find((p) => p.patternType === patternType);

        if (existing) {
          // Update existing pattern
          existing.frequency += accumulator.matches.length;
          existing.examples.push(
            ...accumulator.matches.slice(0, 3).map((m) => ({
              context: m.context,
              behavior: m.behavior,
              timestamp: m.timestamp,
            }))
          );
          // Trim examples
          if (existing.examples.length > 10) {
            existing.examples = existing.examples.slice(-10);
          }
          existing.lastObserved = now;
          existing.confidence = Math.min(1, existing.confidence + 0.1);
          detectedPatterns.push(existing);
        } else {
          // Create new pattern
          detectedPatterns.push({
            patternType,
            description: def.description,
            frequency: accumulator.matches.length,
            examples: accumulator.matches.slice(0, 5).map((m) => ({
              context: m.context,
              behavior: m.behavior,
              timestamp: m.timestamp,
            })),
            confidence: Math.min(1, accumulator.matches.length * 0.15),
            implication: def.implication,
            suggestedResponse: def.suggestedResponse,
            firstObserved: now,
            lastObserved: now,
          });
        }
      }
    }

    // Include existing patterns that weren't detected this time (but don't increase confidence)
    for (const existing of existingPatterns) {
      if (!detectedPatterns.find((p) => p.patternType === existing.patternType)) {
        // Slightly decrease confidence over time if not observed
        existing.confidence = Math.max(0.1, existing.confidence - 0.02);
        detectedPatterns.push(existing);
      }
    }

    log.debug({ detected: detectedPatterns.length }, 'Analyzed for behavioral patterns');
    return detectedPatterns;
  }

  /**
   * Get all patterns for a user
   */
  async getPatterns(userId: string): Promise<BehavioralPattern[]> {
    return this.patterns.get(userId) || [];
  }

  /**
   * Save patterns for a user
   */
  async savePatterns(userId: string, patterns: BehavioralPattern[]): Promise<void> {
    this.patterns.set(userId, patterns);
  }

  /**
   * Get guidance based on currently active patterns
   */
  async getActivePatternGuidance(
    userId: string,
    currentContext: string
  ): Promise<{
    activePattern: BehavioralPattern | null;
    guidance: string;
  }> {
    const patterns = await this.getPatterns(userId);
    if (patterns.length === 0) {
      return {
        activePattern: null,
        guidance: '',
      };
    }

    // Check if any pattern's indicators are present in current context
    const contextLower = currentContext.toLowerCase();

    for (const pattern of patterns.sort((a, b) => b.confidence - a.confidence)) {
      const def = PATTERN_DEFINITIONS.find((d) => d.type === pattern.patternType);
      if (!def) continue;

      // Check if indicators are present
      const isActive = def.detectPatterns.indicators.some((indicator) =>
        indicator.test(currentContext)
      );

      if (isActive && pattern.confidence > 0.3) {
        return {
          activePattern: pattern,
          guidance: `This may be their "${pattern.description.toLowerCase()}" pattern. ${pattern.suggestedResponse}`,
        };
      }
    }

    // No active pattern detected in current context
    // But if user is in a situation where patterns typically emerge, give a heads up
    const highConfidencePatterns = patterns.filter((p) => p.confidence > 0.5);
    if (highConfidencePatterns.length > 0) {
      const topPattern = highConfidencePatterns[0];
      return {
        activePattern: null,
        guidance: `Be aware: this user has shown "${topPattern.description.toLowerCase()}" in the past. ${topPattern.implication}`,
      };
    }

    return {
      activePattern: null,
      guidance: '',
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Get context around a turn (previous user message + assistant response)
   */
  private getContext(turns: ConversationTurn[], index: number): string {
    const prev = index > 0 ? turns[index - 1]?.content.slice(0, 100) : '';
    const current = turns[index]?.content.slice(0, 150) || '';
    return prev ? `...${prev} -> ${current}...` : `${current}...`;
  }

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  export(): Array<[string, BehavioralPattern[]]> {
    return Array.from(this.patterns.entries());
  }

  import(data: Array<[string, BehavioralPattern[]]>): void {
    this.patterns = new Map(data);
  }

  /**
   * Get stats
   */
  getStats(userId: string): {
    totalPatterns: number;
    highConfidencePatterns: string[];
    mostFrequent: PatternType | null;
  } {
    const patterns = this.patterns.get(userId) || [];
    const highConf = patterns.filter((p) => p.confidence > 0.5).map((p) => p.patternType);

    const sorted = [...patterns].sort((a, b) => b.frequency - a.frequency);

    return {
      totalPatterns: patterns.length,
      highConfidencePatterns: highConf,
      mostFrequent: sorted[0]?.patternType || null,
    };
  }
}

// ============================================================================
// SINGLETON WITH PERSISTENCE
// ============================================================================

let defaultDetector: BehavioralPatternDetector | null = null;
const loadedUsers = new Set<string>();

export function getBehavioralPatternDetector(): BehavioralPatternDetector {
  if (!defaultDetector) {
    defaultDetector = new BehavioralPatternDetector();
  }
  return defaultDetector;
}

/**
 * Load patterns from Firestore for a user (call once per session)
 */
export async function loadPatternsFromPersistence(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    const { getFirestoreMemoryPersistence } = await import('./firestore-memory-persistence.js');
    const persistence = await getFirestoreMemoryPersistence();

    if (persistence.isAvailable()) {
      const patterns = await persistence.loadBehavioralPatterns(userId);
      if (patterns.length > 0) {
        const detector = getBehavioralPatternDetector();
        await detector.savePatterns(userId, patterns);
        loadedUsers.add(userId);
        log.debug(
          { userId, patternCount: patterns.length },
          'Loaded behavioral patterns from Firestore'
        );
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Firestore persistence not available');
  }
}

/**
 * Save patterns to Firestore
 */
export async function savePatternsToPeristence(userId: string): Promise<void> {
  try {
    const { getFirestoreMemoryPersistence } = await import('./firestore-memory-persistence.js');
    const persistence = await getFirestoreMemoryPersistence();

    if (persistence.isAvailable()) {
      const detector = getBehavioralPatternDetector();
      const patterns = await detector.getPatterns(userId);

      if (patterns.length > 0) {
        await persistence.saveBehavioralPatterns(userId, patterns);
        log.debug(
          { userId, patternCount: patterns.length },
          'Saved behavioral patterns to Firestore'
        );
      }
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to save behavioral patterns');
  }
}

export function resetBehavioralPatternDetector(): void {
  defaultDetector = null;
  loadedUsers.clear();
}

export default {
  BehavioralPatternDetector,
  getBehavioralPatternDetector,
  loadPatternsFromPersistence,
  savePatternsToPeristence,
  resetBehavioralPatternDetector,
  PATTERN_DEFINITIONS,
};
