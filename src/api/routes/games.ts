/**
 * Games API Routes
 *
 * Endpoints for game insights and analytics.
 * These power the "Musical You" dashboard and agent conversational insights.
 *
 * Endpoints:
 * - GET /api/games - Get list of available games
 * - GET /api/games/stats - Get user's game stats
 * - GET /api/games/insights - Get music insights (dashboard data)
 * - GET /api/games/suggestion - Get a game suggestion
 * - GET /api/games/conversational - Get a conversational insight for agent
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  generateMusicInsights,
  getConversationalInsight,
  getGameSuggestion,
} from '../../services/games/game-insights.js';
import type { GameMemory } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON } from '../helpers.js';

const log = createLogger({ module: 'GamesAPI' });

// ============================================================================
// AVAILABLE GAMES CATALOG
// ============================================================================

interface GameCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: 'music' | 'text' | 'library';
  difficulty: 'easy' | 'medium' | 'hard';
  duration: string;
  requiresSpotify?: boolean;
  isNew?: boolean;
}

const MUSIC_GAMES: GameCatalogEntry[] = [
  {
    id: 'name-that-tune',
    name: 'Name That Tune',
    description: 'Guess the song from a short clip! Classic music trivia.',
    category: 'music',
    difficulty: 'medium',
    duration: '3-5 min',
  },
  {
    id: 'one-word-song',
    name: 'One Word Song',
    description: 'I say a word, you think of a song with that word in the title.',
    category: 'music',
    difficulty: 'easy',
    duration: '2-3 min',
  },
  {
    id: 'desert-island-discs',
    name: 'Desert Island Discs',
    description: 'Pick 5 songs to take to a desert island. Share your story.',
    category: 'music',
    difficulty: 'easy',
    duration: '5-10 min',
  },
  {
    id: 'this-or-that',
    name: 'This or That',
    description: 'Quick-fire choices between two songs. Which speaks to you?',
    category: 'music',
    difficulty: 'easy',
    duration: '2-3 min',
  },
  {
    id: 'mood-dj-challenge',
    name: 'Mood DJ Challenge',
    description: 'I give you a mood, you pick the perfect song for it.',
    category: 'music',
    difficulty: 'medium',
    duration: '3-5 min',
  },
  {
    id: 'finish-the-lyric',
    name: 'Finish the Lyric',
    description: 'Complete famous song lyrics. Test your music knowledge!',
    category: 'music',
    difficulty: 'medium',
    duration: '3-5 min',
    isNew: true,
  },
  {
    id: 'decade-challenge',
    name: 'Decade Challenge',
    description: 'Guess the decade from the sound. 60s, 70s, 80s, 90s, or 2000s?',
    category: 'music',
    difficulty: 'medium',
    duration: '3-5 min',
    isNew: true,
  },
];

const TEXT_GAMES: GameCatalogEntry[] = [
  {
    id: 'tic-tac-toe',
    name: 'Tic-Tac-Toe',
    description: 'Classic 3x3 game! Say positions like "center" or "top left".',
    category: 'text',
    difficulty: 'easy',
    duration: '2-3 min',
  },
  {
    id: '20-questions',
    name: '20 Questions',
    description: 'Think of something. I have 20 yes/no questions to guess it!',
    category: 'text',
    difficulty: 'medium',
    duration: '5-10 min',
  },
  {
    id: 'word-association',
    name: 'Word Association',
    description: 'Quick word chains! Say the first word that comes to mind.',
    category: 'text',
    difficulty: 'easy',
    duration: '2-3 min',
  },
  {
    id: 'would-you-rather',
    name: 'Would You Rather',
    description: 'Fun dilemmas! Pick between two hypothetical scenarios.',
    category: 'text',
    difficulty: 'easy',
    duration: '3-5 min',
  },
  {
    id: 'story-builder',
    name: 'Story Builder',
    description: "Let's create a story together, one sentence at a time!",
    category: 'text',
    difficulty: 'easy',
    duration: '5-10 min',
  },
];

const LIBRARY_GAMES: GameCatalogEntry[] = [
  {
    id: 'library-name-that-tune',
    name: 'Your Library Mix',
    description: 'Name songs from YOUR Spotify library. Personal challenge!',
    category: 'library',
    difficulty: 'medium',
    duration: '3-5 min',
    requiresSpotify: true,
  },
  {
    id: 'library-deep-cuts',
    name: 'Deep Cuts Challenge',
    description: 'Remember those songs you saved ages ago? Time to prove it!',
    category: 'library',
    difficulty: 'hard',
    duration: '5-7 min',
    requiresSpotify: true,
  },
];

const ALL_GAMES = [...MUSIC_GAMES, ...TEXT_GAMES, ...LIBRARY_GAMES];

// ============================================================================
// RATE LIMITING (User + IP based)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// User-based rate limiting
const userRateLimits = new Map<string, RateLimitEntry>();
// IP-based rate limiting (fallback for unauthenticated requests)
const ipRateLimits = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS_USER = 30; // 30 requests per minute for authenticated users
const RATE_LIMIT_MAX_REQUESTS_IP = 10; // 10 requests per minute per IP (stricter for anonymous)

/**
 * Get client IP from request
 */
function getClientIP(req: IncomingMessage): string {
  // Check for forwarded IP (from proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }

  // Check for Cloud Run forwarded IP
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fallback to direct connection
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Check if request is rate limited (user-based)
 */
function isUserRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = userRateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    // Reset or create entry
    userRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS_USER) {
    log.warn({ userId, count: entry.count }, 'User rate limit exceeded for games API');
    return true;
  }

  entry.count++;
  return false;
}

/**
 * Check if request is rate limited (IP-based)
 */
function isIPRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    // Reset or create entry
    ipRateLimits.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS_IP) {
    log.warn({ ip, count: entry.count }, 'IP rate limit exceeded for games API');
    return true;
  }

  entry.count++;
  return false;
}

/**
 * Check if request is rate limited (combined user + IP)
 */
function isRateLimited(req: IncomingMessage, userId?: string): boolean {
  const ip = getClientIP(req);

  // Always check IP-based limiting
  if (isIPRateLimited(ip)) {
    return true;
  }

  // If user is authenticated, also check user-based limiting
  if (userId && isUserRateLimited(userId)) {
    return true;
  }

  return false;
}

/**
 * Send rate limit response
 */
function sendRateLimitResponse(res: ServerResponse): void {
  res.statusCode = 429;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Retry-After', '60');
  res.end(
    JSON.stringify({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: 60,
    })
  );
}

/**
 * Get user profile from engagement store
 */
async function getUserProfileFromStore(
  userId: string
): Promise<{ gameMemory?: GameMemory } | null> {
  try {
    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();
    const profile = await store.getProfile(userId);
    return profile as { gameMemory?: GameMemory } | null;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to get profile from store');
    return null;
  }
}

/**
 * Handle games routes
 * @returns true if route was handled
 */
export async function handleGamesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/games - List all available games
  if (pathname === '/api/games' && req.method === 'GET') {
    const ip = getClientIP(req);

    // Rate limit check (IP only - no auth required)
    if (isIPRateLimited(ip)) {
      sendRateLimitResponse(res);
      return true;
    }

    // Optional category filter
    const category = parsedUrl.searchParams.get('category');

    let games: GameCatalogEntry[];
    if (category && ['music', 'text', 'library'].includes(category)) {
      games = ALL_GAMES.filter((g) => g.category === category);
    } else {
      games = ALL_GAMES;
    }

    sendJSON(res, {
      success: true,
      games,
      categories: {
        music: MUSIC_GAMES.length,
        text: TEXT_GAMES.length,
        library: LIBRARY_GAMES.length,
      },
      total: ALL_GAMES.length,
    });
    return true;
  }

  // GET /api/games/stats - Get user's game statistics
  if (pathname === '/api/games/stats' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;

    // Rate limit check
    if (isRateLimited(req, userId)) {
      sendRateLimitResponse(res);
      return true;
    }

    try {
      const profile = await getUserProfileFromStore(userId);
      const gameMemory = profile?.gameMemory;

      if (!gameMemory) {
        sendJSON(res, {
          success: true,
          stats: {
            gamesPlayed: 0,
            totalScore: 0,
            currentStreak: 0,
            bestStreak: 0,
            favoriteGame: null,
            lastPlayed: null,
            gamesByType: {},
          },
        });
        return true;
      }

      // Calculate stats from game memory
      const gamesByType: Record<string, number> = {};
      for (const [gameType, stats] of Object.entries(gameMemory.gameStats || {})) {
        gamesByType[gameType] = stats.gamesPlayed;
      }

      // Find favorite game from favoriteGames array or gameStats
      let favoriteGame: string | null = gameMemory.favoriteGames?.[0] || null;
      if (!favoriteGame) {
        let maxPlayed = 0;
        for (const [gameType, count] of Object.entries(gamesByType)) {
          if (count > maxPlayed) {
            maxPlayed = count;
            favoriteGame = gameType;
          }
        }
      }

      // Calculate total score from all game stats
      let totalScore = 0;
      for (const stats of Object.values(gameMemory.gameStats || {})) {
        totalScore += stats.totalScore || 0;
      }

      // Get streak values (can be number or object with count)
      const currentStreak =
        typeof gameMemory.currentStreak === 'number'
          ? gameMemory.currentStreak
          : (gameMemory.currentStreak as { count?: number } | undefined)?.count || 0;
      const bestStreak =
        typeof gameMemory.bestStreak === 'number'
          ? gameMemory.bestStreak
          : (gameMemory.bestStreak as { count?: number } | undefined)?.count || 0;

      sendJSON(res, {
        success: true,
        stats: {
          gamesPlayed: gameMemory.totalGamesPlayed || 0,
          totalScore,
          currentStreak,
          bestStreak,
          favoriteGame,
          lastPlayed: gameMemory.lastGamePlayed?.playedAt || null,
          gamesByType,
        },
      });
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to get game stats');
      sendJSON(
        res,
        {
          success: false,
          error: 'Failed to get stats',
        },
        500
      );
      return true;
    }
  }

  // GET /api/games/library/availability - Check if user can play library mode
  if (pathname === '/api/games/library/availability' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;

    // Rate limit check
    if (isRateLimited(req, userId)) {
      sendRateLimitResponse(res);
      return true;
    }

    try {
      const { checkLibraryAvailability } =
        await import('../../services/games/library-game-mode.js');
      const availability = await checkLibraryAvailability(userId);

      sendJSON(res, {
        success: true,
        ...availability,
      });
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to check library availability');
      sendJSON(
        res,
        {
          success: false,
          error: 'Failed to check library availability',
        },
        500
      );
      return true;
    }
  }

  // GET /api/games/insights - Dashboard data
  if (pathname === '/api/games/insights' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;

    // Rate limit check (user + IP based)
    if (isRateLimited(req, userId)) {
      sendRateLimitResponse(res);
      return true;
    }

    try {
      log.info({ userId }, 'Getting game insights');

      // Get user profile with game memory
      const profile = await getUserProfileFromStore(userId);
      const gameMemory = profile?.gameMemory;

      // Generate insights
      const insights = generateMusicInsights(gameMemory);

      sendJSON(res, {
        success: true,
        insights,
      });
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to get game insights');
      sendJSON(
        res,
        {
          success: false,
          error: 'Failed to generate insights',
        },
        500
      );
      return true;
    }
  }

  // GET /api/games/suggestion - Get a game suggestion
  if (pathname === '/api/games/suggestion' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;

    // Rate limit check
    if (isRateLimited(req, userId)) {
      sendRateLimitResponse(res);
      return true;
    }

    try {
      const profile = await getUserProfileFromStore(userId);
      const suggestion = getGameSuggestion(profile?.gameMemory);

      sendJSON(res, {
        success: true,
        suggestion,
      });
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to get game suggestion');
      sendJSON(
        res,
        {
          success: false,
          error: 'Failed to generate suggestion',
        },
        500
      );
      return true;
    }
  }

  // GET /api/games/conversational - Get conversational insight for agent
  if (pathname === '/api/games/conversational' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;

    // Rate limit check
    if (isRateLimited(req, userId)) {
      sendRateLimitResponse(res);
      return true;
    }

    try {
      const profile = await getUserProfileFromStore(userId);
      const insight = getConversationalInsight(profile?.gameMemory);

      sendJSON(res, {
        success: true,
        insight,
      });
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to get conversational insight');
      sendJSON(
        res,
        {
          success: false,
          error: 'Failed to generate insight',
        },
        500
      );
      return true;
    }
  }

  return false;
}
