/**
 * Unified Data Layer
 *
 * The bridge between Domain Stores (structured CRUD) and Semantic Memory (retrieval).
 * This facade provides:
 *
 * 1. UNIFIED API - Single interface for all user data operations
 * 2. AUTO-INDEXING - Changes in stores automatically index to semantic memory
 * 3. CONTEXT AGGREGATION - Pulls from both stores and memory for LLM context
 * 4. CACHING - Smart caching to avoid redundant fetches
 *
 * Philosophy: The brain doesn't separate "facts" from "memories" - it integrates
 * everything into a coherent understanding. This layer does the same.
 *
 * @module services/data-layer
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';

// Store imports
import { getProductivityStore, type ProductivityData } from '../stores/productivity-store.js';
import { getFinancialStore, type MayaFinancialData } from '../stores/financial-store.js';
import { getLifeDataStore, type UserLifeData } from '../stores/life-data-store.js';

// Memory imports
import { semanticSearch } from '../../memory/semantic-rag.js';
import { embed } from '../../memory/embeddings.js';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store/index.js';

const log = createLogger({ module: 'data-layer' });

// ============================================================================
// TYPES
// ============================================================================

// Re-export types from types.ts
export type {
  UnifiedUserContext,
  ContextSummary,
  SemanticUserContext,
  SemanticMemoryResult,
  StoreType,
  ChangeType,
  EntityType,
  EntityIndexingPolicy,
  IndexingPolicy,
  QueryType,
  QueryRoutingDecision,
  HealthStatus,
  DataLayerHealth,
  DataLayerMetrics,
  MemoryType,
  IndexingPriority,
  // Domain entity types
  CommitmentEntity,
  BoundaryEntity,
  InsideJokeEntity,
  GrowthReflectionEntity,
  SmallWinEntity,
  DreamEntity,
  LifeChapterEntity,
  ValuesAlignmentEntity,
  CapacityStateEntity,
  CalendarEventEntity,
  MeetingMemoryEntity,
  ContactEntity,
  RelationshipNoteEntity,
  GiftIdeaEntity,
  CoachingInsightEntity,
  BreakthroughMomentEntity,
  StuckPatternEntity,
  HealthGoalEntity,
  WellnessCheckinEntity,
  MusicPreferenceEntity,
  BookHighlightEntity,
  WisdomInsightEntity,
  LifeLessonEntity,
} from './types.js';

// Re-export hook generator utilities
export {
  createDomainHook,
  createDomainHooks,
  joinNonEmpty,
  formatField,
  formatDate,
  formatCurrency,
  createContentBuilder,
} from './hook-generator.js';
export type {
  HookConfig,
  DomainHook,
  ContentBuilder,
  MetadataExtractor,
} from './hook-generator.js';

// Re-export all domain hooks
export * from './hooks/index.js';

// Re-export indexing policy utilities
export {
  DEFAULT_INDEXING_POLICY,
  getIndexingPolicy,
  setIndexingPolicy,
  getEntityPolicy,
  shouldIndex,
  buildIndexContent,
  getPoliciesByDomain,
} from './indexing-policy.js';

// Re-export semantic context builder
export {
  SemanticContextBuilder,
  getSemanticContextBuilder,
  getSemanticContext,
  getContextForLLM,
  getHandoffContext,
} from './semantic-context-builder.js';
export type {
  SemanticContextOptions,
  RelevanceCategory,
  CategorizedContext,
  BuiltContext,
} from './semantic-context-builder.js';

// Re-export store hooks
export {
  onStoreChange,
  onHabitChange,
  onSavingsGoalChange,
  onMilestoneChange,
} from './store-hooks.js';

// Re-export service integrations (trust, superhuman, etc.)
export {
  // Trust integrations
  indexCommitment,
  deindexCommitment,
  indexBoundary,
  indexInsideJoke,
  indexGrowthReflection,
  indexSmallWin,
  indexTrustMoment,
  // Superhuman integrations
  indexDream,
  indexLifeChapter,
  indexValuesAlignment,
  indexCapacityState,
  indexRelationshipMilestone,
  indexSeasonalPattern,
  indexPredictiveCoaching,
} from './integrations/index.js';

// Re-export observability utilities
export {
  trackIndexingOperation,
  trackIndexingError,
  getSemanticStoreMetrics,
  getSemanticStoreDiagnostics,
  isSemanticStoreHealthy,
  getSemanticStoreHealth,
  getDashboardData,
} from './observability.js';
export type {
  SemanticStoreMetrics,
  IndexingOperation,
  IndexingError,
  SemanticStoreDiagnostics,
} from './observability.js';

import type { UnifiedUserContext, ContextSummary, SemanticUserContext } from './types.js';

/**
 * Index entry for semantic search
 */
interface IndexableEntry {
  id: string;
  userId: string;
  content: string;
  type: 'habit' | 'financial_goal' | 'milestone' | 'task' | 'budget' | 'subscription';
  metadata: Record<string, unknown>;
}

// ============================================================================
// UNIFIED DATA LAYER CLASS
// ============================================================================

class UnifiedDataLayer {
  private contextCache = new Map<string, { data: UnifiedUserContext; timestamp: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 1 minute cache

  // ============================================================================
  // UNIFIED CONTEXT
  // ============================================================================

  /**
   * Get unified context for a user - pulls from all stores
   */
  async getUnifiedContext(userId: string, forceRefresh = false): Promise<UnifiedUserContext> {
    // Check cache
    if (!forceRefresh) {
      const cached = this.contextCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const productivityStore = getProductivityStore();
    const financialStore = getFinancialStore();
    const lifeDataStore = getLifeDataStore();

    // Load all data in parallel
    const [productivity, financial, lifeData] = await Promise.all([
      productivityStore.loadUserData(userId).catch(() => null),
      financialStore.loadUserData(userId).catch(() => null),
      lifeDataStore.getUserLifeData(userId).catch(() => null),
    ]);

    // Calculate summary
    const summary: ContextSummary = {
      activeTaskCount: productivity?.tasks?.filter((t) => t.status !== 'completed').length ?? 0,
      activeHabitCount: productivity?.habits?.filter((h) => h.isActive).length ?? 0,
      activeSavingsGoals: financial?.savingsGoals?.filter((g) => g.status === 'active').length ?? 0,
      upcomingMilestones:
        lifeData?.milestones?.filter((m) => m.status === 'planning' || m.status === 'in-progress')
          .length ?? 0,
      openBillsCount: productivity?.bills?.filter((b) => b.isActive).length ?? 0,
      activeRoutinesCount: productivity?.routines?.filter((r) => r.isActive).length ?? 0,
      totalBudgetRemaining: financial?.budgets?.reduce((sum, b) => sum + b.remaining, 0) ?? 0,
      habitStreakMax: 0, // Would need to calculate from habit logs
    };

    const context: UnifiedUserContext = {
      userId,
      timestamp: new Date(),
      productivity,
      financial,
      lifeData,
      summary,
    };

    // Cache it
    this.contextCache.set(userId, { data: context, timestamp: Date.now() });

    log.debug({ userId, summary: context.summary }, 'Unified context loaded');
    return context;
  }

  // ============================================================================
  // SEMANTIC SEARCH ACROSS ALL DATA
  // ============================================================================

  /**
   * Semantic search across ALL user data - stores + memory
   */
  async searchUserContext(
    userId: string,
    query: string,
    options?: {
      topK?: number;
      includeStructured?: boolean;
      types?: Array<'habit' | 'financial' | 'milestone' | 'task' | 'memory'>;
    }
  ): Promise<SemanticUserContext> {
    const topK = options?.topK ?? 5;
    const includeStructured = options?.includeStructured ?? true;

    // Search semantic memory
    const semanticResults = await semanticSearch(query, {
      topK,
      userId,
      minScore: 0.3,
    });

    const relevantMemories = semanticResults.map((r) => ({
      content: r.content,
      source: r.source,
      score: r.score,
      type: (r.metadata?.type as SemanticUserContext['relevantMemories'][0]['type']) || 'memory',
    }));

    // Optionally include structured context
    let structuredContext: SemanticUserContext['structuredContext'];
    if (includeStructured) {
      const unified = await this.getUnifiedContext(userId);
      structuredContext = this.buildStructuredContext(unified, query);
    }

    return {
      userId,
      relevantMemories,
      structuredContext,
    };
  }

  /**
   * Build structured context based on query keywords
   */
  private buildStructuredContext(
    unified: UnifiedUserContext,
    query: string
  ): SemanticUserContext['structuredContext'] {
    const queryLower = query.toLowerCase();
    const context: SemanticUserContext['structuredContext'] = {};

    // Include habits if query mentions habits, routines, etc.
    if (/habit|routine|daily|morning|evening|track/i.test(queryLower)) {
      context.habits =
        unified.productivity?.habits
          ?.filter((h) => h.isActive)
          .slice(0, 5)
          .map((h) => `${h.name} (${h.frequency})`) ?? [];
    }

    // Include goals if query mentions goals, saving, financial
    if (/goal|saving|money|budget|financial/i.test(queryLower)) {
      context.goals =
        unified.financial?.savingsGoals
          ?.filter((g) => g.status === 'active')
          .slice(0, 3)
          .map((g) => `${g.name}: $${g.currentAmount}/$${g.targetAmount}`) ?? [];
    }

    // Include milestones if query mentions planning, milestone, life
    if (/milestone|plan|wedding|baby|home|retirement|life/i.test(queryLower)) {
      context.milestones =
        unified.lifeData?.milestones
          ?.filter((m) => m.status !== 'completed')
          .slice(0, 3)
          .map((m) => `${m.name} (${m.status})`) ?? [];
    }

    return context;
  }

  // ============================================================================
  // AUTO-INDEXING: Stores → Semantic Memory
  // ============================================================================

  /**
   * Index all user data from stores into semantic memory
   * Call this after significant changes or at session end
   */
  async indexUserData(userId: string): Promise<{ indexed: number; errors: number }> {
    let indexed = 0;
    let errors = 0;

    const unified = await this.getUnifiedContext(userId, true);

    const entries: IndexableEntry[] = [];

    // Index habits
    if (unified.productivity?.habits) {
      for (const habit of unified.productivity.habits.filter((h) => h.isActive)) {
        entries.push({
          id: `habit_${habit.id}`,
          userId,
          content: `Habit: ${habit.name}. ${habit.description || ''} Frequency: ${habit.frequency}. Target: ${habit.targetPerDay} per day.`,
          type: 'habit',
          metadata: { habitId: habit.id, frequency: habit.frequency },
        });
      }
    }

    // Index savings goals
    if (unified.financial?.savingsGoals) {
      for (const goal of unified.financial.savingsGoals.filter((g) => g.status === 'active')) {
        entries.push({
          id: `savings_${goal.id}`,
          userId,
          content: `Savings goal: ${goal.name}. Target: $${goal.targetAmount}. Current: $${goal.currentAmount}. ${goal.deadline ? `Deadline: ${goal.deadline}` : ''}`,
          type: 'financial_goal',
          metadata: { goalId: goal.id, priority: goal.priority },
        });
      }
    }

    // Index budgets
    if (unified.financial?.budgets) {
      for (const budget of unified.financial.budgets) {
        entries.push({
          id: `budget_${budget.id}`,
          userId,
          content: `Budget: ${budget.name}. Monthly limit: $${budget.monthlyLimit}. Spent: $${budget.spent}. Remaining: $${budget.remaining}.`,
          type: 'budget',
          metadata: { budgetId: budget.id },
        });
      }
    }

    // Index milestones
    if (unified.lifeData?.milestones) {
      for (const milestone of unified.lifeData.milestones.filter((m) => m.status !== 'completed')) {
        entries.push({
          id: `milestone_${milestone.id}`,
          userId,
          content: `Life milestone: ${milestone.name} (${milestone.category}). Status: ${milestone.status}. ${milestone.targetDate ? `Target date: ${milestone.targetDate}` : ''} ${milestone.notes || ''}`,
          type: 'milestone',
          metadata: { milestoneId: milestone.id, category: milestone.category },
        });
      }
    }

    // Index tasks (only important ones)
    if (unified.productivity?.tasks) {
      const importantTasks = unified.productivity.tasks
        .filter(
          (t) => t.status !== 'completed' && (t.priority === 'high' || t.priority === 'urgent')
        )
        .slice(0, 10);

      for (const task of importantTasks) {
        entries.push({
          id: `task_${task.id}`,
          userId,
          content: `Task (${task.priority}): ${task.title}. ${task.description || ''} ${task.dueDate ? `Due: ${task.dueDate}` : ''}`,
          type: 'task',
          metadata: { taskId: task.id, priority: task.priority },
        });
      }
    }

    // Index subscriptions
    if (unified.financial?.subscriptions) {
      for (const sub of unified.financial.subscriptions.filter((s) => s.isActive)) {
        entries.push({
          id: `subscription_${sub.id}`,
          userId,
          content: `Subscription: ${sub.name}. $${sub.amount}/${sub.frequency}. Category: ${sub.category}. Usefulness: ${sub.usefulness}.`,
          type: 'subscription',
          metadata: { subscriptionId: sub.id },
        });
      }
    }

    // Batch index all entries
    const vectorStore = getFirestoreVectorStore();
    for (const entry of entries) {
      try {
        const embedding = await embed(entry.content);
        await vectorStore.addDocument({
          id: entry.id,
          text: entry.content,
          embedding,
          metadata: {
            userId,
            type: entry.type,
            source: 'store_sync',
            ...entry.metadata,
          },
        });
        indexed++;
      } catch (error) {
        log.warn({ error: String(error), entryId: entry.id }, 'Failed to index entry');
        errors++;
      }
    }

    log.info(
      { userId, indexed, errors, total: entries.length },
      '📚 User data indexed to semantic memory'
    );
    return { indexed, errors };
  }

  // ============================================================================
  // CONTEXT FOR LLM
  // ============================================================================

  /**
   * Build complete context for LLM injection
   * Combines semantic search with structured data
   */
  async buildLLMContext(
    userId: string,
    query: string,
    options?: {
      maxLength?: number;
      includeStructured?: boolean;
    }
  ): Promise<string> {
    const maxLength = options?.maxLength ?? 1500;
    const semantic = await this.searchUserContext(userId, query, {
      topK: 5,
      includeStructured: options?.includeStructured ?? true,
    });

    const parts: string[] = [];

    // Add relevant memories
    if (semantic.relevantMemories.length > 0) {
      parts.push('**Relevant from memory:**');
      for (const mem of semantic.relevantMemories.slice(0, 3)) {
        parts.push(`- ${mem.content}`);
      }
    }

    // Add structured context
    if (semantic.structuredContext) {
      const { habits, goals, milestones } = semantic.structuredContext;

      if (habits && habits.length > 0) {
        parts.push('\n**Active habits:**');
        habits.forEach((h) => parts.push(`- ${h}`));
      }

      if (goals && goals.length > 0) {
        parts.push('\n**Savings goals:**');
        goals.forEach((g) => parts.push(`- ${g}`));
      }

      if (milestones && milestones.length > 0) {
        parts.push('\n**Life milestones:**');
        milestones.forEach((m) => parts.push(`- ${m}`));
      }
    }

    let context = parts.join('\n');

    // Truncate if too long
    if (context.length > maxLength) {
      context = context.slice(0, maxLength - 3) + '...';
    }

    return context;
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  clearCache(userId?: string): void {
    if (userId) {
      this.contextCache.delete(userId);
    } else {
      this.contextCache.clear();
    }
  }

  /**
   * Warm the cache by pre-loading user context
   */
  async warmCache(userId: string): Promise<void> {
    log.debug({ userId }, 'Warming cache for user');
    await this.getUnifiedContext(userId, true);
  }

  /**
   * Invalidate cache for a user
   */
  invalidateCache(userId: string): void {
    this.contextCache.delete(userId);
    log.debug({ userId }, 'Cache invalidated for user');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: UnifiedDataLayer | null = null;

export function getUnifiedDataLayer(): UnifiedDataLayer {
  if (!instance) {
    instance = new UnifiedDataLayer();
  }
  return instance;
}

// Export convenience functions
export const getUnifiedContext = (userId: string): Promise<UnifiedUserContext> =>
  getUnifiedDataLayer().getUnifiedContext(userId);

export const searchUserContext = (userId: string, query: string): Promise<SemanticUserContext> =>
  getUnifiedDataLayer().searchUserContext(userId, query);

export const indexUserData = (userId: string): Promise<{ indexed: number; errors: number }> =>
  getUnifiedDataLayer().indexUserData(userId);

export const buildLLMContext = (userId: string, query: string): Promise<string> =>
  getUnifiedDataLayer().buildLLMContext(userId, query);

export const warmCache = (userId: string): Promise<void> => getUnifiedDataLayer().warmCache(userId);

export const invalidateCache = (userId: string): void =>
  getUnifiedDataLayer().invalidateCache(userId);

export default getUnifiedDataLayer;
