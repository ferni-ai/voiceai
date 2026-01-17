/**
 * Proactive Surfacing Engine
 *
 * A superhuman friend doesn't just remember when asked -
 * they bring things up at exactly the right moment.
 *
 * This engine analyzes every turn for opportunities to
 * proactively surface relevant memories.
 *
 * @module memory/entity-store/proactive-surfacing
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getEntityStore } from './store.js';
import { graphRAGRetrieve } from './graph-rag.js';
import type {
  Entity,
  EntityType,
  SurfacingOpportunity,
  EntityRelationship,
} from './types.js';

const log = createLogger({ module: 'ProactiveSurfacing' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationContext {
  /** Current user turn text */
  currentTurn: string;

  /** User ID */
  userId: string;

  /** Session ID */
  sessionId: string;

  /** Persona ID */
  personaId: string;

  /** Conversation turn number */
  turnNumber: number;

  /** Detected emotion */
  detectedEmotion?: string;

  /** Conversation mood (exploratory, venting, seeking_help, casual) */
  conversationMood?: 'exploratory' | 'venting' | 'seeking_help' | 'casual';

  /** Was last turn a question? */
  lastTurnWasQuestion?: boolean;

  /** Number of surfacings already done this session */
  surfacingCountThisSession: number;

  /** Topics discussed this session */
  sessionTopics: string[];
}

export interface SurfacingConfig {
  /** Maximum surfacings per session */
  maxSurfacingsPerSession: number;

  /** Minimum confidence to surface */
  minConfidence: number;

  /** Enable temporal triggers (birthdays, anniversaries) */
  enableTemporalTriggers: boolean;

  /** Enable pattern insights */
  enablePatternInsights: boolean;

  /** Enable commitment check-ins */
  enableCommitmentCheckins: boolean;
}

const DEFAULT_CONFIG: SurfacingConfig = {
  maxSurfacingsPerSession: 3,
  minConfidence: 0.7,
  enableTemporalTriggers: true,
  enablePatternInsights: true,
  enableCommitmentCheckins: true,
};

// ============================================================================
// PROACTIVE SURFACING ENGINE
// ============================================================================

export class ProactiveSurfacingEngine {
  private config: SurfacingConfig;

  constructor(config: Partial<SurfacingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze current turn for proactive surfacing opportunities
   */
  async analyze(context: ConversationContext): Promise<SurfacingOpportunity[]> {
    const opportunities: SurfacingOpportunity[] = [];

    // Check if we've already surfaced enough this session
    if (context.surfacingCountThisSession >= this.config.maxSurfacingsPerSession) {
      log.debug('Skipping proactive surfacing - max reached for session');
      return [];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. ENTITY MENTIONS
    // User mentioned someone/something we know about
    // ═══════════════════════════════════════════════════════════════════════

    const entityMentions = await this.findEntityMentions(context);
    for (const mention of entityMentions) {
      const related = await this.getRelatedWorthSurfacing(mention.entity, context);

      if (related.length > 0) {
        const receptivity = this.assessReceptivity(context, {
          type: 'entity_context',
          urgency: 'low',
        });

        if (receptivity > 0.6) {
          opportunities.push({
            type: 'entity_context',
            entity: mention.entity,
            timing: 'soon',
            naturalPhrasing: this.generateEntityContextPhrase(mention.entity, related),
            receptivityScore: receptivity,
            relatedInfo: related,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. TEMPORAL TRIGGERS
    // Something time-relevant is coming up or just passed
    // ═══════════════════════════════════════════════════════════════════════

    if (this.config.enableTemporalTriggers) {
      const temporalTriggers = await this.checkTemporalTriggers(context.userId);

      for (const trigger of temporalTriggers) {
        const receptivity = this.assessReceptivity(context, {
          type: 'temporal',
          urgency: trigger.urgency,
        });

        if (receptivity > 0.5) {
          opportunities.push({
            type: 'temporal',
            entity: trigger.entity,
            timing: trigger.urgency === 'high' ? 'immediate' : 'soon',
            naturalPhrasing: trigger.suggestedPhrasing,
            receptivityScore: receptivity,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. PATTERN INSIGHTS
    // We notice a pattern the user might not
    // ═══════════════════════════════════════════════════════════════════════

    if (this.config.enablePatternInsights) {
      const patterns = await this.detectPatternOpportunities(context);

      for (const pattern of patterns) {
        if (pattern.confidence > this.config.minConfidence) {
          opportunities.push({
            type: 'pattern_insight',
            entity: pattern.entity,
            timing: 'when_relevant',
            naturalPhrasing: pattern.surfacingPhrase,
            receptivityScore: pattern.confidence,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. COMMITMENT CHECK-INS
    // They made a commitment we should check in on
    // ═══════════════════════════════════════════════════════════════════════

    if (this.config.enableCommitmentCheckins) {
      const commitments = await this.checkCommitmentOpportunities(context);

      for (const commitment of commitments) {
        opportunities.push({
          type: 'commitment_checkin',
          entity: commitment.entity,
          timing: commitment.timing,
          naturalPhrasing: commitment.suggestedCheckin,
          receptivityScore: commitment.receptivity,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. PRIORITIZE AND FILTER
    // ═══════════════════════════════════════════════════════════════════════

    return this.prioritizeOpportunities(opportunities, context);
  }

  /**
   * Find entities mentioned in current turn
   */
  private async findEntityMentions(
    context: ConversationContext
  ): Promise<Array<{ entity: Entity; mentionType: 'direct' | 'indirect' }>> {
    const store = getEntityStore();

    // Get potential entity matches via Graph-RAG
    const results = await graphRAGRetrieve(
      context.userId,
      context.currentTurn,
      {
        currentTopic: context.sessionTopics[0],
        personaId: context.personaId,
        currentEmotion: context.detectedEmotion,
      },
      {
        topK: 10,
        minScore: 0.5,
        types: ['person', 'event', 'commitment', 'topic'],
      }
    );

    // Filter to likely mentions (high similarity to turn)
    return results.entities
      .filter((r) => r.score > 0.6)
      .map((r) => ({
        entity: r.entity,
        mentionType: r.score > 0.8 ? 'direct' : 'indirect',
      }));
  }

  /**
   * Get related entities worth surfacing
   */
  private async getRelatedWorthSurfacing(
    entity: Entity,
    context: ConversationContext
  ): Promise<Entity[]> {
    const store = getEntityStore();
    const relationships = await store.getEntityRelationships(entity.id);

    const worthSurfacing: Entity[] = [];

    for (const rel of relationships) {
      const relatedId = rel.fromEntity === entity.id ? rel.toEntity : rel.fromEntity;
      const related = await store.getEntity(relatedId);

      if (!related) continue;

      // Skip if already in session topics
      if (context.sessionTopics.some((t) => related.canonicalName.toLowerCase().includes(t))) {
        continue;
      }

      // Check if worth surfacing based on type and relationship
      const shouldSurface = this.shouldSurfaceRelated(entity, related, rel, context);

      if (shouldSurface) {
        worthSurfacing.push(related);
      }
    }

    return worthSurfacing.slice(0, 3); // Max 3 related
  }

  /**
   * Determine if a related entity is worth surfacing
   */
  private shouldSurfaceRelated(
    source: Entity,
    related: Entity,
    relationship: EntityRelationship,
    context: ConversationContext
  ): boolean {
    // High-strength relationships are more worth surfacing
    if (relationship.strength < 0.5) return false;

    // Recently reinforced relationships are more relevant
    const daysSinceReinforced =
      (Date.now() - relationship.lastReinforced.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceReinforced > 30) return false;

    // Emotional entities are worth surfacing
    if (related.emotionalWeight > 0.7) return true;

    // Commitments related to people are worth surfacing
    if (source.type === 'person' && related.type === 'commitment') return true;

    // Events involving people are worth surfacing
    if (source.type === 'person' && related.type === 'event') return true;

    return false;
  }

  /**
   * Check for temporal triggers (birthdays, anniversaries, etc.)
   */
  private async checkTemporalTriggers(
    userId: string
  ): Promise<
    Array<{
      entity: Entity;
      urgency: 'high' | 'medium' | 'low';
      suggestedPhrasing: string;
    }>
  > {
    const store = getEntityStore();
    const triggers: Array<{
      entity: Entity;
      urgency: 'high' | 'medium' | 'low';
      suggestedPhrasing: string;
    }> = [];

    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    // Get all person entities with birthdays
    const people = await store.getUserEntities(userId, { types: ['person'] });

    for (const person of people) {
      const attrs = person.attributes;
      if (attrs._type !== 'person' || !attrs.birthday) continue;

      const { month, day } = attrs.birthday;

      // Check if birthday is today
      if (month === todayMonth && day === todayDay) {
        triggers.push({
          entity: person,
          urgency: 'high',
          suggestedPhrasing: `By the way, it's ${person.canonicalName}'s birthday today!`,
        });
      }
      // Check if birthday is tomorrow
      else if (this.isTomorrow(month, day)) {
        triggers.push({
          entity: person,
          urgency: 'medium',
          suggestedPhrasing: `Oh, ${person.canonicalName}'s birthday is tomorrow - wanted to make sure you remembered!`,
        });
      }
      // Check if birthday is this week
      else if (this.isThisWeek(month, day)) {
        triggers.push({
          entity: person,
          urgency: 'low',
          suggestedPhrasing: `${person.canonicalName}'s birthday is coming up this week.`,
        });
      }
    }

    // Get events for temporal triggers
    const events = await store.getUserEntities(userId, { types: ['event'] });

    for (const event of events) {
      const attrs = event.attributes;
      if (attrs._type !== 'event' || !attrs.date) continue;

      const eventDate = new Date(attrs.date);
      const daysUntil = Math.ceil(
        (eventDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
      );

      if (daysUntil === 0) {
        triggers.push({
          entity: event,
          urgency: 'high',
          suggestedPhrasing: `Just a heads up - ${event.canonicalName} is today!`,
        });
      } else if (daysUntil === 1) {
        triggers.push({
          entity: event,
          urgency: 'medium',
          suggestedPhrasing: `${event.canonicalName} is tomorrow.`,
        });
      } else if (daysUntil > 0 && daysUntil <= 7) {
        triggers.push({
          entity: event,
          urgency: 'low',
          suggestedPhrasing: `${event.canonicalName} is coming up in ${daysUntil} days.`,
        });
      }
    }

    return triggers;
  }

  /**
   * Detect pattern-based surfacing opportunities
   */
  private async detectPatternOpportunities(
    context: ConversationContext
  ): Promise<
    Array<{
      entity: Entity;
      confidence: number;
      surfacingPhrase: string;
    }>
  > {
    const store = getEntityStore();
    const patterns = await store.getUserEntities(context.userId, { types: ['pattern'] });

    const opportunities: Array<{
      entity: Entity;
      confidence: number;
      surfacingPhrase: string;
    }> = [];

    for (const pattern of patterns) {
      const attrs = pattern.attributes;
      if (attrs._type !== 'pattern') continue;

      // Skip if user isn't aware and we shouldn't surface yet
      if (!attrs.userAware && !attrs.shouldSurface) continue;

      // Check if pattern is relevant to current conversation
      const isRelevant = this.isPatternRelevant(pattern, context);

      if (isRelevant && attrs.patternConfidence > this.config.minConfidence) {
        opportunities.push({
          entity: pattern,
          confidence: attrs.patternConfidence,
          surfacingPhrase: this.generatePatternPhrase(pattern, context),
        });
      }
    }

    return opportunities;
  }

  /**
   * Check if a pattern is relevant to current context
   */
  private isPatternRelevant(pattern: Entity, context: ConversationContext): boolean {
    const attrs = pattern.attributes;
    if (attrs._type !== 'pattern') return false;

    // Check if pattern topic matches session topics
    const patternTerms = pattern.canonicalName.toLowerCase().split(' ');
    const sessionTerms = context.sessionTopics.map((t) => t.toLowerCase());

    return patternTerms.some((term) => sessionTerms.some((st) => st.includes(term)));
  }

  /**
   * Generate natural phrasing for pattern insight
   */
  private generatePatternPhrase(pattern: Entity, context: ConversationContext): string {
    const attrs = pattern.attributes;
    if (attrs._type !== 'pattern') return '';

    const softOpeners = [
      "I've noticed something...",
      'This might be interesting...',
      "I'm curious about something...",
      'You know what I\'ve picked up on?',
    ];

    const opener = softOpeners[Math.floor(Math.random() * softOpeners.length)];

    return `${opener} ${attrs.description}`;
  }

  /**
   * Check for commitment check-in opportunities
   */
  private async checkCommitmentOpportunities(
    context: ConversationContext
  ): Promise<
    Array<{
      entity: Entity;
      timing: 'immediate' | 'soon' | 'when_relevant';
      suggestedCheckin: string;
      receptivity: number;
    }>
  > {
    const store = getEntityStore();
    const commitments = await store.getUserEntities(context.userId, { types: ['commitment'] });

    const opportunities: Array<{
      entity: Entity;
      timing: 'immediate' | 'soon' | 'when_relevant';
      suggestedCheckin: string;
      receptivity: number;
    }> = [];

    const today = new Date();

    for (const commitment of commitments) {
      const attrs = commitment.attributes;
      if (attrs._type !== 'commitment') continue;

      // Skip completed or abandoned
      if (attrs.status === 'completed' || attrs.status === 'abandoned') continue;

      // Check if target date is soon
      if (attrs.targetDate) {
        const daysUntil = Math.ceil(
          (new Date(attrs.targetDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
        );

        if (daysUntil <= 0) {
          opportunities.push({
            entity: commitment,
            timing: 'soon',
            suggestedCheckin: `How did ${commitment.canonicalName} go? I remember you wanted to do that.`,
            receptivity: 0.8,
          });
        } else if (daysUntil <= 3) {
          opportunities.push({
            entity: commitment,
            timing: 'when_relevant',
            suggestedCheckin: `Your goal to ${commitment.canonicalName} is coming up soon - how are you feeling about it?`,
            receptivity: 0.6,
          });
        }
      }

      // Check if it's been a while since last check-in
      if (attrs.lastCheckIn) {
        const daysSinceCheckin = Math.ceil(
          (today.getTime() - new Date(attrs.lastCheckIn).getTime()) / (24 * 60 * 60 * 1000)
        );

        if (daysSinceCheckin > 14) {
          opportunities.push({
            entity: commitment,
            timing: 'when_relevant',
            suggestedCheckin: `We haven't talked about ${commitment.canonicalName} in a while - any updates?`,
            receptivity: 0.5,
          });
        }
      }
    }

    return opportunities;
  }

  /**
   * Assess user receptivity to surfacing
   */
  private assessReceptivity(
    context: ConversationContext,
    content: { type: string; urgency: 'high' | 'medium' | 'low' }
  ): number {
    let receptivity = 0.5;

    // Boost if user is in exploratory mode
    if (context.conversationMood === 'exploratory') {
      receptivity += 0.2;
    }

    // Reduce if user is venting
    if (context.conversationMood === 'venting') {
      receptivity -= 0.3;
    }

    // Reduce if we've surfaced a lot already
    if (context.surfacingCountThisSession > 2) {
      receptivity -= 0.2;
    }

    // Boost if high urgency
    if (content.urgency === 'high') {
      receptivity += 0.2;
    }

    // Boost if user asked a question
    if (context.lastTurnWasQuestion) {
      receptivity += 0.1;
    }

    // Early in conversation = more receptive
    if (context.turnNumber < 5) {
      receptivity += 0.1;
    }

    return Math.max(0, Math.min(1, receptivity));
  }

  /**
   * Generate natural phrasing for entity context
   */
  private generateEntityContextPhrase(entity: Entity, related: Entity[]): string {
    const attrs = entity.attributes;

    if (attrs._type === 'person' && related.length > 0) {
      const relatedCommitment = related.find((r) => r.type === 'commitment');
      if (relatedCommitment) {
        return `Speaking of ${entity.canonicalName}, you mentioned wanting to ${relatedCommitment.canonicalName} - how's that going?`;
      }

      const relatedEvent = related.find((r) => r.type === 'event');
      if (relatedEvent) {
        return `Oh, that reminds me - ${relatedEvent.canonicalName} with ${entity.canonicalName} is coming up.`;
      }
    }

    return `That reminds me of something you mentioned about ${entity.canonicalName}...`;
  }

  /**
   * Prioritize and filter opportunities
   */
  private prioritizeOpportunities(
    opportunities: SurfacingOpportunity[],
    context: ConversationContext
  ): SurfacingOpportunity[] {
    // Sort by receptivity score
    const sorted = opportunities.sort(
      (a, b) => (b.receptivityScore ?? 0) - (a.receptivityScore ?? 0)
    );

    // Take top 2-3 opportunities
    const maxOpportunities = Math.max(
      1,
      this.config.maxSurfacingsPerSession - context.surfacingCountThisSession
    );

    return sorted.slice(0, maxOpportunities);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private isTomorrow(month: number, day: number): boolean {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getMonth() + 1 === month && tomorrow.getDate() === day;
  }

  private isThisWeek(month: number, day: number): boolean {
    const today = new Date();
    for (let i = 0; i <= 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() + i);
      if (checkDate.getMonth() + 1 === month && checkDate.getDate() === day) {
        return true;
      }
    }
    return false;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engineInstance: ProactiveSurfacingEngine | null = null;

export function getProactiveSurfacingEngine(): ProactiveSurfacingEngine {
  if (!engineInstance) {
    engineInstance = new ProactiveSurfacingEngine();
  }
  return engineInstance;
}
