/**
 * Unified Data Context Builder
 *
 * Pulls context from the unified data layer (stores + semantic memory)
 * to provide a complete picture of the user for LLM context injection.
 *
 * This builder bridges:
 * - Domain stores (productivity, financial, life-data)
 * - Semantic memory (RAG retrieval)
 *
 * Philosophy: The user shouldn't notice that their habits and savings goals
 * come from different storage systems. Everything should feel like one
 * coherent memory.
 *
 * @module intelligence/context-builders/memory/unified-data-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getUnifiedDataLayer } from '../../../services/data-layer/index.js';
import { BuilderCategory } from '../core/categories.js';
import { createHintInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';

const log = createLogger({ module: 'context:unified-data' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface UnifiedDataConfig {
  /** Max characters in context injection */
  maxContextLength: number;
  /** Whether to include structured summaries */
  includeStructuredSummary: boolean;
  /** Minimum turn to inject full context (avoid overwhelming first message) */
  minTurnForFullContext: number;
}

const config: UnifiedDataConfig = {
  maxContextLength: 1200,
  includeStructuredSummary: true,
  minTurnForFullContext: 1,
};

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build unified data context from stores and semantic memory
 */
async function buildUnifiedDataContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userData, persona } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userId;
  const turnCount = userData?.turnCount || 0;

  // Skip if no user identification
  if (!userId) {
    return [];
  }

  // On first turn, provide minimal context
  if (turnCount < config.minTurnForFullContext) {
    return [];
  }

  try {
    const dataLayer = getUnifiedDataLayer();

    // Get unified context summary
    const unified = await dataLayer.getUnifiedContext(userId);
    const { summary } = unified;

    // Only inject if there's meaningful data
    const hasData =
      summary.activeTaskCount > 0 ||
      summary.activeHabitCount > 0 ||
      summary.activeSavingsGoals > 0 ||
      summary.upcomingMilestones > 0;

    if (!hasData) {
      return [];
    }

    // Build summary injection (always present after first turn)
    if (config.includeStructuredSummary) {
      const summaryParts: string[] = [];

      if (summary.activeHabitCount > 0) {
        summaryParts.push(`${summary.activeHabitCount} active habits`);
      }
      if (summary.activeSavingsGoals > 0) {
        summaryParts.push(`${summary.activeSavingsGoals} savings goals`);
      }
      if (summary.upcomingMilestones > 0) {
        summaryParts.push(`${summary.upcomingMilestones} upcoming milestones`);
      }
      if (summary.openBillsCount > 0) {
        summaryParts.push(`${summary.openBillsCount} bills to pay`);
      }
      if (summary.activeTaskCount > 0) {
        summaryParts.push(`${summary.activeTaskCount} active tasks`);
      }

      if (summaryParts.length > 0) {
        injections.push(
          createHintInjection('user_data_summary', `[USER DATA: ${summaryParts.join(', ')}]`, {
            category: 'data',
          })
        );
      }
    }

    // Build semantic context if query suggests relevance
    const queryLower = userText.toLowerCase();
    const needsContext = /habit|routine|goal|saving|budget|money|milestone|plan|task|bill/i.test(
      queryLower
    );

    if (needsContext) {
      const context = await dataLayer.buildLLMContext(userId, userText, {
        maxLength: config.maxContextLength,
        includeStructured: true,
      });

      if (context.length > 0) {
        injections.push(
          createHintInjection('unified_data_context', `[RELEVANT USER DATA]\n${context}`, {
            category: 'data',
          })
        );
      }
    }

    // Add persona-specific context hints
    const personaId = persona?.id || 'ferni';
    const personaHints = getPersonaSpecificHints(personaId, unified);
    if (personaHints) {
      injections.push(
        createHintInjection('persona_data_hints', personaHints, { category: 'data' })
      );
    }

    log.debug(
      { userId, injectionCount: injections.length, turnCount },
      'Unified data context built'
    );

    return injections;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build unified data context');
    return [];
  }
}

// ============================================================================
// PERSONA-SPECIFIC HINTS
// ============================================================================

interface UnifiedContextSummary {
  productivity: unknown;
  financial: unknown;
  lifeData: unknown;
  summary: {
    activeTaskCount: number;
    activeHabitCount: number;
    activeSavingsGoals: number;
    upcomingMilestones: number;
    openBillsCount: number;
  };
}

/**
 * Generate persona-specific hints based on their domain
 */
function getPersonaSpecificHints(personaId: string, context: UnifiedContextSummary): string | null {
  const { summary } = context;

  switch (personaId) {
    case 'maya':
      // Maya cares about habits and financial wellness
      if (summary.activeHabitCount > 0 || summary.activeSavingsGoals > 0) {
        const hints: string[] = [];
        if (summary.activeHabitCount > 0) {
          hints.push(`tracking ${summary.activeHabitCount} habits`);
        }
        if (summary.activeSavingsGoals > 0) {
          hints.push(`working toward ${summary.activeSavingsGoals} savings goals`);
        }
        return `[MAYA CONTEXT: User is ${hints.join(' and ')}. Remember to celebrate progress!]`;
      }
      break;

    case 'jordan':
      // Jordan cares about milestones and life planning
      if (summary.upcomingMilestones > 0) {
        return `[JORDAN CONTEXT: User has ${summary.upcomingMilestones} upcoming life milestones. Focus on planning and coordination!]`;
      }
      break;

    case 'alex':
      // Alex cares about tasks and productivity
      if (summary.activeTaskCount > 0 || summary.openBillsCount > 0) {
        const hints: string[] = [];
        if (summary.activeTaskCount > 0) {
          hints.push(`${summary.activeTaskCount} active tasks`);
        }
        if (summary.openBillsCount > 0) {
          hints.push(`${summary.openBillsCount} bills pending`);
        }
        return `[ALEX CONTEXT: User has ${hints.join(', ')}. Help them stay organized!]`;
      }
      break;

    case 'peter':
      // Peter cares about research and financial analysis
      if (summary.activeSavingsGoals > 0) {
        return `[PETER CONTEXT: User has ${summary.activeSavingsGoals} savings goals. Consider investment and growth perspectives.]`;
      }
      break;

    case 'ferni':
    default:
      // Ferni gets a holistic view
      const total =
        summary.activeTaskCount +
        summary.activeHabitCount +
        summary.activeSavingsGoals +
        summary.upcomingMilestones;
      if (total > 0) {
        return `[FERNI CONTEXT: User is actively engaged - ${total} tracked items across habits, goals, and milestones. Be supportive of their journey.]`;
      }
      break;
  }

  return null;
}

// ============================================================================
// BUILDER REGISTRATION
// ============================================================================

const unifiedDataContextBuilder: ContextBuilder = {
  name: 'unified_data_context',
  category: BuilderCategory.MEMORY,
  description: 'Provides unified context from stores and semantic memory',
  priority: 65, // After basic memory but before advanced
  build: buildUnifiedDataContext,
};

// Register builder
registerContextBuilder(unifiedDataContextBuilder);

export { buildUnifiedDataContext, unifiedDataContextBuilder };
