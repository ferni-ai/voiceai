/**
 * Session Continuity Cache
 *
 * Provides fast access to pre-hydrated memory capsule and manages
 * async enrichment from Spanner during the session.
 *
 * Flow:
 * 1. Session start: getMemoryCapsule() hydrates from Firestore → cache
 * 2. First turn: getCachedContinuity() returns fast capsule data
 * 3. Background: enrichFromSpanner() fetches deeper thread/anchor data
 * 4. Later turns: getEnrichedContinuity() returns full merged data
 * 5. Session end: clearSessionContinuity() cleans up
 *
 * @module memory/dynamic/session-continuity-cache
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { MemoryCapsule } from './memory-continuity.js';
import {
  retrieveContinuityBundle,
  type ContinuityBundle,
} from '../retrieval/hybrid-continuity-retrieval.js';

const log = createLogger({ module: 'SessionContinuityCache' });

// ============================================================================
// CACHE STORAGE
// ============================================================================

interface SessionContinuityState {
  /** Pre-hydrated Firestore capsule (fast path) */
  capsule: MemoryCapsule | null;
  /** Enriched bundle from Spanner (slow path, loaded async) */
  enrichedBundle: ContinuityBundle | null;
  /** Whether enrichment has been triggered */
  enrichmentStarted: boolean;
  /** Whether enrichment is complete */
  enrichmentComplete: boolean;
  /** Promise for pending enrichment */
  enrichmentPromise: Promise<ContinuityBundle> | null;
}

const sessionContinuityCache = new Map<string, SessionContinuityState>();

// ============================================================================
// CACHE ACCESSORS
// ============================================================================

/**
 * Get the cached memory capsule for a session (fast path, < 10ms)
 *
 * Call this on first turn for immediate continuity context.
 */
export function getCachedContinuity(sessionId: string): MemoryCapsule | null {
  // Try session-specific cache first
  const state = sessionContinuityCache.get(sessionId);
  if (state?.capsule) {
    return state.capsule;
  }

  // Fall back to globalThis storage (set by session-init-handler)
  const globalCapsule = (globalThis as Record<string, unknown>)[`memoryCapsule_${sessionId}`];
  if (globalCapsule) {
    // Migrate to proper cache
    const newState: SessionContinuityState = {
      capsule: globalCapsule as MemoryCapsule,
      enrichedBundle: null,
      enrichmentStarted: false,
      enrichmentComplete: false,
      enrichmentPromise: null,
    };
    sessionContinuityCache.set(sessionId, newState);
    return newState.capsule;
  }

  return null;
}

/**
 * Get enriched continuity bundle (may be slower on first call)
 *
 * If enrichment hasn't completed, returns capsule-based data.
 * After enrichment completes, returns full merged data from Spanner.
 */
export function getEnrichedContinuity(sessionId: string): ContinuityBundle | null {
  const state = sessionContinuityCache.get(sessionId);
  if (!state) return null;

  // Return enriched bundle if available
  if (state.enrichmentComplete && state.enrichedBundle) {
    return state.enrichedBundle;
  }

  // Fall back to capsule-based bundle
  if (state.capsule) {
    return capsuleToContinuityBundle(state.capsule);
  }

  return null;
}

/**
 * Convert a capsule to a ContinuityBundle (for fast-path fallback)
 */
function capsuleToContinuityBundle(capsule: MemoryCapsule): ContinuityBundle {
  return {
    rollingSummary: capsule.rollingSummary,
    activeThreads: capsule.activeThreads.map((t) => ({
      theme: t.theme,
      sessionCount: t.sessionCount,
      daysSinceLastUpdate: Math.floor(
        (Date.now() - new Date(t.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
      ),
      confidence: 0.6,
      relevanceScore: 0.5,
    })),
    topAnchors: capsule.topAnchors.map((a) => ({
      type: a.type,
      summary: a.summary,
      significance: a.significance,
      daysSinceCreated: 0,
      timesRecalled: 0,
      relevanceScore: 0.5,
    })),
    pendingTopics: capsule.pendingTopics,
    lastEmotionalState: capsule.lastEmotionalState,
    semanticMatches: [],
    metadata: {
      spannerAvailable: false,
      capsuleFound: true,
      retrievalTimeMs: 0,
      threadCount: capsule.activeThreads.length,
      anchorCount: capsule.topAnchors.length,
      semanticMatchCount: 0,
    },
  };
}

// ============================================================================
// ASYNC ENRICHMENT
// ============================================================================

/**
 * Trigger async enrichment from Spanner (call after first turn)
 *
 * This fetches deeper thread state and anchor data from Spanner
 * to enhance context for later turns in the session.
 */
export function enrichFromSpanner(
  sessionId: string,
  userId: string,
  currentContext?: string
): void {
  const state = sessionContinuityCache.get(sessionId);

  // Initialize state if not exists
  if (!state) {
    sessionContinuityCache.set(sessionId, {
      capsule: null,
      enrichedBundle: null,
      enrichmentStarted: true,
      enrichmentComplete: false,
      enrichmentPromise: null,
    });
  }

  const currentState = sessionContinuityCache.get(sessionId)!;

  // Skip if already started
  if (currentState.enrichmentStarted) {
    return;
  }

  currentState.enrichmentStarted = true;

  // Start async enrichment
  const enrichmentPromise = (async () => {
    try {
      const bundle = await retrieveContinuityBundle(userId, {
        currentContext,
        maxThreads: 10,
        maxAnchors: 10,
        minAnchorSignificance: 0.4,
        includeSemanticSearch: false,
      });

      currentState.enrichedBundle = bundle;
      currentState.enrichmentComplete = true;

      log.info(
        {
          sessionId,
          userId,
          threads: bundle.activeThreads.length,
          anchors: bundle.topAnchors.length,
          spannerAvailable: bundle.metadata.spannerAvailable,
        },
        '🔗 Session continuity enriched from Spanner'
      );

      return bundle;
    } catch (error) {
      log.warn({ error: String(error), sessionId }, 'Spanner enrichment failed');
      currentState.enrichmentComplete = true;
      throw error;
    }
  })();

  currentState.enrichmentPromise = enrichmentPromise;

  // Don't await - let it run in background
  enrichmentPromise.catch(() => {
    // Error already logged
  });
}

/**
 * Wait for enrichment to complete (for cases where you need full data)
 */
export async function waitForEnrichment(
  sessionId: string,
  timeoutMs = 5000
): Promise<ContinuityBundle | null> {
  const state = sessionContinuityCache.get(sessionId);
  if (!state) return null;

  if (state.enrichmentComplete) {
    return state.enrichedBundle;
  }

  if (!state.enrichmentPromise) {
    return state.capsule ? capsuleToContinuityBundle(state.capsule) : null;
  }

  try {
    return await Promise.race([
      state.enrichmentPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return state.capsule ? capsuleToContinuityBundle(state.capsule) : null;
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear session continuity cache (call on session end)
 */
export function clearSessionContinuity(sessionId: string): void {
  sessionContinuityCache.delete(sessionId);

  // Also clear globalThis storage
  delete (globalThis as Record<string, unknown>)[`memoryCapsule_${sessionId}`];

  log.debug({ sessionId }, 'Session continuity cache cleared');
}

/**
 * Get cache statistics for observability
 */
export function getContinuityCacheStats(): {
  activeSessions: number;
  enrichedSessions: number;
} {
  let enrichedSessions = 0;
  for (const state of sessionContinuityCache.values()) {
    if (state.enrichmentComplete && state.enrichedBundle) {
      enrichedSessions++;
    }
  }

  return {
    activeSessions: sessionContinuityCache.size,
    enrichedSessions,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { SessionContinuityState };
