/**
 * Context Enrichment Layer for Holistic Natural Language Understanding
 *
 * Tracks conversation state to provide richer routing context:
 * - Emotional trajectory (is user getting happier/sadder?)
 * - Domain transitions (moving from work talk to personal life?)
 * - Conversation tone (frustrated, casual, urgent?)
 * - Topic continuity (still talking about same thing?)
 *
 * This layer builds on top of single-turn vocabulary detection to provide
 * multi-turn awareness.
 *
 * @module tools/semantic-router/context-enrichment
 */

import {
  analyzeHolisticContext,
  type HolisticContext,
} from './shared-vocabulary.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurnContext {
  turnNumber: number;
  timestamp: number;
  text: string;
  holisticContext: HolisticContext;
  detectedDomains: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'crisis';
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface EmotionalTrajectory {
  trend: 'improving' | 'stable' | 'declining' | 'crisis';
  recentSentiments: Array<'positive' | 'neutral' | 'negative' | 'crisis'>;
  averageValence: number; // -1 to 1
  volatility: number; // 0 to 1 (how much it's changing)
}

export interface DomainTransition {
  previousDomains: string[];
  currentDomains: string[];
  isTransitioning: boolean;
  transitionType: 'none' | 'deepening' | 'broadening' | 'switching';
}

export interface ConversationTone {
  overall: 'casual' | 'serious' | 'urgent' | 'emotional' | 'transactional';
  frustrationLevel: number; // 0 to 1
  engagementLevel: number; // 0 to 1
  formality: 'informal' | 'neutral' | 'formal';
}

export interface EnrichedContext {
  currentTurn: ConversationTurnContext;
  emotionalTrajectory: EmotionalTrajectory;
  domainTransition: DomainTransition;
  conversationTone: ConversationTone;
  topicContinuity: number; // 0 to 1 (how related to previous turns)
  suggestedDomainBoosts: Map<string, number>;
  suggestedDomainPenalties: Map<string, number>;
}

// ============================================================================
// CONVERSATION STATE TRACKER
// ============================================================================

/**
 * Tracks conversation state for context enrichment.
 * One instance per session.
 */
export class ConversationContextTracker {
  private turnHistory: ConversationTurnContext[] = [];
  private readonly maxHistoryLength = 10;

  /**
   * Process a new user turn and return enriched context.
   */
  processTurn(text: string): EnrichedContext {
    const holisticContext = analyzeHolisticContext(text);

    const currentTurn: ConversationTurnContext = {
      turnNumber: this.turnHistory.length + 1,
      timestamp: Date.now(),
      text,
      holisticContext,
      detectedDomains: Array.from(holisticContext.domainBoosts.keys()),
      sentiment: holisticContext.sentiment,
      urgency: holisticContext.overallUrgency,
    };

    // Add to history
    this.turnHistory.push(currentTurn);
    if (this.turnHistory.length > this.maxHistoryLength) {
      this.turnHistory.shift();
    }

    // Compute enriched context
    const emotionalTrajectory = this.computeEmotionalTrajectory();
    const domainTransition = this.computeDomainTransition();
    const conversationTone = this.computeConversationTone();
    const topicContinuity = this.computeTopicContinuity();

    // Compute suggested boosts/penalties based on enriched context
    const { boosts, penalties } = this.computeEnrichedBoosts(
      emotionalTrajectory,
      domainTransition,
      conversationTone
    );

    return {
      currentTurn,
      emotionalTrajectory,
      domainTransition,
      conversationTone,
      topicContinuity,
      suggestedDomainBoosts: boosts,
      suggestedDomainPenalties: penalties,
    };
  }

  /**
   * Compute emotional trajectory from turn history.
   */
  private computeEmotionalTrajectory(): EmotionalTrajectory {
    const recentSentiments = this.turnHistory
      .slice(-5)
      .map((t) => t.sentiment);

    if (recentSentiments.length === 0) {
      return {
        trend: 'stable',
        recentSentiments: [],
        averageValence: 0,
        volatility: 0,
      };
    }

    // Convert sentiments to numeric values
    const valenceMap = {
      crisis: -1.0,
      negative: -0.5,
      neutral: 0,
      positive: 0.5,
    };

    const valences = recentSentiments.map((s) => valenceMap[s]);
    const averageValence = valences.reduce((a, b) => a + b, 0) / valences.length;

    // Calculate volatility (standard deviation)
    const variance =
      valences.reduce((sum, v) => sum + Math.pow(v - averageValence, 2), 0) /
      valences.length;
    const volatility = Math.sqrt(variance);

    // Determine trend
    let trend: 'improving' | 'stable' | 'declining' | 'crisis' = 'stable';

    if (recentSentiments.includes('crisis')) {
      trend = 'crisis';
    } else if (valences.length >= 2) {
      const recentAvg = valences.slice(-2).reduce((a, b) => a + b, 0) / 2;
      const earlierAvg = valences.slice(0, -2).reduce((a, b) => a + b, valences[0]) / Math.max(1, valences.length - 2);

      if (recentAvg > earlierAvg + 0.2) {
        trend = 'improving';
      } else if (recentAvg < earlierAvg - 0.2) {
        trend = 'declining';
      }
    }

    return {
      trend,
      recentSentiments,
      averageValence,
      volatility,
    };
  }

  /**
   * Compute domain transition from turn history.
   */
  private computeDomainTransition(): DomainTransition {
    const currentDomains = this.turnHistory.length > 0
      ? this.turnHistory[this.turnHistory.length - 1].detectedDomains
      : [];

    const previousDomains = this.turnHistory.length > 1
      ? this.turnHistory[this.turnHistory.length - 2].detectedDomains
      : [];

    // Determine transition type
    let transitionType: 'none' | 'deepening' | 'broadening' | 'switching' = 'none';
    let isTransitioning = false;

    if (previousDomains.length > 0 && currentDomains.length > 0) {
      const overlap = currentDomains.filter((d) => previousDomains.includes(d));
      const newDomains = currentDomains.filter((d) => !previousDomains.includes(d));

      if (overlap.length === 0 && newDomains.length > 0) {
        // Completely new domains
        transitionType = 'switching';
        isTransitioning = true;
      } else if (overlap.length > 0 && newDomains.length > 0) {
        // Adding new domains while keeping some old
        transitionType = 'broadening';
        isTransitioning = true;
      } else if (overlap.length > 0 && currentDomains.length <= previousDomains.length) {
        // Staying in same domains or narrowing
        transitionType = 'deepening';
      }
    }

    return {
      previousDomains,
      currentDomains,
      isTransitioning,
      transitionType,
    };
  }

  /**
   * Compute overall conversation tone.
   */
  private computeConversationTone(): ConversationTone {
    const recentTurns = this.turnHistory.slice(-3);

    if (recentTurns.length === 0) {
      return {
        overall: 'casual',
        frustrationLevel: 0,
        engagementLevel: 0.5,
        formality: 'neutral',
      };
    }

    // Count urgency levels
    const urgentCount = recentTurns.filter(
      (t) => t.urgency === 'high' || t.urgency === 'critical'
    ).length;

    // Count negative sentiments
    const negativeCount = recentTurns.filter(
      (t) => t.sentiment === 'negative' || t.sentiment === 'crisis'
    ).length;

    // Determine overall tone
    let overall: 'casual' | 'serious' | 'urgent' | 'emotional' | 'transactional' = 'casual';

    if (urgentCount >= 2 || recentTurns.some((t) => t.urgency === 'critical')) {
      overall = 'urgent';
    } else if (negativeCount >= 2) {
      overall = 'emotional';
    } else if (recentTurns.some((t) => t.holisticContext.relationship?.sentiment === 'transactional')) {
      overall = 'transactional';
    } else if (recentTurns.some((t) => t.sentiment === 'negative')) {
      overall = 'serious';
    }

    // Calculate frustration level
    const frustrationLevel = Math.min(1, negativeCount / 3 + urgentCount / 3);

    // Calculate engagement level (based on turn frequency and detail)
    const avgTextLength = recentTurns.reduce((sum, t) => sum + t.text.length, 0) / recentTurns.length;
    const engagementLevel = Math.min(1, avgTextLength / 100);

    // Determine formality
    let formality: 'informal' | 'neutral' | 'formal' = 'neutral';
    const hasInformalMarkers = recentTurns.some((t) =>
      /\b(hey|yo|yeah|nah|gonna|wanna|gotta|kinda|sorta)\b/i.test(t.text)
    );
    const hasFormalMarkers = recentTurns.some((t) =>
      /\b(please|kindly|would you|could you|I would appreciate)\b/i.test(t.text)
    );

    if (hasInformalMarkers && !hasFormalMarkers) formality = 'informal';
    else if (hasFormalMarkers && !hasInformalMarkers) formality = 'formal';

    return {
      overall,
      frustrationLevel,
      engagementLevel,
      formality,
    };
  }

  /**
   * Compute how related current turn is to previous turns.
   */
  private computeTopicContinuity(): number {
    if (this.turnHistory.length < 2) return 0;

    const current = this.turnHistory[this.turnHistory.length - 1];
    const previous = this.turnHistory[this.turnHistory.length - 2];

    // Check domain overlap
    const domainOverlap = current.detectedDomains.filter((d) =>
      previous.detectedDomains.includes(d)
    ).length;

    const maxDomains = Math.max(
      current.detectedDomains.length,
      previous.detectedDomains.length,
      1
    );

    // Check relationship continuity
    let relationshipContinuity = 0;
    if (
      current.holisticContext.relationship &&
      previous.holisticContext.relationship
    ) {
      if (
        current.holisticContext.relationship.type ===
        previous.holisticContext.relationship.type
      ) {
        relationshipContinuity = 0.3;
      } else if (
        current.holisticContext.relationship.context ===
        previous.holisticContext.relationship.context
      ) {
        relationshipContinuity = 0.2;
      }
    }

    return Math.min(1, domainOverlap / maxDomains + relationshipContinuity);
  }

  /**
   * Compute enriched boosts and penalties based on multi-turn context.
   */
  private computeEnrichedBoosts(
    emotionalTrajectory: EmotionalTrajectory,
    domainTransition: DomainTransition,
    conversationTone: ConversationTone
  ): {
    boosts: Map<string, number>;
    penalties: Map<string, number>;
  } {
    const boosts = new Map<string, number>();
    const penalties = new Map<string, number>();

    // Emotional trajectory boosts
    if (emotionalTrajectory.trend === 'declining') {
      boosts.set('wellness', 0.2);
      boosts.set('self-compassion', 0.15);
      boosts.set('connection', 0.1);
    } else if (emotionalTrajectory.trend === 'crisis') {
      boosts.set('crisis', 0.5);
      boosts.set('safety', 0.4);
      // Penalize non-crisis tools
      penalties.set('entertainment', 0.3);
      penalties.set('productivity', 0.2);
    } else if (emotionalTrajectory.trend === 'improving') {
      boosts.set('habits', 0.1);
      boosts.set('life-planning', 0.1);
    }

    // Domain transition handling
    if (domainTransition.transitionType === 'deepening') {
      // Boost current domains when deepening
      for (const domain of domainTransition.currentDomains) {
        boosts.set(domain, (boosts.get(domain) || 0) + 0.15);
      }
    } else if (domainTransition.transitionType === 'switching') {
      // Slight penalty for old domains when switching
      for (const domain of domainTransition.previousDomains) {
        penalties.set(domain, (penalties.get(domain) || 0) + 0.1);
      }
    }

    // Conversation tone adjustments
    if (conversationTone.overall === 'urgent') {
      boosts.set('calendar', 0.15);
      boosts.set('communication', 0.15);
      // Penalize slow/reflective tools
      penalties.set('wisdom', 0.1);
      penalties.set('meaning', 0.1);
    } else if (conversationTone.overall === 'emotional') {
      boosts.set('self-compassion', 0.2);
      boosts.set('wellness', 0.15);
      boosts.set('relationships', 0.1);
    } else if (conversationTone.overall === 'transactional') {
      boosts.set('calendar', 0.1);
      boosts.set('productivity', 0.1);
      boosts.set('information', 0.1);
    }

    // Frustration adjustment
    if (conversationTone.frustrationLevel > 0.5) {
      boosts.set('self-compassion', 0.1);
      // Prioritize quick, actionable tools
      boosts.set('communication', 0.1);
    }

    return { boosts, penalties };
  }

  /**
   * Get the full turn history for debugging.
   */
  getHistory(): ConversationTurnContext[] {
    return [...this.turnHistory];
  }

  /**
   * Clear the conversation history (e.g., on session end).
   */
  clear(): void {
    this.turnHistory = [];
  }
}

// ============================================================================
// SINGLETON TRACKER MAP
// ============================================================================

const trackersBySession = new Map<string, ConversationContextTracker>();

/**
 * Get or create a context tracker for a session.
 */
export function getContextTracker(sessionId: string): ConversationContextTracker {
  let tracker = trackersBySession.get(sessionId);
  if (!tracker) {
    tracker = new ConversationContextTracker();
    trackersBySession.set(sessionId, tracker);
  }
  return tracker;
}

/**
 * Clean up tracker for a session.
 */
export function cleanupContextTracker(sessionId: string): void {
  const tracker = trackersBySession.get(sessionId);
  if (tracker) {
    tracker.clear();
    trackersBySession.delete(sessionId);
  }
}

/**
 * Process a turn and get enriched context.
 * Convenience function that handles tracker lookup.
 */
export function processUserTurn(sessionId: string, text: string): EnrichedContext {
  const tracker = getContextTracker(sessionId);
  return tracker.processTurn(text);
}
