/**
 * Timing Intelligence Service
 *
 * Learns when users are most receptive to outreach and ensures we reach out
 * at optimal times - not just "preferred hours" but understanding life patterns.
 *
 * Key Intelligence:
 * 1. Engagement Patterns - When do they typically respond?
 * 2. Response Rates - Which times get the best response?
 * 3. Life Events - Don't reach out during known busy times
 * 4. Contextual Timing - Morning person vs night owl
 * 5. Channel Timing - Best time for calls vs texts vs email
 *
 * Philosophy: Reach out when they're receptive, not when it's convenient for us.
 */

import { getDefaultStore } from '../../memory/in-memory-store.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { OutreachPriority } from './decision-engine.js';
import { loadOutreachProfile, saveOutreachProfile } from './firestore-persistence.js';
import type { OutreachChannel } from './persona-voice-generator.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

// ============================================================================
// TIMEZONE UTILITIES
// ============================================================================

/**
 * Get the user's local hour for a given UTC time
 * Uses Intl.DateTimeFormat for proper timezone handling
 */
function getLocalHour(utcTime: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    const hourStr = formatter.format(utcTime);
    return parseInt(hourStr, 10);
  } catch {
    // Fallback for invalid timezone
    return utcTime.getHours();
  }
}

/**
 * Get the user's local day of week for a given UTC time
 * Returns 0=Sun, 6=Sat
 */
function getLocalDayOfWeek(utcTime: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: timezone,
    });
    const dayStr = formatter.format(utcTime);
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return dayMap[dayStr] ?? utcTime.getDay();
  } catch {
    return utcTime.getDay();
  }
}

/**
 * Convert UTC time to user's local time representation
 * Returns a Date-like object with user's local time values
 */
function toUserLocalTime(
  utcTime: Date,
  timezone: string
): { hour: number; day: number; date: Date } {
  return {
    hour: getLocalHour(utcTime, timezone),
    day: getLocalDayOfWeek(utcTime, timezone),
    date: utcTime, // Keep original Date for comparisons
  };
}

/**
 * Check if current time is within quiet hours for user's timezone
 */
function isWithinQuietHours(
  utcTime: Date,
  timezone: string,
  quietHoursStart: string, // "22:00"
  quietHoursEnd: string // "07:00"
): boolean {
  const localHour = getLocalHour(utcTime, timezone);
  const startHour = parseInt(quietHoursStart.split(':')[0], 10);
  const endHour = parseInt(quietHoursEnd.split(':')[0], 10);

  // Handle overnight quiet hours (e.g., 22:00 to 07:00)
  if (startHour > endHour) {
    return localHour >= startHour || localHour < endHour;
  }
  // Same day quiet hours (e.g., 12:00 to 14:00)
  return localHour >= startHour && localHour < endHour;
}

// ============================================================================
// TYPES
// ============================================================================

export interface TimingProfile {
  userId: string;

  // Learned patterns from engagement
  engagementPatterns: {
    preferredHours: number[]; // Hours that get best response (0-23)
    preferredDays: number[]; // Days that get best response (0=Sun, 6=Sat)
    responseRateByHour: Map<number, number>; // Hour -> response rate (0-1)
    responseRateByDay: Map<number, number>; // Day -> response rate (0-1)
    avgResponseTimeMs: number; // How quickly they respond
    lastSuccessfulContactTime?: Date;
    totalInteractions: number;
    totalResponses: number;
  };

  // Explicit user preferences
  preferences: {
    quietHoursStart: string; // "22:00"
    quietHoursEnd: string; // "07:00"
    timezone: string;
    neverDuring: NeverDuringRule[];
    bestTimeFor: Partial<Record<OutreachChannel, TimePeriod>>;
    preferMornings?: boolean;
    preferEvenings?: boolean;
  };

  // Life context that affects timing
  lifeContext: {
    busyPeriods: BusyPeriod[];
    recurringEvents: RecurringEvent[];
    workSchedule?: WorkSchedule;
    sleepPattern?: SleepPattern;
  };

  // Channel-specific timing
  channelTiming: {
    call: ChannelTimingData;
    sms: ChannelTimingData;
    email: ChannelTimingData;
    push: ChannelTimingData;
    voice_message: ChannelTimingData;
  };
}

export interface NeverDuringRule {
  description: string; // "morning meditation"
  startTime?: string; // "07:00"
  endTime?: string; // "08:00"
  days?: number[]; // [1,2,3,4,5] for weekdays
  isRecurring: boolean;
}

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night' | 'anytime';

export interface BusyPeriod {
  id: string;
  description: string;
  startDate: Date;
  endDate: Date;
  urgentOnly: boolean; // Only urgent outreach during this period
}

export interface RecurringEvent {
  id: string;
  description: string;
  dayOfWeek: number; // 0-6
  startTime: string; // "09:00"
  endTime: string; // "10:00"
  noOutreach: boolean;
}

export interface WorkSchedule {
  type: 'regular' | 'shift' | 'flexible' | 'unknown';
  workDays: number[];
  workStart?: string;
  workEnd?: string;
}

export interface SleepPattern {
  typicalBedtime: string;
  typicalWakeTime: string;
  isNightOwl: boolean;
  isEarlyBird: boolean;
}

export interface ChannelTimingData {
  bestHours: number[];
  responseRateByHour: Map<number, number>;
  avgResponseTimeMs: number;
  lastSuccessfulTime?: Date;
}

export interface TimingDecision {
  shouldSendNow: boolean;
  optimalTime: Date;
  confidence: number; // 0-1
  reasoning: string;
  alternativeTimes: Date[];
}

export interface TimingContext {
  trigger: {
    type: string;
    priority: OutreachPriority;
  };
  channel: OutreachChannel;
  isFollowUp?: boolean;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_TIMING_PROFILE: Omit<TimingProfile, 'userId'> = {
  engagementPatterns: {
    preferredHours: [9, 10, 11, 14, 15, 16, 19, 20],
    preferredDays: [1, 2, 3, 4, 5], // Weekdays by default
    responseRateByHour: new Map(),
    responseRateByDay: new Map(),
    avgResponseTimeMs: 60 * 60 * 1000, // 1 hour default
    totalInteractions: 0,
    totalResponses: 0,
  },

  preferences: {
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    timezone: 'America/New_York',
    neverDuring: [],
    bestTimeFor: {},
  },

  lifeContext: {
    busyPeriods: [],
    recurringEvents: [],
  },

  channelTiming: {
    call: {
      bestHours: [10, 11, 14, 15, 19],
      responseRateByHour: new Map(),
      avgResponseTimeMs: 0,
    },
    sms: {
      bestHours: [9, 10, 11, 12, 14, 15, 16, 17, 19, 20],
      responseRateByHour: new Map(),
      avgResponseTimeMs: 30 * 60 * 1000,
    },
    email: {
      bestHours: [8, 9, 10, 11, 14, 15, 16],
      responseRateByHour: new Map(),
      avgResponseTimeMs: 4 * 60 * 60 * 1000,
    },
    push: {
      bestHours: [9, 10, 11, 12, 14, 15, 16, 17, 19, 20], // Similar to SMS
      responseRateByHour: new Map(),
      avgResponseTimeMs: 10 * 60 * 1000, // 10 minutes average
    },
    voice_message: {
      bestHours: [10, 11, 14, 15, 19], // Similar to call
      responseRateByHour: new Map(),
      avgResponseTimeMs: 2 * 60 * 60 * 1000, // 2 hours average
    },
  },
};

// ============================================================================
// STORAGE
// ============================================================================

const timingProfileStore = new Map<string, TimingProfile>();
const interactionLog = new Map<string, InteractionRecord[]>();

interface InteractionRecord {
  timestamp: Date;
  channel: OutreachChannel;
  wasOutreach: boolean;
  gotResponse: boolean;
  responseTimeMs?: number;
  hourOfDay: number;
  dayOfWeek: number;
}

// ============================================================================
// TIMING INTELLIGENCE SERVICE
// ============================================================================

const log = getLogger().child({ service: 'timing-intelligence' });

/**
 * Get or create timing profile for a user
 */
export function getTimingProfile(userId: string): TimingProfile {
  let profile = timingProfileStore.get(userId);
  if (!profile) {
    profile = {
      ...DEFAULT_TIMING_PROFILE,
      userId,
      engagementPatterns: {
        ...DEFAULT_TIMING_PROFILE.engagementPatterns,
        responseRateByHour: new Map(),
        responseRateByDay: new Map(),
      },
      channelTiming: {
        call: {
          ...DEFAULT_TIMING_PROFILE.channelTiming.call,
          responseRateByHour: new Map(),
        },
        sms: {
          ...DEFAULT_TIMING_PROFILE.channelTiming.sms,
          responseRateByHour: new Map(),
        },
        email: {
          ...DEFAULT_TIMING_PROFILE.channelTiming.email,
          responseRateByHour: new Map(),
        },
        push: {
          ...DEFAULT_TIMING_PROFILE.channelTiming.push,
          responseRateByHour: new Map(),
        },
        voice_message: {
          ...DEFAULT_TIMING_PROFILE.channelTiming.voice_message,
          responseRateByHour: new Map(),
        },
      },
    };
    timingProfileStore.set(userId, profile);

    // Async load from Firestore and user profile (non-blocking)
    void loadTimingProfileFromFirestore(userId);
    void loadTimezoneFromUserProfile(userId);
  }
  return profile;
}

/**
 * Load timing profile from Firestore
 */
async function loadTimingProfileFromFirestore(userId: string): Promise<void> {
  try {
    const outreachProfile = await loadOutreachProfile(userId);
    if (outreachProfile?.timing) {
      const existing = timingProfileStore.get(userId);
      if (existing) {
        // Merge serialized timing data with existing profile
        const merged = { ...existing, ...deserializeTimingProfile(outreachProfile.timing) };
        timingProfileStore.set(userId, merged);
        log.debug({ userId }, 'Loaded timing profile from Firestore');
      }
    }
  } catch (err) {
    log.debug({ err, userId }, 'Failed to load timing profile from Firestore');
  }
}

/**
 * Persist timing profile to Firestore (fire and forget)
 */
function persistTimingProfile(userId: string, profile: TimingProfile): void {
  const serialized = serializeTimingProfile(profile);
  saveOutreachProfile(userId, { timing: serialized }).catch((err) => {
    log.debug({ err, userId }, 'Failed to persist timing profile (non-fatal)');
  });
}

/**
 * Serialize Maps to objects for Firestore storage
 */
function serializeTimingProfile(profile: TimingProfile): Partial<TimingProfile> {
  return {
    ...profile,
    engagementPatterns: {
      ...profile.engagementPatterns,
      responseRateByHour: Object.fromEntries(
        profile.engagementPatterns.responseRateByHour
      ) as unknown as Map<number, number>,
      responseRateByDay: Object.fromEntries(
        profile.engagementPatterns.responseRateByDay
      ) as unknown as Map<number, number>,
    },
  };
}

/**
 * Deserialize objects back to Maps
 */
function deserializeTimingProfile(data: Partial<TimingProfile>): Partial<TimingProfile> {
  if (!data.engagementPatterns) return data;

  return {
    ...data,
    engagementPatterns: {
      ...data.engagementPatterns,
      responseRateByHour:
        data.engagementPatterns.responseRateByHour instanceof Map
          ? data.engagementPatterns.responseRateByHour
          : new Map(
              Object.entries(data.engagementPatterns.responseRateByHour || {}).map(([k, v]) => [
                parseInt(k),
                v as number,
              ])
            ),
      responseRateByDay:
        data.engagementPatterns.responseRateByDay instanceof Map
          ? data.engagementPatterns.responseRateByDay
          : new Map(
              Object.entries(data.engagementPatterns.responseRateByDay || {}).map(([k, v]) => [
                parseInt(k),
                v as number,
              ])
            ),
    },
  };
}

/**
 * Load timezone from user profile and update timing preferences
 * Called when timing profile is first created to sync with persisted user data
 */
async function loadTimezoneFromUserProfile(userId: string): Promise<void> {
  try {
    const store = getDefaultStore();
    const userProfile = await store.getProfile(userId);

    if (userProfile?.contactInfo?.timezone) {
      const timingProfile = timingProfileStore.get(userId);
      if (timingProfile) {
        timingProfile.preferences.timezone = userProfile.contactInfo.timezone;
        timingProfileStore.set(userId, timingProfile);
        log.debug(
          { userId, timezone: userProfile.contactInfo.timezone },
          'Loaded timezone from user profile'
        );
      }
    }
  } catch (error) {
    log.debug({ userId, error }, 'Could not load timezone from user profile');
  }
}

/**
 * Update timing preferences for a user
 */
export function updateTimingPreferences(
  userId: string,
  preferences: Partial<TimingProfile['preferences']>
): void {
  const profile = getTimingProfile(userId);
  profile.preferences = { ...profile.preferences, ...preferences };
  timingProfileStore.set(userId, profile);
  persistTimingProfile(userId, profile);
  log.debug({ userId, preferences }, 'Timing preferences updated');
}

/**
 * Add a "never during" rule
 */
export function addNeverDuringRule(userId: string, rule: NeverDuringRule): void {
  const profile = getTimingProfile(userId);
  profile.preferences.neverDuring.push(rule);
  timingProfileStore.set(userId, profile);
  persistTimingProfile(userId, profile);
  log.info({ userId, rule: rule.description }, 'Added never-during rule');
}

/**
 * Add a busy period
 */
export function addBusyPeriod(userId: string, period: BusyPeriod): void {
  const profile = getTimingProfile(userId);
  profile.lifeContext.busyPeriods.push(period);
  timingProfileStore.set(userId, profile);
  persistTimingProfile(userId, profile);
  log.info({ userId, period: period.description }, 'Added busy period');
}

/**
 * Add a recurring event
 */
export function addRecurringEvent(userId: string, event: RecurringEvent): void {
  const profile = getTimingProfile(userId);
  profile.lifeContext.recurringEvents.push(event);
  timingProfileStore.set(userId, profile);
  persistTimingProfile(userId, profile);
  log.info({ userId, event: event.description }, 'Added recurring event');
}

/**
 * Set work schedule
 */
export function setWorkSchedule(userId: string, schedule: WorkSchedule): void {
  const profile = getTimingProfile(userId);
  profile.lifeContext.workSchedule = schedule;
  timingProfileStore.set(userId, profile);
  persistTimingProfile(userId, profile);
  log.info({ userId, schedule }, 'Work schedule updated');
}

/**
 * Set sleep pattern
 */
export function setSleepPattern(userId: string, pattern: SleepPattern): void {
  const profile = getTimingProfile(userId);
  profile.lifeContext.sleepPattern = pattern;
  timingProfileStore.set(userId, profile);
  persistTimingProfile(userId, profile);
  log.info({ userId, pattern }, 'Sleep pattern updated');
}

// ============================================================================
// LEARNING FROM INTERACTIONS
// ============================================================================

/**
 * Record an interaction for learning
 */
export function recordInteraction(
  userId: string,
  data: {
    channel: OutreachChannel;
    wasOutreach: boolean;
    gotResponse: boolean;
    responseTimeMs?: number;
    timestamp?: Date;
  }
): void {
  const timestamp = data.timestamp || new Date();
  const record: InteractionRecord = {
    timestamp,
    channel: data.channel,
    wasOutreach: data.wasOutreach,
    gotResponse: data.gotResponse,
    responseTimeMs: data.responseTimeMs,
    hourOfDay: timestamp.getHours(),
    dayOfWeek: timestamp.getDay(),
  };

  // Store in log
  const userLog = interactionLog.get(userId) || [];
  userLog.push(record);

  // Keep last 500 interactions
  if (userLog.length > 500) {
    userLog.shift();
  }
  interactionLog.set(userId, userLog);

  // Update profile with learning
  updateProfileFromInteraction(userId, record);

  log.debug(
    { userId, channel: data.channel, gotResponse: data.gotResponse },
    'Recorded interaction'
  );
}

/**
 * Update timing profile based on new interaction
 */
function updateProfileFromInteraction(userId: string, record: InteractionRecord): void {
  const profile = getTimingProfile(userId);

  // Update totals
  profile.engagementPatterns.totalInteractions++;
  if (record.gotResponse) {
    profile.engagementPatterns.totalResponses++;
    profile.engagementPatterns.lastSuccessfulContactTime = record.timestamp;
  }

  // Update hour-based response rate (exponential smoothing)
  const hourRate = profile.engagementPatterns.responseRateByHour.get(record.hourOfDay) || 0.5;
  const newHourRate = record.gotResponse
    ? hourRate * 0.8 + 0.2 // Boost if responded
    : hourRate * 0.95; // Slight decay if no response
  profile.engagementPatterns.responseRateByHour.set(record.hourOfDay, newHourRate);

  // Update day-based response rate
  const dayRate = profile.engagementPatterns.responseRateByDay.get(record.dayOfWeek) || 0.5;
  const newDayRate = record.gotResponse ? dayRate * 0.8 + 0.2 : dayRate * 0.95;
  profile.engagementPatterns.responseRateByDay.set(record.dayOfWeek, newDayRate);

  // Update average response time
  if (record.responseTimeMs !== undefined) {
    const currentAvg = profile.engagementPatterns.avgResponseTimeMs;
    profile.engagementPatterns.avgResponseTimeMs = currentAvg * 0.9 + record.responseTimeMs * 0.1;
  }

  // Update preferred hours (top hours by response rate)
  profile.engagementPatterns.preferredHours = getTopHours(
    profile.engagementPatterns.responseRateByHour
  );

  // Update preferred days
  profile.engagementPatterns.preferredDays = getTopDays(
    profile.engagementPatterns.responseRateByDay
  );

  // Update channel-specific timing
  const channelData = profile.channelTiming[record.channel];
  if (channelData) {
    const channelHourRate = channelData.responseRateByHour.get(record.hourOfDay) || 0.5;
    const newChannelRate = record.gotResponse
      ? channelHourRate * 0.8 + 0.2
      : channelHourRate * 0.95;
    channelData.responseRateByHour.set(record.hourOfDay, newChannelRate);

    if (record.gotResponse) {
      channelData.lastSuccessfulTime = record.timestamp;
    }

    if (record.responseTimeMs !== undefined) {
      channelData.avgResponseTimeMs =
        channelData.avgResponseTimeMs * 0.9 + record.responseTimeMs * 0.1;
    }

    channelData.bestHours = getTopHours(channelData.responseRateByHour);
  }

  timingProfileStore.set(userId, profile);

  // Persist learned data periodically (not on every interaction to avoid spam)
  // Persist every 10th interaction
  const records = interactionLog.get(userId) || [];
  if (records.length % 10 === 0) {
    persistTimingProfile(userId, profile);
  }
}

function getTopHours(rateMap: Map<number, number>, count = 8): number[] {
  if (rateMap.size === 0) {
    return [9, 10, 11, 14, 15, 16, 19, 20]; // Defaults
  }

  return Array.from(rateMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, count)
    .map(([hour]) => hour)
    .sort((a, b) => a - b);
}

function getTopDays(rateMap: Map<number, number>, count = 5): number[] {
  if (rateMap.size === 0) {
    return [1, 2, 3, 4, 5]; // Weekdays default
  }

  return Array.from(rateMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, count)
    .map(([day]) => day)
    .sort((a, b) => a - b);
}

// ============================================================================
// TIMING DECISIONS
// ============================================================================

/**
 * Calculate the optimal time to reach out
 */
export function calculateOptimalTime(userId: string, context: TimingContext): TimingDecision {
  const profile = getTimingProfile(userId);
  const now = new Date();

  // Convert to user's timezone - we keep the UTC Date but use local time utilities for scoring
  const userTimezone = profile.preferences.timezone || 'America/New_York';
  const userLocalTime = toUserLocalTime(now, userTimezone);

  // Check quiet hours in user's timezone
  if (
    isWithinQuietHours(
      now,
      userTimezone,
      profile.preferences.quietHoursStart,
      profile.preferences.quietHoursEnd
    )
  ) {
    // During quiet hours - find next available time
    const fallbackTime = getFirstAvailableTime(now, profile);
    return {
      shouldSendNow: false,
      optimalTime: fallbackTime,
      confidence: 0.5,
      reasoning: `User is in quiet hours (${profile.preferences.quietHoursStart}-${profile.preferences.quietHoursEnd} ${userTimezone})`,
      alternativeTimes: [],
    };
  }

  // Step 1: Check if now is a valid time
  const nowScore = scoreTime(now, profile, context);
  const nowBlocked = isTimeBlocked(now, profile, context);

  if (!nowBlocked && nowScore > 0.7 && context.trigger.priority !== 'low') {
    return {
      shouldSendNow: true,
      optimalTime: now,
      confidence: nowScore,
      reasoning: `Current time (${userLocalTime.hour}:00 local) scores well based on patterns`,
      alternativeTimes: [],
    };
  }

  // Step 2: Find optimal time within the priority window
  const windowMs = getPriorityWindow(context.trigger.priority);
  const candidates = generateCandidateTimes(now, windowMs, profile);

  // Step 3: Score each candidate
  const scored = candidates
    .filter((time) => !isTimeBlocked(time, profile, context))
    .map((time) => ({
      time,
      score: scoreTime(time, profile, context),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // No good times found - use first available after quiet hours
    const fallbackTime = getFirstAvailableTime(now, profile);
    return {
      shouldSendNow: false,
      optimalTime: fallbackTime,
      confidence: 0.3,
      reasoning: 'No optimal times found, using first available',
      alternativeTimes: [],
    };
  }

  const best = scored[0];
  const alternatives = scored.slice(1, 4).map((s) => s.time);

  // Check if best time is now
  const isNow = Math.abs(best.time.getTime() - now.getTime()) < 5 * 60 * 1000;

  return {
    shouldSendNow: isNow && best.score > 0.5,
    optimalTime: best.time,
    confidence: best.score,
    reasoning: generateReasoning(best.time, best.score, profile),
    alternativeTimes: alternatives,
  };
}

/**
 * Check if a specific time is good for outreach
 */
export function isGoodTimeForOutreach(
  userId: string,
  time: Date,
  context: TimingContext
): { isGood: boolean; score: number; reason: string } {
  const profile = getTimingProfile(userId);

  if (isTimeBlocked(time, profile, context)) {
    return {
      isGood: false,
      score: 0,
      reason: 'Time is blocked by user preferences',
    };
  }

  const score = scoreTime(time, profile, context);
  const isGood = score > 0.5;

  return {
    isGood,
    score,
    reason: isGood
      ? `Good time based on patterns (score: ${(score * 100).toFixed(0)}%)`
      : `Below threshold (score: ${(score * 100).toFixed(0)}%)`,
  };
}

// ============================================================================
// SCORING LOGIC
// ============================================================================

function scoreTime(time: Date, profile: TimingProfile, context: TimingContext): number {
  let score = 0.5; // Base score
  const hour = time.getHours();
  const day = time.getDay();

  // Factor 1: Preferred hours (+0.2)
  if (profile.engagementPatterns.preferredHours.includes(hour)) {
    score += 0.2;
  }

  // Factor 2: Preferred days (+0.1)
  if (profile.engagementPatterns.preferredDays.includes(day)) {
    score += 0.1;
  }

  // Factor 3: Historical response rate for this hour (+0.15)
  const hourRate = profile.engagementPatterns.responseRateByHour.get(hour);
  if (hourRate !== undefined) {
    score += hourRate * 0.15;
  }

  // Factor 4: Historical response rate for this day (+0.1)
  const dayRate = profile.engagementPatterns.responseRateByDay.get(day);
  if (dayRate !== undefined) {
    score += dayRate * 0.1;
  }

  // Factor 5: Channel-specific timing (+0.1)
  const channelData = profile.channelTiming[context.channel];
  if (channelData?.bestHours.includes(hour)) {
    score += 0.1;
  }

  // Factor 6: User's preferred time for this channel (+0.1)
  const preferredPeriod = profile.preferences.bestTimeFor[context.channel];
  if (preferredPeriod && isInTimePeriod(time, preferredPeriod)) {
    score += 0.1;
  }

  // Factor 7: Sleep pattern awareness (+0.05)
  if (profile.lifeContext.sleepPattern) {
    const pattern = profile.lifeContext.sleepPattern;
    if (pattern.isEarlyBird && hour >= 6 && hour <= 9) {
      score += 0.05;
    }
    if (pattern.isNightOwl && hour >= 20 && hour <= 23) {
      score += 0.05;
    }
  }

  // Factor 8: Work schedule awareness
  if (profile.lifeContext.workSchedule) {
    const schedule = profile.lifeContext.workSchedule;
    const isWorkDay = schedule.workDays.includes(day);

    if (isWorkDay && schedule.workStart && schedule.workEnd) {
      const workStartHour = parseInt(schedule.workStart.split(':')[0]);
      const workEndHour = parseInt(schedule.workEnd.split(':')[0]);

      // Lunch hour is usually good
      if (hour >= 11 && hour <= 13) {
        score += 0.05;
      }

      // Right after work can be good
      if (hour === workEndHour || hour === workEndHour + 1) {
        score += 0.05;
      }
    }
  }

  // Normalize to 0-1
  return Math.min(1, Math.max(0, score));
}

function isTimeBlocked(time: Date, profile: TimingProfile, context: TimingContext): boolean {
  const hour = time.getHours();
  const day = time.getDay();
  const timeStr = `${hour.toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

  // Check quiet hours (skip for urgent)
  if (context.trigger.priority !== 'urgent') {
    if (
      isInQuietHours(time, profile.preferences.quietHoursStart, profile.preferences.quietHoursEnd)
    ) {
      return true;
    }
  }

  // Check "never during" rules
  for (const rule of profile.preferences.neverDuring) {
    if (rule.days && !rule.days.includes(day)) {
      continue; // Doesn't apply to this day
    }

    if (rule.startTime && rule.endTime) {
      if (timeStr >= rule.startTime && timeStr <= rule.endTime) {
        return true;
      }
    }
  }

  // Check busy periods (unless urgent)
  if (context.trigger.priority !== 'urgent') {
    for (const period of profile.lifeContext.busyPeriods) {
      if (time >= period.startDate && time <= period.endDate) {
        if (!period.urgentOnly || context.trigger.priority !== 'high') {
          return true;
        }
      }
    }
  }

  // Check recurring events
  for (const event of profile.lifeContext.recurringEvents) {
    if (event.dayOfWeek === day && event.noOutreach) {
      if (timeStr >= event.startTime && timeStr <= event.endTime) {
        return true;
      }
    }
  }

  return false;
}

function isInQuietHours(time: Date, startStr: string, endStr: string): boolean {
  const hour = time.getHours();
  const minute = time.getMinutes();
  const timeMinutes = hour * 60 + minute;

  const [startHour, startMin] = startStr.split(':').map(Number);
  const [endHour, endMin] = endStr.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (startMinutes > endMinutes) {
    return timeMinutes >= startMinutes || timeMinutes < endMinutes;
  }

  return timeMinutes >= startMinutes && timeMinutes < endMinutes;
}

function isInTimePeriod(time: Date, period: TimePeriod): boolean {
  const hour = time.getHours();

  switch (period) {
    case 'morning':
      return hour >= 6 && hour < 12;
    case 'afternoon':
      return hour >= 12 && hour < 17;
    case 'evening':
      return hour >= 17 && hour < 21;
    case 'night':
      return hour >= 21 || hour < 6;
    case 'anytime':
      return true;
    default:
      return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getPriorityWindow(priority: OutreachPriority): number {
  switch (priority) {
    case 'urgent':
      return 1 * 60 * 60 * 1000; // 1 hour
    case 'high':
      return 4 * 60 * 60 * 1000; // 4 hours
    case 'medium':
      return 24 * 60 * 60 * 1000; // 24 hours
    case 'low':
      return 72 * 60 * 60 * 1000; // 72 hours
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function generateCandidateTimes(from: Date, windowMs: number, profile: TimingProfile): Date[] {
  const candidates: Date[] = [];
  const end = new Date(from.getTime() + windowMs);

  // Start from next hour
  const current = new Date(from);
  current.setMinutes(0, 0, 0);
  current.setHours(current.getHours() + 1);

  while (current <= end) {
    // Only add times during reasonable hours
    const hour = current.getHours();
    if (hour >= 7 && hour <= 21) {
      candidates.push(new Date(current));
    }
    current.setHours(current.getHours() + 1);
  }

  return candidates;
}

function getFirstAvailableTime(from: Date, profile: TimingProfile): Date {
  const result = new Date(from);

  // Move past quiet hours
  const quietEnd = parseInt(profile.preferences.quietHoursEnd.split(':')[0]);
  if (result.getHours() < quietEnd) {
    result.setHours(quietEnd, 0, 0, 0);
  } else if (result.getHours() >= parseInt(profile.preferences.quietHoursStart.split(':')[0])) {
    result.setDate(result.getDate() + 1);
    result.setHours(quietEnd, 0, 0, 0);
  }

  return result;
}

function generateReasoning(time: Date, score: number, profile: TimingProfile): string {
  const hour = time.getHours();
  const day = time.getDay();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const reasons: string[] = [];

  if (profile.engagementPatterns.preferredHours.includes(hour)) {
    reasons.push(`${hour}:00 is a preferred hour`);
  }

  if (profile.engagementPatterns.preferredDays.includes(day)) {
    reasons.push(`${dayNames[day]} is a good day`);
  }

  const hourRate = profile.engagementPatterns.responseRateByHour.get(hour);
  if (hourRate && hourRate > 0.6) {
    reasons.push(`high response rate at this hour`);
  }

  if (reasons.length === 0) {
    reasons.push('best available time within window');
  }

  return `${reasons.join(', ')} (confidence: ${(score * 100).toFixed(0)}%)`;
}

// ============================================================================
// CALENDAR INTEGRATION - Live Calendar Check
// ============================================================================

/**
 * Check calendar before sending outreach
 *
 * This async function checks the user's live calendar to see if they're busy.
 * Use this as a final gate before actually sending outreach.
 *
 * @example
 * ```typescript
 * const check = await checkCalendarBeforeOutreach(userId, 'high');
 * if (!check.canSend) {
 *   // Reschedule for check.suggestedRetry
 * }
 * ```
 */
export async function checkCalendarBeforeOutreach(
  userId: string,
  priority: OutreachPriority
): Promise<{
  canSend: boolean;
  reason?: string;
  busyUntil?: Date;
  suggestedRetry?: Date;
}> {
  try {
    // Dynamic import to avoid circular dependencies
    const { isUserBusy, getCalendarBusyProfile } =
      await import('../scheduling/calendar-busy-detection.js');

    const busyCheck = await isUserBusy(userId);

    if (!busyCheck.isBusy) {
      return { canSend: true };
    }

    // For urgent messages, we can send anyway with a note
    if (priority === 'urgent') {
      log.debug({ userId }, '📅 User is busy but priority is urgent - allowing');
      return { canSend: true, reason: 'Urgent message overrides calendar' };
    }

    // For high priority, allow during short meetings
    if (priority === 'high' && busyCheck.busyUntil) {
      const busyMinutesRemaining = (busyCheck.busyUntil.getTime() - Date.now()) / 60000;
      if (busyMinutesRemaining < 15) {
        log.debug({ userId, busyMinutesRemaining }, '📅 User busy but meeting ending soon');
        return {
          canSend: false,
          reason: `In meeting (ending in ${Math.round(busyMinutesRemaining)} min)`,
          busyUntil: busyCheck.busyUntil,
          suggestedRetry: busyCheck.busyUntil,
        };
      }
    }

    // Get the next free window for retry suggestion
    const profile = await getCalendarBusyProfile(userId);
    const suggestedRetry = profile.nextFreeWindow?.start || busyCheck.busyUntil;

    log.info(
      {
        userId,
        reason: busyCheck.reason,
        busyUntil: busyCheck.busyUntil,
        suggestedRetry,
      },
      '📅 Outreach delayed - user is busy'
    );

    return {
      canSend: false,
      reason: busyCheck.reason || 'User is busy (calendar)',
      busyUntil: busyCheck.busyUntil,
      suggestedRetry,
    };
  } catch (error) {
    // If calendar check fails, default to allowing (graceful degradation)
    log.warn({ error, userId }, '📅 Calendar check failed - allowing outreach');
    return { canSend: true, reason: 'Calendar check unavailable' };
  }
}

/**
 * Enhanced optimal time calculation with live calendar awareness
 *
 * Use this when you need a truly optimal time considering live calendar data.
 */
export async function calculateOptimalTimeWithCalendar(
  userId: string,
  context: TimingContext
): Promise<TimingDecision & { calendarAware: boolean }> {
  // First get the basic timing decision
  const decision = calculateOptimalTime(userId, context);

  // If we're suggesting to send now, verify with calendar
  if (decision.shouldSendNow) {
    const calendarCheck = await checkCalendarBeforeOutreach(userId, context.trigger.priority);

    if (!calendarCheck.canSend && calendarCheck.suggestedRetry) {
      return {
        ...decision,
        shouldSendNow: false,
        optimalTime: calendarCheck.suggestedRetry,
        reasoning: `${decision.reasoning}. Delayed: ${calendarCheck.reason}`,
        calendarAware: true,
      };
    }
  }

  return { ...decision, calendarAware: true };
}

// ============================================================================
// CLEANUP
// ============================================================================

export function clearUserTimingData(userId: string): void {
  timingProfileStore.delete(userId);
  interactionLog.delete(userId);
  log.debug({ userId }, 'Cleared timing data');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getTimingProfile,
  updateTimingPreferences,
  addNeverDuringRule,
  addBusyPeriod,
  addRecurringEvent,
  setWorkSchedule,
  setSleepPattern,
  recordInteraction,
  calculateOptimalTime,
  calculateOptimalTimeWithCalendar,
  checkCalendarBeforeOutreach,
  isGoodTimeForOutreach,
  clearUserTimingData,
};
