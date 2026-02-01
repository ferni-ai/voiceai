/**
 * Application Startup
 *
 * Unified startup sequence that works in all environments.
 * Initializes storage, cache, and services based on detected config.
 */

import { getConfig, printConfigSummary, validateConfig, type AppConfig } from './config/index.js';
import { startBackgroundIndexing } from './memory/background-indexer.js';
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
import { registerInterval } from './utils/interval-manager.js';
import { recordStartupMetrics, startMetricsLogging } from './services/performance-metrics.js';
import { setupNativeCrashHandlers } from './utils/native-binding-guard.js';
import { onNativeBindingCrash } from './utils/transformers-loader.js';

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

  // Install native crash handlers (ONNX, Transformers.js, WASM)
  // This must happen early to catch crashes during initialization
  logger.info('Installing native crash handlers...');
  setupNativeCrashHandlers();
  onNativeBindingCrash(async (diagnostics) => {
    logger.error(
      {
        binding: diagnostics.bindingName,
        operation: diagnostics.operation,
        errorType: diagnostics.errorType,
        error: diagnostics.errorMessage,
        memoryMb: diagnostics.memoryUsageMb,
        recoveryAction: diagnostics.recoveryAction,
      },
      '🔴 Native binding crash detected'
    );

    // Record to crash analytics for dashboard visibility
    try {
      const { recordCrash } = await import('./agents/shared/crash-analytics.js');
      // Note: CrashContext doesn't have binding-specific fields, so we include details in the error message
      const errorMessage = [
        `[${diagnostics.bindingName}]`,
        diagnostics.errorMessage,
        `(op: ${diagnostics.operation}, recovery: ${diagnostics.recoveryAction})`,
        diagnostics.inputSummary ? `input: ${diagnostics.inputSummary}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      recordCrash(
        diagnostics.errorType === 'native_crash' ? 'uncaught_exception' : 'manual_report',
        new Error(errorMessage),
        undefined, // No session ID for native crashes
        {
          memoryUsageMb: diagnostics.memoryUsageMb,
        }
      );
    } catch {
      // Crash analytics not available yet
    }
  });
  logger.info('✓ Native crash handlers installed');

  // Initialize memory system (storage + cache)
  // OPTIMIZATION: Use lazy initialization for Firestore to reduce cold start time
  // The FirestoreStore now auto-initializes on first use, so we can skip the blocking init
  // This reduces startup from ~1100ms to ~400ms
  const shouldIndexPersona =
    process.env.SKIP_PERSONA_INDEXING !== 'true' && config.environment !== 'production';
  const isLazyInit = process.env.LAZY_FIRESTORE !== 'false'; // Default to lazy

  logger.info(
    { indexPersona: shouldIndexPersona, lazyInit: isLazyInit },
    'Initializing memory system...'
  );
  const memStart = Date.now();

  if (isLazyInit) {
    // Lazy mode: Create stores but don't connect to Firestore yet
    // Connection happens on first actual use (saves ~500ms in cold start)
    // NOTE: Redis is ENABLED even in lazy mode - it's independent of Firestore
    memorySystem = await initializeMemorySystem({
      storeType: config.storage.type,
      enableRedis: config.cache.enabled, // Redis can work independently of Firestore lazy init
      indexPersona: false, // Always skip in lazy mode
      skipFirestoreInit: true, // Skip Firestore init
      rehydrateConversations: false, // Skip rehydration - store not ready yet
    });
    logger.info(
      `✓ Memory: LAZY mode (${Date.now() - memStart}ms) - Firestore connects on first use`
    );
  } else {
    // Eager mode: Full initialization (original behavior)
    memorySystem = await initializeMemorySystem({
      storeType: config.storage.type,
      enableRedis: config.cache.enabled,
      indexPersona: shouldIndexPersona,
    });
    logger.info(
      `✓ Memory: ${config.storage.type}${config.cache.enabled ? ' + Redis cache' : ''} (${Date.now() - memStart}ms)`
    );
  }

  // Initialize Redis Pub/Sub for cross-instance communication
  // This enables cache invalidation broadcasts and real-time session events
  logger.info('Initializing Redis Pub/Sub...');
  const pubsubStart = Date.now();
  try {
    const { initializeRedisPubSub, subscribeToCacheInvalidation } =
      await import('./services/redis-pubsub.js');
    const pubsubReady = await initializeRedisPubSub();
    if (pubsubReady) {
      // Subscribe to cache invalidation events
      subscribeToCacheInvalidation(async (message) => {
        logger.debug(
          { cacheType: message.data.cacheType, keys: message.data.keys },
          'Cache invalidation received'
        );
        // Invalidations are handled by individual cache subscribers
      });
      logger.info(`✓ Redis Pub/Sub ready (${Date.now() - pubsubStart}ms)`);
    } else {
      logger.info(`✓ Redis Pub/Sub skipped (Redis not available)`);
    }
  } catch (pubsubErr) {
    logger.warn(`Redis Pub/Sub init failed (non-fatal): ${pubsubErr}`);
  }

  // Initialize services (prewarm)
  logger.info('Initializing services...');
  const svcStart = Date.now();
  await initializeServices(true);
  logger.info(`✓ Services ready (${Date.now() - svcStart}ms)`);

  // Initialize Session Data Manager (prevents memory leaks)
  // This tracks all user data caches and cleans them up on session end
  logger.info('Initializing Session Data Manager...');
  try {
    const { initializeSessionDataManager } = await import('./services/session-data-manager.js');
    initializeSessionDataManager({
      maxSessionAge: 4 * 60 * 60 * 1000, // 4 hours (safety net for orphaned sessions)
      evictionCheckInterval: 5 * 60 * 1000, // Check every 5 minutes
      memoryThresholdMB: 512, // Trigger cleanup if heap exceeds 512MB
      verbose: config.environment === 'development',
    });
    logger.info('✓ Session Data Manager ready (auto-eviction enabled)');
  } catch (sdmErr) {
    logger.warn(`Session Data Manager failed to initialize: ${sdmErr}`);
  }

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

  // Start background indexing (non-blocking, runs in background after startup)
  // This indexes persona content into the vector store without blocking startup
  if (memorySystem?.vectorStore) {
    logger.info('Starting background persona indexer...');
    void startBackgroundIndexing(memorySystem.vectorStore, {
      startDelayMs: 5000, // Wait 5s for server to stabilize
      concurrency: 2, // Limit concurrent embedding calls
    })
      .then(() => {
        logger.info('✓ Background persona indexing started (will complete async)');
      })
      .catch((err) => {
        logger.warn(`Background indexing failed to start (non-fatal): ${err}`);
      });
  }

  // Start schedulers (synchronous, just sets up intervals)
  logger.info('Starting schedulers...');
  startReminderScheduler(60000); // Check every minute
  startProactiveScheduler({ checkIntervalMs: 300000 }); // Check every 5 minutes

  // Start scheduled actions worker (for workflow routine reminders)
  try {
    const { startScheduledActionsWorker } =
      await import('./services/workflows/scheduled-actions.js');
    await startScheduledActionsWorker();
    logger.info('📅 Scheduled actions worker started');
  } catch (error) {
    logger.warn({ error: String(error) }, 'Failed to start scheduled actions worker');
  }

  // Start calendar trigger worker (for calendar-based workflow triggers)
  try {
    const { startCalendarTriggerWorker } =
      await import('./services/workflows/calendar-trigger-worker.js');
    startCalendarTriggerWorker();
    logger.info('📅 Calendar trigger worker started');
  } catch (error) {
    logger.warn({ error: String(error) }, 'Failed to start calendar trigger worker');
  }

  // Start scheduled outreach executor (for multiOutreach scheduled messages)
  try {
    const { startScheduledOutreachExecutor } =
      await import('./services/outreach/scheduled-outreach-executor.js');
    startScheduledOutreachExecutor({ pollIntervalMs: 60000 }); // Check every minute
    logger.info('✓ Scheduled outreach executor running');
  } catch (err) {
    logger.warn(`Scheduled outreach executor failed to start (non-fatal): ${err}`);
  }

  logger.info('✓ Schedulers running');

  // ============================================================================
  // BACKGROUND WORKERS (Phase 2 Scaling)
  // Start async event workers for trust/analytics processing
  // ============================================================================
  logger.info('Starting background workers...');
  const workerStart = Date.now();
  try {
    const { startAllWorkers } = await import('./workers/index.js');
    await startAllWorkers();
    logger.info(`✓ Background workers ready (${Date.now() - workerStart}ms)`);
  } catch (workerErr) {
    logger.warn(`Background workers failed to start (non-fatal): ${workerErr}`);
  }

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
    registerInterval(
      'outreach-trigger-scheduler',
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

  // Start Calendar Briefing Job (Morning notifications for users with calendars)
  // Alex delivers personalized morning briefings about upcoming meetings
  logger.info('Starting Calendar Briefing Job...');
  try {
    const { startCalendarBriefingJob } = await import('./tasks/scheduled/calendar-briefing-job.js');
    startCalendarBriefingJob();
    logger.info('✓ Calendar Briefing Job running (15min intervals)');
  } catch (briefingErr) {
    logger.warn(`Calendar Briefing Job startup failed (non-fatal): ${briefingErr}`);
  }

  // ============================================================================
  // SPLIT INITIALIZATION: Essential vs Deferred
  // Essential: Must complete before first session (team handlers, persistence)
  // Deferred: Can complete after first greeting (analytics, insights, evolution)
  // ============================================================================

  const parallelStart = Date.now();

  // ESSENTIAL: These must be ready for first session
  logger.info('Initializing essential services...');
  const essentialInits = await Promise.allSettled([
    // Team handlers for cross-agent communication (needed for handoffs)
    initializeTeamHandlers().then(() => {
      logger.info('✓ Team handlers ready');
      return 'team_handlers';
    }),

    // Persistence services (needed for user profile lookups)
    initializeAllPersistence().then(() => {
      logger.info('✓ Persistence services ready');
      return 'persistence';
    }),
  ]);

  logger.info(`Essential init complete (${Date.now() - parallelStart}ms)`);

  // DEFERRED: These run in background AFTER startup completes
  // This allows first greeting to happen ~150ms faster
  const deferredInit = async () => {
    const deferStart = Date.now();

    const deferredInits = await Promise.allSettled([
      // Community insights (collective learning) - not needed for first greeting
      import('./intelligence/community-insights.js')
        .then(({ initializeCommunityInsights }) => initializeCommunityInsights())
        .then(() => {
          logger.debug('✓ Community insights loaded (deferred)');
          return 'community_insights';
        }),

      // Collective learning scheduler - runs background aggregation jobs
      import('./intelligence/collective-learning-scheduler.js').then(
        ({ startCollectiveLearningScheduler }) => {
          startCollectiveLearningScheduler();
          logger.debug('✓ Collective learning scheduler started (deferred)');
          return 'collective_learning_scheduler';
        }
      ),

      // Agent evolution (persona self-improvement) - not needed for first greeting
      import('./intelligence/agent-evolution.js')
        .then(({ initializeAgentEvolution }) => initializeAgentEvolution())
        .then(() => {
          logger.debug('✓ Agent evolution loaded (deferred)');
          return 'agent_evolution';
        }),

      // Tool usage analytics - not needed for first greeting
      import('./services/analytics/tool-usage-analytics.js')
        .then(({ toolUsageAnalytics }) => toolUsageAnalytics.initialize())
        .then(() => {
          logger.debug('✓ Tool usage analytics ready (deferred)');
          return 'tool_analytics';
        }),

      // Predictive Intelligence ML system - not needed for first greeting
      // This initializes Markov chains, time series, and reinforcement learning
      import('./intelligence/predictive/index.js')
        .then(({ initializePredictiveIntelligence }) => initializePredictiveIntelligence())
        .then(() => {
          logger.debug('✓ Predictive Intelligence ML system ready (deferred)');
          return 'predictive_intelligence';
        }),

      // Smart Context Routing experiment setup (Phase 2 BTH Communication Overhaul)
      // Sets up A/B testing for ML-informed context selection
      import('./intelligence/context-routing/index.js')
        .then(({ setupSmartRoutingExperiment }) => setupSmartRoutingExperiment())
        .then(() => {
          logger.debug('✓ Smart Context Routing experiment ready (deferred)');
          return 'smart_context_routing';
        }),

      // Semantic Data Layer TTL Cleanup - run on startup to clear expired data
      // This ensures stale data is cleaned up after restarts
      import('./services/data-layer/ttl-cleanup.js').then(async ({ runTTLCleanup }) => {
        const result = await runTTLCleanup({ dryRun: false });
        logger.debug({ deletedCount: result.totalDeleted }, '✓ TTL cleanup completed (deferred)');
        return 'ttl_cleanup';
      }),
    ]);

    const failures = deferredInits.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      for (const failure of failures) {
        if (failure.status === 'rejected') {
          logger.warn(`Deferred init failure (non-fatal): ${failure.reason}`);
        }
      }
    }

    logger.debug(`Deferred init complete (${Date.now() - deferStart}ms)`);
  };

  // Fire-and-forget deferred initialization
  setTimeout(() => {
    deferredInit().catch((err) => {
      logger.warn(`Deferred initialization failed: ${err}`);
    });
  }, 100); // Small delay to let first session start

  // Log essential failures
  const essentialFailures = essentialInits.filter((r) => r.status === 'rejected');
  if (essentialFailures.length > 0) {
    for (const failure of essentialFailures) {
      if (failure.status === 'rejected') {
        logger.warn(`Essential init failure: ${failure.reason}`);
      }
    }
  }

  initialized = true;
  const totalStartupTime = Date.now() - startupStart;
  logger.info(`✅ Voice AI ready! (total startup: ${totalStartupTime}ms)`);

  // Record startup metrics for observability
  recordStartupMetrics([
    { name: 'config', durationMs: memStart - startupStart },
    { name: 'memory', durationMs: svcStart - memStart },
    { name: 'services', durationMs: bundleStart - svcStart },
    { name: 'personas', durationMs: workerStart - bundleStart },
    { name: 'workers', durationMs: parallelStart - workerStart },
    { name: 'essential', durationMs: Date.now() - parallelStart },
  ]);

  // Start periodic metrics logging (every 60s in production)
  if (config.environment === 'production') {
    startMetricsLogging(60_000);
  }

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

    // Stop scheduled actions worker
    try {
      const { stopScheduledActionsWorker } =
        await import('./services/workflows/scheduled-actions.js');
      stopScheduledActionsWorker();
    } catch {
      // Ignore if not running
    }

    // Stop calendar trigger worker
    try {
      const { stopCalendarTriggerWorker } =
        await import('./services/workflows/calendar-trigger-worker.js');
      stopCalendarTriggerWorker();
    } catch {
      // Ignore if not running
    }

    // Stop background workers
    logger.info('Stopping background workers...');
    try {
      const { stopAllWorkers } = await import('./workers/index.js');
      await stopAllWorkers();
      logger.info('✓ Background workers stopped');
    } catch (error) {
      logger.warn(`Background workers stop failed (non-fatal): ${error}`);
    }

    // Shutdown Redis Pub/Sub
    logger.info('Shutting down Redis Pub/Sub...');
    try {
      const { shutdownRedisPubSub } = await import('./services/redis-pubsub.js');
      await shutdownRedisPubSub();
      logger.info('✓ Redis Pub/Sub stopped');
    } catch (error) {
      logger.warn(`Redis Pub/Sub shutdown failed (non-fatal): ${error}`);
    }

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
      const { toolUsageAnalytics } = await import('./services/analytics/tool-usage-analytics.js');
      await toolUsageAnalytics.shutdown();
      logger.info('✓ Tool usage analytics flushed');
    } catch (error) {
      logger.warn(`Tool usage analytics flush failed (non-fatal): ${error}`);
    }

    // Shutdown Predictive Intelligence ML system (flush learned patterns)
    logger.info('Shutting down Predictive Intelligence...');
    try {
      const { shutdownPredictiveIntelligence } = await import('./intelligence/predictive/index.js');
      await shutdownPredictiveIntelligence();
      logger.info('✓ Predictive Intelligence shut down');
    } catch (error) {
      logger.warn(`Predictive Intelligence shutdown failed (non-fatal): ${error}`);
    }

    // Shutdown all persistence services (flush all pending data)
    logger.info('Shutting down persistence services...');
    try {
      await shutdownAllPersistence();
      logger.info('✓ Persistence services shut down');
    } catch (error) {
      logger.warn(`Persistence shutdown failed (non-fatal): ${error}`);
    }

    // Shutdown Session Data Manager (clears all user caches)
    logger.info('Shutting down Session Data Manager...');
    try {
      const { shutdownSessionDataManager } = await import('./services/session-data-manager.js');
      await shutdownSessionDataManager();
      logger.info('✓ Session Data Manager shut down');
    } catch (error) {
      logger.warn(`Session Data Manager shutdown failed (non-fatal): ${error}`);
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
