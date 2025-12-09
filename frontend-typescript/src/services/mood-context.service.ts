/**
 * Mood Context Service
 * 
 * Provides time-based and date-based mood context for Ferni.
 * This enables visual representation of Ferni's mood based on:
 * - Time of day (early morning contemplative, evening reflective)
 * - Special dates (March 11 tsunami anniversary = more subdued)
 * 
 * Based on Ferni's persona.manifest.json personality.moods_by_time
 * 
 * @module @ferni/mood-context
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('MoodContext');

// ============================================================================
// TYPES
// ============================================================================

export type TimeOfDay = 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';

export interface MoodContext {
  /** Current time of day segment */
  timeOfDay: TimeOfDay;
  
  /** Is today a special/significant date? */
  isSpecialDate: boolean;
  
  /** Name of special date if applicable */
  specialDateName?: string;
  
  /** Energy modifier (-0.2 to +0.1, affects animation speed) */
  energyModifier: number;
  
  /** Mood indicator (what Ferni might mention) */
  moodIndicator: string;
  
  /** CSS class to apply to body */
  cssClass: string;
}

// ============================================================================
// SPECIAL DATES (from Ferni's persona.manifest.json)
// ============================================================================

interface SpecialDate {
  name: string;
  mood: string;
  energyModifier: number;
  note: string;
}

/**
 * Special dates from Ferni's backstory that affect his mood
 * Based on his biography: Wyoming roots, Japan years, global travels
 */
const SPECIAL_DATES: Record<string, SpecialDate> = {
  // =========================================================================
  // JAPAN MEMORIES
  // =========================================================================
  
  // March 11 - Japan Tsunami Anniversary (2011)
  // "The silence before was the worst part. Then the roar. Then the aftermath."
  '03-11': {
    name: 'tsunami_anniversary',
    mood: 'contemplative',
    energyModifier: -0.2,
    note: 'Heavy day. More present, less action-oriented.',
  },
  
  // Cherry Blossom Season (late March - early April)
  // "Spring: Japan memories. Cherry blossoms. Renewal."
  '03-28': {
    name: 'sakura_season_start',
    mood: 'nostalgic-hopeful',
    energyModifier: -0.05,
    note: 'Cherry blossoms are blooming in Japan. Renewal energy.',
  },
  '04-05': {
    name: 'sakura_peak',
    mood: 'nostalgic-hopeful',
    energyModifier: 0,
    note: 'Peak sakura season. Beautiful memories.',
  },
  
  // =========================================================================
  // WYOMING ROOTS
  // =========================================================================
  
  // First snow typically (late October/November)
  // "Cold winters taught you resilience. The land doesn't care about your plans."
  '10-28': {
    name: 'first_snow_memory',
    mood: 'nostalgic-grounded',
    energyModifier: -0.05,
    note: 'Snow reminds me of home. Wyoming winters.',
  },
  
  // Summer solstice - Wyoming sky memories
  // "That sky doesn't leave you. Ever."
  '06-21': {
    name: 'wyoming_sky',
    mood: 'expansive',
    energyModifier: 0.1,
    note: 'Longest day. The Wyoming sky feels infinite today.',
  },
  
  // =========================================================================
  // GLOBAL WISDOM
  // =========================================================================
  
  // Carnaval Season (February/March - varies)
  // "Brazil taught you joy. Real celebration, not performance."
  '02-21': {
    name: 'brazil_joy',
    mood: 'celebratory',
    energyModifier: 0.15,
    note: 'Carnaval energy. Brazil taught me real joy.',
  },
  
  // Diwali Season (October/November - varies)
  // "India taught you service. Generosity from people who had nothing."
  '11-01': {
    name: 'india_service',
    mood: 'grateful',
    energyModifier: 0,
    note: 'Festival of lights. India taught me generosity.',
  },
  
  // =========================================================================
  // MENTAL HEALTH AWARENESS
  // =========================================================================
  
  // Mental Health Awareness Month (May)
  '05-01': {
    name: 'mental_health_month',
    mood: 'advocacy',
    energyModifier: 0,
    note: 'Mental Health Awareness Month. Everyone carries battles you know nothing about.',
  },
  
  // World Suicide Prevention Day
  '09-10': {
    name: 'prevention_day',
    mood: 'present-caring',
    energyModifier: -0.1,
    note: 'Important day. Extra present for anyone who needs it.',
  },
  
  // =========================================================================
  // HOLIDAYS (Universal)
  // =========================================================================
  
  // New Year's Day - Reflection
  '01-01': {
    name: 'new_year',
    mood: 'reflective-hopeful',
    energyModifier: 0,
    note: 'New beginnings. What do you want this year to mean?',
  },
  
  // Thanksgiving (US) - approximate
  '11-28': {
    name: 'thanksgiving',
    mood: 'grateful',
    energyModifier: 0.05,
    note: 'Gratitude day. Eight kids across two households. My heart is full.',
  },
  
  // Winter Solstice - Shortest day
  '12-21': {
    name: 'winter_solstice',
    mood: 'quiet-presence',
    energyModifier: -0.1,
    note: 'Shortest day. Good time for reflection.',
  },
};

// ============================================================================
// TIME-BASED MOODS (from Ferni's persona.manifest.json)
// ============================================================================

interface TimeBasedMood {
  startHour: number;
  endHour: number;
  timeOfDay: TimeOfDay;
  mood: string;
  energyModifier: number;
  indicator: string;
}

/**
 * Time-based mood settings from Ferni's manifest
 */
const TIME_MOODS: TimeBasedMood[] = [
  {
    startHour: 5,
    endHour: 8,
    timeOfDay: 'early_morning',
    mood: 'contemplative-coffee',
    energyModifier: -0.1,
    indicator: "Up early. Wyoming habits. Coffee's good. What's on your mind?",
  },
  {
    startHour: 8,
    endHour: 12,
    timeOfDay: 'morning',
    mood: 'engaged-morning',
    energyModifier: 0.1,
    indicator: "Morning energy. Let's tackle something.",
  },
  {
    startHour: 12,
    endHour: 17,
    timeOfDay: 'afternoon',
    mood: 'active-afternoon',
    energyModifier: 0,
    indicator: 'Full day mode. What can we work on?',
  },
  {
    startHour: 17,
    endHour: 21,
    timeOfDay: 'evening',
    mood: 'reflective-evening',
    energyModifier: -0.05,
    indicator: "Evening wind-down. How'd the day go?",
  },
  {
    startHour: 21,
    endHour: 5, // Wraps to next day
    timeOfDay: 'late_night',
    mood: 'quiet-presence',
    energyModifier: -0.15,
    indicator: 'Late night. Something on your mind?',
  },
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get the current time of day segment
 */
function getTimeOfDay(hour: number): TimeBasedMood {
  for (const mood of TIME_MOODS) {
    // Handle wrap-around (late_night spans 21-5)
    if (mood.startHour > mood.endHour) {
      if (hour >= mood.startHour || hour < mood.endHour) {
        return mood;
      }
    } else {
      if (hour >= mood.startHour && hour < mood.endHour) {
        return mood;
      }
    }
  }
  
  // Default to afternoon if somehow not found
  return TIME_MOODS[2] ?? TIME_MOODS[0]!;
}

/**
 * Check if today is a special date
 */
function checkSpecialDate(): SpecialDate | null {
  const today = new Date();
  const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  return SPECIAL_DATES[monthDay] || null;
}

/**
 * Get the full mood context for the current moment
 */
export function getMoodContext(): MoodContext {
  const now = new Date();
  const hour = now.getHours();
  
  // Get time-based mood
  const timeMood = getTimeOfDay(hour);
  
  // Check for special date
  const specialDate = checkSpecialDate();
  
  // Calculate final energy modifier (special date takes precedence if present)
  const energyModifier = specialDate?.energyModifier ?? timeMood.energyModifier;
  
  // Build CSS class
  const cssClass = specialDate 
    ? `mood-${timeMood.timeOfDay} mood-special mood-${specialDate.name}`
    : `mood-${timeMood.timeOfDay}`;
  
  return {
    timeOfDay: timeMood.timeOfDay,
    isSpecialDate: !!specialDate,
    specialDateName: specialDate?.name,
    energyModifier,
    moodIndicator: specialDate?.note || timeMood.indicator,
    cssClass,
  };
}

/**
 * Get appropriate mood indicator text for greeting context
 */
export function getMoodIndicator(): string {
  const context = getMoodContext();
  return context.moodIndicator;
}

/**
 * Check if Ferni should be in a more contemplative/quiet mode
 */
export function isContemplativeMode(): boolean {
  const context = getMoodContext();
  return context.energyModifier < -0.1 || context.isSpecialDate;
}

// ============================================================================
// VISUAL APPLICATION
// ============================================================================

/**
 * Apply mood context CSS classes to the document
 * Call this on app init and periodically (every hour) to update
 */
export function applyMoodContext(): void {
  const context = getMoodContext();
  
  // Remove existing mood classes
  const existingClasses = Array.from(document.body.classList)
    .filter(c => c.startsWith('mood-'));
  existingClasses.forEach(c => document.body.classList.remove(c));
  
  // Add current mood classes
  context.cssClass.split(' ').forEach(c => {
    if (c) document.body.classList.add(c);
  });
  
  // Set CSS custom property for energy modifier
  // Can be used by animations: animation-duration: calc(var(--energy-modifier) * base)
  document.documentElement.style.setProperty('--energy-modifier', String(1 + context.energyModifier));
  
  // Set breath duration modifier (slower when contemplative)
  if (context.energyModifier < 0) {
    // Slower breathing when energy is lower
    const breathMultiplier = 1 - context.energyModifier; // e.g., -0.2 becomes 1.2 (20% slower)
    document.documentElement.style.setProperty('--breath-duration-modifier', String(breathMultiplier));
  } else {
    document.documentElement.style.setProperty('--breath-duration-modifier', '1');
  }
  
  log.info('🌅 Mood context applied', {
    timeOfDay: context.timeOfDay,
    isSpecialDate: context.isSpecialDate,
    energyModifier: context.energyModifier,
  });
}

/**
 * Initialize mood context system
 * Sets up initial state and hourly refresh
 */
let moodRefreshInterval: ReturnType<typeof setInterval> | null = null;

export function initMoodContext(): void {
  // Apply immediately
  applyMoodContext();
  
  // Refresh every hour (mood changes with time of day)
  if (moodRefreshInterval) {
    clearInterval(moodRefreshInterval);
  }
  moodRefreshInterval = setInterval(applyMoodContext, 60 * 60 * 1000);
  
  log.info('🌅 Mood context system initialized');
}

/**
 * Dispose mood context system
 */
export function disposeMoodContext(): void {
  if (moodRefreshInterval) {
    clearInterval(moodRefreshInterval);
    moodRefreshInterval = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const moodContext = {
  get: getMoodContext,
  getIndicator: getMoodIndicator,
  isContemplative: isContemplativeMode,
  apply: applyMoodContext,
  init: initMoodContext,
  dispose: disposeMoodContext,
};

