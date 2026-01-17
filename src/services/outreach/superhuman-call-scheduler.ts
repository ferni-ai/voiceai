/**
 * Superhuman Call Scheduler
 *
 * Processes scheduled and queued call operations:
 * - Recurring calls ("call mom every Sunday")
 * - Callback retries (auto-retry failed calls)
 *
 * Runs as a background service, polling for due items and executing them.
 *
 * @module services/outreach/superhuman-call-scheduler
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';

const log = createLogger({ module: 'SuperhumanCallScheduler' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface SchedulerConfig {
  /** Recurring call check interval (ms) */
  recurringPollIntervalMs: number;
  /** Callback retry check interval (ms) */
  callbackPollIntervalMs: number;
  /** Max items to process per poll */
  batchSize: number;
  /** Dry run mode */
  dryRun: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  recurringPollIntervalMs: 5 * 60 * 1000, // 5 minutes
  callbackPollIntervalMs: 2 * 60 * 1000, // 2 minutes
  batchSize: 5,
  dryRun: false,
};

// ============================================================================
// STATE
// ============================================================================

let isRunning = false;
let config = DEFAULT_CONFIG;

// Track processing to avoid duplicates
const processingRecurring = new Set<string>();
const processingCallbacks = new Set<string>();

// ============================================================================
// RECURRING CALLS PROCESSOR
// ============================================================================

/**
 * Process due recurring call schedules
 */
async function processRecurringCalls(): Promise<void> {
  if (config.dryRun) {
    log.debug('Dry run: skipping recurring call processing');
    return;
  }

  try {
    const { getDueSchedules, markScheduleExecuted } =
      await import('../../tools/domains/telephony/recurring-calls.js');

    // Get all due schedules across all users
    // Note: getDueSchedules takes a userId, so we need to iterate users
    // For now, we'll use the Firestore collection group query approach
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.debug('Firestore not available for recurring calls');
      return;
    }

    const now = new Date();

    // Query all due schedules using collection group
    const snapshot = await db
      .collectionGroup('recurring_call_schedules')
      .where('enabled', '==', true)
      .where('nextCallDate', '<=', now.toISOString())
      .limit(config.batchSize)
      .get();

    if (snapshot.empty) {
      log.debug('No recurring calls due');
      return;
    }

    log.info({ count: snapshot.size }, '📅 Processing due recurring calls');

    for (const doc of snapshot.docs) {
      const schedule = doc.data() as {
        userId: string;
        contactQuery: string;
        contactName?: string;
        contactPhone?: string;
        purpose: string;
      };
      const scheduleId = `${schedule.userId}_${doc.id}`;

      // Skip if already processing
      if (processingRecurring.has(scheduleId)) {
        continue;
      }

      processingRecurring.add(scheduleId);

      try {
        await executeRecurringCall(schedule, doc.id);
        await markScheduleExecuted(schedule.userId, doc.id);
        log.info(
          { userId: schedule.userId, contact: schedule.contactName },
          '✅ Recurring call executed'
        );
      } catch (error) {
        log.error({ error: String(error), scheduleId }, 'Failed to execute recurring call');
      } finally {
        processingRecurring.delete(scheduleId);
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Error in recurring call processor');
  }
}

/**
 * Execute a single recurring call
 */
async function executeRecurringCall(
  schedule: {
    userId: string;
    contactQuery: string;
    contactName?: string;
    contactPhone?: string;
    purpose: string;
  },
  scheduleId: string
): Promise<void> {
  log.info(
    { userId: schedule.userId, contact: schedule.contactName || schedule.contactQuery },
    '📞 Initiating recurring call'
  );

  // Use the on-behalf call orchestrator directly
  const { getOnBehalfCallOrchestrator } = await import('./on-behalf-call-orchestrator.js');
  const { resolveContact, inferCallType, inferObjective } =
    await import('../../tools/domains/telephony/call-on-behalf.js');

  const orchestrator = getOnBehalfCallOrchestrator();

  // Resolve contact
  const resolvedContact = await resolveContact(schedule.contactQuery, schedule.userId);

  if (!resolvedContact) {
    throw new Error(`Could not resolve contact: ${schedule.contactQuery}`);
  }

  const purpose = schedule.purpose || 'Regular check-in call';

  // Build request
  const request = {
    contactQuery: schedule.contactQuery,
    resolvedContact,
    purpose,
    objective: inferObjective(purpose),
    callType: inferCallType(resolvedContact, purpose),
    originalSessionId: `recurring_${scheduleId}_${Date.now()}`,
    userId: schedule.userId,
    userTimezone: 'America/New_York',
    userName: 'User', // Could be resolved from profile
    recordingConsent: true,
  };

  await orchestrator.initiateCall(request);
}

// ============================================================================
// CALLBACK RETRY PROCESSOR
// ============================================================================

/**
 * Process due callback retries
 */
async function processCallbackRetries(): Promise<void> {
  if (config.dryRun) {
    log.debug('Dry run: skipping callback retry processing');
    return;
  }

  try {
    const { getDueCallbacks, markCallbackCompleted } = await import('./smart-callback-queue.js');
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.debug('Firestore not available for callbacks');
      return;
    }

    const now = new Date().toISOString();

    // Query all due callbacks using collection group
    const snapshot = await db
      .collectionGroup('callback_queue')
      .where('status', '==', 'scheduled')
      .where('scheduledFor', '<=', now)
      .limit(config.batchSize)
      .get();

    if (snapshot.empty) {
      log.debug('No callback retries due');
      return;
    }

    log.info({ count: snapshot.size }, '🔄 Processing callback retries');

    for (const doc of snapshot.docs) {
      const callback = doc.data() as {
        userId: string;
        contactQuery: string;
        contactName?: string;
        contactPhone?: string;
        purpose: string;
        message?: string;
        attemptCount: number;
        id: string;
      };
      const callbackId = callback.id;

      // Skip if already processing
      if (processingCallbacks.has(callbackId)) {
        continue;
      }

      processingCallbacks.add(callbackId);

      try {
        await executeCallbackRetry(callback);
        // Note: markCallbackCompleted will be called by the call completion handler
        // if the call succeeds. If it fails again, it will be re-queued.
        log.info(
          { userId: callback.userId, contact: callback.contactName },
          '🔄 Callback retry initiated'
        );
      } catch (error) {
        log.error({ error: String(error), callbackId }, 'Failed to execute callback retry');
      } finally {
        processingCallbacks.delete(callbackId);
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Error in callback retry processor');
  }
}

/**
 * Execute a single callback retry
 */
async function executeCallbackRetry(callback: {
  userId: string;
  contactQuery: string;
  contactName?: string;
  contactPhone?: string;
  purpose: string;
  message?: string;
  attemptCount: number;
  id: string;
}): Promise<void> {
  log.info(
    {
      userId: callback.userId,
      contact: callback.contactName || callback.contactQuery,
      attempt: callback.attemptCount + 1,
    },
    '📞 Initiating callback retry'
  );

  // Use the on-behalf call orchestrator directly
  const { getOnBehalfCallOrchestrator } = await import('./on-behalf-call-orchestrator.js');
  const { resolveContact, inferCallType, inferObjective } =
    await import('../../tools/domains/telephony/call-on-behalf.js');

  const orchestrator = getOnBehalfCallOrchestrator();

  // Resolve contact (may use cached phone if available)
  let resolvedContact;
  if (callback.contactPhone && callback.contactName) {
    resolvedContact = {
      name: callback.contactName,
      phone: callback.contactPhone,
    };
  } else {
    const resolved = await resolveContact(callback.contactQuery, callback.userId);
    if (!resolved) {
      throw new Error(`Could not resolve contact: ${callback.contactQuery}`);
    }
    resolvedContact = resolved;
  }

  // Build request
  const request = {
    contactQuery: callback.contactQuery,
    resolvedContact,
    purpose: callback.purpose,
    objective: inferObjective(callback.purpose),
    callType: inferCallType(resolvedContact, callback.purpose),
    originalSessionId: `callback_${callback.id}_${Date.now()}`,
    userId: callback.userId,
    userTimezone: 'America/New_York',
    userName: 'User',
    recordingConsent: true,
  };

  await orchestrator.initiateCall(request);
}

// ============================================================================
// SERVICE LIFECYCLE
// ============================================================================

/**
 * Start the superhuman call scheduler
 */
export function startSuperhumanScheduler(overrideConfig?: Partial<SchedulerConfig>): void {
  if (isRunning) {
    log.warn('Superhuman scheduler already running');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...overrideConfig };
  isRunning = true;

  log.info(
    {
      recurringInterval: config.recurringPollIntervalMs,
      callbackInterval: config.callbackPollIntervalMs,
      dryRun: config.dryRun,
    },
    '🚀 Starting Superhuman Call Scheduler'
  );

  // Register recurring call processor
  registerInterval(
    'superhuman_recurring_calls',
    processRecurringCalls,
    config.recurringPollIntervalMs
  );

  // Register callback retry processor
  registerInterval(
    'superhuman_callback_retries',
    processCallbackRetries,
    config.callbackPollIntervalMs
  );

  // Run immediately on start
  void processRecurringCalls();
  void processCallbackRetries();
}

/**
 * Stop the superhuman call scheduler
 */
export function stopSuperhumanScheduler(): void {
  if (!isRunning) {
    return;
  }

  log.info('Stopping Superhuman Call Scheduler');

  clearNamedInterval('superhuman_recurring_calls');
  clearNamedInterval('superhuman_callback_retries');

  isRunning = false;
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return isRunning;
}

/**
 * Get scheduler stats
 */
export function getSchedulerStats(): {
  running: boolean;
  processingRecurring: number;
  processingCallbacks: number;
} {
  return {
    running: isRunning,
    processingRecurring: processingRecurring.size,
    processingCallbacks: processingCallbacks.size,
  };
}

export default {
  startSuperhumanScheduler,
  stopSuperhumanScheduler,
  isSchedulerRunning,
  getSchedulerStats,
};
