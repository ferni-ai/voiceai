/**
 * Temporal Pattern Detector - Unified Intelligence Level 3
 *
 * "Predicts emotional patterns across time"
 *
 * Detects temporal patterns that humans can't track objectively:
 *
 * - "You always get anxious before quarterly reviews"
 * - "Sunday evenings tend to bring up work anxiety"
 * - "You're more reflective around your anniversary"
 * - "Monday productivity correlates with Sunday sleep"
 * - "Your mood dips in winter months"
 *
 * This is a "Better Than Human" capability - no human friend
 * could consistently track these time-based patterns across
 * days, weeks, and seasons.
 *
 * @module intelligence/patterns/temporal-patterns
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'temporal-patterns' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Temporal context for pattern matching
 */
export interface TemporalContext {
  /** Day of week (0 = Sunday, 6 = Saturday) */
  dayOfWeek: number;
  /** Hour of day (0-23) */
  hourOfDay: number;
  /** Day of month (1-31) */
  dayOfMonth: number;
  /** Month (0-11) */
  month: number;
  /** Is weekend? */
  isWeekend: boolean;
  /** Is evening? (after 6pm) */
  isEvening: boolean;
  /** Is late night? (after 10pm) */
  isLateNight: boolean;
  /** Is early morning? (before 8am) */
  isEarlyMorning: boolean;
  /** Season */
  season: 'spring' | 'summer' | 'fall' | 'winter';
}

/**
 * Types of temporal patterns we track
 */
export type TemporalPatternType =
  | 'day_of_week' // Patterns that repeat weekly
  | 'time_of_day' // Patterns that repeat daily
  | 'monthly' // Patterns around specific dates
  | 'seasonal' // Patterns across seasons
  | 'anniversary' // Patterns around significant dates
  | 'recurring_event'; // Patterns around recurring events (reviews, meetings)

/**
 * A detected temporal pattern
 */
export interface TemporalPattern {
  id: string;
  userId: string;
  type: TemporalPatternType;
  /** Human-readable insight */
  insight: string;
  /** When does this pattern occur? */
  temporal: {
    dayOfWeek?: number[];
    hourRange?: [number, number];
    monthDay?: number;
    month?: number;
    seasonalPeriod?: 'spring' | 'summer' | 'fall' | 'winter';
  };
  /** What emotion/state is typically observed? */
  typicalState: {
    emotion?: string;
    topic?: string;
    energyLevel?: 'low' | 'medium' | 'high';
  };
  /** Confidence in this pattern */
  confidence: 'emerging' | 'likely' | 'confirmed';
  /** How many observations support this? */
  observationCount: number;
  /** When was this last observed? */
  lastObserved: Date;
  /** When was this pattern first detected? */
  firstDetected: Date;
  /** Has this been surfaced to the user? */
  surfaced: boolean;
  /** User reaction if surfaced */
  userReaction?: 'helpful' | 'neutral' | 'dismissed';
}

/**
 * An observation that feeds into pattern detection
 */
export interface TemporalObservation {
  userId: string;
  timestamp: Date;
  /** Temporal context when observed */
  context: TemporalContext;
  /** What was observed */
  state: {
    emotion: string;
    topic?: string;
    intensity?: number;
    energyLevel?: 'low' | 'medium' | 'high';
  };
  /** Any significant date context */
  dateContext?: {
    type: 'anniversary' | 'birthday' | 'recurring_event';
    name: string;
    daysAway: number;
  };
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface UserTemporalState {
  observations: TemporalObservation[];
  patterns: TemporalPattern[];
  lastAnalysis: Date | null;
}

const userStates = new Map<string, UserTemporalState>();

function getOrCreateState(userId: string): UserTemporalState {
  let state = userStates.get(userId);
  if (!state) {
    state = {
      observations: [],
      patterns: [],
      lastAnalysis: null,
    };
    userStates.set(userId, state);
  }
  return state;
}

// ============================================================================
// TEMPORAL CONTEXT EXTRACTION
// ============================================================================

/**
 * Get the current temporal context
 */
export function getTemporalContext(date: Date = new Date()): TemporalContext {
  const dayOfWeek = date.getDay();
  const hourOfDay = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth();

  return {
    dayOfWeek,
    hourOfDay,
    dayOfMonth,
    month,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    isEvening: hourOfDay >= 18,
    isLateNight: hourOfDay >= 22 || hourOfDay < 5,
    isEarlyMorning: hourOfDay >= 5 && hourOfDay < 8,
    season: getSeason(month),
  };
}

function getSeason(month: number): 'spring' | 'summer' | 'fall' | 'winter' {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

// ============================================================================
// OBSERVATION RECORDING
// ============================================================================

/**
 * Record a temporal observation for pattern detection.
 *
 * Call this each turn to build up data for pattern detection.
 *
 * @param userId - User ID
 * @param observation - Partial observation (timestamp/context auto-filled)
 */
export function recordTemporalObservation(
  userId: string,
  observation: Omit<TemporalObservation, 'userId' | 'timestamp' | 'context'> & {
    timestamp?: Date;
    context?: Partial<TemporalContext>;
  }
): void {
  const state = getOrCreateState(userId);
  const now = observation.timestamp || new Date();
  const context = {
    ...getTemporalContext(now),
    ...observation.context,
  };

  const fullObservation: TemporalObservation = {
    userId,
    timestamp: now,
    context,
    state: observation.state,
    dateContext: observation.dateContext,
  };

  state.observations.push(fullObservation);

  // Keep only last 500 observations per user to limit memory
  if (state.observations.length > 500) {
    state.observations = state.observations.slice(-500);
  }

  log.debug({ userId, emotion: observation.state.emotion }, 'Temporal observation recorded');
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze observations to detect temporal patterns.
 *
 * Should be called periodically (e.g., end of session or daily job).
 *
 * @param userId - User ID
 * @returns Newly detected or updated patterns
 */
export async function analyzeTemporalPatterns(userId: string): Promise<TemporalPattern[]> {
  const state = getOrCreateState(userId);

  // Need at least 10 observations for meaningful patterns
  if (state.observations.length < 10) {
    return [];
  }

  const newPatterns: TemporalPattern[] = [];

  // 1. Detect day-of-week patterns
  const dowPatterns = detectDayOfWeekPatterns(userId, state.observations);
  newPatterns.push(...dowPatterns);

  // 2. Detect time-of-day patterns
  const todPatterns = detectTimeOfDayPatterns(userId, state.observations);
  newPatterns.push(...todPatterns);

  // 3. Detect seasonal patterns (needs 30+ days of data)
  const oldestObs = state.observations[0];
  const daysSinceFirst = (Date.now() - oldestObs.timestamp.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceFirst > 30) {
    const seasonalPatterns = detectSeasonalPatterns(userId, state.observations);
    newPatterns.push(...seasonalPatterns);
  }

  // Merge with existing patterns (update confidence, etc.)
  for (const newPattern of newPatterns) {
    const existing = state.patterns.find((p) => p.insight === newPattern.insight);
    if (existing) {
      existing.observationCount = newPattern.observationCount;
      existing.lastObserved = newPattern.lastObserved;
      existing.confidence = newPattern.confidence;
    } else {
      state.patterns.push(newPattern);
    }
  }

  state.lastAnalysis = new Date();

  log.info({ userId, patternCount: state.patterns.length }, 'Temporal patterns analyzed');

  return newPatterns;
}

function detectDayOfWeekPatterns(
  userId: string,
  observations: TemporalObservation[]
): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];

  // Group by day of week
  const byDow: Map<number, TemporalObservation[]> = new Map();
  for (const obs of observations) {
    const dow = obs.context.dayOfWeek;
    if (!byDow.has(dow)) byDow.set(dow, []);
    byDow.get(dow)!.push(obs);
  }

  // Look for days with consistent emotional patterns
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const [dow, dayObs] of byDow) {
    if (dayObs.length < 3) continue; // Need at least 3 observations

    // Count emotions
    const emotionCounts: Map<string, number> = new Map();
    for (const obs of dayObs) {
      const count = emotionCounts.get(obs.state.emotion) || 0;
      emotionCounts.set(obs.state.emotion, count + 1);
    }

    // Find dominant emotion
    let maxCount = 0;
    let dominantEmotion = '';
    for (const [emotion, count] of emotionCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantEmotion = emotion;
      }
    }

    // Pattern if dominant emotion appears in 60%+ of observations
    const ratio = maxCount / dayObs.length;
    if (ratio >= 0.6 && dominantEmotion !== 'neutral') {
      const confidence = ratio >= 0.8 ? 'confirmed' : ratio >= 0.7 ? 'likely' : 'emerging';

      patterns.push({
        id: `dow_${userId}_${dow}_${dominantEmotion}`,
        userId,
        type: 'day_of_week',
        insight: `${dayNames[dow]}s tend to bring feelings of ${dominantEmotion}`,
        temporal: { dayOfWeek: [dow] },
        typicalState: { emotion: dominantEmotion },
        confidence,
        observationCount: dayObs.length,
        lastObserved: dayObs[dayObs.length - 1].timestamp,
        firstDetected: dayObs[0].timestamp,
        surfaced: false,
      });
    }
  }

  return patterns;
}

function detectTimeOfDayPatterns(
  userId: string,
  observations: TemporalObservation[]
): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];

  // Group by time period
  const periods = [
    { name: 'early morning', hours: [5, 8], obs: [] as TemporalObservation[] },
    { name: 'morning', hours: [8, 12], obs: [] as TemporalObservation[] },
    { name: 'afternoon', hours: [12, 17], obs: [] as TemporalObservation[] },
    { name: 'evening', hours: [17, 21], obs: [] as TemporalObservation[] },
    { name: 'late night', hours: [21, 24], obs: [] as TemporalObservation[] },
  ];

  for (const obs of observations) {
    const hour = obs.context.hourOfDay;
    for (const period of periods) {
      if (hour >= period.hours[0] && hour < period.hours[1]) {
        period.obs.push(obs);
        break;
      }
    }
  }

  for (const period of periods) {
    if (period.obs.length < 3) continue;

    // Count emotions
    const emotionCounts: Map<string, number> = new Map();
    for (const obs of period.obs) {
      const count = emotionCounts.get(obs.state.emotion) || 0;
      emotionCounts.set(obs.state.emotion, count + 1);
    }

    // Find dominant emotion
    let maxCount = 0;
    let dominantEmotion = '';
    for (const [emotion, count] of emotionCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantEmotion = emotion;
      }
    }

    const ratio = maxCount / period.obs.length;
    if (ratio >= 0.6 && dominantEmotion !== 'neutral') {
      const confidence = ratio >= 0.8 ? 'confirmed' : ratio >= 0.7 ? 'likely' : 'emerging';

      patterns.push({
        id: `tod_${userId}_${period.name.replace(' ', '_')}_${dominantEmotion}`,
        userId,
        type: 'time_of_day',
        insight: `${period.name.charAt(0).toUpperCase() + period.name.slice(1)} conversations often have a ${dominantEmotion} tone`,
        temporal: { hourRange: period.hours as [number, number] },
        typicalState: { emotion: dominantEmotion },
        confidence,
        observationCount: period.obs.length,
        lastObserved: period.obs[period.obs.length - 1].timestamp,
        firstDetected: period.obs[0].timestamp,
        surfaced: false,
      });
    }
  }

  return patterns;
}

function detectSeasonalPatterns(
  userId: string,
  observations: TemporalObservation[]
): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];

  // Group by season
  const bySeason: Map<string, TemporalObservation[]> = new Map();
  for (const obs of observations) {
    const season = obs.context.season;
    if (!bySeason.has(season)) bySeason.set(season, []);
    bySeason.get(season)!.push(obs);
  }

  for (const [season, seasonObs] of bySeason) {
    if (seasonObs.length < 5) continue; // Need more data for seasonal patterns

    // Check for low energy patterns (common in winter)
    const lowEnergyCount = seasonObs.filter((o) => o.state.energyLevel === 'low').length;
    const lowEnergyRatio = lowEnergyCount / seasonObs.length;

    if (lowEnergyRatio >= 0.5) {
      patterns.push({
        id: `seasonal_${userId}_${season}_energy`,
        userId,
        type: 'seasonal',
        insight: `Energy tends to be lower during ${season}`,
        temporal: { seasonalPeriod: season as 'spring' | 'summer' | 'fall' | 'winter' },
        typicalState: { energyLevel: 'low' },
        confidence: lowEnergyRatio >= 0.7 ? 'likely' : 'emerging',
        observationCount: seasonObs.length,
        lastObserved: seasonObs[seasonObs.length - 1].timestamp,
        firstDetected: seasonObs[0].timestamp,
        surfaced: false,
      });
    }
  }

  return patterns;
}

// ============================================================================
// PATTERN RETRIEVAL
// ============================================================================

/**
 * Get temporal patterns for a user, optionally filtered by relevance.
 *
 * @param userId - User ID
 * @param options - Filter options
 */
export function getTemporalPatterns(
  userId: string,
  options?: {
    minConfidence?: 'emerging' | 'likely' | 'confirmed';
    type?: TemporalPatternType;
    currentOnly?: boolean; // Only patterns relevant to current time
  }
): TemporalPattern[] {
  const state = userStates.get(userId);
  if (!state) return [];

  let patterns = [...state.patterns];

  // Filter by confidence
  if (options?.minConfidence) {
    const levels = ['emerging', 'likely', 'confirmed'];
    const minLevel = levels.indexOf(options.minConfidence);
    patterns = patterns.filter((p) => levels.indexOf(p.confidence) >= minLevel);
  }

  // Filter by type
  if (options?.type) {
    patterns = patterns.filter((p) => p.type === options.type);
  }

  // Filter to current time context
  if (options?.currentOnly) {
    const now = getTemporalContext();
    patterns = patterns.filter((p) => {
      if (p.temporal.dayOfWeek && !p.temporal.dayOfWeek.includes(now.dayOfWeek)) return false;
      if (p.temporal.hourRange) {
        const [start, end] = p.temporal.hourRange;
        if (now.hourOfDay < start || now.hourOfDay >= end) return false;
      }
      if (p.temporal.seasonalPeriod && p.temporal.seasonalPeriod !== now.season) return false;
      return true;
    });
  }

  return patterns;
}

/**
 * Get patterns relevant to the current temporal context.
 *
 * Useful for context injection to the LLM.
 */
export function getRelevantTemporalPatterns(userId: string): TemporalPattern[] {
  return getTemporalPatterns(userId, {
    minConfidence: 'likely',
    currentOnly: true,
  });
}

/**
 * Format temporal patterns for LLM context injection.
 */
export function formatTemporalPatternsForPrompt(patterns: TemporalPattern[]): string {
  if (patterns.length === 0) return '';

  const lines = ['[TEMPORAL PATTERNS - "Better Than Human" awareness]'];

  for (const pattern of patterns.slice(0, 3)) {
    // Limit to 3 most relevant
    lines.push(`- ${pattern.insight}`);
  }

  lines.push('Use this awareness subtly - acknowledge patterns when relevant, not robotically.');

  return lines.join('\n');
}

// ============================================================================
// CLEANUP & UTILITY
// ============================================================================

/**
 * Mark a pattern as surfaced (shown to user).
 */
export function markPatternSurfaced(
  userId: string,
  patternId: string,
  reaction?: 'helpful' | 'neutral' | 'dismissed'
): void {
  const state = userStates.get(userId);
  if (!state) return;

  const pattern = state.patterns.find((p) => p.id === patternId);
  if (pattern) {
    pattern.surfaced = true;
    pattern.userReaction = reaction;
  }
}

/**
 * Clear temporal state for a user (for testing or data deletion).
 */
export function clearTemporalState(userId?: string): void {
  if (userId) {
    userStates.delete(userId);
  } else {
    userStates.clear();
  }
}

/**
 * Get observation count for a user (for debugging).
 */
export function getObservationCount(userId: string): number {
  const state = userStates.get(userId);
  return state?.observations.length ?? 0;
}
