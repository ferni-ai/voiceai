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
  patchOutreach,
  claimPendingOutreach,
  type ScheduledOutreach,
  type ScheduledOutreachTarget,
} from './scheduled-multi-outreach.js';
import { isOwnVerifiedPhone, ON_BEHALF_GAP_MS, textOnBehalf } from './guarded-text.js';
import { thirdPartyRefusal } from '../messaging/consent-reach.js';
import { flagOn } from '../../config/env-flag.js';
import { sendEmail } from './delivery/email-delivery.js';
import { callWithPersonaVoice } from '../voice/voice-call.js';
import { makeConversationalCall } from './conversational-calls.js';
import type { OutboundCallContext } from './conversational-calls.js';
import {
  logPromiseJobRun,
  logPromiseOutcome,
  scheduledOutreachOutcome,
  type OutreachEnd,
} from '../follow-through/index.js';

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

/** Guard skips that end a scheduled text rather than fail it. */
const FINAL_SKIPS: ReadonlySet<string> = new Set(['opted-out', 'needs-consent', 'bad-number']);
/** A held item released this long after its time is stale: cancelled, never sent as a backlog. */
const HELD_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Track active users to process
const activeUserIds = new Set<string>();

// ============================================================================
// EXECUTION
// ============================================================================

/** Only a text or call to the member's own verified phone is to them; every other send is to someone else. */
async function toMemberThemself(
  userId: string,
  channel: string,
  target: ScheduledOutreachTarget
): Promise<boolean> {
  if (!['text', 'call', 'conversation'].includes(channel) || !target.resolvedPhone) return false;
  return isOwnVerifiedPhone(userId, target.resolvedPhone).catch(() => false);
}

/** Execute a single scheduled outreach, and log how it ended (PROMISE_OUTCOME). */
export async function executeScheduledOutreach(outreach: ScheduledOutreach): Promise<OutreachEnd> {
  const end = await runOutreach(outreach);
  const ids = { userId: outreach.userId, id: outreach.id };
  logPromiseOutcome('scheduled-outreach', scheduledOutreachOutcome(end), ids);
  return end;
}

async function runOutreach(outreach: ScheduledOutreach): Promise<OutreachEnd> {
  const { userId, personaId, target, id } = outreach;
  const outreachId = `sched_exec_${id}`;

  log.info(
    { userId, contact: target.resolvedContactName, channel: target.channel },
    '⏰ Executing scheduled outreach'
  );

  if (outreach.heldAt && Date.now() - outreach.scheduledFor.getTime() > HELD_EXPIRY_MS) {
    await updateOutreachStatus(userId, id, 'cancelled', {
      success: false,
      error: 'expired-while-held',
    });
    log.info({ userId, id }, 'Held scheduled outreach expired');
    return 'expired-while-held';
  }

  // Mark as executing
  await updateOutreachStatus(userId, id, 'executing');

  try {
    let success = false;
    let errorMsg: string | undefined;
    // 'auto' means a text (an email without a phone); a call only when one was asked for.
    const auto = target.resolvedPhone || !target.resolvedEmail ? 'text' : 'email';
    const channelUsed = target.channel === 'auto' ? auto : target.channel;

    if (
      !flagOn('SCHEDULED_OUTREACH_THIRD_PARTY') &&
      !(await toMemberThemself(userId, channelUsed, target))
    ) {
      // Kept, not dropped and not retried every minute, until the founder opts in.
      await patchOutreach(userId, id, {
        status: 'held',
        heldReason: 'awaiting-approval',
        heldAt: new Date(),
      });
      log.info({ userId, id, channel: channelUsed }, 'Scheduled outreach to someone else held');
      return 'held-for-approval';
    }

    // Execute based on channel
    if (channelUsed === 'on_behalf_call') {
      const { placeCallRetry } = await import('./call-retry.js');
      const result = await placeCallRetry(target.onBehalfDispatch, userId);
      success = result.success;
      errorMsg = result.error;
    } else if (channelUsed === 'call' || channelUsed === 'conversation') {
      if (!target.resolvedPhone) {
        throw new Error(`No phone number for ${target.resolvedContactName}`);
      }
      // MESSAGING_PIPELINE: a number that asked not to be called is never rung, and someone
      // other than the member must have agreed to calls (nothing confirms a scheduled call).
      const refused = await thirdPartyRefusal(
        userId,
        target.resolvedPhone,
        'call',
        isOwnVerifiedPhone
      );
      if (refused) {
        await updateOutreachStatus(userId, id, 'cancelled', {
          success: false,
          channel: channelUsed,
          error: `skipped: ${refused}`,
        });
        // An unreadable consent record is not a stop: it ends like the text sender's send-failed.
        return refused === 'unverifiable' ? 'failed' : refused;
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
          { fallbackToTwilioVoice: true, userId }
        );
        success = result.success;
        errorMsg = result.success ? undefined : result.message;
      }
    } else if (channelUsed === 'text') {
      if (!target.resolvedPhone) {
        throw new Error(`No phone number for ${target.resolvedContactName}`);
      }

      const sent = await textOnBehalf({
        senderUserId: userId,
        toPhone: target.resolvedPhone,
        body: target.message || target.purpose,
        refId: outreachId,
        personaId,
      });
      if (!sent.sent && sent.reason === 'quiet-hours') {
        // Held, not dropped: it goes out when their morning starts.
        await patchOutreach(userId, id, { status: 'pending', scheduledFor: sent.until });
        log.info({ userId, id, until: sent.until.toISOString() }, 'Scheduled text held');
        return 'quiet-hours';
      }
      if (!sent.sent && sent.reason === 'recently-sent') {
        // Another text to them just went (or is going): this one waits out the gap.
        const scheduledFor = new Date(Date.now() + ON_BEHALF_GAP_MS);
        await patchOutreach(userId, id, { status: 'pending', scheduledFor });
        return 'rate-gap';
      }
      if (!sent.sent && FINAL_SKIPS.has(sent.reason)) {
        // A STOP or a bad number: trying again would be wrong, not unlucky.
        await updateOutreachStatus(userId, id, 'cancelled', {
          success: false,
          channel: channelUsed,
          error: `skipped: ${sent.reason}`,
        });
        log.info({ userId, id, reason: sent.reason }, 'Scheduled text skipped');
        return sent.reason as 'opted-out' | 'needs-consent' | 'bad-number'; // the FINAL_SKIPS
      }
      success = sent.sent;
      errorMsg = sent.sent ? undefined : sent.reason;
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
    const end = success ? 'completed' : 'failed';
    await updateOutreachStatus(userId, id, end, {
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
    return end;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error(
      { userId, contact: target.resolvedContactName, error: errorMsg },
      '❌ Scheduled outreach error'
    );

    // Check if we should retry
    const { shouldRetry } = await incrementRetry(userId, id);
    if (shouldRetry) return 'retrying';
    await updateOutreachStatus(userId, id, 'failed', {
      success: false,
      error: errorMsg,
    });
    return 'error';
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
    // A missed-call retry is placed only by the Cloud Scheduler job, which claims
    // each item in a transaction; placing it here too could ring them twice.
    const pending = (await getPendingOutreach(userId)).filter(
      (o) => o.target.channel !== 'on_behalf_call'
    );
    if (pending.length === 0) {
      return 0;
    }

    log.info({ userId, count: pending.length }, '📬 Processing scheduled outreach');

    // Process in parallel (up to batch size)
    const batch = pending.slice(0, config.batchSize);
    await Promise.all(
      batch.map(async (o) => {
        if (await claimPendingOutreach(userId, o.id)) await executeScheduledOutreach(o);
      })
    );

    return batch.length;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to process scheduled outreach');
    return 0;
  }
}

export interface ScheduledOutreachRunResult {
  due: number;
  executed: number;
  missed: number;
  skipped: number;
  dryRun: boolean;
}

/**
 * Execute due scheduled outreach straight from Firestore. Run by Cloud
 * Scheduler (POST /api/jobs/execute-scheduled-outreach) every minute.
 *
 * The in-process poller only checked users registered in its own process's
 * memory (by the tool, during the call that scheduled the outreach) and ran
 * only inside voice-call processes, so outreach due after that call's process
 * ended was never sent.
 */
export async function executeDueScheduledOutreach(
  opts: { now?: Date; dryRun?: boolean; limit?: number } = {}
): Promise<ScheduledOutreachRunResult> {
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const { claimDueItems } = await import('../scheduling/due-items.js');
  const { outreachFromDoc } = await import('./scheduled-multi-outreach.js');
  const claim = await claimDueItems(db, {
    collection: 'scheduled_outreach',
    dueField: 'scheduledFor',
    dueType: 'timestamp',
    claimStatus: 'executing',
    lateStatus: 'missed',
    lateAfterMs: 2 * 60 * 60 * 1000,
    now: opts.now,
    limit: opts.limit ?? config.batchSize,
    dryRun: opts.dryRun,
  });
  const result: ScheduledOutreachRunResult = {
    due: claim.due,
    executed: 0,
    missed: claim.late,
    skipped: claim.skipped,
    dryRun: opts.dryRun === true,
  };
  if (opts.dryRun) return result;
  for (const item of claim.lateItems) {
    const ids = { userId: item.userId, id: item.id };
    logPromiseOutcome('scheduled-outreach', scheduledOutreachOutcome('missed'), ids);
  }
  const counts = { due: result.due, done: 0, failed: 0, held: 0, missed: result.missed };
  for (const item of claim.claimed) {
    // executeScheduledOutreach records completed/failed itself.
    // Owner from the document's path, not its userId field.
    const outreach = { ...outreachFromDoc(item.id, item.data), userId: item.userId };
    const { outcome } = scheduledOutreachOutcome(await executeScheduledOutreach(outreach));
    if (outcome === 'done') counts.done++;
    else if (outcome === 'failed') counts.failed++;
    else counts.held++; // held, or pending again for a retry
    result.executed++;
  }
  if (result.due > 0) log.info(result, 'Scheduled outreach run');
  logPromiseJobRun('scheduled-outreach', counts);
  return result;
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
