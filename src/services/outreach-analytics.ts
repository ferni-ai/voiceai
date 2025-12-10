/**
 * Outreach Analytics Service
 *
 * Tracks and analyzes proactive outreach effectiveness:
 * - Delivery and response rates
 * - Best times to reach users
 * - Message effectiveness by type
 * - User engagement patterns
 *
 * Used to optimize outreach timing and messaging.
 *
 * PERSISTENCE: Uses Firestore for event storage with in-memory caching.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { OutreachTrigger } from './outreach-intelligence.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachEvent {
  id: string;
  userId: string;
  timestamp: Date;
  trigger: OutreachTrigger;
  method: 'sms' | 'email' | 'call';
  status: 'sent' | 'delivered' | 'failed' | 'responded';
  message: string;
  dayOfWeek: number;
  hourOfDay: number;
  responseTime?: number; // ms until user responded
  responseType?: 'conversation' | 'reply' | 'action';
}

export interface UserAnalytics {
  userId: string;
  totalSent: number;
  totalDelivered: number;
  totalResponded: number;
  responseRate: number;
  averageResponseTime: number;
  bestDays: number[];
  bestHours: number[];
  preferredMethod: 'sms' | 'email' | 'call';
  triggerEffectiveness: Record<OutreachTrigger, number>;
  lastUpdated: Date;
}

export interface GlobalAnalytics {
  totalOutreach: number;
  overallResponseRate: number;
  responseRateByTrigger: Record<string, number>;
  responseRateByMethod: Record<string, number>;
  responseRateByHour: number[];
  responseRateByDay: number[];
  topPerformingMessages: Array<{
    trigger: OutreachTrigger;
    messagePattern: string;
    responseRate: number;
    sampleSize: number;
  }>;
}

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;
const OUTREACH_EVENTS_COLLECTION = 'outreach_events';
const USER_ANALYTICS_COLLECTION = 'outreach_user_analytics';

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    getLogger().info('Outreach analytics Firestore initialized');
    return db;
  } catch (error) {
    getLogger().warn(
      { error },
      'Firestore not available for outreach analytics, using in-memory only'
    );
    return null;
  }
}

// ============================================================================
// STORAGE (In-memory cache with Firestore persistence)
// ============================================================================

const eventStore: OutreachEvent[] = [];
const userAnalyticsCache = new Map<string, UserAnalytics>();
const _eventsLoaded = false; // Reserved for future lazy-loading optimization

/**
 * Persist an outreach event to Firestore
 */
async function persistEvent(event: OutreachEvent): Promise<void> {
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(OUTREACH_EVENTS_COLLECTION)
        .doc(event.id)
        .set({
          ...event,
          timestamp: event.timestamp,
        });
    } catch (err) {
      getLogger().warn({ err, eventId: event.id }, 'Failed to persist outreach event');
    }
  }
}

/**
 * Load events for a user from Firestore
 */
async function loadUserEvents(userId: string): Promise<OutreachEvent[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection(OUTREACH_EVENTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
      } as OutreachEvent;
    });
  } catch (err) {
    getLogger().warn({ err, userId }, 'Failed to load user outreach events');
    return [];
  }
}

/**
 * Save user analytics to Firestore
 */
async function saveUserAnalytics(userId: string, analytics: UserAnalytics): Promise<void> {
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(USER_ANALYTICS_COLLECTION)
        .doc(userId)
        .set({
          ...analytics,
          updatedAt: new Date(),
        });
    } catch (err) {
      getLogger().warn({ err, userId }, 'Failed to save user analytics');
    }
  }
}

// ============================================================================
// EVENT LOGGING
// ============================================================================

/**
 * Log an outreach event
 */
export function logOutreachEvent(
  event: Omit<OutreachEvent, 'id' | 'dayOfWeek' | 'hourOfDay'>
): string {
  const id = `event_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const fullEvent: OutreachEvent = {
    ...event,
    id,
    dayOfWeek: event.timestamp.getDay(),
    hourOfDay: event.timestamp.getHours(),
  };

  eventStore.push(fullEvent);

  // Persist to Firestore
  void persistEvent(fullEvent);

  // Invalidate user analytics cache
  userAnalyticsCache.delete(event.userId);

  getLogger().debug(
    { eventId: id, userId: event.userId, trigger: event.trigger, status: event.status },
    '📊 Outreach event logged'
  );

  return id;
}

/**
 * Update event status (e.g., when user responds)
 */
export function updateEventStatus(
  eventId: string,
  status: OutreachEvent['status'],
  responseTime?: number,
  responseType?: OutreachEvent['responseType']
): void {
  const event = eventStore.find((e) => e.id === eventId);

  if (event) {
    event.status = status;
    if (responseTime !== undefined) {
      event.responseTime = responseTime;
    }
    if (responseType) {
      event.responseType = responseType;
    }

    // Persist to Firestore
    void persistEvent(event);

    // Invalidate cache
    userAnalyticsCache.delete(event.userId);

    getLogger().debug({ eventId, status, responseTime }, '📊 Outreach event updated');
  }
}

/**
 * Log a response to outreach
 */
export function logResponse(
  userId: string,
  trigger: OutreachTrigger,
  responseType: OutreachEvent['responseType']
): void {
  // Find the most recent outreach to this user with this trigger
  const recentEvents = eventStore
    .filter((e) => e.userId === userId && e.trigger === trigger && e.status !== 'responded')
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (recentEvents.length > 0) {
    const event = recentEvents[0];
    const responseTime = Date.now() - event.timestamp.getTime();

    updateEventStatus(event.id, 'responded', responseTime, responseType);

    getLogger().info(
      { userId, trigger, responseTimeMinutes: Math.round(responseTime / 60000) },
      '📊 User responded to outreach'
    );
  }
}

// ============================================================================
// USER ANALYTICS
// ============================================================================

/**
 * Get analytics for a specific user
 */
export async function getUserAnalytics(userId: string): Promise<UserAnalytics> {
  // Check cache
  const cached = userAnalyticsCache.get(userId);
  if (cached && Date.now() - cached.lastUpdated.getTime() < 5 * 60 * 1000) {
    return cached;
  }

  // Load events from Firestore if available, fall back to in-memory
  let userEvents = eventStore.filter((e) => e.userId === userId);

  // If in-memory is empty, try loading from Firestore
  if (userEvents.length === 0) {
    const firestoreEvents = await loadUserEvents(userId);
    if (firestoreEvents.length > 0) {
      // Add to in-memory cache
      eventStore.push(...firestoreEvents);
      userEvents = firestoreEvents;
    }
  }

  if (userEvents.length === 0) {
    return {
      userId,
      totalSent: 0,
      totalDelivered: 0,
      totalResponded: 0,
      responseRate: 0,
      averageResponseTime: 0,
      bestDays: [1, 2, 3, 4, 5], // Default to weekdays
      bestHours: [9, 10, 11, 14, 15, 16], // Default business hours
      preferredMethod: 'sms',
      triggerEffectiveness: {} as Record<OutreachTrigger, number>,
      lastUpdated: new Date(),
    };
  }

  const sent = userEvents.filter((e) => e.status !== 'failed');
  const delivered = userEvents.filter((e) => ['delivered', 'responded'].includes(e.status));
  const responded = userEvents.filter((e) => e.status === 'responded');

  // Calculate response rate by day
  const responsesByDay = new Map<number, { sent: number; responded: number }>();
  for (let d = 0; d < 7; d++) {
    responsesByDay.set(d, { sent: 0, responded: 0 });
  }
  for (const event of sent) {
    const day = responsesByDay.get(event.dayOfWeek)!;
    day.sent++;
    if (event.status === 'responded') day.responded++;
  }

  // Find best days (above average response rate)
  const avgRate = responded.length / Math.max(sent.length, 1);
  const bestDays = Array.from(responsesByDay.entries())
    .filter(([_, stats]) => stats.sent >= 3 && stats.responded / stats.sent > avgRate)
    .map(([day]) => day);

  // Calculate response rate by hour
  const responsesByHour = new Map<number, { sent: number; responded: number }>();
  for (let h = 0; h < 24; h++) {
    responsesByHour.set(h, { sent: 0, responded: 0 });
  }
  for (const event of sent) {
    const hour = responsesByHour.get(event.hourOfDay)!;
    hour.sent++;
    if (event.status === 'responded') hour.responded++;
  }

  // Find best hours
  const bestHours = Array.from(responsesByHour.entries())
    .filter(([_, stats]) => stats.sent >= 2 && stats.responded / stats.sent > avgRate)
    .map(([hour]) => hour);

  // Calculate method preference
  const methodCounts = { sms: 0, email: 0, call: 0 };
  for (const event of responded) {
    methodCounts[event.method]++;
  }
  const preferredMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0][0] as
    | 'sms'
    | 'email'
    | 'call';

  // Calculate trigger effectiveness
  const triggerEffectiveness: Record<string, number> = {};
  const triggerGroups = new Map<OutreachTrigger, { sent: number; responded: number }>();

  for (const event of sent) {
    if (!triggerGroups.has(event.trigger)) {
      triggerGroups.set(event.trigger, { sent: 0, responded: 0 });
    }
    const group = triggerGroups.get(event.trigger)!;
    group.sent++;
    if (event.status === 'responded') group.responded++;
  }

  for (const [trigger, stats] of triggerGroups) {
    triggerEffectiveness[trigger] = stats.sent > 0 ? stats.responded / stats.sent : 0;
  }

  // Calculate average response time
  const responseTimes = responded
    .filter((e) => e.responseTime !== undefined)
    .map((e) => e.responseTime!);
  const avgResponseTime =
    responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

  const analytics: UserAnalytics = {
    userId,
    totalSent: sent.length,
    totalDelivered: delivered.length,
    totalResponded: responded.length,
    responseRate: sent.length > 0 ? responded.length / sent.length : 0,
    averageResponseTime: avgResponseTime,
    bestDays: bestDays.length > 0 ? bestDays : [1, 2, 3, 4, 5],
    bestHours: bestHours.length > 0 ? bestHours : [9, 10, 11, 14, 15, 16],
    preferredMethod,
    triggerEffectiveness: triggerEffectiveness as Record<OutreachTrigger, number>,
    lastUpdated: new Date(),
  };

  // Cache in memory and persist to Firestore
  userAnalyticsCache.set(userId, analytics);
  void saveUserAnalytics(userId, analytics);

  return analytics;
}

// ============================================================================
// GLOBAL ANALYTICS
// ============================================================================

/**
 * Get global analytics across all users
 */
export function getGlobalAnalytics(): GlobalAnalytics {
  const sent = eventStore.filter((e) => e.status !== 'failed');
  const responded = eventStore.filter((e) => e.status === 'responded');

  // Response rate by trigger
  const responseRateByTrigger: Record<string, number> = {};
  const triggerGroups = new Map<string, { sent: number; responded: number }>();

  for (const event of sent) {
    if (!triggerGroups.has(event.trigger)) {
      triggerGroups.set(event.trigger, { sent: 0, responded: 0 });
    }
    const group = triggerGroups.get(event.trigger)!;
    group.sent++;
    if (event.status === 'responded') group.responded++;
  }

  for (const [trigger, stats] of triggerGroups) {
    responseRateByTrigger[trigger] = stats.sent > 0 ? stats.responded / stats.sent : 0;
  }

  // Response rate by method
  const responseRateByMethod: Record<string, number> = {};
  const methodGroups = new Map<string, { sent: number; responded: number }>();

  for (const event of sent) {
    if (!methodGroups.has(event.method)) {
      methodGroups.set(event.method, { sent: 0, responded: 0 });
    }
    const group = methodGroups.get(event.method)!;
    group.sent++;
    if (event.status === 'responded') group.responded++;
  }

  for (const [method, stats] of methodGroups) {
    responseRateByMethod[method] = stats.sent > 0 ? stats.responded / stats.sent : 0;
  }

  // Response rate by hour
  const responseRateByHour: number[] = new Array(24).fill(0);
  const hourGroups = new Map<number, { sent: number; responded: number }>();

  for (let h = 0; h < 24; h++) {
    hourGroups.set(h, { sent: 0, responded: 0 });
  }

  for (const event of sent) {
    const group = hourGroups.get(event.hourOfDay)!;
    group.sent++;
    if (event.status === 'responded') group.responded++;
  }

  for (const [hour, stats] of hourGroups) {
    responseRateByHour[hour] = stats.sent > 0 ? stats.responded / stats.sent : 0;
  }

  // Response rate by day
  const responseRateByDay: number[] = new Array(7).fill(0);
  const dayGroups = new Map<number, { sent: number; responded: number }>();

  for (let d = 0; d < 7; d++) {
    dayGroups.set(d, { sent: 0, responded: 0 });
  }

  for (const event of sent) {
    const group = dayGroups.get(event.dayOfWeek)!;
    group.sent++;
    if (event.status === 'responded') group.responded++;
  }

  for (const [day, stats] of dayGroups) {
    responseRateByDay[day] = stats.sent > 0 ? stats.responded / stats.sent : 0;
  }

  return {
    totalOutreach: sent.length,
    overallResponseRate: sent.length > 0 ? responded.length / sent.length : 0,
    responseRateByTrigger,
    responseRateByMethod,
    responseRateByHour,
    responseRateByDay,
    topPerformingMessages: [], // Would need message pattern analysis
  };
}

// ============================================================================
// OPTIMIZATION RECOMMENDATIONS
// ============================================================================

/**
 * Get recommendations for optimizing outreach to a user
 */
export async function getOptimizationRecommendations(userId: string): Promise<string[]> {
  const analytics = await getUserAnalytics(userId);
  const recommendations: string[] = [];

  if (analytics.totalSent === 0) {
    return ['No outreach data yet - start sending to gather insights'];
  }

  // Low response rate
  if (analytics.responseRate < 0.2 && analytics.totalSent >= 5) {
    recommendations.push('Response rate is low - try different timing or message types');
  }

  // Best time recommendations
  if (analytics.bestHours.length > 0) {
    const hours = analytics.bestHours
      .slice(0, 3)
      .map((h) => (h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`));
    recommendations.push(`Best times to reach: ${hours.join(', ')}`);
  }

  // Best day recommendations
  if (analytics.bestDays.length > 0 && analytics.bestDays.length < 7) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bestDayNames = analytics.bestDays.map((d) => days[d]);
    recommendations.push(`Most responsive on: ${bestDayNames.join(', ')}`);
  }

  // Method recommendation
  if (analytics.preferredMethod) {
    recommendations.push(`Prefers ${analytics.preferredMethod} - prioritize this channel`);
  }

  // Trigger effectiveness
  const effectiveTriggers = Object.entries(analytics.triggerEffectiveness)
    .filter(([_, rate]) => rate > 0.3)
    .map(([trigger]) => trigger);

  if (effectiveTriggers.length > 0) {
    recommendations.push(`Most effective triggers: ${effectiveTriggers.join(', ')}`);
  }

  return recommendations;
}

// ============================================================================
// REPORTS
// ============================================================================

/**
 * Generate a summary report
 */
export function generateSummaryReport(): string {
  const global = getGlobalAnalytics();

  let report = `📊 OUTREACH ANALYTICS REPORT\n`;
  report += `${'='.repeat(40)}\n\n`;

  report += `Total Outreach: ${global.totalOutreach}\n`;
  report += `Overall Response Rate: ${(global.overallResponseRate * 100).toFixed(1)}%\n\n`;

  report += `Response Rate by Method:\n`;
  for (const [method, rate] of Object.entries(global.responseRateByMethod)) {
    report += `  ${method}: ${(rate * 100).toFixed(1)}%\n`;
  }

  report += `\nResponse Rate by Trigger:\n`;
  for (const [trigger, rate] of Object.entries(global.responseRateByTrigger)) {
    report += `  ${trigger}: ${(rate * 100).toFixed(1)}%\n`;
  }

  report += `\nBest Hours (by response rate):\n`;
  const topHours = global.responseRateByHour
    .map((rate, hour) => ({ hour, rate }))
    .filter((h) => h.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  for (const { hour, rate } of topHours) {
    const timeStr = hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
    report += `  ${timeStr}: ${(rate * 100).toFixed(1)}%\n`;
  }

  return report;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Event logging
  logOutreachEvent,
  updateEventStatus,
  logResponse,

  // Analytics
  getUserAnalytics,
  getGlobalAnalytics,

  // Recommendations
  getOptimizationRecommendations,

  // Reports
  generateSummaryReport,
};
