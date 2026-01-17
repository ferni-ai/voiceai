/**
 * 🎵 Musical You API Routes
 *
 * Endpoints for the Musical You feature:
 * - Musical DNA profiles
 * - Daily challenges
 * - Social features (challenges, leaderboards, taste match)
 * - Shareable cards
 * - Spotify integration
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, parseBody } from '../helpers.js';
import type { GameMemory } from '../../types/user-profile.js';

// Import Musical You services
import {
  getMusicalDNA,
  generateCoachingMessage,
  generateTimeMachine,
  getMusicalYouProfile,
  recordGameResult,
  // Daily challenges
  getDailyChallenge,
  getUpcomingChallenges,
  getUserChallengeProgress,
  startDailyChallenge,
  completeDailyChallenge,
  getUserChallengeStats,
  // Social
  sendMusicChallenge,
  getUserChallenges,
  getChallenge,
  completeChallenge,
  declineChallenge,
  getLeaderboard,
  getTopEntries,
  getUserRank,
  calculateTasteMatch,
  describeTasteMatch,
  getUserSocialStats,
  // Cards
  generateDNACard,
  generateDesertIslandCard,
  generateGameVictoryCard,
  getCard,
  getUserCards,
  generateMusicalDNASVG,
  generateDesertIslandSVG,
  generateVictorySVG,
  // Spotify
  syncSpotifyLibrary,
  getSpotifyLibrary,
  hasEnoughPlayableContent,
  getOurSongsPlaylist,
  addOurSong,
  // Apple Music
  generateAppleMusicToken,
  syncAppleMusicLibrary,
  getAppleMusicLibrary,
  isAppleMusicConnected,
  analyzeAppleMusicTaste,
  getHeavyRotationTracks,
  getRecentlyPlayedTracks,
} from '../../services/musical-you/index.js';

import type {
  DesertIslandPicks,
  MusicalDNACardData,
  DesertIslandCardData,
  GameVictoryCardData,
} from '../../services/musical-you/types.js';

const log = createLogger({ module: 'MusicalYouAPI' });

// ============================================================================
// WARM ERROR MESSAGES
// ============================================================================

const WARM_ERRORS = {
  missingUserId: "Hmm, I'm not sure who you are. Try refreshing?",
  noGameData: "Play a few music games first—then I'll know your musical soul!",
  challengeNotFound: "Can't find that challenge. It might have expired.",
  cardNotFound: "That card isn't available anymore.",
  spotifyNotConnected: 'Connect Spotify to unlock this feature!',
  internalError: 'Something went wrong on my end. Mind trying again?',
} as const;

// ============================================================================
// HELPERS
// ============================================================================

async function getUserGameMemory(userId: string): Promise<GameMemory | null> {
  try {
    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();
    const profile = await store.getProfile(userId);
    return (profile as { gameMemory?: GameMemory } | null)?.gameMemory || null;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to get game memory');
    return null;
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle Musical You API routes
 * @returns true if route was handled
 */
export async function handleMusicalYouRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  searchParams: URLSearchParams
): Promise<boolean> {
  const method = req.method || 'GET';

  try {
    // ========================================
    // MUSICAL DNA ROUTES
    // ========================================

    // GET /api/musical/dna?userId=xxx
    if (pathname === '/api/musical/dna' && method === 'GET') {
      const userId = requireUserId(req, res, new URL(`http://localhost${req.url}`));
      if (!userId) return true;

      const gameMemory = await getUserGameMemory(userId);
      const dna = await getMusicalDNA(userId, gameMemory);

      if (!dna) {
        sendJSON(res, {
          success: true,
          dna: null,
          message: WARM_ERRORS.noGameData,
          gamesNeeded: 5,
        });
        return true;
      }

      sendJSON(res, {
        success: true,
        dna,
        coachingMessage: generateCoachingMessage(dna),
        timeMachine: generateTimeMachine(dna),
      });
      return true;
    }

    // GET /api/musical/profile?userId=xxx - Full profile
    if (pathname === '/api/musical/profile' && method === 'GET') {
      const userId = requireUserId(req, res, new URL(`http://localhost${req.url}`));
      if (!userId) return true;

      const gameMemory = await getUserGameMemory(userId);
      const profile = await getMusicalYouProfile(userId, gameMemory);

      sendJSON(res, {
        success: true,
        profile,
      });
      return true;
    }

    // ========================================
    // DAILY CHALLENGE ROUTES
    // ========================================

    // GET /api/musical/daily - Get today's challenge
    if (pathname === '/api/musical/daily' && method === 'GET') {
      const challenge = getDailyChallenge();
      const userId = searchParams.get('userId');

      let progress = null;
      if (userId) {
        progress = getUserChallengeProgress(userId, challenge.id);
      }

      sendJSON(res, {
        success: true,
        challenge,
        progress,
      });
      return true;
    }

    // GET /api/musical/daily/upcoming - Get upcoming challenges
    if (pathname === '/api/musical/daily/upcoming' && method === 'GET') {
      const days = parseInt(searchParams.get('days') || '7', 10);
      const challenges = getUpcomingChallenges(undefined, Math.min(days, 14));

      sendJSON(res, {
        success: true,
        challenges,
      });
      return true;
    }

    // POST /api/musical/daily/start - Start a daily challenge
    if (pathname === '/api/musical/daily/start' && method === 'POST') {
      const body = await parseBody<{ userId?: string; challengeId?: string }>(req);
      const userId = body.userId;
      const challengeId = body.challengeId;

      if (!userId || !challengeId) {
        sendJSON(res, { success: false, error: 'Missing userId or challengeId' }, 400);
        return true;
      }

      const progress = startDailyChallenge(userId, challengeId);

      sendJSON(res, {
        success: true,
        progress,
      });
      return true;
    }

    // POST /api/musical/daily/complete - Complete a daily challenge
    if (pathname === '/api/musical/daily/complete' && method === 'POST') {
      const body = await parseBody<{ userId?: string; challengeId?: string; score?: number }>(req);
      const userId = body.userId;
      const challengeId = body.challengeId;
      const score = body.score;

      if (!userId || !challengeId || score === undefined) {
        sendJSON(res, { success: false, error: 'Missing required fields' }, 400);
        return true;
      }

      const progress = completeDailyChallenge(userId, challengeId, score);

      sendJSON(res, {
        success: true,
        progress,
      });
      return true;
    }

    // GET /api/musical/daily/stats?userId=xxx
    if (pathname === '/api/musical/daily/stats' && method === 'GET') {
      const userId = searchParams.get('userId');
      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const stats = getUserChallengeStats(userId);

      sendJSON(res, {
        success: true,
        stats,
      });
      return true;
    }

    // ========================================
    // SOCIAL ROUTES - CHALLENGES
    // ========================================

    // POST /api/musical/challenge - Send a challenge
    if (pathname === '/api/musical/challenge' && method === 'POST') {
      const body = await parseBody<{
        challengerId?: string;
        challengerName?: string;
        challengeeId?: string;
        gameType?: string;
        challengerScore?: number;
        challengerTime?: number;
      }>(req);
      const {
        challengerId,
        challengerName,
        challengeeId,
        gameType,
        challengerScore,
        challengerTime,
      } = body;

      if (!challengerId || !challengeeId || !gameType || challengerScore === undefined) {
        sendJSON(res, { success: false, error: 'Missing required fields' }, 400);
        return true;
      }

      const challenge = sendMusicChallenge(
        challengerId,
        challengerName || 'Anonymous',
        challengeeId,
        gameType,
        challengerScore,
        challengerTime
      );

      sendJSON(res, {
        success: true,
        challenge,
      });
      return true;
    }

    // GET /api/musical/challenges?userId=xxx&type=all|sent|received
    if (pathname === '/api/musical/challenges' && method === 'GET') {
      const userId = searchParams.get('userId');
      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const type = (searchParams.get('type') || 'all') as 'all' | 'sent' | 'received';
      const challenges = getUserChallenges(userId, type);

      sendJSON(res, {
        success: true,
        challenges,
      });
      return true;
    }

    // GET /api/musical/challenge/:id
    if (pathname.match(/^\/api\/musical\/challenge\/[^/]+$/) && method === 'GET') {
      const challengeId = pathname.split('/').pop()!;
      const challenge = getChallenge(challengeId);

      if (!challenge) {
        sendJSON(res, { success: false, error: WARM_ERRORS.challengeNotFound }, 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        challenge,
      });
      return true;
    }

    // POST /api/musical/challenge/:id/complete
    if (pathname.match(/^\/api\/musical\/challenge\/[^/]+\/complete$/) && method === 'POST') {
      const challengeId = pathname.split('/')[4];
      const body = await parseBody<{ score?: number; time?: number; name?: string }>(req);
      const { score, time, name } = body;

      if (score === undefined) {
        sendJSON(res, { success: false, error: 'Missing score' }, 400);
        return true;
      }

      const challenge = completeChallenge(challengeId, score, time, name);

      if (!challenge) {
        sendJSON(res, { success: false, error: WARM_ERRORS.challengeNotFound }, 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        challenge,
      });
      return true;
    }

    // POST /api/musical/challenge/:id/decline
    if (pathname.match(/^\/api\/musical\/challenge\/[^/]+\/decline$/) && method === 'POST') {
      const challengeId = pathname.split('/')[4];
      const challenge = declineChallenge(challengeId);

      if (!challenge) {
        sendJSON(res, { success: false, error: WARM_ERRORS.challengeNotFound }, 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        challenge,
      });
      return true;
    }

    // ========================================
    // SOCIAL ROUTES - LEADERBOARDS
    // ========================================

    // GET /api/musical/leaderboard?type=weekly|monthly|all-time&gameType=overall
    if (pathname === '/api/musical/leaderboard' && method === 'GET') {
      const type = (searchParams.get('type') || 'weekly') as 'weekly' | 'monthly' | 'all-time';
      const gameType = searchParams.get('gameType') || 'overall';
      const limit = parseInt(searchParams.get('limit') || '10', 10);

      const entries = getTopEntries(type, gameType, Math.min(limit, 100));
      const leaderboard = getLeaderboard(type, gameType);

      sendJSON(res, {
        success: true,
        leaderboard: {
          ...leaderboard,
          entries,
        },
      });
      return true;
    }

    // GET /api/musical/leaderboard/rank?userId=xxx
    if (pathname === '/api/musical/leaderboard/rank' && method === 'GET') {
      const userId = searchParams.get('userId');
      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const type = (searchParams.get('type') || 'weekly') as 'weekly' | 'monthly' | 'all-time';
      const gameType = searchParams.get('gameType') || 'overall';

      const rank = getUserRank(userId, type, gameType);

      sendJSON(res, {
        success: true,
        rank,
      });
      return true;
    }

    // ========================================
    // SOCIAL ROUTES - TASTE MATCH
    // ========================================

    // POST /api/musical/taste-match
    if (pathname === '/api/musical/taste-match' && method === 'POST') {
      const body = await parseBody<{ user1Id?: string; user2Id?: string }>(req);
      const { user1Id, user2Id } = body;

      if (!user1Id || !user2Id) {
        sendJSON(res, { success: false, error: 'Missing user IDs' }, 400);
        return true;
      }

      const user1Memory = await getUserGameMemory(user1Id);
      const user2Memory = await getUserGameMemory(user2Id);

      if (!user1Memory || !user2Memory) {
        sendJSON(
          res,
          {
            success: false,
            error: 'Both users need to play some games first!',
          },
          400
        );
        return true;
      }

      const tasteMatch = calculateTasteMatch(user1Id, user1Memory, user2Id, user2Memory);
      const description = describeTasteMatch(tasteMatch);

      sendJSON(res, {
        success: true,
        tasteMatch,
        description,
      });
      return true;
    }

    // GET /api/musical/social/stats?userId=xxx
    if (pathname === '/api/musical/social/stats' && method === 'GET') {
      const userId = searchParams.get('userId');
      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const stats = getUserSocialStats(userId);

      sendJSON(res, {
        success: true,
        stats,
      });
      return true;
    }

    // ========================================
    // SHAREABLE CARDS
    // ========================================

    // POST /api/musical/cards/dna - Generate DNA card
    if (pathname === '/api/musical/cards/dna' && method === 'POST') {
      const body = await parseBody<{ userId?: string }>(req);
      const userId = body.userId;

      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const gameMemory = await getUserGameMemory(userId);
      const dna = await getMusicalDNA(userId, gameMemory);

      if (!dna) {
        sendJSON(res, { success: false, error: WARM_ERRORS.noGameData }, 400);
        return true;
      }

      const card = generateDNACard(userId, dna);
      const svg = card ? generateMusicalDNASVG(card.data as MusicalDNACardData) : null;

      sendJSON(res, {
        success: true,
        card,
        svg,
      });
      return true;
    }

    // POST /api/musical/cards/island - Generate Desert Island card
    if (pathname === '/api/musical/cards/island' && method === 'POST') {
      const body = await parseBody<{ userId?: string; picks?: DesertIslandPicks }>(req);
      const userId = body.userId;
      const picks = body.picks;

      if (!userId || !picks) {
        sendJSON(res, { success: false, error: 'Missing userId or picks' }, 400);
        return true;
      }

      const card = generateDesertIslandCard(userId, picks);
      const svg = generateDesertIslandSVG(card.data as DesertIslandCardData);

      sendJSON(res, {
        success: true,
        card,
        svg,
      });
      return true;
    }

    // POST /api/musical/cards/victory - Generate Victory card
    if (pathname === '/api/musical/cards/victory' && method === 'POST') {
      const body = await parseBody<{
        userId?: string;
        gameType?: string;
        gameDisplayName?: string;
        score?: number;
        trackName?: string;
        artistName?: string;
        guessTimeMs?: number;
        isPersonalBest?: boolean;
      }>(req);
      const {
        userId,
        gameType,
        gameDisplayName,
        score,
        trackName,
        artistName,
        guessTimeMs,
        isPersonalBest,
      } = body;

      if (!userId || !gameType || score === undefined) {
        sendJSON(res, { success: false, error: 'Missing required fields' }, 400);
        return true;
      }

      const card = generateGameVictoryCard(
        userId,
        gameType,
        gameDisplayName || gameType,
        score,
        trackName,
        artistName,
        guessTimeMs,
        isPersonalBest
      );
      const svg = generateVictorySVG(card.data as GameVictoryCardData);

      sendJSON(res, {
        success: true,
        card,
        svg,
      });
      return true;
    }

    // GET /api/musical/cards?userId=xxx
    if (pathname === '/api/musical/cards' && method === 'GET') {
      const userId = searchParams.get('userId');
      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const cards = getUserCards(userId);

      sendJSON(res, {
        success: true,
        cards,
      });
      return true;
    }

    // GET /api/musical/cards/:id
    if (pathname.match(/^\/api\/musical\/cards\/[^/]+$/) && method === 'GET') {
      const cardId = pathname.split('/').pop()!;
      const card = getCard(cardId);

      if (!card) {
        sendJSON(res, { success: false, error: WARM_ERRORS.cardNotFound }, 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        card,
      });
      return true;
    }

    // ========================================
    // SPOTIFY INTEGRATION
    // ========================================

    // POST /api/musical/spotify/sync
    if (pathname === '/api/musical/spotify/sync' && method === 'POST') {
      const body = await parseBody<{ userId?: string; accessToken?: string }>(req);
      const userId = body.userId;
      const accessToken = body.accessToken;

      if (!userId || !accessToken) {
        sendJSON(res, { success: false, error: 'Missing userId or accessToken' }, 400);
        return true;
      }

      const library = await syncSpotifyLibrary(userId, accessToken);

      if (!library) {
        sendJSON(res, { success: false, error: 'Could not sync Spotify library' }, 500);
        return true;
      }

      sendJSON(res, {
        success: true,
        library: {
          savedTracksCount: library.savedTracksCount,
          playlistCount: library.playlistCount,
          topGenres: library.topGenres.slice(0, 5),
          topDecades: library.topDecades.slice(0, 3),
          playableTracksCount: library.playableTracks.length,
        },
      });
      return true;
    }

    // GET /api/musical/spotify/library?userId=xxx
    if (pathname === '/api/musical/spotify/library' && method === 'GET') {
      const userId = searchParams.get('userId');
      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const library = await getSpotifyLibrary(userId);

      if (!library) {
        sendJSON(res, {
          success: true,
          connected: false,
          message: WARM_ERRORS.spotifyNotConnected,
        });
        return true;
      }

      const playable = hasEnoughPlayableContent(userId);

      sendJSON(res, {
        success: true,
        connected: true,
        library: {
          savedTracksCount: library.savedTracksCount,
          playlistCount: library.playlistCount,
          topGenres: library.topGenres.slice(0, 5),
          topDecades: library.topDecades.slice(0, 3),
          topArtists: library.topArtists.slice(0, 5).map((a) => a.name),
        },
        playable,
      });
      return true;
    }

    // GET /api/musical/spotify/our-songs?userId=xxx
    if (pathname === '/api/musical/spotify/our-songs' && method === 'GET') {
      const userId = searchParams.get('userId');
      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const playlist = getOurSongsPlaylist(userId);

      sendJSON(res, {
        success: true,
        playlist,
      });
      return true;
    }

    // POST /api/musical/spotify/our-songs/add
    if (pathname === '/api/musical/spotify/our-songs/add' && method === 'POST') {
      const body = await parseBody<{
        userId?: string;
        song?: {
          trackId: string;
          trackName: string;
          artistName: string;
          reason: string;
          conversationContext?: string;
          spotifyUri?: string;
        };
      }>(req);
      const { userId, song } = body;

      if (!userId || !song) {
        sendJSON(res, { success: false, error: 'Missing userId or song' }, 400);
        return true;
      }

      const playlist = addOurSong(userId, song);

      sendJSON(res, {
        success: true,
        playlist,
      });
      return true;
    }

    // ========================================
    // GAME RESULT RECORDING
    // ========================================

    // POST /api/musical/record - Record a game result
    if (pathname === '/api/musical/record' && method === 'POST') {
      const body = await parseBody<{
        userId?: string;
        displayName?: string;
        gameType?: string;
        score?: number;
        gamesPlayed?: number;
        bestStreak?: number;
      }>(req);
      const { userId, displayName, gameType, score, gamesPlayed, bestStreak } = body;

      if (!userId || !gameType || score === undefined) {
        sendJSON(res, { success: false, error: 'Missing required fields' }, 400);
        return true;
      }

      recordGameResult(
        userId,
        displayName || 'Player',
        gameType,
        score,
        gamesPlayed || 1,
        bestStreak || 0
      );

      sendJSON(res, {
        success: true,
      });
      return true;
    }

    // ========================================
    // APPLE MUSIC INTEGRATION
    // ========================================

    // GET /api/musical/apple/token - Get developer token for MusicKit JS
    if (pathname === '/api/musical/apple/token' && method === 'GET') {
      const token = await generateAppleMusicToken();

      if (!token) {
        sendJSON(res, {
          success: false,
          error: 'Apple Music not configured',
          configured: false,
        });
        return true;
      }

      sendJSON(res, {
        success: true,
        developerToken: token,
      });
      return true;
    }

    // POST /api/musical/apple/connect - Connect Apple Music with user token
    if (pathname === '/api/musical/apple/connect' && method === 'POST') {
      const body = await parseBody<{ userId?: string; userToken?: string }>(req);
      const { userId, userToken } = body;

      if (!userId || !userToken) {
        sendJSON(res, { success: false, error: 'Missing userId or userToken' }, 400);
        return true;
      }

      // Get developer token
      const developerToken = await generateAppleMusicToken();
      if (!developerToken) {
        sendJSON(res, { success: false, error: 'Apple Music not configured on server' }, 500);
        return true;
      }

      // Sync library
      const library = await syncAppleMusicLibrary(userId, developerToken, userToken);

      if (!library) {
        sendJSON(res, { success: false, error: 'Failed to sync Apple Music library' }, 500);
        return true;
      }

      sendJSON(res, {
        success: true,
        connected: true,
        libraryTrackCount: library.libraryTrackCount,
        topGenres: library.topGenres.slice(0, 5),
        topArtists: library.topArtists.slice(0, 5).map((a) => a.name),
      });
      return true;
    }

    // GET /api/musical/apple/library?userId=xxx - Get synced Apple Music library
    if (pathname === '/api/musical/apple/library' && method === 'GET') {
      const userId = searchParams.get('userId');

      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const library = await getAppleMusicLibrary(userId);

      if (!library) {
        sendJSON(res, {
          success: false,
          error: 'Apple Music not connected. Connect first to sync your library.',
          connected: false,
        });
        return true;
      }

      sendJSON(res, {
        success: true,
        library: {
          connected: library.connected,
          lastSyncedAt: library.lastSyncedAt,
          libraryTrackCount: library.libraryTrackCount,
          topGenres: library.topGenres,
          topDecades: library.topDecades,
          topArtists: library.topArtists,
          recentlyPlayedCount: library.recentlyPlayed.length,
          heavyRotationCount: library.heavyRotation.length,
        },
      });
      return true;
    }

    // GET /api/musical/apple/status?userId=xxx - Check if Apple Music connected
    if (pathname === '/api/musical/apple/status' && method === 'GET') {
      const userId = searchParams.get('userId');

      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const connected = isAppleMusicConnected(userId);
      const library = connected ? await getAppleMusicLibrary(userId) : null;

      sendJSON(res, {
        success: true,
        connected,
        lastSyncedAt: library?.lastSyncedAt || null,
        libraryTrackCount: library?.libraryTrackCount || 0,
      });
      return true;
    }

    // GET /api/musical/apple/taste?userId=xxx - Get taste analysis from Apple Music
    if (pathname === '/api/musical/apple/taste' && method === 'GET') {
      const userId = searchParams.get('userId');

      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const library = await getAppleMusicLibrary(userId);

      if (!library) {
        sendJSON(res, { success: false, error: 'Connect Apple Music first' }, 400);
        return true;
      }

      const taste = analyzeAppleMusicTaste(library);

      sendJSON(res, {
        success: true,
        taste,
      });
      return true;
    }

    // GET /api/musical/apple/heavy-rotation?userId=xxx - Get most played tracks
    if (pathname === '/api/musical/apple/heavy-rotation' && method === 'GET') {
      const userId = searchParams.get('userId');
      const count = parseInt(searchParams.get('count') || '10', 10);

      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const tracks = getHeavyRotationTracks(userId, count);

      sendJSON(res, {
        success: true,
        tracks,
      });
      return true;
    }

    // GET /api/musical/apple/recent?userId=xxx - Get recently played
    if (pathname === '/api/musical/apple/recent' && method === 'GET') {
      const userId = searchParams.get('userId');
      const count = parseInt(searchParams.get('count') || '10', 10);

      if (!userId) {
        sendJSON(res, { success: false, error: WARM_ERRORS.missingUserId }, 400);
        return true;
      }

      const tracks = getRecentlyPlayedTracks(userId, count);

      sendJSON(res, {
        success: true,
        tracks,
      });
      return true;
    }

    // POST /api/musical/apple/sync - Force re-sync Apple Music library
    if (pathname === '/api/musical/apple/sync' && method === 'POST') {
      const body = await parseBody<{ userId?: string; userToken?: string }>(req);
      const { userId, userToken } = body;

      if (!userId || !userToken) {
        sendJSON(res, { success: false, error: 'Missing userId or userToken' }, 400);
        return true;
      }

      const developerToken = await generateAppleMusicToken();
      if (!developerToken) {
        sendJSON(res, { success: false, error: 'Apple Music not configured' }, 500);
        return true;
      }

      const library = await syncAppleMusicLibrary(userId, developerToken, userToken);

      if (!library) {
        sendJSON(res, { success: false, error: 'Sync failed' }, 500);
        return true;
      }

      sendJSON(res, {
        success: true,
        synced: true,
        libraryTrackCount: library.libraryTrackCount,
        heavyRotationCount: library.heavyRotation.length,
        recentlyPlayedCount: library.recentlyPlayed.length,
      });
      return true;
    }

    // Route not handled
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Musical You API error');
    sendJSON(res, { success: false, error: WARM_ERRORS.internalError }, 500);
    return true;
  }
}
