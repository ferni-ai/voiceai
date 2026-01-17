/**
 * Session-Level Handoff Tools Cache
 *
 * Caches handoff tools at the SESSION level so they're instantly available
 * during handoffs. Without this, each handoff waits for tool building which
 * can take 20+ seconds and cause timeouts.
 *
 * USAGE:
 *   // At session start (first agent creation):
 *   await warmupHandoffToolsForSession(sessionId, userProfile, tier, services);
 *
 *   // During handoff (instant!):
 *   const tools = getCachedHandoffTools(sessionId, currentAgentId);
 *
 * @module tools/handoff/session-cache
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import { buildHandoffTools, type BuildHandoffToolsOptions } from './handoff-factory.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface CachedHandoffToolSet {
  /** All handoff tools (unfiltered by current agent) */
  allTools: Record<string, unknown>;
  /** Tool count */
  toolCount: number;
  /** Agent IDs that have handoff tools */
  agentIds: string[];
  /** When the cache was built */
  builtAt: number;
  /** User's subscription tier at cache time */
  subscriptionTier: 'free' | 'friend' | 'partner';
}

// ============================================================================
// CACHE
// ============================================================================

// Session ID -> Cached handoff tools
const sessionCache = new Map<string, CachedHandoffToolSet>();

// Cache TTL - 30 minutes (session-scoped, so this is plenty)
const CACHE_TTL_MS = 30 * 60 * 1000;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Warmup handoff tools for a session.
 * Call this ONCE when the first agent is created.
 *
 * @param sessionId - Session ID
 * @param userProfile - User profile for unlock filtering
 * @param subscriptionTier - User's subscription tier
 * @param services - Session services (for dev mode bypass)
 */
export async function warmupHandoffToolsForSession(
  sessionId: string,
  userProfile: UserProfile | null | undefined,
  subscriptionTier: 'free' | 'friend' | 'partner' = 'free',
  services?: { devMode?: { enabled: boolean; bypassUnlocks: boolean } }
): Promise<void> {
  const startTime = Date.now();

  // Check if already cached and valid
  const existing = sessionCache.get(sessionId);
  if (existing && Date.now() - existing.builtAt < CACHE_TTL_MS) {
    log.debug(
      { sessionId, toolCount: existing.toolCount },
      '🔄 Handoff tools already cached for session'
    );
    return;
  }

  try {
    log.info({ sessionId }, '🔥 Warming up handoff tools for session...');

    // Build handoff tools WITHOUT filtering by current agent
    // This gives us all possible handoff tools for the session
    const { tools, toolCount, agentIds } = await buildHandoffTools({
      // Don't filter by current agent - we'll filter on retrieval
      currentAgentId: undefined,
      userProfile: userProfile ?? undefined,
      subscriptionTier,
      services,
    });

    // Cache the result
    sessionCache.set(sessionId, {
      allTools: tools,
      toolCount,
      agentIds,
      builtAt: Date.now(),
      subscriptionTier,
    });

    const elapsed = Date.now() - startTime;
    log.info(
      { sessionId, toolCount, agentIds, elapsedMs: elapsed },
      '✅ Handoff tools cached for session'
    );
  } catch (error) {
    log.error(
      { sessionId, error: String(error) },
      '❌ Failed to warmup handoff tools for session'
    );
    // Don't throw - allow session to continue without cached handoff tools
  }
}

/**
 * Get cached handoff tools for a session, filtered for the current agent.
 *
 * @param sessionId - Session ID
 * @param currentAgentId - Current agent ID (to exclude self-handoff)
 * @returns Cached tools or null if not cached
 */
export function getCachedHandoffTools(
  sessionId: string,
  currentAgentId: string
): Record<string, unknown> | null {
  const cached = sessionCache.get(sessionId);

  if (!cached) {
    log.debug({ sessionId }, '⚠️ No cached handoff tools for session');
    return null;
  }

  // Check TTL
  if (Date.now() - cached.builtAt > CACHE_TTL_MS) {
    log.debug({ sessionId }, '⚠️ Cached handoff tools expired');
    sessionCache.delete(sessionId);
    return null;
  }

  // Filter out the current agent's own handoff tool
  const filteredTools: Record<string, unknown> = {};
  const currentAgentToolName = `handoffTo${getFirstName(currentAgentId)}`;

  for (const [toolName, tool] of Object.entries(cached.allTools)) {
    // Exclude self-handoff tool
    if (toolName.toLowerCase() === currentAgentToolName.toLowerCase()) {
      continue;
    }
    filteredTools[toolName] = tool;
  }

  log.debug(
    { sessionId, currentAgentId, toolCount: Object.keys(filteredTools).length },
    '🔄 Retrieved cached handoff tools'
  );

  return filteredTools;
}

/**
 * Check if handoff tools are cached for a session.
 */
export function hasHandoffToolsCache(sessionId: string): boolean {
  const cached = sessionCache.get(sessionId);
  if (!cached) return false;
  if (Date.now() - cached.builtAt > CACHE_TTL_MS) {
    sessionCache.delete(sessionId);
    return false;
  }
  return true;
}

/**
 * Clear the handoff tools cache for a session.
 * Call this on session cleanup.
 */
export function clearHandoffToolsCache(sessionId: string): void {
  if (sessionCache.has(sessionId)) {
    sessionCache.delete(sessionId);
    log.debug({ sessionId }, '🧹 Cleared handoff tools cache for session');
  }
}

/**
 * Clear all cached handoff tools.
 * Useful for testing or when agents change.
 */
export function clearAllHandoffToolsCaches(): void {
  const count = sessionCache.size;
  sessionCache.clear();
  log.debug({ clearedSessions: count }, '🧹 Cleared all handoff tools caches');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the first name from an agent ID for tool name matching.
 * e.g., "peter-john" -> "Peter", "ferni" -> "Ferni"
 */
function getFirstName(agentId: string): string {
  const firstPart = agentId.split('-')[0];
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}
