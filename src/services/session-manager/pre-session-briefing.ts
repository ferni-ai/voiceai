/**
 * Pre-Session Briefing Service
 *
 * "Better Than Human" - Ferni is already AWARE before you even connect.
 * This service generates a comprehensive briefing that gets loaded
 * BEFORE the first turn, making Ferni feel genuinely present in the world.
 *
 * What Ferni Knows:
 * - Current date, time, day of week
 * - Time-sensitive context (morning rush, late night, weekend vibes)
 * - Today's holidays and cultural events
 * - Weather (if location known)
 * - Recent events user mentioned caring about
 * - Music currently playing (DJ context)
 * - What happened in last conversation (memory)
 *
 * @module PreSessionBriefing
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PreSessionBriefing' });

// ============================================================================
// TYPES
// ============================================================================

export interface PreSessionBriefing {
  /** Current moment context */
  temporal: TemporalContext;
  /** Cultural/holiday context */
  cultural: CulturalContext;
  /** User-specific context from memory */
  userContext?: UserContext;
  /** Music/DJ context */
  musicContext?: MusicContext;
  /** Weather if available */
  weather?: WeatherContext;
  /** The formatted briefing for injection */
  formatted: string;
  /** When this briefing was generated */
  generatedAt: Date;
}

export interface TemporalContext {
  date: string; // "Friday, December 19, 2024"
  time: string; // "10:30 AM"
  timeOfDay: 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'late_night';
  dayOfWeek: string;
  isWeekend: boolean;
  vibe: string; // "Friday evening energy - weekend is here!"
  daysUntilWeekend?: number;
}

export interface CulturalContext {
  holiday?: {
    name: string;
    acknowledgment: string;
  };
  upcomingHolidays: Array<{
    name: string;
    daysAway: number;
  }>;
  season: string;
  seasonalMood: string;
}

export interface UserContext {
  name?: string;
  lastConversation?: {
    when: string; // "2 days ago"
    topic?: string;
  };
  ongoingThemes?: string[];
  importantDates?: Array<{
    name: string;
    daysAway: number;
  }>;
}

export interface MusicContext {
  isPlaying: boolean;
  currentTrack?: {
    name: string;
    artist: string;
  };
  recentlyPlayed?: string[];
}

export interface WeatherContext {
  summary: string;
  hook?: string;
}

// ============================================================================
// TEMPORAL CONTEXT
// ============================================================================

function getTemporalContext(): TemporalContext {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Format date
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  const date = now.toLocaleDateString('en-US', options);

  // Format time
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Time of day
  let timeOfDay: TemporalContext['timeOfDay'];
  if (hour >= 5 && hour < 9) timeOfDay = 'early_morning';
  else if (hour >= 9 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 14) timeOfDay = 'midday';
  else if (hour >= 14 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'late_night';

  // Day of week
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[day];
  const isWeekend = day === 0 || day === 6;

  // Days until weekend
  let daysUntilWeekend: number | undefined;
  if (!isWeekend) {
    daysUntilWeekend = day === 5 ? 0 : 5 - day;
  }

  // Generate vibe based on time/day
  const vibe = generateTimeVibe(timeOfDay, dayOfWeek, isWeekend, daysUntilWeekend);

  return {
    date,
    time,
    timeOfDay,
    dayOfWeek,
    isWeekend,
    vibe,
    daysUntilWeekend,
  };
}

function generateTimeVibe(
  timeOfDay: TemporalContext['timeOfDay'],
  dayOfWeek: string,
  isWeekend: boolean,
  daysUntilWeekend?: number
): string {
  // Weekend vibes
  if (isWeekend) {
    if (timeOfDay === 'early_morning' || timeOfDay === 'morning') {
      return `${dayOfWeek} morning - no alarms, just possibilities.`;
    }
    if (timeOfDay === 'late_night') {
      return `Late ${dayOfWeek} night - the weekend winding down.`;
    }
    return `${dayOfWeek} ${timeOfDay === 'afternoon' ? 'afternoon' : 'vibes'} - weekend mode.`;
  }

  // Friday energy
  if (dayOfWeek === 'Friday') {
    if (timeOfDay === 'afternoon' || timeOfDay === 'evening') {
      return 'Friday evening energy - the weekend is HERE!';
    }
    return "It's Friday - the finish line is in sight.";
  }

  // Monday
  if (dayOfWeek === 'Monday') {
    if (timeOfDay === 'early_morning' || timeOfDay === 'morning') {
      return 'Monday morning - fresh start to the week.';
    }
    return 'Monday - building momentum for the week.';
  }

  // Weekday evenings
  if (timeOfDay === 'evening' || timeOfDay === 'late_night') {
    return `${dayOfWeek} evening - winding down from the day.`;
  }

  // Early morning
  if (timeOfDay === 'early_morning') {
    return `Early ${dayOfWeek} morning - you're up before most.`;
  }

  // Note: late_night is already handled above (line 188)
  // This was dead code causing a TypeScript error

  // Generic weekday
  if (daysUntilWeekend !== undefined && daysUntilWeekend <= 2) {
    return `${dayOfWeek} - almost there, ${daysUntilWeekend} day${daysUntilWeekend === 1 ? '' : 's'} until the weekend.`;
  }

  return `${dayOfWeek} ${timeOfDay === 'afternoon' ? 'afternoon' : 'morning'} - midweek rhythm.`;
}

// ============================================================================
// CULTURAL CONTEXT
// ============================================================================

const MAJOR_HOLIDAYS: Array<{
  month: number;
  day: number;
  name: string;
  acknowledgment: string;
}> = [
  {
    month: 1,
    day: 1,
    name: "New Year's Day",
    acknowledgment: 'Happy New Year! Fresh starts and new beginnings.',
  },
  {
    month: 2,
    day: 14,
    name: "Valentine's Day",
    acknowledgment: "Valentine's Day - love is in the air (or not, and that's okay too).",
  },
  {
    month: 3,
    day: 17,
    name: "St. Patrick's Day",
    acknowledgment: "St. Patrick's Day - feeling lucky?",
  },
  {
    month: 7,
    day: 4,
    name: 'Independence Day',
    acknowledgment: 'Fourth of July - fireworks and freedom.',
  },
  { month: 10, day: 31, name: 'Halloween', acknowledgment: 'Halloween - spooky season!' },
  {
    month: 11,
    day: 11,
    name: 'Veterans Day',
    acknowledgment: 'Veterans Day - honoring those who served.',
  },
  {
    month: 12,
    day: 24,
    name: 'Christmas Eve',
    acknowledgment: 'Christmas Eve - magic in the air.',
  },
  {
    month: 12,
    day: 25,
    name: 'Christmas',
    acknowledgment: 'Merry Christmas to those celebrating!',
  },
  {
    month: 12,
    day: 31,
    name: "New Year's Eve",
    acknowledgment: "New Year's Eve - out with the old, in with the new.",
  },
];

function getCulturalContext(): CulturalContext {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const day = now.getDate();

  // Check for today's holiday
  const todayHoliday = MAJOR_HOLIDAYS.find((h) => h.month === month && h.day === day);

  // Check for upcoming holidays (within 7 days)
  const upcomingHolidays: CulturalContext['upcomingHolidays'] = [];
  for (const holiday of MAJOR_HOLIDAYS) {
    const holidayDate = new Date(now.getFullYear(), holiday.month - 1, holiday.day);
    // If holiday already passed this year, check next year
    if (holidayDate < now) {
      holidayDate.setFullYear(holidayDate.getFullYear() + 1);
    }
    const daysAway = Math.ceil((holidayDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysAway > 0 && daysAway <= 7) {
      upcomingHolidays.push({ name: holiday.name, daysAway });
    }
  }

  // Season
  const seasonMonth = now.getMonth();
  let season: string;
  let seasonalMood: string;

  if (seasonMonth >= 2 && seasonMonth <= 4) {
    season = 'Spring';
    seasonalMood = 'Renewal energy - things are waking up.';
  } else if (seasonMonth >= 5 && seasonMonth <= 7) {
    season = 'Summer';
    seasonalMood = 'Longer days, more energy.';
  } else if (seasonMonth >= 8 && seasonMonth <= 10) {
    season = 'Fall';
    seasonalMood = 'Cozy season - perfect for reflection.';
  } else {
    season = 'Winter';
    seasonalMood = 'Rest and reflection season.';
  }

  // December special handling
  if (month === 12 && day >= 15) {
    seasonalMood = 'Holiday season - a time for gratitude and connection.';
  }

  return {
    holiday: todayHoliday
      ? { name: todayHoliday.name, acknowledgment: todayHoliday.acknowledgment }
      : undefined,
    upcomingHolidays,
    season,
    seasonalMood,
  };
}

// ============================================================================
// MUSIC CONTEXT
// ============================================================================

async function getMusicContext(): Promise<MusicContext | undefined> {
  try {
    const { getMusicPlayer } = await import('../../audio/index.js');
    const musicPlayer = getMusicPlayer();
    const state = musicPlayer.getState();

    if (!state.currentTrack && !state.isPlaying) {
      return undefined;
    }

    return {
      isPlaying: state.isPlaying,
      currentTrack: state.currentTrack
        ? {
            name: state.currentTrack.name,
            artist: state.currentTrack.artist,
          }
        : undefined,
    };
  } catch {
    return undefined;
  }
}

// ============================================================================
// FORMAT BRIEFING
// ============================================================================

function formatBriefing(
  temporal: TemporalContext,
  cultural: CulturalContext,
  userContext?: UserContext,
  musicContext?: MusicContext,
  weather?: WeatherContext
): string {
  const sections: string[] = [];

  // === TEMPORAL AWARENESS ===
  sections.push(`[YOUR AWARENESS - ${temporal.date}]`);
  sections.push(`It's ${temporal.time}. ${temporal.vibe}`);

  // === CULTURAL CONTEXT ===
  if (cultural.holiday) {
    sections.push(`Today is ${cultural.holiday.name}. ${cultural.holiday.acknowledgment}`);
  }
  if (cultural.upcomingHolidays.length > 0) {
    const upcoming = cultural.upcomingHolidays[0];
    sections.push(
      `${upcoming.name} is ${upcoming.daysAway} day${upcoming.daysAway === 1 ? '' : 's'} away.`
    );
  }
  sections.push(`${cultural.season} - ${cultural.seasonalMood}`);

  // === WEATHER ===
  if (weather) {
    sections.push(`Weather: ${weather.summary}${weather.hook ? ` ${weather.hook}` : ''}`);
  }

  // === USER CONTEXT ===
  if (userContext) {
    if (userContext.name) {
      sections.push(`You're talking to ${userContext.name}.`);
    }
    if (userContext.lastConversation) {
      sections.push(
        `Last talked: ${userContext.lastConversation.when}${userContext.lastConversation.topic ? ` about ${userContext.lastConversation.topic}` : ''}.`
      );
    }
    if (userContext.importantDates && userContext.importantDates.length > 0) {
      const important = userContext.importantDates[0];
      sections.push(`Note: Their ${important.name} is in ${important.daysAway} days.`);
    }
  }

  // === MUSIC CONTEXT ===
  if (musicContext?.isPlaying && musicContext.currentTrack) {
    sections.push(
      `Music playing: "${musicContext.currentTrack.name}" by ${musicContext.currentTrack.artist}.`
    );
  }

  // === GUIDANCE ===
  sections.push('');
  sections.push("Use this awareness naturally - don't announce it, just BE present in the moment.");

  return sections.join('\n');
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Create an instant pre-session briefing without async dependencies.
 * Ensures Ferni has day awareness immediately at session start.
 */
export function createInstantPreSessionBriefing(userProfile?: {
  name?: string;
  lastConversation?: Date;
}): PreSessionBriefing {
  const temporal = getTemporalContext();
  const cultural = getCulturalContext();

  let userContext: UserContext | undefined;
  if (userProfile) {
    userContext = {
      name: userProfile.name,
    };
    if (userProfile.lastConversation) {
      const daysSince = Math.floor(
        (Date.now() - userProfile.lastConversation.getTime()) / (24 * 60 * 60 * 1000)
      );
      userContext.lastConversation = {
        when:
          daysSince === 0
            ? 'earlier today'
            : daysSince === 1
              ? 'yesterday'
              : `${daysSince} days ago`,
      };
    }
  }

  return {
    temporal,
    cultural,
    userContext,
    formatted: formatBriefing(temporal, cultural, userContext),
    generatedAt: new Date(),
  };
}

/**
 * Generate a pre-session briefing for Ferni
 *
 * Call this BEFORE the session starts to load context.
 * The formatted briefing can be injected as a system message.
 */
export async function generatePreSessionBriefing(
  userId?: string,
  userProfile?: {
    name?: string;
    lastConversation?: Date;
    location?: string;
  }
): Promise<PreSessionBriefing> {
  const startTime = Date.now();

  // Get all context in parallel
  const [temporal, cultural, musicContext] = await Promise.all([
    Promise.resolve(getTemporalContext()),
    Promise.resolve(getCulturalContext()),
    getMusicContext(),
  ]);

  // Build user context from profile
  let userContext: UserContext | undefined;
  if (userProfile) {
    userContext = {
      name: userProfile.name,
    };
    if (userProfile.lastConversation) {
      const daysSince = Math.floor(
        (Date.now() - userProfile.lastConversation.getTime()) / (24 * 60 * 60 * 1000)
      );
      userContext.lastConversation = {
        when:
          daysSince === 0
            ? 'earlier today'
            : daysSince === 1
              ? 'yesterday'
              : `${daysSince} days ago`,
      };
    }
  }

  // Format the briefing
  const formatted = formatBriefing(temporal, cultural, userContext, musicContext);

  const briefing: PreSessionBriefing = {
    temporal,
    cultural,
    userContext,
    musicContext,
    formatted,
    generatedAt: new Date(),
  };

  log.info(
    {
      userId,
      timeOfDay: temporal.timeOfDay,
      holiday: cultural.holiday?.name,
      hasMusic: !!musicContext?.isPlaying,
      durationMs: Date.now() - startTime,
    },
    '📋 Pre-session briefing generated'
  );

  return briefing;
}

/**
 * Get a quick time-aware greeting suggestion
 */
export function getTimeAwareGreetingHint(): string {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 9) {
    return 'Early bird! Acknowledge their early start.';
  }
  if (hour >= 22 || hour < 5) {
    return "Late night - they might need extra gentleness or can't sleep.";
  }
  if (new Date().getDay() === 5 && hour >= 16) {
    return 'Friday evening - weekend energy!';
  }
  if (new Date().getDay() === 1 && hour < 12) {
    return 'Monday morning - fresh week, might need encouragement.';
  }

  return '';
}

export default {
  generatePreSessionBriefing,
  getTimeAwareGreetingHint,
};
