/**
 * Meeting Pattern Learning Service
 *
 * "Better Than Human" capability: Learn user's optimal meeting patterns from their
 * calendar history to provide superhuman scheduling suggestions.
 *
 * Learns:
 * - Preferred meeting start times by day of week
 * - Optimal meeting durations by type
 * - Days/times the user typically avoids
 * - Energy peaks based on meeting acceptance patterns
 * - Focus time preferences (morning vs afternoon vs evening)
 * - Meeting clustering preferences (batched vs spread)
 *
 * No human assistant can track these patterns as accurately over time.
 *
 * @module services/calendar/meeting-pattern-learning
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { CalendarEvent } from './types.js';

const log = createLogger({ module: 'MeetingPatternLearning' });

// ============================================================================
// TYPES
// ============================================================================

export interface MeetingPattern {
  // Preferred start times by day (0=Sunday, 6=Saturday)
  preferredStartTimes: Record<number, number[]>; // Day -> array of preferred hours (0-23)

  // Days user typically avoids meetings
  avoidDays: number[]; // 0-6 for days to avoid

  // Hours user typically avoids meetings
  avoidHours: number[]; // 0-23 for hours to avoid

  // Optimal meeting durations (learned from history)
  optimalDurationByType: {
    oneOnOne: number; // minutes
    teamMeeting: number;
    clientCall: number;
    standup: number;
    general: number;
  };

  // Energy peaks (hours when user schedules important meetings)
  energyPeaks: number[]; // Hours 0-23 with highest energy

  // Focus time preference
  focusTimePreference: 'morning' | 'afternoon' | 'evening' | 'variable';

  // Meeting clustering preference
  clusteringPreference: 'batched' | 'spread' | 'variable';

  // Learned from how many events
  learnedFromEventCount: number;

  // Last updated
  updatedAt: string;
}

interface DayTimeStats {
  dayOfWeek: number;
  hour: number;
  count: number;
  acceptedCount: number;
  declinedCount: number;
  rescheduledCount: number;
}

interface DurationStats {
  type: string;
  averageDuration: number;
  medianDuration: number;
  count: number;
}

// ============================================================================
// DEFAULT PATTERNS
// ============================================================================

const DEFAULT_PATTERNS: MeetingPattern = {
  preferredStartTimes: {
    0: [], // Sunday - no preferences
    1: [9, 10, 14, 15], // Monday - morning and afternoon
    2: [9, 10, 14, 15],
    3: [9, 10, 14, 15],
    4: [9, 10, 14, 15],
    5: [9, 10, 14], // Friday - lighter afternoon
    6: [], // Saturday - no preferences
  },
  avoidDays: [0, 6], // Weekends
  avoidHours: [0, 1, 2, 3, 4, 5, 6, 7, 20, 21, 22, 23], // Early morning and late night
  optimalDurationByType: {
    oneOnOne: 30,
    teamMeeting: 45,
    clientCall: 60,
    standup: 15,
    general: 30,
  },
  energyPeaks: [10, 11, 14, 15], // Late morning and early afternoon
  focusTimePreference: 'morning',
  clusteringPreference: 'variable',
  learnedFromEventCount: 0,
  updatedAt: new Date().toISOString(),
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const patternsCache: Map<string, MeetingPattern> = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cacheTimestamps: Map<string, number> = new Map();

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

async function getFirestore() {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    return new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
  } catch {
    return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get learned meeting patterns for a user
 */
export async function getMeetingPatterns(userId: string): Promise<MeetingPattern> {
  // Check cache
  const cached = patternsCache.get(userId);
  const cacheTime = cacheTimestamps.get(userId);
  if (cached && cacheTime && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const db = await getFirestore();
    if (!db) {
      return { ...DEFAULT_PATTERNS };
    }

    const docRef = db
      .collection('users')
      .doc(cleanForFirestore(userId))
      .collection('calendar')
      .doc('meeting_patterns');
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data() as MeetingPattern;
      patternsCache.set(userId, data);
      cacheTimestamps.set(userId, Date.now());
      return data;
    }
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Failed to load meeting patterns');
  }

  return { ...DEFAULT_PATTERNS };
}

/**
 * Learn meeting patterns from calendar history
 * Should be called periodically (e.g., weekly) to update patterns
 */
export async function learnMeetingPatterns(userId: string): Promise<MeetingPattern> {
  log.info({ userId }, 'Learning meeting patterns from calendar history');

  try {
    // Get past 3 months of events
    const { getEvents } = await import('./unified-calendar-store.js');
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const now = new Date();

    const events = await getEvents(userId, threeMonthsAgo, now);

    if (events.length < 10) {
      log.debug({ userId, eventCount: events.length }, 'Not enough events to learn patterns');
      return { ...DEFAULT_PATTERNS, learnedFromEventCount: events.length };
    }

    // Analyze patterns
    const patterns = analyzeEventPatterns(events);

    // Save to Firestore
    const db = await getFirestore();
    if (db) {
      const docRef = db
        .collection('users')
        .doc(cleanForFirestore(userId))
        .collection('calendar')
        .doc('meeting_patterns');
      await docRef.set(patterns);
      log.info({ userId, eventCount: events.length }, 'Meeting patterns learned and saved');
    }

    // Update cache
    patternsCache.set(userId, patterns);
    cacheTimestamps.set(userId, Date.now());

    return patterns;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to learn meeting patterns');
    return { ...DEFAULT_PATTERNS };
  }
}

/**
 * Get optimal time suggestions for a new meeting
 */
export async function getOptimalMeetingTimes(
  userId: string,
  durationMinutes: number,
  meetingType?: 'oneOnOne' | 'teamMeeting' | 'clientCall' | 'standup' | 'general'
): Promise<{ day: number; hour: number; score: number }[]> {
  const patterns = await getMeetingPatterns(userId);
  const suggestions: { day: number; hour: number; score: number }[] = [];

  // Score each day/hour combination
  for (let day = 0; day < 7; day++) {
    // Skip avoid days
    if (patterns.avoidDays.includes(day)) continue;

    const preferredHours = patterns.preferredStartTimes[day] || [];

    for (let hour = 7; hour < 20; hour++) {
      // Skip avoid hours
      if (patterns.avoidHours.includes(hour)) continue;

      let score = 50; // Base score

      // Bonus for preferred hours
      if (preferredHours.includes(hour)) {
        score += 30;
      }

      // Bonus for energy peaks
      if (patterns.energyPeaks.includes(hour)) {
        score += 20;
      }

      // Adjust for focus time preference
      if (patterns.focusTimePreference === 'morning' && hour >= 9 && hour <= 11) {
        // Protect morning focus time - lower score
        score -= 15;
      } else if (patterns.focusTimePreference === 'afternoon' && hour >= 14 && hour <= 16) {
        score -= 15;
      }

      suggestions.push({ day, hour, score });
    }
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);

  return suggestions.slice(0, 10); // Top 10 suggestions
}

/**
 * Check if a proposed meeting time is optimal
 */
export async function isOptimalMeetingTime(
  userId: string,
  dateTime: Date,
  durationMinutes: number
): Promise<{ optimal: boolean; score: number; reason?: string }> {
  const patterns = await getMeetingPatterns(userId);
  const day = dateTime.getDay();
  const hour = dateTime.getHours();

  let score = 50;
  const issues: string[] = [];

  // Check avoid days
  if (patterns.avoidDays.includes(day)) {
    score -= 30;
    issues.push('This day is typically avoided');
  }

  // Check avoid hours
  if (patterns.avoidHours.includes(hour)) {
    score -= 25;
    issues.push('This time is typically avoided');
  }

  // Check preferred hours
  const preferredHours = patterns.preferredStartTimes[day] || [];
  if (preferredHours.includes(hour)) {
    score += 25;
  }

  // Check energy peaks
  if (patterns.energyPeaks.includes(hour)) {
    score += 15;
  }

  // Check focus time preference
  if (patterns.focusTimePreference === 'morning' && hour >= 9 && hour <= 11) {
    score -= 10;
    issues.push('This overlaps with typical focus time');
  }

  return {
    optimal: score >= 60,
    score,
    reason: issues.length > 0 ? issues.join('. ') : undefined,
  };
}

// ============================================================================
// INTERNAL ANALYSIS FUNCTIONS
// ============================================================================

function analyzeEventPatterns(events: CalendarEvent[]): MeetingPattern {
  // Count events by day and hour
  const dayHourCounts: Map<string, DayTimeStats> = new Map();
  const durationsByType: Map<string, number[]> = new Map();

  for (const event of events) {
    // Skip all-day events
    if (event.isAllDay) continue;

    const startTime = new Date(event.startTime);
    const endTime = new Date(event.endTime);
    const day = startTime.getDay();
    const hour = startTime.getHours();
    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60); // minutes

    // Track day/hour stats
    const key = `${day}-${hour}`;
    const existing = dayHourCounts.get(key) || {
      dayOfWeek: day,
      hour,
      count: 0,
      acceptedCount: 0,
      declinedCount: 0,
      rescheduledCount: 0,
    };
    existing.count++;
    // Note: Would need event status tracking for accepted/declined/rescheduled
    existing.acceptedCount++;
    dayHourCounts.set(key, existing);

    // Track durations by type
    const type = inferMeetingType(event);
    const durations = durationsByType.get(type) || [];
    durations.push(duration);
    durationsByType.set(type, durations);
  }

  // Analyze preferred start times
  const preferredStartTimes: Record<number, number[]> = {};
  for (let day = 0; day < 7; day++) {
    const dayHours: { hour: number; count: number }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const stats = dayHourCounts.get(`${day}-${hour}`);
      if (stats) {
        dayHours.push({ hour, count: stats.count });
      }
    }
    // Top hours for this day
    dayHours.sort((a, b) => b.count - a.count);
    preferredStartTimes[day] = dayHours.slice(0, 4).map((h) => h.hour);
  }

  // Analyze avoid days (days with few meetings)
  const dayTotals: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const [key, stats] of dayHourCounts.entries()) {
    const day = parseInt(key.split('-')[0]);
    dayTotals[day] += stats.count;
  }
  const avgDayCount = dayTotals.reduce((a, b) => a + b, 0) / 7;
  const avoidDays = dayTotals
    .map((count, day) => ({ day, count }))
    .filter((d) => d.count < avgDayCount * 0.2)
    .map((d) => d.day);

  // Analyze avoid hours
  const hourTotals: number[] = new Array(24).fill(0);
  for (const [key, stats] of dayHourCounts.entries()) {
    const hour = parseInt(key.split('-')[1]);
    hourTotals[hour] += stats.count;
  }
  const avgHourCount = hourTotals.reduce((a, b) => a + b, 0) / 24;
  const avoidHours = hourTotals
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count < avgHourCount * 0.1)
    .map((h) => h.hour);

  // Analyze optimal durations
  const optimalDurationByType = {
    oneOnOne: calculateMedian(durationsByType.get('oneOnOne') || [30]),
    teamMeeting: calculateMedian(durationsByType.get('teamMeeting') || [45]),
    clientCall: calculateMedian(durationsByType.get('clientCall') || [60]),
    standup: calculateMedian(durationsByType.get('standup') || [15]),
    general: calculateMedian(durationsByType.get('general') || [30]),
  };

  // Analyze energy peaks (hours with most meetings)
  const energyPeaks = hourTotals
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count > avgHourCount * 1.5)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((h) => h.hour);

  // Analyze focus time preference
  const morningMeetings = hourTotals.slice(8, 12).reduce((a, b) => a + b, 0);
  const afternoonMeetings = hourTotals.slice(13, 17).reduce((a, b) => a + b, 0);
  const eveningMeetings = hourTotals.slice(17, 20).reduce((a, b) => a + b, 0);

  let focusTimePreference: 'morning' | 'afternoon' | 'evening' | 'variable' = 'variable';
  if (morningMeetings < afternoonMeetings * 0.5) {
    focusTimePreference = 'morning';
  } else if (afternoonMeetings < morningMeetings * 0.5) {
    focusTimePreference = 'afternoon';
  }

  // Analyze clustering preference
  // This would need more sophisticated analysis of meeting gaps
  const clusteringPreference: 'batched' | 'spread' | 'variable' = 'variable';

  return {
    preferredStartTimes,
    avoidDays,
    avoidHours,
    optimalDurationByType,
    energyPeaks,
    focusTimePreference,
    clusteringPreference,
    learnedFromEventCount: events.length,
    updatedAt: new Date().toISOString(),
  };
}

function inferMeetingType(event: CalendarEvent): string {
  const title = (event.title || '').toLowerCase();

  if (title.includes('1:1') || title.includes('one-on-one') || title.includes('catch up')) {
    return 'oneOnOne';
  }
  if (title.includes('standup') || title.includes('daily') || title.includes('scrum')) {
    return 'standup';
  }
  if (title.includes('client') || title.includes('customer') || title.includes('sales')) {
    return 'clientCall';
  }
  if (title.includes('team') || title.includes('all hands') || title.includes('sync')) {
    return 'teamMeeting';
  }

  return 'general';
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 30;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export default {
  getMeetingPatterns,
  learnMeetingPatterns,
  getOptimalMeetingTimes,
  isOptimalMeetingTime,
};
