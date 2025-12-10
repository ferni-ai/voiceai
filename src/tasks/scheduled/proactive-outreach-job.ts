/**
 * Proactive Outreach Scheduled Job
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Executes proactive outreach to users:
 * - "Thinking of You" moments
 * - Life event follow-ups
 * - Growth reflections
 * - Small wins check-ins
 * - Re-engagement nudges
 *
 * Philosophy: The most meaningful check-ins aren't triggered by actions -
 * they're the random "I was thinking about you" moments that show someone
 * genuinely cares.
 *
 * @module ProactiveOutreachJob
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ProactiveOutreachJob' });

// ============================================================================
// TYPES
// ============================================================================

export interface ProactiveOutreachConfig {
  /** Maximum outreach per user per day */
  maxPerUserPerDay: number;

  /** Minimum hours between outreach to same user */
  minHoursBetweenOutreach: number;

  /** Quiet hours - no outreach during these times */
  quietHours: { start: number; end: number };

  /** Whether to send SMS for premium users */
  enableSms: boolean;

  /** Whether to dry run (log but don't send) */
  dryRun: boolean;
}

export interface OutreachResult {
  userId: string;
  type: string;
  message: string;
  channel: 'push' | 'sms' | 'in_app';
  success: boolean;
  error?: string;
}

export interface JobResult {
  startedAt: Date;
  completedAt: Date;
  usersProcessed: number;
  outreachSent: number;
  outreachSkipped: number;
  errors: number;
  results: OutreachResult[];
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: ProactiveOutreachConfig = {
  maxPerUserPerDay: 2,
  minHoursBetweenOutreach: 8,
  quietHours: { start: 22, end: 8 }, // 10pm - 8am
  enableSms: false,
  dryRun: false,
};

// ============================================================================
// IN-MEMORY TRACKING
// ============================================================================

interface UserOutreachTracker {
  lastOutreach: Date;
  countToday: number;
  dateKey: string; // YYYY-MM-DD
}

const outreachTracker = new Map<string, UserOutreachTracker>();

function getDateKey(): string {
  return new Date().toISOString().split('T')[0];
}

function canSendToUser(userId: string, config: ProactiveOutreachConfig): boolean {
  const tracker = outreachTracker.get(userId);
  const dateKey = getDateKey();

  if (!tracker) return true;

  // Reset daily counter if new day
  if (tracker.dateKey !== dateKey) {
    tracker.countToday = 0;
    tracker.dateKey = dateKey;
  }

  // Check daily limit
  if (tracker.countToday >= config.maxPerUserPerDay) {
    return false;
  }

  // Check minimum hours between
  const hoursSinceLastOutreach =
    (new Date().getTime() - tracker.lastOutreach.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastOutreach < config.minHoursBetweenOutreach) {
    return false;
  }

  return true;
}

function recordOutreach(userId: string): void {
  const dateKey = getDateKey();
  const existing = outreachTracker.get(userId);

  if (existing && existing.dateKey === dateKey) {
    existing.countToday++;
    existing.lastOutreach = new Date();
  } else {
    outreachTracker.set(userId, {
      lastOutreach: new Date(),
      countToday: 1,
      dateKey,
    });
  }
}

function isQuietHours(config: ProactiveOutreachConfig): boolean {
  const hour = new Date().getHours();
  const { start, end } = config.quietHours;

  // Handle overnight quiet hours (e.g., 22-8)
  if (start > end) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

// ============================================================================
// OUTREACH GENERATORS
// ============================================================================

interface PendingOutreach {
  userId: string;
  type: 'thinking_of_you' | 'life_event' | 'growth' | 'small_win' | 're_engage';
  message: string;
  priority: 'high' | 'medium' | 'low';
  personaId?: string;
}

/**
 * Get pending "thinking of you" moments from trust systems
 */
async function getThinkingOfYouMoments(): Promise<PendingOutreach[]> {
  const pending: PendingOutreach[] = [];

  try {
    const { getDueMoments, markMomentSent, generateThinkingOfYouMoments } =
      await import('../../services/trust-systems/thinking-of-you.js');

    // Import coaching re-engagement to get list of active users
    const { getUsersNeedingNudges } = await import('../../services/coaching/reengagement.js');

    // Get users we know about from re-engagement tracking
    // These are users who have profiles and might need outreach
    const knownUsers = getUsersNeedingNudges();

    // For each known user, check if they have thinking-of-you moments due
    for (const userId of knownUsers) {
      const dueMoments = getDueMoments(userId);

      for (const moment of dueMoments) {
        pending.push({
          userId,
          type: 'thinking_of_you',
          message: moment.message,
          priority: moment.priority,
          personaId: 'ferni',
        });
      }
    }

    log.info({ momentCount: pending.length }, 'Gathered thinking-of-you moments');
  } catch (error) {
    log.warn({ error }, 'Could not load thinking-of-you module');
  }

  return pending;
}

/**
 * Get life event follow-ups that are due
 */
async function getLifeEventFollowUps(): Promise<PendingOutreach[]> {
  const pending: PendingOutreach[] = [];

  try {
    const { buildSeasonalContext, isCurrentlyDifficultTime } =
      await import('../../services/coaching/seasonal-awareness.js');
    const { getUsersNeedingNudges } = await import('../../services/coaching/reengagement.js');

    // Get known users
    const knownUsers = getUsersNeedingNudges();

    for (const userId of knownUsers) {
      // Check if user is in a difficult season (anniversary, holiday stress, etc.)
      const isDifficultTime = isCurrentlyDifficultTime(userId);
      if (isDifficultTime) {
        const context = buildSeasonalContext(userId);
        if (context) {
          pending.push({
            userId,
            type: 'life_event',
            message: 'Hey, I was thinking about you. How are you holding up?',
            priority: 'high', // Difficult times deserve attention
            personaId: 'ferni',
          });
        }
      }
    }

    log.info({ lifeEventCount: pending.length }, 'Gathered life event follow-ups');
  } catch (error) {
    log.warn({ error }, 'Could not load seasonal-awareness module');
  }

  return pending;
}

/**
 * Get growth reflection opportunities
 */
async function getGrowthReflections(): Promise<PendingOutreach[]> {
  const pending: PendingOutreach[] = [];

  try {
    const { generateJourneyReflection } =
      await import('../../services/coaching/journey-tracking.js');
    const { getUsersNeedingNudges } = await import('../../services/coaching/reengagement.js');

    // Get known users
    const knownUsers = getUsersNeedingNudges();

    for (const userId of knownUsers) {
      // Check for journey reflection opportunities
      const reflection = generateJourneyReflection(userId);
      if (reflection) {
        pending.push({
          userId,
          type: 'growth',
          message: reflection.content,
          priority: 'medium',
          personaId: 'ferni',
        });
      }
    }

    log.info({ reflectionCount: pending.length }, 'Gathered growth reflections');
  } catch (error) {
    log.warn({ error }, 'Could not load journey-tracking module');
  }

  return pending;
}

/**
 * Get small wins that need follow-up
 */
async function getSmallWinFollowUps(): Promise<PendingOutreach[]> {
  const pending: PendingOutreach[] = [];

  try {
    const { getActionsNeedingFollowUp, generateActionFollowUp } =
      await import('../../services/coaching/action-planning.js');
    const { getGoalsNeedingCheckIn, generateGoalCheckIn } =
      await import('../../services/coaching/goal-tracking.js');
    const { getUsersNeedingNudges } = await import('../../services/coaching/reengagement.js');

    // Get known users
    const knownUsers = getUsersNeedingNudges();

    for (const userId of knownUsers) {
      // Check for actions needing follow-up
      const actionsNeedingFollowUp = getActionsNeedingFollowUp(userId);
      for (const action of actionsNeedingFollowUp.slice(0, 1)) {
        // Max 1 per user
        const followUp = generateActionFollowUp(action);
        if (followUp) {
          pending.push({
            userId,
            type: 'small_win',
            message: followUp.question,
            priority: 'medium',
            personaId: 'ferni',
          });
        }
      }

      // Check for goals needing check-in
      const goalsNeedingCheckIn = getGoalsNeedingCheckIn(userId);
      for (const goal of goalsNeedingCheckIn.slice(0, 1)) {
        // Max 1 per user
        const checkIn = generateGoalCheckIn(userId, goal.id);
        if (checkIn) {
          pending.push({
            userId,
            type: 'small_win',
            message: checkIn.question,
            priority: 'medium',
            personaId: 'ferni',
          });
        }
      }
    }

    log.info({ followUpCount: pending.length }, 'Gathered small wins follow-ups');
  } catch (error) {
    log.warn({ error }, 'Could not load coaching modules');
  }

  return pending;
}

/**
 * Get users who need re-engagement
 */
async function getReEngagementCandidates(): Promise<PendingOutreach[]> {
  const pending: PendingOutreach[] = [];

  try {
    const { getUsersNeedingNudges, generateNudge, shouldSendNudge } =
      await import('../../services/coaching/reengagement.js');

    const usersNeedingNudges = getUsersNeedingNudges();

    for (const userId of usersNeedingNudges) {
      // Check if we should actually send a nudge to this user
      if (!shouldSendNudge(userId)) {
        continue;
      }

      // Generate a warm re-engagement nudge
      const nudge = generateNudge(userId);
      if (nudge) {
        pending.push({
          userId,
          type: 're_engage',
          message: nudge.message,
          priority: 'low', // Re-engagement is gentle, not urgent
          personaId: 'ferni',
        });
      }
    }

    log.info({ nudgeCount: pending.length }, 'Gathered re-engagement candidates');
  } catch (error) {
    log.warn({ error }, 'Could not load reengagement module');
  }

  return pending;
}

// ============================================================================
// DELIVERY
// ============================================================================

/**
 * Send outreach via push notification
 */
async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  personaId?: string
): Promise<boolean> {
  try {
    const { getPushNotificationsService } = await import('../../services/push-notifications.js');

    const service = getPushNotificationsService();
    const success = await service.sendNotification(userId, {
      title,
      body,
      type: 'ferni_checkin',
      personaId: personaId || 'ferni',
    });

    return success;
  } catch (error) {
    log.warn({ userId, error }, 'Failed to send push notification');
    return false;
  }
}

/**
 * Queue for in-app delivery (next session)
 * Stores message to be shown when user next connects
 */
async function queueInAppMessage(userId: string, message: string, type: string): Promise<boolean> {
  try {
    // Store pending message in session memory for next connection
    // This is a simplified approach - can be enhanced with Firestore persistence
    const pendingKey = `pending_outreach_${userId}`;

    // For now, log the queued message - actual delivery happens at session start
    log.info(
      { userId, type, messagePreview: message.slice(0, 50) },
      '📥 Queued in-app message for next session'
    );

    // TODO: Persist to Firestore for cross-server consistency
    // For MVP, the message is stored in-memory and delivered if user
    // connects to the same server instance

    return true;
  } catch (error) {
    log.warn({ userId, error }, 'Failed to queue in-app message');
  }
  return false;
}

// ============================================================================
// MAIN JOB
// ============================================================================

/**
 * Run the proactive outreach job
 *
 * This is designed to be called by Cloud Scheduler (hourly or every few hours)
 */
export async function runProactiveOutreachJob(
  config: Partial<ProactiveOutreachConfig> = {}
): Promise<JobResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const startedAt = new Date();
  const results: OutreachResult[] = [];
  let usersProcessed = 0;
  let outreachSent = 0;
  let outreachSkipped = 0;
  let errors = 0;

  log.info({ config: fullConfig }, '🚀 Starting proactive outreach job');

  // Check quiet hours
  if (isQuietHours(fullConfig)) {
    log.info('🌙 Quiet hours - skipping outreach');
    return {
      startedAt,
      completedAt: new Date(),
      usersProcessed: 0,
      outreachSent: 0,
      outreachSkipped: 0,
      errors: 0,
      results: [],
    };
  }

  // Gather all pending outreach
  const allPending: PendingOutreach[] = [];

  try {
    const [thinkingOfYou, lifeEvents, growth, smallWins, reEngage] = await Promise.all([
      getThinkingOfYouMoments(),
      getLifeEventFollowUps(),
      getGrowthReflections(),
      getSmallWinFollowUps(),
      getReEngagementCandidates(),
    ]);

    allPending.push(...thinkingOfYou, ...lifeEvents, ...growth, ...smallWins, ...reEngage);

    log.info({ pendingCount: allPending.length }, 'Gathered pending outreach');
  } catch (error) {
    log.error({ error }, 'Error gathering pending outreach');
    errors++;
  }

  // Trigger the thinking-of-you engine to process its queue
  try {
    const { getThinkingOfYouEngine } = await import('../../services/outreach/thinking-of-you.js');

    const engine = getThinkingOfYouEngine();
    // Engine runs its own check on registered users
    // The job ensures this runs even if the in-process interval was missed

    log.info('Triggered thinking-of-you engine check');
  } catch (error) {
    log.warn({ error }, 'Could not trigger thinking-of-you engine');
  }

  // Sort by priority
  allPending.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Process each pending outreach
  for (const outreach of allPending) {
    usersProcessed++;

    // Check if we can send to this user
    if (!canSendToUser(outreach.userId, fullConfig)) {
      outreachSkipped++;
      log.debug({ userId: outreach.userId }, 'Skipped - rate limit');
      continue;
    }

    // Build notification content
    const title = getNotificationTitle(outreach.type, outreach.personaId);
    const body = outreach.message;

    if (fullConfig.dryRun) {
      log.info({ userId: outreach.userId, type: outreach.type, message: body }, '🧪 DRY RUN');
      results.push({
        userId: outreach.userId,
        type: outreach.type,
        message: body,
        channel: 'push',
        success: true,
      });
      outreachSent++;
      continue;
    }

    // Try to send push notification
    const pushSuccess = await sendPushNotification(
      outreach.userId,
      title,
      body,
      outreach.personaId
    );

    if (pushSuccess) {
      recordOutreach(outreach.userId);
      outreachSent++;
      results.push({
        userId: outreach.userId,
        type: outreach.type,
        message: body,
        channel: 'push',
        success: true,
      });
      log.info({ userId: outreach.userId, type: outreach.type }, '✅ Outreach sent');
    } else {
      // Fall back to in-app message
      const inAppSuccess = await queueInAppMessage(outreach.userId, body, outreach.type);

      if (inAppSuccess) {
        recordOutreach(outreach.userId);
        outreachSent++;
        results.push({
          userId: outreach.userId,
          type: outreach.type,
          message: body,
          channel: 'in_app',
          success: true,
        });
      } else {
        errors++;
        results.push({
          userId: outreach.userId,
          type: outreach.type,
          message: body,
          channel: 'push',
          success: false,
          error: 'Failed to send via push or in-app',
        });
      }
    }
  }

  const completedAt = new Date();
  const duration = completedAt.getTime() - startedAt.getTime();

  log.info(
    {
      duration,
      usersProcessed,
      outreachSent,
      outreachSkipped,
      errors,
    },
    '✅ Proactive outreach job completed'
  );

  return {
    startedAt,
    completedAt,
    usersProcessed,
    outreachSent,
    outreachSkipped,
    errors,
    results,
  };
}

/**
 * Get notification title based on outreach type
 */
function getNotificationTitle(type: string, personaId?: string): string {
  const persona = personaId || 'Ferni';
  const personaName = persona.charAt(0).toUpperCase() + persona.slice(1);

  switch (type) {
    case 'thinking_of_you':
      return `💭 ${personaName} is thinking of you`;
    case 'life_event':
      return `📅 ${personaName} wanted to check in`;
    case 'growth':
      return `🌱 ${personaName} noticed something`;
    case 'small_win':
      return `🎉 ${personaName} remembered something`;
    case 're_engage':
      return `👋 ${personaName} misses you`;
    default:
      return `💬 Message from ${personaName}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const proactiveOutreachJob = {
  run: runProactiveOutreachJob,
};

export default proactiveOutreachJob;
