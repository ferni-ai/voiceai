/**
 * Seasonal Memory Service
 *
 * Time-anchored memories that enable moments like:
 * - "Last winter you mentioned struggling with the dark days"
 * - "Around this time last year, you were dealing with [X]"
 * - "I've noticed you tend to feel [X] around this time of year"
 *
 * Philosophy: These are MEMORIES, not data points. Frame as
 * a friend who remembers, not a system that tracks.
 *
 * @module services/personal-journey/seasonal-memory
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  AnnualPattern,
  JourneyMoment,
  Season,
  SeasonalMemory,
  SeasonalSnapshot,
  TimeAnchoredMemory,
} from './types.js';

const log = createLogger({ module: 'SeasonalMemory' });

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Season definitions (Northern Hemisphere - could be made configurable)
 */
const SEASONS: Record<Season, { months: number[]; description: string }> = {
  spring: { months: [3, 4, 5], description: 'spring - renewal and fresh starts' },
  summer: { months: [6, 7, 8], description: 'summer - warmth and activity' },
  fall: { months: [9, 10, 11], description: 'fall - reflection and change' },
  winter: { months: [12, 1, 2], description: 'winter - rest and introspection' },
};

/**
 * Messages for seasonal memory references
 * Framed as remembering, not tracking
 */
const SEASONAL_MESSAGES = {
  lastYearSameTime: [
    "Around this time last year, you were dealing with {topic}. <break time='200ms'/> I remember.",
    "This time last year, {topic} was on your mind. <break time='200ms'/> How are things now?",
    "I was thinking about last year around now... <break time='200ms'/> you mentioned {topic}.",
  ],
  lastSeason: [
    "Last {season}, you mentioned {topic}. <break time='200ms'/> How's that been?",
    "I remember last {season} you were going through {topic}. <break time='200ms'/> Any updates?",
  ],
  seasonalPattern: [
    "I've noticed you tend to feel {pattern} around this time of year. <break time='200ms'/> How are you holding up?",
    "This time of year often brings {pattern} for you, doesn't it? <break time='200ms'/> I'm here.",
    "Around {timeOfYear}, you usually {pattern}. <break time='200ms'/> Anything I can do?",
  ],
  seasonalStruggle: [
    "Last {season} was hard for you... <break time='200ms'/> the {struggle}. <break time='200ms'/> How's this {season} treating you?",
    "I remember the {struggle} last {season}. <break time='200ms'/> Is this year feeling different?",
  ],
  seasonalWin: [
    "Last {season} you achieved {win}. <break time='200ms'/> That was a big moment.",
    "Remember last {season} when {win}? <break time='200ms'/> Still proud of you for that.",
  ],
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const seasonalCache = new Map<string, SeasonalMemory>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current season
 */
export function getCurrentSeason(): Season {
  const month = new Date().getMonth() + 1; // 1-12
  for (const [season, config] of Object.entries(SEASONS)) {
    if (config.months.includes(month)) {
      return season as Season;
    }
  }
  return 'winter'; // Default fallback
}

/**
 * Get season from date
 */
export function getSeasonFromDate(date: Date): Season {
  const month = date.getMonth() + 1;
  for (const [season, config] of Object.entries(SEASONS)) {
    if (config.months.includes(month)) {
      return season as Season;
    }
  }
  return 'winter';
}

/**
 * Get previous season
 */
export function getPreviousSeason(season: Season): Season {
  const order: Season[] = ['spring', 'summer', 'fall', 'winter'];
  const idx = order.indexOf(season);
  return order[(idx - 1 + 4) % 4];
}

/**
 * Check if two dates are in the same "time of year" (within 2 weeks)
 */
function isSameTimeOfYear(date1: Date, date2: Date): boolean {
  const d1 = new Date(2000, date1.getMonth(), date1.getDate());
  const d2 = new Date(2000, date2.getMonth(), date2.getDate());
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  const diffDays = diffMs / (24 * 60 * 60 * 1000);
  return diffDays <= 14; // Within 2 weeks
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create empty seasonal memory
 */
function createEmptySeasonalMemory(userId: string): SeasonalMemory {
  return {
    userId,
    updatedAt: new Date(),
    seasonalSnapshots: [],
    timeAnchors: [],
    annualPatterns: [],
  };
}

/**
 * Get or create seasonal memory for user
 */
export function getSeasonalMemory(userId: string): SeasonalMemory {
  let memory = seasonalCache.get(userId);
  if (!memory) {
    memory = createEmptySeasonalMemory(userId);
    seasonalCache.set(userId, memory);
  }
  return memory;
}

/**
 * Initialize from persisted data
 */
export function initializeSeasonalMemory(
  userId: string,
  persistedData?: Partial<SeasonalMemory>
): void {
  if (persistedData) {
    const memory = {
      ...createEmptySeasonalMemory(userId),
      ...persistedData,
      userId,
    };
    seasonalCache.set(userId, memory);
    log.debug('Initialized seasonal memory from persisted data', {
      userId,
      snapshots: memory.seasonalSnapshots.length,
    });
  }
}

/**
 * Capture a seasonal snapshot (typically at end of season)
 */
export function captureSeasonalSnapshot(
  userId: string,
  data: {
    emotionalState: string;
    activeThemes: string[];
    keyMoments: string[];
    struggles?: string[];
    wins?: string[];
  }
): SeasonalSnapshot {
  const memory = getSeasonalMemory(userId);
  const now = new Date();
  const season = getCurrentSeason();
  const year = now.getFullYear();

  // Check if we already have a snapshot for this season/year
  const existing = memory.seasonalSnapshots.find((s) => s.season === season && s.year === year);

  if (existing) {
    // Update existing snapshot
    existing.emotionalState = data.emotionalState;
    existing.activeThemes = data.activeThemes;
    existing.keyMoments = data.keyMoments;
    existing.struggles = data.struggles;
    existing.wins = data.wins;
    log.debug('Updated seasonal snapshot', { userId, season, year });
    return existing;
  }

  // Create new snapshot
  const snapshot: SeasonalSnapshot = {
    id: generateId(),
    season,
    year,
    emotionalState: data.emotionalState,
    activeThemes: data.activeThemes,
    keyMoments: data.keyMoments,
    struggles: data.struggles,
    wins: data.wins,
    capturedAt: now,
  };

  memory.seasonalSnapshots.push(snapshot);
  memory.updatedAt = now;
  seasonalCache.set(userId, memory);

  log.info('Captured seasonal snapshot', { userId, season, year });
  return snapshot;
}

/**
 * Add a time-anchored memory
 */
export function addTimeAnchoredMemory(
  userId: string,
  data: {
    description: string;
    emotionalWeight: number;
    topics: string[];
    canReference?: boolean;
  }
): TimeAnchoredMemory {
  const memory = getSeasonalMemory(userId);
  const now = new Date();

  const anchor: TimeAnchoredMemory = {
    id: generateId(),
    approximateDate: now,
    description: data.description,
    emotionalWeight: data.emotionalWeight,
    topics: data.topics,
    canReference: data.canReference ?? true,
  };

  memory.timeAnchors.push(anchor);

  // Keep only last 50 anchors
  if (memory.timeAnchors.length > 50) {
    memory.timeAnchors = memory.timeAnchors.slice(-50);
  }

  memory.updatedAt = now;
  seasonalCache.set(userId, memory);

  log.debug('Added time-anchored memory', { userId, topics: data.topics });
  return anchor;
}

/**
 * Detect annual patterns from snapshots
 */
export function detectAnnualPatterns(userId: string): AnnualPattern[] {
  const memory = getSeasonalMemory(userId);
  const patterns: AnnualPattern[] = [];

  // Need at least 2 years of data
  if (memory.seasonalSnapshots.length < 4) {
    return patterns;
  }

  // Group snapshots by season
  const bySeasonMap = new Map<Season, SeasonalSnapshot[]>();
  for (const snapshot of memory.seasonalSnapshots) {
    const existing = bySeasonMap.get(snapshot.season) || [];
    existing.push(snapshot);
    bySeasonMap.set(snapshot.season, existing);
  }

  // Look for patterns in each season
  for (const [season, snapshots] of bySeasonMap.entries()) {
    if (snapshots.length < 2) continue;

    // Check for recurring emotional states
    const emotionalStates = snapshots.map((s) => s.emotionalState);
    const stateFrequency = new Map<string, number>();
    for (const state of emotionalStates) {
      stateFrequency.set(state, (stateFrequency.get(state) || 0) + 1);
    }

    for (const [state, count] of stateFrequency.entries()) {
      if (count >= 2 && count / snapshots.length >= 0.5) {
        // Pattern detected: same state in 50%+ of this season
        const existingPattern = memory.annualPatterns.find(
          (p) => p.timeOfYear === season && p.pattern.includes(state)
        );

        if (!existingPattern) {
          const pattern: AnnualPattern = {
            id: generateId(),
            timeOfYear: season,
            pattern: `tends to feel ${state}`,
            confidence: count / snapshots.length,
            yearsObserved: snapshots.length,
          };
          patterns.push(pattern);
          memory.annualPatterns.push(pattern);
        }
      }
    }

    // Check for recurring themes
    const allThemes = snapshots.flatMap((s) => s.activeThemes);
    const themeFrequency = new Map<string, number>();
    for (const theme of allThemes) {
      themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1);
    }

    for (const [theme, count] of themeFrequency.entries()) {
      if (count >= 2 && count / snapshots.length >= 0.5) {
        const existingPattern = memory.annualPatterns.find(
          (p) => p.timeOfYear === season && p.pattern.includes(theme)
        );

        if (!existingPattern) {
          const pattern: AnnualPattern = {
            id: generateId(),
            timeOfYear: season,
            pattern: `often focuses on ${theme}`,
            confidence: count / snapshots.length,
            yearsObserved: snapshots.length,
          };
          patterns.push(pattern);
          memory.annualPatterns.push(pattern);
        }
      }
    }
  }

  memory.updatedAt = new Date();
  seasonalCache.set(userId, memory);

  return patterns;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

/**
 * Get relevant memories for this time of year
 */
export function getRelevantTimeMemories(userId: string): JourneyMoment[] {
  const memory = getSeasonalMemory(userId);
  const moments: JourneyMoment[] = [];
  const now = new Date();
  const currentSeason = getCurrentSeason();
  const currentYear = now.getFullYear();

  // 1. Check for "this time last year" memories
  const lastYearSnapshots = memory.seasonalSnapshots.filter(
    (s) => s.season === currentSeason && s.year === currentYear - 1
  );

  for (const snapshot of lastYearSnapshots) {
    // Generate moment from key struggles
    if (snapshot.struggles && snapshot.struggles.length > 0) {
      const struggle = snapshot.struggles[0];
      const template =
        SEASONAL_MESSAGES.seasonalStruggle[
          Math.floor(Math.random() * SEASONAL_MESSAGES.seasonalStruggle.length)
        ];
      const message = template.replace(/{season}/g, currentSeason).replace(/{struggle}/g, struggle);

      moments.push({
        id: `seasonal_struggle_${snapshot.id}`,
        type: 'seasonal_memory',
        priority: 7,
        content: message,
        context: {
          season: currentSeason,
          year: currentYear - 1,
          originalStruggle: struggle,
        },
        source: 'seasonal-memory',
        requiresRelationshipStage: 'established',
      });
    }

    // Generate moment from key wins
    if (snapshot.wins && snapshot.wins.length > 0) {
      const win = snapshot.wins[0];
      const template =
        SEASONAL_MESSAGES.seasonalWin[
          Math.floor(Math.random() * SEASONAL_MESSAGES.seasonalWin.length)
        ];
      const message = template.replace(/{season}/g, currentSeason).replace(/{win}/g, win);

      moments.push({
        id: `seasonal_win_${snapshot.id}`,
        type: 'seasonal_memory',
        priority: 6,
        content: message,
        context: {
          season: currentSeason,
          year: currentYear - 1,
          originalWin: win,
        },
        source: 'seasonal-memory',
        requiresRelationshipStage: 'building',
      });
    }

    // Generate moment from key themes
    if (snapshot.activeThemes.length > 0) {
      const topic = snapshot.activeThemes[0];
      const template =
        SEASONAL_MESSAGES.lastYearSameTime[
          Math.floor(Math.random() * SEASONAL_MESSAGES.lastYearSameTime.length)
        ];
      const message = template.replace(/{topic}/g, topic);

      moments.push({
        id: `seasonal_theme_${snapshot.id}`,
        type: 'seasonal_memory',
        priority: 5,
        content: message,
        context: {
          season: currentSeason,
          year: currentYear - 1,
          originalTheme: topic,
        },
        source: 'seasonal-memory',
        requiresRelationshipStage: 'established',
      });
    }
  }

  // 2. Check for time-anchored memories around this time of year
  const relevantAnchors = memory.timeAnchors.filter(
    (a) =>
      a.canReference &&
      isSameTimeOfYear(a.approximateDate, now) &&
      a.approximateDate.getFullYear() < currentYear &&
      (!a.lastReferenced || now.getTime() - a.lastReferenced.getTime() > 30 * 24 * 60 * 60 * 1000) // Not referenced in 30 days
  );

  for (const anchor of relevantAnchors) {
    const yearDiff = currentYear - anchor.approximateDate.getFullYear();
    const template =
      SEASONAL_MESSAGES.lastYearSameTime[
        Math.floor(Math.random() * SEASONAL_MESSAGES.lastYearSameTime.length)
      ];
    const message = template.replace(/{topic}/g, anchor.description);

    moments.push({
      id: `anchor_${anchor.id}`,
      type: 'seasonal_memory',
      priority: 4 + Math.min(anchor.emotionalWeight * 3, 3), // Higher emotional weight = higher priority
      content: message,
      context: {
        yearsAgo: yearDiff,
        originalDescription: anchor.description,
        emotionalWeight: anchor.emotionalWeight,
      },
      source: 'seasonal-memory',
      requiresRelationshipStage: 'established',
    });
  }

  // 3. Check for annual patterns
  const relevantPatterns = memory.annualPatterns.filter(
    (p) => p.timeOfYear === currentSeason && p.confidence >= 0.5
  );

  for (const pattern of relevantPatterns) {
    const template =
      SEASONAL_MESSAGES.seasonalPattern[
        Math.floor(Math.random() * SEASONAL_MESSAGES.seasonalPattern.length)
      ];
    const message = template
      .replace(/{pattern}/g, pattern.pattern)
      .replace(/{timeOfYear}/g, currentSeason);

    moments.push({
      id: `pattern_${pattern.id}`,
      type: 'seasonal_pattern',
      priority: 6,
      content: message,
      context: {
        pattern: pattern.pattern,
        confidence: pattern.confidence,
        yearsObserved: pattern.yearsObserved,
      },
      source: 'seasonal-memory',
      requiresRelationshipStage: 'deep', // Only for deep relationships
    });
  }

  return moments;
}

/**
 * Mark a time-anchored memory as referenced
 */
export function markMemoryReferenced(userId: string, memoryId: string): void {
  const memory = getSeasonalMemory(userId);
  const anchor = memory.timeAnchors.find((a) => a.id === memoryId);

  if (anchor) {
    anchor.lastReferenced = new Date();
    memory.updatedAt = new Date();
    seasonalCache.set(userId, memory);
  }
}

/**
 * Get seasonal context for greetings
 */
export function getSeasonalGreetingContext(userId: string): {
  hasSeasonalInsight: boolean;
  insight?: string;
  insightType?: 'last_year' | 'pattern' | 'transition';
} {
  const memory = getSeasonalMemory(userId);
  const currentSeason = getCurrentSeason();
  const currentYear = new Date().getFullYear();

  // Not enough history
  if (memory.seasonalSnapshots.length < 2) {
    return { hasSeasonalInsight: false };
  }

  // Check for last year same season (low probability - special moment)
  if (Math.random() < 0.1) {
    const lastYear = memory.seasonalSnapshots.find(
      (s) => s.season === currentSeason && s.year === currentYear - 1
    );

    if (lastYear && lastYear.keyMoments.length > 0) {
      const moment = lastYear.keyMoments[0];
      return {
        hasSeasonalInsight: true,
        insight: `Around this time last year, you were dealing with ${moment}. <break time='200ms'/> Look how far you've come.`,
        insightType: 'last_year',
      };
    }
  }

  // Check for seasonal pattern (very low probability)
  if (Math.random() < 0.05) {
    const pattern = memory.annualPatterns.find(
      (p) => p.timeOfYear === currentSeason && p.confidence >= 0.6
    );

    if (pattern) {
      return {
        hasSeasonalInsight: true,
        insight: `I've noticed you ${pattern.pattern} around this time of year. <break time='200ms'/> How are you feeling?`,
        insightType: 'pattern',
      };
    }
  }

  return { hasSeasonalInsight: false };
}

/**
 * Get data for persistence
 */
export function getSeasonalMemoryForPersistence(userId: string): SeasonalMemory | null {
  return seasonalCache.get(userId) || null;
}

/**
 * Clear cache
 */
export function clearSeasonalCache(userId: string): void {
  seasonalCache.delete(userId);
  log.debug('Cleared seasonal cache', { userId });
}

/**
 * Check if we should capture a seasonal snapshot
 * (Called periodically, captures at end of seasons)
 */
export function shouldCaptureSnapshot(userId: string): boolean {
  const memory = getSeasonalMemory(userId);
  const now = new Date();
  const currentSeason = getCurrentSeason();
  const currentYear = now.getFullYear();

  // Check if we already have this season's snapshot
  const hasCurrentSnapshot = memory.seasonalSnapshots.some(
    (s) => s.season === currentSeason && s.year === currentYear
  );

  if (hasCurrentSnapshot) return false;

  // Check if we're near the end of a season (last week)
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // End of season: March, June, September, December
  const isEndOfSeason =
    (month === 3 && day >= 15) ||
    (month === 6 && day >= 15) ||
    (month === 9 && day >= 15) ||
    (month === 12 && day >= 15);

  return isEndOfSeason;
}
