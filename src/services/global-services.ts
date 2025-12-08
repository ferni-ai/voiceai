/**
 * Global Services Management
 *
 * Handles initialization and access to globally shared services.
 * These services are shared across all sessions.
 */

import { getLogger } from '../utils/safe-logger.js';
import { initializeMemorySystem, getDefaultStore, getVectorStore } from '../memory/index.js';
import { setGlobalStore } from './user-identification.js';
import type { GlobalServices } from './types.js';
import { validateAndLog, type StartupCapabilities } from './startup-validation.js';
import { stopAllAutoSaves } from './intelligence-persistence.js';
import {
  initializeUnifiedPersistence,
  shutdownUnifiedPersistence,
} from './trust-systems/unified-persistence.js';

// ============================================================================
// GLOBAL STATE
// ============================================================================

let globalServices: GlobalServices | null = null;
let personaIndexed = false;
let startupCapabilities: StartupCapabilities | null = null;

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
 */
export async function getGlobalServices(): Promise<GlobalServices> {
  if (!globalServices) {
    // Don't re-index persona - it should have been done in prewarm
    return initializeServices(false);
  }
  return Promise.resolve(globalServices);
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

  // Flush and shutdown unified trust persistence
  try {
    await shutdownUnifiedPersistence();
  } catch {
    // Non-critical
  }

  globalServices = null;
  personaIndexed = false;
  startupCapabilities = null;
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
