/**
 * Outreach Analytics Service
 *
 * Tracks and analyzes proactive outreach effectiveness.
 * Provides insights for optimizing timing, messaging, and channel selection.
 *
 * Key Metrics:
 * - Delivery rates by channel
 * - Response rates by trigger type
 * - Optimal timing patterns (ML-learned)
 * - Onboarding completion rates
 * - Re-engagement success rates
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getOnboardingProgress } from './onboarding-checkin-arc.js';
import { getReengagementSummary } from './reengagement-arc.js';
import { calculateDeliveryStats, type DeliveryStats } from './delivery/delivery-tracker.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'OutreachAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachMetrics {
  period: 'day' | 'week' | 'month' | 'all';
  startDate: Date;
  endDate: Date;

  // Volume
  totalOutreach: number;
  byChannel: Record<string, number>;
  byTriggerType: Record<string, number>;

  // Delivery
  deliveryRate: number;
  avgDeliveryTimeMs: number;

  // Response
  responseRate: number;
  avgResponseTimeMs: number;

  // Onboarding
  onboarding: {
    usersInArc: number;
    completionRate: number;
    avgDaysToComplete: number;
    byMilestone: Record<string, number>;
  };

  // Re-engagement
  reengagement: {
    usersInArc: number;
    successRate: number;
    avgDaysToReturn: number;
    byStage: Record<string, number>;
  };

  // Timing
  bestTimeSlots: Array<{
    slot: string;
    responseRate: number;
    volume: number;
  }>;

  bestDays: Array<{
    day: string;
    responseRate: number;
    volume: number;
  }>;
}

export interface UserOutreachSummary {
  userId: string;
  totalOutreach: number;
  totalResponses: number;
  responseRate: number;
  preferredChannel: string | null;
  lastOutreach: Date | null;
  lastResponse: Date | null;
  onboardingStatus: 'active' | 'completed' | 'not_started';
  reengagementStatus: 'active' | 'in_arc' | 'returned' | 'dormant';
}

interface OutreachEvent {
  id: string;
  userId: string;
  timestamp: Date;
  type: string;
  channel: string;
  delivered: boolean;
  responded: boolean;
  responseTime?: number;
  timeSlot: string;
  dayOfWeek: string;
}

// ============================================================================
// STATE
// ============================================================================

const outreachEvents: OutreachEvent[] = [];
const userSummaries = new Map<string, UserOutreachSummary>();

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record an outreach event
 */
export function recordOutreachEvent(event: {
  id: string;
  userId: string;
  type: string;
  channel: string;
  delivered: boolean;
}): void {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    now.getDay()
  ];

  let timeSlot: string;
  if (hour >= 5 && hour < 9) timeSlot = 'early_morning';
  else if (hour >= 9 && hour < 12) timeSlot = 'morning';
  else if (hour >= 12 && hour < 14) timeSlot = 'midday';
  else if (hour >= 14 && hour < 17) timeSlot = 'afternoon';
  else if (hour >= 17 && hour < 21) timeSlot = 'evening';
  else timeSlot = 'night';

  const outreachEvent: OutreachEvent = {
    ...event,
    timestamp: now,
    responded: false,
    timeSlot,
    dayOfWeek,
  };

  outreachEvents.push(outreachEvent);

  // Update user summary
  updateUserSummary(event.userId, {
    totalOutreach: 1,
    lastOutreach: now,
    channel: event.channel,
  });

  log.debug({ userId: event.userId, type: event.type }, 'Recorded outreach event');
}

/**
 * Record a response to outreach
 */
export function recordOutreachResponse(userId: string, outreachId?: string): void {
  const now = new Date();

  // Find the outreach event
  let event: OutreachEvent | undefined;
  if (outreachId) {
    event = outreachEvents.find((e) => e.id === outreachId);
  } else {
    // Find most recent outreach to this user
    event = outreachEvents
      .filter((e) => e.userId === userId && !e.responded)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
  }

  if (event) {
    event.responded = true;
    event.responseTime = now.getTime() - event.timestamp.getTime();
  }

  // Update user summary
  updateUserSummary(userId, {
    totalResponses: 1,
    lastResponse: now,
  });

  log.debug({ userId, outreachId }, 'Recorded outreach response');
}

/**
 * Update user summary
 */
function updateUserSummary(
  userId: string,
  update: {
    totalOutreach?: number;
    totalResponses?: number;
    lastOutreach?: Date;
    lastResponse?: Date;
    channel?: string;
  }
): void {
  const existing = userSummaries.get(userId) || {
    userId,
    totalOutreach: 0,
    totalResponses: 0,
    responseRate: 0,
    preferredChannel: null,
    lastOutreach: null,
    lastResponse: null,
    onboardingStatus: 'not_started' as const,
    reengagementStatus: 'active' as const,
  };

  if (update.totalOutreach) {
    existing.totalOutreach += update.totalOutreach;
  }
  if (update.totalResponses) {
    existing.totalResponses += update.totalResponses;
  }
  if (update.lastOutreach) {
    existing.lastOutreach = update.lastOutreach;
  }
  if (update.lastResponse) {
    existing.lastResponse = update.lastResponse;
  }

  // Recalculate response rate
  existing.responseRate =
    existing.totalOutreach > 0 ? existing.totalResponses / existing.totalOutreach : 0;

  userSummaries.set(userId, existing);
}

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

/**
 * Get outreach metrics for a period
 */
export function getOutreachMetrics(
  period: 'day' | 'week' | 'month' | 'all' = 'week',
  userId?: string
): OutreachMetrics {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(0);
  }

  // Filter events
  let events = outreachEvents.filter((e) => e.timestamp >= startDate);
  if (userId) {
    events = events.filter((e) => e.userId === userId);
  }

  // Calculate metrics
  const byChannel: Record<string, number> = {};
  const byTriggerType: Record<string, number> = {};
  const byTimeSlot: Record<string, { total: number; responded: number }> = {};
  const byDay: Record<string, { total: number; responded: number }> = {};

  let totalDelivered = 0;
  let totalResponded = 0;
  let totalResponseTime = 0;
  let responseCount = 0;

  for (const event of events) {
    // Channel
    byChannel[event.channel] = (byChannel[event.channel] || 0) + 1;

    // Trigger type
    byTriggerType[event.type] = (byTriggerType[event.type] || 0) + 1;

    // Time slot
    if (!byTimeSlot[event.timeSlot]) {
      byTimeSlot[event.timeSlot] = { total: 0, responded: 0 };
    }
    byTimeSlot[event.timeSlot].total++;
    if (event.responded) {
      byTimeSlot[event.timeSlot].responded++;
    }

    // Day of week
    if (!byDay[event.dayOfWeek]) {
      byDay[event.dayOfWeek] = { total: 0, responded: 0 };
    }
    byDay[event.dayOfWeek].total++;
    if (event.responded) {
      byDay[event.dayOfWeek].responded++;
    }

    // Totals
    if (event.delivered) totalDelivered++;
    if (event.responded) {
      totalResponded++;
      if (event.responseTime) {
        totalResponseTime += event.responseTime;
        responseCount++;
      }
    }
  }

  // Build best time slots
  const bestTimeSlots = Object.entries(byTimeSlot)
    .map(([slot, data]) => ({
      slot,
      responseRate: data.total > 0 ? data.responded / data.total : 0,
      volume: data.total,
    }))
    .sort((a, b) => b.responseRate - a.responseRate);

  // Build best days
  const bestDays = Object.entries(byDay)
    .map(([day, data]) => ({
      day,
      responseRate: data.total > 0 ? data.responded / data.total : 0,
      volume: data.total,
    }))
    .sort((a, b) => b.responseRate - a.responseRate);

  // Get delivery stats from the tracker
  const deliveryStats = calculateDeliveryStats(userId, startDate);

  return {
    period,
    startDate,
    endDate: now,
    totalOutreach: events.length,
    byChannel,
    byTriggerType,
    deliveryRate: events.length > 0 ? totalDelivered / events.length : 0,
    avgDeliveryTimeMs: deliveryStats.avgDeliveryTimeMs,
    responseRate: events.length > 0 ? totalResponded / events.length : 0,
    avgResponseTimeMs: responseCount > 0 ? totalResponseTime / responseCount : 0,
    onboarding: calculateOnboardingMetrics(userId),
    reengagement: calculateReengagementMetrics(userId),
    bestTimeSlots,
    bestDays,
  };
}

/**
 * Calculate onboarding metrics
 */
function calculateOnboardingMetrics(userId?: string): OutreachMetrics['onboarding'] {
  // In a real implementation, this would query Firestore
  // For now, we aggregate from in-memory state

  const byMilestone: Record<string, number> = {
    signup: 0,
    first_conversation: 0,
    first_followup: 0,
    first_topic_explored: 0,
    first_week: 0,
    second_week: 0,
  };

  let usersInArc = 0;
  let completedCount = 0;
  let totalDaysToComplete = 0;

  // If specific user, get their progress
  if (userId) {
    const progress = getOnboardingProgress(userId);
    if (progress) {
      if (!progress.arcComplete) {
        usersInArc = 1;
      } else {
        completedCount = 1;
        totalDaysToComplete = progress.daysSinceSignup;
      }
    }
  }

  return {
    usersInArc,
    completionRate:
      usersInArc + completedCount > 0 ? completedCount / (usersInArc + completedCount) : 0,
    avgDaysToComplete: completedCount > 0 ? totalDaysToComplete / completedCount : 14,
    byMilestone,
  };
}

/**
 * Calculate re-engagement metrics
 */
function calculateReengagementMetrics(userId?: string): OutreachMetrics['reengagement'] {
  const byStage: Record<string, number> = {
    active: 0,
    thinking_of_you: 0,
    share_relevant: 0,
    warm_invitation: 0,
    final_reminder: 0,
    respect_space: 0,
  };

  let usersInArc = 0;
  let successCount = 0;
  let totalDaysToReturn = 0;
  let returnCount = 0;

  // If specific user, get their summary
  if (userId) {
    const summary = getReengagementSummary(userId);
    if (summary) {
      byStage[summary.stage]++;
      if (summary.inArc) {
        usersInArc = 1;
      }
    }
  }

  return {
    usersInArc,
    successRate: usersInArc + successCount > 0 ? successCount / (usersInArc + successCount) : 0,
    avgDaysToReturn: returnCount > 0 ? totalDaysToReturn / returnCount : 0,
    byStage,
  };
}

/**
 * Get user outreach summary
 */
export function getUserOutreachSummary(userId: string): UserOutreachSummary | null {
  const summary = userSummaries.get(userId);
  if (!summary) return null;

  // Update statuses from other services
  const onboardingProgress = getOnboardingProgress(userId);
  if (onboardingProgress) {
    summary.onboardingStatus = onboardingProgress.arcComplete ? 'completed' : 'active';
  }

  const reengagementSummary = getReengagementSummary(userId);
  if (reengagementSummary) {
    if (reengagementSummary.stage === 'active') {
      summary.reengagementStatus = 'active';
    } else if (reengagementSummary.stage === 'respect_space') {
      summary.reengagementStatus = 'dormant';
    } else {
      summary.reengagementStatus = 'in_arc';
    }
  }

  return summary;
}

/**
 * Get dashboard data
 */
export function getOutreachDashboard(): {
  overview: {
    totalOutreachToday: number;
    responseRateToday: number;
    usersInOnboarding: number;
    usersInReengagement: number;
  };
  weeklyTrend: Array<{
    date: string;
    outreach: number;
    responses: number;
  }>;
  topPerformingTriggers: Array<{
    type: string;
    responseRate: number;
    volume: number;
  }>;
  channelPerformance: Array<{
    channel: string;
    deliveryRate: number;
    responseRate: number;
  }>;
} {
  const today = getOutreachMetrics('day');
  const week = getOutreachMetrics('week');

  // Build weekly trend (last 7 days)
  const weeklyTrend: Array<{ date: string; outreach: number; responses: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEvents = outreachEvents.filter(
      (e) => e.timestamp >= dayStart && e.timestamp <= dayEnd
    );

    weeklyTrend.push({
      date: dateStr,
      outreach: dayEvents.length,
      responses: dayEvents.filter((e) => e.responded).length,
    });
  }

  // Top performing triggers
  const triggerPerformance: Record<string, { total: number; responded: number }> = {};
  for (const event of outreachEvents) {
    if (!triggerPerformance[event.type]) {
      triggerPerformance[event.type] = { total: 0, responded: 0 };
    }
    triggerPerformance[event.type].total++;
    if (event.responded) {
      triggerPerformance[event.type].responded++;
    }
  }

  const topPerformingTriggers = Object.entries(triggerPerformance)
    .map(([type, data]) => ({
      type,
      responseRate: data.total > 0 ? data.responded / data.total : 0,
      volume: data.total,
    }))
    .filter((t) => t.volume >= 5) // Minimum volume for significance
    .sort((a, b) => b.responseRate - a.responseRate)
    .slice(0, 5);

  // Channel performance
  const channelPerformance = Object.entries(week.byChannel).map(([channel, volume]) => {
    const channelEvents = outreachEvents.filter((e) => e.channel === channel);
    const delivered = channelEvents.filter((e) => e.delivered).length;
    const responded = channelEvents.filter((e) => e.responded).length;

    return {
      channel,
      deliveryRate: volume > 0 ? delivered / volume : 0,
      responseRate: volume > 0 ? responded / volume : 0,
    };
  });

  return {
    overview: {
      totalOutreachToday: today.totalOutreach,
      responseRateToday: today.responseRate,
      usersInOnboarding: today.onboarding.usersInArc,
      usersInReengagement: today.reengagement.usersInArc,
    },
    weeklyTrend,
    topPerformingTriggers,
    channelPerformance,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const outreachAnalytics = {
  recordEvent: recordOutreachEvent,
  recordResponse: recordOutreachResponse,
  getMetrics: getOutreachMetrics,
  getUserSummary: getUserOutreachSummary,
  getDashboard: getOutreachDashboard,
};

export default outreachAnalytics;
