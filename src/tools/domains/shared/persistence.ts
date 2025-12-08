/**
 * Shared Persistence Utilities for Domain Tools
 *
 * Provides consistent patterns for storing user data across all domain tools.
 * Uses the learning engine when available, with graceful fallback.
 *
 * USAGE:
 *   import { persistInsight, persistKeyMoment, persistTrackedItem } from '../shared/persistence.js';
 *
 *   execute: async ({ param }, { ctx: toolCtx }) => {
 *     await persistInsight(toolCtx, {
 *       domain: 'health',
 *       type: 'exercise_log',
 *       data: { activity: 'running', duration: 30 },
 *       confidence: 0.9,
 *     });
 *   }
 */

import { getLogger } from '../../../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool context with userData - matches the LiveKit agents pattern
 */
export interface ToolCtxWithUserData {
  userData?: {
    name?: string;
    keyMoments?: string[];
    topics?: string[];
    services?: {
      captureInsight?: (type: string, source: string, insight: string, confidence: number) => void;
      learningEngine?: {
        captureExternalKeyMoment: (moment: {
          id: string;
          timestamp: Date;
          type:
            | 'breakthrough'
            | 'milestone'
            | 'concern'
            | 'celebration'
            | 'decision'
            | 'shared_vulnerability';
          summary: string;
          emotionalWeight: 'light' | 'medium' | 'heavy';
          topics: string[];
        }) => void;
      };
      searchKnowledge?: (query: string) => Promise<string | null>;
    };
  };
}

export interface InsightData {
  domain: string;
  type: string;
  data: Record<string, unknown>;
  confidence?: number;
}

export interface KeyMomentData {
  domain: string;
  type:
    | 'breakthrough'
    | 'milestone'
    | 'concern'
    | 'celebration'
    | 'decision'
    | 'shared_vulnerability';
  summary: string;
  emotionalWeight?: 'light' | 'medium' | 'heavy';
  topics?: string[];
}

export interface TrackedItemData {
  domain: string;
  itemType: string;
  item: Record<string, unknown>;
  importance?: 'low' | 'medium' | 'high';
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Persist an insight to the learning engine
 * Use for facts, preferences, and learnings about the user
 */
export function persistInsight(toolCtx: ToolCtxWithUserData, insight: InsightData): boolean {
  const { services } = toolCtx.userData ?? {};

  if (!services?.captureInsight) {
    getLogger().debug(
      { domain: insight.domain, type: insight.type },
      'No captureInsight service available - insight not persisted'
    );
    return false;
  }

  try {
    const insightString = JSON.stringify(insight.data);
    services.captureInsight(
      insight.type,
      `${insight.domain}_${insight.type}`,
      insightString,
      insight.confidence ?? 0.7
    );

    getLogger().info(
      { domain: insight.domain, type: insight.type },
      'Insight persisted successfully'
    );
    return true;
  } catch (error) {
    getLogger().error({ error, domain: insight.domain }, 'Failed to persist insight');
    return false;
  }
}

/**
 * Persist a key moment to the learning engine
 * Use for significant events, milestones, decisions, breakthroughs
 */
export function persistKeyMoment(toolCtx: ToolCtxWithUserData, moment: KeyMomentData): boolean {
  const userData = toolCtx.userData ?? {};
  const { services } = userData;

  // Also store in session keyMoments for immediate availability
  if (!userData.keyMoments) {
    userData.keyMoments = [];
  }
  userData.keyMoments.push(`[${moment.domain}/${moment.type}] ${moment.summary}`);

  if (!services?.learningEngine) {
    getLogger().debug(
      { domain: moment.domain, type: moment.type },
      'No learningEngine service available - moment stored in session only'
    );
    return false;
  }

  try {
    services.learningEngine.captureExternalKeyMoment({
      id: `${moment.domain}_${moment.type}_${Date.now()}`,
      timestamp: new Date(),
      type: moment.type,
      summary: moment.summary,
      emotionalWeight: moment.emotionalWeight ?? 'medium',
      topics: moment.topics ?? [moment.domain],
    });

    getLogger().info(
      { domain: moment.domain, type: moment.type },
      'Key moment persisted successfully'
    );
    return true;
  } catch (error) {
    getLogger().error({ error, domain: moment.domain }, 'Failed to persist key moment');
    return false;
  }
}

/**
 * Persist a tracked item (exercise, job application, etc.)
 * Wraps as insight with structured data
 */
export function persistTrackedItem(toolCtx: ToolCtxWithUserData, item: TrackedItemData): boolean {
  const confidence = item.importance === 'high' ? 0.9 : item.importance === 'medium' ? 0.7 : 0.5;

  return persistInsight(toolCtx, {
    domain: item.domain,
    type: item.itemType,
    data: {
      ...item.item,
      timestamp: new Date().toISOString(),
    },
    confidence,
  });
}

/**
 * Add to session context (for awareness tools within same conversation)
 */
export function addToSessionContext(
  toolCtx: ToolCtxWithUserData,
  domain: string,
  key: string,
  value: unknown
): void {
  const userData = toolCtx.userData ?? {};

  if (!userData.keyMoments) {
    userData.keyMoments = [];
  }

  userData.keyMoments.push(`[${domain}:${key}] ${JSON.stringify(value)}`);
}

/**
 * Query past knowledge (if available)
 */
export async function queryPastKnowledge(
  toolCtx: ToolCtxWithUserData,
  query: string
): Promise<string | null> {
  const { services } = toolCtx.userData ?? {};

  if (!services?.searchKnowledge) {
    return null;
  }

  try {
    return await services.searchKnowledge(query);
  } catch (error) {
    getLogger().error({ error, query }, 'Failed to query past knowledge');
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  persistInsight,
  persistKeyMoment,
  persistTrackedItem,
  addToSessionContext,
  queryPastKnowledge,
};
