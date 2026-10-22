/**
 * Automated Outreach Scheduler
 * > "We show up. Every day. Without being asked."
 *
 * Cloud Scheduler integration for automated proactive outreach:
 * - Daily check-ins at optimal times
 * - Onboarding arc progression
 * - Re-engagement campaigns
 * - Milestone celebrations
 * Runs on Cloud Scheduler (cron) and respects:
 * - User preferences and quiet hours
 * - Optimal timing per user
 * - Rate limits and quotas
 * @module AutomatedScheduler
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isPersonAccountId, nonAccountPrefixOf } from '../../utils/synthetic-user.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { deliver, getChannelStatus, type DeliveryChannel } from './unified-delivery.js';
import {
  generatePersonalizedContent,
  type UserContext,
  type OutreachType,
} from './llm-content-generator.js';
import { getOnboardingState, getPendingCheckIns } from './intelligent-onboarding-arc.js';
import { getOptimalOutreachTime, getPreferredChannel } from './engagement-tracking.js';
import { allowedDeliveryChannels } from './outreach-consent.js';
import { verifiedPhoneOf } from './user-reach.js';
import { isValidTimezone } from './call-hours-guard.js';
import { hoursWindow, isQuietAt, isQuietHoursUnified, isUserQuiet } from './quiet-hours.js';
import {
  cadenceHold,
  conversationCountOf,
  engagementLevel as engagementLevelOf,
  lastTalkedAt,
  unansweredCount,
} from './outreach-cadence.js';
import { dailyCheckIn } from './proactive-channels/daily-checkin.js';
import { blocksGenericCheckIns } from './grounded-checkin.js';
import { pushInAppIfOn } from './in-app-push.js';
import { skipReasonCounts, type SchedulerResult } from './scheduler-report.js';

const log = createLogger({ module: 'AutomatedScheduler' });

const CANDIDATE_PAGE_SIZE = 200;
/** Bound one run's reads; users past this are reached on later days. */
const MAX_USERS_SCANNED = 5000;

// ============================================================================
// TYPES
// ============================================================================

export interface SchedulerConfig {
  /** Max users to process per run */
  batchSize: number;
  /** Respect user quiet hours */
  respectQuietHours: boolean;
  /** Dry run (don't actually send) */
  dryRun: boolean;
}

export type { SchedulerResult };

interface UserOutreachCandidate {
  userId: string;
  email?: string;
  phone?: string;
  name?: string;
  daysSinceSignup: number;
  conversationCount?: number;
  lastConversationDate?: Date;
  lastOutreachDate?: Date;
  onboardingDay?: number;
  engagementLevel: 'high' | 'medium' | 'low' | 'silent';
  /** Messages sent since their last conversation. */
  unanswered: number;
  outreachPreferences?: {
    enabled?: boolean;
    /** Channels the user opted into; unset means in-app only. */
    channels?: DeliveryChannel[];
    quietHoursStart?: number;
    quietHoursEnd?: number;
    timezone?: string;
  };
  contactInfo?: { timezone?: string };
}

// ============================================================================
// MAIN SCHEDULER FUNCTIONS
// ============================================================================

/**
 * Run the daily outreach job
 *
 * Called by Cloud Scheduler (e.g., every morning at 9 AM)
 */
export async function runDailyOutreach(
  config: Partial<SchedulerConfig> = {}
): Promise<SchedulerResult> {
  const { batchSize = 100, respectQuietHours = true, dryRun = false } = config;

  log.info({ batchSize, dryRun }, 'Starting daily outreach job');

  const result: SchedulerResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    skipReasons: {},
    genericCheckInsBlocked: blocksGenericCheckIns(),
    details: [],
  };

  try {
    const candidates = await getOutreachCandidates(batchSize);
    log.info({ candidateCount: candidates.length }, 'Found outreach candidates');

    for (const candidate of candidates) {
      result.processed++;

      try {
        const outreachResult = await processCandidate(candidate, { respectQuietHours, dryRun });

        if (outreachResult.sent) {
          result.sent++;
          result.details.push({
            userId: candidate.userId,
            status: 'sent',
            channel: outreachResult.channel,
            outreachType: outreachResult.outreachType,
          });
        } else {
          result.skipped++;
          result.details.push({
            userId: candidate.userId,
            status: 'skipped',
            reason: outreachResult.reason,
          });
        }
      } catch (error) {
        result.errors++;
        result.details.push({
          userId: candidate.userId,
          status: 'error',
          reason: String(error),
        });
        log.error({ error: String(error), userId: candidate.userId }, 'Error processing candidate');
      }
    }

    result.skipReasons = skipReasonCounts(result.details);
    // Counts and reasons only: details carry user IDs and stay out of the log.
    const { details: _details, ...summary } = result;
    log.info(summary, 'Daily outreach job complete');

    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Daily outreach job failed');
    throw error;
  }
}

/**
 * Process a single candidate for outreach
 */
async function processCandidate(
  candidate: UserOutreachCandidate,
  config: { respectQuietHours: boolean; dryRun: boolean }
): Promise<{ sent: boolean; channel?: string; outreachType?: string; reason?: string }> {
  const { userId, email, phone, name, daysSinceSignup, engagementLevel } = candidate;

  // Check if outreach is enabled for this user
  if (candidate.outreachPreferences?.enabled === false) {
    return { sent: false, reason: 'Outreach disabled by user' };
  }

  // Proactive dogfood users (PROACTIVE_CHANNELS): channel, quiet hours (in
  // their own time zone) and caps come from the proactive channel policy.
  const now = new Date();
  const proactive = await dailyCheckIn(userId, now);

  // Check quiet hours
  if (!proactive && config.respectQuietHours && isInQuietHours(candidate)) {
    return { sent: false, reason: 'In quiet hours' };
  }

  // Determine outreach type based on user state
  const outreachType = await determineOutreachType(candidate);
  if (!outreachType) {
    return { sent: false, reason: 'No outreach needed' };
  }
  if (blocksGenericCheckIns()) return { sent: false, reason: 'No grounded reason to reach out' };

  // Determine best channel
  const channel = proactive ? proactive.channel : await determineBestChannel(candidate);
  if (!channel) {
    return { sent: false, reason: proactive?.why ?? 'No available channel' };
  }

  // Check if we have contact info for the channel
  if (channel === 'email' && !email) {
    return { sent: false, reason: 'No email address' };
  }
  if ((channel === 'sms' || channel === 'voice_call') && !phone) {
    return { sent: false, reason: 'No phone number' };
  }

  const userContext: UserContext = {
    userId,
    name,
    daysSinceSignup,
    conversationCount: candidate.conversationCount, // unknown: the writer is told no number
    engagementLevel,
    preferredPersona: 'ferni',
  };

  // Dry run - don't actually send
  if (config.dryRun) {
    log.info({ userId, channel, outreachType }, 'Dry run - would send outreach');
    return { sent: true, channel, outreachType, reason: 'Dry run' };
  }

  // Generate personalized content (allowlisted users: the proactive writer)
  const content = proactive
    ? await proactive.content()
    : await generatePersonalizedContent(userContext, outreachType, channel);

  // Send the outreach
  const deliveryResult = await deliver({
    userId,
    channel,
    content,
    email,
    phone,
    outreachType,
  });

  await proactive?.done(outreachType, deliveryResult.success);
  await pushInAppIfOn(userId, deliveryResult, { ...content, kind: outreachType });

  if (deliveryResult.success) {
    // Record that we sent outreach
    await recordOutreachSent(userId, channel, outreachType, candidate.unanswered + 1);
    return { sent: true, channel, outreachType };
  }

  return { sent: false, reason: deliveryResult.error };
}

// ============================================================================
// CANDIDATE SELECTION
// ============================================================================

/**
 * Get users who are candidates for outreach
 */
async function getOutreachCandidates(limit: number): Promise<UserOutreachCandidate[]> {
  const db = getFirestoreDb();
  if (!db) {
    log.warn('Firestore not available');
    return [];
  }

  const candidates: UserOutreachCandidate[] = [];
  const now = new Date();

  try {
    // Everyone is a candidate unless they switched outreach off. A
    // where('outreachPreferences.enabled', '!=', false) query can't express
    // that: Firestore's != skips documents without the field, which made this
    // opt-in only. So page through users and filter here.
    let lastId: string | undefined;
    let scanned = 0;
    while (candidates.length < limit && scanned < MAX_USERS_SCANNED) {
      let query = db.collection('bogle_users').orderBy('__name__').limit(CANDIDATE_PAGE_SIZE);
      if (lastId) query = query.startAfter(lastId);
      const page = await query.get();
      if (page.empty) break;
      scanned += page.size;
      lastId = page.docs[page.docs.length - 1].id;
      // anon:/onbehalf: docs pile up one per session: jump past the rest of
      // that id range rather than spend the scan bound reading it.
      const prefix = nonAccountPrefixOf(lastId);
      if (prefix) lastId = `${prefix}\uf8ff`;

      for (const doc of page.docs) {
        if (candidates.length >= limit) break;

        const data = doc.data();
        const userId = doc.id;
        if (data.outreachPreferences?.enabled === false) continue;
        // Test harnesses and ids that name no account: skipped before the cap.
        if (!isPersonAccountId(userId)) continue;

        const lastOutreach = data.lastOutreachDate?.toDate?.() || data.lastOutreachDate;
        const engagementLevel = engagementLevelOf(data, now.getTime());
        const talkedAt = lastTalkedAt(data);
        // Quieter users wait longer between messages; unanswered ones stop.
        if (cadenceHold(data, engagementLevel, now.getTime())) continue;

        const createdAt = data.createdAt?.toDate?.() || data.createdAt || now;
        const daysSinceSignup = Math.floor(
          (now.getTime() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)
        );

        candidates.push({
          userId,
          email: data.email,
          phone: verifiedPhoneOf(userId, data), // never the model-written profile phone
          name: data.displayName || data.name,
          daysSinceSignup,
          conversationCount: conversationCountOf(data),
          lastConversationDate: talkedAt === undefined ? undefined : new Date(talkedAt),
          lastOutreachDate: lastOutreach,
          onboardingDay: data.onboardingDay,
          engagementLevel,
          unanswered: unansweredCount(data),
          outreachPreferences: data.outreachPreferences,
          contactInfo: data.contactInfo,
        });
      }
      if (page.size < CANDIDATE_PAGE_SIZE) break;
    }

    return candidates;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get outreach candidates');
    return [];
  }
}

// ============================================================================
// OUTREACH DECISION LOGIC
// ============================================================================

/**
 * Determine what type of outreach to send
 */
async function determineOutreachType(
  candidate: UserOutreachCandidate
): Promise<OutreachType | null> {
  const { daysSinceSignup, engagementLevel, lastConversationDate } = candidate;

  // Onboarding arc (first 14 days)
  if (daysSinceSignup <= 14) {
    const onboardingState = await getOnboardingState(candidate.userId);
    const pendingCheckIns = await getPendingCheckIns(candidate.userId);
    const nextCheckIn = pendingCheckIns[0] ?? null;

    if (nextCheckIn) {
      // Map onboarding day to outreach type
      const dayTypeMap: Record<number, OutreachType> = {
        1: 'welcome_followup',
        2: 'next_day_check',
        3: 'topic_deepdive',
        5: 'first_week_reflection',
        7: 'momentum_check',
        10: 'thinking_of_you',
        14: 'two_week_celebration',
      };

      return dayTypeMap[daysSinceSignup] || 'thinking_of_you';
    }
  }

  // Re-engagement based on engagement level
  switch (engagementLevel) {
    case 'high':
      // Active users - occasional thinking of you
      return Math.random() < 0.3 ? 'thinking_of_you' : null;

    case 'medium':
      // Somewhat active - gentle check-in
      return 'momentum_check';

    case 'low':
      // Less active - warmer outreach
      return 'reengagement_gentle';

    case 'silent':
      // Haven't heard from in a while - warmth campaign
      return 'reengagement_warmth';

    default:
      return null;
  }
}

/**
 * Determine the best channel to reach this user
 */
async function determineBestChannel(
  candidate: UserOutreachCandidate
): Promise<DeliveryChannel | null> {
  const { userId, email, phone, outreachPreferences } = candidate;

  // In-app plus only the channels this user opted into (unset = in-app only)
  const allowedChannels = allowedDeliveryChannels(outreachPreferences);

  // Check what channels are available
  const channelStatus = await getChannelStatus();

  // Get user's preferred channel from engagement history
  const preferredChannel = await getPreferredChannel(userId);

  // Priority order based on engagement history and availability
  const priorityOrder: DeliveryChannel[] = preferredChannel
    ? [preferredChannel, 'email', 'sms', 'push', 'in_app']
    : ['email', 'sms', 'push', 'in_app'];

  for (const channel of priorityOrder) {
    if (!allowedChannels.includes(channel)) continue;

    switch (channel) {
      case 'email':
        if (channelStatus.email.available && email) return 'email';
        break;
      case 'sms':
        if (channelStatus.sms.available && phone) return 'sms';
        break;
      case 'voice_call':
        if (channelStatus.voice_call.available && phone) return 'voice_call';
        break;
      case 'push':
        if (channelStatus.push.available) return 'push';
        break;
      case 'in_app':
        return 'in_app'; // Always available
    }
  }

  return 'in_app'; // Fallback
}

// ============================================================================
// QUIET HOURS
// ============================================================================

/**
 * Is it quiet hours for this user now? QUIET_HOURS_UNIFIED=on uses the shared
 * predicate (quiet-hours.ts): 22:00-08:00 and both US coasts when the zone is
 * unknown. Off, this scheduler keeps its own window: 21:00-08:00 Eastern unless
 * the user set one. A zone that cannot be read fails closed.
 */
function isInQuietHours(candidate: UserOutreachCandidate): boolean {
  if (isQuietHoursUnified()) return isUserQuiet(candidate);
  const prefs = candidate.outreachPreferences;
  const zone = prefs?.timezone || 'America/New_York';
  if (!isValidTimezone(zone)) return true;
  const window = hoursWindow(prefs?.quietHoursStart ?? 21, prefs?.quietHoursEnd ?? 8);
  return isQuietAt(new Date(), window, [zone]);
}

// ============================================================================
// RECORD KEEPING
// ============================================================================

/**
 * Record that outreach was sent
 */
async function recordOutreachSent(
  userId: string,
  channel: DeliveryChannel,
  outreachType: string,
  unanswered: number
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db.collection('bogle_users').doc(userId).update({
      lastOutreachDate: new Date().toISOString(),
      lastOutreachChannel: channel,
      lastOutreachType: outreachType,
      outreachUnanswered: unanswered,
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record outreach');
  }
}

// ============================================================================
// CLOUD SCHEDULER ENDPOINT
// ============================================================================

/**
 * The scheduled daily run. Callers must have authenticated the request
 * (outreach.routes.ts accepts Cloud Scheduler's OIDC token or an admin); a
 * header check here was spoofable.
 */
export async function handleSchedulerTrigger(
  opts: { dryRun?: boolean } = {}
): Promise<SchedulerResult> {
  return runDailyOutreach({
    batchSize: 100,
    respectQuietHours: true,
    dryRun: opts.dryRun === true,
  });
}
