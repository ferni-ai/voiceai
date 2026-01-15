/**
 * Unified Memory Service
 *
 * THE SINGLE ENTRY POINT for all memory operations in Ferni.
 *
 * This service wraps the MemoryOrchestrator and provides:
 * - Consistent API for tools, context builders, and agents
 * - Timing intelligence (when to surface memories)
 * - Learning from user reactions (what works, what doesn't)
 * - Memory lifecycle (consolidation, decay, reinforcement)
 * - Graph storage for associative memory
 *
 * Philosophy: No component should access memory storage directly.
 * Everything flows through this service, which ensures:
 * 1. Consistent context enrichment
 * 2. Proper timing decisions
 * 3. Learning from interactions
 * 4. Memory consolidation and decay
 * 5. Graph-based associative recall
 * 6. Unified telemetry
 *
 * @module services/unified-memory-service
 */

import {
  getMemoryOrchestrator,
  type MemoryOrchestrator,
  type OrchestratedMemory,
  type RecallContext,
} from '../memory/index.js';
import {
  getLearningEngine,
  type LearningEngine,
  type SurfacingEvent,
} from '../../memory/learning-engine.js';
import {
  createLinksForNewMemory,
  getUserMemories,
  reinforceMemory as reinforceMemoryInStorage,
  runLifecycleMaintenance,
  saveMemory,
} from '../../memory/lifecycle-integration.js';
import {
  getMemoryConsolidator,
  type ConsolidationResult,
  type MemoryConsolidator,
} from '../../memory/memory-consolidator.js';
import { getMemoryDecayManager, type MemoryDecayManager } from '../../memory/memory-decay.js';
import {
  getMemoryGraph,
  type MemoryGraph,
  type MemoryLink,
  type SpreadingActivationResult,
} from '../../memory/memory-graph.js';
import { getProtectionEngine } from '../../memory/protection-engine.js';
import { ragLookup, semanticSearch } from '../../memory/semantic-rag.js';
// Spreading activation for associative memory recall
import { getSpreadingActivation } from '../../memory/spreading-activation.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'unified-memory-service' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Timing decision for memory surfacing
 */
export interface TimingDecision {
  shouldSurface: boolean;
  reason: 'emotional_state' | 'conversation_flow' | 'low_confidence' | 'cooldown' | 'always';
  confidence: number;
  delay?: 'immediate' | 'next_pause' | 'session_end';
}

/**
 * Phrasing suggestion for natural memory integration
 */
export interface PhrasingSuggestion {
  style: 'callback' | 'anticipatory' | 'natural_weave' | 'direct';
  template?: string;
  personaVoice: boolean;
}

/**
 * Feedback for learning what works
 */
export interface MemoryFeedback {
  memoryId: string;
  userId: string;
  action: 'surfaced' | 'ignored' | 'dismissed' | 'engaged';
  context: {
    emotionalState?: string;
    conversationPhase?: string;
    personaId?: string;
  };
  timestamp: Date;
}

/**
 * Associated memory from spreading activation
 */
export interface AssociatedMemory {
  memoryId: string;
  content: string;
  activation: number; // 0-1, strength of association
  distance: number; // Hops from primary memory
  reason: string; // Why this was activated
  linkTypes: string[]; // Types of links traversed
}

/**
 * Enhanced recall result with timing, phrasing, and associative memories
 */
export interface EnhancedRecallResult extends OrchestratedMemory {
  timing: TimingDecision;
  phrasing: PhrasingSuggestion;
  /** Associated memories from spreading activation (Better Than Human) */
  associatedMemories: AssociatedMemory[];
}

/**
 * Simple search options for tools
 */
export interface ToolSearchOptions {
  query: string;
  userId?: string;
  limit?: number;
  minScore?: number;
}

/**
 * Simplified RecallContext for service API
 * This is a convenience wrapper - internally converts to full RecallContext from memory module
 */
export interface SimpleRecallContext {
  userId: string;
  currentInput: string;
  currentEmotion?: string;
  currentTopic?: string;
  turnNumber?: number;
  sessionId?: string;
  personaId?: string;
  conversationTurn?: number;
}

// Re-export RecallContext type for convenience
export type { RecallContext } from '../memory/index.js';

/**
 * Simple memory write for tools
 */
export interface MemoryWriteInput {
  userId: string;
  content: string;
  type: 'fact' | 'preference' | 'event' | 'emotion' | 'commitment' | 'milestone';
  importance: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TIMING ENGINE (MVP)
// ============================================================================

/**
 * MVP Timing Engine - decides IF and WHEN to surface memories
 *
 * This is the genuinely new component our audit identified as missing.
 * It prevents awkward, mechanical memory surfacing.
 */
class TimingEngine {
  private surfacingHistory = new Map<string, Date[]>(); // userId -> timestamps
  private cooldownMs = 60_000; // 1 minute between surfaces
  private maxSurfacesPerSession = 3;

  /**
   * Decide if now is a good time to surface this memory
   */
  decide(
    userId: string,
    context: {
      emotionalState?: string;
      conversationPhase?: 'opening' | 'exploring' | 'deep' | 'closing';
      turnCount: number;
      memoryStrength: number;
    }
  ): TimingDecision {
    const { emotionalState, conversationPhase, turnCount, memoryStrength } = context;

    // Check cooldown
    const history = this.surfacingHistory.get(userId) || [];
    const recentSurfaces = history.filter((t) => Date.now() - t.getTime() < this.cooldownMs);

    if (recentSurfaces.length >= this.maxSurfacesPerSession) {
      return {
        shouldSurface: false,
        reason: 'cooldown',
        confidence: 0.9,
        delay: 'session_end',
      };
    }

    // Don't surface on very first turns (let conversation breathe)
    if (turnCount < 2) {
      return {
        shouldSurface: false,
        reason: 'conversation_flow',
        confidence: 0.8,
        delay: 'next_pause',
      };
    }

    // High emotional states: be more careful
    const sensitiveEmotions = ['sad', 'anxious', 'angry', 'overwhelmed', 'grief'];
    if (emotionalState && sensitiveEmotions.includes(emotionalState.toLowerCase())) {
      // Only surface very relevant, strong memories
      if (memoryStrength < 0.8) {
        return {
          shouldSurface: false,
          reason: 'emotional_state',
          confidence: 0.7,
          delay: 'next_pause',
        };
      }
    }

    // During deep conversation: surface strong memories only
    if (conversationPhase === 'deep' && memoryStrength < 0.6) {
      return {
        shouldSurface: false,
        reason: 'conversation_flow',
        confidence: 0.6,
        delay: 'next_pause',
      };
    }

    // During closing: good time for callbacks
    if (conversationPhase === 'closing') {
      return {
        shouldSurface: true,
        reason: 'conversation_flow',
        confidence: 0.8,
        delay: 'immediate',
      };
    }

    // Low confidence memories: skip
    if (memoryStrength < 0.4) {
      return {
        shouldSurface: false,
        reason: 'low_confidence',
        confidence: 0.9,
      };
    }

    // Default: surface it
    return {
      shouldSurface: true,
      reason: 'always',
      confidence: memoryStrength,
      delay: 'immediate',
    };
  }

  /**
   * Record that we surfaced a memory
   */
  recordSurfacing(userId: string): void {
    const history = this.surfacingHistory.get(userId) || [];
    history.push(new Date());
    this.surfacingHistory.set(userId, history);
  }

  /**
   * Reset for new session
   */
  resetSession(userId: string): void {
    this.surfacingHistory.delete(userId);
  }
}

// ============================================================================
// PHRASING ENGINE
// ============================================================================

/**
 * Suggests how to phrase memory references naturally
 */
class PhrasingEngine {
  suggest(
    context: {
      connectionType?: string;
      emotionalState?: string;
      personaId?: string;
    },
    memory: { content: string; suggestedReference?: string }
  ): PhrasingSuggestion {
    const { connectionType, emotionalState, personaId } = context;

    // Use existing suggested reference if available
    if (memory.suggestedReference) {
      return {
        style: 'natural_weave',
        template: memory.suggestedReference,
        personaVoice: true,
      };
    }

    // Emotional echoes: gentle callbacks
    if (connectionType === 'emotional_echo') {
      return {
        style: 'callback',
        template: `That reminds me of when you mentioned...`,
        personaVoice: true,
      };
    }

    // Commitments: anticipatory
    if (connectionType === 'commitment') {
      return {
        style: 'anticipatory',
        template: `I remember you wanted to...`,
        personaVoice: true,
      };
    }

    // Default: natural weave
    return {
      style: 'natural_weave',
      personaVoice: true,
    };
  }
}

// ============================================================================
// FEEDBACK COLLECTOR
// ============================================================================

/**
 * Collects feedback on memory surfacing for learning
 */
class FeedbackCollector {
  private feedback: MemoryFeedback[] = [];
  private maxStoredFeedback = 1000;

  record(feedback: MemoryFeedback): void {
    this.feedback.push(feedback);

    // Prune old feedback
    if (this.feedback.length > this.maxStoredFeedback) {
      this.feedback = this.feedback.slice(-this.maxStoredFeedback);
    }

    log.debug(
      { userId: feedback.userId, action: feedback.action, memoryId: feedback.memoryId },
      'Memory feedback recorded'
    );
  }

  /**
   * Get feedback stats for a user
   */
  getStats(userId: string): {
    total: number;
    engaged: number;
    dismissed: number;
    engagementRate: number;
  } {
    const userFeedback = this.feedback.filter((f) => f.userId === userId);
    const engaged = userFeedback.filter((f) => f.action === 'engaged').length;
    const dismissed = userFeedback.filter((f) => f.action === 'dismissed').length;

    return {
      total: userFeedback.length,
      engaged,
      dismissed,
      engagementRate: userFeedback.length > 0 ? engaged / userFeedback.length : 0,
    };
  }
}

// ============================================================================
// UNIFIED MEMORY SERVICE
// ============================================================================

/**
 * The Unified Memory Service - single source of truth for all memory operations
 */
export class UnifiedMemoryService {
  private orchestrator: MemoryOrchestrator;
  private timingEngine: TimingEngine;
  private phrasingEngine: PhrasingEngine;
  private feedbackCollector: FeedbackCollector;

  // Phase 2 components - Learning & Lifecycle
  private learningEngine: LearningEngine;
  private consolidator: MemoryConsolidator;
  private decayManager: MemoryDecayManager;
  private memoryGraph: MemoryGraph;

  // Track pending surfacing events for learning
  private pendingSurfacingEvents = new Map<string, string>(); // memoryId -> eventId

  constructor() {
    this.orchestrator = getMemoryOrchestrator();
    this.timingEngine = new TimingEngine();
    this.phrasingEngine = new PhrasingEngine();
    this.feedbackCollector = new FeedbackCollector();

    // Phase 2 components
    this.learningEngine = getLearningEngine();
    this.consolidator = getMemoryConsolidator();
    this.decayManager = getMemoryDecayManager();
    this.memoryGraph = getMemoryGraph();

    log.info('UnifiedMemoryService initialized with Learning & Lifecycle engines');
  }

  // ==========================================================================
  // MAIN API - For Context Builders
  // ==========================================================================

  /**
   * Main recall function with timing, phrasing, and learning intelligence
   * Used by context builders for comprehensive memory retrieval
   */
  async recall(context: RecallContext): Promise<EnhancedRecallResult> {
    const startTime = Date.now();

    try {
      // Get orchestrated memory
      const memory = await this.orchestrator.recall(context);

      // Get user's learned thresholds
      const learnings = await this.learningEngine.getThresholds(context.userId);

      // Determine timing for primary memories
      const avgStrength =
        memory.primaryMemories.length > 0
          ? memory.primaryMemories.reduce(
              (sum, m) =>
                sum +
                (m.connectionStrength === 'strong'
                  ? 0.9
                  : m.connectionStrength === 'moderate'
                    ? 0.6
                    : 0.3),
              0
            ) / memory.primaryMemories.length
          : 0;

      // Use learned threshold instead of hardcoded values
      const adjustedStrength =
        avgStrength >= learnings.minConfidence ? avgStrength : avgStrength * 0.5;

      const timing = this.timingEngine.decide(context.userId, {
        emotionalState: context.currentEmotion,
        conversationPhase: this.inferPhase(context.conversationTurn || 0),
        turnCount: context.conversationTurn || 0,
        memoryStrength: adjustedStrength,
      });

      // Get phrasing suggestion for top memory
      const topMemory = memory.primaryMemories[0];
      const phrasing = topMemory
        ? this.phrasingEngine.suggest(
            {
              connectionType: topMemory.connectionType,
              emotionalState: context.currentEmotion,
              personaId: context.personaId,
            },
            {
              content: topMemory.item.content,
              suggestedReference: topMemory.suggestedReference,
            }
          )
        : { style: 'natural_weave' as const, personaVoice: true };

      // Record surfacing if we're going to surface (for learning)
      if (timing.shouldSurface && memory.primaryMemories.length > 0) {
        this.timingEngine.recordSurfacing(context.userId);

        // Record pending surfacing for each memory we're about to surface
        const conversationPhase = this.inferPhase(context.conversationTurn || 0);
        const emotionalState = this.mapEmotionalState(context.currentEmotion);

        for (const mem of memory.primaryMemories.slice(0, learnings.maxProactivePerSession)) {
          this.recordPendingSurfacing(
            context.userId,
            mem.item.id,
            mem.item.type,
            mem.item.topics ?? [],
            mem.item.emotionalWeight,
            {
              surfacingMethod: 'query_response',
              conversationPhase:
                conversationPhase === 'exploring'
                  ? 'mid'
                  : conversationPhase === 'opening'
                    ? 'opening'
                    : 'closing',
              userEmotionalState: emotionalState,
              timeSinceSessionStart: context.conversationTurn || 0,
            }
          );
        }
      }

      // SPREADING ACTIVATION: Get associated memories from graph traversal
      // This enables "Better Than Human" associative recall - thinking of one memory
      // naturally brings related memories to mind through the connection graph
      const associatedMemories = await this.safeGetAssociatedMemories(
        context.userId,
        memory.primaryMemories.slice(0, 3) // Top 3 primary memories as seeds
      );

      const duration = Date.now() - startTime;
      log.debug(
        {
          userId: context.userId,
          memoriesFound: memory.primaryMemories.length,
          associatedFound: associatedMemories.length,
          shouldSurface: timing.shouldSurface,
          learnedThreshold: learnings.minConfidence,
          duration,
        },
        'Memory recall completed with learning and spreading activation'
      );

      return {
        ...memory,
        timing,
        phrasing,
        associatedMemories,
      };
    } catch (error) {
      log.error({ error: String(error), userId: context.userId }, 'Memory recall failed');

      // Return empty result on error
      return {
        primaryMemories: [],
        callbacks: [],
        priming: null,
        emotional: {
          userState: {
            recentEmotions: [],
            unresolvedConcerns: [],
            celebratableWins: [],
            emotionalTrend: 'unknown',
          },
          bondState: {
            warmth: 0,
            trust: 0,
            protectiveness: 0,
            admiration: 0,
            concern: 0,
            sessionCount: 0,
            stage: 'new',
          },
          threads: [],
          approachGuidance: null,
        },
        activePatterns: [],
        formattedContext: '',
        timing: { shouldSurface: false, reason: 'low_confidence', confidence: 0 } as TimingDecision,
        phrasing: { style: 'natural_weave', personaVoice: true },
        associatedMemories: [],
      };
    }
  }

  /**
   * Safe wrapper for getting associated memories - returns empty array on error
   */
  private async safeGetAssociatedMemories(
    userId: string,
    primaryMemories: Array<{ item: { id: string; content: string } }>
  ): Promise<AssociatedMemory[]> {
    if (primaryMemories.length === 0) {
      return [];
    }

    try {
      const result = await this.getAssociatedMemoriesFromPrimary(userId, primaryMemories);
      log.debug(
        { userId, associatedCount: result.length },
        'Spreading activation found associated memories'
      );
      return result;
    } catch (activationError) {
      log.debug(
        { error: String(activationError), userId },
        'Spreading activation failed (non-critical)'
      );
      return [];
    }
  }

  /**
   * Get associated memories via spreading activation from primary memories
   * This is "Better Than Human" - we can objectively traverse the memory graph
   * to find connections the user might not consciously recall
   */
  private async getAssociatedMemoriesFromPrimary(
    userId: string,
    primaryMemories: Array<{ item: { id: string; content: string } }>
  ): Promise<AssociatedMemory[]> {
    const spreadingEngine = getSpreadingActivation();

    // Get source memory IDs
    const sourceIds = primaryMemories.map((m) => m.item.id);

    // Spread activation from all primary memories
    const activationResults = await spreadingEngine.spreadFromMultiple(userId, sourceIds);

    // Get all user memories once to avoid repeated queries
    const allMemories = await getUserMemories(userId);
    const memoryMap = new Map(allMemories.map((m) => [m.id, m]));

    // Convert to AssociatedMemory format
    // Limit to top 5 most strongly activated memories
    const associated: AssociatedMemory[] = [];
    for (const result of activationResults.slice(0, 5)) {
      const memory = memoryMap.get(result.memoryId);
      if (memory) {
        associated.push({
          memoryId: result.memoryId,
          content: memory.content,
          activation: result.activation,
          distance: result.distance,
          reason: result.reason,
          linkTypes: result.pathTypes as string[], // LinkType[] is compatible with string[]
        });
      }
    }

    return associated;
  }

  /**
   * Simplified recall for proactive surfacing and context builders
   * This accepts a SimpleRecallContext (without requiring full UserProfile)
   */
  async simpleRecall(context: SimpleRecallContext): Promise<EnhancedRecallResult> {
    // Build a minimal RecallContext for the orchestrator
    const fullContext: RecallContext = {
      userId: context.userId,
      // Minimal profile - orchestrator will fetch if needed
      profile: {
        id: context.userId,
        name: '',
        totalConversations: 0,
      } as unknown as RecallContext['profile'],
      query: context.currentInput,
      currentTopic: context.currentTopic,
      currentEmotion: context.currentEmotion,
      personaId: context.personaId,
      conversationTurn: context.turnNumber ?? context.conversationTurn,
      isSessionStart: (context.turnNumber ?? context.conversationTurn ?? 1) === 0,
      sessionCount: 0,
    };

    return this.recall(fullContext);
  }

  // ==========================================================================
  // SIMPLE API - For Tools
  // ==========================================================================

  /**
   * Simple semantic search - used by memory tools
   * This replaces direct calls to searchKnowledge
   */
  async search(options: ToolSearchOptions): Promise<string | null> {
    const { query, userId, limit = 3, minScore = 0.4 } = options;

    try {
      if (userId) {
        // User-scoped search
        const results = await semanticSearch(query, {
          topK: limit,
          sources: ['conversation', 'memory'],
          userId,
          minScore,
        });

        if (results.length === 0) return null;

        const snippets = results.map((r) => r.content.slice(0, 200)).join(' | ');
        return snippets;
      } else {
        // General knowledge search
        return ragLookup(query);
      }
    } catch (error) {
      log.debug({ error, query }, 'Memory search failed');
      return null;
    }
  }

  /**
   * Simple memory write - used by memory tools
   * Now saves to persistent storage and auto-creates graph links!
   */
  async write(
    input: MemoryWriteInput
  ): Promise<{ success: boolean; memoryId?: string; linksCreated?: number }> {
    const { userId, content, type, importance, metadata } = input;

    try {
      const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // Map importance to strength
      const strengthMap: Record<string, number> = {
        low: 0.3,
        medium: 0.5,
        high: 0.7,
        critical: 0.9,
      };

      // Map type to MemoryItem type
      const typeMap: Record<
        string,
        'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event'
      > = {
        fact: 'summary',
        preference: 'preference',
        event: 'event',
        emotion: 'moment',
        commitment: 'commitment',
        milestone: 'event',
      };

      // Create memory item
      const memoryItem = {
        id: memoryId,
        type: typeMap[type] ?? 'topic',
        content,
        timestamp: new Date(),
        emotionalWeight: importance === 'critical' ? 0.9 : importance === 'high' ? 0.7 : 0.5,
        relevanceDecay: 0,
        baseImportance: strengthMap[importance] ?? 0.5,
        topics: metadata?.topics as string[] | undefined,
        source: { collection: 'memories', documentId: memoryId },
      };

      // Save to persistent storage
      const saved = await saveMemory(userId, memoryItem, strengthMap[importance] ?? 0.5);

      if (!saved) {
        // Fall back to orchestrator if storage fails
        await this.orchestrator.recordInteraction({
          userId,
          turns: [
            {
              role: 'assistant',
              content: `[Memory captured] ${type}: ${content}`,
              timestamp: new Date(),
            },
          ],
          sessionEmotion: 'neutral',
          personaId: 'ferni',
        });
      }

      // Auto-create graph links for the new memory
      let linksCreated = 0;
      if (importance === 'high' || importance === 'critical') {
        const links = await createLinksForNewMemory(userId, memoryItem);
        linksCreated = links.length;
      }

      // Auto-protect important memories (P0 Integration)
      let isProtected = false;
      try {
        const protectionEngine = getProtectionEngine();
        const protection = await protectionEngine.analyzeAndProtect(memoryItem, userId);
        if (protection) {
          isProtected = true;
          log.debug(
            { userId, memoryId, protectionLevel: protection.protectionLevel },
            'Memory auto-protected'
          );
        }
      } catch (protectionError) {
        log.warn({ error: String(protectionError) }, 'Protection analysis failed');
      }

      log.debug(
        { userId, type, importance, memoryId, linksCreated, isProtected },
        'Memory written'
      );

      return { success: true, memoryId, linksCreated };
    } catch (error) {
      log.error({ error: String(error), userId }, 'Memory write failed');
      return { success: false };
    }
  }

  // ==========================================================================
  // FEEDBACK API - For Learning
  // ==========================================================================

  /**
   * Record feedback on memory surfacing
   */
  recordFeedback(feedback: Omit<MemoryFeedback, 'timestamp'>): void {
    this.feedbackCollector.record({
      ...feedback,
      timestamp: new Date(),
    });
  }

  /**
   * Get engagement stats for a user
   */
  getEngagementStats(userId: string) {
    return this.feedbackCollector.getStats(userId);
  }

  // ==========================================================================
  // SESSION API - For Lifecycle
  // ==========================================================================

  /**
   * Reset session state (call at session end)
   */
  resetSession(userId: string): void {
    this.timingEngine.resetSession(userId);
    log.debug({ userId }, 'Session state reset');
  }

  /**
   * Get memory health stats
   */
  async getHealth(userId: string) {
    return this.orchestrator.getMemoryHealth(userId);
  }

  // ==========================================================================
  // LEARNING API - Tracks What Works
  // ==========================================================================

  /**
   * Record user's reaction to a surfaced memory
   * Call this when the user responds after we've surfaced a memory
   */
  async recordLearning(
    userId: string,
    memoryId: string,
    userResponse: string,
    context: {
      changedTopic?: boolean;
      expressedGratitude?: boolean;
      expressedDiscomfort?: boolean;
    } = {}
  ): Promise<void> {
    const eventId = this.pendingSurfacingEvents.get(memoryId);
    if (!eventId) {
      log.debug({ memoryId, userId }, 'No pending surfacing event for memory');
      return;
    }

    // Infer reaction from user response
    const reaction = this.learningEngine.inferReaction(
      userResponse,
      context.changedTopic ?? false,
      context.expressedGratitude ?? false,
      context.expressedDiscomfort ?? false
    );

    // Record reaction
    await this.learningEngine.recordReaction(eventId, reaction);

    // If positive, reinforce the memory
    if (reaction === 'engaged' || reaction === 'grateful') {
      await this.learningEngine.reinforceMemory(
        userId,
        memoryId,
        reaction === 'grateful' ? 1.0 : 0.7
      );
    }

    // Clean up pending event
    this.pendingSurfacingEvents.delete(memoryId);

    // Also record in feedback collector for backwards compatibility
    this.feedbackCollector.record({
      memoryId,
      userId,
      action:
        reaction === 'engaged' || reaction === 'grateful'
          ? 'engaged'
          : reaction === 'negative'
            ? 'dismissed'
            : 'ignored',
      context: {},
      timestamp: new Date(),
    });

    log.debug({ userId, memoryId, reaction }, 'Recorded learning');
  }

  /**
   * Get learned thresholds for a user
   * Use this when deciding whether to surface memories proactively
   */
  async getLearnings(userId: string) {
    return this.learningEngine.getLearningsSummary(userId);
  }

  /**
   * Score a potential memory surfacing based on user learnings
   */
  async scoreMemorySurfacing(
    userId: string,
    memoryContent: string,
    memoryType: string,
    memoryTopics: string[],
    context: {
      conversationPhase: 'opening' | 'mid' | 'closing';
      userEmotionalState: 'positive' | 'neutral' | 'negative' | 'vulnerable';
    }
  ): Promise<{
    score: number;
    recommendation: 'surface' | 'skip' | 'defer';
    factors: Record<string, number>;
  }> {
    // Map input type to valid MemoryItem types
    const typeMap: Record<
      string,
      'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event'
    > = {
      fact: 'summary',
      emotion: 'moment',
      topic: 'topic',
      commitment: 'commitment',
      preference: 'preference',
      event: 'event',
      person: 'person',
    };

    // Create a mock memory item for scoring
    const mockMemory = {
      id: 'temp',
      type: typeMap[memoryType] ?? 'topic',
      content: memoryContent,
      timestamp: new Date(),
      emotionalWeight: 0.5,
      relevanceDecay: 0,
      baseImportance: 0.5,
      topics: memoryTopics,
      source: { collection: 'temp', documentId: 'temp' },
    };

    return this.learningEngine.scoreProposedSurfacing(userId, mockMemory, context);
  }

  // ==========================================================================
  // CONSOLIDATION API - Combine Related Memories
  // ==========================================================================

  /**
   * Run memory consolidation for a user
   * This combines related memories into richer, consolidated representations
   * Should be run periodically (e.g., end of session, nightly)
   */
  async consolidateMemories(userId: string): Promise<ConsolidationResult> {
    const startTime = Date.now();

    try {
      // Get user's memories from storage
      const memories = await getUserMemories(userId);

      if (memories.length === 0) {
        return {
          consolidated: [],
          memoriesProcessed: 0,
          groupsFound: 0,
          durationMs: Date.now() - startTime,
        };
      }

      // Run consolidation
      const result = await this.consolidator.runConsolidationPass(memories);

      log.info(
        { userId, processed: result.memoriesProcessed, consolidated: result.consolidated.length },
        'Memory consolidation complete'
      );

      return result;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Consolidation failed');
      return {
        consolidated: [],
        memoriesProcessed: 0,
        groupsFound: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ==========================================================================
  // DECAY API - Graceful Forgetting
  // ==========================================================================

  /**
   * Apply decay to a user's memories
   * This updates strength scores based on time and emotional weight
   * Should be run periodically (e.g., nightly)
   */
  async applyDecay(userId: string): Promise<{
    memoriesDecayed: number;
    memoriesArchived: number;
    memoriesProtected: number;
  }> {
    try {
      // Get memories
      const memories = await getUserMemories(userId);

      if (memories.length === 0) {
        return { memoriesDecayed: 0, memoriesArchived: 0, memoriesProtected: 0 };
      }

      // Apply decay calculations
      const decayingMemories = memories.map((m) => this.decayManager.initializeDecay(m));
      const pruneResult = this.decayManager.pruneWeakMemories(decayingMemories);

      const memoriesProtected =
        memories.length - pruneResult.archived.length - pruneResult.strengthDistribution.weak;

      log.info(
        { userId, analyzed: memories.length, archived: pruneResult.archived.length },
        'Memory decay applied'
      );

      return {
        memoriesDecayed:
          pruneResult.strengthDistribution.weak + pruneResult.strengthDistribution.moderate,
        memoriesArchived: pruneResult.archived.length,
        memoriesProtected,
      };
    } catch (error) {
      log.error({ error: String(error), userId }, 'Decay failed');
      return { memoriesDecayed: 0, memoriesArchived: 0, memoriesProtected: 0 };
    }
  }

  /**
   * Reinforce a memory (user mentioned it again)
   * This boosts the memory's strength and prevents decay
   * Now persists to storage!
   */
  async reinforceMemory(
    userId: string,
    memoryId: string,
    boostFactor = 1.5
  ): Promise<{ previousStrength: number; newStrength: number }> {
    try {
      // Reinforce in storage
      const result = await reinforceMemoryInStorage(userId, memoryId, boostFactor);

      // Also notify learning engine
      await this.learningEngine.reinforceMemory(userId, memoryId, boostFactor);

      log.debug({ userId, memoryId, ...result }, 'Memory reinforced in storage');
      return result;
    } catch (error) {
      log.error({ error: String(error), userId, memoryId }, 'Reinforcement failed');
      return { previousStrength: 0.5, newStrength: 0.5 };
    }
  }

  // ==========================================================================
  // GRAPH API - Associative Memory Links
  // ==========================================================================

  /**
   * Get associated memories via graph traversal
   * This enables "spreading activation" - one memory triggers related ones
   */
  async getAssociatedMemories(
    userId: string,
    memoryId: string,
    depth = 2
  ): Promise<SpreadingActivationResult[]> {
    try {
      const results = await this.memoryGraph.spreadActivation(userId, [memoryId], {
        maxDepth: depth,
      });
      log.debug(
        { userId, memoryId, resultCount: results.length },
        'Graph spreading activation complete'
      );
      return results;
    } catch (error) {
      log.error({ error: String(error), userId, memoryId }, 'Graph spreading activation failed');
      return [];
    }
  }

  /**
   * Create links for a new memory
   * Analyzes the memory and creates links to related existing memories
   * Now actually creates links in graph storage!
   */
  async createMemoryLinks(
    userId: string,
    newMemoryId: string,
    newMemoryContent: string,
    newMemoryTopics: string[] = []
  ): Promise<MemoryLink[]> {
    try {
      // Create a memory item for link detection
      const newMemory = {
        id: newMemoryId,
        type: 'topic' as const,
        content: newMemoryContent,
        timestamp: new Date(),
        emotionalWeight: 0.5,
        relevanceDecay: 0,
        baseImportance: 0.5,
        topics: newMemoryTopics,
        source: { collection: 'memories', documentId: newMemoryId },
      };

      // Create links using the deep integration
      const links = await createLinksForNewMemory(userId, newMemory);

      log.debug({ userId, newMemoryId, linksCreated: links.length }, 'Created memory links');
      return links;
    } catch (error) {
      log.error({ error: String(error), userId, newMemoryId }, 'Link creation failed');
      return [];
    }
  }

  // ==========================================================================
  // LIFECYCLE API - Maintenance Operations
  // ==========================================================================

  /**
   * Run full maintenance cycle for a user
   * Call at end of session or during off-peak hours
   * Now uses deep integration that actually affects storage!
   */
  async runMaintenance(userId: string): Promise<{
    consolidation: ConsolidationResult;
    decay: { memoriesDecayed: number; memoriesArchived: number; memoriesProtected: number };
    graphLinks: number;
  }> {
    const startTime = Date.now();

    try {
      // Run full lifecycle maintenance (deep integration)
      const lifecycleResult = await runLifecycleMaintenance(userId);

      // Also decay learnings (so old patterns don't dominate)
      await this.learningEngine.decayLearnings(userId);

      log.info(
        {
          userId,
          duration: lifecycleResult.durationMs,
          consolidated: lifecycleResult.consolidation.consolidated,
          decayed: lifecycleResult.decay.memoriesDecayed,
          archived: lifecycleResult.decay.memoriesArchived,
          linksCreated: lifecycleResult.links.created,
        },
        'Full maintenance complete'
      );

      return {
        consolidation: {
          consolidated: [], // Would need to store the actual objects
          memoriesProcessed: lifecycleResult.consolidation.memoriesProcessed,
          groupsFound: lifecycleResult.consolidation.groupsFound,
          durationMs: lifecycleResult.durationMs,
        },
        decay: {
          memoriesDecayed: lifecycleResult.decay.memoriesDecayed,
          memoriesArchived: lifecycleResult.decay.memoriesArchived,
          memoriesProtected: lifecycleResult.decay.memoriesProtected,
        },
        graphLinks: lifecycleResult.links.created,
      };
    } catch (error) {
      log.error({ error: String(error), userId }, 'Maintenance failed');
      return {
        consolidation: { consolidated: [], memoriesProcessed: 0, groupsFound: 0, durationMs: 0 },
        decay: { memoriesDecayed: 0, memoriesArchived: 0, memoriesProtected: 0 },
        graphLinks: 0,
      };
    }
  }

  // ==========================================================================
  // DIRECT MEMORY ACCESS API - For Deep Signal Extraction
  // ==========================================================================

  /**
   * Get a specific memory by ID
   * Used for deep signal extraction and cleanup operations
   */
  async getMemory(
    userId: string,
    memoryId: string
  ): Promise<{
    id: string;
    content: string;
    type: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  } | null> {
    try {
      const memories = await getUserMemories(userId);
      const memory = memories.find((m) => m.id === memoryId);

      if (!memory) {
        log.debug({ userId, memoryId }, 'Memory not found');
        return null;
      }

      return {
        id: memory.id,
        content: memory.content,
        type: memory.type,
        timestamp: memory.timestamp,
        metadata: {
          emotionalWeight: memory.emotionalWeight,
          topics: memory.topics,
          source: memory.source,
        },
      };
    } catch (error) {
      log.error({ error: String(error), userId, memoryId }, 'Get memory failed');
      return null;
    }
  }

  /**
   * Save a memory directly to storage
   * Used for deep signal extraction and real-time memory capture
   */
  async saveMemoryDirect(
    userId: string,
    memory: {
      id?: string;
      content: string;
      type: 'fact' | 'preference' | 'event' | 'emotion' | 'commitment' | 'milestone' | 'signal';
      emotionalWeight?: number;
      topics?: string[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; memoryId: string }> {
    try {
      const memoryId = memory.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // Map type to MemoryItem type
      const typeMap: Record<
        string,
        'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event'
      > = {
        fact: 'summary',
        preference: 'preference',
        event: 'event',
        emotion: 'moment',
        commitment: 'commitment',
        milestone: 'event',
        signal: 'moment',
      };

      const memoryItem = {
        id: memoryId,
        type: typeMap[memory.type] ?? 'topic',
        content: memory.content,
        timestamp: new Date(),
        emotionalWeight: memory.emotionalWeight ?? 0.5,
        relevanceDecay: 0,
        baseImportance: memory.emotionalWeight ?? 0.5,
        topics: memory.topics,
        source: { collection: 'memories', documentId: memoryId },
        metadata: memory.metadata,
      };

      const saved = await saveMemory(userId, memoryItem, memory.emotionalWeight ?? 0.5);

      if (!saved) {
        log.warn({ userId, memoryId }, 'Save to storage failed, memory not persisted');
        return { success: false, memoryId };
      }

      log.debug({ userId, memoryId, type: memory.type }, 'Memory saved directly');
      return { success: true, memoryId };
    } catch (error) {
      log.error({ error: String(error), userId }, 'Save memory direct failed');
      return { success: false, memoryId: '' };
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private inferPhase(turnCount: number): 'opening' | 'exploring' | 'deep' | 'closing' {
    if (turnCount < 3) return 'opening';
    if (turnCount < 8) return 'exploring';
    if (turnCount < 15) return 'deep';
    return 'closing';
  }

  /**
   * Record that we're about to surface a memory (for learning)
   */
  private recordPendingSurfacing(
    userId: string,
    memoryId: string,
    memoryType: string,
    memoryTopics: string[],
    emotionalWeight: number,
    context: {
      surfacingMethod: SurfacingEvent['surfacingMethod'];
      conversationPhase: SurfacingEvent['conversationPhase'];
      userEmotionalState: SurfacingEvent['userEmotionalState'];
      timeSinceSessionStart: number;
    }
  ): void {
    // Map input type to valid MemoryItem types
    const typeMap: Record<
      string,
      'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event'
    > = {
      fact: 'summary',
      emotion: 'moment',
      topic: 'topic',
      commitment: 'commitment',
      preference: 'preference',
      event: 'event',
      person: 'person',
      summary: 'summary',
      moment: 'moment',
    };

    // Create a mock memory item for the learning engine
    const mockMemory = {
      id: memoryId,
      type: typeMap[memoryType] ?? 'topic',
      content: '',
      timestamp: new Date(),
      emotionalWeight,
      relevanceDecay: 0,
      baseImportance: 0.5,
      topics: memoryTopics,
      source: { collection: 'memories', documentId: memoryId },
    };

    const eventId = this.learningEngine.recordSurfacing(userId, mockMemory, context);
    this.pendingSurfacingEvents.set(memoryId, eventId);
  }

  /**
   * Map emotion string to learning engine's emotional state
   */
  private mapEmotionalState(emotion?: string): 'positive' | 'neutral' | 'negative' | 'vulnerable' {
    if (!emotion) return 'neutral';

    const lower = emotion.toLowerCase();
    const positiveEmotions = ['happy', 'excited', 'grateful', 'hopeful', 'confident', 'calm'];
    const negativeEmotions = ['sad', 'angry', 'frustrated', 'annoyed', 'disappointed'];
    const vulnerableEmotions = [
      'anxious',
      'scared',
      'grief',
      'overwhelmed',
      'lonely',
      'vulnerable',
    ];

    if (positiveEmotions.some((e) => lower.includes(e))) return 'positive';
    if (vulnerableEmotions.some((e) => lower.includes(e))) return 'vulnerable';
    if (negativeEmotions.some((e) => lower.includes(e))) return 'negative';

    return 'neutral';
  }

  // ============================================================================
  // LEARNING ENGINE ACCESS (for external functions)
  // ============================================================================

  /**
   * Get pending surfacing event IDs for a user
   */
  getPendingSurfacingEventIds(userId: string): string[] {
    return this.learningEngine.getPendingEventIds(userId);
  }

  /**
   * Get the most recent pending surfacing event for a user
   */
  getMostRecentPendingSurfacingEvent(userId: string): {
    id: string;
    memoryTopics: string[];
  } | null {
    return this.learningEngine.getMostRecentPendingEvent(userId);
  }

  /**
   * Record a reaction to a surfaced memory
   */
  async recordMemoryReactionViaLearningEngine(
    eventId: string,
    reaction: 'engaged' | 'acknowledged' | 'ignored' | 'negative' | 'grateful'
  ): Promise<void> {
    await this.learningEngine.recordReaction(eventId, reaction);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: UnifiedMemoryService | null = null;

/**
 * Get the unified memory service singleton
 */
export function getUnifiedMemoryService(): UnifiedMemoryService {
  if (!instance) {
    instance = new UnifiedMemoryService();
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetUnifiedMemoryService(): void {
  instance = null;
}

/**
 * Get pending surfacing event IDs for a user
 * Used by transcript handler to record reactions
 */
export function getPendingSurfacingEventIds(userId: string): string[] {
  const service = getUnifiedMemoryService();
  return service.getPendingSurfacingEventIds(userId);
}

/**
 * Get the most recent pending surfacing event for a user
 */
export function getMostRecentPendingSurfacingEvent(userId: string): {
  eventId: string;
  memoryTopics: string[];
} | null {
  const service = getUnifiedMemoryService();
  const event = service.getMostRecentPendingSurfacingEvent(userId);
  if (!event) return null;
  return {
    eventId: event.id,
    memoryTopics: event.memoryTopics,
  };
}

/**
 * Record a reaction to a surfaced memory
 * Called by transcript handler when user responds after memory surfacing
 */
export async function recordMemoryReaction(
  eventId: string,
  reaction: 'engaged' | 'acknowledged' | 'ignored' | 'negative' | 'grateful'
): Promise<void> {
  const service = getUnifiedMemoryService();
  await service.recordMemoryReactionViaLearningEngine(eventId, reaction);
}

// ============================================================================
// CONVENIENCE EXPORTS - For cleanup-handler and deep signal extraction
// ============================================================================

/**
 * Get a specific memory by ID
 * Convenience wrapper around UnifiedMemoryService.getMemory
 */
export async function getMemory(
  userId: string,
  memoryId: string
): Promise<{
  id: string;
  content: string;
  type: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
} | null> {
  return getUnifiedMemoryService().getMemory(userId, memoryId);
}

/**
 * Save a memory directly to storage
 * Convenience wrapper around UnifiedMemoryService.saveMemoryDirect
 */
export async function saveMemoryDirect(
  userId: string,
  memory: {
    id?: string;
    content: string;
    type: 'fact' | 'preference' | 'event' | 'emotion' | 'commitment' | 'milestone' | 'signal';
    emotionalWeight?: number;
    topics?: string[];
    metadata?: Record<string, unknown>;
  }
): Promise<{ success: boolean; memoryId: string }> {
  return getUnifiedMemoryService().saveMemoryDirect(userId, memory);
}
