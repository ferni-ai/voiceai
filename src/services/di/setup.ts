/**
 * DI Container Setup
 *
 * Bootstraps all services through the DI container.
 * Provides a single entry point for service configuration.
 *
 * Usage:
 *   // In startup/prewarm
 *   await bootstrapServices();
 *
 *   // In tests
 *   await bootstrapServices({ useMocks: true });
 */

import { log } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { getContainer, Tokens, resetContainer } from './container.js';
import {
  registerUserIdentificationService,
  UserIdentificationToken,
} from './user-identification-di.js';
import type { GlobalServices } from '../types.js';

// ============================================================================
// BOOTSTRAP OPTIONS
// ============================================================================

export interface BootstrapOptions {
  /** Use mock implementations for testing */
  useMocks?: boolean;
  /** Index persona content (expensive, only do once) */
  indexPersona?: boolean;
  /** Skip team handler initialization */
  skipTeamHandlers?: boolean;
}

// ============================================================================
// SERVICE REGISTRATION
// ============================================================================

/**
 * Register core storage services
 */
async function registerStorageServices(useMocks: boolean = false): Promise<void> {
  const container = getContainer();

  if (useMocks) {
    // Register mock stores for testing
    const { InMemoryStore } = await import('../../memory/in-memory-store.js');
    const mockStore = new InMemoryStore();
    await mockStore.initialize();
    container.registerInstance(Tokens.MemoryStore, mockStore);

    const { VectorStore } = await import('../../memory/vector-store.js');
    const mockVectorStore = new VectorStore();
    container.registerInstance(Tokens.VectorStore, mockVectorStore);

    getLogger().info('Registered mock storage services');
  } else {
    // Register real stores - lazy loaded
    container.registerSingleton(Tokens.MemoryStore, async () => {
      const { initializeMemorySystem } = await import('../../memory/index.js');
      const { store } = await initializeMemorySystem({ indexPersona: false });
      return store;
    });

    container.registerSingleton(Tokens.VectorStore, async () => {
      const { getVectorStore } = await import('../../memory/index.js');
      return getVectorStore();
    });

    getLogger().info('Registered storage services');
  }
}

/**
 * Register application services
 */
async function registerApplicationServices(): Promise<void> {
  const container = getContainer();

  // User Identification Service
  registerUserIdentificationService(container);

  // Productivity Store
  container.registerSingleton(Tokens.ProductivityStore, async () => {
    const { initializeProductivityStore } = await import('../productivity-store.js');
    return initializeProductivityStore();
  });

  // Background Tasks
  container.registerSingleton(Tokens.BackgroundTasks, async () => {
    const { initializeBackgroundTasks } = await import('../background-tasks.js');
    return initializeBackgroundTasks();
  });

  // Collective Learning
  container.registerSingleton(Tokens.CollectiveLearning, async () => {
    const { initializeCollectiveLearning } = await import('../collective-learning-store.js');
    return initializeCollectiveLearning();
  });

  // Agent Bus
  container.registerSingleton(Tokens.AgentBus, async () => {
    const { getAgentBus } = await import('../agent-bus.js');
    return getAgentBus();
  });

  // Life Data Store
  container.registerSingleton(Tokens.LifeDataStore, async () => {
    const { getLifeDataStore } = await import('../life-data-store.js');
    return getLifeDataStore();
  });

  getLogger().info('Registered application services');
}

/**
 * Register scheduler services
 */
async function registerSchedulerServices(): Promise<void> {
  const container = getContainer();

  // Reminder Scheduler - use start function instead of getter
  container.registerSingleton(Tokens.ReminderScheduler, async () => {
    try {
      const { startReminderScheduler } = await import('../reminder-scheduler.js');
      return { start: startReminderScheduler };
    } catch {
      return null;
    }
  });

  // Proactive Scheduler
  container.registerSingleton(Tokens.ProactiveScheduler, async () => {
    const { getProactiveScheduler } = await import('../proactive-scheduler.js');
    return getProactiveScheduler();
  });

  getLogger().info('Registered scheduler services');
}

// ============================================================================
// BOOTSTRAP FUNCTION
// ============================================================================

/**
 * Bootstrap all services through DI container
 *
 * This is the single entry point for service initialization.
 * Call this during app startup or test setup.
 */
export async function bootstrapServices(options: BootstrapOptions = {}): Promise<void> {
  const { useMocks = false, skipTeamHandlers = false } = options;

  getLogger().info({ useMocks, skipTeamHandlers }, 'Bootstrapping services via DI...');

  // Register all services
  await registerStorageServices(useMocks);
  await registerApplicationServices();
  await registerSchedulerServices();

  // Initialize team handlers unless skipped
  if (!skipTeamHandlers && !useMocks) {
    try {
      const { initializeTeamHandlers } = await import('../../tools/index.js');
      await initializeTeamHandlers();
      getLogger().info('Team handlers initialized');
    } catch (error) {
      getLogger().warn({ error: String(error) }, 'Team handlers initialization skipped');
    }
  }

  getLogger().info('DI bootstrap complete');
}

/**
 * Reset DI container and clear all registrations
 * Use in tests to get a clean slate
 */
export async function resetServices(): Promise<void> {
  resetContainer();
  getLogger().info('DI container reset');
}

// ============================================================================
// CONVENIENCE RESOLVERS
// ============================================================================

/**
 * Resolve MemoryStore from container
 */
export async function resolveMemoryStore() {
  const container = getContainer();
  return container.resolve(Tokens.MemoryStore);
}

/**
 * Resolve VectorStore from container
 */
export async function resolveVectorStore() {
  const container = getContainer();
  return container.resolve(Tokens.VectorStore);
}

/**
 * Resolve ProductivityStore from container
 */
export async function resolveProductivityStore() {
  const container = getContainer();
  return container.resolve(Tokens.ProductivityStore);
}

/**
 * Resolve AgentBus from container
 */
export async function resolveAgentBus() {
  const container = getContainer();
  return container.resolve(Tokens.AgentBus);
}

/**
 * Get GlobalServices-compatible object from DI container
 * For backward compatibility with existing code
 */
export async function getServicesFromDI(): Promise<GlobalServices> {
  const container = getContainer();

  // Resolve services - they may be async factories
  const storeResult = container.resolve(Tokens.MemoryStore);
  const vectorStoreResult = container.resolve(Tokens.VectorStore);
  const productivityStoreResult = container.resolve(Tokens.ProductivityStore);
  const backgroundTasksResult = container.resolve(Tokens.BackgroundTasks);
  const collectiveLearningResult = container.resolve(Tokens.CollectiveLearning);

  // Await if they're promises
  const [store, vectorStore, productivityStore, backgroundTasks, collectiveLearning] =
    await Promise.all([
      Promise.resolve(storeResult),
      Promise.resolve(vectorStoreResult),
      Promise.resolve(productivityStoreResult),
      Promise.resolve(backgroundTasksResult),
      Promise.resolve(collectiveLearningResult),
    ]);

  return {
    store: store as GlobalServices['store'],
    vectorStore: vectorStore as GlobalServices['vectorStore'],
    productivityStore: productivityStore as GlobalServices['productivityStore'],
    backgroundTasks: backgroundTasks as GlobalServices['backgroundTasks'],
    collectiveLearning: collectiveLearning as GlobalServices['collectiveLearning'],
    initialized: true,
  };
}

