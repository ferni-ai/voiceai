/**
 * Application Startup
 *
 * Unified startup sequence that works in all environments.
 * Initializes storage, cache, and services based on detected config.
 */

import { getLogger } from './utils/safe-logger.js';
import { getConfig, validateConfig, printConfigSummary, type AppConfig } from './config/index.js';
import {
  initializeMemorySystem,
  shutdownMemorySystem,
  type MemorySystemResult,
} from './memory/index.js';
import {
  initializeServices,
  shutdownServices,
  startReminderScheduler,
  stopReminderScheduler,
  startProactiveScheduler,
  stopProactiveScheduler,
} from './services/index.js';
import { initializeFromBundles, listPersonas } from './personas/index.js';
import { initializeTeamHandlers, shutdownTools } from './tools/index.js';

// ============================================================================
// STATE
// ============================================================================

let initialized = false;
let memorySystem: MemorySystemResult | null = null;

// ============================================================================
// STARTUP
// ============================================================================

/**
 * Initialize the application
 * Call this before starting the agent
 */
export async function startup(): Promise<AppConfig> {
  if (initialized) {
    getLogger().warn('Application already initialized');
    return getConfig();
  }

  const logger = getLogger();
  logger.info('🚀 Starting Voice AI...');

  // Load and validate configuration
  const config = getConfig();
  printConfigSummary(config);

  const validation = validateConfig(config);

  if (!validation.valid) {
    for (const error of validation.errors) {
      logger.error(`❌ ${error}`);
    }
    throw new Error(`Configuration invalid: ${validation.errors.join(', ')}`);
  }

  for (const warning of validation.warnings) {
    logger.warn(`⚠️  ${warning}`);
  }

  // Initialize memory system (storage + cache)
  logger.info('Initializing memory system...');
  memorySystem = await initializeMemorySystem({
    storeType: config.storage.type,
    enableRedis: config.cache.enabled,
    indexPersona: true,
  });

  logger.info(`✓ Memory: ${config.storage.type}${config.cache.enabled ? ' + Redis cache' : ''}`);

  // Initialize services (prewarm)
  logger.info('Initializing services...');
  await initializeServices(true);
  logger.info('✓ Services ready');

  // Initialize persona bundles
  logger.info('Loading persona bundles...');
  const bundleResult = await initializeFromBundles();
  if (bundleResult.errors.length > 0) {
    for (const error of bundleResult.errors) {
      logger.warn(`Bundle error: ${error}`);
    }
  }
  logger.info(`✓ Personas: ${bundleResult.loaded} bundles loaded`);

  const allPersonas = listPersonas();
  logger.info(`  Available: ${allPersonas.join(', ')}`);

  // Start reminder scheduler (for Alex's communication features)
  logger.info('Starting reminder scheduler...');
  startReminderScheduler(60000); // Check every minute
  logger.info('✓ Reminder scheduler running');

  // Start proactive scheduler (for proactive insights and check-ins)
  logger.info('Starting proactive scheduler...');
  startProactiveScheduler({
    checkIntervalMs: 300000, // Check every 5 minutes
  });
  logger.info('✓ Proactive scheduler running');

  // Initialize team handlers for cross-agent communication
  logger.info('Initializing team handlers...');
  await initializeTeamHandlers();
  logger.info('✓ Team handlers ready (Ferni, Jack, Peter, Alex, Maya, Jordan)');

  // Initialize community insights (collective learning across users)
  logger.info('Loading community insights...');
  try {
    const { initializeCommunityInsights } = await import('./intelligence/community-insights.js');
    await initializeCommunityInsights();
    logger.info('✓ Community insights loaded');
  } catch (error) {
    logger.warn(`Community insights load failed (non-fatal): ${error}`);
  }

  // Initialize agent evolution (persona self-improvement)
  logger.info('Loading agent evolution states...');
  try {
    const { initializeAgentEvolution } = await import('./intelligence/agent-evolution.js');
    await initializeAgentEvolution();
    logger.info('✓ Agent evolution loaded');
  } catch (error) {
    logger.warn(`Agent evolution load failed (non-fatal): ${error}`);
  }

  // Initialize tool usage analytics (for optimization)
  logger.info('Initializing tool usage analytics...');
  try {
    const { toolUsageAnalytics } = await import('./services/tool-usage-analytics.js');
    await toolUsageAnalytics.initialize();
    logger.info('✓ Tool usage analytics ready');
  } catch (error) {
    logger.warn(`Tool usage analytics init failed (non-fatal): ${error}`);
  }

  initialized = true;
  logger.info('✅ Voice AI ready!');

  return config;
}

/**
 * Gracefully shut down the application
 */
export async function shutdown(): Promise<void> {
  if (!initialized) {
    return;
  }

  const logger = getLogger();
  logger.info('Shutting down Voice AI...');

  try {
    // Stop schedulers
    stopReminderScheduler();
    stopProactiveScheduler();

    // Save community insights before shutdown
    logger.info('Saving community insights...');
    try {
      const { saveCommunityInsightsToFirestore } = await import('./intelligence/community-insights.js');
      await saveCommunityInsightsToFirestore();
      logger.info('✓ Community insights saved');
    } catch (error) {
      logger.warn(`Community insights save failed (non-fatal): ${error}`);
    }

    // Save agent evolution states before shutdown
    logger.info('Saving agent evolution states...');
    try {
      const { saveAgentEvolutionToFirestore } = await import('./intelligence/agent-evolution.js');
      await saveAgentEvolutionToFirestore();
      logger.info('✓ Agent evolution saved');
    } catch (error) {
      logger.warn(`Agent evolution save failed (non-fatal): ${error}`);
    }

    // Flush tool usage analytics before shutdown
    logger.info('Flushing tool usage analytics...');
    try {
      const { toolUsageAnalytics } = await import('./services/tool-usage-analytics.js');
      await toolUsageAnalytics.shutdown();
      logger.info('✓ Tool usage analytics flushed');
    } catch (error) {
      logger.warn(`Tool usage analytics flush failed (non-fatal): ${error}`);
    }

    // Cleanup team handlers and tool services
    await shutdownTools();

    await shutdownServices();
    await shutdownMemorySystem();
    logger.info('✓ Shutdown complete');
  } catch (error) {
    logger.error(`Shutdown error: ${error}`);
  }

  initialized = false;
  memorySystem = null;
}

/**
 * Check if application is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Get memory system (for advanced usage)
 */
export function getMemorySystem(): MemorySystemResult | null {
  return memorySystem;
}

// ============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// ============================================================================

let shutdownHandlersRegistered = false;

export function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return;

  const handleShutdown = async (signal: string) => {
    getLogger().info(`Received ${signal}, shutting down...`);
    await shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  process.on('uncaughtException', async (error) => {
    getLogger().error(`Uncaught exception: ${error}`);
    await shutdown();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    getLogger().error(`Unhandled rejection: ${reason}`);
    // Don't exit for unhandled rejections, just log
  });

  shutdownHandlersRegistered = true;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startup,
  shutdown,
  isInitialized,
  getMemorySystem,
  registerShutdownHandlers,
};
