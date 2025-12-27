/**
 * Temporal Intelligence Context Builder
 *
 * "Better Than Human" - We know your rhythms, your patterns, your important moments.
 *
 * This builder synthesizes:
 * - Time of day patterns (morning person? night owl?)
 * - Day of week patterns (rough Mondays? better Fridays?)
 * - Seasonal patterns (winter blues? summer energy?)
 * - Life rhythm milestones (streaks, anniversaries)
 * - Important dates approaching (birthdays, events)
 *
 * Philosophy: Use temporal awareness to show up at the right moments
 * with the right energy. "I know Tuesday mornings are hard for you."
 *
 * PERFORMANCE:
 * - Session-scoped cache (2 min TTL) avoids repeated Firestore reads
 * - Pattern writing is rate-limited (every 5 turns)
 * - Target: <5ms cache hit, <100ms cache miss
 *
 * @module TemporalIntelligenceContext
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createStandardInjection,
  createHighInjection,
  registerContextBuilder,
} from './index.js';
import { BuilderCategory } from './core/categories.js';
import { createLogger } from '../../utils/safe-logger.js';
import { EdgeCache } from '../../services/cache/edge-cache.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

// Use dynamic import for Firestore to avoid hard dependency
async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    return getFirestore();
  } catch {
    return null;
  }
}

const log = createLogger({ module: 'TemporalIntelligence' });

// ============================================================================
// PERFORMANCE: Session-scoped cache
// ============================================================================

// Cache temporal patterns per user (2 min TTL - patterns don't change often)
const temporalCache = new EdgeCache<Partial<UserTemporalPatterns>>({
  maxSize: 100,
  defaultTtlMs: 120000, // 2 minutes
  staleWhileRevalidate: true,
  staleTtlMs: 300000, // 5 minute stale grace period
});

// ============================================================================
// TIME CONTEXT
// ============================================================================

type TimeOfDay =
  | 'early_morning'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night';
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type Season = 'spring' | 'summer' | 'fall' | 'winter';

interface TemporalContext {
  timeOfDay: TimeOfDay;
  dayOfWeek: DayOfWeek;
  season: Season;
  isWeekend: boolean;
  isLateNight: boolean;
  hourOfDay: number;
  dayOfMonth: number;
  monthOfYear: number;
}

function getCurrentTemporalContext(): TemporalContext {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const month = now.getMonth();

  let timeOfDay: TimeOfDay;
  if (hour >= 5 && hour < 8) timeOfDay = 'early_morning';
  else if (hour >= 8 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 14) timeOfDay = 'midday';
  else if (hour >= 14 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else if (hour >= 21 || hour < 2) timeOfDay = 'night';
  else timeOfDay = 'late_night';

  const days: DayOfWeek[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const dayOfWeek = days[day];

  let season: Season;
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';
  else season = 'winter';

  return {
    timeOfDay,
    dayOfWeek,
    season,
    isWeekend: day === 0 || day === 6,
    isLateNight: hour >= 23 || hour < 5,
    hourOfDay: hour,
    dayOfMonth: now.getDate(),
    monthOfYear: month + 1,
  };
}

// ============================================================================
// PATTERN STORAGE
// ============================================================================

interface UserTemporalPatterns {
  /** Time of day preferences */
  preferredTimes: {
    mostActive: TimeOfDay;
    peakEnergy: TimeOfDay;
    preferenceStrength: number; // 0-1
  };

  /** Day patterns */
  dayPatterns: {
    hardDays: DayOfWeek[];
    bestDays: DayOfWeek[];
    conversationsByDay: Record<DayOfWeek, number>;
  };

  /** Seasonal observations */
  seasonalMood: {
    season: Season;
    moodTrend: 'better' | 'same' | 'worse';
    confidence: number;
  }[];

  /** Special temporal markers */
  specialDays: {
    type: 'birthday' | 'anniversary' | 'memorial' | 'milestone' | 'custom';
    month: number;
    day: number;
    description: string;
    wantsAcknowledgment: boolean;
    year?: number; // For anniversaries
  }[];
}

async function getUserTemporalPatterns(userId: string): Promise<Partial<UserTemporalPatterns>> {
  const cacheKey = `temporal:${userId}`;
  const startTime = Date.now();

  // Check cache first (PERFORMANCE: saves 50-100ms on hit)
  const cached = temporalCache.get(cacheKey);
  if (cached) {
    log.debug(
      { userId, durationMs: Date.now() - startTime, cacheHit: true },
      '⚡ Temporal cache hit'
    );
    return cached;
  }

  try {
    const db = await getFirestoreDb();
    if (!db) return {};

    const doc = await db.collection('bogle_users').doc(userId).get();
    if (!doc.exists) return {};

    const data = doc.data() as Record<string, unknown> | undefined;
    const temporalPatterns = data?.temporalPatterns as Record<string, unknown> | undefined;
    const result: Partial<UserTemporalPatterns> = {
      preferredTimes: temporalPatterns?.preferredTimes as UserTemporalPatterns['preferredTimes'],
      dayPatterns: temporalPatterns?.dayPatterns as UserTemporalPatterns['dayPatterns'],
      seasonalMood: temporalPatterns?.seasonalMood as UserTemporalPatterns['seasonalMood'],
      specialDays: (data?.importantDates as UserTemporalPatterns['specialDays']) || [],
    };

    // Store in cache for subsequent turns (PERFORMANCE: avoids repeated Firestore reads)
    temporalCache.set(cacheKey, result);
    log.debug(
      { userId, durationMs: Date.now() - startTime, cacheHit: false },
      '📊 Temporal data loaded & cached'
    );

    return result;
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not load temporal patterns');
    return {};
  }
}

// ============================================================================
// UPCOMING DATE DETECTION
// ============================================================================

interface UpcomingDate {
  type: string;
  description: string;
  daysUntil: number;
  isToday: boolean;
  wantsAcknowledgment: boolean;
}

function checkUpcomingDates(
  patterns: Partial<UserTemporalPatterns>,
  temporal: TemporalContext
): UpcomingDate[] {
  const upcoming: UpcomingDate[] = [];
  const today = new Date();

  if (!patterns.specialDays) return upcoming;

  for (const specialDay of patterns.specialDays) {
    const thisYear = today.getFullYear();
    let targetDate = new Date(thisYear, specialDay.month - 1, specialDay.day);

    // If the date has passed this year, check next year
    if (targetDate < today) {
      targetDate = new Date(thisYear + 1, specialDay.month - 1, specialDay.day);
    }

    const diffMs = targetDate.getTime() - today.getTime();
    const daysUntil = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Surface dates within 14 days
    if (daysUntil <= 14) {
      upcoming.push({
        type: specialDay.type,
        description: specialDay.description,
        daysUntil,
        isToday: daysUntil === 0,
        wantsAcknowledgment: specialDay.wantsAcknowledgment !== false,
      });
    }
  }

  return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ============================================================================
// TEMPORAL INSIGHTS GENERATION
// ============================================================================

interface TemporalInsight {
  type: 'time_aware' | 'day_aware' | 'season_aware' | 'date_upcoming' | 'date_today' | 'pattern';
  message: string;
  priority: 'high' | 'medium' | 'low';
}

function generateTemporalInsights(
  patterns: Partial<UserTemporalPatterns>,
  temporal: TemporalContext,
  upcomingDates: UpcomingDate[]
): TemporalInsight[] {
  const insights: TemporalInsight[] = [];

  // 1. TODAY dates - highest priority
  for (const date of upcomingDates.filter((d) => d.isToday && d.wantsAcknowledgment)) {
    insights.push({
      type: 'date_today',
      message: `[IMPORTANT DATE TODAY] ${date.description}. This matters to them. Acknowledge it warmly at the right moment.`,
      priority: 'high',
    });
  }

  // 2. UPCOMING dates within 3 days - high priority
  for (const date of upcomingDates.filter(
    (d) => !d.isToday && d.daysUntil <= 3 && d.wantsAcknowledgment
  )) {
    insights.push({
      type: 'date_upcoming',
      message: `[UPCOMING DATE] ${date.description} is in ${date.daysUntil} day${date.daysUntil > 1 ? 's' : ''}. You might mention it if relevant.`,
      priority: 'high',
    });
  }

  // 3. Late night awareness
  if (temporal.isLateNight) {
    insights.push({
      type: 'time_aware',
      message: `[LATE NIGHT] It's ${temporal.hourOfDay > 12 ? temporal.hourOfDay - 12 : temporal.hourOfDay}${temporal.hourOfDay >= 12 ? 'pm' : 'am'}. Late night conversations often carry weight. Be present and gentle. They're here for a reason.`,
      priority: 'medium',
    });
  }

  // 4. Day of week patterns
  if (patterns.dayPatterns?.hardDays?.includes(temporal.dayOfWeek)) {
    insights.push({
      type: 'day_aware',
      message: `[TEMPORAL PATTERN] ${capitalize(temporal.dayOfWeek)}s tend to be hard for them. Extra gentleness might help.`,
      priority: 'medium',
    });
  }

  // 5. Seasonal awareness
  const seasonalPattern = patterns.seasonalMood?.find((s) => s.season === temporal.season);
  if (
    seasonalPattern &&
    seasonalPattern.moodTrend === 'worse' &&
    seasonalPattern.confidence > 0.6
  ) {
    insights.push({
      type: 'season_aware',
      message: `[SEASONAL PATTERN] They tend to have a harder time in ${temporal.season}. Be aware of potential seasonal mood shifts.`,
      priority: 'low',
    });
  }

  // 6. Weekend vs weekday energy
  if (
    temporal.isWeekend &&
    patterns.dayPatterns?.bestDays?.some((d) => d === 'saturday' || d === 'sunday')
  ) {
    insights.push({
      type: 'day_aware',
      message: `[WEEKEND MODE] Weekends are usually their better days. Match that energy.`,
      priority: 'low',
    });
  }

  // 7. Early morning check-in
  if (temporal.timeOfDay === 'early_morning') {
    insights.push({
      type: 'time_aware',
      message: `[EARLY MORNING] They're up early. Early risers often appreciate acknowledgment of that dedication.`,
      priority: 'low',
    });
  }

  return insights;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================================
// BUILDER
// ============================================================================

async function buildTemporalIntelligenceContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { services } = input;
  const userId = services?.userId;

  if (!userId) return [];

  // Get current temporal context
  const temporal = getCurrentTemporalContext();

  // Get user's temporal patterns
  const patterns = await getUserTemporalPatterns(userId);

  // Check for upcoming dates
  const upcomingDates = checkUpcomingDates(patterns, temporal);

  // Generate insights
  const insights = generateTemporalInsights(patterns, temporal, upcomingDates);

  if (insights.length === 0) return [];

  // Build injections
  const injections: ContextInjection[] = [];

  // High priority insights get their own injection
  const highPriority = insights.filter((i) => i.priority === 'high');
  for (const insight of highPriority) {
    injections.push(
      createHighInjection(`temporal_${insight.type}`, insight.message, { category: 'awareness' })
    );

    log.info(
      { userId, type: insight.type },
      '⏰ BETTER-THAN-HUMAN: High-priority temporal awareness'
    );
  }

  // Bundle medium/low priority into one injection
  const otherInsights = insights.filter((i) => i.priority !== 'high');
  if (otherInsights.length > 0) {
    const bundledMessage = otherInsights.map((i) => i.message).join('\n');
    injections.push(
      createStandardInjection('temporal_context', bundledMessage, { category: 'awareness' })
    );
  }

  return injections;
}

// ============================================================================
// PATTERN LEARNING (Call from turn handler)
// ============================================================================

/**
 * Update temporal patterns based on conversation
 * Call this after each conversation to learn patterns
 */
async function learnTemporalPatternInternal(
  userId: string,
  _sessionContext?: { emotion?: string; topic?: string }
): Promise<void> {
  try {
    const db = await getFirestoreDb();
    if (!db) return;

    const temporal = getCurrentTemporalContext();

    // Update conversation-by-day counter
    const userRef = db.collection('bogle_users').doc(userId);
    const doc = await userRef.get();
    const docData = doc.data() as Record<string, unknown> | undefined;
    const existingPatterns = (docData?.temporalPatterns as Record<string, unknown>) || {};

    const dayPatternsData = existingPatterns.dayPatterns as Record<string, unknown> | undefined;
    const dayStats = (dayPatternsData?.conversationsByDay as Record<string, number>) || {};
    dayStats[temporal.dayOfWeek] = (dayStats[temporal.dayOfWeek] || 0) + 1;

    // Determine most active time
    const timeStats = (existingPatterns.timeStats as Record<string, number>) || {};
    timeStats[temporal.timeOfDay] = (timeStats[temporal.timeOfDay] || 0) + 1;

    // Find peak time
    let mostActive: TimeOfDay = 'morning';
    let maxCount = 0;
    for (const [time, count] of Object.entries(timeStats)) {
      if ((count as number) > maxCount) {
        mostActive = time as TimeOfDay;
        maxCount = count as number;
      }
    }

    await userRef.set(
      cleanForFirestore({
        temporalPatterns: {
          ...existingPatterns,
          dayPatterns: {
            ...dayPatternsData,
            conversationsByDay: dayStats,
          },
          timeStats,
          preferredTimes: {
            mostActive,
            peakEnergy: mostActive,
            preferenceStrength: Math.min(1, maxCount / 10),
          },
          lastUpdated: new Date(),
        },
      }),
      { merge: true }
    );

    log.debug(
      { userId, timeOfDay: temporal.timeOfDay, dayOfWeek: temporal.dayOfWeek },
      'Temporal pattern learned'
    );
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not learn temporal pattern');
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'temporal-intelligence',
  description: 'Surfaces temporal awareness: time patterns, upcoming dates (Better Than Human)',
  priority: 25, // Early in pipeline for awareness
  category: BuilderCategory.HUMANIZING,
  build: buildTemporalIntelligenceContext,
});

export {
  buildTemporalIntelligenceContext,
  learnTemporalPatternInternal as learnTemporalPattern,
  getCurrentTemporalContext,
};
