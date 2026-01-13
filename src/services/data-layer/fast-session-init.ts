/**
 * Fast Session Initialization
 *
 * Replaces the slow waterfall session initialization with a fast, parallelized approach.
 * Only loads what's absolutely critical synchronously, everything else loads in background.
 *
 * OLD (waterfall - ~500-800ms):
 *   profile → lastContext → intelligence → insights → socialGraph → trust → optimizations
 *
 * NEW (parallel - ~100-200ms):
 *   BLOCKING: profile only (~100ms)
 *   BACKGROUND: everything else (non-blocking)
 *
 * @module services/data-layer/fast-session-init
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getIntelligentLoader, cleanupLoader } from './intelligent-loader.js';
import { pruneProfileOnSessionEnd } from './profile-pruning.js';
import { clearUserCaches, startCacheCleanup } from './memory-cache-manager.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = createLogger({ module: 'FastSessionInit' });

// ============================================================================
// TYPES
// ============================================================================

export interface FastSessionResult {
  userId: string;
  sessionId: string;
  profile: UserProfile | null;
  isReturningUser: boolean;
  initTimeMs: number;
  backgroundTasksStarted: string[];
}

export interface SessionEndResult {
  userId: string;
  sessionId: string;
  profilePruned: boolean;
  itemsPruned: number;
  cachesCleared: number;
  durationMs: number;
}

// ============================================================================
// FAST SESSION START
// ============================================================================

/**
 * Fast session initialization - only blocks on profile load
 * Everything else loads in background
 */
export async function fastSessionStart(
  userId: string,
  sessionId: string,
  options: {
    userName?: string;
    personaId?: string;
  } = {}
): Promise<FastSessionResult> {
  const startTime = performance.now();
  const backgroundTasks: string[] = [];

  log.info(
    {
      userId,
      sessionId,
      personaId: options.personaId,
    },
    '🚀 Fast session start initiated'
  );

  // Start cache cleanup if not already running
  startCacheCleanup(60_000);

  // ============================================================================
  // BLOCKING: Load ONLY the user profile (critical for personalization)
  // ============================================================================

  let profile: UserProfile | null = null;
  let isReturningUser = false;

  try {
    const { getStore } = await import('../../memory/store-factory.js');
    const store = await getStore();

    profile = await store.getProfile(userId);

    if (!profile && options.userName) {
      // Create new profile for new users
      const { createUserProfile } = await import('../../types/user-profile.js');
      profile = createUserProfile(userId, options.userName);
      await store.saveProfile(profile);
      log.info({ userId, name: options.userName }, '🆕 Created new user profile');
    }

    isReturningUser = profile ? profile.totalConversations > 0 : false;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to load profile during fast init');
  }

  // ============================================================================
  // NON-BLOCKING: Start intelligent loader for everything else
  // ============================================================================

  const loader = getIntelligentLoader(userId, sessionId);

  // Initialize loader (loads critical domains, starts background for others)
  loader.initializeSession().catch((err) => {
    log.warn({ error: String(err) }, 'Intelligent loader init error (non-blocking)');
  });
  backgroundTasks.push('intelligent_loader');

  // Initialize knowledge graph LLM capture (for ALL users - both new and returning)
  // This enables comprehensive entity/fact/relationship extraction via Gemini
  scheduleBackgroundTask('knowledge_capture', async () => {
    try {
      const { initializeKnowledgeCapture } = await import(
        '../../memory/knowledge-graph/services/knowledge-capture.js'
      );
      await initializeKnowledgeCapture();
      log.debug({ userId }, '🧠 Knowledge graph LLM capture initialized');
    } catch {
      // Non-critical - regex capture still works as fast fallback
    }
  });
  backgroundTasks.push('knowledge_capture');

  // ============================================================================
  // NON-BLOCKING: Start background enrichment tasks
  // ============================================================================

  // 🔧 NAME SYNC: If profile exists but name is null, extract from memories
  // This fixes the case where user told us their name but it wasn't persisted to profile
  if (profile && !profile.name) {
    scheduleBackgroundTask('name_sync', async () => {
      try {
        const { syncNameFromMemories } = await import('./name-sync.js');
        const extractedName = await syncNameFromMemories(userId, profile);
        if (extractedName && profile) {
          profile.name = extractedName;
          log.info({ userId, name: extractedName }, '✅ Name synced from memories to profile');
        }
      } catch {
        // Non-critical - name sync can fail silently
      }
    });
    backgroundTasks.push('name_sync');
  }

  if (isReturningUser && profile) {
    // Load last conversation context (for continuity)
    scheduleBackgroundTask('last_conversation', async () => {
      try {
        const { getLastConversationContext } = await import('../memory/realtime-memory.js');
        await getLastConversationContext(userId);
      } catch {
        // Non-critical
      }
    });
    backgroundTasks.push('last_conversation');

    // Load cross-persona insights
    scheduleBackgroundTask('cross_persona_insights', async () => {
      try {
        const { loadInsights } = await import('../cross-persona-insights.js');
        await loadInsights(userId);
      } catch {
        // Non-critical
      }
    });
    backgroundTasks.push('cross_persona_insights');

    // Load social graph
    scheduleBackgroundTask('social_graph', async () => {
      try {
        const { loadGraphFromFirestore } = await import('../social-graph/index.js');
        await loadGraphFromFirestore(userId);
      } catch {
        // Non-critical
      }
    });
    backgroundTasks.push('social_graph');

    // Initialize trust persistence
    scheduleBackgroundTask('trust_persistence', async () => {
      try {
        const { onSessionStart } = await import('../trust-systems/persistence.js');
        await onSessionStart(userId);
      } catch {
        // Non-critical
      }
    });
    backgroundTasks.push('trust_persistence');
  }

  const initTimeMs = Math.round(performance.now() - startTime);

  log.info(
    {
      userId,
      sessionId,
      isReturningUser,
      initTimeMs,
      backgroundTasks: backgroundTasks.length,
    },
    '✅ Fast session init complete (background tasks started)'
  );

  return {
    userId,
    sessionId,
    profile,
    isReturningUser,
    initTimeMs,
    backgroundTasksStarted: backgroundTasks,
  };
}

// ============================================================================
// SESSION END
// ============================================================================

/**
 * Clean session end - prunes profile, clears caches
 */
export async function fastSessionEnd(
  userId: string,
  sessionId: string
): Promise<SessionEndResult> {
  const startTime = performance.now();

  log.debug({ userId, sessionId }, '🔚 Fast session end initiated');

  // Cleanup intelligent loader
  cleanupLoader(userId, sessionId);

  // Clear user-specific caches
  const cachesCleared = clearUserCaches(userId);

  // Prune profile (remove old data, trim arrays)
  let profilePruned = false;
  let itemsPruned = 0;

  try {
    const result = await pruneProfileOnSessionEnd(userId);
    if (result) {
      profilePruned = result.profileModified;
      itemsPruned = result.totalPruned;
    }
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Profile pruning failed (non-blocking)');
  }

  const durationMs = Math.round(performance.now() - startTime);

  log.info(
    {
      userId,
      sessionId,
      profilePruned,
      itemsPruned,
      cachesCleared,
      durationMs,
    },
    '✅ Fast session end complete'
  );

  return {
    userId,
    sessionId,
    profilePruned,
    itemsPruned,
    cachesCleared,
    durationMs,
  };
}

// ============================================================================
// BACKGROUND TASK SCHEDULER
// ============================================================================

const backgroundTaskQueue = new Map<string, Promise<void>>();

/**
 * Schedule a background task (fire and forget, but tracked)
 */
function scheduleBackgroundTask(name: string, task: () => Promise<void>): void {
  const wrappedTask = task()
    .catch((error) => {
      log.debug({ task: name, error: String(error) }, 'Background task failed (non-critical)');
    })
    .finally(() => {
      backgroundTaskQueue.delete(name);
    });

  backgroundTaskQueue.set(name, wrappedTask);
}

/**
 * Wait for all background tasks to complete (for graceful shutdown)
 */
export async function waitForBackgroundTasks(timeoutMs = 5000): Promise<void> {
  if (backgroundTaskQueue.size === 0) return;

  log.info({ pending: backgroundTaskQueue.size }, 'Waiting for background tasks...');

  const tasks = Array.from(backgroundTaskQueue.values());

  try {
    await Promise.race([
      Promise.all(tasks),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Background tasks timeout')), timeoutMs)
      ),
    ]);
  } catch {
    log.warn({ pending: backgroundTaskQueue.size }, 'Background tasks timed out');
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING SESSION MANAGER
// ============================================================================

/**
 * Drop-in replacement for the old session profile loading
 * Use this in session-manager.ts to replace the waterfall
 */
export async function loadUserProfileFast(
  userId: string,
  sessionId: string,
  options: {
    userName?: string;
    personaId?: string;
    isReturningUser?: boolean;
  } = {}
): Promise<{
  profile: UserProfile | null;
  isReturningUser: boolean;
}> {
  const result = await fastSessionStart(userId, sessionId, options);

  return {
    profile: result.profile,
    isReturningUser: result.isReturningUser,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getIntelligentLoader };
