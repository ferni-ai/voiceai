/**
 * Automated Outreach Scheduler
 *
 * > "We show up. Every day. Without being asked."
 *
 * Cloud Scheduler integration for automated proactive outreach:
 * - Daily check-ins at optimal times
 * - Onboarding arc progression
 * - Re-engagement campaigns
 * - Milestone celebrations
 *
 * Runs on Cloud Scheduler (cron) and respects:
 * - User preferences and quiet hours
 * - Optimal timing per user
 * - Rate limits and quotas
 *
 * @module AutomatedScheduler
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { deliver, getChannelStatus, type DeliveryChannel } from './unified-delivery.js';
import {
  generatePersonalizedContent,
  type UserContext,
  type OutreachType,
} from './llm-content-generator.js';
import { getOnboardingState, getPendingCheckIns } from './intelligent-onboarding-arc.js';
import { getOptimalOutreachTime, getPreferredChannel } from './engagement-tracking.js';

const log = createLogger({ module: 'AutomatedScheduler' });

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

export interface SchedulerResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    userId: string;
    status: 'sent' | 'skipped' | 'error';
    channel?: string;
    reason?: string;
  }>;
}

interface UserOutreachCandidate {
  userId: string;
  email?: string;
  phone?: string;
  name?: string;
  daysSinceSignup: number;
  lastConversationDate?: Date;
  lastOutreachDate?: Date;
  onboardingDay?: number;
  engagementLevel: 'high' | 'medium' | 'low' | 'silent';
  outreachPreferences?: {
    enabled: boolean;
    channels: DeliveryChannel[];
    quietHoursStart?: number;
    quietHoursEnd?: number;
    timezone?: string;
  };
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
    details: [],
  };

  try {
    // Get candidates for outreach
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

    log.info(
      {
        processed: result.processed,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      },
      'Daily outreach job complete'
    );

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
): Promise<{ sent: boolean; channel?: string; reason?: string }> {
  const { userId, email, phone, name, daysSinceSignup, engagementLevel } = candidate;

  // Check if outreach is enabled for this user
  if (candidate.outreachPreferences?.enabled === false) {
    return { sent: false, reason: 'Outreach disabled by user' };
  }

  // Check quiet hours
  if (config.respectQuietHours && isInQuietHours(candidate)) {
    return { sent: false, reason: 'In quiet hours' };
  }

  // Determine outreach type based on user state
  const outreachType = await determineOutreachType(candidate);
  if (!outreachType) {
    return { sent: false, reason: 'No outreach needed' };
  }

  // Determine best channel
  const channel = await determineBestChannel(candidate);
  if (!channel) {
    return { sent: false, reason: 'No available channel' };
  }

  // Check if we have contact info for the channel
  if (channel === 'email' && !email) {
    return { sent: false, reason: 'No email address' };
  }
  if ((channel === 'sms' || channel === 'voice_call') && !phone) {
    return { sent: false, reason: 'No phone number' };
  }

  // Build user context for personalization
  const userContext: UserContext = {
    userId,
    name,
    daysSinceSignup,
    conversationCount: 0, // TODO: Get actual count
    engagementLevel,
    preferredPersona: 'ferni',
  };

  // Dry run - don't actually send
  if (config.dryRun) {
    log.info({ userId, channel, outreachType }, 'Dry run - would send outreach');
    return { sent: true, channel, reason: 'Dry run' };
  }

  // Generate personalized content
  const content = await generatePersonalizedContent(userContext, outreachType, channel);

  // Send the outreach
  const deliveryResult = await deliver({
    userId,
    channel,
    content,
    email,
    phone,
    outreachType,
  });

  if (deliveryResult.success) {
    // Record that we sent outreach
    await recordOutreachSent(userId, channel, outreachType);
    return { sent: true, channel };
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
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    // Query users who:
    // 1. Have outreach enabled (or no preference set = default enabled)
    // 2. Haven't received outreach in the last 24 hours
    // 3. Are in the onboarding period or need re-engagement

    const usersSnapshot = await db
      .collection('bogle_users')
      .where('outreachPreferences.enabled', '!=', false)
      .limit(limit * 2) // Get more to filter
      .get();

    for (const doc of usersSnapshot.docs) {
      if (candidates.length >= limit) break;

      const data = doc.data();
      const userId = doc.id;

      // Check last outreach date
      const lastOutreach = data.lastOutreachDate?.toDate?.() || data.lastOutreachDate;
      if (lastOutreach && new Date(lastOutreach) > oneDayAgo) {
        continue; // Already contacted recently
      }

      // Build candidate
      const createdAt = data.createdAt?.toDate?.() || data.createdAt || now;
      const daysSinceSignup = Math.floor(
        (now.getTime() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)
      );

      candidates.push({
        userId,
        email: data.email,
        phone: data.phone || data.phoneNumber,
        name: data.displayName || data.name,
        daysSinceSignup,
        lastConversationDate: data.lastConversationDate?.toDate?.() || data.lastConversationDate,
        lastOutreachDate: lastOutreach,
        onboardingDay: data.onboardingDay,
        engagementLevel: determineEngagementLevel(data),
        outreachPreferences: data.outreachPreferences,
      });
    }

    return candidates;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get outreach candidates');
    return [];
  }
}

/**
 * Determine user engagement level based on activity
 */
function determineEngagementLevel(
  userData: Record<string, unknown>
): UserOutreachCandidate['engagementLevel'] {
  const lastConversation = userData.lastConversationDate;
  if (!lastConversation) return 'silent';

  const daysSinceLastConversation = Math.floor(
    (Date.now() - new Date(lastConversation as string).getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysSinceLastConversation <= 2) return 'high';
  if (daysSinceLastConversation <= 7) return 'medium';
  if (daysSinceLastConversation <= 14) return 'low';
  return 'silent';
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

  // Check user's preferred channels
  const allowedChannels = outreachPreferences?.channels || ['email', 'sms', 'push', 'in_app'];

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
 * Check if user is in quiet hours
 */
function isInQuietHours(candidate: UserOutreachCandidate): boolean {
  const { outreachPreferences } = candidate;

  // Default quiet hours: 10 PM - 8 AM
  const quietStart = outreachPreferences?.quietHoursStart ?? 22;
  const quietEnd = outreachPreferences?.quietHoursEnd ?? 8;
  const timezone = outreachPreferences?.timezone || 'America/Los_Angeles';

  try {
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hour = userTime.getHours();

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (quietStart > quietEnd) {
      return hour >= quietStart || hour < quietEnd;
    }

    return hour >= quietStart && hour < quietEnd;
  } catch {
    // If timezone fails, assume not in quiet hours
    return false;
  }
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
  outreachType: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db.collection('bogle_users').doc(userId).update({
      lastOutreachDate: new Date().toISOString(),
      lastOutreachChannel: channel,
      lastOutreachType: outreachType,
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record outreach');
  }
}

// ============================================================================
// CLOUD SCHEDULER ENDPOINT
// ============================================================================

/**
 * Handler for Cloud Scheduler HTTP trigger
 *
 * Called by: Cloud Scheduler job hitting /api/outreach/scheduler/daily
 */
export async function handleSchedulerTrigger(authHeader?: string): Promise<SchedulerResult> {
  // Verify the request is from Cloud Scheduler
  // In production, check for OIDC token or specific headers

  const isCloudScheduler =
    authHeader?.includes('Cloud-Scheduler') || process.env.ALLOW_MANUAL_SCHEDULER === 'true';

  if (!isCloudScheduler && process.env.NODE_ENV === 'production') {
    throw new Error('Unauthorized: Only Cloud Scheduler can trigger this endpoint');
  }

  return runDailyOutreach({
    batchSize: 100,
    respectQuietHours: true,
    dryRun: false,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const automatedScheduler = {
  runDaily: runDailyOutreach,
  handleTrigger: handleSchedulerTrigger,
};

export default automatedScheduler;
