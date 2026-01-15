/**
 * Query Router
 *
 * Decides whether to use structured queries (direct store access) or
 * semantic search (vector similarity) based on query analysis.
 *
 * Philosophy: Some questions have exact answers ("What bills are due?"),
 * others need fuzzy matching ("How am I doing financially?").
 *
 * @module services/data-layer/query-router
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { QueryType, QueryRoutingDecision, StoreType, EntityType } from './types.js';

const log = createLogger({ module: 'query-router' });

// ============================================================================
// QUERY PATTERNS
// ============================================================================

/**
 * Patterns that indicate a structured query (exact lookup)
 */
const STRUCTURED_PATTERNS: Array<{ pattern: RegExp; stores: StoreType[]; entities: EntityType[] }> =
  [
    // Bills
    {
      pattern: /\b(bills?|payments?)\s+(due|overdue|upcoming)\b/i,
      stores: ['productivity'],
      entities: ['bill'],
    },
    {
      pattern: /\b(how much|amount|total)\s+.*(bills?|owe)\b/i,
      stores: ['productivity'],
      entities: ['bill'],
    },

    // Tasks
    {
      pattern: /\b(tasks?|todos?)\s+(due|overdue|today|tomorrow|this week)\b/i,
      stores: ['productivity'],
      entities: ['task'],
    },
    {
      pattern: /\b(my|list|show)\s+(tasks?|todos?)\b/i,
      stores: ['productivity'],
      entities: ['task'],
    },

    // Habits
    {
      pattern: /\b(habit|habits)\s+(streak|completion|today)\b/i,
      stores: ['productivity'],
      entities: ['habit'],
    },
    { pattern: /\b(how many|which)\s+habits?\b/i, stores: ['productivity'], entities: ['habit'] },

    // Budget
    {
      pattern: /\b(budget|spending)\s+(remaining|left|limit)\b/i,
      stores: ['financial'],
      entities: ['budget'],
    },
    {
      pattern: /\b(how much|amount)\s+.*(spent|remaining|budget)\b/i,
      stores: ['financial'],
      entities: ['budget'],
    },

    // Savings
    {
      pattern: /\b(savings?|saving)\s+(goal|progress|amount)\b/i,
      stores: ['financial'],
      entities: ['savings_goal'],
    },
    {
      pattern: /\b(emergency fund|savings?)\s+(balance|total)\b/i,
      stores: ['financial'],
      entities: ['savings_goal'],
    },

    // Subscriptions
    {
      pattern: /\b(subscriptions?|recurring)\s+(cost|total|list)\b/i,
      stores: ['financial'],
      entities: ['subscription'],
    },

    // Milestones
    {
      pattern: /\b(milestone|milestones)\s+(upcoming|next|status)\b/i,
      stores: ['life-data'],
      entities: ['milestone'],
    },
    {
      pattern: /\b(wedding|baby|home|retirement)\s+(plan|date|status)\b/i,
      stores: ['life-data'],
      entities: ['milestone'],
    },

    // Medications
    {
      pattern: /\b(medication|medicine|meds?)\s+(schedule|today|reminder)\b/i,
      stores: ['productivity'],
      entities: ['medication'],
    },

    // Packages
    {
      pattern: /\b(package|packages|delivery|deliveries)\s+(tracking|status|arriving)\b/i,
      stores: ['productivity'],
      entities: ['package'],
    },
  ];

/**
 * Patterns that indicate a semantic query (fuzzy search)
 */
const SEMANTIC_PATTERNS = [
  /\b(how am i|how's|how are)\s+.*\b(doing|going|progressing)\b/i,
  /\b(what|tell me)\s+.*\b(about|regarding)\s+my\b/i,
  /\b(remember|recall|mentioned|talked about)\b/i,
  /\b(similar|like|related)\b/i,
  /\b(advice|suggestions?|recommendations?)\b/i,
  /\b(feeling|mood|stress|anxiety)\b/i,
  /\b(overall|general|big picture)\b/i,
  /\b(progress|journey|growth)\b/i,
];

/**
 * Keywords mapped to stores/entities for context boosting
 */
const KEYWORD_MAPPINGS: Record<string, { stores: StoreType[]; entities: EntityType[] }> = {
  habit: { stores: ['productivity'], entities: ['habit'] },
  routine: { stores: ['productivity'], entities: ['routine'] },
  task: { stores: ['productivity'], entities: ['task'] },
  bill: { stores: ['productivity'], entities: ['bill'] },
  budget: { stores: ['financial'], entities: ['budget'] },
  saving: { stores: ['financial'], entities: ['savings_goal'] },
  subscription: { stores: ['financial'], entities: ['subscription'] },
  milestone: { stores: ['life-data'], entities: ['milestone'] },
  goal: { stores: ['life-data', 'financial'], entities: ['life_goal', 'savings_goal'] },
  medication: { stores: ['productivity'], entities: ['medication'] },
  package: { stores: ['productivity'], entities: ['package'] },
  trip: { stores: ['productivity'], entities: ['trip'] },
  finance: { stores: ['financial'], entities: ['budget', 'savings_goal', 'subscription'] },
  money: { stores: ['financial'], entities: ['budget', 'savings_goal'] },
  wedding: { stores: ['life-data'], entities: ['milestone'] },
  retirement: { stores: ['life-data'], entities: ['retirement_plan', 'savings_goal'] },
};

// ============================================================================
// ROUTER
// ============================================================================

/**
 * Route a query to the appropriate data source(s)
 */
export function routeQuery(query: string): QueryRoutingDecision {
  const queryLower = query.toLowerCase();

  // Check for structured patterns first
  for (const { pattern, stores, entities } of STRUCTURED_PATTERNS) {
    if (pattern.test(queryLower)) {
      return {
        queryType: 'structured',
        confidence: 0.9,
        reason: `Matched structured pattern: ${pattern.source}`,
        stores,
        entityTypes: entities,
      };
    }
  }

  // Check for semantic patterns
  for (const pattern of SEMANTIC_PATTERNS) {
    if (pattern.test(queryLower)) {
      // Still extract relevant stores/entities for filtering
      const { stores, entities } = extractKeywordMappings(queryLower);
      return {
        queryType: 'semantic',
        confidence: 0.85,
        reason: `Matched semantic pattern: ${pattern.source}`,
        stores: stores.length > 0 ? stores : undefined,
        entityTypes: entities.length > 0 ? entities : undefined,
      };
    }
  }

  // Check for keyword-based hybrid
  const { stores, entities } = extractKeywordMappings(queryLower);
  if (stores.length > 0) {
    return {
      queryType: 'hybrid',
      confidence: 0.7,
      reason: 'Keyword mapping suggests specific data types',
      stores,
      entityTypes: entities,
    };
  }

  // Default to semantic for open-ended queries
  return {
    queryType: 'semantic',
    confidence: 0.5,
    reason: 'No specific patterns matched, using semantic search',
  };
}

/**
 * Extract stores and entity types from keywords in query
 */
function extractKeywordMappings(query: string): { stores: StoreType[]; entities: EntityType[] } {
  const storesSet = new Set<StoreType>();
  const entitiesSet = new Set<EntityType>();

  for (const [keyword, mapping] of Object.entries(KEYWORD_MAPPINGS)) {
    if (query.includes(keyword)) {
      mapping.stores.forEach((s) => storesSet.add(s));
      mapping.entities.forEach((e) => entitiesSet.add(e));
    }
  }

  return {
    stores: Array.from(storesSet),
    entities: Array.from(entitiesSet),
  };
}

/**
 * Get suggested query strategy explanation for debugging
 */
export function explainRouting(query: string): string {
  const decision = routeQuery(query);

  const parts = [
    `Query: "${query}"`,
    `Type: ${decision.queryType}`,
    `Confidence: ${(decision.confidence * 100).toFixed(0)}%`,
    `Reason: ${decision.reason}`,
  ];

  if (decision.stores) {
    parts.push(`Stores: ${decision.stores.join(', ')}`);
  }
  if (decision.entityTypes) {
    parts.push(`Entities: ${decision.entityTypes.join(', ')}`);
  }

  return parts.join('\n');
}

// ============================================================================
// QUERY EXECUTORS
// ============================================================================

import { getProductivityStore } from '../stores/productivity-store.js';
import { getFinancialStore } from '../stores/financial-store.js';
import { getLifeDataStore } from '../stores/life-data-store.js';
import { semanticSearch } from '../../memory/semantic-rag.js';

/**
 * Execute a routed query
 */
export async function executeRoutedQuery(
  userId: string,
  query: string
): Promise<{
  results: unknown[];
  queryType: QueryType;
  source: string;
}> {
  const routing = routeQuery(query);

  log.debug({ userId, query, routing }, 'Executing routed query');

  switch (routing.queryType) {
    case 'structured':
      return executeStructuredQuery(userId, routing);

    case 'semantic':
      return executeSemanticQuery(userId, query, routing);

    case 'hybrid':
      return executeHybridQuery(userId, query, routing);

    default:
      return { results: [], queryType: 'semantic', source: 'none' };
  }
}

async function executeStructuredQuery(
  userId: string,
  routing: QueryRoutingDecision
): Promise<{ results: unknown[]; queryType: QueryType; source: string }> {
  const results: unknown[] = [];
  const sources: string[] = [];

  for (const store of routing.stores || []) {
    switch (store) {
      case 'productivity': {
        const prodStore = getProductivityStore();
        const prodData = await prodStore.loadUserData(userId);

        for (const entityType of routing.entityTypes || []) {
          switch (entityType) {
            case 'habit':
              results.push(...(prodData.habits || []));
              sources.push('productivity:habits');
              break;
            case 'task':
              results.push(...(prodData.tasks || []));
              sources.push('productivity:tasks');
              break;
            case 'bill':
              results.push(...(prodData.bills || []));
              sources.push('productivity:bills');
              break;
            case 'routine':
              results.push(...(prodData.routines || []));
              sources.push('productivity:routines');
              break;
            case 'medication':
              results.push(...(prodData.medications || []));
              sources.push('productivity:medications');
              break;
            case 'package':
              results.push(...(prodData.packages || []));
              sources.push('productivity:packages');
              break;
          }
        }
        break;
      }

      case 'financial': {
        const finStore = getFinancialStore();
        const finData = await finStore.loadUserData(userId);

        for (const entityType of routing.entityTypes || []) {
          switch (entityType) {
            case 'budget':
              results.push(...(finData.budgets || []));
              sources.push('financial:budgets');
              break;
            case 'savings_goal':
              results.push(...(finData.savingsGoals || []));
              sources.push('financial:savingsGoals');
              break;
            case 'subscription':
              results.push(...(finData.subscriptions || []));
              sources.push('financial:subscriptions');
              break;
          }
        }
        break;
      }

      case 'life-data': {
        const lifeStore = getLifeDataStore();
        const lifeData = await lifeStore.getUserLifeData(userId);

        for (const entityType of routing.entityTypes || []) {
          switch (entityType) {
            case 'milestone':
              results.push(...(lifeData.milestones || []));
              sources.push('life-data:milestones');
              break;
            case 'life_goal':
              results.push(...(lifeData.goals || []));
              sources.push('life-data:goals');
              break;
          }
        }
        break;
      }
    }
  }

  return {
    results,
    queryType: 'structured',
    source: sources.join(', '),
  };
}

async function executeSemanticQuery(
  userId: string,
  query: string,
  routing: QueryRoutingDecision
): Promise<{ results: unknown[]; queryType: QueryType; source: string }> {
  const searchResults = await semanticSearch(query, {
    topK: 10,
    userId,
    minScore: 0.3,
    sources: routing.stores ? routing.stores.map((s) => `store_${s}`) : undefined,
  });

  return {
    results: searchResults,
    queryType: 'semantic',
    source: 'semantic_memory',
  };
}

async function executeHybridQuery(
  userId: string,
  query: string,
  routing: QueryRoutingDecision
): Promise<{ results: unknown[]; queryType: QueryType; source: string }> {
  // Run both in parallel
  const [structuredResults, semanticResults] = await Promise.all([
    executeStructuredQuery(userId, routing),
    executeSemanticQuery(userId, query, routing),
  ]);

  // Combine results (structured first, then semantic)
  return {
    results: [...structuredResults.results, ...semanticResults.results],
    queryType: 'hybrid',
    source: `${structuredResults.source}, ${semanticResults.source}`,
  };
}
