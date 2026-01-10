/**
 * Scheduled Outreach Executor
 *
 * Polls for pending scheduled outreach and executes them when due.
 * Runs as a background worker integrated with the automated scheduler.
 *
 * @module services/outreach/scheduled-outreach-executor
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import {
  getPendingOutreach,
  updateOutreachStatus,
  incrementRetry,
  type ScheduledOutreach,
} from './scheduled-multi-outreach.js';
import { sendSMS } from './delivery/sms-delivery.js';
import { sendEmail } from './delivery/email-delivery.js';
import { callWithPersonaVoice } from '../voice/voice-call.js';
import { makeConversationalCall } from './conversational-calls.js';
import type { OutboundCallContext } from './conversational-calls.js';

const log = createLogger({ module: 'ScheduledOutreachExecutor' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ExecutorConfig {
  /** Poll interval in milliseconds */
  pollIntervalMs: number;
  /** Batch size per poll */
  batchSize: number;
  /** Dry run mode (log but don't send) */
  dryRun: boolean;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  pollIntervalMs: 60_000, // Check every minute
  batchSize: 10,
  dryRun: false,
};

// ============================================================================
// STATE
// ============================================================================

let isRunning = false;
let config = DEFAULT_CONFIG;

// Track active users to process
const activeUserIds = new Set<string>();

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute a single scheduled outreach
 */
async function executeScheduledOutreach(outreach: ScheduledOutreach): Promise<void> {
  const { userId, personaId, target, id } = outreach;
  const outreachId = `sched_exec_${id}`;

  log.info(
    { userId, contact: target.resolvedContactName, channel: target.channel },
    '⏰ Executing scheduled outreach'
  );

  // Mark as executing
  await updateOutreachStatus(userId, id, 'executing');

  try {
    let success = false;
    let errorMsg: string | undefined;
    let channelUsed = target.channel === 'auto' ? 'text' : target.channel;

    // Determine channel if auto
    if (target.channel === 'auto') {
      // Default: text if phone available, else email
      if (target.resolvedPhone) {
        channelUsed = 'text';
      } else if (target.resolvedEmail) {
        channelUsed = 'email';
      }

      // Upgrade to call for certain purposes
      const purposeLower = target.purpose.toLowerCase();
      if (
        purposeLower.includes('check in') ||
        purposeLower.includes('talk') ||
        purposeLower.includes('important')
      ) {
        if (target.resolvedPhone) {
          channelUsed = 'call';
        }
      }
    }

    // Execute based on channel
    if (channelUsed === 'call' || channelUsed === 'conversation') {
      if (!target.resolvedPhone) {
        throw new Error(`No phone number for ${target.resolvedContactName}`);
      }

      if (channelUsed === 'conversation') {
        const callContext: OutboundCallContext = {
          userId,
          phoneNumber: target.resolvedPhone,
          message: target.message || target.purpose,
          personaId,
          reason: target.purpose,
        };
        const result = await makeConversationalCall(callContext);
        success = result.status === 'initiating' || result.status === 'ringing';
        errorMsg = result.error;
      } else {
        const result = await callWithPersonaVoice(
          target.resolvedPhone,
          target.message || target.purpose,
          personaId,
          { fallbackToTwilioVoice: true }
        );
        success = result.success;
        errorMsg = result.success ? undefined : result.message;
      }
    } else if (channelUsed === 'text') {
      if (!target.resolvedPhone) {
        throw new Error(`No phone number for ${target.resolvedContactName}`);
      }

      const result = await sendSMS({
        to: target.resolvedPhone,
        body: target.message || target.purpose,
        personaId,
        userId,
        outreachId,
      });
      success = result.success;
      errorMsg = result.error;
    } else if (channelUsed === 'email') {
      if (!target.resolvedEmail) {
        throw new Error(`No email for ${target.resolvedContactName}`);
      }

      const result = await sendEmail({
        to: target.resolvedEmail,
        subject: `Hey ${target.resolvedContactName.split(' ')[0]}`,
        body: target.message || target.purpose,
        personaId,
        userId,
        outreachId,
      });
      success = result.success;
      errorMsg = result.error;
    }

    // Update status
    await updateOutreachStatus(userId, id, success ? 'completed' : 'failed', {
      success,
      channel: channelUsed,
      error: errorMsg,
    });

    if (success) {
      log.info(
        { userId, contact: target.resolvedContactName, channel: channelUsed },
        '✅ Scheduled outreach completed'
      );
    } else {
      log.warn(
        { userId, contact: target.resolvedContactName, error: errorMsg },
        '⚠️ Scheduled outreach failed'
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error(
      { userId, contact: target.resolvedContactName, error: errorMsg },
      '❌ Scheduled outreach error'
    );

    // Check if we should retry
    const { shouldRetry } = await incrementRetry(userId, id);
    if (!shouldRetry) {
      await updateOutreachStatus(userId, id, 'failed', {
        success: false,
        error: errorMsg,
      });
    }
  }
}

/**
 * Process pending outreach for a specific user
 */
async function processUserOutreach(userId: string): Promise<number> {
  if (config.dryRun) {
    log.debug({ userId }, '🔍 [DRY RUN] Would check for scheduled outreach');
    return 0;
  }

  try {
    const pending = await getPendingOutreach(userId);
    if (pending.length === 0) {
      return 0;
    }

    log.info({ userId, count: pending.length }, '📬 Processing scheduled outreach');

    // Process in parallel (up to batch size)
    const batch = pending.slice(0, config.batchSize);
    await Promise.all(batch.map(executeScheduledOutreach));

    return batch.length;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to process scheduled outreach');
    return 0;
  }
}

/**
 * Main poll function - called on interval
 */
async function poll(): Promise<void> {
  if (!isRunning) return;

  const userIds = [...activeUserIds];
  if (userIds.length === 0) {
    return;
  }

  log.debug({ userCount: userIds.length }, '⏰ Polling for scheduled outreach');

  let totalProcessed = 0;
  for (const userId of userIds) {
    totalProcessed += await processUserOutreach(userId);
  }

  if (totalProcessed > 0) {
    log.info({ processed: totalProcessed }, '📤 Scheduled outreach poll complete');
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Start the scheduled outreach executor
 */
export function startScheduledOutreachExecutor(overrides?: Partial<ExecutorConfig>): void {
  if (isRunning) {
    log.warn('Scheduled outreach executor already running');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...overrides };
  isRunning = true;

  log.info(
    { pollIntervalMs: config.pollIntervalMs, dryRun: config.dryRun },
    '🚀 Starting scheduled outreach executor'
  );

  registerInterval('scheduled-outreach-executor', poll, config.pollIntervalMs);
}

/**
 * Stop the scheduled outreach executor
 */
export function stopScheduledOutreachExecutor(): void {
  if (!isRunning) return;

  isRunning = false;
  clearNamedInterval('scheduled-outreach-executor');
  log.info('⏹️ Stopped scheduled outreach executor');
}

/**
 * Register a user for scheduled outreach processing
 * Call this when a user schedules outreach
 */
export function registerUserForScheduledOutreach(userId: string): void {
  activeUserIds.add(userId);
  log.debug({ userId, activeCount: activeUserIds.size }, 'Registered user for scheduled outreach');
}

/**
 * Unregister a user (e.g., when they have no more scheduled items)
 */
export function unregisterUserFromScheduledOutreach(userId: string): void {
  activeUserIds.delete(userId);
}

/**
 * Get executor status
 */
export function getScheduledOutreachExecutorStatus(): {
  running: boolean;
  activeUsers: number;
  config: ExecutorConfig;
} {
  return {
    running: isRunning,
    activeUsers: activeUserIds.size,
    config,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startScheduledOutreachExecutor,
  stopScheduledOutreachExecutor,
  registerUserForScheduledOutreach,
  unregisterUserFromScheduledOutreach,
  getScheduledOutreachExecutorStatus,
};
