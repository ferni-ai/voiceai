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
 * NOTE: This file exceeds 500 lines because it is a single-responsibility
 * orchestrator wrapping 8+ memory subsystems. The types and internal engines
 * have been extracted to memory-service-types.ts and memory-service-engines.ts.
 * Further splitting would require a major refactor of the class hierarchy.
 *
 * @module services/memory/memory-service
 */

import {
  getMemoryOrchestrator,
  type MemoryOrchestrator,
  type RecallContext,
} from '../../memory/index.js';
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
import { getSpreadingActivation } from '../../memory/spreading-activation.js';
import { createLogger } from '../../utils/safe-logger.js';

import { TimingEngine, PhrasingEngine, FeedbackCollector } from './memory-service-engines.js';
import type {
  TimingDecision,
  AssociatedMemory,
  EnhancedRecallResult,
  ToolSearchOptions,
  SimpleRecallContext,
  MemoryWriteInput,
} from './memory-service-types.js';

// Re-export all types for consumers
export type {
  TimingDecision,
  PhrasingSuggestion,
  MemoryFeedback,
  AssociatedMemory,
  EnhancedRecallResult,
  ToolSearchOptions,
  SimpleRecallContext,
  MemoryWriteInput,
  RecallContext,
} from './memory-service-types.js';

const log = createLogger({ module: 'unified-memory-service' });

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
   */
  private async getAssociatedMemoriesFromPrimary(
    userId: string,
    primaryMemories: Array<{ item: { id: string; content: string } }>
  ): Promise<AssociatedMemory[]> {
    const spreadingEngine = getSpreadingActivation();
    const sourceIds = primaryMemories.map((m) => m.item.id);
    const activationResults = await spreadingEngine.spreadFromMultiple(userId, sourceIds);

    // Get all user memories once to avoid repeated queries
    const allMemories = await getUserMemories(userId);
    const memoryMap = new Map(allMemories.map((m) => [m.id, m]));

    // Convert to AssociatedMemory format (top 5)
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
          linkTypes: result.pathTypes as string[],
        });
      }
    }

    return associated;
  }

  /**
   * Simplified recall for proactive surfacing and context builders
   */
  async simpleRecall(context: SimpleRecallContext): Promise<EnhancedRecallResult> {
    const fullContext: RecallContext = {
      userId: context.userId,
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
   */
  async search(options: ToolSearchOptions): Promise<string | null> {
    const { query, userId, limit = 3, minScore = 0.4 } = options;

    try {
      if (userId) {
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
        return ragLookup(query);
      }
    } catch (error) {
      log.debug({ error, query }, 'Memory search failed');
      return null;
    }
  }

  /**
   * Simple memory write - used by memory tools
   */
  async write(
    input: MemoryWriteInput
  ): Promise<{ success: boolean; memoryId?: string; linksCreated?: number }> {
    const { userId, content, type, importance, metadata } = input;

    try {
      const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const strengthMap: Record<string, number> = {
        low: 0.3,
        medium: 0.5,
        high: 0.7,
        critical: 0.9,
      };

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

      const saved = await saveMemory(userId, memoryItem, strengthMap[importance] ?? 0.5);

      if (!saved) {
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

      // Auto-protect important memories
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

  recordFeedback(feedback: Omit<import('./memory-service-types.js').MemoryFeedback, 'timestamp'>): void {
    this.feedbackCollector.record({
      ...feedback,
      timestamp: new Date(),
    });
  }

  getEngagementStats(userId: string) {
    return this.feedbackCollector.getStats(userId);
  }

  // ==========================================================================
  // SESSION API - For Lifecycle
  // ==========================================================================

  resetSession(userId: string): void {
    this.timingEngine.resetSession(userId);
    log.debug({ userId }, 'Session state reset');
  }

  async getHealth(userId: string) {
    return this.orchestrator.getMemoryHealth(userId);
  }

  // ==========================================================================
  // LEARNING API - Tracks What Works
  // ==========================================================================

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

    const reaction = this.learningEngine.inferReaction(
      userResponse,
      context.changedTopic ?? false,
      context.expressedGratitude ?? false,
      context.expressedDiscomfort ?? false
    );

    await this.learningEngine.recordReaction(eventId, reaction);

    if (reaction === 'engaged' || reaction === 'grateful') {
      await this.learningEngine.reinforceMemory(
        userId,
        memoryId,
        reaction === 'grateful' ? 1.0 : 0.7
      );
    }

    this.pendingSurfacingEvents.delete(memoryId);

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

  async getLearnings(userId: string) {
    return this.learningEngine.getLearningsSummary(userId);
  }

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
  // CONSOLIDATION API
  // ==========================================================================

  async consolidateMemories(userId: string): Promise<ConsolidationResult> {
    const startTime = Date.now();

    try {
      const memories = await getUserMemories(userId);

      if (memories.length === 0) {
        return { consolidated: [], memoriesProcessed: 0, groupsFound: 0, durationMs: Date.now() - startTime };
      }

      const result = await this.consolidator.runConsolidationPass(memories);

      log.info(
        { userId, processed: result.memoriesProcessed, consolidated: result.consolidated.length },
        'Memory consolidation complete'
      );

      return result;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Consolidation failed');
      return { consolidated: [], memoriesProcessed: 0, groupsFound: 0, durationMs: Date.now() - startTime };
    }
  }

  // ==========================================================================
  // DECAY API
  // ==========================================================================

  async applyDecay(userId: string): Promise<{
    memoriesDecayed: number;
    memoriesArchived: number;
    memoriesProtected: number;
  }> {
    try {
      const memories = await getUserMemories(userId);

      if (memories.length === 0) {
        return { memoriesDecayed: 0, memoriesArchived: 0, memoriesProtected: 0 };
      }

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

  async reinforceMemory(
    userId: string,
    memoryId: string,
    boostFactor = 1.5
  ): Promise<{ previousStrength: number; newStrength: number }> {
    try {
      const result = await reinforceMemoryInStorage(userId, memoryId, boostFactor);
      await this.learningEngine.reinforceMemory(userId, memoryId, boostFactor);

      log.debug({ userId, memoryId, ...result }, 'Memory reinforced in storage');
      return result;
    } catch (error) {
      log.error({ error: String(error), userId, memoryId }, 'Reinforcement failed');
      return { previousStrength: 0.5, newStrength: 0.5 };
    }
  }

  // ==========================================================================
  // GRAPH API
  // ==========================================================================

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

  async createMemoryLinks(
    userId: string,
    newMemoryId: string,
    newMemoryContent: string,
    newMemoryTopics: string[] = []
  ): Promise<MemoryLink[]> {
    try {
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

      const links = await createLinksForNewMemory(userId, newMemory);

      log.debug({ userId, newMemoryId, linksCreated: links.length }, 'Created memory links');
      return links;
    } catch (error) {
      log.error({ error: String(error), userId, newMemoryId }, 'Link creation failed');
      return [];
    }
  }

  // ==========================================================================
  // LIFECYCLE API
  // ==========================================================================

  async runMaintenance(userId: string): Promise<{
    consolidation: ConsolidationResult;
    decay: { memoriesDecayed: number; memoriesArchived: number; memoriesProtected: number };
    graphLinks: number;
  }> {
    try {
      const lifecycleResult = await runLifecycleMaintenance(userId);
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
          consolidated: [],
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
  // DIRECT MEMORY ACCESS API
  // ==========================================================================

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
  // LEARNING ENGINE ACCESS (from memory/unified-service.ts extras)
  // ==========================================================================

  getPendingSurfacingEventIds(userId: string): string[] {
    return this.learningEngine.getPendingEventIds(userId);
  }

  getMostRecentPendingSurfacingEvent(userId: string): {
    id: string;
    memoryTopics: string[];
  } | null {
    return this.learningEngine.getMostRecentPendingEvent(userId);
  }

  async recordMemoryReactionViaLearningEngine(
    eventId: string,
    reaction: 'engaged' | 'acknowledged' | 'ignored' | 'negative' | 'grateful'
  ): Promise<void> {
    await this.learningEngine.recordReaction(eventId, reaction);
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
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: UnifiedMemoryService | null = null;

export function getUnifiedMemoryService(): UnifiedMemoryService {
  if (!instance) {
    instance = new UnifiedMemoryService();
  }
  return instance;
}

export function resetUnifiedMemoryService(): void {
  instance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export function getPendingSurfacingEventIds(userId: string): string[] {
  return getUnifiedMemoryService().getPendingSurfacingEventIds(userId);
}

export function getMostRecentPendingSurfacingEvent(userId: string): {
  eventId: string;
  memoryTopics: string[];
} | null {
  const service = getUnifiedMemoryService();
  const event = service.getMostRecentPendingSurfacingEvent(userId);
  if (!event) return null;
  return { eventId: event.id, memoryTopics: event.memoryTopics };
}

export async function recordMemoryReaction(
  eventId: string,
  reaction: 'engaged' | 'acknowledged' | 'ignored' | 'negative' | 'grateful'
): Promise<void> {
  const service = getUnifiedMemoryService();
  await service.recordMemoryReactionViaLearningEngine(eventId, reaction);
}

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
