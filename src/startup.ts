/**
 * Application Startup
 *
 * Unified startup sequence that works in all environments.
 * Initializes storage, cache, and services based on detected config.
 */

import { getConfig, printConfigSummary, validateConfig, type AppConfig } from './config/index.js';
import {
  initializeMemorySystem,
  shutdownMemorySystem,
  type MemorySystemResult,
} from './memory/index.js';
import { initializeFromBundles, listPersonas } from './personas/index.js';
import {
  initializeServices,
  shutdownServices,
  startProactiveScheduler,
  startReminderScheduler,
  stopProactiveScheduler,
  stopReminderScheduler,
} from './services/index.js';
import {
  initializeAllPersistence,
  shutdownAllPersistence,
} from './services/persistence/lifecycle.js';
import { initializeTeamHandlers, shutdownTools } from './tools/index.js';
import { getLogger } from './utils/safe-logger.js';

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
  const startupStart = Date.now();
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
  // CRITICAL: Skip persona indexing in production to avoid hanging on Google AI API calls
  // Persona indexing generates embeddings for all persona content which can take forever
  // In Cloud Run, this causes the agent to timeout during initialization
  const shouldIndexPersona = process.env.SKIP_PERSONA_INDEXING !== 'true' && config.environment !== 'production';
  logger.info({ indexPersona: shouldIndexPersona }, 'Initializing memory system...');
  const memStart = Date.now();
  memorySystem = await initializeMemorySystem({
    storeType: config.storage.type,
    enableRedis: config.cache.enabled,
    indexPersona: shouldIndexPersona,
  });
  logger.info(
    `✓ Memory: ${config.storage.type}${config.cache.enabled ? ' + Redis cache' : ''} (${Date.now() - memStart}ms)`
  );

  // Initialize services (prewarm)
  logger.info('Initializing services...');
  const svcStart = Date.now();
  await initializeServices(true);
  logger.info(`✓ Services ready (${Date.now() - svcStart}ms)`);

  // Initialize persona bundles
  logger.info('Loading persona bundles...');
  const bundleStart = Date.now();
  const bundleResult = await initializeFromBundles();
  if (bundleResult.errors.length > 0) {
    for (const error of bundleResult.errors) {
      logger.warn(`Bundle error: ${error}`);
    }
  }
  logger.info(`✓ Personas: ${bundleResult.loaded} bundles loaded (${Date.now() - bundleStart}ms)`);

  const allPersonas = listPersonas();
  logger.info(`  Available: ${allPersonas.join(', ')}`);

  // Start schedulers (synchronous, just sets up intervals)
  logger.info('Starting schedulers...');
  startReminderScheduler(60000); // Check every minute
  startProactiveScheduler({ checkIntervalMs: 300000 }); // Check every 5 minutes
  logger.info('✓ Schedulers running');

  // Start Intelligent Outreach Decision Engine
  // This powers "Better Than Human" proactive check-ins, commitment follow-ups,
  // and context-aware outreach based on conversation extractions
  logger.info('Starting Intelligent Outreach Engine...');
  try {
    const { startOutreachDecisionEngine } = await import('./services/outreach/decision-engine.js');
    startOutreachDecisionEngine();
    logger.info('✓ Intelligent Outreach Engine running');

    // Schedule daily outreach job (runs at 10am server time daily)
    // This evaluates all users for "Thinking of You" and growth reflection outreach
    const { processScheduledTriggers } = await import('./services/outreach/daily-outreach-job.js');

    // Run scheduled trigger check every 30 minutes
    setInterval(
      () => {
        processScheduledTriggers().catch((err) => {
          logger.debug({ error: String(err) }, 'Scheduled triggers check failed (non-fatal)');
        });
      },
      30 * 60 * 1000
    );
    logger.info('✓ Outreach trigger scheduler running (30min intervals)');
  } catch (outreachErr) {
    logger.warn(`Intelligent Outreach Engine startup failed (non-fatal): ${outreachErr}`);
  }

  // PARALLELIZED INITIALIZATION - Run independent operations concurrently
  // This significantly reduces cold start time
  logger.info('Initializing services in parallel...');
  const parallelStart = Date.now();

  const parallelInits = await Promise.allSettled([
    // Team handlers for cross-agent communication
    initializeTeamHandlers().then(() => {
      logger.info('✓ Team handlers ready');
      return 'team_handlers';
    }),

    // Community insights (collective learning)
    import('./intelligence/community-insights.js')
      .then(({ initializeCommunityInsights }) => initializeCommunityInsights())
      .then(() => {
        logger.info('✓ Community insights loaded');
        return 'community_insights';
      }),

    // Agent evolution (persona self-improvement)
    import('./intelligence/agent-evolution.js')
      .then(({ initializeAgentEvolution }) => initializeAgentEvolution())
      .then(() => {
        logger.info('✓ Agent evolution loaded');
        return 'agent_evolution';
      }),

    // Tool usage analytics
    import('./services/tool-usage-analytics.js')
      .then(({ toolUsageAnalytics }) => toolUsageAnalytics.initialize())
      .then(() => {
        logger.info('✓ Tool usage analytics ready');
        return 'tool_analytics';
      }),

    // Persistence services
    initializeAllPersistence().then(() => {
      logger.info('✓ Persistence services ready');
      return 'persistence';
    }),
  ]);

  logger.info(`Parallel init complete (${Date.now() - parallelStart}ms)`);

  // Log any failures (all are non-fatal)
  const failures = parallelInits.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    for (const failure of failures) {
      if (failure.status === 'rejected') {
        logger.warn(`Non-fatal init failure: ${failure.reason}`);
      }
    }
  }

  initialized = true;
  logger.info(`✅ Voice AI ready! (total startup: ${Date.now() - startupStart}ms)`);

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
      const { saveCommunityInsightsToFirestore } =
        await import('./intelligence/community-insights.js');
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

    // Shutdown all persistence services (flush all pending data)
    logger.info('Shutting down persistence services...');
    try {
      await shutdownAllPersistence();
      logger.info('✓ Persistence services shut down');
    } catch (error) {
      logger.warn(`Persistence shutdown failed (non-fatal): ${error}`);
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

  // CRITICAL: Never register signal handlers in child processes!
  // Child processes have process.send defined (IPC channel to parent).
  // Registering SIGTERM/SIGINT handlers in child processes interferes with
  // LiveKit's IPC communication and causes "runner initialization timed out" errors.
  // The parent process handles signals and coordinates shutdown of children.
  if (process.send) {
    process.stderr.write(
      `[STARTUP] Skipping shutdown handlers in child process pid=${process.pid}\n`
    );
    return;
  }

  const handleShutdown = async (signal: string) => {
    getLogger().info(`Received ${signal}, shutting down...`);
    await shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('SIGINT', () => void handleShutdown('SIGINT'));

  // NOTE: uncaughtException and unhandledRejection are handled more
  // gracefully in agents/shared/shutdown-handler.ts which:
  // - Doesn't immediately crash on first exception
  // - Monitors memory usage
  // - Only exits after multiple exceptions in short period
  // This handler is a fallback for non-agent processes.
  process.on('uncaughtException', (error) => {
    getLogger().error(`Uncaught exception: ${error}`);
    // Log with stack trace to stderr for Cloud Run visibility
    process.stderr.write(`[STARTUP] Uncaught exception: ${error}\n${(error as Error).stack}\n`);
    // Don't immediately exit - let the agent's handler decide
    // Only exit if this is clearly fatal (e.g., out of memory)
    const errorStr = String(error).toLowerCase();
    if (
      errorStr.includes('out of memory') ||
      errorStr.includes('heap out of memory') ||
      errorStr.includes('allocation failed')
    ) {
      getLogger().error('Fatal memory error, forcing shutdown');
      void shutdown().finally(() => process.exit(1));
    }
    // Otherwise, log and continue - agent's handler will track exception count
  });

  process.on('unhandledRejection', (reason) => {
    getLogger().error(`Unhandled rejection: ${reason}`);
    process.stderr.write(`[STARTUP] Unhandled rejection: ${reason}\n`);
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
