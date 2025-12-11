/**
 * Energy/Productivity Prediction
 *
 * > "Based on your patterns, tomorrow morning looks like a high-energy window."
 *
 * Predicts optimal times for challenging tasks based on:
 * - Sleep patterns (if available)
 * - Calendar density
 * - Recent stress levels
 * - Historical energy patterns
 * - Day of week patterns
 * - Time of day patterns
 *
 * @module PredictiveInsights/EnergyPrediction
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { EnergyLevel, EnergyFactor } from './types.js';

const log = createLogger({ module: 'EnergyPrediction' });

// ============================================================================
// TYPES
// ============================================================================

export interface EnergyPrediction {
  userId: string;

  /** Predicted energy level */
  predictedLevel: EnergyLevel;

  /** When the high-energy window starts */
  windowStart: Date;

  /** When the high-energy window ends */
  windowEnd: Date;

  /** Human-friendly message */
  message: string;

  /** Suggested action */
  suggestion: string;

  /** Confidence in this prediction (0-1) */
  confidence: number;

  /** Factors contributing to this prediction */
  factors: EnergyFactor[];

  /** Should this be surfaced to user */
  shouldSurface: boolean;
}

interface EnergyHistoryEntry {
  timestamp: Date;
  level: EnergyLevel;
  dayOfWeek: number;
  hour: number;
  factors: string[];
}

// ============================================================================
// STORAGE
// ============================================================================

const energyHistories = new Map<string, EnergyHistoryEntry[]>();
const MAX_HISTORY_ENTRIES = 500;

// ============================================================================
// ENERGY LEVEL SCORING
// ============================================================================

const ENERGY_SCORES: Record<EnergyLevel, number> = {
  very_low: 1,
  low: 2,
  moderate: 3,
  high: 4,
  peak: 5,
};

function scoreToLevel(score: number): EnergyLevel {
  if (score >= 4.5) return 'peak';
  if (score >= 3.5) return 'high';
  if (score >= 2.5) return 'moderate';
  if (score >= 1.5) return 'low';
  return 'very_low';
}

// ============================================================================
// TIME PATTERNS
// ============================================================================

/**
 * Base energy by time of day (population average)
 * Peaks: mid-morning (10am), early afternoon (2pm)
 * Troughs: early morning, post-lunch dip, late evening
 */
const BASE_HOURLY_ENERGY: Record<number, number> = {
  0: 1.5, 1: 1.2, 2: 1.0, 3: 1.0, 4: 1.2, 5: 1.5,
  6: 2.0, 7: 2.5, 8: 3.0, 9: 3.5, 10: 4.0, 11: 3.8,
  12: 3.5, 13: 3.0, 14: 3.5, 15: 3.8, 16: 3.5, 17: 3.2,
  18: 3.0, 19: 2.8, 20: 2.5, 21: 2.2, 22: 2.0, 23: 1.8,
};

/**
 * Day of week energy modifier
 * Monday drag, Friday anticipation, weekend relaxation
 */
const DAY_OF_WEEK_MODIFIER: Record<number, number> = {
  0: 0.9,  // Sunday - recovery
  1: 0.85, // Monday - drag
  2: 1.0,  // Tuesday - productive
  3: 1.05, // Wednesday - midweek peak
  4: 1.0,  // Thursday - sustained
  5: 0.95, // Friday - winding down
  6: 0.9,  // Saturday - relaxed
};

// ============================================================================
// MAIN PREDICTION FUNCTION
// ============================================================================

/**
 * Predict energy levels and optimal windows for a user
 */
export async function predictEnergy(userId: string): Promise<EnergyPrediction> {
  const now = new Date();
  const factors: EnergyFactor[] = [];

  try {
    // Get user's energy history
    const history = energyHistories.get(userId) || [];

    // Calculate base prediction from time patterns
    let baseScore = calculateTimeBasedScore(now);
    factors.push({
      factor: 'time_of_day',
      impact: baseScore >= 3.5 ? 'positive' : baseScore <= 2.5 ? 'negative' : 'neutral',
      weight: 0.3,
      explanation: getTimeExplanation(now.getHours()),
    });

    // Adjust for day of week
    const dayModifier = DAY_OF_WEEK_MODIFIER[now.getDay()];
    baseScore *= dayModifier;
    factors.push({
      factor: 'day_of_week',
      impact: dayModifier > 1 ? 'positive' : dayModifier < 0.95 ? 'negative' : 'neutral',
      weight: 0.15,
      explanation: getDayExplanation(now.getDay()),
    });

    // Check for calendar density (if available)
    const calendarFactor = await getCalendarDensityFactor(userId, now);
    if (calendarFactor) {
      baseScore *= calendarFactor.modifier;
      factors.push(calendarFactor.factor);
    }

    // Check historical patterns for this user
    const personalPattern = getPersonalPattern(history, now);
    if (personalPattern) {
      baseScore = baseScore * 0.6 + personalPattern.avgScore * 0.4; // Blend with personal data
      factors.push({
        factor: 'personal_pattern',
        impact: personalPattern.avgScore >= 3.5 ? 'positive' : 'neutral',
        weight: 0.4,
        explanation: `Your energy is typically ${scoreToLevel(personalPattern.avgScore)} at this time`,
      });
    }

    // Check recent stress levels
    const stressFactor = await getRecentStressFactor(userId);
    if (stressFactor) {
      baseScore *= stressFactor.modifier;
      factors.push(stressFactor.factor);
    }

    // Find the optimal window
    const { windowStart, windowEnd } = findOptimalWindow(now, history, baseScore);

    // Calculate confidence
    const confidence = calculateConfidence(history.length, factors);

    // Generate message and suggestion
    const predictedLevel = scoreToLevel(baseScore);
    const { message, suggestion } = generateInsight(predictedLevel, windowStart, windowEnd, factors);

    // Determine if we should surface this
    const shouldSurface =
      confidence >= 0.5 &&
      (predictedLevel === 'high' || predictedLevel === 'peak') &&
      windowStart.getTime() - now.getTime() < 24 * 60 * 60 * 1000; // Within 24 hours

    return {
      userId,
      predictedLevel,
      windowStart,
      windowEnd,
      message,
      suggestion,
      confidence,
      factors,
      shouldSurface,
    };
  } catch (error) {
    log.error({ error, userId }, 'Energy prediction failed');
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateTimeBasedScore(date: Date): number {
  const hour = date.getHours();
  return BASE_HOURLY_ENERGY[hour] || 2.5;
}

function getTimeExplanation(hour: number): string {
  if (hour >= 9 && hour <= 11) return "Mid-morning is typically a peak focus time";
  if (hour >= 14 && hour <= 16) return "Early afternoon often brings renewed energy";
  if (hour >= 13 && hour <= 14) return "Post-lunch energy dip is natural";
  if (hour >= 21 || hour <= 5) return "Late night/early morning - energy naturally low";
  if (hour >= 6 && hour <= 8) return "Morning ramp-up period";
  return "Standard energy period";
}

function getDayExplanation(day: number): string {
  const explanations: Record<number, string> = {
    0: "Sundays tend toward recovery mode",
    1: "Monday drag is real for most people",
    2: "Tuesdays are often highly productive",
    3: "Midweek energy peak",
    4: "Thursday - maintaining momentum",
    5: "Friday anticipation can affect focus",
    6: "Saturday relaxation mode",
  };
  return explanations[day] || "Normal day pattern";
}

async function getCalendarDensityFactor(
  userId: string,
  date: Date
): Promise<{ modifier: number; factor: EnergyFactor } | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getCalendarBusyProfile } = await import('../calendar-busy-detection.js');
    const profile = await getCalendarBusyProfile(userId);

    if (!profile || profile.todayBusySlots.length === 0) {
      return null;
    }

    // Calculate meeting density
    const totalBusyMinutes = profile.todayBusySlots.reduce((sum, slot) => {
      return sum + (slot.end.getTime() - slot.start.getTime()) / 60000;
    }, 0);

    const hoursOfMeetings = totalBusyMinutes / 60;
    let modifier = 1.0;
    let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
    let explanation = '';

    if (hoursOfMeetings > 6) {
      modifier = 0.7;
      impact = 'negative';
      explanation = `Heavy meeting day (${hoursOfMeetings.toFixed(1)}h) - energy will be drained`;
    } else if (hoursOfMeetings > 4) {
      modifier = 0.85;
      impact = 'negative';
      explanation = `Moderate meeting load (${hoursOfMeetings.toFixed(1)}h)`;
    } else if (hoursOfMeetings < 2) {
      modifier = 1.1;
      impact = 'positive';
      explanation = "Light meeting day - more energy for deep work";
    }

    return {
      modifier,
      factor: {
        factor: 'calendar_density',
        impact,
        weight: 0.25,
        explanation,
      },
    };
  } catch {
    return null;
  }
}

function getPersonalPattern(
  history: EnergyHistoryEntry[],
  now: Date
): { avgScore: number } | null {
  if (history.length < 10) return null;

  // Find entries at similar time and day
  const hour = now.getHours();
  const day = now.getDay();

  const similar = history.filter(
    (e) => Math.abs(e.hour - hour) <= 1 && e.dayOfWeek === day
  );

  if (similar.length < 3) return null;

  const avgScore =
    similar.reduce((sum, e) => sum + ENERGY_SCORES[e.level], 0) / similar.length;

  return { avgScore };
}

async function getRecentStressFactor(
  userId: string
): Promise<{ modifier: number; factor: EnergyFactor } | null> {
  try {
    // Try to get recent wellbeing data
    const { getWellbeingProfile } = await import('../wellbeing-tracking/index.js');
    const profile = getWellbeingProfile(userId);

    if (!profile?.current) {
      return null;
    }

    // Use mood and energy from current snapshot (0-1 scale, convert to 0-100)
    const stressLevel = ((profile.current.dimensions.mood || 0.5) + (profile.current.dimensions.energy || 0.5)) / 2 * 100;

    // Higher wellbeing = more energy
    let modifier = 1.0;
    let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
    let explanation = '';

    if (stressLevel < 40) {
      modifier = 0.8;
      impact = 'negative';
      explanation = "Recent emotional strain may affect energy";
    } else if (stressLevel > 70) {
      modifier = 1.1;
      impact = 'positive';
      explanation = "Good emotional state supports energy";
    }

    return {
      modifier,
      factor: {
        factor: 'emotional_state',
        impact,
        weight: 0.2,
        explanation,
      },
    };
  } catch {
    return null;
  }
}

function findOptimalWindow(
  now: Date,
  history: EnergyHistoryEntry[],
  currentScore: number
): { windowStart: Date; windowEnd: Date } {
  // Look ahead 24 hours for best window
  const candidates: Array<{ hour: number; score: number }> = [];

  for (let hoursAhead = 0; hoursAhead < 24; hoursAhead++) {
    const future = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    const hour = future.getHours();
    const day = future.getDay();

    let score = BASE_HOURLY_ENERGY[hour] * DAY_OF_WEEK_MODIFIER[day];

    // Boost if we have good history for this time
    const historical = history.filter(
      (e) => Math.abs(e.hour - hour) <= 1 && e.dayOfWeek === day
    );
    if (historical.length >= 3) {
      const avgHistorical =
        historical.reduce((sum, e) => sum + ENERGY_SCORES[e.level], 0) /
        historical.length;
      score = score * 0.5 + avgHistorical * 0.5;
    }

    candidates.push({ hour: hoursAhead, score });
  }

  // Find best 2-hour window
  let bestStart = 0;
  let bestScore = 0;

  for (let i = 0; i < candidates.length - 2; i++) {
    const windowScore =
      (candidates[i].score + candidates[i + 1].score + candidates[i + 2].score) / 3;
    if (windowScore > bestScore) {
      bestScore = windowScore;
      bestStart = i;
    }
  }

  const windowStart = new Date(now.getTime() + bestStart * 60 * 60 * 1000);
  const windowEnd = new Date(windowStart.getTime() + 2 * 60 * 60 * 1000);

  return { windowStart, windowEnd };
}

function calculateConfidence(historyLength: number, factors: EnergyFactor[]): number {
  // Base confidence from data availability
  let confidence = 0.3;

  // More history = more confidence
  if (historyLength >= 50) confidence += 0.3;
  else if (historyLength >= 20) confidence += 0.2;
  else if (historyLength >= 10) confidence += 0.1;

  // More factors = more confidence
  confidence += Math.min(factors.length * 0.1, 0.3);

  return Math.min(confidence, 0.95);
}

function generateInsight(
  level: EnergyLevel,
  windowStart: Date,
  windowEnd: Date,
  factors: EnergyFactor[]
): { message: string; suggestion: string } {
  const timeStr = formatTimeWindow(windowStart, windowEnd);
  const positiveFactor = factors.find((f) => f.impact === 'positive');
  const negativeFactor = factors.find((f) => f.impact === 'negative');

  let message = '';
  let suggestion = '';

  if (level === 'peak' || level === 'high') {
    message = `Based on your patterns, ${timeStr} looks like a high-energy window.`;
    if (positiveFactor) {
      message += ` ${positiveFactor.explanation}.`;
    }
    suggestion =
      "This might be good timing for that difficult conversation or creative work you've been putting off.";
  } else if (level === 'moderate') {
    message = `Your energy looks moderate for ${timeStr}.`;
    suggestion = "Good for routine tasks, but maybe save the big stuff for later.";
  } else {
    message = `Energy might be lower ${timeStr}.`;
    if (negativeFactor) {
      message += ` ${negativeFactor.explanation}.`;
    }
    suggestion = "Consider lighter tasks or building in breaks.";
  }

  return { message, suggestion };
}

function formatTimeWindow(start: Date, end: Date): string {
  const now = new Date();
  const startHour = start.getHours();
  const endHour = end.getHours();

  const formatHour = (h: number) => {
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    return h > 12 ? `${h - 12}pm` : `${h}am`;
  };

  const isToday = start.toDateString() === now.toDateString();
  const isTomorrow =
    start.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();

  const dayStr = isToday ? 'today' : isTomorrow ? 'tomorrow' : start.toLocaleDateString();

  return `${dayStr} ${formatHour(startHour)}-${formatHour(endHour)}`;
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record an energy observation for learning
 */
export function recordEnergyObservation(
  userId: string,
  level: EnergyLevel,
  factors: string[] = []
): void {
  const now = new Date();
  const entry: EnergyHistoryEntry = {
    timestamp: now,
    level,
    dayOfWeek: now.getDay(),
    hour: now.getHours(),
    factors,
  };

  const history = energyHistories.get(userId) || [];
  history.push(entry);

  // Keep history bounded
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.splice(0, history.length - MAX_HISTORY_ENTRIES);
  }

  energyHistories.set(userId, history);
  log.debug({ userId, level, hour: entry.hour }, 'Recorded energy observation');
}

/**
 * Clear energy history for a user
 */
export function clearEnergyHistory(userId: string): void {
  energyHistories.delete(userId);
}

export default {
  predictEnergy,
  recordEnergyObservation,
  clearEnergyHistory,
};
