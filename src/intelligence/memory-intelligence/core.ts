/**
 * Memory Intelligence Core
 *
 * Main implementation of the MemoryIntelligence interface.
 * Coordinates timing, phrasing, and learning for memory surfacing.
 *
 * @module intelligence/memory-intelligence/core
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  MemoryIntelligence,
  TurnContext,
  MemoryPreparedContext,
  TimingDecision,
  PhrasingStyle,
  PersonaId,
  UserResponseSignal,
  UserMemoryProfile,
  ScoredMemoryForTurn,
  MemoryIntelligenceConfig,
  UserState,
  MemorySurfacedEvent,
} from './types.js';
import { DEFAULT_MEMORY_INTELLIGENCE_CONFIG } from './types.js';
import type { StoredMemory } from '../../memory/unified-store/types.js';
import { getUnifiedStore } from '../../memory/unified-store/index.js';
import { TimingEngine, getTimingEngine } from './timing/timing-engine.js';
import { PhrasingGenerator, getPhrasingGenerator } from './phrasing/phrasing-generator.js';
import { ResponseTracker, getResponseTracker } from './learning/response-tracker.js';
import { ProfileBuilder, getProfileBuilder } from './learning/profile-builder.js';
import { PreferenceLearner, getPreferenceLearner } from './learning/preference-learner.js';

const log = createLogger({ module: 'MemoryIntelligence' });

// ============================================================================
// MEMORY INTELLIGENCE CORE
// ============================================================================

/**
 * Memory Intelligence Core
 *
 * The main orchestrator for memory intelligence. This replaces
 * scattered context builders with a coordinated system that knows
 * what to surface, when, and how.
 */
export class MemoryIntelligenceCore implements MemoryIntelligence {
  private config: MemoryIntelligenceConfig;
  private timingEngine: TimingEngine;
  private phrasingGenerator: PhrasingGenerator;
  private responseTracker: ResponseTracker;
  private profileBuilder: ProfileBuilder;
  private preferenceLearner: PreferenceLearner;
  private initialized = false;

  // Session state
  private activeSessions: Map<string, {
    userId: string;
    sessionId: string;
    startTime: Date;
    turnCount: number;
  }> = new Map();

  constructor(config: Partial<MemoryIntelligenceConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_INTELLIGENCE_CONFIG, ...config };
    this.timingEngine = getTimingEngine();
    this.phrasingGenerator = getPhrasingGenerator();
    this.responseTracker = getResponseTracker();
    this.profileBuilder = getProfileBuilder();
    this.preferenceLearner = getPreferenceLearner();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      this.timingEngine.initialize(),
      this.phrasingGenerator.initialize(),
      this.responseTracker.initialize(),
      this.profileBuilder.initialize(),
      this.preferenceLearner.initialize(),
    ]);

    this.initialized = true;
    log.info('MemoryIntelligence initialized');
  }

  /**
   * Initialize for a session
   */
  async initSession(userId: string): Promise<void> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    this.activeSessions.set(userId, {
      userId,
      sessionId,
      startTime: new Date(),
      turnCount: 0,
    });

    this.responseTracker.startSession(userId, sessionId);

    log.debug({ userId, sessionId }, 'Session initialized');
  }

  /**
   * Cleanup after session
   */
  async endSession(userId: string): Promise<void> {
    const session = this.activeSessions.get(userId);
    if (!session) return;

    // Learn from session
    if (this.config.enableLearning) {
      await this.preferenceLearner.learnFromSession(userId, session.sessionId);
    }

    this.activeSessions.delete(userId);
    log.debug({ userId, sessionId: session.sessionId }, 'Session ended');
  }

  /**
   * Prepare memory context for a conversation turn
   */
  async prepareForTurn(context: TurnContext): Promise<MemoryPreparedContext> {
    const startTime = Date.now();
    await this.ensureInitialized();

    try {
      // Update session turn count
      const session = this.activeSessions.get(context.userId);
      if (session) {
        session.turnCount++;
        this.responseTracker.incrementTurn(session.sessionId);
      }

      // 1. Get user profile
      const userProfile = await this.getUserProfile(context.userId);

      // 2. Recall relevant memories
      const recallStart = Date.now();
      const store = getUnifiedStore();
      const recallResult = await store.recall({
        userId: context.userId,
        query: context.userText,
        limit: this.config.maxMemoriesToConsider,
        minScore: this.config.minRelevanceScore,
        topics: context.detectedTopics,
        people: context.peopleMentioned,
        includeLinked: true,
        maxGraphHops: 2,
      });
      const recallTimeMs = Date.now() - recallStart;

      // 3. Build user state from context
      const userState = this.buildUserState(context);

      // 4. Score and filter memories for this turn
      const timingStart = Date.now();
      const scoredMemories = await this.scoreMemoriesForTurn(
        recallResult.memories.map((m) => m.memory),
        context,
        userState,
        userProfile
      );
      const timingTimeMs = Date.now() - timingStart;

      // 5. Select memories to surface
      const selectedMemories = scoredMemories
        .filter((m) => m.timingDecision.shouldSurface)
        .slice(0, this.config.maxMemoriesPerTurn);

      // 6. Generate phrasing for selected memories
      const phrasingStart = Date.now();
      for (const scored of selectedMemories) {
        scored.phrasing = await this.phrasingGenerator.generate(scored.memory, {
          persona: context.persona,
          trustLevel: context.conversationContext.trustLevel,
          emotionalState: context.emotionalState,
          preferredStyle: scored.timingDecision.recommendedStyle,
        });
      }
      const phrasingTimeMs = Date.now() - phrasingStart;

      // 7. Build timing decision summary
      const primaryDecision = selectedMemories[0]?.timingDecision || {
        shouldSurface: false,
        confidence: 0.5,
        reason: 'No relevant memories found',
        priority: 'hold' as const,
      };

      // 8. Format content for injection
      const formattedContent = this.formatForInjection(selectedMemories, context.persona);
      const surfacedMemoryIds = selectedMemories.map((m) => m.memory.id);

      // 9. Record surfaced memories
      if (session && surfacedMemoryIds.length > 0) {
        for (const scored of selectedMemories) {
          this.responseTracker.recordSurfaced({
            userId: context.userId,
            sessionId: session.sessionId,
            memoryId: scored.memory.id,
            memoryType: scored.memory.type,
            trigger: scored.timingDecision.triggerType || 'topic_connection',
            style: scored.phrasing?.style || 'warm_recall',
            persona: context.persona,
            timestamp: new Date(),
          });
        }
      }

      const totalTimeMs = Date.now() - startTime;
      log.debug({
        userId: context.userId,
        memoriesConsidered: recallResult.memories.length,
        memoriesSelected: selectedMemories.length,
        totalTimeMs,
      }, 'Turn prepared');

      return {
        shouldInject: selectedMemories.length > 0,
        formattedContent,
        priority: selectedMemories.length > 0 ? 'normal' : 'low',
        selectedMemories: scoredMemories,
        surfacedMemoryIds,
        selectionReason: primaryDecision.reason,
        timingDecision: primaryDecision,
        userProfile,
        debug: {
          memoriesConsidered: recallResult.memories.length,
          memoriesFiltered: recallResult.memories.length - selectedMemories.length,
          recallTimeMs,
          timingTimeMs,
          phrasingTimeMs,
        },
      };
    } catch (error) {
      log.error({ error: String(error), userId: context.userId }, 'Error preparing turn');

      // Return safe fallback
      return {
        shouldInject: false,
        formattedContent: '',
        priority: 'low',
        selectedMemories: [],
        surfacedMemoryIds: [],
        selectionReason: 'Error during preparation',
        timingDecision: {
          shouldSurface: false,
          confidence: 0,
          reason: 'Error during preparation',
          priority: 'hold',
        },
        userProfile: this.createEmptyProfile(context.userId),
      };
    }
  }

  /**
   * Decide if a specific memory should be surfaced
   */
  async shouldSurfaceMemory(
    memory: StoredMemory,
    context: TurnContext['conversationContext'],
    userState: UserState
  ): Promise<TimingDecision> {
    await this.ensureInitialized();

    const turnContext: TurnContext = {
      userId: memory.userId,
      userText: '',
      conversationContext: context,
      emotionalState: {
        primary: 'neutral',
        intensity: 0.5,
        valence: 0,
        isVulnerable: false,
        trajectory: 'stable',
      },
      turnCount: context.recentMessages.length,
      persona: 'ferni',
    };

    const profile = await this.getUserProfile(memory.userId);

    return this.timingEngine.shouldSurface(memory, turnContext, userState, profile);
  }

  /**
   * Generate natural phrasing for referencing a memory
   */
  async generateNaturalReference(
    memory: StoredMemory,
    style: PhrasingStyle,
    persona: PersonaId
  ): Promise<string> {
    await this.ensureInitialized();

    const result = await this.phrasingGenerator.generate(memory, {
      persona,
      trustLevel: 'established',
      preferredStyle: style,
    });

    return result.phrase;
  }

  /**
   * Record how user responded to surfaced memories
   */
  async recordUserResponse(memoryIds: string[], response: UserResponseSignal): Promise<void> {
    // Find the session for the first memory's user
    for (const [userId, session] of this.activeSessions) {
      this.responseTracker.recordResponse(session.sessionId, memoryIds, response);
      log.debug({
        userId,
        memoryCount: memoryIds.length,
        responseType: response.type,
      }, 'Recorded user response');
      return;
    }
  }

  /**
   * Get user's memory profile
   */
  async getUserProfile(userId: string): Promise<UserMemoryProfile> {
    await this.ensureInitialized();

    const profile = await this.profileBuilder.getProfile(userId);
    return profile || this.createEmptyProfile(userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Score memories for the current turn
   */
  private async scoreMemoriesForTurn(
    memories: StoredMemory[],
    context: TurnContext,
    userState: UserState,
    userProfile: UserMemoryProfile
  ): Promise<ScoredMemoryForTurn[]> {
    const scored: ScoredMemoryForTurn[] = [];

    for (const memory of memories) {
      // Get timing decision
      const timingDecision = await this.timingEngine.shouldSurface(
        memory,
        context,
        userState,
        userProfile
      );

      // Calculate relevance scores
      const relevanceScore = this.calculateRelevanceScore(memory, context);

      scored.push({
        memory,
        relevanceScore,
        scoreBreakdown: {
          semantic: relevanceScore * 0.4,
          topical: this.calculateTopicScore(memory, context),
          emotional: this.calculateEmotionalScore(memory, context),
          temporal: this.calculateTemporalScore(memory),
          relationship: this.calculateRelationshipScore(memory, context),
        },
        timingDecision,
      });
    }

    // Sort by relevance and timing
    scored.sort((a, b) => {
      // Surfacing priority first
      if (a.timingDecision.shouldSurface && !b.timingDecision.shouldSurface) return -1;
      if (!a.timingDecision.shouldSurface && b.timingDecision.shouldSurface) return 1;

      // Then by relevance
      return b.relevanceScore - a.relevanceScore;
    });

    return scored;
  }

  /**
   * Build user state from context
   */
  private buildUserState(context: TurnContext): UserState {
    const hour = new Date().getHours();
    let timeOfDay: UserState['timeOfDay'];
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'late_night';

    return {
      energy: context.emotionalState.intensity < 0.7 ? 0.6 : 0.4,
      cognitiveLoad: context.conversationContext.topicsDiscussed.length > 3 ? 0.7 : 0.4,
      timeOfDay,
      dayOfWeek: new Date().getDay(),
      isRushed: context.userText.length < 20 && context.turnCount > 5,
      mood: context.emotionalState.valence > 0.3 ? 'positive' : context.emotionalState.valence < -0.3 ? 'negative' : 'neutral',
    };
  }

  /**
   * Calculate overall relevance score
   */
  private calculateRelevanceScore(memory: StoredMemory, context: TurnContext): number {
    let score = 0;

    // Topic overlap
    const topicScore = this.calculateTopicScore(memory, context);
    score += topicScore * 0.35;

    // People overlap
    const relationshipScore = this.calculateRelationshipScore(memory, context);
    score += relationshipScore * 0.25;

    // Emotional alignment
    const emotionalScore = this.calculateEmotionalScore(memory, context);
    score += emotionalScore * 0.2;

    // Temporal relevance
    const temporalScore = this.calculateTemporalScore(memory);
    score += temporalScore * 0.1;

    // Importance boost
    score += memory.importance * 0.1;

    return Math.min(1.0, score);
  }

  /**
   * Calculate topic relevance
   */
  private calculateTopicScore(memory: StoredMemory, context: TurnContext): number {
    if (!context.detectedTopics?.length || !memory.topics.length) return 0.3;

    const overlap = context.detectedTopics.filter((t) =>
      memory.topics.some((mt) =>
        t.toLowerCase().includes(mt.toLowerCase()) || mt.toLowerCase().includes(t.toLowerCase())
      )
    ).length;

    return Math.min(1.0, overlap * 0.4 + 0.2);
  }

  /**
   * Calculate emotional alignment
   */
  private calculateEmotionalScore(memory: StoredMemory, context: TurnContext): number {
    // Similar emotional weight suggests relevance
    const weightDiff = Math.abs(memory.emotionalWeight - context.emotionalState.intensity);
    return Math.max(0.2, 1 - weightDiff);
  }

  /**
   * Calculate temporal relevance (recent memories slightly more relevant)
   */
  private calculateTemporalScore(memory: StoredMemory): number {
    const daysSinceCreation = (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    // Decay over time but never below 0.2
    return Math.max(0.2, 1 - daysSinceCreation / 365);
  }

  /**
   * Calculate relationship/person relevance
   */
  private calculateRelationshipScore(memory: StoredMemory, context: TurnContext): number {
    if (!context.peopleMentioned?.length || !memory.peopleMentioned.length) return 0.3;

    const overlap = context.peopleMentioned.filter((p) =>
      memory.peopleMentioned.some((mp) =>
        p.toLowerCase().includes(mp.toLowerCase()) || mp.toLowerCase().includes(p.toLowerCase())
      )
    ).length;

    return overlap > 0 ? Math.min(1.0, 0.5 + overlap * 0.25) : 0.3;
  }

  /**
   * Format selected memories for injection
   */
  private formatForInjection(memories: ScoredMemoryForTurn[], persona: PersonaId): string {
    if (memories.length === 0) return '';

    const lines: string[] = [
      `[Memory Context - ${persona}]`,
      '',
    ];

    for (const scored of memories) {
      if (scored.phrasing) {
        lines.push(`- ${scored.phrasing.phrase}`);
        if (scored.memory.isActiveCommitment) {
          lines.push('  (This is an active commitment - consider following up)');
        }
      }
    }

    lines.push('');
    lines.push('Surface these memories naturally in conversation if relevant.');

    return lines.join('\n');
  }

  /**
   * Create empty user profile
   */
  private createEmptyProfile(userId: string): UserMemoryProfile {
    return {
      userId,
      lastUpdated: new Date(),
      receptivityPatterns: {
        byTimeOfDay: new Map(),
        byConversationDepth: new Map(),
        byEmotionalState: new Map(),
      },
      responsePatterns: {
        topicsWelcomed: [],
        topicsDeflected: [],
        preferredPhrasingStyle: 'warm_recall',
        averageEngagement: 0.5,
      },
      sensitiveTopics: new Set(),
      idealRecallFrequency: 2,
      trustLevel: 'new',
      totalMemoriesSurfaced: 0,
      engagementRate: 0.5,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let intelligenceInstance: MemoryIntelligenceCore | null = null;

export function getMemoryIntelligence(config?: Partial<MemoryIntelligenceConfig>): MemoryIntelligenceCore {
  if (!intelligenceInstance) {
    intelligenceInstance = new MemoryIntelligenceCore(config);
  }
  return intelligenceInstance;
}

export function resetMemoryIntelligence(): void {
  intelligenceInstance = null;
}
