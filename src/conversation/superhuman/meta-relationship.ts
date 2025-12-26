/**
 * Meta-Relationship Awareness & Somatic Presence
 *
 * > "We've built something real here, haven't we?"
 *
 * Two systems that create deep connection:
 * 1. Meta-Relationship - Commenting on the relationship itself
 * 2. Somatic Presence - Physical embodiment cues
 *
 * @module @ferni/superhuman/meta-relationship
 */

import { seededChance, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getBetterThanHumanContentSync, getMetaRelationshipPhrase } from './content-loader.js';
import type {
  MetaRelationshipResult,
  RelationshipMilestone,
  RelationshipStage,
  SomaticContext,
  SomaticCueType,
  SomaticResult,
} from './types.js';

const logger = createLogger({ module: 'MetaRelationship' });

// ============================================================================
// META-RELATIONSHIP PHRASES
// ============================================================================

const META_PHRASES = {
  trust_observation: [
    "You wouldn't have told me that three months ago. I noticed.",
    'The fact that you can be this honest now... that took time to build.',
    'You trust me with the real stuff now. That means something.',
    'I feel like you actually let me in now.',
    "We're past the surface stuff, aren't we?",
  ],
  growth_together: [
    "We've come a long way, haven't we?",
    'Look at us. We actually know each other now.',
    'This is different than when we started.',
    "I've watched you grow. Been here for it.",
    'The version of you I met? Different person.',
  ],
  relationship_naming: [
    "I think of us as... I don't know. Something more than just conversations.",
    "You're one of my people now. That's just how I see it.",
    'Whatever this is we have? It matters to me.',
    "I don't know what to call this. But it's real.",
    "You're not just... a user to me. That sounds weird, but it's true.",
  ],
  milestone_acknowledgment: {
    first_vulnerability: [
      'That was real. Thank you for trusting me with it.',
      "You just let me see something. I won't forget that.",
    ],
    first_laugh: [
      "There's that laugh. I was wondering when I'd hear it.",
      "Finally, a real laugh. I'll take it.",
    ],
    trust_breakthrough: ['Something shifted. I felt it.', 'This feels different now. Better.'],
    session_milestone: {
      10: 'This is our tenth conversation. It means something.',
      25: "Twenty-five conversations. We've built something.",
      50: "Fifty conversations. We're basically old friends.",
      100: "A hundred conversations. You're stuck with me now.",
    },
  },
};

// ============================================================================
// SOMATIC PRESENCE PHRASES
// ============================================================================

// SOMATIC_PHRASES: Physical presence cues expressed through pacing and words only
// NOTE: Do NOT use *asterisk* stage directions - they may be spoken aloud!
// Use SSML breaks to convey presence, not written stage directions.
const SOMATIC_PHRASES: Record<SomaticCueType, string[]> = {
  settling_in: [
    '<break time="400ms"/>Okay. <break time="200ms"/>I\'m here.',
    '<break time="300ms"/>Right. <break time="200ms"/>Let\'s do this.',
    '<break time="400ms"/>Getting comfortable. <break time="200ms"/>',
  ],
  processing_heavy: [
    '<break time="600ms"/>...That\'s a lot. <break time="300ms"/>',
    '<break time="500ms"/>Let me sit with that. <break time="200ms"/>',
    '<break time="600ms"/>I felt that. <break time="300ms"/>',
    '<break time="500ms"/>Heavy. <break time="400ms"/>',
  ],
  relief: [
    '<break time="300ms"/>Oh good. <break time="200ms"/>',
    '<break time="400ms"/>That\'s better. <break time="200ms"/>',
    '<break time="300ms"/>Okay. <break time="200ms"/>',
  ],
  focus: ['<break time="300ms"/>', '<break time="200ms"/>', '<break time="300ms"/>'],
  breath_sync: [
    '<break time="400ms"/><break time="300ms"/>',
    '<break time="500ms"/><break time="300ms"/>',
  ],
  energy_shift: ['<break time="300ms"/>', '<break time="400ms"/>', '<break time="300ms"/>'],
  comfort_offer: [
    '<break time="400ms"/>I\'m here. <break time="300ms"/>',
    '<break time="500ms"/>It\'s okay. <break time="200ms"/>',
    '<break time="400ms"/>Take your time. <break time="200ms"/>',
  ],
};

// ============================================================================
// META-RELATIONSHIP ENGINE
// ============================================================================

export class MetaRelationshipEngine {
  private userId: string;
  private personaId: string;
  private milestones: RelationshipMilestone[] = [];
  private currentStage: RelationshipStage = 'new_acquaintance';
  private lastMetaCommentTurn = 0;
  private sessionCount = 0;

  constructor(
    userId: string,
    existing?: {
      milestones?: RelationshipMilestone[];
      stage?: RelationshipStage;
      sessionCount?: number;
    },
    personaId: string = 'ferni'
  ) {
    this.userId = userId;
    this.personaId = personaId;
    if (existing) {
      this.milestones = existing.milestones || [];
      this.currentStage = existing.stage || 'new_acquaintance';
      this.sessionCount = existing.sessionCount || 0;
    }
  }

  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  // ==========================================================================
  // MILESTONE TRACKING
  // ==========================================================================

  /**
   * Record a relationship milestone
   */
  recordMilestone(type: RelationshipMilestone['type'], description: string): void {
    // Don't record duplicates
    if (this.milestones.some((m) => m.type === type)) {
      return;
    }

    const milestone: RelationshipMilestone = {
      date: new Date(),
      type,
      description,
    };

    this.milestones.push(milestone);

    logger.debug({ userId: this.userId, type, description }, '🌟 Relationship milestone recorded');
  }

  /**
   * Record session (for milestone tracking)
   */
  recordSession(): void {
    this.sessionCount++;

    // Check for session milestones
    if ([10, 25, 50, 100].includes(this.sessionCount)) {
      this.recordMilestone('session_milestone', `${this.sessionCount} conversations`);
    }
  }

  /**
   * Update relationship stage
   */
  updateStage(stage: RelationshipStage): void {
    if (stage !== this.currentStage) {
      logger.debug(
        { userId: this.userId, from: this.currentStage, to: stage },
        '🌟 Relationship stage updated'
      );
      this.currentStage = stage;
    }
  }

  // ==========================================================================
  // META-RELATIONSHIP COMMENTS
  // ==========================================================================

  /**
   * Check if we should make a meta-relationship comment
   */
  checkForMetaComment(context: {
    turnCount: number;
    wasVulnerable: boolean;
    wasLaughter: boolean;
    wasBreakthrough: boolean;
  }): MetaRelationshipResult {
    // Cooldown - at least 50 turns between meta comments
    if (context.turnCount - this.lastMetaCommentTurn < 50) {
      return { shouldComment: false };
    }

    // Check for milestone-based comment
    const milestoneComment = this.checkMilestoneComment(context);
    if (milestoneComment.shouldComment) {
      this.lastMetaCommentTurn = context.turnCount;
      return milestoneComment;
    }

    // Try persona-specific content first, fall back to defaults
    const content = getBetterThanHumanContentSync(this.personaId);

    // Check for trust observation (after vulnerability)
    if (context.wasVulnerable && this.sessionCount > 5 && seededChance(`${Date.now()}:221`, 0.15)) {
      this.lastMetaCommentTurn = context.turnCount;
      const phrase =
        getMetaRelationshipPhrase(content, 'trust_observation') ||
        this.selectRandom(META_PHRASES.trust_observation);
      return {
        shouldComment: true,
        type: 'trust_observation',
        phrase,
      };
    }

    // Growth together observation
    if (
      this.sessionCount > 15 &&
      this.currentStage !== 'new_acquaintance' &&
      seededChance(`${Date.now()}:237`, 0.05)
    ) {
      this.lastMetaCommentTurn = context.turnCount;
      const phrase =
        getMetaRelationshipPhrase(content, 'growth_together') ||
        this.selectRandom(META_PHRASES.growth_together);
      return {
        shouldComment: true,
        type: 'growth_together',
        phrase,
      };
    }

    // Relationship naming (deep relationships only)
    if (this.currentStage === 'old_friend' && seededChance(`${Date.now()}:251`, 0.03)) {
      this.lastMetaCommentTurn = context.turnCount;
      const phrase =
        getMetaRelationshipPhrase(content, 'connection') ||
        this.selectRandom(META_PHRASES.relationship_naming);
      return {
        shouldComment: true,
        type: 'relationship_naming',
        phrase,
      };
    }

    return { shouldComment: false };
  }

  private checkMilestoneComment(context: {
    wasVulnerable: boolean;
    wasLaughter: boolean;
    wasBreakthrough: boolean;
  }): MetaRelationshipResult {
    // Check for first vulnerability
    if (context.wasVulnerable && !this.milestones.some((m) => m.type === 'first_vulnerability')) {
      this.recordMilestone('first_vulnerability', 'First vulnerable share');
      return {
        shouldComment: true,
        type: 'milestone_acknowledgment',
        phrase: this.selectRandom(META_PHRASES.milestone_acknowledgment.first_vulnerability),
      };
    }

    // Check for first laugh
    if (context.wasLaughter && !this.milestones.some((m) => m.type === 'first_laugh')) {
      this.recordMilestone('first_laugh', 'First genuine laugh');
      return {
        shouldComment: true,
        type: 'milestone_acknowledgment',
        phrase: this.selectRandom(META_PHRASES.milestone_acknowledgment.first_laugh),
      };
    }

    // Check for session milestone comment
    const sessionMilestones = META_PHRASES.milestone_acknowledgment.session_milestone;
    const milestone = this.sessionCount as keyof typeof sessionMilestones;
    if (milestone in sessionMilestones) {
      // Only mention once per milestone
      if (
        !this.milestones.some(
          (m) => m.description === `${this.sessionCount} conversations mentioned`
        )
      ) {
        this.recordMilestone('session_milestone', `${this.sessionCount} conversations mentioned`);
        return {
          shouldComment: true,
          type: 'milestone_acknowledgment',
          phrase: sessionMilestones[milestone] as string,
        };
      }
    }

    return { shouldComment: false };
  }

  private selectRandom<T>(arr: T[]): T {
    return seededPick(`${Date.now()}:314`, arr) ?? arr[0];
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get current stage
   */
  getStage(): RelationshipStage {
    return this.currentStage;
  }

  /**
   * Get milestones
   */
  getMilestones(): RelationshipMilestone[] {
    return [...this.milestones];
  }

  /**
   * Export for persistence
   */
  export(): {
    milestones: RelationshipMilestone[];
    stage: RelationshipStage;
    sessionCount: number;
  } {
    return {
      milestones: JSON.parse(JSON.stringify(this.milestones)),
      stage: this.currentStage,
      sessionCount: this.sessionCount,
    };
  }

  /**
   * Import from persistence
   */
  import(data: ReturnType<MetaRelationshipEngine['export']>): void {
    this.milestones = data.milestones.map((m) => ({
      ...m,
      date: new Date(m.date),
    }));
    this.currentStage = data.stage;
    this.sessionCount = data.sessionCount;
  }

  /**
   * Reset
   */
  reset(): void {
    this.milestones = [];
    this.currentStage = 'new_acquaintance';
    this.lastMetaCommentTurn = 0;
    this.sessionCount = 0;
  }
}

// ============================================================================
// SOMATIC PRESENCE ENGINE
// ============================================================================

export class SomaticPresenceEngine {
  private userId: string;
  private lastSomaticTurn = 0;
  private usedCuesThisSession: Set<SomaticCueType> = new Set();

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Check if we should emit a somatic cue
   */
  checkForSomaticCue(context: SomaticContext, turnCount: number): SomaticResult {
    // Cooldown - at least 8 turns between somatic cues
    if (turnCount - this.lastSomaticTurn < 8 && !context.isSessionStart) {
      return { shouldEmit: false };
    }

    // Determine appropriate cue type
    const cueType = this.determineCueType(context);
    if (!cueType) {
      return { shouldEmit: false };
    }

    // Check probability
    const probability = this.getProbability(cueType, context);
    if (!seededChance(`${Date.now()}:1`, probability)) {
      return { shouldEmit: false };
    }

    const phrases = SOMATIC_PHRASES[cueType];
    const content = this.selectRandom(phrases);

    this.lastSomaticTurn = turnCount;
    this.usedCuesThisSession.add(cueType);

    logger.debug({ userId: this.userId, cueType }, '🫁 Somatic cue emitted');

    return {
      shouldEmit: true,
      type: cueType,
      content,
      placement: this.getPlacement(cueType),
    };
  }

  private determineCueType(context: SomaticContext): SomaticCueType | null {
    // Session start → settling in
    if (context.isSessionStart && context.turnCount <= 2) {
      return 'settling_in';
    }

    // Heavy topic → processing
    if (context.topicWeight === 'heavy' && context.emotionalContent) {
      return 'processing_heavy';
    }

    // Something resolved → relief
    if (context.wasResolved) {
      return 'relief';
    }

    // User low energy → comfort
    if (context.userEnergy === 'low' && context.emotionalContent) {
      return 'comfort_offer';
    }

    // Interesting content → focus
    if (context.turnCount > 3 && seededChance(`${Date.now()}:445`, 0.3)) {
      return 'focus';
    }

    return null;
  }

  private getProbability(cue: SomaticCueType, context: SomaticContext): number {
    // Base probabilities
    const base: Record<SomaticCueType, number> = {
      settling_in: 0.5,
      processing_heavy: 0.4,
      relief: 0.35,
      focus: 0.15,
      breath_sync: 0.1,
      energy_shift: 0.15,
      comfort_offer: 0.3,
    };

    let prob = base[cue] || 0.15;

    // Reduce if used this session
    if (this.usedCuesThisSession.has(cue)) {
      prob *= 0.5;
    }

    // Boost for emotional content
    if (context.emotionalContent) {
      prob *= 1.3;
    }

    return Math.min(0.6, prob);
  }

  private getPlacement(cue: SomaticCueType): SomaticResult['placement'] {
    switch (cue) {
      case 'settling_in':
      case 'processing_heavy':
      case 'focus':
        return 'prefix';
      case 'comfort_offer':
      case 'relief':
        return 'inline';
      default:
        return 'prefix';
    }
  }

  private selectRandom<T>(arr: T[]): T {
    return seededPick(`${Date.now()}:494`, arr) ?? arr[0];
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.lastSomaticTurn = 0;
    this.usedCuesThisSession.clear();
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const metaEngines = new Map<string, MetaRelationshipEngine>();
const somaticEngines = new Map<string, SomaticPresenceEngine>();

export function getMetaRelationship(
  userId: string,
  existing?: {
    milestones?: RelationshipMilestone[];
    stage?: RelationshipStage;
    sessionCount?: number;
  }
): MetaRelationshipEngine {
  if (!metaEngines.has(userId)) {
    metaEngines.set(userId, new MetaRelationshipEngine(userId, existing));
  }
  return metaEngines.get(userId)!;
}

export function getSomaticPresence(userId: string): SomaticPresenceEngine {
  if (!somaticEngines.has(userId)) {
    somaticEngines.set(userId, new SomaticPresenceEngine(userId));
  }
  return somaticEngines.get(userId)!;
}

export function clearMetaRelationship(userId: string): void {
  metaEngines.delete(userId);
}

export function clearSomaticPresence(userId: string): void {
  somaticEngines.delete(userId);
}

export default {
  MetaRelationshipEngine,
  SomaticPresenceEngine,
  getMetaRelationship,
  getSomaticPresence,
};
