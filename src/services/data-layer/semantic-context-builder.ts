/**
 * Unified Semantic Context Builder
 *
 * Builds rich, semantically-aware context for LLM conversations
 * by combining structured data, semantic search, and intelligent
 * summarization across all Ferni domains.
 *
 * @module services/data-layer/semantic-context-builder
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store.js';
import type { VectorStoreContract } from '../../memory/vector-store-interface.js';
import type {
  EntityType,
  StoreType,
  SemanticUserContext,
  SemanticMemoryResult,
  MemoryType,
} from './types.js';
import { getEntityPolicy } from './indexing-policy.js';
// Domain stores for structured data
import { getProductivityStore } from '../stores/productivity-store.js';
import { getFinancialStore } from '../stores/financial-store.js';
import { getLifeDataStore } from '../stores/life-data-store.js';

const log = createLogger({ name: 'SemanticContextBuilder' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for building semantic context
 */
export interface SemanticContextOptions {
  /** Maximum results from semantic search */
  maxResults?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Filter by specific entity types */
  entityTypes?: EntityType[];
  /** Filter by specific store types */
  storeTypes?: StoreType[];
  /** Include structured data summaries */
  includeStructured?: boolean;
  /** Include recent memories regardless of relevance */
  includeRecent?: boolean;
  /** Context window for conversations */
  recentContextWindow?: number; // days
}

/**
 * Context relevance categories
 */
export type RelevanceCategory =
  | 'direct_match' // Directly answers the query
  | 'supporting' // Provides supporting context
  | 'background' // Background information
  | 'tangential'; // Loosely related

/**
 * Categorized context result
 */
export interface CategorizedContext {
  category: RelevanceCategory;
  result: SemanticMemoryResult;
}

/**
 * Built context ready for LLM injection
 */
export interface BuiltContext {
  /** Primary relevant memories */
  primary: SemanticMemoryResult[];
  /** Supporting context */
  supporting: SemanticMemoryResult[];
  /** Structured data summaries */
  structured: Record<string, string[]>;
  /** Summary stats */
  stats: {
    totalResults: number;
    queryTimeMs: number;
    domains: string[];
  };
  /** Formatted for LLM */
  formattedForLLM: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<SemanticContextOptions> = {
  maxResults: 15,
  minScore: 0.6,
  entityTypes: [],
  storeTypes: [],
  includeStructured: true,
  includeRecent: true,
  recentContextWindow: 7, // days
};

/**
 * Map entity types to memory types for LLM presentation
 * Complete mapping for all entity types
 */
const ENTITY_TO_MEMORY_TYPE: Partial<Record<EntityType, MemoryType>> = {
  // Productivity domain
  habit: 'habit',
  task: 'task',
  routine: 'routine',
  bill: 'financial',
  medication: 'health',
  package: 'memory',
  // Financial domain
  budget: 'financial',
  savings_goal: 'financial',
  subscription: 'financial',
  spending_trigger: 'financial',
  investment: 'financial',
  debt: 'financial',
  // Life data domain
  milestone: 'milestone',
  life_goal: 'goal',
  retirement_plan: 'financial',
  note: 'memory',
  journal: 'memory',
  trip: 'memory',
  // Trust domain
  commitment: 'trust',
  boundary: 'trust',
  inside_joke: 'trust',
  growth_reflection: 'coaching',
  small_win: 'trust',
  thinking_of_you: 'trust',
  reading_between_lines: 'trust',
  tonal_memory: 'trust',
  vulnerability_moment: 'trust',
  trust_milestone: 'trust',
  // Superhuman domain (Better Than Human capabilities)
  dream: 'better_than_human',
  life_chapter: 'better_than_human',
  values_alignment: 'better_than_human',
  capacity_state: 'better_than_human',
  relationship_milestone: 'better_than_human',
  seasonal_pattern: 'better_than_human',
  emotional_first_aid: 'better_than_human',
  predictive_insight: 'better_than_human',
  commitment_keeper: 'better_than_human',
  relationship_network: 'better_than_human',
  conflict_memory: 'better_than_human',
  recovery_milestone: 'better_than_human',
  // Calendar domain
  calendar_event: 'calendar',
  meeting_memory: 'calendar',
  recurring_commitment: 'calendar',
  calendar_conflict: 'calendar',
  meeting_prep: 'calendar',
  availability_pattern: 'calendar',
  time_block: 'calendar',
  deadline: 'calendar',
  // Contacts domain
  contact: 'contact',
  relationship_note: 'contact',
  gift_idea: 'contact',
  important_date: 'contact',
  contact_interaction: 'contact',
  relationship_health: 'contact',
  family_member: 'contact',
  friend_memory: 'contact',
  professional_contact: 'contact',
  communication_preference: 'contact',
  // Coaching domain
  coaching_insight: 'coaching',
  breakthrough_moment: 'coaching',
  stuck_pattern: 'coaching',
  reframe_suggestion: 'coaching',
  growth_edge: 'coaching',
  strength_identified: 'coaching',
  blind_spot: 'coaching',
  accountability_item: 'coaching',
  behavior_change: 'coaching',
  motivation_insight: 'coaching',
  // Health domain
  health_goal: 'health',
  wellness_checkin: 'health',
  sleep_pattern: 'health',
  energy_level: 'health',
  workout: 'health',
  mental_health_note: 'health',
  nutrition_goal: 'health',
  body_awareness: 'health',
  stress_trigger: 'health',
  recovery_practice: 'health',
  // Media domain
  music_preference: 'media',
  book_highlight: 'media',
  emotional_song: 'media',
  playlist_memory: 'media',
  reading_goal: 'media',
  podcast_insight: 'media',
  movie_preference: 'media',
  game_preference: 'media',
  content_recommendation: 'media',
  media_memory: 'media',
  // Career domain
  career_goal: 'career',
  job_search: 'career',
  skill_development: 'career',
  professional_network: 'career',
  work_achievement: 'career',
  career_reflection: 'career',
  work_challenge: 'career',
  career_aspiration: 'career',
  // Wisdom domain
  wisdom_insight: 'wisdom',
  life_lesson: 'wisdom',
  life_thesis_component: 'wisdom',
  value_statement: 'wisdom',
  purpose_exploration: 'wisdom',
  perspective_shift: 'wisdom',
  existential_question: 'wisdom',
  legacy_thought: 'wisdom',
  emotional_pattern: 'wisdom',
  mood_trigger: 'wisdom',
  coping_strategy: 'wisdom',
  joy_trigger: 'wisdom',
  // Better Than Human - New superhuman capabilities
  voice_biomarker: 'better_than_human',
  session_summary: 'better_than_human',
  pattern_insight: 'better_than_human',
  behavioral_pattern: 'better_than_human',
  cross_session_thread: 'better_than_human',
  correlation_insight: 'better_than_human',
  protective_moment: 'better_than_human',
  voice_recognition: 'better_than_human',
};

// ============================================================================
// SEMANTIC CONTEXT BUILDER CLASS
// ============================================================================

/**
 * Builds semantically-aware context for LLM conversations
 */
export class SemanticContextBuilder {
  private vectorStore: VectorStoreContract | null = null;
  private initialized = false;

  /**
   * Initialize the context builder
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.vectorStore = getFirestoreVectorStore();
      await this.vectorStore.initialize();
      this.initialized = true;
      log.info('Semantic context builder initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize semantic context builder');
      // Continue without vector store - will use structured data only
    }
  }

  /**
   * Build comprehensive context for a user query
   */
  async buildContext(
    userId: string,
    query: string,
    options: SemanticContextOptions = {}
  ): Promise<BuiltContext> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    await this.initialize();

    // Parallel fetch of semantic and structured data
    const [semanticResults, structuredSummary] = await Promise.all([
      this.searchSemantic(userId, query, opts),
      opts.includeStructured ? this.getStructuredSummary(userId, opts) : {},
    ]);

    // Categorize results by relevance
    const categorized = this.categorizeResults(semanticResults, query);

    // Build formatted context for LLM
    const formattedForLLM = this.formatForLLM(categorized, structuredSummary);

    const queryTimeMs = Date.now() - startTime;
    const domains = [...new Set(semanticResults.map((r) => r.type))];

    return {
      primary: categorized.filter((c) => c.category === 'direct_match').map((c) => c.result),
      supporting: categorized.filter((c) => c.category === 'supporting').map((c) => c.result),
      structured: structuredSummary,
      stats: {
        totalResults: semanticResults.length,
        queryTimeMs,
        domains,
      },
      formattedForLLM,
    };
  }

  /**
   * Search semantic memory for relevant context
   */
  private async searchSemantic(
    userId: string,
    query: string,
    opts: Required<SemanticContextOptions>
  ): Promise<SemanticMemoryResult[]> {
    if (!this.vectorStore) {
      return [];
    }

    try {
      // Build filter based on options
      const filter: { userId?: string; source?: string[] } = {
        userId,
      };

      const results = await this.vectorStore.search(query, {
        topK: opts.maxResults * 2,
        filter,
        minScore: opts.minScore,
      });

      // Filter and transform
      return results.slice(0, opts.maxResults).map((r) => this.transformToMemoryResult(r));
    } catch (error) {
      log.error({ error: String(error), userId }, 'Semantic search failed');
      return [];
    }
  }

  /**
   * Transform vector store result to semantic memory result
   */
  private transformToMemoryResult(result: {
    document: { id: string; text: string; metadata?: Record<string, unknown> };
    score: number;
  }): SemanticMemoryResult {
    const doc = result.document;
    const metadata = doc.metadata || {};
    const entityType = (metadata.entityType as EntityType) || 'memory';
    const memoryType = ENTITY_TO_MEMORY_TYPE[entityType] || 'memory';

    return {
      content: doc.text,
      source: String(metadata.source || 'semantic_memory'),
      score: result.score,
      type: memoryType,
      entityId: doc.id || String(metadata.entityId || ''),
      metadata,
    };
  }

  /**
   * Get structured data summary for context
   */
  private async getStructuredSummary(
    userId: string,
    opts: Required<SemanticContextOptions>
  ): Promise<Record<string, string[]>> {
    const summary: Record<string, string[]> = {};

    try {
      // Load from all domain stores in parallel
      const productivityStore = getProductivityStore();
      const financialStore = getFinancialStore();
      const lifeDataStore = getLifeDataStore();

      const [productivity, financial, lifeData] = await Promise.all([
        productivityStore.loadUserData(userId).catch(() => null),
        financialStore.loadUserData(userId).catch(() => null),
        lifeDataStore.getUserLifeData(userId).catch(() => null),
      ]);

      // Habits
      if (productivity?.habits?.length) {
        const activeHabits = productivity.habits.filter((h) => h.isActive).slice(0, 5);
        if (activeHabits.length > 0) {
          summary.habits = activeHabits.map((h) => {
            const freq = h.frequency || 'daily';
            return `${h.name} (${freq})`;
          });
        }
      }

      // Tasks (high priority only)
      if (productivity?.tasks?.length) {
        const importantTasks = productivity.tasks
          .filter(
            (t) => t.status !== 'completed' && (t.priority === 'high' || t.priority === 'urgent')
          )
          .slice(0, 3);
        if (importantTasks.length > 0) {
          summary.tasks = importantTasks.map((t) => {
            const dueInfo = t.dueDate ? ` (due: ${t.dueDate})` : '';
            return `${t.title}${dueInfo}`;
          });
        }
      }

      // Bills (active only)
      if (productivity?.bills?.length) {
        const activeBills = productivity.bills.filter((b) => b.isActive).slice(0, 3);
        if (activeBills.length > 0) {
          summary.bills = activeBills.map((b) => {
            const dueInfo = b.nextDueDate
              ? ` (due: ${b.nextDueDate})`
              : b.dueDay
                ? ` (due: day ${b.dueDay})`
                : '';
            return `${b.name}: $${b.amount}${dueInfo}`;
          });
        }
      }

      // Savings goals
      if (financial?.savingsGoals?.length) {
        const activeGoals = financial.savingsGoals.filter((g) => g.status === 'active').slice(0, 3);
        if (activeGoals.length > 0) {
          summary.savings = activeGoals.map((g) => {
            const percent = Math.round((g.currentAmount / g.targetAmount) * 100);
            return `${g.name}: $${g.currentAmount}/$${g.targetAmount} (${percent}%)`;
          });
        }
      }

      // Budgets (with spending info)
      if (financial?.budgets?.length) {
        const budgetsWithSpending = financial.budgets
          .filter((b) => b.remaining !== undefined)
          .slice(0, 3);
        if (budgetsWithSpending.length > 0) {
          summary.budgets = budgetsWithSpending.map((b) => {
            const percent = Math.round((b.spent / b.monthlyLimit) * 100);
            return `${b.name}: $${b.remaining} left (${percent}% spent)`;
          });
        }
      }

      // Milestones
      if (lifeData?.milestones?.length) {
        const upcomingMilestones = lifeData.milestones
          .filter((m) => m.status === 'planning' || m.status === 'in-progress')
          .slice(0, 3);
        if (upcomingMilestones.length > 0) {
          summary.milestones = upcomingMilestones.map((m) => {
            const dateInfo = m.targetDate ? ` (target: ${m.targetDate})` : '';
            return `${m.name}${dateInfo}`;
          });
        }
      }

      // Life goals
      if (lifeData?.goals?.length) {
        const activeGoals = lifeData.goals
          .filter((g) => g.status !== 'completed' && g.status !== 'abandoned')
          .slice(0, 3);
        if (activeGoals.length > 0) {
          summary.lifeGoals = activeGoals.map((g) => g.title);
        }
      }

      log.debug({ userId, categories: Object.keys(summary) }, 'Structured summary built');
      return summary;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get structured summary');
      return {};
    }
  }

  /**
   * Categorize results by relevance to query
   */
  private categorizeResults(results: SemanticMemoryResult[], query: string): CategorizedContext[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 3);

    return results.map((result) => {
      const contentLower = result.content.toLowerCase();
      const score = result.score;

      // Calculate relevance category
      let category: RelevanceCategory = 'tangential';

      // High score = direct match
      if (score >= 0.85) {
        category = 'direct_match';
      } else if (score >= 0.75) {
        // Check for keyword overlap
        const keywordMatches = queryWords.filter((w) => contentLower.includes(w)).length;
        if (keywordMatches >= 2 || keywordMatches >= queryWords.length * 0.5) {
          category = 'direct_match';
        } else {
          category = 'supporting';
        }
      } else if (score >= 0.65) {
        category = 'supporting';
      } else {
        category = 'background';
      }

      return { category, result };
    });
  }

  /**
   * Format context for LLM injection
   */
  private formatForLLM(
    categorized: CategorizedContext[],
    structured: Record<string, string[]>
  ): string {
    const sections: string[] = [];

    // Add structured summaries
    const structuredEntries = Object.entries(structured);
    if (structuredEntries.length > 0) {
      const structuredSection = structuredEntries
        .map(([key, values]) => `${key}: ${values.join(', ')}`)
        .join('\n');
      sections.push(`Current Status:\n${structuredSection}`);
    }

    // Add primary matches
    const primary = categorized.filter((c) => c.category === 'direct_match');
    if (primary.length > 0) {
      const primaryContent = primary.map((c) => `- ${c.result.content}`).join('\n');
      sections.push(`Relevant Context:\n${primaryContent}`);
    }

    // Add supporting context
    const supporting = categorized.filter((c) => c.category === 'supporting');
    if (supporting.length > 0) {
      const supportingContent = supporting
        .slice(0, 5) // Limit supporting context
        .map((c) => `- ${c.result.content}`)
        .join('\n');
      sections.push(`Additional Context:\n${supportingContent}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Build context for a specific domain
   */
  async buildDomainContext(
    userId: string,
    domain: StoreType,
    query: string,
    maxResults = 10
  ): Promise<SemanticMemoryResult[]> {
    await this.initialize();

    return this.searchSemantic(userId, query, {
      ...DEFAULT_OPTIONS,
      storeTypes: [domain],
      maxResults,
    });
  }

  /**
   * Build context for cross-persona handoffs
   */
  async buildHandoffContext(
    userId: string,
    fromPersona: string,
    toPersona: string,
    conversationSummary: string
  ): Promise<string> {
    await this.initialize();

    // Search for relevant context based on conversation
    const context = await this.buildContext(userId, conversationSummary, {
      maxResults: 10,
      includeStructured: true,
    });

    // Get persona-specific insights
    const personaQuery = `What ${toPersona} should know about user`;
    const personaContext = await this.searchSemantic(userId, personaQuery, {
      ...DEFAULT_OPTIONS,
      maxResults: 5,
    });

    const handoffSummary = [
      `Handoff from ${fromPersona} to ${toPersona}:`,
      ``,
      `Recent conversation: ${conversationSummary}`,
      ``,
      context.formattedForLLM,
      ``,
      personaContext.length > 0
        ? `Relevant for ${toPersona}:\n${personaContext.map((r) => `- ${r.content}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    return handoffSummary;
  }

  /**
   * Get recent activity context
   */
  async getRecentActivity(
    userId: string,
    days = 7,
    maxItems = 20
  ): Promise<SemanticMemoryResult[]> {
    await this.initialize();

    if (!this.vectorStore) {
      return [];
    }

    try {
      const results = await this.vectorStore.search('recent activity', {
        topK: maxItems * 2,
        filter: { userId },
      });

      return results.slice(0, maxItems).map((r) => this.transformToMemoryResult(r));
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get recent activity');
      return [];
    }
  }

  /**
   * Build proactive context (for "thinking of you" moments)
   */
  async buildProactiveContext(userId: string): Promise<{
    commitments: SemanticMemoryResult[];
    patterns: SemanticMemoryResult[];
    opportunities: SemanticMemoryResult[];
  }> {
    await this.initialize();

    if (!this.vectorStore) {
      return { commitments: [], patterns: [], opportunities: [] };
    }

    const searchOpts: Required<SemanticContextOptions> = {
      ...DEFAULT_OPTIONS,
      maxResults: 5,
    };

    const [commitments, patterns, opportunities] = await Promise.all([
      this.searchSemantic(userId, 'pending commitment deadline accountability', searchOpts),
      this.searchSemantic(userId, 'recurring pattern behavior emotional', searchOpts),
      this.searchSemantic(userId, 'growth opportunity goal progress dream', searchOpts),
    ]);

    return { commitments, patterns, opportunities };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: SemanticContextBuilder | null = null;

/**
 * Get the singleton semantic context builder
 */
export function getSemanticContextBuilder(): SemanticContextBuilder {
  if (!instance) {
    instance = new SemanticContextBuilder();
  }
  return instance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick semantic context lookup
 */
export async function getSemanticContext(
  userId: string,
  query: string,
  options?: SemanticContextOptions
): Promise<BuiltContext> {
  const builder = getSemanticContextBuilder();
  return builder.buildContext(userId, query, options);
}

/**
 * Get context formatted for LLM system prompt
 */
export async function getContextForLLM(
  userId: string,
  query: string,
  maxResults = 10
): Promise<string> {
  const builder = getSemanticContextBuilder();
  const context = await builder.buildContext(userId, query, { maxResults });
  return context.formattedForLLM;
}

/**
 * Get handoff context for persona transitions
 */
export async function getHandoffContext(
  userId: string,
  fromPersona: string,
  toPersona: string,
  conversationSummary: string
): Promise<string> {
  const builder = getSemanticContextBuilder();
  return builder.buildHandoffContext(userId, fromPersona, toPersona, conversationSummary);
}

export default SemanticContextBuilder;
