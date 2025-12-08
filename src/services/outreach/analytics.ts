// @ts-nocheck
/**
 * Outreach Analytics & Learning
 *
 * Tracks outreach effectiveness and learns optimal patterns:
 * - Which channels get responses
 * - Best times to reach each user
 * - Which trigger types are effective
 * - Message style that resonates
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { OutreachDecision, OutreachTriggerType } from './decision-engine.js';

const log = getLogger().child({ module: 'outreach-analytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachEvent {
  id: string;
  userId: string;
  triggerId: string;
  triggerType: OutreachTriggerType;
  channel: 'sms' | 'email' | 'call';
  personaId: string;
  timestamp: Date;
  decision: 'send' | 'skip' | 'defer';
  skipReason?: string;
}

export interface ResponseEvent {
  outreachId: string;
  userId: string;
  responseType: 'reply' | 'click' | 'open' | 'call_answered' | 'call_completed' | 'no_response';
  responseTime?: number; // milliseconds until response
  sentiment?: 'positive' | 'neutral' | 'negative';
  engagementScore?: number; // 0-1
  timestamp: Date;
}

export interface UserAnalytics {
  userId: string;
  totalOutreach: number;
  responseRate: number;
  avgResponseTime: number;
  preferredChannel: 'sms' | 'email' | 'call';
  bestTimeSlots: { hour: number; dayOfWeek: number; responseRate: number }[];
  effectiveTriggers: { type: OutreachTriggerType; rate: number }[];
  preferredPersona: string;
  lastUpdated: Date;
}

export interface GlobalAnalytics {
  totalOutreach: number;
  overallResponseRate: number;
  channelPerformance: Record<string, { sent: number; responded: number; rate: number }>;
  triggerPerformance: Record<string, { sent: number; responded: number; rate: number }>;
  personaPerformance: Record<string, { sent: number; responded: number; rate: number }>;
  timeSlotPerformance: Record<string, { sent: number; responded: number; rate: number }>;
  lastUpdated: Date;
}

// ============================================================================
// STATE
// ============================================================================

const outreachEvents: Map<string, OutreachEvent[]> = new Map();
const responseEvents: Map<string, ResponseEvent[]> = new Map();
const userAnalyticsCache: Map<string, UserAnalytics> = new Map();
let globalAnalyticsCache: GlobalAnalytics | null = null;

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record an outreach event
 */
export function recordOutreachEvent(
  decision: OutreachDecision,
  channel: 'sms' | 'email' | 'call'
): string {
  const event: OutreachEvent = {
    id: `outreach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: decision.trigger.userId,
    triggerId: decision.trigger.id,
    triggerType: decision.trigger.type,
    channel,
    personaId: decision.trigger.suggestedPersona || decision.persona || 'ferni',
    timestamp: new Date(),
    decision: decision.decision,
    skipReason: decision.skipReason,
  };

  const userId = decision.trigger.userId;
  const userEvents = outreachEvents.get(userId) || [];
  userEvents.push(event);
  outreachEvents.set(userId, userEvents);

  // Invalidate caches
  userAnalyticsCache.delete(userId);
  globalAnalyticsCache = null;

  log.debug({ eventId: event.id, userId, channel, triggerType: event.triggerType }, 'Recorded outreach event');

  return event.id;
}

/**
 * Record a response to outreach
 */
export function recordResponseEvent(params: {
  outreachId: string;
  userId: string;
  responseType: ResponseEvent['responseType'];
  responseTime?: number;
  sentiment?: ResponseEvent['sentiment'];
  engagementScore?: number;
}): void {
  const event: ResponseEvent = {
    outreachId: params.outreachId,
    userId: params.userId,
    responseType: params.responseType,
    responseTime: params.responseTime,
    sentiment: params.sentiment,
    engagementScore: params.engagementScore,
    timestamp: new Date(),
  };

  const userResponses = responseEvents.get(params.userId) || [];
  userResponses.push(event);
  responseEvents.set(params.userId, userResponses);

  // Invalidate caches
  userAnalyticsCache.delete(params.userId);
  globalAnalyticsCache = null;

  log.debug({ outreachId: params.outreachId, responseType: params.responseType }, 'Recorded response event');
}

// ============================================================================
// USER ANALYTICS
// ============================================================================

/**
 * Calculate analytics for a specific user
 */
export function calculateUserAnalytics(userId: string): UserAnalytics {
  // Check cache
  const cached = userAnalyticsCache.get(userId);
  if (cached && Date.now() - cached.lastUpdated.getTime() < 5 * 60 * 1000) {
    return cached;
  }

  const events = outreachEvents.get(userId) || [];
  const responses = responseEvents.get(userId) || [];

  // Only consider sent events
  const sentEvents = events.filter((e) => e.decision === 'send');

  // Build response map
  const responseMap = new Map<string, ResponseEvent>();
  responses.forEach((r) => responseMap.set(r.outreachId, r));

  // Calculate response rate
  const respondedEvents = sentEvents.filter(
    (e) =>
      responseMap.has(e.id) &&
      responseMap.get(e.id)?.responseType !== 'no_response'
  );
  const responseRate = sentEvents.length > 0 ? respondedEvents.length / sentEvents.length : 0;

  // Calculate average response time
  const responseTimes = responses
    .filter((r) => r.responseTime !== undefined)
    .map((r) => r.responseTime!);
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  // Find preferred channel
  const channelStats: Record<string, { sent: number; responded: number }> = {};
  sentEvents.forEach((e) => {
    if (!channelStats[e.channel]) {
      channelStats[e.channel] = { sent: 0, responded: 0 };
    }
    channelStats[e.channel].sent++;
    if (responseMap.has(e.id) && responseMap.get(e.id)?.responseType !== 'no_response') {
      channelStats[e.channel].responded++;
    }
  });

  let preferredChannel: 'sms' | 'email' | 'call' = 'sms';
  let bestChannelRate = 0;
  Object.entries(channelStats).forEach(([channel, stats]) => {
    const rate = stats.sent > 0 ? stats.responded / stats.sent : 0;
    if (rate > bestChannelRate) {
      bestChannelRate = rate;
      preferredChannel = channel as 'sms' | 'email' | 'call';
    }
  });

  // Find best time slots
  const timeSlotStats: Map<string, { sent: number; responded: number }> = new Map();
  sentEvents.forEach((e) => {
    const hour = e.timestamp.getHours();
    const dayOfWeek = e.timestamp.getDay();
    const key = `${dayOfWeek}-${hour}`;

    const stats = timeSlotStats.get(key) || { sent: 0, responded: 0 };
    stats.sent++;
    if (responseMap.has(e.id) && responseMap.get(e.id)?.responseType !== 'no_response') {
      stats.responded++;
    }
    timeSlotStats.set(key, stats);
  });

  const bestTimeSlots = Array.from(timeSlotStats.entries())
    .map(([key, stats]) => {
      const [dayOfWeek, hour] = key.split('-').map(Number);
      return {
        hour,
        dayOfWeek,
        responseRate: stats.sent > 0 ? stats.responded / stats.sent : 0,
      };
    })
    .sort((a, b) => b.responseRate - a.responseRate)
    .slice(0, 5);

  // Find effective trigger types
  const triggerStats: Record<string, { sent: number; responded: number }> = {};
  sentEvents.forEach((e) => {
    if (!triggerStats[e.triggerType]) {
      triggerStats[e.triggerType] = { sent: 0, responded: 0 };
    }
    triggerStats[e.triggerType].sent++;
    if (responseMap.has(e.id) && responseMap.get(e.id)?.responseType !== 'no_response') {
      triggerStats[e.triggerType].responded++;
    }
  });

  const effectiveTriggers = Object.entries(triggerStats)
    .map(([type, stats]) => ({
      type: type as OutreachTriggerType,
      rate: stats.sent > 0 ? stats.responded / stats.sent : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  // Find preferred persona
  const personaStats: Record<string, { sent: number; responded: number }> = {};
  sentEvents.forEach((e) => {
    if (!personaStats[e.personaId]) {
      personaStats[e.personaId] = { sent: 0, responded: 0 };
    }
    personaStats[e.personaId].sent++;
    if (responseMap.has(e.id) && responseMap.get(e.id)?.responseType !== 'no_response') {
      personaStats[e.personaId].responded++;
    }
  });

  let preferredPersona = 'ferni';
  let bestPersonaRate = 0;
  Object.entries(personaStats).forEach(([persona, stats]) => {
    const rate = stats.sent > 0 ? stats.responded / stats.sent : 0;
    if (rate > bestPersonaRate) {
      bestPersonaRate = rate;
      preferredPersona = persona;
    }
  });

  const analytics: UserAnalytics = {
    userId,
    totalOutreach: sentEvents.length,
    responseRate,
    avgResponseTime,
    preferredChannel,
    bestTimeSlots,
    effectiveTriggers,
    preferredPersona,
    lastUpdated: new Date(),
  };

  userAnalyticsCache.set(userId, analytics);
  return analytics;
}

// ============================================================================
// GLOBAL ANALYTICS
// ============================================================================

/**
 * Calculate global analytics across all users
 */
export function calculateGlobalAnalytics(): GlobalAnalytics {
  // Check cache
  if (globalAnalyticsCache && Date.now() - globalAnalyticsCache.lastUpdated.getTime() < 5 * 60 * 1000) {
    return globalAnalyticsCache;
  }

  let totalOutreach = 0;
  let totalResponded = 0;

  const channelPerformance: Record<string, { sent: number; responded: number; rate: number }> = {};
  const triggerPerformance: Record<string, { sent: number; responded: number; rate: number }> = {};
  const personaPerformance: Record<string, { sent: number; responded: number; rate: number }> = {};
  const timeSlotPerformance: Record<string, { sent: number; responded: number; rate: number }> = {};

  // Aggregate across all users
  outreachEvents.forEach((events, userId) => {
    const responses = responseEvents.get(userId) || [];
    const responseMap = new Map<string, ResponseEvent>();
    responses.forEach((r) => responseMap.set(r.outreachId, r));

    const sentEvents = events.filter((e) => e.decision === 'send');

    sentEvents.forEach((e) => {
      totalOutreach++;
      const hasResponse =
        responseMap.has(e.id) && responseMap.get(e.id)?.responseType !== 'no_response';

      if (hasResponse) totalResponded++;

      // Channel stats
      if (!channelPerformance[e.channel]) {
        channelPerformance[e.channel] = { sent: 0, responded: 0, rate: 0 };
      }
      channelPerformance[e.channel].sent++;
      if (hasResponse) channelPerformance[e.channel].responded++;

      // Trigger stats
      if (!triggerPerformance[e.triggerType]) {
        triggerPerformance[e.triggerType] = { sent: 0, responded: 0, rate: 0 };
      }
      triggerPerformance[e.triggerType].sent++;
      if (hasResponse) triggerPerformance[e.triggerType].responded++;

      // Persona stats
      if (!personaPerformance[e.personaId]) {
        personaPerformance[e.personaId] = { sent: 0, responded: 0, rate: 0 };
      }
      personaPerformance[e.personaId].sent++;
      if (hasResponse) personaPerformance[e.personaId].responded++;

      // Time slot stats
      const hour = e.timestamp.getHours();
      const slot = `${Math.floor(hour / 4) * 4}-${Math.floor(hour / 4) * 4 + 4}`;
      if (!timeSlotPerformance[slot]) {
        timeSlotPerformance[slot] = { sent: 0, responded: 0, rate: 0 };
      }
      timeSlotPerformance[slot].sent++;
      if (hasResponse) timeSlotPerformance[slot].responded++;
    });
  });

  // Calculate rates
  Object.values(channelPerformance).forEach((stats) => {
    stats.rate = stats.sent > 0 ? stats.responded / stats.sent : 0;
  });
  Object.values(triggerPerformance).forEach((stats) => {
    stats.rate = stats.sent > 0 ? stats.responded / stats.sent : 0;
  });
  Object.values(personaPerformance).forEach((stats) => {
    stats.rate = stats.sent > 0 ? stats.responded / stats.sent : 0;
  });
  Object.values(timeSlotPerformance).forEach((stats) => {
    stats.rate = stats.sent > 0 ? stats.responded / stats.sent : 0;
  });

  globalAnalyticsCache = {
    totalOutreach,
    overallResponseRate: totalOutreach > 0 ? totalResponded / totalOutreach : 0,
    channelPerformance,
    triggerPerformance,
    personaPerformance,
    timeSlotPerformance,
    lastUpdated: new Date(),
  };

  return globalAnalyticsCache;
}

// ============================================================================
// LEARNING & RECOMMENDATIONS
// ============================================================================

/**
 * Get recommendations for a user based on analytics
 */
export function getRecommendations(userId: string): {
  suggestedChannel: 'sms' | 'email' | 'call';
  suggestedTime: { hour: number; dayOfWeek: number };
  suggestedTriggers: OutreachTriggerType[];
  suggestedPersona: string;
  confidence: number;
} {
  const userStats = calculateUserAnalytics(userId);
  const globalStats = calculateGlobalAnalytics();

  // Use user's data if sufficient, otherwise fall back to global
  const hasEnoughUserData = userStats.totalOutreach >= 10;
  const confidence = hasEnoughUserData ? 0.8 : 0.5;

  const suggestedChannel = hasEnoughUserData
    ? userStats.preferredChannel
    : (Object.entries(globalStats.channelPerformance)
        .sort(([, a], [, b]) => b.rate - a.rate)[0]?.[0] as 'sms' | 'email' | 'call') || 'sms';

  const suggestedTime =
    hasEnoughUserData && userStats.bestTimeSlots.length > 0
      ? { hour: userStats.bestTimeSlots[0].hour, dayOfWeek: userStats.bestTimeSlots[0].dayOfWeek }
      : { hour: 10, dayOfWeek: 2 }; // Default: Tuesday 10am

  const suggestedTriggers =
    hasEnoughUserData && userStats.effectiveTriggers.length > 0
      ? userStats.effectiveTriggers.slice(0, 3).map((t) => t.type)
      : (['commitment_check', 'celebration', 'thinking_of_you'] as OutreachTriggerType[]);

  const suggestedPersona = hasEnoughUserData
    ? userStats.preferredPersona
    : Object.entries(globalStats.personaPerformance)
        .sort(([, a], [, b]) => b.rate - a.rate)[0]?.[0] || 'ferni';

  return {
    suggestedChannel,
    suggestedTime,
    suggestedTriggers,
    suggestedPersona,
    confidence,
  };
}

/**
 * Predict likelihood of response for a given outreach configuration
 */
export function predictResponseLikelihood(params: {
  userId: string;
  channel: 'sms' | 'email' | 'call';
  triggerType: OutreachTriggerType;
  personaId: string;
  time: Date;
}): number {
  const { userId, channel, triggerType, personaId, time } = params;
  const userStats = calculateUserAnalytics(userId);
  const globalStats = calculateGlobalAnalytics();

  const hasUserData = userStats.totalOutreach >= 5;

  // Base score from channel performance
  const channelStats = hasUserData
    ? userStats.responseRate
    : globalStats.channelPerformance[channel]?.rate || 0.3;

  // Adjust for trigger type
  const triggerRate =
    userStats.effectiveTriggers.find((t) => t.type === triggerType)?.rate ||
    globalStats.triggerPerformance[triggerType]?.rate ||
    0.3;

  // Adjust for time of day
  const hour = time.getHours();
  const timeSlot = `${Math.floor(hour / 4) * 4}-${Math.floor(hour / 4) * 4 + 4}`;
  const timeRate = globalStats.timeSlotPerformance[timeSlot]?.rate || 0.3;

  // Adjust for persona
  const personaRate = globalStats.personaPerformance[personaId]?.rate || 0.3;

  // Weighted average
  const prediction =
    channelStats * 0.3 + triggerRate * 0.3 + timeRate * 0.2 + personaRate * 0.2;

  return Math.min(1, Math.max(0, prediction));
}

// ============================================================================
// DATA EXPORT
// ============================================================================

/**
 * Export analytics data for external analysis
 */
export function exportAnalyticsData(userId?: string): {
  events: OutreachEvent[];
  responses: ResponseEvent[];
  userAnalytics: UserAnalytics[];
  globalAnalytics: GlobalAnalytics;
} {
  const events: OutreachEvent[] = [];
  const responses: ResponseEvent[] = [];
  const userAnalytics: UserAnalytics[] = [];

  if (userId) {
    events.push(...(outreachEvents.get(userId) || []));
    responses.push(...(responseEvents.get(userId) || []));
    userAnalytics.push(calculateUserAnalytics(userId));
  } else {
    outreachEvents.forEach((e) => events.push(...e));
    responseEvents.forEach((r) => responses.push(...r));
    outreachEvents.forEach((_, id) => userAnalytics.push(calculateUserAnalytics(id)));
  }

  return {
    events,
    responses,
    userAnalytics,
    globalAnalytics: calculateGlobalAnalytics(),
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Prune old analytics data
 */
export function pruneOldAnalyticsData(maxAgeDays = 90): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  let pruned = 0;

  outreachEvents.forEach((events, userId) => {
    const filtered = events.filter((e) => e.timestamp >= cutoff);
    if (filtered.length !== events.length) {
      pruned += events.length - filtered.length;
      outreachEvents.set(userId, filtered);
    }
  });

  responseEvents.forEach((responses, userId) => {
    const filtered = responses.filter((r) => r.timestamp >= cutoff);
    if (filtered.length !== responses.length) {
      pruned += responses.length - filtered.length;
      responseEvents.set(userId, filtered);
    }
  });

  // Clear caches
  userAnalyticsCache.clear();
  globalAnalyticsCache = null;

  log.info({ pruned, maxAgeDays }, 'Pruned old analytics data');
  return pruned;
}

/**
 * Clear all analytics data for a user (GDPR)
 */
export function clearUserAnalyticsData(userId: string): void {
  outreachEvents.delete(userId);
  responseEvents.delete(userId);
  userAnalyticsCache.delete(userId);
  globalAnalyticsCache = null;

  log.info({ userId }, 'Cleared user analytics data');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const analytics = {
  recordOutreach: recordOutreachEvent,
  recordResponse: recordResponseEvent,
  getUserAnalytics: calculateUserAnalytics,
  getGlobalAnalytics: calculateGlobalAnalytics,
  getRecommendations,
  predictResponse: predictResponseLikelihood,
  exportData: exportAnalyticsData,
  pruneOldData: pruneOldAnalyticsData,
  clearUserData: clearUserAnalyticsData,
};

export default analytics;

