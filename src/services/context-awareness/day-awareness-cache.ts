/**
 * Day Awareness Cache
 *
 * Pre-warms and caches shared day context that's the same for all users:
 * - Date, time-of-day vibe, day-of-week
 * - Holidays and upcoming events
 * - Season and seasonal mood
 * - Top news headlines (optional)
 * - Weather by region (optional)
 *
 * Philosophy: First user of the day shouldn't wait. Pre-warm on startup,
 * refresh in background. All users get instant day awareness.
 *
 * @module day-awareness-cache
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'DayAwarenessCache' });

// ============================================================================
// TYPES
// ============================================================================

export interface DayAwarenessContext {
  /** Formatted date (e.g., "Wednesday, January 15, 2026") */
  date: string;
  /** Formatted time (e.g., "10:30 AM") */
  time: string;
  /** Time of day category */
  timeOfDay: 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'late_night';
  /** Day of week name */
  dayOfWeek: string;
  /** Whether it's a weekend */
  isWeekend: boolean;
  /** Human-friendly vibe text */
  vibe: string;
  /** Days until weekend (if weekday) */
  daysUntilWeekend?: number;
  /** Current season */
  season: string;
  /** Seasonal mood text */
  seasonalMood: string;
  /** Today's holiday (if any) */
  holiday?: {
    name: string;
    acknowledgment: string;
  };
  /** Upcoming holidays within 7 days */
  upcomingHolidays: Array<{
    name: string;
    daysAway: number;
  }>;
  /** Top news headlines (if pre-warmed) */
  topHeadlines?: string[];
  /** When this context was generated */
  generatedAt: number;
  /** Cache freshness */
  freshness: 'fresh' | 'stale';
}

export interface UserDayContext {
  /** User's name */
  name?: string;
  /** When they last talked to Ferni */
  lastConversation?: {
    when: string;
  };
  /** User's city (for weather) */
  city?: string;
  /** User's IANA timezone (e.g., "America/New_York") */
  timezone?: string;
}

export interface FullDayBriefing {
  /** Core day context (shared) */
  day: DayAwarenessContext;
  /** User-specific context */
  user?: UserDayContext;
  /** Weather for user's city (if available) */
  weather?: {
    summary: string;
    hook?: string;
  };
  /** Formatted briefing string */
  formatted: string;
}

export interface RegionalWeather {
  city: string;
  summary: string;
  hook?: string;
  generatedAt: number;
}

// ============================================================================
// CACHE STATE
// ============================================================================

/** Cached day context (shared across all users) */
let cachedDayContext: DayAwarenessContext | null = null;

/** Cached regional weather (keyed by city) */
const weatherCache = new Map<string, RegionalWeather>();

/** Pre-warm timer */
let preWarmTimer: NodeJS.Timeout | null = null;

/** Whether pre-warming has been initialized */
let initialized = false;

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How long day context stays fresh (5 minutes) */
const DAY_CONTEXT_TTL_MS = 5 * 60 * 1000;

/** How long day context stays usable when stale (30 minutes) */
const DAY_CONTEXT_MAX_STALE_MS = 30 * 60 * 1000;

/** How often to refresh cache in background (5 minutes) */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** How long weather stays fresh (15 minutes) */
const WEATHER_TTL_MS = 15 * 60 * 1000;

/** Common cities to pre-warm weather for */
const COMMON_CITIES = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Philadelphia'];

// ============================================================================
// HOLIDAYS
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

// ============================================================================
// CONTEXT GENERATION (Pure functions, no I/O)
// ============================================================================

function generateTimeVibe(
  timeOfDay: DayAwarenessContext['timeOfDay'],
  dayOfWeek: string,
  isWeekend: boolean,
  daysUntilWeekend?: number
): string {
  if (isWeekend) {
    if (timeOfDay === 'early_morning' || timeOfDay === 'morning') {
      return `${dayOfWeek} morning - no alarms, just possibilities.`;
    }
    if (timeOfDay === 'late_night') {
      return `Late ${dayOfWeek} night - the weekend winding down.`;
    }
    return `${dayOfWeek} ${timeOfDay === 'afternoon' ? 'afternoon' : 'vibes'} - weekend mode.`;
  }

  if (dayOfWeek === 'Friday') {
    if (timeOfDay === 'afternoon' || timeOfDay === 'evening') {
      return 'Friday evening energy - the weekend is HERE!';
    }
    return "It's Friday - the finish line is in sight.";
  }

  if (dayOfWeek === 'Monday') {
    if (timeOfDay === 'early_morning' || timeOfDay === 'morning') {
      return 'Monday morning - fresh start to the week.';
    }
    return 'Monday - building momentum for the week.';
  }

  if (timeOfDay === 'evening' || timeOfDay === 'late_night') {
    return `${dayOfWeek} evening - winding down from the day.`;
  }

  if (timeOfDay === 'early_morning') {
    return `Early ${dayOfWeek} morning - you're up before most.`;
  }

  if (daysUntilWeekend !== undefined && daysUntilWeekend <= 2) {
    return `${dayOfWeek} - almost there, ${daysUntilWeekend} day${daysUntilWeekend === 1 ? '' : 's'} until the weekend.`;
  }

  return `${dayOfWeek} ${timeOfDay === 'afternoon' ? 'afternoon' : 'morning'} - midweek rhythm.`;
}

/**
 * Compute day context, optionally in a specific timezone
 */
function computeDayContext(timezone?: string): DayAwarenessContext {
  const now = new Date();

  // Use timezone if provided, otherwise use server timezone
  let hour: number;
  let day: number;
  let month: number;
  let dayOfMonth: number;
  let formattedDate: string;
  let formattedTime: string;

  if (timezone) {
    try {
      // Get hour in user's timezone
      const tzHour = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone,
      }).format(now);
      hour = parseInt(tzHour, 10);

      // Get day of week in user's timezone
      const tzDay = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: timezone,
      }).format(now);
      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      day = dayMap[tzDay] ?? now.getDay();

      // Get month and day in user's timezone
      const tzDate = new Intl.DateTimeFormat('en-US', {
        month: 'numeric',
        day: 'numeric',
        timeZone: timezone,
      }).format(now);
      const [m, d] = tzDate.split('/').map(Number);
      month = m;
      dayOfMonth = d;

      // Format date and time in user's timezone
      formattedDate = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone,
      }).format(now);

      formattedTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
      }).format(now);
    } catch {
      // Fallback to server timezone if invalid timezone
      hour = now.getHours();
      day = now.getDay();
      month = now.getMonth() + 1;
      dayOfMonth = now.getDate();
      formattedDate = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      formattedTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  } else {
    hour = now.getHours();
    day = now.getDay();
    month = now.getMonth() + 1;
    dayOfMonth = now.getDate();
    formattedDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    formattedTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Use computed date/time (timezone-aware or server default)
  const date = formattedDate;
  const time = formattedTime;

  // Time of day
  let timeOfDay: DayAwarenessContext['timeOfDay'];
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

  // Vibe
  const vibe = generateTimeVibe(timeOfDay, dayOfWeek, isWeekend, daysUntilWeekend);

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
  if (month === 12 && dayOfMonth >= 15) {
    seasonalMood = 'Holiday season - a time for gratitude and connection.';
  }

  // Holiday check
  const todayHoliday = MAJOR_HOLIDAYS.find((h) => h.month === month && h.day === dayOfMonth);

  // Upcoming holidays (within 7 days)
  const upcomingHolidays: DayAwarenessContext['upcomingHolidays'] = [];
  for (const holiday of MAJOR_HOLIDAYS) {
    const holidayDate = new Date(now.getFullYear(), holiday.month - 1, holiday.day);
    if (holidayDate < now) {
      holidayDate.setFullYear(holidayDate.getFullYear() + 1);
    }
    const daysAway = Math.ceil((holidayDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysAway > 0 && daysAway <= 7) {
      upcomingHolidays.push({ name: holiday.name, daysAway });
    }
  }

  return {
    date,
    time,
    timeOfDay,
    dayOfWeek,
    isWeekend,
    vibe,
    daysUntilWeekend,
    season,
    seasonalMood,
    holiday: todayHoliday
      ? { name: todayHoliday.name, acknowledgment: todayHoliday.acknowledgment }
      : undefined,
    upcomingHolidays,
    generatedAt: Date.now(),
    freshness: 'fresh',
  };
}

// ============================================================================
// NEWS PRE-WARMING (Optional - if news module available)
// ============================================================================

async function preWarmNews(): Promise<string[] | undefined> {
  try {
    const { getGeneralNews } = await import('../tools/domains/information/news.js');
    const newsResult = await getGeneralNews();
    // Extract headlines from the formatted result (best effort)
    // The result contains SSML, so we just store it as-is for now
    log.info('📰 Pre-warmed general news');
    return [newsResult];
  } catch (error) {
    log.debug({ error: String(error) }, 'News pre-warming skipped (non-critical)');
    return undefined;
  }
}

// ============================================================================
// WEATHER PRE-WARMING (Optional - regional cache)
// ============================================================================

async function preWarmWeather(city: string): Promise<void> {
  try {
    const { getCurrentWeather } = await import('../tools/domains/information/weather.js');
    const weather = await getCurrentWeather(city);

    weatherCache.set(city.toLowerCase(), {
      city,
      summary: weather,
      generatedAt: Date.now(),
    });

    log.debug({ city }, '🌤️ Pre-warmed weather');
  } catch (error) {
    log.debug({ city, error: String(error) }, 'Weather pre-warming failed (non-critical)');
  }
}

// ============================================================================
// CACHE REFRESH
// ============================================================================

async function refreshCache(): Promise<void> {
  const startTime = Date.now();

  // 1. Always refresh day context (fast, no I/O)
  cachedDayContext = computeDayContext();

  // 2. Optionally refresh news in background
  preWarmNews()
    .then((headlines) => {
      if (headlines && cachedDayContext) {
        cachedDayContext.topHeadlines = headlines;
      }
    })
    .catch(() => {
      // Non-critical
    });

  // 3. Optionally refresh weather for common cities
  // Run in parallel, don't wait
  for (const city of COMMON_CITIES) {
    preWarmWeather(city).catch(() => {
      // Non-critical
    });
  }

  log.info({ durationMs: Date.now() - startTime }, '🌅 Day awareness cache refreshed');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize pre-warming (call on server startup)
 *
 * This starts background refresh and pre-warms the cache immediately.
 */
export function initDayAwarenessCache(): void {
  if (initialized) {
    return;
  }

  initialized = true;

  // Initial warm
  refreshCache().catch((error) => {
    log.warn({ error: String(error) }, 'Initial cache warm failed');
  });

  // Start periodic refresh
  preWarmTimer = setInterval(() => {
    refreshCache().catch((error) => {
      log.warn({ error: String(error) }, 'Cache refresh failed');
    });
  }, REFRESH_INTERVAL_MS);

  // Don't prevent process exit
  if (preWarmTimer.unref) {
    preWarmTimer.unref();
  }

  log.info('🌅 Day awareness cache initialized');
}

/**
 * Get day awareness context (instant if cached)
 *
 * Returns cached context if fresh/stale, or generates fresh if expired/missing.
 * This should be nearly instant for most calls.
 */
export function getDayAwareness(): DayAwarenessContext {
  const now = Date.now();

  // Check if we have usable cached data
  if (cachedDayContext) {
    const age = now - cachedDayContext.generatedAt;

    if (age < DAY_CONTEXT_TTL_MS) {
      // Fresh - return as-is
      return { ...cachedDayContext, freshness: 'fresh' };
    }

    if (age < DAY_CONTEXT_MAX_STALE_MS) {
      // Stale but usable - return with stale flag, refresh in background
      refreshCache().catch(() => {});
      return { ...cachedDayContext, freshness: 'stale' };
    }
  }

  // No cache or expired - generate fresh
  cachedDayContext = computeDayContext();
  return cachedDayContext;
}

/**
 * Get cached weather for a city (if pre-warmed)
 *
 * Returns null if not cached - caller should fetch directly.
 */
export function getCachedWeather(city: string): RegionalWeather | null {
  const cached = weatherCache.get(city.toLowerCase());

  if (!cached) {
    return null;
  }

  // Check freshness
  if (Date.now() - cached.generatedAt > WEATHER_TTL_MS) {
    // Expired - trigger background refresh but return stale
    preWarmWeather(city).catch(() => {});
    return cached; // Return stale data (better than nothing)
  }

  return cached;
}

/**
 * Format day awareness as a briefing string for LLM injection
 */
export function formatDayAwarenessForLLM(context: DayAwarenessContext): string {
  const sections: string[] = [];

  // Core temporal awareness
  sections.push(`[YOUR AWARENESS - ${context.date}]`);
  sections.push(`It's ${context.time}. ${context.vibe}`);

  // Holiday context
  if (context.holiday) {
    sections.push(`Today is ${context.holiday.name}. ${context.holiday.acknowledgment}`);
  }
  if (context.upcomingHolidays.length > 0) {
    const upcoming = context.upcomingHolidays[0];
    sections.push(
      `${upcoming.name} is ${upcoming.daysAway} day${upcoming.daysAway === 1 ? '' : 's'} away.`
    );
  }

  // Seasonal context
  sections.push(`${context.season} - ${context.seasonalMood}`);

  // Guidance
  sections.push('');
  sections.push("Use this awareness naturally - don't announce it, just BE present in the moment.");

  return sections.join('\n');
}

// ============================================================================
// WEATHER MOOD HOOKS
// ============================================================================

const WEATHER_MOOD_HOOKS: Record<string, string[]> = {
  rain: [
    'Perfect weather for staying in and reflecting.',
    'Rainy day vibes - cozy and contemplative.',
    'The rain can be soothing when you embrace it.',
  ],
  sunny: [
    'Beautiful day outside - soak it in when you can.',
    'The sun is shining - hope you get some of that energy.',
  ],
  cloudy: ['Overcast skies can be good for focus.', 'Gray day, but still full of possibility.'],
  snow: [
    'Snow day energy - everything feels a bit quieter.',
    'Winter wonderland outside - cozy up in here.',
  ],
  cold: ["Bundle up out there - it's chilly.", 'Cold weather calls for warm thoughts.'],
  hot: ['Stay cool out there - it is hot.', 'Summer heat - take it easy and stay hydrated.'],
  storm: ['Wild weather out there - good to be inside.', 'Stormy outside, calm in here.'],
};

function getWeatherMoodHook(weatherSummary: string): string | undefined {
  const lower = weatherSummary.toLowerCase();

  for (const [condition, hooks] of Object.entries(WEATHER_MOOD_HOOKS)) {
    if (lower.includes(condition)) {
      return hooks[Math.floor(Math.random() * hooks.length)];
    }
  }

  return undefined;
}

/**
 * Extract a brief, conversational weather summary from the full weather string
 */
function extractBriefWeather(weatherSummary: string): string {
  // The weather tool returns detailed SSML, extract just the key info
  // Look for temperature and condition patterns
  const tempMatch = weatherSummary.match(/(\d+)\s*°?F?/);
  const temp = tempMatch ? `${tempMatch[1]}°` : '';

  // Extract condition words
  const conditions = ['sunny', 'cloudy', 'rain', 'snow', 'clear', 'overcast', 'stormy', 'windy'];
  const condition = conditions.find((c) => weatherSummary.toLowerCase().includes(c)) || '';

  if (temp && condition) {
    return `${temp}, ${condition}`;
  }
  if (temp) {
    return temp;
  }
  if (condition) {
    return condition;
  }

  // Fallback: return first sentence without SSML
  const cleaned = weatherSummary.replace(/<[^>]+>/g, '').trim();
  const firstSentence = cleaned.split(/[.!]/)[0];
  return firstSentence.length < 50 ? firstSentence : firstSentence.slice(0, 50) + '...';
}

// ============================================================================
// HEADLINES PROCESSING
// ============================================================================

/**
 * Extract key themes from headlines for world awareness
 */
function extractHeadlineThemes(headlines: string[]): string[] {
  if (!headlines || headlines.length === 0) return [];

  // The news tool returns SSML, clean and extract themes
  const themes: string[] = [];

  for (const headline of headlines.slice(0, 3)) {
    const cleaned = headline.replace(/<[^>]+>/g, '').trim();
    // Extract first sentence or key phrase
    const firstPart = cleaned.split(/[.!?]/)[0];
    if (firstPart.length > 10 && firstPart.length < 100) {
      themes.push(firstPart);
    }
  }

  return themes;
}

// ============================================================================
// FULL BRIEFING (User-specific)
// ============================================================================

/**
 * Get a full day briefing with user-specific context
 *
 * This combines:
 * - Shared day context (cached)
 * - User's timezone (for accurate time)
 * - User's location weather (if cached)
 * - User context (name, last conversation)
 */
export function getFullDayBriefing(userContext?: UserDayContext): FullDayBriefing {
  // Get day context, optionally in user's timezone
  const day = userContext?.timezone ? computeDayContext(userContext.timezone) : getDayAwareness();

  // Get weather for user's city if available
  let weather: FullDayBriefing['weather'];
  if (userContext?.city) {
    const cachedWeather = getCachedWeather(userContext.city);
    if (cachedWeather) {
      weather = {
        summary: extractBriefWeather(cachedWeather.summary),
        hook: getWeatherMoodHook(cachedWeather.summary),
      };
    }
  }

  // Format the full briefing
  const formatted = formatFullBriefing(day, userContext, weather);

  return {
    day,
    user: userContext,
    weather,
    formatted,
  };
}

/**
 * Format a full day briefing including all context
 */
function formatFullBriefing(
  day: DayAwarenessContext,
  user?: UserDayContext,
  weather?: FullDayBriefing['weather']
): string {
  const sections: string[] = [];

  // ============================
  // TEMPORAL AWARENESS
  // ============================
  sections.push(`[YOUR AWARENESS - ${day.date}]`);
  sections.push(`It's ${day.time}. ${day.vibe}`);

  // ============================
  // WEATHER (if available)
  // ============================
  if (weather) {
    const weatherLine = user?.city
      ? `Weather in ${user.city}: ${weather.summary}.`
      : `Weather: ${weather.summary}.`;
    sections.push(weatherLine);
    if (weather.hook) {
      sections.push(weather.hook);
    }
  }

  // ============================
  // HOLIDAYS
  // ============================
  if (day.holiday) {
    sections.push(`Today is ${day.holiday.name}. ${day.holiday.acknowledgment}`);
  }
  if (day.upcomingHolidays.length > 0) {
    const upcoming = day.upcomingHolidays[0];
    sections.push(
      `${upcoming.name} is ${upcoming.daysAway} day${upcoming.daysAway === 1 ? '' : 's'} away.`
    );
  }

  // ============================
  // SEASON
  // ============================
  sections.push(`${day.season} - ${day.seasonalMood}`);

  // ============================
  // WORLD AWARENESS (headlines)
  // ============================
  if (day.topHeadlines && day.topHeadlines.length > 0) {
    const themes = extractHeadlineThemes(day.topHeadlines);
    if (themes.length > 0) {
      sections.push('');
      sections.push("## What's Happening in the World");
      sections.push("(Use naturally if relevant, don't force into conversation)");
      for (const theme of themes.slice(0, 2)) {
        sections.push(`- ${theme}`);
      }
    }
  }

  // ============================
  // USER CONTEXT
  // ============================
  if (user?.name || user?.lastConversation) {
    sections.push('');
    sections.push("## Who You're Talking To");
    if (user.name) {
      sections.push(`You're talking to ${user.name}.`);
    }
    if (user.lastConversation) {
      sections.push(`Last talked: ${user.lastConversation.when}.`);
    }
  }

  // ============================
  // GUIDANCE
  // ============================
  sections.push('');
  sections.push("Use this awareness naturally - don't announce it, just BE present in the moment.");
  sections.push('Weather and headlines are context, not conversation starters unless they ask.');

  return sections.join('\n');
}

/**
 * Stop pre-warming (for testing/shutdown)
 */
export function stopDayAwarenessCache(): void {
  if (preWarmTimer) {
    clearInterval(preWarmTimer);
    preWarmTimer = null;
  }
  initialized = false;
  cachedDayContext = null;
  weatherCache.clear();
}

/**
 * Get cache stats (for monitoring)
 */
export function getDayAwarenessCacheStats(): {
  initialized: boolean;
  hasCachedContext: boolean;
  contextAge: number | null;
  contextFreshness: 'fresh' | 'stale' | 'expired' | 'missing';
  weatherCitiesCached: number;
} {
  const now = Date.now();
  let contextFreshness: 'fresh' | 'stale' | 'expired' | 'missing' = 'missing';
  let contextAge: number | null = null;

  if (cachedDayContext) {
    contextAge = now - cachedDayContext.generatedAt;
    if (contextAge < DAY_CONTEXT_TTL_MS) {
      contextFreshness = 'fresh';
    } else if (contextAge < DAY_CONTEXT_MAX_STALE_MS) {
      contextFreshness = 'stale';
    } else {
      contextFreshness = 'expired';
    }
  }

  return {
    initialized,
    hasCachedContext: !!cachedDayContext,
    contextAge,
    contextFreshness,
    weatherCitiesCached: weatherCache.size,
  };
}

export default {
  initDayAwarenessCache,
  getDayAwareness,
  getCachedWeather,
  formatDayAwarenessForLLM,
  getFullDayBriefing,
  stopDayAwarenessCache,
  getDayAwarenessCacheStats,
};
