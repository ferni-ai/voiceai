/**
 * Timing Engine
 *
 * Decides WHEN to surface memories during conversation.
 * Combines rule-based timing with learned receptivity patterns.
 *
 * @module intelligence/memory-intelligence/timing/timing-engine
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  TimingDecision,
  TimingRuleContext,
  TurnContext,
  UserState,
  SurfacingTrigger,
  PhrasingStyle,
  BlockingCondition,
  UserMemoryProfile,
} from '../types.js';
import type { StoredMemory } from '../../../memory/unified-store/types.js';
import { evaluateTimingRules, ruleNameToSurfacingTrigger, ruleNameToBlockingCondition } from './timing-rules.js';
import { ReceptivityScorer, getReceptivityScorer } from './receptivity-scorer.js';

const log = createLogger({ module: 'TimingEngine' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface TimingEngineConfig {
  /** Minimum receptivity score to consider surfacing (0-1) */
  minReceptivityScore: number;

  /** Minimum confidence to proceed with surfacing (0-1) */
  minConfidence: number;

  /** Weight for rule-based decision vs receptivity score */
  ruleWeight: number;

  /** Weight for receptivity score */
  receptivityWeight: number;

  /** Enable impact prediction */
  enableImpactPrediction: boolean;
}

const DEFAULT_CONFIG: TimingEngineConfig = {
  minReceptivityScore: 0.4,
  minConfidence: 0.5,
  ruleWeight: 0.6,
  receptivityWeight: 0.4,
  enableImpactPrediction: true,
};

// ============================================================================
// TIMING ENGINE
// ============================================================================

/**
 * Timing Engine
 *
 * Main orchestrator for timing decisions.
 */
export class TimingEngine {
  private config: TimingEngineConfig;
  private receptivityScorer: ReceptivityScorer;
  private initialized = false;

  constructor(config: Partial<TimingEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.receptivityScorer = getReceptivityScorer();
  }

  async initialize(): Promise<void> {
    await this.receptivityScorer.initialize();
    this.initialized = true;
    log.debug('TimingEngine initialized');
  }

  /**
   * Decide whether to surface a specific memory
   */
  async shouldSurface(
    memory: StoredMemory,
    turnContext: TurnContext,
    userState: UserState,
    userProfile?: UserMemoryProfile
  ): Promise<TimingDecision> {
    const startTime = Date.now();

    try {
      // 1. Build timing rule context
      const ruleContext = this.buildRuleContext(memory, turnContext, userState, userProfile);

      // 2. Evaluate timing rules
      const ruleEvaluation = evaluateTimingRules(ruleContext);

      // 3. If blocked by rules, return immediately
      if (!ruleEvaluation.shouldSurface && ruleEvaluation.blockingRulesFired.length > 0) {
        return {
          shouldSurface: false,
          confidence: ruleEvaluation.confidence,
          reason: ruleEvaluation.primaryReason,
          blockingConditions: ruleEvaluation.blockingRulesFired.map(
            (name) => ruleNameToBlockingCondition(name) || (name as BlockingCondition)
          ),
          priority: 'hold',
        };
      }

      // 4. Score receptivity
      const receptivityScore = await this.receptivityScorer.score({
        userState,
        emotionalState: turnContext.emotionalState,
        conversationContext: turnContext.conversationContext,
        userProfile,
        memoryRelevance: this.calculateRelevance(memory, turnContext),
        memoryEmotionalWeight: memory.emotionalWeight,
      });

      // 5. Check receptivity threshold
      if (receptivityScore.score < this.config.minReceptivityScore) {
        return {
          shouldSurface: false,
          confidence: receptivityScore.confidence,
          reason: `Receptivity too low: ${receptivityScore.score.toFixed(2)}. Reducers: ${receptivityScore.reducers.join(', ')}`,
          priority: 'hold',
        };
      }

      // 6. Combine rule decision and receptivity
      const combinedScore =
        (ruleEvaluation.shouldSurface ? 1 : 0) * this.config.ruleWeight +
        receptivityScore.score * this.config.receptivityWeight;

      const shouldSurface = combinedScore > 0.5 && ruleEvaluation.triggeringRulesFired.length > 0;

      // 7. Determine trigger type and priority
      const primaryTrigger = ruleEvaluation.triggeringRulesFired[0];
      const triggerType = primaryTrigger
        ? ruleNameToSurfacingTrigger(primaryTrigger.name) || 'topic_connection'
        : undefined;

      const priority = this.determinePriority(
        primaryTrigger?.priority || 'low',
        receptivityScore.score,
        memory.importance
      );

      // 8. Recommend phrasing style
      const recommendedStyle = this.recommendPhrasingStyle(
        memory,
        turnContext,
        triggerType
      );

      const duration = Date.now() - startTime;
      log.debug({ 
        shouldSurface, 
        confidence: receptivityScore.confidence,
        triggerType,
        duration 
      }, 'Timing decision made');

      return {
        shouldSurface,
        confidence: receptivityScore.confidence,
        reason: shouldSurface
          ? `Triggered: ${primaryTrigger?.name || 'relevance'}. Receptivity: ${receptivityScore.score.toFixed(2)}`
          : `No strong trigger. Best: ${primaryTrigger?.name || 'none'}`,
        triggerType,
        priority,
        recommendedStyle,
      };
    } catch (error) {
      log.error({ error: String(error) }, 'Error in timing decision');
      return {
        shouldSurface: false,
        confidence: 0,
        reason: 'Error evaluating timing',
        priority: 'hold',
      };
    }
  }

  /**
   * Build the rule context from available information
   */
  private buildRuleContext(
    memory: StoredMemory,
    turnContext: TurnContext,
    userState: UserState,
    userProfile?: UserMemoryProfile
  ): TimingRuleContext {
    // Calculate topic relevance
    const topicRelevance = this.calculateRelevance(memory, turnContext);

    // Calculate emotional similarity
    const emotionalSimilarity = this.calculateEmotionalSimilarity(
      memory.emotionalWeight,
      turnContext.emotionalState.intensity
    );

    // Check for person match
    const personMentioned =
      turnContext.peopleMentioned?.some((p) =>
        memory.peopleMentioned.some((mp) =>
          mp.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(mp.toLowerCase())
        )
      ) || false;

    // Check for deflected topics
    const hasDeflectedTopic =
      userProfile?.responsePatterns.topicsDeflected.some((t) =>
        memory.topics.some((mt) => mt.toLowerCase().includes(t.toLowerCase()))
      ) || false;

    // Calculate topic sensitivity (0-1)
    const topicSensitivity =
      userProfile?.sensitiveTopics.has(memory.topics[0]?.toLowerCase() || '') ? 1.0 : memory.emotionalWeight;

    return {
      // Turn context
      turnCount: turnContext.turnCount,
      crisisDetected: turnContext.crisisDetected || false,
      turnsSinceLastMemory: turnContext.conversationContext.turnsSinceLastMemory,

      // Emotional state
      emotionalIntensity: turnContext.emotionalState.intensity,
      emotionalValence: turnContext.emotionalState.valence,
      isVulnerable: turnContext.emotionalState.isVulnerable,

      // User state
      userEnergy: userState.energy,
      cognitiveLoad: userState.cognitiveLoad,
      timeOfDay: userState.timeOfDay,
      isRushed: userState.isRushed,

      // Memory-specific
      topicRelevance,
      emotionalSimilarity,
      hasOutstandingCommitment: memory.isActiveCommitment,
      daysSinceCommitment: memory.isActiveCommitment
        ? Math.floor((Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : undefined,
      personMentioned,
      hasPersonHistory: personMentioned && memory.peopleMentioned.length > 0,

      // Trust
      trustLevel: turnContext.conversationContext.trustLevel,

      // User history
      hasDeflectedTopic,
      topicSensitivity,
    };
  }

  /**
   * Calculate relevance of memory to current context
   */
  private calculateRelevance(memory: StoredMemory, turnContext: TurnContext): number {
    let relevance = 0;

    // Topic match
    const currentTopics = turnContext.detectedTopics || [];
    const memoryTopics = memory.topics;

    const topicMatches = currentTopics.filter((ct) =>
      memoryTopics.some((mt) =>
        ct.toLowerCase().includes(mt.toLowerCase()) || mt.toLowerCase().includes(ct.toLowerCase())
      )
    ).length;

    if (topicMatches > 0) {
      relevance += Math.min(0.5, topicMatches * 0.2);
    }

    // Person match
    const peopleMentioned = turnContext.peopleMentioned || [];
    const personMatches = peopleMentioned.filter((p) =>
      memory.peopleMentioned.some((mp) =>
        p.toLowerCase().includes(mp.toLowerCase()) || mp.toLowerCase().includes(p.toLowerCase())
      )
    ).length;

    if (personMatches > 0) {
      relevance += 0.3;
    }

    // Keyword match in user text
    const userTextLower = turnContext.userText.toLowerCase();
    const contentWords = memory.content.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const keywordMatches = contentWords.filter((w) => userTextLower.includes(w)).length;

    if (keywordMatches > 0) {
      relevance += Math.min(0.2, keywordMatches * 0.05);
    }

    return Math.min(1.0, relevance);
  }

  /**
   * Calculate emotional similarity
   */
  private calculateEmotionalSimilarity(memoryWeight: number, currentIntensity: number): number {
    // Both high emotional = similar
    if (memoryWeight > 0.6 && currentIntensity > 0.5) {
      return 0.8;
    }
    // Both moderate
    if (memoryWeight > 0.3 && memoryWeight < 0.7 && currentIntensity > 0.3 && currentIntensity < 0.7) {
      return 0.6;
    }
    // Both low
    if (memoryWeight < 0.3 && currentIntensity < 0.3) {
      return 0.5;
    }
    // Mismatch
    return Math.max(0, 1 - Math.abs(memoryWeight - currentIntensity));
  }

  /**
   * Determine priority for surfacing
   */
  private determinePriority(
    rulePriority: 'high' | 'medium' | 'low',
    receptivity: number,
    importance: number
  ): 'immediate' | 'soon' | 'when_natural' | 'hold' {
    if (rulePriority === 'high' && receptivity > 0.7) {
      return 'immediate';
    }
    if (rulePriority === 'high' || (rulePriority === 'medium' && receptivity > 0.6)) {
      return 'soon';
    }
    if (rulePriority === 'medium' || (rulePriority === 'low' && importance > 0.7)) {
      return 'when_natural';
    }
    return 'hold';
  }

  /**
   * Recommend phrasing style based on context
   */
  private recommendPhrasingStyle(
    memory: StoredMemory,
    turnContext: TurnContext,
    triggerType?: SurfacingTrigger
  ): PhrasingStyle {
    // Crisis or high emotion - be gentle
    if (turnContext.crisisDetected || turnContext.emotionalState.intensity > 0.7) {
      return 'supportive_reference';
    }

    // Commitment follow-up
    if (triggerType === 'commitment_followup') {
      return 'gentle_callback';
    }

    // Positive emotion - can be celebratory
    if (turnContext.emotionalState.valence > 0.5 && memory.emotionalWeight < 0.5) {
      return 'celebratory';
    }

    // Deep trust - can be more direct
    if (turnContext.conversationContext.trustLevel === 'deep') {
      return 'warm_recall';
    }

    // Person-related
    if (triggerType === 'person_mentioned') {
      return 'curious_connection';
    }

    // Default
    return 'warm_recall';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engineInstance: TimingEngine | null = null;

export function getTimingEngine(config?: Partial<TimingEngineConfig>): TimingEngine {
  if (!engineInstance) {
    engineInstance = new TimingEngine(config);
  }
  return engineInstance;
}

export function resetTimingEngine(): void {
  engineInstance = null;
}
