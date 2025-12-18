/**
 * Global Services Management
 *
 * Handles initialization and access to globally shared services.
 * These services are shared across all sessions.
 */

import { getDefaultStore, getVectorStore, initializeMemorySystem } from '../memory/index.js';
import { getLogger } from '../utils/safe-logger.js';
import { stopAllAutoSaves } from './intelligence-persistence.js';
import { validateAndLog, type StartupCapabilities } from './startup-validation.js';
import {
  initializeUnifiedPersistence,
  shutdownUnifiedPersistence,
} from './trust-systems/unified-persistence.js';
import type { GlobalServices } from './types.js';
import { setGlobalStore } from './user-identification.js';
// NOTE: session-manager imports are done dynamically to avoid circular dependency
// (session-manager.ts imports getGlobalServices from this file)

// ============================================================================
// GLOBAL STATE
// ============================================================================

let globalServices: GlobalServices | null = null;
let personaIndexed = false;
let startupCapabilities: StartupCapabilities | null = null;
// FIX: Cache initialization promise to prevent race conditions
let initializationPromise: Promise<GlobalServices> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize all global services
 * @param indexPersona - Whether to index persona content (expensive, should only do once)
 */
export async function initializeServices(indexPersona = true): Promise<GlobalServices> {
  if (globalServices?.initialized) {
    getLogger().info('Services already initialized');
    return globalServices;
  }

  getLogger().info('Initializing voice AI services...');

  // FIX: Validate startup configuration FIRST
  // This will fail loudly if critical config is missing in production
  try {
    startupCapabilities = validateAndLog({
      // In production, require persistent memory and semantic search
      // In development, just warn
      requirePersistentMemory: process.env.NODE_ENV === 'production',
      requireSemanticSearch: process.env.NODE_ENV === 'production',
    });

    getLogger().info(
      {
        persistentMemory: startupCapabilities.persistentMemory,
        semanticSearch: startupCapabilities.semanticSearch,
        storeType: startupCapabilities.storeType,
        embeddingProvider: startupCapabilities.embeddingProvider,
      },
      '✅ Startup validation passed'
    );
  } catch (validationError) {
    getLogger().error({ error: String(validationError) }, '❌ Startup validation failed');
    // Re-throw in production, warn in development
    if (process.env.NODE_ENV === 'production') {
      throw validationError;
    }
    getLogger().warn('Continuing with limited capabilities in development mode');
  }

  // Only index persona on first init, not on subsequent session creations
  const shouldIndexPersona = indexPersona && !personaIndexed;

  try {
    // Initialize memory system - only index persona if not already done
    const { store, vectorStore } = await initializeMemorySystem({
      indexPersona: shouldIndexPersona,
    });

    if (shouldIndexPersona) {
      personaIndexed = true;
      getLogger().info('Persona content indexed (first time)');
    }

    // CRITICAL: Configure user identification to use the proper store
    // This ensures user profiles are persisted to Firestore in production
    setGlobalStore(store);

    // Import all modules in parallel
    const [
      { initializeProductivityStore },
      { initializeBackgroundTasks },
      { initializeCollectiveLearning },
      { initializeMemoryManagement },
    ] = await Promise.all([
      import('./productivity-store.js'),
      import('./background-tasks.js'),
      import('./collective-learning-store.js'),
      import('./memory-management.js'),
    ]);

    // Initialize essential services in parallel (these are fast)
    const [productivityStore, backgroundTasks] = await Promise.all([
      initializeProductivityStore(),
      initializeBackgroundTasks(),
    ]);
    getLogger().info('📦 Productivity and background tasks initialized');

    // Initialize optional services (these do background Firestore loads)
    // They return immediately and load data in background
    const collectiveLearning = await initializeCollectiveLearning();
    await initializeMemoryManagement();
    getLogger().info('🧠 Collective learning and memory management initialized');

    // Initialize optimization persistence (tool analytics, feedback, patterns)
    try {
      const { optimizationPersistence } = await import('./optimization-persistence.js');
      await optimizationPersistence.initialize();
      getLogger().info('📊 Optimization persistence initialized');
    } catch (error) {
      getLogger().warn({ error }, 'Optimization persistence init skipped (non-critical)');
    }

    globalServices = {
      store,
      vectorStore,
      productivityStore,
      backgroundTasks,
      collectiveLearning,
      initialized: true,
    };

    // Initialize team handlers for cross-agent communication
    try {
      const { initializeTeamHandlers } = await import('../tools/index.js');
      await initializeTeamHandlers();
    } catch (error) {
      getLogger().warn({ error }, 'Team handlers initialization skipped');
    }

    // Initialize unified trust persistence (single source of truth for all trust data)
    try {
      initializeUnifiedPersistence();
      getLogger().info('🔒 Unified trust persistence initialized');
    } catch (error) {
      getLogger().warn({ error }, 'Unified trust persistence init skipped (non-critical)');
    }

    // TODO: Outreach system disabled - needs to be refactored into separate service
    // Loading 300k triggers on voice agent startup causes memory issues and slow cold starts.
    // Outreach should run as a separate Cloud Run worker or scheduled job.
    // See architectural discussion: separate voice agent from outreach worker.
    getLogger().info('📬 Proactive outreach system disabled (run separately)');
    // try {
    //   const { initializeOutreachSystem } = await import('./outreach/index.js');
    //   await initializeOutreachSystem();
    //   getLogger().info('📬 Proactive outreach system initialized');
    // } catch (error) {
    //   getLogger().warn({ error }, 'Outreach system init skipped (requires Twilio/SendGrid config)');
    // }

    // Start session cleanup to prevent orphaned session memory leaks
    // Dynamic import to avoid circular dependency with session-manager.ts
    try {
      const { startSessionCleanup } = await import('./session-manager.js');
      startSessionCleanup();
    } catch (cleanupErr) {
      getLogger().warn(
        { error: String(cleanupErr) },
        'Session cleanup init skipped (non-critical)'
      );
    }

    getLogger().info('Voice AI services initialized successfully');
    return globalServices;
  } catch (error) {
    getLogger().error(`Failed to initialize services: ${error}`);

    // Fallback - create with basic stores
    const fallbackStore = getDefaultStore();
    setGlobalStore(fallbackStore);

    // Still try to init productivity store in fallback
    let productivityStore;
    try {
      const { initializeProductivityStore } = await import('./productivity-store.js');
      productivityStore = await initializeProductivityStore();
    } catch {
      const { getProductivityStore } = await import('./productivity-store.js');
      productivityStore = getProductivityStore();
    }

    // Try to init background tasks in fallback
    let backgroundTasks;
    try {
      const { initializeBackgroundTasks } = await import('./background-tasks.js');
      backgroundTasks = await initializeBackgroundTasks();
    } catch {
      const { getBackgroundTaskService } = await import('./background-tasks.js');
      backgroundTasks = getBackgroundTaskService();
    }

    // Try to init collective learning in fallback
    let collectiveLearning;
    try {
      const { initializeCollectiveLearning } = await import('./collective-learning-store.js');
      collectiveLearning = await initializeCollectiveLearning();
    } catch {
      const { getCollectiveLearningStore } = await import('./collective-learning-store.js');
      collectiveLearning = getCollectiveLearningStore();
    }

    // Try to init memory management in fallback
    try {
      const { initializeMemoryManagement } = await import('./memory-management.js');
      await initializeMemoryManagement();
    } catch {
      getLogger().debug('Memory management init skipped in fallback');
    }

    globalServices = {
      store: fallbackStore,
      vectorStore: getVectorStore(),
      productivityStore,
      backgroundTasks,
      collectiveLearning,
      initialized: false,
    };

    return globalServices;
  }
}

/**
 * Get global services (initializes if needed, but skips persona indexing if already done)
 * FIX: Uses promise cache to prevent race conditions during concurrent initialization
 */
export async function getGlobalServices(): Promise<GlobalServices> {
  // Return existing services if already initialized
  if (globalServices) {
    return globalServices;
  }

  // Return cached promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization and cache the promise
  // Don't re-index persona - it should have been done in prewarm
  initializationPromise = initializeServices(false);

  try {
    const services = await initializationPromise;
    return services;
  } finally {
    // Clear the promise cache after completion (success or failure)
    initializationPromise = null;
  }
}

/**
 * Get global services synchronously (returns null if not initialized)
 */
export function getGlobalServicesSync(): GlobalServices | null {
  return globalServices;
}

/**
 * Reset global services (for testing)
 */
export async function resetGlobalServices(): Promise<void> {
  // Stop all auto-saves before resetting
  stopAllAutoSaves();

  // Stop session cleanup scheduler (dynamic import to avoid circular dependency)
  try {
    const { stopSessionCleanup } = await import('./session-manager.js');
    stopSessionCleanup();
  } catch {
    // Non-critical
  }

  // Flush and shutdown unified trust persistence
  try {
    await shutdownUnifiedPersistence();
  } catch {
    // Non-critical
  }

  // Flush all new persistence stores
  try {
    const { shutdownGoalOutreach } = await import('./goal-outreach-integration.js');
    await shutdownGoalOutreach();
  } catch {
    // Non-critical
  }

  try {
    const { shutdownCalendarReminders } = await import('./calendar-reminders.js');
    await shutdownCalendarReminders();
  } catch {
    // Non-critical
  }

  try {
    const { shutdownEngagementNotifications } = await import('./engagement-notifications.js');
    await shutdownEngagementNotifications();
  } catch {
    // Non-critical
  }

  try {
    const { shutdownReadingBetweenLines } =
      await import('./trust-systems/reading-between-lines.js');
    await shutdownReadingBetweenLines();
  } catch {
    // Non-critical
  }

  try {
    const { shutdownCelebrationMomentum } = await import('./trust-systems/celebration-momentum.js');
    await shutdownCelebrationMomentum();
  } catch {
    // Non-critical
  }

  try {
    const { shutdownMotivationalInterviewing } =
      await import('./therapeutic-frameworks/motivational-interviewing.js');
    await shutdownMotivationalInterviewing();
  } catch {
    // Non-critical
  }

  try {
    const { shutdownVoiceProsody } = await import('./trust-systems/voice-prosody-learning.js');
    await shutdownVoiceProsody();
  } catch {
    // Non-critical
  }

  try {
    const { shutdownCommunicationMirroringPersistence } =
      await import('../intelligence/communication-mirroring.js');
    await shutdownCommunicationMirroringPersistence();
  } catch {
    // Non-critical
  }

  try {
    const { shutdownTeamEngagementService } = await import('./team-engagement.js');
    await shutdownTeamEngagementService();
  } catch {
    // Non-critical
  }

  try {
    const { flushEventPlanningPersistence } = await import('../tools/domains/life-planning/event-planning.js');
    await flushEventPlanningPersistence();
  } catch {
    // Non-critical
  }

  // Shutdown proactive outreach system
  try {
    const { shutdownOutreachSystem } = await import('./outreach/index.js');
    shutdownOutreachSystem();
  } catch {
    // Non-critical
  }

  globalServices = null;
  personaIndexed = false;
  startupCapabilities = null;
  initializationPromise = null;
}

/**
 * Get startup capabilities (what features are available)
 */
export function getStartupCapabilities(): StartupCapabilities | null {
  return startupCapabilities;
}

/**
 * Mark persona as indexed (for external tracking)
 */
export function markPersonaIndexed(): void {
  personaIndexed = true;
}

/**
 * Check if persona has been indexed
 */
export function isPersonaIndexed(): boolean {
  return personaIndexed;
}
