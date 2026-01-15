/**
 * Proactive Memory Surfacing
 *
 * The crown jewel of "Better Than Human" memory. This service decides:
 * - WHEN to surface a memory (timing intelligence)
 * - WHAT to surface (relevance scoring with learning)
 * - HOW to phrase it (natural reference generation)
 * - WHETHER it landed well (feedback loop)
 *
 * Philosophy: A truly great friend doesn't just remember - they know
 * WHEN to bring something up, and HOW to say it so it lands.
 *
 * @module services/proactive-memory-surfacing
 */

import type { ExplainedMemory, MemoryItem, ReferenceStyle } from '../../memory/interfaces/index.js';
import { getLearningEngine } from '../../memory/learning-engine.js';
import { getMemoryGraph } from '../../memory/memory-graph.js';
import { getNaturalReferenceGenerator } from '../../memory/natural-reference-generator.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getUnifiedMemoryService,
  type EnhancedRecallResult,
  type SimpleRecallContext,
} from './unified-service.js';

const log = createLogger({ module: 'ProactiveMemorySurfacing' });

// ============================================================================
// TYPES
// ============================================================================

export interface SurfacingContext {
  userId: string;
  currentInput: string;
  currentEmotion?: string;
  currentTopic?: string;
  personaId: string;
  turnNumber: number;
  sessionId: string;
  recentTopics?: string[];
  personMentioned?: string;
}

export interface SurfacingDecision {
  shouldSurface: boolean;
  reason: string;
  confidence: number;

  // If shouldSurface is true:
  memory?: ExplainedMemory;
  phrasing?: string;
  style?: ReferenceStyle['style'];

  // Metadata for learning
  decisionFactors: {
    timingScore: number;
    relevanceScore: number;
    emotionalFit: number;
    learningModifier: number;
  };
}

export interface SurfacingResult {
  decision: SurfacingDecision;
  surfacingId?: string; // For feedback tracking
  relatedMemoryIds?: string[]; // From graph traversal
}

export interface SurfacingFeedback {
  surfacingId: string;
  reaction: 'engaged' | 'grateful' | 'neutral' | 'negative';
  userResponse?: string;
  followedUp?: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface SurfacingConfig {
  /** Minimum turns before proactive surfacing (default: 3) */
  minTurnsBeforeSurfacing: number;
  /** Maximum surfaces per session (default: 5) */
  maxSurfacesPerSession: number;
  /** Minimum confidence to surface (default: 0.6) */
  minConfidence: number;
  /** Cooldown between surfaces in turns (default: 4) */
  cooldownTurns: number;
  /** Weight for timing score (default: 0.3) */
  timingWeight: number;
  /** Weight for relevance score (default: 0.4) */
  relevanceWeight: number;
  /** Weight for emotional fit (default: 0.2) */
  emotionalWeight: number;
  /** Weight for learning modifier (default: 0.1) */
  learningWeight: number;
}

const DEFAULT_CONFIG: SurfacingConfig = {
  minTurnsBeforeSurfacing: 3,
  maxSurfacesPerSession: 5,
  cooldownTurns: 4,
  minConfidence: 0.6,
  timingWeight: 0.3,
  relevanceWeight: 0.4,
  emotionalWeight: 0.2,
  learningWeight: 0.1,
};

// ============================================================================
// SESSION STATE
// ============================================================================

interface SessionState {
  surfaceCount: number;
  lastSurfaceTurn: number;
  surfacedMemoryIds: Set<string>;
  pendingSurfacings: Map<string, { memoryId: string; timestamp: number }>;
}

const sessionStates = new Map<string, SessionState>();

function getSessionState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      surfaceCount: 0,
      lastSurfaceTurn: -100,
      surfacedMemoryIds: new Set(),
      pendingSurfacings: new Map(),
    });
  }
  return sessionStates.get(sessionId)!;
}

// ============================================================================
// PROACTIVE SURFACING SERVICE
// ============================================================================

export class ProactiveMemorySurfacingService {
  private config: SurfacingConfig;
  private referenceGenerator = getNaturalReferenceGenerator();
  private memoryGraph = getMemoryGraph();
  private learningEngine = getLearningEngine();

  constructor(config?: Partial<SurfacingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Decide whether and how to surface a memory
   * This is the main entry point - call on each turn
   */
  async decideSurfacing(context: SurfacingContext): Promise<SurfacingResult> {
    const sessionState = getSessionState(context.sessionId);

    // Early exits
    if (!this.shouldAttemptSurfacing(context, sessionState)) {
      return {
        decision: {
          shouldSurface: false,
          reason: 'Conditions not met for surfacing',
          confidence: 0,
          decisionFactors: {
            timingScore: 0,
            relevanceScore: 0,
            emotionalFit: 0,
            learningModifier: 0,
          },
        },
      };
    }

    try {
      // Build SimpleRecallContext for unified memory service
      const recallContext: SimpleRecallContext = {
        userId: context.userId,
        currentInput: context.currentInput,
        currentEmotion: context.currentEmotion,
        currentTopic: context.currentTopic,
        turnNumber: context.turnNumber,
        sessionId: context.sessionId,
        personaId: context.personaId,
      };

      // 1. Get relevant memories from unified memory service
      const unifiedMemory = getUnifiedMemoryService();
      const recallResult = await unifiedMemory.simpleRecall(recallContext);

      // No memories or timing says no
      if (!recallResult.primaryMemories.length || !recallResult.timing.shouldSurface) {
        return {
          decision: {
            shouldSurface: false,
            reason: 'No relevant memories or timing not right',
            confidence: 0,
            decisionFactors: {
              timingScore: recallResult.timing.shouldSurface ? 0.5 : 0,
              relevanceScore: recallResult.primaryMemories.length > 0 ? 0.5 : 0,
              emotionalFit: 0.5,
              learningModifier: 1,
            },
          },
        };
      }

      // 2. Score and select best memory
      const bestMemory = await this.selectBestMemory(context, recallResult.primaryMemories);

      if (!bestMemory) {
        return {
          decision: {
            shouldSurface: false,
            reason: 'No memory passed confidence threshold',
            confidence: 0,
            decisionFactors: {
              timingScore: 0.5,
              relevanceScore: 0,
              emotionalFit: 0.5,
              learningModifier: 1,
            },
          },
        };
      }

      // 3. Get related memories via graph
      const relatedMemoryIds = await this.getRelatedMemoryIds(context.userId, bestMemory.item.id);

      // 4. Generate natural phrasing
      const style = this.selectStyle(context, bestMemory.item);
      const phrasing = this.generatePhrasing(bestMemory, style, context);

      // 5. Calculate final confidence
      const factors = this.calculateFactors(context, bestMemory, recallResult);
      const confidence = this.calculateConfidence(factors);

      // 6. Make decision
      if (confidence < this.config.minConfidence) {
        return {
          decision: {
            shouldSurface: false,
            reason: `Confidence ${confidence.toFixed(2)} below threshold ${this.config.minConfidence}`,
            confidence,
            decisionFactors: factors,
          },
        };
      }

      // 7. Record surfacing for feedback tracking
      const surfacingId = this.recordPendingSurfacing(context, bestMemory.item.id, sessionState);

      // Update session state
      sessionState.surfaceCount++;
      sessionState.lastSurfaceTurn = context.turnNumber;
      sessionState.surfacedMemoryIds.add(bestMemory.item.id);

      log.info(
        {
          userId: context.userId,
          memoryId: bestMemory.item.id,
          confidence,
          style,
          surfacingId,
        },
        '🎯 Memory surfacing decision: YES'
      );

      return {
        decision: {
          shouldSurface: true,
          reason: 'Memory relevant and timing appropriate',
          confidence,
          memory: bestMemory,
          phrasing,
          style,
          decisionFactors: factors,
        },
        surfacingId,
        relatedMemoryIds,
      };
    } catch (error) {
      log.error({ error: String(error), userId: context.userId }, 'Surfacing decision failed');
      return {
        decision: {
          shouldSurface: false,
          reason: 'Error during surfacing decision',
          confidence: 0,
          decisionFactors: {
            timingScore: 0,
            relevanceScore: 0,
            emotionalFit: 0,
            learningModifier: 0,
          },
        },
      };
    }
  }

  /**
   * Record feedback on a surfacing
   */
  async recordFeedback(feedback: SurfacingFeedback): Promise<void> {
    // Find the pending surfacing
    for (const [, state] of sessionStates) {
      const pending = state.pendingSurfacings.get(feedback.surfacingId);
      if (pending) {
        // Map feedback reaction to learning engine MemoryReaction
        const reactionMap: Record<
          string,
          'engaged' | 'acknowledged' | 'ignored' | 'negative' | 'grateful'
        > = {
          engaged: 'engaged',
          grateful: 'grateful',
          neutral: 'acknowledged',
          negative: 'negative',
        };

        // Record reaction with learning engine
        await this.learningEngine.recordReaction(
          feedback.surfacingId,
          reactionMap[feedback.reaction]
        );

        // Reinforce memory if positive
        if (feedback.reaction === 'engaged' || feedback.reaction === 'grateful') {
          const userId = feedback.surfacingId.split('_')[1]; // Extract userId from surfacingId
          if (userId) {
            const unifiedMemory = getUnifiedMemoryService();
            await unifiedMemory.reinforceMemory(
              userId,
              pending.memoryId,
              feedback.reaction === 'grateful' ? 1.5 : 1.2
            );
          }
        }

        // Clean up
        state.pendingSurfacings.delete(feedback.surfacingId);

        log.debug(
          { surfacingId: feedback.surfacingId, reaction: feedback.reaction },
          'Surfacing feedback recorded'
        );
        return;
      }
    }

    log.warn({ surfacingId: feedback.surfacingId }, 'Surfacing not found for feedback');
  }

  /**
   * Generate context injection for LLM
   * Call this to get the formatted injection for the prompt
   */
  generateContextInjection(result: SurfacingResult): string | null {
    if (!result.decision.shouldSurface || !result.decision.memory) {
      return null;
    }

    const { memory, phrasing, style } = result.decision;

    return `[PROACTIVE MEMORY - Reference naturally in ${style || 'warm'} tone]
Memory: ${memory.item.content}
Suggested phrasing: "${phrasing}"
Why relevant: ${memory.naturalExplanation || 'Connected to current topic'}

Remember: Don't read this verbatim. Use it as inspiration for a natural callback.`;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private shouldAttemptSurfacing(context: SurfacingContext, state: SessionState): boolean {
    // Too early
    if (context.turnNumber < this.config.minTurnsBeforeSurfacing) {
      return false;
    }

    // Too many surfaces this session
    if (state.surfaceCount >= this.config.maxSurfacesPerSession) {
      return false;
    }

    // Cooldown not elapsed
    if (context.turnNumber - state.lastSurfaceTurn < this.config.cooldownTurns) {
      return false;
    }

    return true;
  }

  private async selectBestMemory(
    context: SurfacingContext,
    memories: ExplainedMemory[]
  ): Promise<ExplainedMemory | null> {
    // Get user learnings for personalized scoring
    const learnings = await this.learningEngine.getThresholds(context.userId);
    const sessionState = getSessionState(context.sessionId);

    let bestMemory: ExplainedMemory | null = null;
    let bestScore = 0;

    for (const explained of memories) {
      // Skip already surfaced this session
      if (sessionState.surfacedMemoryIds.has(explained.item.id)) {
        continue;
      }

      // Calculate personalized score
      const baseScore =
        explained.connectionStrength === 'strong'
          ? 0.9
          : explained.connectionStrength === 'moderate'
            ? 0.6
            : 0.3;

      // Apply learning modifier
      const learningModifier = learnings.minConfidence > 0.5 ? 1.2 : 1;
      const finalScore = baseScore * learningModifier;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMemory = explained;
      }
    }

    return bestScore > 0.3 ? bestMemory : null;
  }

  private async getRelatedMemoryIds(userId: string, memoryId: string): Promise<string[]> {
    try {
      const allLinks = await this.memoryGraph.getLinks(userId);
      // Filter links that originate from or target this memory
      const relevantLinks = allLinks.filter(
        (l) => l.sourceMemoryId === memoryId || l.targetMemoryId === memoryId
      );
      return relevantLinks
        .filter((l) => l.strength > 0.3)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 3)
        .map((l) => (l.sourceMemoryId === memoryId ? l.targetMemoryId : l.sourceMemoryId));
    } catch {
      return [];
    }
  }

  private selectStyle(context: SurfacingContext, memory: MemoryItem): ReferenceStyle['style'] {
    // Select style based on context
    const emotion = context.currentEmotion?.toLowerCase();

    if (emotion?.includes('sad') || emotion?.includes('grief') || emotion?.includes('anxious')) {
      return 'gentle';
    }

    if (emotion?.includes('happy') || emotion?.includes('excited')) {
      return 'playful';
    }

    if (memory.emotionalWeight > 0.7) {
      return 'warm';
    }

    if (context.turnNumber > 10) {
      return 'reflective';
    }

    // Default based on turn progression
    const styles: Array<ReferenceStyle['style']> = ['casual', 'warm', 'curious', 'gentle'];
    return styles[context.turnNumber % styles.length];
  }

  private generatePhrasing(
    memory: ExplainedMemory,
    style: ReferenceStyle['style'],
    context: SurfacingContext
  ): string {
    // Build a RetrievedMemory-compatible object for the reference generator
    const retrieved = {
      item: memory.item,
      score: memory.connectionStrength === 'strong' ? 0.9 : 0.6,
      scoreBreakdown: { semantic: 0.5, temporal: 0.3, emotional: 0.4, contextual: 0.3 },
      reason: memory.naturalExplanation,
    };

    const reference = this.referenceGenerator.generate(retrieved, {
      userMood: context.currentEmotion || 'neutral',
      relationshipStage: 'developing',
      personaId: context.personaId,
      conversationTone: 'warm',
    });

    return reference.reference;
  }

  private calculateFactors(
    context: SurfacingContext,
    memory: ExplainedMemory,
    recallResult: EnhancedRecallResult
  ): SurfacingDecision['decisionFactors'] {
    // Timing score - based on timing engine decision
    const timingScore = recallResult.timing.shouldSurface ? 0.8 : 0.3;

    // Relevance score - from retrieval
    const relevanceScore =
      memory.connectionStrength === 'strong'
        ? 0.9
        : memory.connectionStrength === 'moderate'
          ? 0.6
          : 0.3;

    // Emotional fit - match current emotion with memory emotional weight
    const emotionalFit = this.calculateEmotionalFit(
      context.currentEmotion,
      memory.item.emotionalWeight
    );

    // Learning modifier - from user's historical receptivity
    const learningModifier = 1;

    return { timingScore, relevanceScore, emotionalFit, learningModifier };
  }

  private calculateEmotionalFit(currentEmotion: string | undefined, memoryWeight: number): number {
    if (!currentEmotion) return 0.5;

    const emotion = currentEmotion.toLowerCase();
    const isVulnerable =
      emotion.includes('sad') || emotion.includes('anxious') || emotion.includes('grief');

    // For vulnerable states, prefer lower weight memories (gentler)
    if (isVulnerable) {
      return memoryWeight < 0.5 ? 0.8 : 0.4;
    }

    // For positive states, any memory weight is fine
    if (emotion.includes('happy') || emotion.includes('excited')) {
      return 0.7;
    }

    return 0.5;
  }

  private calculateConfidence(factors: SurfacingDecision['decisionFactors']): number {
    return (
      factors.timingScore * this.config.timingWeight +
      factors.relevanceScore * this.config.relevanceWeight +
      factors.emotionalFit * this.config.emotionalWeight +
      factors.learningModifier * this.config.learningWeight
    );
  }

  private recordPendingSurfacing(
    context: SurfacingContext,
    memoryId: string,
    state: SessionState
  ): string {
    const surfacingId = `surf_${context.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    state.pendingSurfacings.set(surfacingId, {
      memoryId,
      timestamp: Date.now(),
    });
    return surfacingId;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ProactiveMemorySurfacingService | null = null;

export function getProactiveMemorySurfacing(): ProactiveMemorySurfacingService {
  if (!instance) {
    instance = new ProactiveMemorySurfacingService();
  }
  return instance;
}

export function resetProactiveMemorySurfacing(): void {
  instance = null;
  sessionStates.clear();
}

/**
 * Reset proactive surfacing state for a specific session
 * Called at session end (P0 Integration)
 */
export function resetProactiveSession(sessionId: string): void {
  sessionStates.delete(sessionId);
  log.debug({ sessionId }, 'Proactive surfacing session reset');
}

// ============================================================================
// CONTEXT BUILDER INTEGRATION
// ============================================================================

/**
 * Build proactive memory context for LLM injection
 * This can be called from context builders
 */
export async function buildProactiveMemoryContext(
  context: SurfacingContext
): Promise<string | null> {
  const surfacing = getProactiveMemorySurfacing();
  const result = await surfacing.decideSurfacing(context);
  return surfacing.generateContextInjection(result);
}

export default {
  getProactiveMemorySurfacing,
  resetProactiveMemorySurfacing,
  resetProactiveSession,
  buildProactiveMemoryContext,
};
