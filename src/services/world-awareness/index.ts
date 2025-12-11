/**
 * World Awareness Service
 *
 * "Better Than Human" - Ferni already knows what's happening in the world.
 * No "let me check" moments. Background pre-fetching gives instant awareness.
 *
 * Capabilities:
 * - Weather in user's location (pre-fetched, cached)
 * - News headlines (general, tech, financial)
 * - Sports scores for user's favorite teams
 * - Trending topics and cultural moments
 * - Historical events for today
 * - Cultural calendar (holidays, events, awareness days)
 *
 * Architecture:
 * - Pre-warms cache on session start
 * - Refreshes in background during conversation
 * - Context builders pull from cache (never wait for API)
 *
 * @module WorldAwareness
 */

import { getHistoricalEvent } from '../external-apis.js';
import { getFinancialNews, getGeneralNews, getTechNews } from '../../tools/news.js';
import { getTeamScore } from '../../tools/sports.js';
import { getCurrentWeather, getWeatherForecast } from '../../tools/weather.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'WorldAwareness' });

// ============================================================================
// TYPES
// ============================================================================

export interface UserInterests {
  /** Favorite sports teams to track */
  favoriteTeams: string[];
  /** Industries they care about */
  industries: string[];
  /** Topics they're interested in */
  topics: string[];
  /** Their home location for weather */
  location?: string;
  /** Timezone for cultural calendar */
  timezone?: string;
}

export interface WeatherContext {
  current: string;
  forecast?: string;
  location: string;
  fetchedAt: Date;
  /** Weather-based conversation starter */
  conversationHook?: string;
}

export interface NewsContext {
  general: string[];
  tech: string[];
  financial: string[];
  fetchedAt: Date;
  /** Most interesting headline for natural mention */
  topStory?: string;
}

export interface SportsContext {
  scores: Map<string, string>;
  fetchedAt: Date;
  /** Big game happening? */
  excitingGame?: string;
}

export interface CulturalContext {
  /** Today's holiday/observance */
  holiday?: HolidayInfo;
  /** Nearby holidays (within 7 days) */
  upcomingHolidays: HolidayInfo[];
  /** Historical event for today */
  historicalEvent?: string;
  /** Season-specific context */
  seasonalContext: string;
}

export interface HolidayInfo {
  name: string;
  date: Date;
  type: 'major' | 'minor' | 'cultural' | 'awareness' | 'fun';
  /** How to acknowledge it naturally */
  acknowledgment: string;
  /** Cultural sensitivity notes */
  sensitivity?: string;
}

export interface TrendingContext {
  topics: string[];
  fetchedAt: Date;
}

export interface WorldSnapshot {
  weather?: WeatherContext;
  news?: NewsContext;
  sports?: SportsContext;
  cultural: CulturalContext;
  trending?: TrendingContext;
  /** When this snapshot was assembled */
  assembledAt: Date;
  /** Is the data fresh enough to use? */
  isFresh: boolean;
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CACHE_TTL = {
  weather: 30 * 60 * 1000, // 30 minutes
  news: 60 * 60 * 1000, // 1 hour
  sports: 5 * 60 * 1000, // 5 minutes (games change fast)
  trending: 15 * 60 * 1000, // 15 minutes
  cultural: 24 * 60 * 60 * 1000, // 24 hours (doesn't change)
};

// ============================================================================
// STATE
// ============================================================================

interface UserWorldCache {
  userId: string;
  interests: UserInterests;
  weather?: WeatherContext;
  news?: NewsContext;
  sports?: SportsContext;
  cultural?: CulturalContext;
  trending?: TrendingContext;
  lastRefresh: Date;
  isRefreshing: boolean;
}

const userCaches = new Map<string, UserWorldCache>();

// ============================================================================
// CULTURAL CALENDAR - 50+ Holidays & Awareness Days
// ============================================================================

const CULTURAL_CALENDAR: Array<{
  month: number;
  day: number;
  name: string;
  type: HolidayInfo['type'];
  acknowledgment: string;
  sensitivity?: string;
}> = [
  // January
  {
    month: 1,
    day: 1,
    name: "New Year's Day",
    type: 'major',
    acknowledgment: 'Happy New Year! A fresh start.',
  },
  {
    month: 1,
    day: 15,
    name: 'Martin Luther King Jr. Day',
    type: 'major',
    acknowledgment: "Today we honor Dr. King's legacy of hope and justice.",
    sensitivity: 'Observed 3rd Monday',
  },
  {
    month: 1,
    day: 24,
    name: 'National Compliment Day',
    type: 'fun',
    acknowledgment: "It's National Compliment Day - the perfect excuse to appreciate someone.",
  },
  {
    month: 1,
    day: 25,
    name: 'Lunar New Year',
    type: 'cultural',
    acknowledgment: 'Happy Lunar New Year to those celebrating!',
    sensitivity: 'Date varies',
  },

  // February
  {
    month: 2,
    day: 2,
    name: 'Groundhog Day',
    type: 'fun',
    acknowledgment: 'Groundhog Day! Six more weeks of winter?',
  },
  {
    month: 2,
    day: 14,
    name: "Valentine's Day",
    type: 'major',
    acknowledgment: "Happy Valentine's Day - a day for love in all its forms.",
    sensitivity: 'Be mindful of those who may find this day difficult',
  },
  {
    month: 2,
    day: 20,
    name: "Presidents' Day",
    type: 'minor',
    acknowledgment: "Presidents' Day - a long weekend for many.",
  },

  // March
  {
    month: 3,
    day: 8,
    name: "International Women's Day",
    type: 'awareness',
    acknowledgment: "Happy International Women's Day - celebrating women everywhere.",
  },
  {
    month: 3,
    day: 14,
    name: 'Pi Day',
    type: 'fun',
    acknowledgment: 'Happy Pi Day! 3.14... the perfect excuse for actual pie.',
  },
  {
    month: 3,
    day: 17,
    name: "St. Patrick's Day",
    type: 'cultural',
    acknowledgment: "Happy St. Patrick's Day!",
  },
  {
    month: 3,
    day: 20,
    name: 'Spring Equinox',
    type: 'minor',
    acknowledgment: 'First day of spring - renewal is in the air.',
  },

  // April
  {
    month: 4,
    day: 1,
    name: "April Fools' Day",
    type: 'fun',
    acknowledgment: "April Fools' Day - watch out for pranks!",
  },
  {
    month: 4,
    day: 22,
    name: 'Earth Day',
    type: 'awareness',
    acknowledgment: 'Happy Earth Day - a reminder to care for our planet.',
  },

  // May
  {
    month: 5,
    day: 1,
    name: 'May Day',
    type: 'cultural',
    acknowledgment: 'May Day - celebrating workers worldwide.',
  },
  {
    month: 5,
    day: 4,
    name: 'Star Wars Day',
    type: 'fun',
    acknowledgment: 'May the Fourth be with you!',
  },
  {
    month: 5,
    day: 5,
    name: 'Cinco de Mayo',
    type: 'cultural',
    acknowledgment: 'Happy Cinco de Mayo!',
  },
  {
    month: 5,
    day: 10,
    name: "Mother's Day",
    type: 'major',
    acknowledgment: "Happy Mother's Day to all the mothers and mother figures.",
    sensitivity: 'Date varies, 2nd Sunday. Be sensitive to those who have lost mothers',
  },
  {
    month: 5,
    day: 27,
    name: 'Memorial Day',
    type: 'major',
    acknowledgment: 'Memorial Day - honoring those who served.',
    sensitivity: 'Last Monday of May',
  },

  // June
  {
    month: 6,
    day: 1,
    name: 'Pride Month Begins',
    type: 'awareness',
    acknowledgment: 'Happy Pride Month! Celebrating love and identity.',
  },
  {
    month: 6,
    day: 16,
    name: "Father's Day",
    type: 'major',
    acknowledgment: "Happy Father's Day to all the fathers and father figures.",
    sensitivity: 'Date varies, 3rd Sunday',
  },
  {
    month: 6,
    day: 19,
    name: 'Juneteenth',
    type: 'major',
    acknowledgment: 'Juneteenth - celebrating freedom and reflecting on history.',
  },
  {
    month: 6,
    day: 21,
    name: 'Summer Solstice',
    type: 'minor',
    acknowledgment: 'Longest day of the year - embrace the light.',
  },

  // July
  {
    month: 7,
    day: 4,
    name: 'Independence Day',
    type: 'major',
    acknowledgment: 'Happy Fourth of July!',
  },

  // August
  {
    month: 8,
    day: 8,
    name: 'International Cat Day',
    type: 'fun',
    acknowledgment: 'International Cat Day - for the cat lovers out there.',
  },
  {
    month: 8,
    day: 26,
    name: "Women's Equality Day",
    type: 'awareness',
    acknowledgment: "Women's Equality Day - honoring the 19th Amendment.",
  },

  // September
  {
    month: 9,
    day: 2,
    name: 'Labor Day',
    type: 'major',
    acknowledgment: 'Happy Labor Day - celebrating workers everywhere.',
    sensitivity: 'First Monday',
  },
  {
    month: 9,
    day: 21,
    name: 'International Day of Peace',
    type: 'awareness',
    acknowledgment: 'International Day of Peace - a moment for reflection.',
  },
  {
    month: 9,
    day: 22,
    name: 'Fall Equinox',
    type: 'minor',
    acknowledgment: 'First day of fall - cozy season begins.',
  },

  // October
  {
    month: 10,
    day: 1,
    name: 'Mental Health Awareness Month',
    type: 'awareness',
    acknowledgment: "It's Mental Health Awareness Month - how are you really doing?",
  },
  {
    month: 10,
    day: 10,
    name: 'World Mental Health Day',
    type: 'awareness',
    acknowledgment: 'World Mental Health Day - your mental health matters.',
  },
  {
    month: 10,
    day: 14,
    name: 'Indigenous Peoples Day',
    type: 'awareness',
    acknowledgment: "Indigenous Peoples' Day - honoring Native American heritage.",
  },
  { month: 10, day: 31, name: 'Halloween', type: 'cultural', acknowledgment: 'Happy Halloween!' },

  // November
  {
    month: 11,
    day: 1,
    name: 'Día de los Muertos',
    type: 'cultural',
    acknowledgment: 'Día de los Muertos - honoring loved ones who have passed.',
  },
  {
    month: 11,
    day: 11,
    name: 'Veterans Day',
    type: 'major',
    acknowledgment: 'Veterans Day - thank you to those who served.',
  },
  {
    month: 11,
    day: 28,
    name: 'Thanksgiving',
    type: 'major',
    acknowledgment: 'Happy Thanksgiving! A day for gratitude.',
    sensitivity: 'Fourth Thursday. Be mindful this day has complex history',
  },

  // December
  {
    month: 12,
    day: 21,
    name: 'Winter Solstice',
    type: 'minor',
    acknowledgment: 'Winter Solstice - the shortest day, but the light returns.',
  },
  {
    month: 12,
    day: 24,
    name: 'Christmas Eve',
    type: 'major',
    acknowledgment: 'Christmas Eve - magic in the air for those celebrating.',
  },
  {
    month: 12,
    day: 25,
    name: 'Christmas',
    type: 'major',
    acknowledgment: 'Merry Christmas to those celebrating!',
    sensitivity: 'Not everyone celebrates - be inclusive',
  },
  {
    month: 12,
    day: 26,
    name: 'Kwanzaa Begins',
    type: 'cultural',
    acknowledgment: 'Happy Kwanzaa to those celebrating!',
  },
  {
    month: 12,
    day: 31,
    name: "New Year's Eve",
    type: 'major',
    acknowledgment: "New Year's Eve - out with the old, in with the new.",
  },

  // Hanukkah, Eid, Diwali - dates vary significantly, handled separately
];

// ============================================================================
// SEASONAL CONTEXT
// ============================================================================

function getSeasonalContext(): string {
  const month = new Date().getMonth();

  if (month >= 2 && month <= 4) {
    return 'Spring is here - a time for renewal and new beginnings.';
  } else if (month >= 5 && month <= 7) {
    return "It's summer - longer days, more energy, time for adventures.";
  } else if (month >= 8 && month <= 10) {
    return 'Fall has arrived - cozy season, time for reflection and gratitude.';
  } else {
    return 'Winter is here - a time for rest, reflection, and staying warm.';
  }
}

// ============================================================================
// WEATHER CONVERSATION HOOKS
// ============================================================================

function generateWeatherHook(weatherText: string): string | undefined {
  const lower = weatherText.toLowerCase();

  if (lower.includes('rain') || lower.includes('storm')) {
    return "It's rainy out there - good day to stay cozy.";
  }
  if (lower.includes('snow')) {
    return 'Snow outside! Perfect weather for hot cocoa.';
  }
  if (lower.includes('sunny') || lower.includes('clear')) {
    return 'Beautiful weather today - hope you can enjoy some of it.';
  }
  if (
    lower.includes('hot') ||
    (lower.includes('°f') && parseInt(lower.match(/(\d+)°f/)?.[1] || '0') > 85)
  ) {
    return "It's hot out there - stay hydrated!";
  }
  if (
    lower.includes('cold') ||
    (lower.includes('°f') && parseInt(lower.match(/(\d+)°f/)?.[1] || '100') < 40)
  ) {
    return 'Pretty cold today - bundle up if you go out.';
  }

  return undefined;
}

// ============================================================================
// DATA FETCHING (Background)
// ============================================================================

async function fetchWeatherData(location: string): Promise<WeatherContext | undefined> {
  try {
    const [current, forecast] = await Promise.all([
      getCurrentWeather(location),
      getWeatherForecast(location, 3),
    ]);

    const weatherContext: WeatherContext = {
      current,
      forecast,
      location,
      fetchedAt: new Date(),
      conversationHook: generateWeatherHook(current),
    };

    log.debug({ location }, 'Weather data fetched');
    return weatherContext;
  } catch (error) {
    log.warn({ error: String(error), location }, 'Weather fetch failed');
    return undefined;
  }
}

async function fetchNewsData(): Promise<NewsContext | undefined> {
  try {
    const [general, tech, financial] = await Promise.all([
      getGeneralNews().then((r) => [r]),
      getTechNews().then((r) => [r]),
      getFinancialNews().then((r) => [r]),
    ]);

    // Pick the most interesting headline for natural mention
    const allHeadlines = [...general, ...tech].filter((h) => h && !h.includes("couldn't"));
    const topStory = allHeadlines[0];

    const newsContext: NewsContext = {
      general,
      tech,
      financial,
      fetchedAt: new Date(),
      topStory,
    };

    log.debug('News data fetched');
    return newsContext;
  } catch (error) {
    log.warn({ error: String(error) }, 'News fetch failed');
    return undefined;
  }
}

async function fetchSportsData(favoriteTeams: string[]): Promise<SportsContext | undefined> {
  if (favoriteTeams.length === 0) return undefined;

  try {
    const scores = new Map<string, string>();
    let excitingGame: string | undefined;

    // Fetch scores for favorite teams in parallel
    const results = await Promise.allSettled(
      favoriteTeams.map(async (team) => {
        const score = await getTeamScore(team);
        return { team, score };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.score) {
        scores.set(result.value.team, result.value.score);

        // Check if it's an exciting game (close score, currently playing)
        const scoreText = result.value.score.toLowerCase();
        if (
          (scoreText.includes('in progress') || scoreText.includes('live')) &&
          !scoreText.includes("don't have")
        ) {
          excitingGame = `Your ${result.value.team} game is on right now! ${result.value.score}`;
        }
      }
    }

    const sportsContext: SportsContext = {
      scores,
      fetchedAt: new Date(),
      excitingGame,
    };

    log.debug({ teamCount: scores.size }, 'Sports data fetched');
    return sportsContext;
  } catch (error) {
    log.warn({ error: String(error) }, 'Sports fetch failed');
    return undefined;
  }
}

async function fetchCulturalData(): Promise<CulturalContext> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Find today's holiday
  const todayHoliday = CULTURAL_CALENDAR.find((h) => h.month === month && h.day === day);

  // Find holidays in the next 7 days
  const upcomingHolidays: HolidayInfo[] = [];
  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const futureMonth = futureDate.getMonth() + 1;
    const futureDay = futureDate.getDate();

    const holiday = CULTURAL_CALENDAR.find((h) => h.month === futureMonth && h.day === futureDay);
    if (holiday) {
      upcomingHolidays.push({
        name: holiday.name,
        date: futureDate,
        type: holiday.type,
        acknowledgment: holiday.acknowledgment,
        sensitivity: holiday.sensitivity,
      });
    }
  }

  // Get historical event
  let historicalEvent: string | undefined;
  try {
    const event = await getHistoricalEvent();
    historicalEvent = event || undefined;
  } catch {
    // Historical event is nice-to-have
  }

  return {
    holiday: todayHoliday
      ? {
          name: todayHoliday.name,
          date: now,
          type: todayHoliday.type,
          acknowledgment: todayHoliday.acknowledgment,
          sensitivity: todayHoliday.sensitivity,
        }
      : undefined,
    upcomingHolidays,
    historicalEvent,
    seasonalContext: getSeasonalContext(),
  };
}

// ============================================================================
// MAIN SERVICE API
// ============================================================================

/**
 * Pre-warm the world awareness cache for a user.
 * Call this at session start - runs in background, doesn't block.
 */
export async function warmWorldCache(
  userId: string,
  interests: Partial<UserInterests> = {}
): Promise<void> {
  const fullInterests: UserInterests = {
    favoriteTeams: interests.favoriteTeams || [],
    industries: interests.industries || [],
    topics: interests.topics || [],
    location: interests.location,
    timezone: interests.timezone,
  };

  // Initialize cache
  const cache: UserWorldCache = {
    userId,
    interests: fullInterests,
    lastRefresh: new Date(),
    isRefreshing: true,
  };
  userCaches.set(userId, cache);

  log.info({ userId, hasLocation: !!fullInterests.location }, 'Warming world cache');

  // Fetch everything in parallel (don't await - this runs in background)
  const fetchPromise = Promise.all([
    fullInterests.location ? fetchWeatherData(fullInterests.location) : Promise.resolve(undefined),
    fetchNewsData(),
    fetchSportsData(fullInterests.favoriteTeams),
    fetchCulturalData(),
  ]).then(([weather, news, sports, cultural]) => {
    const updatedCache = userCaches.get(userId);
    if (updatedCache) {
      updatedCache.weather = weather;
      updatedCache.news = news;
      updatedCache.sports = sports;
      updatedCache.cultural = cultural;
      updatedCache.isRefreshing = false;
      updatedCache.lastRefresh = new Date();
    }

    log.info(
      {
        userId,
        hasWeather: !!weather,
        hasNews: !!news,
        hasSports: !!sports,
        hasHoliday: !!cultural?.holiday,
      },
      'World cache warmed'
    );
  });

  // Don't await - let it run in background
  fetchPromise.catch((error) => {
    log.error({ error: String(error), userId }, 'World cache warming failed');
    const updatedCache = userCaches.get(userId);
    if (updatedCache) {
      updatedCache.isRefreshing = false;
    }
  });
}

/**
 * Get the current world snapshot for a user.
 * Returns whatever we have cached - never blocks on API calls.
 */
export function getWorldSnapshot(userId: string): WorldSnapshot {
  const cache = userCaches.get(userId);
  const now = new Date();

  if (!cache) {
    // No cache - return empty but valid snapshot
    return {
      cultural: {
        upcomingHolidays: [],
        seasonalContext: getSeasonalContext(),
      },
      assembledAt: now,
      isFresh: false,
    };
  }

  // Check staleness
  const weatherStale = cache.weather
    ? now.getTime() - cache.weather.fetchedAt.getTime() > CACHE_TTL.weather
    : true;
  const newsStale = cache.news
    ? now.getTime() - cache.news.fetchedAt.getTime() > CACHE_TTL.news
    : true;
  const sportsStale = cache.sports
    ? now.getTime() - cache.sports.fetchedAt.getTime() > CACHE_TTL.sports
    : true;

  // Trigger background refresh if stale and not already refreshing
  if ((weatherStale || newsStale || sportsStale) && !cache.isRefreshing) {
    refreshStaleData(userId, { weatherStale, newsStale, sportsStale });
  }

  return {
    weather: cache.weather,
    news: cache.news,
    sports: cache.sports,
    cultural: cache.cultural || {
      upcomingHolidays: [],
      seasonalContext: getSeasonalContext(),
    },
    trending: cache.trending,
    assembledAt: now,
    isFresh: !weatherStale && !newsStale,
  };
}

/**
 * Update user's interests (e.g., when they mention a favorite team)
 */
export function updateUserInterests(userId: string, interests: Partial<UserInterests>): void {
  const cache = userCaches.get(userId);
  if (!cache) {
    // Create new cache with these interests
    void warmWorldCache(userId, interests);
    return;
  }

  // Merge interests
  if (interests.favoriteTeams) {
    const newTeams = interests.favoriteTeams.filter(
      (t) => !cache.interests.favoriteTeams.includes(t)
    );
    if (newTeams.length > 0) {
      cache.interests.favoriteTeams.push(...newTeams);
      // Fetch scores for new teams
      void fetchSportsData(newTeams).then((sports) => {
        if (sports && cache.sports) {
          for (const [team, score] of sports.scores) {
            cache.sports.scores.set(team, score);
          }
        }
      });
    }
  }

  if (interests.location && interests.location !== cache.interests.location) {
    cache.interests.location = interests.location;
    // Fetch weather for new location
    void fetchWeatherData(interests.location).then((weather) => {
      if (weather) {
        cache.weather = weather;
      }
    });
  }

  if (interests.industries) {
    cache.interests.industries = [
      ...new Set([...cache.interests.industries, ...interests.industries]),
    ];
  }

  if (interests.topics) {
    cache.interests.topics = [...new Set([...cache.interests.topics, ...interests.topics])];
  }

  log.debug({ userId, interests }, 'User interests updated');
}

/**
 * Get a natural conversation starter based on world context.
 * Returns something Ferni can weave naturally into greeting.
 */
export function getConversationStarter(userId: string): string | null {
  const snapshot = getWorldSnapshot(userId);

  // Priority 1: Today's holiday
  if (snapshot.cultural.holiday) {
    return snapshot.cultural.holiday.acknowledgment;
  }

  // Priority 2: Exciting sports game
  if (snapshot.sports?.excitingGame) {
    return snapshot.sports.excitingGame;
  }

  // Priority 3: Weather hook (if interesting)
  if (snapshot.weather?.conversationHook) {
    return snapshot.weather.conversationHook;
  }

  // Priority 4: Historical event (occasionally)
  if (snapshot.cultural.historicalEvent && Math.random() < 0.2) {
    return snapshot.cultural.historicalEvent;
  }

  // Priority 5: Upcoming holiday (if within 2 days)
  const soonHoliday = snapshot.cultural.upcomingHolidays.find((h) => {
    const daysAway = Math.ceil((h.date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return daysAway <= 2 && h.type === 'major';
  });
  if (soonHoliday) {
    return `${soonHoliday.name} is coming up ${soonHoliday.date.getDate() === new Date().getDate() + 1 ? 'tomorrow' : 'soon'}!`;
  }

  return null;
}

/**
 * Check if user has mentioned a sports team we should track
 */
export function detectTeamMention(text: string): string | null {
  const teamPatterns = [
    // NFL
    { pattern: /\b(eagles|philadelphia eagles)\b/i, team: 'Eagles' },
    { pattern: /\b(cowboys|dallas cowboys)\b/i, team: 'Cowboys' },
    { pattern: /\b(chiefs|kansas city chiefs)\b/i, team: 'Chiefs' },
    { pattern: /\b(49ers|niners|san francisco)\b/i, team: '49ers' },
    { pattern: /\b(bills|buffalo bills)\b/i, team: 'Bills' },
    { pattern: /\b(ravens|baltimore ravens)\b/i, team: 'Ravens' },
    { pattern: /\b(packers|green bay)\b/i, team: 'Packers' },
    // MLB
    { pattern: /\b(phillies|philadelphia phillies)\b/i, team: 'Phillies' },
    { pattern: /\b(yankees|new york yankees)\b/i, team: 'Yankees' },
    { pattern: /\b(dodgers|la dodgers|los angeles dodgers)\b/i, team: 'Dodgers' },
    { pattern: /\b(red sox|boston red sox)\b/i, team: 'Red Sox' },
    { pattern: /\b(cubs|chicago cubs)\b/i, team: 'Cubs' },
    // NBA
    { pattern: /\b(sixers|76ers|philadelphia 76ers)\b/i, team: '76ers' },
    { pattern: /\b(lakers|la lakers|los angeles lakers)\b/i, team: 'Lakers' },
    { pattern: /\b(celtics|boston celtics)\b/i, team: 'Celtics' },
    { pattern: /\b(warriors|golden state)\b/i, team: 'Warriors' },
    // NHL
    { pattern: /\b(flyers|philadelphia flyers)\b/i, team: 'Flyers' },
    { pattern: /\b(bruins|boston bruins)\b/i, team: 'Bruins' },
    { pattern: /\b(rangers|new york rangers)\b/i, team: 'Rangers' },
  ];

  for (const { pattern, team } of teamPatterns) {
    if (pattern.test(text)) {
      return team;
    }
  }

  return null;
}

/**
 * Clean up cache when session ends
 */
export function clearUserCache(userId: string): void {
  userCaches.delete(userId);
  log.debug({ userId }, 'World cache cleared');
}

// ============================================================================
// BACKGROUND REFRESH
// ============================================================================

async function refreshStaleData(
  userId: string,
  stale: { weatherStale: boolean; newsStale: boolean; sportsStale: boolean }
): Promise<void> {
  const cache = userCaches.get(userId);
  if (!cache || cache.isRefreshing) return;

  cache.isRefreshing = true;

  try {
    const promises: Promise<void>[] = [];

    if (stale.weatherStale && cache.interests.location) {
      promises.push(
        fetchWeatherData(cache.interests.location).then((weather) => {
          if (weather) cache.weather = weather;
        })
      );
    }

    if (stale.newsStale) {
      promises.push(
        fetchNewsData().then((news) => {
          if (news) cache.news = news;
        })
      );
    }

    if (stale.sportsStale && cache.interests.favoriteTeams.length > 0) {
      promises.push(
        fetchSportsData(cache.interests.favoriteTeams).then((sports) => {
          if (sports) cache.sports = sports;
        })
      );
    }

    await Promise.all(promises);
    log.debug({ userId }, 'Stale data refreshed');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Background refresh failed');
  } finally {
    cache.isRefreshing = false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  warmWorldCache,
  getWorldSnapshot,
  getConversationStarter,
  updateUserInterests,
  detectTeamMention,
  clearUserCache,
};
