/**
 * Circadian Manager
 *
 * Applies time-aware theming that adapts to human rhythms.
 * "Dark mode is not enough. Ferni knows the difference between 10am focus and 2am presence."
 *
 * FEATURES:
 * - Auto-detects time period and applies data-circadian attribute
 * - Sets CSS variables for warmth, brightness, animation speed
 * - Updates every 15 minutes
 * - Respects user manual override preference
 * - Smooth transitions between periods
 *
 * @see design-system/tokens/animation.json for period definitions
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CircadianManager');

// ============================================================================
// TYPES
// ============================================================================

export type CircadianPeriod =
  | 'earlyMorning'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'lateNight'
  | 'deepNight';

interface CircadianConfig {
  name: string;
  warmth: number;
  brightness: number;
  animationSpeed: number;
  presence: string;
}

// ============================================================================
// PERIOD DEFINITIONS (from design-system/tokens/animation.json)
// ============================================================================

const CIRCADIAN_PERIODS: Record<CircadianPeriod, { hours: [number, number] } & CircadianConfig> = {
  earlyMorning: {
    hours: [5, 7],
    name: 'Dawn',
    warmth: 0.15,
    brightness: 0.95,
    animationSpeed: 0.9,
    presence: 'gentle awakening',
  },
  morning: {
    hours: [7, 11],
    name: 'Morning',
    warmth: 0.1,
    brightness: 1.0,
    animationSpeed: 1.1,
    presence: 'fresh and energetic',
  },
  midday: {
    hours: [11, 14],
    name: 'Midday',
    warmth: 0,
    brightness: 1.0,
    animationSpeed: 1.0,
    presence: 'clear and focused',
  },
  afternoon: {
    hours: [14, 18],
    name: 'Afternoon',
    warmth: 0.05,
    brightness: 1.0,
    animationSpeed: 1.0,
    presence: 'productive calm',
  },
  evening: {
    hours: [18, 21],
    name: 'Evening',
    warmth: 0.2,
    brightness: 0.95,
    animationSpeed: 0.9,
    presence: 'winding down',
  },
  night: {
    hours: [21, 24],
    name: 'Night',
    warmth: 0.3,
    brightness: 0.85,
    animationSpeed: 0.8,
    presence: 'intimate and calm',
  },
  lateNight: {
    hours: [0, 3],
    name: 'Late Night',
    warmth: 0.35,
    brightness: 0.8,
    animationSpeed: 0.7,
    presence: 'fully present at 2am',
  },
  deepNight: {
    hours: [3, 5],
    name: 'Deep Night',
    warmth: 0.25,
    brightness: 0.75,
    animationSpeed: 0.6,
    presence: 'quiet companion',
  },
};

// ============================================================================
// STATE
// ============================================================================

let currentPeriod: CircadianPeriod | null = null;
let manualOverride: CircadianPeriod | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

// Storage keys for user preferences
const STORAGE_KEY = 'ferni_circadian_override';
const SLEEP_PATTERN_KEY = 'ferni_sleep_pattern';

// ============================================================================
// SLEEP PATTERN SYNC
// ============================================================================

export interface SleepPattern {
  /** Typical wake time in 24h format (e.g., 7.5 = 7:30 AM) */
  wakeTime: number;
  /** Typical sleep time in 24h format (e.g., 23 = 11:00 PM) */
  sleepTime: number;
  /** Whether user is a night owl (shifts late night periods later) */
  isNightOwl: boolean;
  /** Whether user is an early bird (shifts morning periods earlier) */
  isEarlyBird: boolean;
}

const DEFAULT_SLEEP_PATTERN: SleepPattern = {
  wakeTime: 7,      // 7:00 AM
  sleepTime: 23,    // 11:00 PM  
  isNightOwl: false,
  isEarlyBird: false,
};

let userSleepPattern: SleepPattern = { ...DEFAULT_SLEEP_PATTERN };

/**
 * Load user's sleep pattern from localStorage
 */
function loadSleepPattern(): SleepPattern {
  try {
    const saved = localStorage.getItem(SLEEP_PATTERN_KEY);
    if (saved) {
      return { ...DEFAULT_SLEEP_PATTERN, ...JSON.parse(saved) };
    }
  } catch {
    // localStorage not available or invalid JSON
  }
  return { ...DEFAULT_SLEEP_PATTERN };
}

/**
 * Save user's sleep pattern to localStorage
 */
function saveSleepPattern(pattern: SleepPattern): void {
  try {
    localStorage.setItem(SLEEP_PATTERN_KEY, JSON.stringify(pattern));
  } catch {
    // localStorage not available
  }
}

/**
 * Adjust hour based on user's sleep pattern
 * Shifts all periods relative to their actual wake/sleep times
 */
function adjustHourForSleepPattern(hour: number): number {
  const pattern = userSleepPattern;
  
  // Calculate offset from standard 7 AM wake time
  const wakeOffset = pattern.wakeTime - 7;
  
  // Apply night owl / early bird adjustments
  let adjustedHour = hour - wakeOffset;
  
  // Night owls: shift late night periods 1-2 hours later
  if (pattern.isNightOwl && hour >= 21) {
    adjustedHour -= 1.5;
  }
  
  // Early birds: shift morning periods 1 hour earlier
  if (pattern.isEarlyBird && hour >= 5 && hour < 11) {
    adjustedHour += 1;
  }
  
  // Normalize to 0-24 range
  if (adjustedHour < 0) adjustedHour += 24;
  if (adjustedHour >= 24) adjustedHour -= 24;
  
  return adjustedHour;
}

/**
 * Set user's sleep pattern
 * Call this after user provides sleep preferences
 */
export function setSleepPattern(pattern: Partial<SleepPattern>): void {
  userSleepPattern = { ...userSleepPattern, ...pattern };
  saveSleepPattern(userSleepPattern);
  log.info({ pattern: userSleepPattern }, 'Sleep pattern updated');
  
  // Re-detect period with new pattern
  if (isInitialized && !manualOverride) {
    updateCircadianPeriod();
  }
}

/**
 * Get current sleep pattern
 */
export function getSleepPattern(): SleepPattern {
  return { ...userSleepPattern };
}

/**
 * Infer sleep pattern from usage data
 * Call this with historical session data to auto-detect patterns
 */
export function inferSleepPatternFromUsage(sessionTimes: Date[]): SleepPattern | null {
  if (sessionTimes.length < 5) return null;
  
  const hours = sessionTimes.map(d => d.getHours());
  
  // Find typical active range
  const morningHours = hours.filter(h => h >= 5 && h < 12);
  const eveningHours = hours.filter(h => h >= 20 || h < 4);
  const lateNightHours = hours.filter(h => h >= 0 && h < 5);
  
  // Infer wake time from morning activity
  const avgMorning = morningHours.length > 0 
    ? morningHours.reduce((a, b) => a + b, 0) / morningHours.length
    : 7;
  
  // Infer sleep time from evening activity
  const avgEvening = eveningHours.length > 0
    ? eveningHours.reduce((a, b) => a + (b >= 20 ? b : b + 24), 0) / eveningHours.length
    : 23;
  
  // Detect night owl (lots of late night usage)
  const isNightOwl = lateNightHours.length >= sessionTimes.length * 0.15;
  
  // Detect early bird (morning usage before 7 AM)
  const isEarlyBird = hours.filter(h => h >= 5 && h < 7).length >= sessionTimes.length * 0.2;
  
  const inferred: SleepPattern = {
    wakeTime: Math.round(avgMorning),
    sleepTime: Math.round(avgEvening >= 24 ? avgEvening - 24 : avgEvening),
    isNightOwl,
    isEarlyBird,
  };
  
  log.info({ inferred, sampleSize: sessionTimes.length }, 'Inferred sleep pattern from usage');
  return inferred;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Detect the current circadian period based on time of day
 * Optionally adjusts for user's sleep pattern if available
 * 
 * @param date - Date to detect period for (defaults to now)
 * @param ignoreSleepPattern - If true, ignores user's sleep pattern adjustment
 */
export function detectCircadianPeriod(date: Date = new Date(), ignoreSleepPattern = false): CircadianPeriod {
  let hour = date.getHours() + date.getMinutes() / 60;
  
  // Adjust for user's sleep pattern if enabled
  if (!ignoreSleepPattern && userSleepPattern) {
    hour = adjustHourForSleepPattern(hour);
  }
  
  // Round to nearest integer for period matching
  const hourInt = Math.floor(hour);

  for (const [period, config] of Object.entries(CIRCADIAN_PERIODS)) {
    const [start, end] = config.hours;
    // Handle periods that span midnight
    if (start <= end) {
      if (hourInt >= start && hourInt < end) {
        return period as CircadianPeriod;
      }
    } else {
      // Spans midnight (e.g., lateNight: [0, 3])
      if (hourInt >= start || hourInt < end) {
        return period as CircadianPeriod;
      }
    }
  }

  // Default to midday if no match (shouldn't happen)
  return 'midday';
}

/**
 * Apply circadian theme CSS variables to an element
 */
export function applyCircadianTheme(
  period: CircadianPeriod,
  element: HTMLElement = document.documentElement
): void {
  const config = CIRCADIAN_PERIODS[period];

  // Set data attribute for CSS targeting
  element.setAttribute('data-circadian', period);

  // Set CSS variables with smooth transition
  element.style.setProperty('--circadian-warmth', String(config.warmth));
  element.style.setProperty('--circadian-brightness', String(config.brightness));
  element.style.setProperty('--circadian-animation-speed', String(config.animationSpeed));

  // Calculate and apply warmth filter
  const filter = `sepia(${config.warmth * 0.15}) saturate(${1 + config.warmth * 0.1})`;
  element.style.setProperty('--circadian-filter', filter);

  // Set period metadata
  element.style.setProperty('--circadian-period-name', `"${config.name}"`);
  element.style.setProperty('--circadian-presence', `"${config.presence}"`);

  log.debug({ period, name: config.name, warmth: config.warmth }, 'Applied circadian theme');
}

/**
 * Update circadian period if needed
 */
function updateCircadianPeriod(): void {
  // Respect manual override
  if (manualOverride) {
    if (currentPeriod !== manualOverride) {
      currentPeriod = manualOverride;
      applyCircadianTheme(manualOverride);
    }
    return;
  }

  const detectedPeriod = detectCircadianPeriod();
  if (detectedPeriod !== currentPeriod) {
    currentPeriod = detectedPeriod;
    applyCircadianTheme(detectedPeriod);
    log.info({ period: detectedPeriod }, 'Circadian period changed');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize circadian manager
 * - Applies initial theme based on current time
 * - Sets up auto-update interval (every 15 minutes)
 * - Loads any saved user override
 * - Loads user's sleep pattern for personalized periods
 */
export function initCircadianManager(): void {
  if (isInitialized) {
    log.debug('Circadian manager already initialized');
    return;
  }

  // Load saved sleep pattern
  userSleepPattern = loadSleepPattern();
  log.debug({ sleepPattern: userSleepPattern }, 'Loaded sleep pattern');

  // Load any saved override
  try {
    const savedOverride = localStorage.getItem(STORAGE_KEY);
    if (savedOverride && savedOverride in CIRCADIAN_PERIODS) {
      manualOverride = savedOverride as CircadianPeriod;
      log.debug({ override: manualOverride }, 'Loaded saved circadian override');
    }
  } catch {
    // localStorage not available
  }

  // Apply initial theme
  updateCircadianPeriod();

  // Set up auto-update every 15 minutes
  updateInterval = setInterval(updateCircadianPeriod, 15 * 60 * 1000);

  isInitialized = true;
  log.info(
    { period: currentPeriod, sleepPatternActive: userSleepPattern.wakeTime !== 7 || userSleepPattern.isNightOwl },
    'Circadian manager initialized'
  );
}

/**
 * Dispose circadian manager
 */
export function disposeCircadianManager(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  isInitialized = false;
  currentPeriod = null;
  log.debug('Circadian manager disposed');
}

/**
 * Set a manual override for circadian period
 * Pass null to clear override and return to auto-detection
 */
export function setCircadianOverride(period: CircadianPeriod | null): void {
  manualOverride = period;

  // Save preference
  try {
    if (period) {
      localStorage.setItem(STORAGE_KEY, period);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage not available
  }

  // Update immediately
  if (period) {
    currentPeriod = period;
    applyCircadianTheme(period);
    log.info({ period }, 'Circadian override set');
  } else {
    manualOverride = null;
    updateCircadianPeriod();
    log.info('Circadian override cleared');
  }
}

/**
 * Clear manual override and return to auto-detection
 */
export function clearCircadianOverride(): void {
  setCircadianOverride(null);
}

/**
 * Get current circadian period
 */
export function getCurrentCircadianPeriod(): CircadianPeriod | null {
  return currentPeriod;
}

/**
 * Get config for a circadian period
 */
export function getCircadianConfig(period: CircadianPeriod): CircadianConfig {
  const { hours: _hours, ...config } = CIRCADIAN_PERIODS[period];
  return config;
}

/**
 * Check if there's a manual override active
 */
export function hasCircadianOverride(): boolean {
  return manualOverride !== null;
}

/**
 * Get all available circadian periods
 */
export function getCircadianPeriods(): CircadianPeriod[] {
  return Object.keys(CIRCADIAN_PERIODS) as CircadianPeriod[];
}

/**
 * Force update circadian period (useful for testing)
 */
export function forceCircadianUpdate(): void {
  updateCircadianPeriod();
}

// ============================================================================
// CSS INJECTION
// ============================================================================

/**
 * Inject circadian CSS transitions for smooth period changes
 * Call once during app initialization
 */
export function injectCircadianStyles(): void {
  const styleId = 'circadian-manager-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Smooth transitions for circadian variable changes */
    :root {
      transition: 
        --circadian-warmth ${DURATION.DELIBERATE}ms ${EASING.GENTLE},
        --circadian-brightness ${DURATION.DELIBERATE}ms ${EASING.GENTLE},
        --circadian-animation-speed ${DURATION.DELIBERATE}ms ${EASING.GENTLE},
        --circadian-filter ${DURATION.DELIBERATE}ms ${EASING.GENTLE};
    }

    /* Apply circadian-aware animation speed to marked elements */
    .circadian-aware {
      animation-duration: calc(var(--base-duration, 1s) / var(--circadian-animation-speed, 1));
    }

    /* Apply circadian warmth filter to any element */
    .circadian-warm {
      filter: var(--circadian-filter, none);
    }

    /* Late night subtle background warmth */
    [data-circadian="lateNight"],
    [data-circadian="deepNight"] {
      --color-bg-circadian: color-mix(in oklch, var(--color-background-primary) 95%, var(--color-warm, #ffd700) 5%);
    }

    /* Reduced motion respects circadian */
    @media (prefers-reduced-motion: reduce) {
      .circadian-aware {
        animation-duration: 0ms !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const circadianManager = {
  init: initCircadianManager,
  dispose: disposeCircadianManager,
  setOverride: setCircadianOverride,
  clearOverride: clearCircadianOverride,
  getCurrentPeriod: getCurrentCircadianPeriod,
  getConfig: getCircadianConfig,
  hasOverride: hasCircadianOverride,
  getPeriods: getCircadianPeriods,
  forceUpdate: forceCircadianUpdate,
  injectStyles: injectCircadianStyles,
  detectPeriod: detectCircadianPeriod,
  applyTheme: applyCircadianTheme,
  // Sleep pattern sync
  setSleepPattern,
  getSleepPattern,
  inferSleepPatternFromUsage,
};

export default circadianManager;
