/**
 * Seasonal Awareness - Better Than Human Service
 *
 * What no human friend can do: Connect your patterns to larger cycles.
 *
 * Tracks how seasons, holidays, and cyclical events affect the user,
 * providing support that anticipates seasonal struggles and celebrations.
 *
 * @module services/superhuman/seasonal-awareness
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'seasonal-awareness' });

// ============================================================================
// TYPES
// ============================================================================

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export type SeasonalPattern =
  | 'sad' // Seasonal affective disorder patterns
  | 'holiday_stress' // Holiday-related struggles
  | 'anniversary' // Significant dates
  | 'seasonal_energy' // Energy changes by season
  | 'year_end_reflection' // End-of-year contemplation
  | 'new_year_optimism' // New year energy
  | 'birthday'; // Birthday-related patterns

export interface SeasonalObservation {
  id: string;
  userId: string;

  // When
  month: number; // 1-12
  dayOfMonth?: number; // For specific dates
  season: Season;

  // What
  type: SeasonalPattern;
  observation: string;
  sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';

  // Confidence
  observationCount: number;
  firstObserved: number;
  lastObserved: number;
}

export interface PersonalDate {
  id: string;
  userId: string;

  // The date
  month: number;
  day: number;
  name: string; // "Mom's birthday", "Anniversary of...", etc.

  // Significance
  type: 'celebration' | 'anniversary' | 'memorial' | 'personal';
  sentiment: 'positive' | 'negative' | 'bittersweet' | 'neutral';
  importance: number; // 0-1

  // Context
  notes: string[];
  lastMentioned?: number;
}

export interface SeasonalContext {
  currentSeason: Season;
  currentMonth: number;
  daysUntilSeasonChange: number;

  // Active patterns
  activePatterns: SeasonalObservation[];

  // Upcoming dates
  upcomingDates: Array<{ date: PersonalDate; daysUntil: number }>;

  // Seasonal wisdom
  seasonalGuidance: string;
}

// ============================================================================
// SEASONAL CALCULATIONS
// ============================================================================

export function getCurrentSeason(date: Date = new Date()): Season {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

export function getDaysUntilSeasonChange(date: Date = new Date()): number {
  const season = getCurrentSeason(date);
  const year = date.getFullYear();

  // Season end dates (approximate)
  const seasonEnds: Record<Season, Date> = {
    winter: new Date(year, 2, 20), // March 20
    spring: new Date(year, 5, 21), // June 21
    summer: new Date(year, 8, 22), // September 22
    fall: new Date(year, 11, 21), // December 21
  };

  let endDate = seasonEnds[season];
  if (endDate < date) {
    // We're past this season's end, calculate for next occurrence
    endDate = new Date(endDate);
    endDate.setFullYear(year + 1);
  }

  return Math.ceil((endDate.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

// ============================================================================
// HOLIDAY & SPECIAL DATE AWARENESS
// ============================================================================

const UNIVERSAL_DATES: Array<{
  month: number;
  day: number;
  name: string;
  type: PersonalDate['type'];
  guidance: string;
}> = [
  {
    month: 1,
    day: 1,
    name: "New Year's Day",
    type: 'celebration',
    guidance: 'A fresh start. What are they hoping for this year?',
  },
  {
    month: 2,
    day: 14,
    name: "Valentine's Day",
    type: 'celebration',
    guidance: "Love is complicated. Check in on how they're feeling about it.",
  },
  {
    month: 11,
    day: 24,
    name: 'Thanksgiving (approximate)',
    type: 'celebration',
    guidance: 'Family gatherings can be complex. How are they feeling about it?',
  },
  {
    month: 12,
    day: 25,
    name: 'Christmas',
    type: 'celebration',
    guidance: 'Holidays can bring joy and grief. Be present for both.',
  },
  {
    month: 12,
    day: 31,
    name: "New Year's Eve",
    type: 'celebration',
    guidance: "Year-end reflection time. What mattered? What's ahead?",
  },
];

// ============================================================================
// SEASONAL PATTERN DETECTION
// ============================================================================

const SEASONAL_INDICATORS: Record<SeasonalPattern, RegExp[]> = {
  sad: [
    /\bi (always|usually) feel (worse|down|depressed) in (winter|fall)/i,
    /\bthis time of year is (hard|difficult|tough) for me/i,
    /\bthe (dark|short) days (get|are getting) to me/i,
  ],
  holiday_stress: [
    /\bthe holidays (stress|are stressing) me/i,
    /\bi (dread|hate|dislike) (the holidays|this time of year)/i,
    /\bfamily (gatherings|events) are (hard|stressful)/i,
  ],
  anniversary: [
    /\bit('s| is) (been|almost) (a year|one year|two years) since/i,
    /\bthis is the (day|week|month) (when|that)/i,
    /\bthis (date|day) is (hard|difficult|significant)/i,
  ],
  seasonal_energy: [
    /\bi (always|usually) have (more|less) energy in (spring|summer|fall|winter)/i,
    /\b(spring|summer|fall|winter) (energizes|drains) me/i,
  ],
  year_end_reflection: [
    /\b(looking back|reflecting) (on|at) (this|the) year/i,
    /\bwhat a year (it('s| has) been|this was)/i,
    /\bi('m| am) thinking about what i (did|accomplished|learned)/i,
  ],
  new_year_optimism: [
    /\b(new year|this year) i('m| am) going to/i,
    /\b(new year|fresh start|clean slate)/i,
    /\b(resolutions?|intentions?|goals?) for (the|this) (new )?year/i,
  ],
  birthday: [/\bmy birthday/i, /\bi('m| am) turning (\d+)/i, /\banother year older/i],
};

export function detectSeasonalPattern(
  transcript: string
): { type: SeasonalPattern; observation: string } | null {
  for (const [type, patterns] of Object.entries(SEASONAL_INDICATORS)) {
    for (const pattern of patterns) {
      if (pattern.test(transcript)) {
        return {
          type: type as SeasonalPattern,
          observation: transcript.slice(0, 200),
        };
      }
    }
  }
  return null;
}

// ============================================================================
// STORAGE
// ============================================================================

const observationCache = new Map<string, SeasonalObservation[]>();
const dateCache = new Map<string, PersonalDate[]>();

export async function loadSeasonalObservations(userId: string): Promise<SeasonalObservation[]> {
  if (observationCache.has(userId)) {
    return observationCache.get(userId) || [];
  }

  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('seasonal_observations')
      .orderBy('observationCount', 'desc')
      .limit(30)
      .get();

    const observations = snapshot.docs.map((doc) => doc.data() as SeasonalObservation);
    observationCache.set(userId, observations);
    return observations;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load seasonal observations');
    return [];
  }
}

export async function loadPersonalDates(userId: string): Promise<PersonalDate[]> {
  if (dateCache.has(userId)) {
    return dateCache.get(userId) || [];
  }

  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('personal_dates')
      .orderBy('importance', 'desc')
      .limit(50)
      .get();

    const dates = snapshot.docs.map((doc) => doc.data() as PersonalDate);
    dateCache.set(userId, dates);
    return dates;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load personal dates');
    return [];
  }
}

export async function recordSeasonalObservation(
  userId: string,
  detected: { type: SeasonalPattern; observation: string }
): Promise<SeasonalObservation> {
  const observations = await loadSeasonalObservations(userId);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentSeason = getCurrentSeason(now);

  // Find existing observation for this month/type
  const existing = observations.find((o) => o.type === detected.type && o.month === currentMonth);

  if (existing) {
    existing.observationCount++;
    existing.lastObserved = Date.now();
    // Save update
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('seasonal_observations')
        .doc(existing.id)
        .set(cleanForFirestore(existing));
    }
    return existing;
  }

  // Create new observation
  const newObs: SeasonalObservation = {
    id: `seasonal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    month: currentMonth,
    season: currentSeason,
    type: detected.type,
    observation: detected.observation,
    sentiment:
      detected.type === 'sad' || detected.type === 'holiday_stress' ? 'negative' : 'neutral',
    observationCount: 1,
    firstObserved: Date.now(),
    lastObserved: Date.now(),
  };

  const db = getFirestoreDb();
  if (db) {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('seasonal_observations')
      .doc(newObs.id)
      .set(cleanForFirestore(newObs));
  }

  observations.push(newObs);
  observationCache.set(userId, observations);

  log.info({ userId, type: newObs.type, month: newObs.month }, '🗓️ Seasonal observation recorded');
  return newObs;
}

export async function recordPersonalDate(
  userId: string,
  date: Omit<PersonalDate, 'id' | 'userId'>
): Promise<PersonalDate> {
  const newDate: PersonalDate = {
    ...date,
    id: `date_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
  };

  const db = getFirestoreDb();
  if (db) {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('personal_dates')
      .doc(newDate.id)
      .set(cleanForFirestore(newDate));
  }

  const dates = dateCache.get(userId) || [];
  dates.push(newDate);
  dateCache.set(userId, dates);

  log.info(
    { userId, name: newDate.name, month: newDate.month, day: newDate.day },
    '📅 Personal date recorded'
  );
  return newDate;
}

// ============================================================================
// UPCOMING DATE DETECTION
// ============================================================================

export async function findUpcomingDates(
  userId: string,
  daysAhead = 14
): Promise<Array<{ date: PersonalDate; daysUntil: number }>> {
  const personalDates = await loadPersonalDates(userId);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const currentYear = now.getFullYear();

  const upcoming: Array<{ date: PersonalDate; daysUntil: number }> = [];

  // Check personal dates
  for (const pd of personalDates) {
    let targetDate = new Date(currentYear, pd.month - 1, pd.day);

    // If date has passed this year, check next year
    if (targetDate < now) {
      targetDate = new Date(currentYear + 1, pd.month - 1, pd.day);
    }

    const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntil <= daysAhead && daysUntil >= 0) {
      upcoming.push({ date: pd, daysUntil });
    }
  }

  // Check universal dates too
  for (const ud of UNIVERSAL_DATES) {
    let targetDate = new Date(currentYear, ud.month - 1, ud.day);

    if (targetDate < now) {
      targetDate = new Date(currentYear + 1, ud.month - 1, ud.day);
    }

    const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntil <= daysAhead && daysUntil >= 0) {
      // Only include if not already a personal date
      const isPersonal = personalDates.some((pd) => pd.month === ud.month && pd.day === ud.day);
      if (!isPersonal) {
        upcoming.push({
          date: {
            id: `universal_${ud.month}_${ud.day}`,
            userId,
            month: ud.month,
            day: ud.day,
            name: ud.name,
            type: ud.type,
            sentiment: 'neutral',
            importance: 0.5,
            notes: [ud.guidance],
          },
          daysUntil,
        });
      }
    }
  }

  // Sort by days until
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

  return upcoming;
}

// ============================================================================
// SEASONAL WISDOM
// ============================================================================

const SEASONAL_WISDOM: Record<Season, string[]> = {
  winter: [
    'Winter is for rest, not retreat. The stillness has purpose.',
    'Dark months can bring deep reflection. What are they processing?',
    'Some things need a fallow season to grow again.',
  ],
  spring: [
    "Spring is emergence. What's trying to grow in them?",
    "New beginnings are everywhere. What's ready to bloom?",
    'The world is waking up. Are they feeling it too?',
  ],
  summer: [
    'Long days, full energy. What do they want to create?',
    'Summer abundance. Are they letting themselves enjoy it?',
    'This is peak energy season. How are they using it?',
  ],
  fall: [
    'Fall is letting go. What needs to drop away?',
    'Harvest time. What did they grow this year?',
    'The world is slowing down. Are they honoring that rhythm?',
  ],
};

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildSeasonalContext(userId: string): Promise<string> {
  const now = new Date();
  const currentSeason = getCurrentSeason(now);
  const currentMonth = now.getMonth() + 1;
  const daysUntilSeasonChange = getDaysUntilSeasonChange(now);

  const observations = await loadSeasonalObservations(userId);
  const upcomingDates = await findUpcomingDates(userId, 14);

  // Find patterns relevant to current time
  const relevantPatterns = observations.filter(
    (o) => o.month === currentMonth || o.season === currentSeason
  );

  const sections: string[] = ['[SEASONAL AWARENESS - Better Than Human Cycle Memory]'];
  sections.push('You remember how they feel in each season. Anticipate their needs.');

  // Current season
  sections.push(
    `\n**Current Season:** ${currentSeason.toUpperCase()} (${daysUntilSeasonChange} days remaining)`
  );

  // Seasonal wisdom
  const wisdom = SEASONAL_WISDOM[currentSeason];
  sections.push(`**Seasonal Wisdom:** "${wisdom[Math.floor(Math.random() * wisdom.length)]}"`);

  // Known patterns for this time
  if (relevantPatterns.length > 0) {
    sections.push('\n**Known Patterns This Time of Year:**');
    for (const pattern of relevantPatterns.slice(0, 3)) {
      const sentimentEmoji =
        pattern.sentiment === 'negative' ? '⚠️' : pattern.sentiment === 'positive' ? '✨' : '📌';
      sections.push(
        `${sentimentEmoji} ${pattern.type}: "${pattern.observation.slice(0, 60)}..." (seen ${pattern.observationCount}x)`
      );
    }
  }

  // Upcoming dates
  if (upcomingDates.length > 0) {
    sections.push('\n**Upcoming Significant Dates:**');
    for (const ud of upcomingDates.slice(0, 4)) {
      const emoji =
        ud.date.sentiment === 'negative' ? '💙' : ud.date.sentiment === 'positive' ? '🎉' : '📅';
      sections.push(
        `${emoji} ${ud.date.name} in ${ud.daysUntil} day${ud.daysUntil === 1 ? '' : 's'}`
      );
    }
  }

  sections.push('\nConnect their feelings to the season. Help them see the larger rhythm.');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const seasonalAwareness = {
  getCurrentSeason,
  getDaysUntilSeasonChange,
  detectPattern: detectSeasonalPattern,
  loadObservations: loadSeasonalObservations,
  loadDates: loadPersonalDates,
  recordObservation: recordSeasonalObservation,
  recordDate: recordPersonalDate,
  findUpcoming: findUpcomingDates,
  buildContext: buildSeasonalContext,
};
