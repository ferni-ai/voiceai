/**
 * Slim daily outreach runner for the async Cloud Run image.
 *
 * The monorepo daily-outreach-job pulls too many workspace modules to bundle
 * cleanly into apps/async. This runner keeps the scheduler contract working:
 * evaluate active users, enqueue pending outreach_triggers, then drain them.
 */

import type { Firestore } from '@google-cloud/firestore';

import { createLogger } from '../logger.js';
import { processPendingTriggers } from './processor.js';
import type { WorkerConfig } from '../types.js';

const log = createLogger('daily-outreach-runner');

export interface DailyOutreachJobResult {
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  usersEvaluated: number;
  outreachSent: number;
  byType: Record<string, number>;
  errors: Array<{ userId: string; error: string }>;
  triggersEnqueued?: number;
  triggersDrained?: number;
}

export interface DailyOutreachJobConfig {
  getUserProfiles: () => Promise<Array<{ id: string; [key: string]: unknown }>>;
  maxUsersPerRun?: number;
  delayBetweenUsersMs?: number;
  dryRun?: boolean;
  db?: Firestore;
  workerConfig?: WorkerConfig;
}

function isQuietHours(timezone?: string): boolean {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone || 'America/Los_Angeles',
    }).format(new Date());
    const hour = Number(hourStr);
    return hour >= 22 || hour < 8;
  } catch {
    return false;
  }
}

/**
 * Enqueue lightweight thinking-of-you triggers, then drain pending queue.
 */
export async function runDailyOutreachJob(
  config: DailyOutreachJobConfig
): Promise<DailyOutreachJobResult> {
  const startedAt = new Date();
  const maxUsers = config.maxUsersPerRun ?? 500;
  const dryRun = Boolean(config.dryRun);
  const byType: Record<string, number> = { thinking_of_you: 0 };
  const errors: Array<{ userId: string; error: string }> = [];
  let outreachSent = 0;
  let triggersEnqueued = 0;
  let triggersDrained = 0;

  const profiles = (await config.getUserProfiles()).slice(0, maxUsers);
  const db = config.db || config.workerConfig?.db;

  if (!db) {
    throw new Error('Daily outreach runner requires Firestore db');
  }

  for (const profile of profiles) {
    const userId = profile.id;
    try {
      const timezone =
        typeof profile.timezone === 'string' ? profile.timezone : undefined;
      if (isQuietHours(timezone)) {
        continue;
      }

      const triggerId = `daily-toy-${userId}-${startedAt.toISOString().slice(0, 10)}`;
      const triggerRef = db.collection('outreach_triggers').doc(triggerId);
      const existing = await triggerRef.get();
      if (existing.exists) {
        continue;
      }

      if (!dryRun) {
        await triggerRef.set({
          id: triggerId,
          userId,
          type: 'thinking_of_you',
          status: 'pending',
          priority: 'normal',
          channels: ['push'],
          createdAt: new Date(),
          source: 'async-daily-outreach-runner',
        });
      }

      triggersEnqueued += 1;
      byType.thinking_of_you += 1;
      outreachSent += 1;
    } catch (error) {
      errors.push({ userId, error: String(error) });
      log.warn({ userId, error }, 'Failed to enqueue daily outreach trigger');
    }
  }

  if (config.workerConfig && !dryRun) {
    try {
      const drain = await processPendingTriggers(config.workerConfig, 100);
      triggersDrained = drain.processed;
    } catch (drainError) {
      log.warn({ error: drainError }, 'Pending trigger drain failed (non-fatal)');
      errors.push({ userId: '_drain', error: String(drainError) });
    }
  }

  const completedAt = new Date();
  const result: DailyOutreachJobResult = {
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    usersEvaluated: profiles.length,
    outreachSent,
    byType,
    errors,
    triggersEnqueued,
    triggersDrained,
  };

  log.info(
    {
      usersEvaluated: result.usersEvaluated,
      triggersEnqueued,
      triggersDrained,
      errors: errors.length,
      dryRun,
    },
    'Daily outreach runner complete'
  );

  return result;
}
