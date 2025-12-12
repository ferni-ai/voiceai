/**
 * Temporal Voice Adaptation
 *
 * Adjusts voice characteristics based on time of day and day of week.
 * Makes the AI feel contextually aware and emotionally present.
 *
 * - Late night (11pm-5am) → slower, softer, more intimate
 * - Early morning (5am-8am) → gentle, warm wake-up energy
 * - Monday morning → extra supportive
 * - Friday evening → lighter, celebratory
 * - Weekend → more relaxed pace
 *
 * @module speech/adaptive-ssml/temporal-voice
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TemporalContext {
  /** Hour of day (0-23) */
  hour?: number;
  /** Day of week (0=Sunday, 6=Saturday) */
  dayOfWeek?: number;
  /** User's timezone offset in hours (optional) */
  timezoneOffset?: number;
}

export interface TemporalVoiceOptions {
  /** Skip if text already has speed/volume tags */
  skipIfHasTags?: boolean;
  /** Enable late night mode (default true) */
  enableLateNight?: boolean;
  /** Enable day-of-week awareness (default true) */
  enableDayAwareness?: boolean;
}

export interface TemporalVoiceResult {
  text: string;
  adjustments: {
    speedRatio: number;
    volumeRatio: number;
    period: string;
  };
}

// ============================================================================
// TIME PERIOD PROFILES
// ============================================================================

interface TimePeriodProfile {
  speedRatio: number;
  volumeRatio: number;
  name: string;
}

const TIME_PERIODS: Record<string, TimePeriodProfile> = {
  // Late night (11pm - 4am) - intimate, quiet
  late_night: { speedRatio: 0.9, volumeRatio: 0.85, name: 'late night' },

  // Very early morning (4am - 6am) - gentle, soft
  very_early: { speedRatio: 0.92, volumeRatio: 0.88, name: 'early morning' },

  // Early morning (6am - 9am) - warm, gentle energy
  early_morning: { speedRatio: 0.95, volumeRatio: 0.95, name: 'morning' },

  // Morning (9am - 12pm) - standard with slight warmth
  morning: { speedRatio: 1.0, volumeRatio: 1.0, name: 'mid-morning' },

  // Afternoon (12pm - 5pm) - fully engaged
  afternoon: { speedRatio: 1.0, volumeRatio: 1.0, name: 'afternoon' },

  // Evening (5pm - 8pm) - winding down
  evening: { speedRatio: 0.97, volumeRatio: 0.97, name: 'evening' },

  // Night (8pm - 11pm) - relaxed
  night: { speedRatio: 0.95, volumeRatio: 0.92, name: 'night' },
};

// Day-of-week modifiers
const DAY_MODIFIERS: Record<number, { speedMod: number; volumeMod: number; note: string }> = {
  0: { speedMod: 0.97, volumeMod: 1.0, note: 'Sunday - relaxed pace' },
  1: { speedMod: 0.98, volumeMod: 1.0, note: 'Monday - supportive energy' },
  5: { speedMod: 1.02, volumeMod: 1.0, note: 'Friday - lighter energy' },
  6: { speedMod: 0.97, volumeMod: 1.0, note: 'Saturday - relaxed pace' },
};

// ============================================================================
// CORE FUNCTION
// ============================================================================

/**
 * Get the time period based on hour
 */
function getTimePeriod(hour: number): TimePeriodProfile {
  if (hour >= 23 || hour < 4) return TIME_PERIODS.late_night;
  if (hour >= 4 && hour < 6) return TIME_PERIODS.very_early;
  if (hour >= 6 && hour < 9) return TIME_PERIODS.early_morning;
  if (hour >= 9 && hour < 12) return TIME_PERIODS.morning;
  if (hour >= 12 && hour < 17) return TIME_PERIODS.afternoon;
  if (hour >= 17 && hour < 20) return TIME_PERIODS.evening;
  return TIME_PERIODS.night;
}

/**
 * Apply temporal voice adjustments based on time of day.
 *
 * @param text - The text to wrap with adjustments
 * @param context - Temporal context (hour, day)
 * @param options - Configuration options
 * @returns Text with SSML tags and adjustment info
 */
export function applyTemporalVoice(
  text: string,
  context: TemporalContext = {},
  options: TemporalVoiceOptions = {}
): TemporalVoiceResult {
  const { skipIfHasTags = true, enableLateNight = true, enableDayAwareness = true } = options;

  // Skip if already has speed/volume tags
  if (skipIfHasTags && (text.includes('<speed') || text.includes('<volume'))) {
    return {
      text,
      adjustments: { speedRatio: 1.0, volumeRatio: 1.0, period: 'skipped' },
    };
  }

  // Get current time (use provided or system time)
  const now = new Date();
  const hour = context.hour ?? now.getHours();
  const dayOfWeek = context.dayOfWeek ?? now.getDay();

  // Get time period profile
  const period = getTimePeriod(hour);
  let speedRatio = period.speedRatio;
  let volumeRatio = period.volumeRatio;

  // Apply late night mode check
  if (!enableLateNight && (hour >= 23 || hour < 6)) {
    // Disable late night adjustments
    speedRatio = 1.0;
    volumeRatio = 1.0;
  }

  // Apply day-of-week modifier
  if (enableDayAwareness && DAY_MODIFIERS[dayOfWeek]) {
    const modifier = DAY_MODIFIERS[dayOfWeek];
    speedRatio *= modifier.speedMod;
    volumeRatio *= modifier.volumeMod;
  }

  // Round to 2 decimal places
  speedRatio = Math.round(speedRatio * 100) / 100;
  volumeRatio = Math.round(volumeRatio * 100) / 100;

  // Only apply if there's meaningful change
  const hasChange = speedRatio !== 1.0 || volumeRatio !== 1.0;

  if (!hasChange) {
    return {
      text,
      adjustments: { speedRatio: 1.0, volumeRatio: 1.0, period: period.name },
    };
  }

  // Build SSML prefix
  let prefix = '';
  if (speedRatio !== 1.0) {
    prefix += `<speed ratio="${speedRatio.toFixed(2)}"/>`;
  }
  if (volumeRatio !== 1.0) {
    prefix += `<volume ratio="${volumeRatio.toFixed(2)}"/>`;
  }

  return {
    text: prefix + text,
    adjustments: { speedRatio, volumeRatio, period: period.name },
  };
}

/**
 * Check if current time is "late night" mode
 */
export function isLateNight(hour?: number): boolean {
  const h = hour ?? new Date().getHours();
  return h >= 23 || h < 5;
}

/**
 * Get a human-readable description of the current time period
 */
export function getTimePeriodName(hour?: number): string {
  const h = hour ?? new Date().getHours();
  return getTimePeriod(h).name;
}
