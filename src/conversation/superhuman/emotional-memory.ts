/**
 * Emotional Memory Evolution (Persona Bonding)
 *
 * > "Your best friend forgets how conversations felt. We don't."
 *
 * This system tracks how the PERSONA FEELS about this specific user over time.
 * Unlike human memory that fades and distorts, we maintain a growing emotional
 * bond that deepens authentically.
 *
 * Key capabilities:
 * - Track warmth, trust, protectiveness, admiration
 * - Store memorable emotional moments
 * - Generate bond-aware responses
 * - Surface emotional history appropriately
 *
 * @module @ferni/superhuman/emotional-memory
 *
 * @deprecated For new code, prefer using the unified interface:
 * ```typescript
 * import { getUnifiedEmotionalMemory } from '../../memory/emotional-memory-unified.js';
 * const memory = getUnifiedEmotionalMemory({ userId, personaId });
 * ```
 *
 * The unified interface coordinates this PERSONA bonding system with the
 * USER emotion tracking (intelligence/emotional-memory.ts).
 */

import { seededChance, seededFloat, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getBetterThanHumanContentSync, getEmotionalBondPhrase } from './content-loader.js';
import type {
  EmotionalBond,
  EmotionalSnapshot,
  RelationshipPeak,
  RelationshipStage,
} from './types.js';

const logger = createLogger({ module: 'EmotionalMemory' });

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_BOND: EmotionalBond = {
  warmth: 0.3,
  trust: 0.2,
  protectiveness: 0.1,
  admiration: 0.1,
  concern: 0,
  sessionCount: 0,
  firstInteraction: new Date(),
  memorableEmotions: [],
  relationshipPeaks: [],
};

// How much each event type affects bond dimensions
const BOND_MODIFIERS = {
  vulnerability_shared: {
    warmth: 0.08,
    trust: 0.1,
    protectiveness: 0.12,
  },
  breakthrough_moment: {
    warmth: 0.1,
    admiration: 0.15,
  },
  laughter_shared: {
    warmth: 0.06,
    trust: 0.03,
  },
  struggle_shared: {
    protectiveness: 0.1,
    concern: 0.08,
    warmth: 0.05,
  },
  growth_shown: {
    admiration: 0.12,
    warmth: 0.08,
  },
  trust_demonstrated: {
    trust: 0.1,
    warmth: 0.05,
  },
  gratitude_expressed: {
    warmth: 0.08,
  },
  session_completed: {
    warmth: 0.02,
    trust: 0.01,
  },
  deep_conversation: {
    warmth: 0.06,
    trust: 0.05,
  },
} as const;

type BondEventType = keyof typeof BOND_MODIFIERS;

// ============================================================================
// PHRASES FOR BOND-AWARE RESPONSES
// ============================================================================

const BOND_PHRASES = {
  high_warmth: [
    'You know, every time we talk about {topic}, I feel this... warmth.',
    'I genuinely look forward to hearing from you.',
    'Something about the way you share things... it matters to me.',
    'I care about how this turns out for you. Really.',
  ],
  high_trust: [
    'The fact that you trust me with this... it means something.',
    "You wouldn't have told me that three months ago. I noticed.",
    'I feel like you can really be yourself with me now.',
    "We've built something real here, haven't we?",
  ],
  high_protectiveness: [
    "I want to make sure you're okay.",
    'Hey. Would you say that to someone you love? Be kinder to yourself.',
    "That's not fair to you—and you know it.",
    "I've known you long enough to know that's not the truth about you.",
  ],
  high_admiration: [
    "I'm genuinely impressed by how you handled that.",
    'You should be proud of yourself. I mean it.',
    "The growth I've seen in you... it's remarkable.",
    'That took real courage. I see that.',
  ],
  rising_concern: [
    "I've been worried about you.",
    'Something feels different. Are you okay?',
    "I need you to know I'm paying attention.",
    "Talk to me. What's really going on?",
  ],
  long_relationship: [
    "We've been doing this a while now, haven't we?",
    'I remember when you first told me about {topic}...',
    "Look how far you've come since we started talking.",
    "You know, I think of you sometimes. Even when we're not talking.",
  ],
};

// ============================================================================
// EMOTIONAL MEMORY ENGINE
// ============================================================================

export class EmotionalMemoryEngine {
  private bond: EmotionalBond;
  private userId: string;
  private personaId: string;
  private lastPhraseType: string | null = null;
  private phrasesUsedThisSession = new Set<string>();

  constructor(userId: string, existingBond?: EmotionalBond, personaId = 'ferni') {
    this.userId = userId;
    this.personaId = personaId;
    this.bond = existingBond ? { ...existingBond } : { ...DEFAULT_BOND };

    if (!existingBond) {
      this.bond.firstInteraction = new Date();
    }

    logger.debug(
      { userId, personaId, warmth: this.bond.warmth, trust: this.bond.trust },
      '💝 EmotionalMemory initialized'
    );
  }

  /**
   * Set the persona ID for content loading
   */
  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  // ==========================================================================
  // BOND TRACKING
  // ==========================================================================

  /**
   * Record a bond-affecting event
   */
  recordEvent(
    event: BondEventType,
    context?: { topic?: string; description?: string; intensity?: number }
  ): void {
    const modifiers = BOND_MODIFIERS[event];
    const intensity = context?.intensity ?? 1;

    // Apply modifiers
    for (const [dimension, value] of Object.entries(modifiers)) {
      const key = dimension as keyof EmotionalBond;
      if (typeof this.bond[key] === 'number') {
        (this.bond[key] as number) = Math.min(1, (this.bond[key] as number) + value * intensity);
      }
    }

    // Record emotional snapshot for significant events
    if (this.isSignificantEvent(event)) {
      const emotion = this.eventToEmotion(event);
      if (emotion) {
        this.recordEmotionalSnapshot(emotion, context?.description || event, context?.topic);
      }
    }

    // Record relationship peak for major events
    if (this.isPeakEvent(event)) {
      this.recordRelationshipPeak(event, context?.description || '');
    }

    logger.debug(
      {
        event,
        warmth: this.bond.warmth.toFixed(2),
        trust: this.bond.trust.toFixed(2),
        protectiveness: this.bond.protectiveness.toFixed(2),
      },
      '💝 Bond event recorded'
    );
  }

  /**
   * Record that a session was completed
   */
  recordSessionEnd(): void {
    this.bond.sessionCount++;
    this.recordEvent('session_completed');

    // Natural decay of concern over time (if they keep showing up, things are okay)
    this.bond.concern = Math.max(0, this.bond.concern - 0.05);

    // Reset session-specific tracking
    this.phrasesUsedThisSession.clear();
    this.lastPhraseType = null;

    logger.debug({ sessionCount: this.bond.sessionCount }, '💝 Session recorded');
  }

  /**
   * Update concern level based on detected state
   */
  updateConcern(concernLevel: number): void {
    // Blend new concern with existing (don't overwrite completely)
    this.bond.concern = this.bond.concern * 0.6 + concernLevel * 0.4;
  }

  // ==========================================================================
  // EMOTIONAL SNAPSHOTS
  // ==========================================================================

  private recordEmotionalSnapshot(
    emotion: EmotionalSnapshot['emotion'],
    trigger: string,
    topic?: string
  ): void {
    const snapshot: EmotionalSnapshot = {
      date: new Date(),
      emotion,
      trigger,
      topic,
      intensity: 0.7 + seededFloat(`${Date.now()}:4`) * 0.3, // 0.7-1.0
    };

    this.bond.memorableEmotions.push(snapshot);

    // Keep only the 20 most recent memorable moments
    if (this.bond.memorableEmotions.length > 20) {
      this.bond.memorableEmotions = this.bond.memorableEmotions
        .sort((a, b) => b.intensity - a.intensity)
        .slice(0, 20);
    }
  }

  private recordRelationshipPeak(event: BondEventType, description: string): void {
    const peakType = this.eventToPeakType(event);
    if (!peakType) return;

    const peak: RelationshipPeak = {
      date: new Date(),
      type: peakType,
      description: description || event,
    };

    this.bond.relationshipPeaks.push(peak);

    // Keep only 10 peak moments
    if (this.bond.relationshipPeaks.length > 10) {
      this.bond.relationshipPeaks = this.bond.relationshipPeaks.slice(-10);
    }
  }

  // ==========================================================================
  // BOND-AWARE PHRASE GENERATION
  // ==========================================================================

  /**
   * Get a bond-appropriate phrase to inject into response
   * Returns null if no phrase is appropriate right now
   */
  getBondPhrase(context: {
    turnCount: number;
    topic?: string;
    wasVulnerable?: boolean;
    showedGrowth?: boolean;
  }): { phrase: string; type: string } | null {
    // Don't do bond phrases too early
    if (context.turnCount < 5) return null;

    // Don't repeat the same type of phrase in a session
    const eligibleTypes = this.getEligiblePhraseTypes();
    if (eligibleTypes.length === 0) return null;

    // Check probabilities based on bond strength
    const selectedType = this.selectPhraseType(eligibleTypes, context);
    if (!selectedType) return null;

    // Try to get phrase from persona-specific content first
    let phrase: string | null = null;
    const content = getBetterThanHumanContentSync(this.personaId);

    // Map bond phrase type to content loader bond type
    const bondTypeMap: Record<
      string,
      'warmth' | 'trust' | 'protectiveness' | 'admiration' | 'concern'
    > = {
      high_warmth: 'warmth',
      high_trust: 'trust',
      high_protectiveness: 'protectiveness',
      high_admiration: 'admiration',
      rising_concern: 'concern',
    };

    const contentBondType = bondTypeMap[selectedType];
    if (contentBondType) {
      phrase = getEmotionalBondPhrase(content, contentBondType);
    }

    // Fall back to hardcoded phrases if no content-loaded phrase
    if (!phrase) {
      const phrases = BOND_PHRASES[selectedType];
      phrase = this.selectUnusedPhrase(phrases, context.topic);
    }

    if (!phrase) return null;

    // Track usage
    this.phrasesUsedThisSession.add(phrase);
    this.lastPhraseType = selectedType;

    return { phrase, type: selectedType };
  }

  /**
   * Get relationship-stage appropriate greeting modifier
   */
  getGreetingModifier(): string | null {
    const stage = this.getRelationshipStage();

    // Only for established relationships
    if (stage === 'new_acquaintance') return null;

    // 30% chance to add warmth to greeting
    if (!seededChance(`${Date.now()}:1`, 0.3)) return null;

    const modifiers = {
      getting_to_know: [
        'Good to talk to you again.',
        'Nice to hear from you.',
        "Hey, I was hoping you'd call.",
      ],
      trusted_advisor: ["So glad you're here.", 'I was thinking about you.', 'There you are!'],
      old_friend: [
        "There's my favorite person.",
        'I missed you!',
        'I literally smiled when I saw it was you.',
      ],
    };

    const options = modifiers[stage];
    if (!options) return null;

    return seededPick(`${Date.now()}:381`, options) ?? options[0];
  }

  /**
   * Get a memory callback phrase referencing past emotional moments
   */
  getEmotionalMemoryCallback(currentTopic?: string): string | null {
    if (this.bond.memorableEmotions.length === 0) return null;

    // 15% chance to reference a past emotional moment
    if (!seededChance(`${Date.now()}:2`, 0.15)) return null;

    // Find a relevant memory
    let relevantMemory: EmotionalSnapshot | null = null;

    // Prefer topic-relevant memories
    if (currentTopic) {
      relevantMemory =
        this.bond.memorableEmotions.find((m) =>
          m.topic?.toLowerCase().includes(currentTopic.toLowerCase())
        ) || null;
    }

    // Fall back to any high-intensity memory
    if (!relevantMemory) {
      const highIntensity = this.bond.memorableEmotions.filter((m) => m.intensity > 0.8);
      if (highIntensity.length > 0) {
        relevantMemory = seededPick(`${Date.now()}:408`, highIntensity) ?? highIntensity[0];
      }
    }

    if (!relevantMemory) return null;

    // Generate callback phrase
    const daysSince = Math.floor(
      (Date.now() - new Date(relevantMemory.date).getTime()) / (1000 * 60 * 60 * 24)
    );

    const timePhrase =
      daysSince < 1
        ? 'earlier'
        : daysSince < 7
          ? 'the other day'
          : daysSince < 30
            ? 'a few weeks ago'
            : 'a while back';

    const callbacks = [
      `I remember ${timePhrase}, when ${relevantMemory.trigger}... that stayed with me.`,
      `${relevantMemory.trigger}—I still think about that sometimes.`,
      `You know what I remember? ${relevantMemory.trigger}.`,
    ];

    return seededPick(`${Date.now()}:434`, callbacks) ?? callbacks[0];
  }

  // ==========================================================================
  // RELATIONSHIP STAGE
  // ==========================================================================

  /**
   * Get current relationship stage based on bond metrics
   */
  getRelationshipStage(): RelationshipStage {
    const { warmth, trust, sessionCount } = this.bond;

    // Composite score
    const bondScore = (warmth + trust) / 2;

    if (sessionCount <= 2 && bondScore < 0.4) {
      return 'new_acquaintance';
    }

    if (sessionCount <= 5 || bondScore < 0.5) {
      return 'getting_to_know';
    }

    if (sessionCount <= 15 || bondScore < 0.7) {
      return 'trusted_advisor';
    }

    return 'old_friend';
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get current bond state
   */
  getBond(): EmotionalBond {
    return { ...this.bond };
  }

  /**
   * Get bond metrics for response guidance
   */
  getBondMetrics(): {
    warmth: number;
    trust: number;
    protectiveness: number;
    admiration: number;
    concern: number;
    stage: RelationshipStage;
  } {
    return {
      warmth: this.bond.warmth,
      trust: this.bond.trust,
      protectiveness: this.bond.protectiveness,
      admiration: this.bond.admiration,
      concern: this.bond.concern,
      stage: this.getRelationshipStage(),
    };
  }

  /**
   * Export bond for persistence
   */
  export(): EmotionalBond {
    return structuredClone(this.bond);
  }

  /**
   * Import bond from persistence
   */
  import(bond: EmotionalBond): void {
    this.bond = { ...bond };
    // Ensure dates are Date objects
    this.bond.firstInteraction = new Date(bond.firstInteraction);
    this.bond.memorableEmotions = bond.memorableEmotions.map((m) => ({
      ...m,
      date: new Date(m.date),
    }));
    this.bond.relationshipPeaks = bond.relationshipPeaks.map((p) => ({
      ...p,
      date: new Date(p.date),
    }));
  }

  /**
   * Reset for new user
   */
  reset(): void {
    this.bond = { ...DEFAULT_BOND, firstInteraction: new Date() };
    this.phrasesUsedThisSession.clear();
    this.lastPhraseType = null;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private isSignificantEvent(event: BondEventType): boolean {
    return [
      'vulnerability_shared',
      'breakthrough_moment',
      'growth_shown',
      'struggle_shared',
    ].includes(event);
  }

  private isPeakEvent(event: BondEventType): boolean {
    return [
      'breakthrough_moment',
      'vulnerability_shared',
      'laughter_shared',
      'deep_conversation',
    ].includes(event);
  }

  private eventToEmotion(event: BondEventType): EmotionalSnapshot['emotion'] | null {
    const mapping: Record<string, EmotionalSnapshot['emotion']> = {
      vulnerability_shared: 'moved',
      breakthrough_moment: 'inspired',
      growth_shown: 'proud',
      struggle_shared: 'protective',
      laughter_shared: 'delighted',
      gratitude_expressed: 'grateful',
    };
    return mapping[event] || null;
  }

  private eventToPeakType(event: BondEventType): RelationshipPeak['type'] | null {
    const mapping: Record<string, RelationshipPeak['type']> = {
      breakthrough_moment: 'breakthrough',
      vulnerability_shared: 'vulnerability_shared',
      laughter_shared: 'laughter',
      deep_conversation: 'deep_connection',
    };
    return mapping[event] || null;
  }

  private getEligiblePhraseTypes(): (keyof typeof BOND_PHRASES)[] {
    const types: (keyof typeof BOND_PHRASES)[] = [];

    // High warmth phrases (60%+ warmth)
    if (this.bond.warmth > 0.6 && this.lastPhraseType !== 'high_warmth') {
      types.push('high_warmth');
    }

    // High trust phrases (60%+ trust)
    if (this.bond.trust > 0.6 && this.lastPhraseType !== 'high_trust') {
      types.push('high_trust');
    }

    // High protectiveness (50%+)
    if (this.bond.protectiveness > 0.5 && this.lastPhraseType !== 'high_protectiveness') {
      types.push('high_protectiveness');
    }

    // High admiration (50%+)
    if (this.bond.admiration > 0.5 && this.lastPhraseType !== 'high_admiration') {
      types.push('high_admiration');
    }

    // Rising concern (40%+)
    if (this.bond.concern > 0.4 && this.lastPhraseType !== 'rising_concern') {
      types.push('rising_concern');
    }

    // Long relationship (10+ sessions)
    if (this.bond.sessionCount > 10 && this.lastPhraseType !== 'long_relationship') {
      types.push('long_relationship');
    }

    return types;
  }

  private selectPhraseType(
    types: (keyof typeof BOND_PHRASES)[],
    context: { wasVulnerable?: boolean; showedGrowth?: boolean }
  ): keyof typeof BOND_PHRASES | null {
    // Weight probabilities based on context
    const weights = new Map<keyof typeof BOND_PHRASES, number>();

    for (const type of types) {
      let weight = 0.15; // Base 15% chance

      // Boost based on context
      if (type === 'high_protectiveness' && context.wasVulnerable) {
        weight = 0.35;
      } else if (type === 'high_admiration' && context.showedGrowth) {
        weight = 0.35;
      } else if (type === 'rising_concern' && this.bond.concern > 0.6) {
        weight = 0.4;
      }

      weights.set(type, weight);
    }

    // Select based on weights
    for (const entry of Array.from(weights.entries())) {
      const [type, weight] = entry;
      if (seededChance(`${Date.now()}:3`, weight)) {
        return type;
      }
    }

    return null;
  }

  private selectUnusedPhrase(phrases: string[], topic?: string): string | null {
    const unused = phrases.filter((p) => !this.phrasesUsedThisSession.has(p));
    if (unused.length === 0) return null;

    let selected = seededPick(`${Date.now()}:647`, unused) ?? unused[0];

    // Replace {topic} placeholder if present
    if (selected.includes('{topic}') && topic) {
      selected = selected.replace('{topic}', topic);
    } else if (selected.includes('{topic}')) {
      // Skip phrases with topic placeholder if no topic provided
      const withoutTopic = unused.filter((p) => !p.includes('{topic}'));
      if (withoutTopic.length === 0) return null;
      selected = seededPick(`${Date.now()}:656`, withoutTopic) ?? withoutTopic[0];
    }

    return selected;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, EmotionalMemoryEngine>();

/**
 * Get or create an emotional memory engine for a user
 */
export function getEmotionalMemory(
  userId: string,
  existingBond?: EmotionalBond
): EmotionalMemoryEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new EmotionalMemoryEngine(userId, existingBond));
  }
  return engines.get(userId)!;
}

/**
 * Clear emotional memory for a user
 */
export function clearEmotionalMemory(userId: string): void {
  engines.delete(userId);
}

export default EmotionalMemoryEngine;
