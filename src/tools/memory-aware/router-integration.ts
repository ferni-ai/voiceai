/**
 * Semantic Router Memory Integration
 *
 * Enhances tool routing with memory context for smarter tool selection.
 *
 * @module tools/memory-aware/router-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { StoredMemory } from '../../memory/unified-store/types.js';
import type { MemoryAwareToolContext, ToolMemoryContext } from './types.js';

const log = createLogger({ module: 'MemoryRouterIntegration' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Memory-enhanced routing context
 */
export interface MemoryEnhancedRoutingContext {
  /** Original user query */
  query: string;

  /** User's key topics from memory */
  userTopics: string[];

  /** Recent topics from conversation */
  recentTopics: string[];

  /** Important people from memory */
  importantPeople: string[];

  /** Active commitments count */
  activeCommitments: number;

  /** User's trust level */
  trustLevel?: 'new' | 'developing' | 'established' | 'deep';

  /** Session depth */
  sessionDepth: 'shallow' | 'moderate' | 'deep';

  /** Relevant memories for this query */
  relevantMemories: StoredMemory[];
}

/**
 * Tool priority adjustment from memory
 */
export interface ToolPriorityAdjustment {
  /** Tool name */
  toolName: string;

  /** Adjustment amount (-1 to 1) */
  adjustment: number;

  /** Reason for adjustment */
  reason: string;
}

// ============================================================================
// ROUTING ENHANCEMENT
// ============================================================================

/**
 * Build memory-enhanced routing context
 */
export async function buildRoutingContext(
  query: string,
  memoryContext: ToolMemoryContext,
  options?: {
    maxRelevantMemories?: number;
  }
): Promise<MemoryEnhancedRoutingContext> {
  const maxRelevant = options?.maxRelevantMemories ?? 5;

  try {
    // Get relevant memories for this query
    const relevantResult = await memoryContext.recall({
      query,
      limit: maxRelevant,
    });

    // Get user's key topics
    const allMemories = await memoryContext.recall({ limit: 100 });
    const topicCounts = new Map<string, number>();
    for (const mem of allMemories.memories) {
      for (const topic of mem.topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }
    const userTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);

    // Get important people
    const peopleCounts = new Map<string, number>();
    for (const mem of allMemories.memories) {
      for (const person of mem.peopleMentioned) {
        peopleCounts.set(person, (peopleCounts.get(person) || 0) + 1);
      }
    }
    const importantPeople = [...peopleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([person]) => person);

    // Get commitments count
    const commitments = await memoryContext.getCommitments(true);

    return {
      query,
      userTopics,
      recentTopics: [], // Would come from conversation context
      importantPeople,
      activeCommitments: commitments.length,
      sessionDepth: 'moderate', // Would come from session context
      relevantMemories: relevantResult.memories,
    };
  } catch (error) {
    log.error({ error, query }, 'Failed to build routing context');
    return {
      query,
      userTopics: [],
      recentTopics: [],
      importantPeople: [],
      activeCommitments: 0,
      sessionDepth: 'shallow',
      relevantMemories: [],
    };
  }
}

/**
 * Calculate tool priority adjustments based on memory context
 */
export function calculateToolAdjustments(
  routingContext: MemoryEnhancedRoutingContext
): ToolPriorityAdjustment[] {
  const adjustments: ToolPriorityAdjustment[] = [];

  // 1. Boost commitment-related tools if user has active commitments
  if (routingContext.activeCommitments > 0) {
    adjustments.push({
      toolName: 'check_commitments',
      adjustment: 0.3,
      reason: `User has ${routingContext.activeCommitments} active commitments`,
    });
    adjustments.push({
      toolName: 'track_commitment',
      adjustment: 0.2,
      reason: 'User actively tracks commitments',
    });
  }

  // 2. Boost person-related tools if query mentions known people
  const queryLower = routingContext.query.toLowerCase();
  for (const person of routingContext.importantPeople) {
    if (queryLower.includes(person.toLowerCase())) {
      adjustments.push({
        toolName: 'recall_person',
        adjustment: 0.4,
        reason: `Query mentions known person: ${person}`,
      });
      break;
    }
  }

  // 3. Boost topic-specific tools based on user's interests
  const topicToolMap: Record<string, string[]> = {
    career: ['career_advice', 'goal_setting'],
    health: ['habit_tracking', 'wellness_check'],
    relationships: ['relationship_insight', 'recall_person'],
    finance: ['budget_review', 'financial_planning'],
  };

  for (const topic of routingContext.userTopics) {
    const relatedTools = topicToolMap[topic.toLowerCase()];
    if (relatedTools) {
      for (const tool of relatedTools) {
        adjustments.push({
          toolName: tool,
          adjustment: 0.15,
          reason: `User has interest in ${topic}`,
        });
      }
    }
  }

  // 4. Reduce priority of tools user has deflected (from relevant memories)
  const deflectedTools = routingContext.relevantMemories
    .filter((m) => m.metadata?.userDeflected === true)
    .flatMap((m) => (m.metadata?.toolUsed as string[]) || []);

  for (const tool of deflectedTools) {
    adjustments.push({
      toolName: tool,
      adjustment: -0.3,
      reason: 'User previously deflected this tool',
    });
  }

  // 5. Adjust based on session depth
  if (routingContext.sessionDepth === 'deep') {
    adjustments.push({
      toolName: 'deep_reflection',
      adjustment: 0.25,
      reason: 'Deep conversation, user may be ready for reflection',
    });
  } else if (routingContext.sessionDepth === 'shallow') {
    adjustments.push({
      toolName: 'quick_check_in',
      adjustment: 0.2,
      reason: 'Shallow conversation, keep tools light',
    });
  }

  return adjustments;
}

/**
 * Apply priority adjustments to tool scores
 */
export function applyAdjustments(
  toolScores: Map<string, number>,
  adjustments: ToolPriorityAdjustment[]
): Map<string, number> {
  const adjusted = new Map(toolScores);

  for (const adjustment of adjustments) {
    const currentScore = adjusted.get(adjustment.toolName) ?? 0;
    const newScore = Math.max(0, Math.min(1, currentScore + adjustment.adjustment));
    adjusted.set(adjustment.toolName, newScore);
  }

  return adjusted;
}

/**
 * Get top tools after memory-enhanced routing
 */
export async function getMemoryEnhancedTopTools(
  query: string,
  baseToolScores: Map<string, number>,
  memoryContext: ToolMemoryContext,
  limit: number = 5
): Promise<Array<{ tool: string; score: number; memoryBoost: number }>> {
  // Build routing context
  const routingContext = await buildRoutingContext(query, memoryContext);

  // Calculate adjustments
  const adjustments = calculateToolAdjustments(routingContext);

  // Apply adjustments
  const adjustedScores = applyAdjustments(baseToolScores, adjustments);

  // Sort and return top tools
  const results = [...adjustedScores.entries()]
    .map(([tool, score]) => {
      const baseScore = baseToolScores.get(tool) ?? 0;
      return {
        tool,
        score,
        memoryBoost: score - baseScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  log.debug({
    query,
    topTools: results.map((r) => r.tool),
    adjustmentsApplied: adjustments.length,
  }, 'Memory-enhanced tool routing complete');

  return results;
}
