/**
 * Calendar Scheduled Jobs
 *
 * Jobs for calendar-related scheduled tasks:
 * - Weekly calendar digest
 * - Pre-meeting notifications
 * - Meeting follow-up automation
 *
 * These jobs integrate with the calendar services and push notification system.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

const log = createLogger({ module: 'CalendarJobs' });

// ============================================================================
// TYPES
// ============================================================================

interface WeeklyDigestConfig extends BaseJobConfig {
  batchSize: number;
}

interface PreMeetingNotificationsConfig extends BaseJobConfig {
  lookAheadMinutes: number;
  notifyBeforeMinutes: number;
}

interface FollowUpAutomationConfig extends BaseJobConfig {
  batchSize: number;
  lookBackHours: number;
}

interface WeeklyDigestResult extends Record<string, unknown> {
  digestsSent: number;
  digestsSkipped: number;
}

interface PreMeetingResult extends Record<string, unknown> {
  notificationsSent: number;
  notificationsSkipped: number;
}

interface FollowUpResult extends Record<string, unknown> {
  followUpsGenerated: number;
  followUpsSkipped: number;
}

// ============================================================================
// WEEKLY CALENDAR DIGEST JOB
// ============================================================================

export class WeeklyCalendarDigestJob extends ScheduledJob<WeeklyDigestConfig, WeeklyDigestResult> {
  readonly name = 'WeeklyCalendarDigest';
  readonly defaultConfig: WeeklyDigestConfig = {
    dryRun: false,
    batchSize: 50,
  };

  protected async execute(
    config: WeeklyDigestConfig,
    ctx: JobContext
  ): Promise<WeeklyDigestResult> {
    const result: WeeklyDigestResult = {
      digestsSent: 0,
      digestsSkipped: 0,
    };

    try {
      // Get all users with calendar connected
      const userIds = await this.getCalendarUsers();

      ctx.log.info({ userCount: userIds.length }, 'Processing weekly digest for users');

      // Process in batches
      await this.processBatch(
        userIds,
        async (userId) => {
          try {
            if (config.dryRun) {
              ctx.log.debug({ userId }, 'DRY RUN: Would send weekly digest');
              result.digestsSkipped++;
              return;
            }

            const sent = await this.sendDigest(userId);
            if (sent) {
              result.digestsSent++;
            } else {
              result.digestsSkipped++;
            }
          } catch (error) {
            ctx.log.error({ userId, error: String(error) }, 'Failed to send digest');
            result.digestsSkipped++;
          }
        },
        ctx,
        { batchSize: config.batchSize }
      );
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Weekly digest job failed');
    }

    return result;
  }

  private async getCalendarUsers(): Promise<string[]> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      });

      const snapshot = await db.collection('google_calendar_tokens').get();
      return snapshot.docs.map((doc) => doc.id);
    } catch {
      log.warn('Could not fetch calendar users');
      return [];
    }
  }

  private async sendDigest(userId: string): Promise<boolean> {
    try {
      const { generateWeeklyDigest, formatDigestForPush } =
        await import('../../services/calendar/weekly-calendar-digest.js');
      const { getPushNotificationsService } = await import('../../services/push-notifications.js');

      const digest = await generateWeeklyDigest(userId);
      if (!digest) return false;

      const notification = formatDigestForPush(digest);
      const pushService = getPushNotificationsService();

      return await pushService.sendNotification(userId, {
        title: notification.title,
        body: notification.body,
        type: 'calendar_digest',
        data: notification.data,
      });
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to send weekly digest');
      return false;
    }
  }
}

// ============================================================================
// PRE-MEETING NOTIFICATIONS JOB
// ============================================================================

export class PreMeetingNotificationsJob extends ScheduledJob<
  PreMeetingNotificationsConfig,
  PreMeetingResult
> {
  readonly name = 'PreMeetingNotifications';
  readonly defaultConfig: PreMeetingNotificationsConfig = {
    dryRun: false,
    lookAheadMinutes: 60,
    notifyBeforeMinutes: 15,
  };

  protected async execute(
    config: PreMeetingNotificationsConfig,
    ctx: JobContext
  ): Promise<PreMeetingResult> {
    const result: PreMeetingResult = {
      notificationsSent: 0,
      notificationsSkipped: 0,
    };

    try {
      // Get all users with calendar connected
      const userIds = await this.getCalendarUsers();

      ctx.log.info({ userCount: userIds.length }, 'Checking for pre-meeting notifications');

      for (const userId of userIds) {
        try {
          if (config.dryRun) {
            ctx.log.debug({ userId }, 'DRY RUN: Would check pre-meeting notifications');
            result.notificationsSkipped++;
            continue;
          }

          const sent = await this.sendPreMeetingNotifications(userId);
          result.notificationsSent += sent;
        } catch (error) {
          ctx.log.error(
            { userId, error: String(error) },
            'Failed to send pre-meeting notification'
          );
          result.notificationsSkipped++;
        }
      }
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Pre-meeting notifications job failed');
    }

    return result;
  }

  private async getCalendarUsers(): Promise<string[]> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      });

      const snapshot = await db.collection('google_calendar_tokens').get();
      return snapshot.docs.map((doc) => doc.id);
    } catch {
      log.warn('Could not fetch calendar users');
      return [];
    }
  }

  private async sendPreMeetingNotifications(userId: string): Promise<number> {
    try {
      const { checkForPreMeetingNotification, toOutreachFormat } =
        await import('../../services/calendar/pre-meeting-notifications.js');
      const { getPushNotificationsService } = await import('../../services/push-notifications.js');

      // Check for meetings requiring notification
      const notification = await checkForPreMeetingNotification(userId);
      if (!notification) return 0;

      // Send via push notification
      const pushService = getPushNotificationsService();
      const outreach = toOutreachFormat(notification);

      const sent = await pushService.sendNotification(userId, {
        title: outreach.title,
        body: outreach.message,
        type: 'calendar_reminder',
        personaId: outreach.personaId,
        data: { eventId: notification.eventId },
      });

      return sent ? 1 : 0;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to send pre-meeting notifications');
      return 0;
    }
  }
}

// ============================================================================
// MEETING FOLLOW-UP AUTOMATION JOB
// ============================================================================

export class MeetingFollowUpJob extends ScheduledJob<FollowUpAutomationConfig, FollowUpResult> {
  readonly name = 'MeetingFollowUpAutomation';
  readonly defaultConfig: FollowUpAutomationConfig = {
    dryRun: false,
    batchSize: 20,
    lookBackHours: 24,
  };

  protected async execute(
    config: FollowUpAutomationConfig,
    ctx: JobContext
  ): Promise<FollowUpResult> {
    const result: FollowUpResult = {
      followUpsGenerated: 0,
      followUpsSkipped: 0,
    };

    try {
      // Get all users with calendar connected
      const userIds = await this.getCalendarUsers();

      ctx.log.info({ userCount: userIds.length }, 'Processing meeting follow-ups');

      // Process in batches
      await this.processBatch(
        userIds,
        async (userId) => {
          try {
            if (config.dryRun) {
              ctx.log.debug({ userId }, 'DRY RUN: Would process follow-ups');
              result.followUpsSkipped++;
              return;
            }

            const generated = await this.processFollowUps(userId, config.lookBackHours);
            result.followUpsGenerated += generated;
          } catch (error) {
            ctx.log.error({ userId, error: String(error) }, 'Failed to process follow-ups');
            result.followUpsSkipped++;
          }
        },
        ctx,
        { batchSize: config.batchSize }
      );
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Meeting follow-up job failed');
    }

    return result;
  }

  private async getCalendarUsers(): Promise<string[]> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      });

      const snapshot = await db.collection('google_calendar_tokens').get();
      return snapshot.docs.map((doc) => doc.id);
    } catch {
      log.warn('Could not fetch calendar users');
      return [];
    }
  }

  private async processFollowUps(userId: string, lookBackHours: number): Promise<number> {
    try {
      const { processRecentMeetingsForFollowUp } =
        await import('../../services/calendar/meeting-followup-automation.js');
      return await processRecentMeetingsForFollowUp(userId, lookBackHours);
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to process follow-ups');
      return 0;
    }
  }
}

// ============================================================================
// JOB CONFIGS FOR CLOUD SCHEDULER
// ============================================================================

export const calendarJobs = {
  weeklyDigest: new WeeklyCalendarDigestJob(),
  preMeetingNotifications: new PreMeetingNotificationsJob(),
  meetingFollowUp: new MeetingFollowUpJob(),

  getJobConfigs() {
    return [
      {
        name: 'weeklyCalendarDigest',
        description: 'Send weekly calendar digest to users',
        schedule: '0 9 * * 0', // Every Sunday at 9 AM
        endpoint: '/api/jobs/weekly-calendar-digest',
      },
      {
        name: 'preMeetingNotifications',
        description: 'Check and send pre-meeting notifications',
        schedule: '*/5 * * * *', // Every 5 minutes
        endpoint: '/api/jobs/pre-meeting-notifications',
      },
      {
        name: 'meetingFollowUp',
        description: 'Process meeting follow-ups',
        schedule: '0 18 * * *', // Every day at 6 PM
        endpoint: '/api/jobs/meeting-follow-up',
      },
    ];
  },

  async runWeeklyDigest(config?: Partial<WeeklyDigestConfig>) {
    return this.weeklyDigest.run(config);
  },

  async runPreMeetingNotifications(config?: Partial<PreMeetingNotificationsConfig>) {
    return this.preMeetingNotifications.run(config);
  },

  async runMeetingFollowUp(config?: Partial<FollowUpAutomationConfig>) {
    return this.meetingFollowUp.run(config);
  },
};

export default calendarJobs;
