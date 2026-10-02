/**
 * Personal insights refresh (Cloud Scheduler, daily).
 *
 * Insights are precomputed after each conversation; this job catches users
 * whose conversations ended without the hook running, and recounts upcoming
 * dates and prediction recency as days pass. Users who talked in the last
 * `activeDays` days are refreshed. Not deployed automatically; see
 * infra/cloud-scheduler-memory.yaml.
 *
 * @module tasks/scheduled/personal-insights-job
 */

import {
  refreshPersonalInsights,
  type PipelineDeps,
} from '../../services/personal-insights/index.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

export interface PersonalInsightsJobConfig extends BaseJobConfig {
  activeDays: number;
  maxUsers: number;
}

export interface PersonalInsightsJobResult extends Record<string, unknown> {
  usersRefreshed: number;
}

/** User ids with recent contact (lastContact is stored as both Timestamp and ISO string). */
export async function findRecentlyActiveUsers(
  activeDays: number,
  maxUsers: number
): Promise<string[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const since = new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000);
  const users = db.collection('bogle_users');
  const [asDate, asString] = await Promise.all([
    users
      .where('lastContact', '>=', since)
      .limit(maxUsers)
      .get()
      .catch(() => null),
    users
      .where('lastContact', '>=', since.toISOString())
      .limit(maxUsers)
      .get()
      .catch(() => null),
  ]);
  const ids = new Set<string>();
  for (const snap of [asDate, asString]) snap?.docs.forEach((d) => ids.add(d.id));
  return [...ids].slice(0, maxUsers);
}

export class PersonalInsightsRefreshJob extends ScheduledJob<
  PersonalInsightsJobConfig,
  PersonalInsightsJobResult
> {
  readonly name = 'PersonalInsightsRefreshJob';
  readonly defaultConfig: PersonalInsightsJobConfig = {
    dryRun: false,
    activeDays: 14,
    maxUsers: 500,
    timeoutMs: 9 * 60 * 1000,
  };

  constructor(
    private readonly findUsers: typeof findRecentlyActiveUsers = findRecentlyActiveUsers,
    private readonly deps: PipelineDeps = {}
  ) {
    super();
  }

  protected async execute(
    config: PersonalInsightsJobConfig,
    ctx: JobContext
  ): Promise<PersonalInsightsJobResult> {
    const userIds = await this.findUsers(config.activeDays, config.maxUsers);
    let usersRefreshed = 0;
    for (const userId of userIds) {
      ctx.counters.processed++;
      if (config.dryRun) {
        ctx.counters.skipped++;
        continue;
      }
      const result = await refreshPersonalInsights(userId, this.deps);
      if (result) {
        usersRefreshed++;
        ctx.counters.success++;
      } else {
        ctx.counters.errors++;
      }
    }
    return { usersRefreshed };
  }
}
