/**
 * Persistence Lifecycle Management
 *
 * Central orchestration for all persisted services:
 * - Startup initialization and rehydration
 * - Graceful shutdown with data flush
 * - Signal handling for clean exit
 *
 * Call initializeAllPersistence() at app startup.
 * Call shutdownAllPersistence() at app shutdown (or let signal handlers do it).
 *
 * @module PersistenceLifecycle
 */

import { createLogger } from '../../utils/safe-logger.js';
import { initializePersistence, shutdownPersistence, getAllStats } from './index.js';

const log = createLogger({ module: 'PersistenceLifecycle' });

// Track initialization state
let isInitialized = false;
let isShuttingDown = false;

// ============================================================================
// SERVICE IMPORTS (lazy to avoid circular deps)
// ============================================================================

type ServiceInitFn = () => Promise<void>;
type ServiceShutdownFn = () => Promise<void>;

interface ServiceConfig {
  name: string;
  initialize: ServiceInitFn;
  shutdown: ServiceShutdownFn;
  critical: boolean; // If true, failure prevents startup
}

async function getServices(): Promise<ServiceConfig[]> {
  // Import services dynamically to avoid circular dependencies
  const services: ServiceConfig[] = [];

  // Push Notifications
  try {
    const { getPushNotificationsService, shutdownPushNotificationsService } = await import(
      '../push-notifications.js'
    );
    services.push({
      name: 'push-notifications',
      initialize: async () => {
        await getPushNotificationsService();
      },
      shutdown: shutdownPushNotificationsService,
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Push notifications service not available');
  }

  // Outreach Intelligence
  try {
    const { initializeOutreachPersistence, shutdownOutreachPersistence } = await import(
      '../outreach-intelligence.js'
    );
    services.push({
      name: 'outreach-intelligence',
      initialize: initializeOutreachPersistence,
      shutdown: shutdownOutreachPersistence,
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Outreach intelligence service not available');
  }

  // Team Engagement
  try {
    const { getTeamEngagementService, shutdownTeamEngagementService } = await import(
      '../team-engagement.js'
    );
    services.push({
      name: 'team-engagement',
      initialize: async () => {
        const service = getTeamEngagementService();
        await service.initialize();
      },
      shutdown: shutdownTeamEngagementService,
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Team engagement service not available');
  }

  // Spontaneous Sharing
  try {
    const {
      initializeSpontaneousSharingPersistence,
      shutdownSpontaneousSharingPersistence,
    } = await import('../spontaneous-sharing.js');
    services.push({
      name: 'spontaneous-sharing',
      initialize: initializeSpontaneousSharingPersistence,
      shutdown: shutdownSpontaneousSharingPersistence,
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Spontaneous sharing service not available');
  }

  // Communication Mirroring
  try {
    const {
      initializeCommunicationMirroringPersistence,
      shutdownCommunicationMirroringPersistence,
    } = await import('../../intelligence/communication-mirroring.js');
    services.push({
      name: 'communication-mirroring',
      initialize: initializeCommunicationMirroringPersistence,
      shutdown: shutdownCommunicationMirroringPersistence,
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Communication mirroring service not available');
  }

  // Maya Notification Service
  try {
    const { initializeMayaNotificationService, shutdownMayaNotificationService } = await import(
      '../maya-notification-service.js'
    );
    services.push({
      name: 'maya-notifications',
      initialize: async () => {
        await initializeMayaNotificationService();
      },
      shutdown: shutdownMayaNotificationService,
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Maya notification service not available');
  }

  // Productivity Store
  try {
    const { initializeProductivityStore, shutdownProductivityStore } = await import(
      '../productivity-store.js'
    );
    services.push({
      name: 'productivity-store',
      initialize: async () => {
        await initializeProductivityStore();
      },
      shutdown: shutdownProductivityStore,
      critical: true, // User data - critical
    });
  } catch (error) {
    log.warn({ error }, 'Productivity store not available');
  }

  // Maya Financial Store
  try {
    const { initializeMayaFinancialStore, shutdownMayaFinancialStore } = await import(
      '../maya-financial-store.js'
    );
    services.push({
      name: 'maya-financial-store',
      initialize: async () => {
        await initializeMayaFinancialStore();
      },
      shutdown: shutdownMayaFinancialStore,
      critical: true, // User data - critical
    });
  } catch (error) {
    log.warn({ error }, 'Maya financial store not available');
  }

  // Daily Rituals
  try {
    const { getDailyRitualsService } = await import('../daily-rituals.js');
    services.push({
      name: 'daily-rituals',
      initialize: async () => {
        const service = getDailyRitualsService();
        await service.initializeFirestore();
      },
      shutdown: async () => {
        // Daily rituals flushes via engagement store
      },
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Daily rituals service not available');
  }

  // Agent Evolution
  try {
    const {
      initializeAgentEvolution,
      saveAgentEvolutionToFirestore,
    } = await import('../../intelligence/agent-evolution.js');
    services.push({
      name: 'agent-evolution',
      initialize: async () => {
        await initializeAgentEvolution();
      },
      shutdown: saveAgentEvolutionToFirestore,
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Agent evolution service not available');
  }

  // Background Tasks
  try {
    const { getBackgroundTaskService } = await import('../background-tasks.js');
    services.push({
      name: 'background-tasks',
      initialize: async () => {
        const service = getBackgroundTaskService();
        await service.initialize();
      },
      shutdown: async () => {
        const { getBackgroundTaskService } = await import('../background-tasks.js');
        const service = getBackgroundTaskService();
        await service.shutdown();
      },
      critical: false,
    });
  } catch (error) {
    log.warn({ error }, 'Background tasks service not available');
  }

  return services;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize all persistence services
 *
 * Call this at application startup, after basic infrastructure is ready.
 */
export async function initializeAllPersistence(): Promise<void> {
  if (isInitialized) {
    log.warn('Persistence already initialized');
    return;
  }

  log.info('🚀 Initializing all persistence services...');
  const startTime = Date.now();

  // Initialize base persistence layer first
  await initializePersistence();

  // Get all services
  const services = await getServices();
  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  // Initialize each service
  for (const service of services) {
    try {
      await service.initialize();
      results.push({ name: service.name, success: true });
      log.debug({ service: service.name }, 'Service initialized');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ name: service.name, success: false, error: errorMsg });

      if (service.critical) {
        log.error({ service: service.name, error }, 'Critical service failed to initialize');
        throw new Error(`Critical service ${service.name} failed: ${errorMsg}`);
      } else {
        log.warn({ service: service.name, error }, 'Non-critical service failed to initialize');
      }
    }
  }

  isInitialized = true;

  const duration = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;

  log.info(
    {
      duration,
      total: services.length,
      success: successCount,
      failed: services.length - successCount,
    },
    '✅ Persistence initialization complete'
  );
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Gracefully shutdown all persistence services
 *
 * This flushes all pending data to Firestore before exiting.
 * Call this at application shutdown.
 */
export async function shutdownAllPersistence(): Promise<void> {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress');
    return;
  }

  if (!isInitialized) {
    log.warn('Persistence not initialized, nothing to shutdown');
    return;
  }

  isShuttingDown = true;
  log.info('🛑 Shutting down all persistence services...');
  const startTime = Date.now();

  // Get all services
  const services = await getServices();
  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  // Shutdown each service (in reverse order)
  for (const service of services.reverse()) {
    try {
      await service.shutdown();
      results.push({ name: service.name, success: true });
      log.debug({ service: service.name }, 'Service shutdown');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ name: service.name, success: false, error: errorMsg });
      log.error({ service: service.name, error }, 'Service shutdown failed');
    }
  }

  // Shutdown base persistence layer last
  await shutdownPersistence();

  isInitialized = false;
  isShuttingDown = false;

  const duration = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;

  log.info(
    {
      duration,
      total: services.length,
      success: successCount,
      failed: services.length - successCount,
    },
    '✅ Persistence shutdown complete'
  );
}

// ============================================================================
// SIGNAL HANDLING
// ============================================================================

let signalHandlersInstalled = false;

/**
 * Install signal handlers for graceful shutdown
 *
 * This ensures data is persisted even if the process is killed.
 */
export function installShutdownHandlers(): void {
  if (signalHandlersInstalled) return;

  const handleSignal = async (signal: string) => {
    log.info({ signal }, 'Received shutdown signal');

    try {
      await shutdownAllPersistence();
      log.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      log.error({ error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void handleSignal('SIGINT'));
  process.on('SIGTERM', () => void handleSignal('SIGTERM'));
  process.on('SIGHUP', () => void handleSignal('SIGHUP'));

  // Also handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    log.error({ error }, 'Uncaught exception - attempting graceful shutdown');
    try {
      await shutdownAllPersistence();
    } catch (e) {
      log.error({ error: e }, 'Failed to shutdown during uncaught exception');
    }
    process.exit(1);
  });

  signalHandlersInstalled = true;
  log.info('Shutdown signal handlers installed');
}

// ============================================================================
// STATUS
// ============================================================================

/**
 * Get persistence status for all services
 */
export function getPersistenceStatus(): {
  initialized: boolean;
  shuttingDown: boolean;
  stats: Record<string, { cached: number; dirty: number }>;
} {
  return {
    initialized: isInitialized,
    shuttingDown: isShuttingDown,
    stats: getAllStats(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeAllPersistence,
  shutdownAllPersistence,
  installShutdownHandlers,
  getPersistenceStatus,
};

