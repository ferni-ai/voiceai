/**
 * Seasonal Mood Prediction
 *
 * > "November has historically been heavy for you.
 * > Last year you mentioned feeling isolated around this time.
 * > I'll check in more often this month."
 *
 * Tracks historical emotional patterns tied to:
 * - Seasons (winter, summer, etc.)
 * - Specific months
 * - Anniversaries (loss, breakup, etc.)
 * - Holidays
 * - Personal significant dates
 *
 * @module PredictiveInsights/SeasonalMood
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SeasonalPeriod, HistoricalSeasonalPattern } from './types.js';

const log = createLogger({ module: 'SeasonalMood' });

// ============================================================================
// TYPES
// ============================================================================

export interface SeasonalMoodPrediction {
  userId: string;

  /** Current/upcoming seasonal period */
  period: SeasonalPeriod;

  /** Start of the period */
  periodStart: Date;

  /** End of the period */
  periodEnd: Date;

  /** Historical pattern for this period */
  historicalPattern?: HistoricalSeasonalPattern;

  /** Predicted mood (0-100, lower = more difficult) */
  predictedMood: number;

  /** How significant is this pattern */
  severity: 'mild' | 'moderate' | 'significant';

  /** Human-friendly message */
  message: string;

  /** Suggestion */
  suggestion: string;

  /** Recommended support strategies */
  supportStrategies: string[];

  /** Confidence (0-1) */
  confidence: number;

  /** Should surface */
  shouldSurface: boolean;
}

interface MoodEntry {
  date: Date;
  score: number; // 0-100
  themes: string[];
  notes?: string;
}

interface UserSeasonalProfile {
  userId: string;
  moodHistory: MoodEntry[];
  significantDates: Array<{
    date: string; // MM-DD format
    type: 'anniversary' | 'loss' | 'birthday' | 'other';
    description: string;
    associatedMood: number; // avg mood around this date
  }>;
  seasonalPatterns: Map<SeasonalPeriod, HistoricalSeasonalPattern>;
  lastAnalyzed?: Date;
}

// ============================================================================
// STORAGE
// ============================================================================

const userSeasonalProfiles = new Map<string, UserSeasonalProfile>();

// ============================================================================
// SEASON DEFINITIONS
// ============================================================================

function getCurrentSeason(date: Date): SeasonalPeriod {
  const month = date.getMonth(); // 0-11
  const day = date.getDate();

  // Check holidays first
  if ((month === 11 && day >= 15) || (month === 0 && day <= 7)) {
    return 'holidays';
  }

  // Seasonal mapping (Northern Hemisphere defaults)
  if (month >= 11 || month <= 1) {
    return month === 11 || month === 0 ? 'winter_start' : 'winter_deep';
  }
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  return 'fall';
}

function getSeasonDateRange(
  period: SeasonalPeriod,
  referenceDate: Date
): { start: Date; end: Date } {
  const year = referenceDate.getFullYear();

  switch (period) {
    case 'winter_start':
      return {
        start: new Date(year, 11, 1), // Dec 1
        end: new Date(year, 11, 31), // Dec 31
      };
    case 'winter_deep':
      return {
        start: new Date(year, 0, 1), // Jan 1
        end: new Date(year, 1, 28), // Feb 28
      };
    case 'spring':
      return {
        start: new Date(year, 2, 1), // Mar 1
        end: new Date(year, 4, 31), // May 31
      };
    case 'summer':
      return {
        start: new Date(year, 5, 1), // Jun 1
        end: new Date(year, 7, 31), // Aug 31
      };
    case 'fall':
      return {
        start: new Date(year, 8, 1), // Sep 1
        end: new Date(year, 10, 30), // Nov 30
      };
    case 'holidays':
      return {
        start: new Date(year, 11, 15), // Dec 15
        end: new Date(year + 1, 0, 7), // Jan 7
      };
    default:
      return {
        start: new Date(year, referenceDate.getMonth(), 1),
        end: new Date(year, referenceDate.getMonth() + 1, 0),
      };
  }
}

// ============================================================================
// MAIN PREDICTION FUNCTION
// ============================================================================

/**
 * Predict seasonal mood patterns for a user
 */
export async function predictSeasonalMood(
  userId: string
): Promise<SeasonalMoodPrediction> {
  const now = new Date();
  const profile = await getOrCreateProfile(userId);

  // Get current season
  const period = getCurrentSeason(now);
  const { start: periodStart, end: periodEnd } = getSeasonDateRange(period, now);

  // Analyze historical pattern for this season
  const historicalPattern = await analyzeHistoricalPattern(profile, period, now);

  // Check for significant dates coming up
  const upcomingSignificantDate = findUpcomingSignificantDate(profile, now);

  // Calculate predicted mood
  let predictedMood = 70; // Default neutral-positive
  if (historicalPattern) {
    predictedMood = historicalPattern.avgMoodScore;
  }
  if (upcomingSignificantDate) {
    // Blend with significant date mood
    predictedMood = (predictedMood + upcomingSignificantDate.associatedMood) / 2;
  }

  // Determine severity
  const severity = predictedMood < 40 ? 'significant' :
                   predictedMood < 55 ? 'moderate' : 'mild';

  // Generate support strategies
  const supportStrategies = generateSupportStrategies(
    period,
    historicalPattern,
    upcomingSignificantDate
  );

  // Generate message
  const { message, suggestion } = generateSeasonalMessage(
    period,
    predictedMood,
    severity,
    historicalPattern,
    upcomingSignificantDate
  );

  // Calculate confidence
  const confidence = calculateConfidence(
    profile.moodHistory.length,
    historicalPattern?.avgMoodScore !== undefined
  );

  // Should surface if moderate+ severity with decent confidence
  const shouldSurface =
    (severity !== 'mild' && confidence >= 0.5) ||
    (upcomingSignificantDate !== null);

  return {
    userId,
    period,
    periodStart,
    periodEnd,
    historicalPattern,
    predictedMood,
    severity,
    message,
    suggestion,
    supportStrategies,
    confidence,
    shouldSurface,
  };
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

async function getOrCreateProfile(userId: string): Promise<UserSeasonalProfile> {
  let profile = userSeasonalProfiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      moodHistory: [],
      significantDates: [],
      seasonalPatterns: new Map(),
    };
    userSeasonalProfiles.set(userId, profile);

    // Try to load from wellbeing tracking
    try {
      const { getRecentSnapshots } = await import('../wellbeing-tracking/index.js');
      const snapshots = getRecentSnapshots(userId, 100);

      if (snapshots && snapshots.length > 0) {
        for (const snapshot of snapshots) {
          // Calculate overall score from dimensions (0-1 scale, convert to 0-100)
          const dims = snapshot.dimensions;
          const overallScore = (
            (dims.mood || 0.5) +
            (dims.energy || 0.5) +
            (1 - (dims.worry || 0.5)) + // Invert worry
            (dims.hopefulness || 0.5)
          ) / 4 * 100;

          profile.moodHistory.push({
            date: snapshot.timestamp,
            score: overallScore,
            themes: [], // Themes not available from snapshots
          });
        }
      }
    } catch {
      log.debug({ userId }, 'Could not load wellbeing history');
    }
  }

  return profile;
}

async function analyzeHistoricalPattern(
  profile: UserSeasonalProfile,
  period: SeasonalPeriod,
  now: Date
): Promise<HistoricalSeasonalPattern | undefined> {
  // Check cache
  if (profile.seasonalPatterns.has(period)) {
    return profile.seasonalPatterns.get(period);
  }

  // Need at least a year of data
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const historicalEntries = profile.moodHistory.filter(
    (e) => e.date < oneYearAgo
  );

  if (historicalEntries.length < 30) {
    return undefined;
  }

  // Find entries from same season in past years
  const seasonEntries: MoodEntry[] = [];
  const { start, end } = getSeasonDateRange(period, now);
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();

  for (const entry of historicalEntries) {
    const entryMonth = entry.date.getMonth();

    // Check if entry falls in this season (any year)
    if (startMonth <= endMonth) {
      if (entryMonth >= startMonth && entryMonth <= endMonth) {
        seasonEntries.push(entry);
      }
    } else {
      // Season spans year boundary (e.g., winter)
      if (entryMonth >= startMonth || entryMonth <= endMonth) {
        seasonEntries.push(entry);
      }
    }
  }

  if (seasonEntries.length < 10) {
    return undefined;
  }

  // Calculate pattern
  const avgMoodScore =
    seasonEntries.reduce((sum, e) => sum + e.score, 0) / seasonEntries.length;

  // Find common themes
  const themeCounts = new Map<string, number>();
  for (const entry of seasonEntries) {
    for (const theme of entry.themes) {
      themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
    }
  }
  const commonThemes = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme]) => theme);

  // Generate support strategies based on past themes
  const supportStrategies = generateStrategiesFromThemes(commonThemes);

  const pattern: HistoricalSeasonalPattern = {
    period,
    avgMoodScore,
    commonThemes,
    supportStrategies,
  };

  profile.seasonalPatterns.set(period, pattern);
  return pattern;
}

function findUpcomingSignificantDate(
  profile: UserSeasonalProfile,
  now: Date
): UserSeasonalProfile['significantDates'][0] | null {
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // Look for dates within the next 14 days
  for (const sigDate of profile.significantDates) {
    const [sigMonth, sigDay] = sigDate.date.split('-').map(Number);

    // Calculate days until this date
    const thisYearDate = new Date(now.getFullYear(), sigMonth - 1, sigDay);
    let daysUntil = Math.floor(
      (thisYearDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // If date passed this year, check next year
    if (daysUntil < 0) {
      const nextYearDate = new Date(now.getFullYear() + 1, sigMonth - 1, sigDay);
      daysUntil = Math.floor(
        (nextYearDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
    }

    if (daysUntil >= 0 && daysUntil <= 14) {
      return sigDate;
    }
  }

  return null;
}

function generateStrategiesFromThemes(themes: string[]): string[] {
  const strategies: string[] = [];
  const themeSet = new Set(themes.map((t) => t.toLowerCase()));

  if (themeSet.has('isolation') || themeSet.has('lonely') || themeSet.has('alone')) {
    strategies.push('Schedule regular check-ins with friends');
    strategies.push('Join a group activity or class');
  }

  if (themeSet.has('stress') || themeSet.has('overwhelm') || themeSet.has('anxiety')) {
    strategies.push('Build in extra buffer time this season');
    strategies.push('Practice daily grounding exercises');
  }

  if (themeSet.has('sad') || themeSet.has('depression') || themeSet.has('down')) {
    strategies.push('Get outside during daylight hours');
    strategies.push('Consider a light therapy lamp');
    strategies.push('Maintain sleep schedule even when motivation is low');
  }

  if (themeSet.has('family') || themeSet.has('holidays')) {
    strategies.push('Set boundaries before family gatherings');
    strategies.push('Have an exit plan for overwhelming situations');
  }

  // Default strategies
  if (strategies.length === 0) {
    strategies.push('Be extra gentle with yourself this season');
    strategies.push("I'll check in more frequently");
  }

  return strategies;
}

function generateSupportStrategies(
  period: SeasonalPeriod,
  historicalPattern: HistoricalSeasonalPattern | undefined,
  significantDate: UserSeasonalProfile['significantDates'][0] | null
): string[] {
  const strategies: string[] = [];

  // From historical pattern
  if (historicalPattern?.supportStrategies) {
    strategies.push(...historicalPattern.supportStrategies);
  }

  // Season-specific defaults
  switch (period) {
    case 'winter_deep':
      strategies.push('Light exposure in the morning helps');
      break;
    case 'holidays':
      strategies.push("It's okay to skip events that drain you");
      break;
    case 'fall':
      strategies.push('Transition seasons can be unsettling - that\'s normal');
      break;
  }

  // Significant date specific
  if (significantDate?.type === 'loss') {
    strategies.push('Honor this time however feels right to you');
    strategies.push("Grief doesn't follow a schedule");
  }

  // Dedupe
  return [...new Set(strategies)].slice(0, 5);
}

function generateSeasonalMessage(
  period: SeasonalPeriod,
  predictedMood: number,
  severity: 'mild' | 'moderate' | 'significant',
  historicalPattern: HistoricalSeasonalPattern | undefined,
  significantDate: UserSeasonalProfile['significantDates'][0] | null
): { message: string; suggestion: string } {
  let message = '';
  let suggestion = '';

  const periodNames: Record<SeasonalPeriod, string> = {
    winter_start: 'Early winter',
    winter_deep: 'Deep winter',
    spring: 'Spring',
    summer: 'Summer',
    fall: 'Fall',
    holidays: 'The holiday season',
    anniversary: 'This time',
    birthday_month: 'Your birthday month',
  };

  const periodName = periodNames[period] || 'This time of year';

  if (significantDate) {
    message = `${significantDate.description} is coming up. Last time you mentioned it felt ${significantDate.associatedMood < 50 ? 'heavy' : 'mixed'}.`;
    suggestion = "I'll be here. We can talk about it or not - your call.";
  } else if (historicalPattern && severity !== 'mild') {
    const themes = historicalPattern.commonThemes.slice(0, 2).join(' and ');
    message = `${periodName} has historically been ${severity === 'significant' ? 'challenging' : 'a bit heavy'} for you.`;
    if (themes) {
      message += ` Themes of ${themes} tend to come up.`;
    }
    suggestion = "I'll check in more often. Let me know if there's anything specific that helps.";
  } else if (severity !== 'mild') {
    message = `${periodName} is coming. Some people find it harder than others.`;
    suggestion = "I'm paying attention. We'll take it as it comes.";
  } else {
    message = `${periodName} looks manageable based on your patterns.`;
    suggestion = "Enjoying the season?";
  }

  return { message, suggestion };
}

function calculateConfidence(historyLength: number, hasPattern: boolean): number {
  let confidence = 0.3;

  if (historyLength >= 365) confidence += 0.3;
  else if (historyLength >= 180) confidence += 0.2;
  else if (historyLength >= 90) confidence += 0.1;

  if (hasPattern) confidence += 0.2;

  return Math.min(confidence, 0.85);
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record a mood observation
 */
export function recordMoodEntry(
  userId: string,
  score: number,
  themes: string[] = [],
  notes?: string
): void {
  let profile = userSeasonalProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      moodHistory: [],
      significantDates: [],
      seasonalPatterns: new Map(),
    };
    userSeasonalProfiles.set(userId, profile);
  }

  profile.moodHistory.push({
    date: new Date(),
    score,
    themes,
    notes,
  });

  // Clear cached patterns (they need recalculation)
  profile.seasonalPatterns.clear();

  log.debug({ userId, score, themes }, 'Recorded mood entry');
}

/**
 * Add a significant date
 */
export function addSignificantDate(
  userId: string,
  date: string, // MM-DD format
  type: 'anniversary' | 'loss' | 'birthday' | 'other',
  description: string,
  associatedMood: number = 50
): void {
  let profile = userSeasonalProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      moodHistory: [],
      significantDates: [],
      seasonalPatterns: new Map(),
    };
    userSeasonalProfiles.set(userId, profile);
  }

  // Check if already exists
  const existing = profile.significantDates.find((d) => d.date === date);
  if (existing) {
    existing.type = type;
    existing.description = description;
    existing.associatedMood = associatedMood;
  } else {
    profile.significantDates.push({ date, type, description, associatedMood });
  }

  log.info({ userId, date, type, description }, 'Added significant date');
}

/**
 * Clear seasonal data for a user
 */
export function clearSeasonalData(userId: string): void {
  userSeasonalProfiles.delete(userId);
}

export default {
  predictSeasonalMood,
  recordMoodEntry,
  addSignificantDate,
  clearSeasonalData,
};
