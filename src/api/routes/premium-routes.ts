/**
 * 💎 Premium Routes
 *
 * API endpoints for premium features:
 * - Premium content access
 * - Personalized recommendations
 * - User preferences
 * - Our Song feature
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import {
  getAvailableContent,
  getAvailableFeatures,
  getExclusiveContentPreview,
  getLockedFeatures,
  getPersonalizedRecommendations,
  getUserPreferences,
  recordContentEngagement,
  updateUserPreferences,
  type PremiumTier,
} from '../../services/premium/premium-content.js';
import {
  addOurSong,
  designateAsOurSong,
  getOurSongCardData,
  getOurSongs,
  getOurSongStats,
  getRelationshipSoundtrack,
  getSongSuggestions,
  recordMeaningfulSong,
  recordSongPlayed,
} from '../../services/musical-you/our-song.js';

const log = getLogger();

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handlePremiumRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  searchParams: URLSearchParams
): Promise<boolean> {
  // Premium content routes
  if (pathname === '/api/premium/features') {
    return handleGetFeatures(req, res, searchParams);
  }

  if (pathname === '/api/premium/content') {
    return handleGetContent(req, res, searchParams);
  }

  if (pathname === '/api/premium/content/exclusive') {
    return handleGetExclusivePreview(req, res);
  }

  if (pathname === '/api/premium/recommendations') {
    return handleGetRecommendations(req, res, searchParams);
  }

  if (pathname === '/api/premium/preferences' && req.method === 'GET') {
    return handleGetPreferences(req, res, searchParams);
  }

  if (pathname === '/api/premium/preferences' && req.method === 'POST') {
    return handleUpdatePreferences(req, res);
  }

  if (pathname === '/api/premium/engagement' && req.method === 'POST') {
    return handleRecordEngagement(req, res);
  }

  // Our Song routes
  if (pathname === '/api/premium/our-songs' && req.method === 'GET') {
    return handleGetOurSongs(req, res, searchParams);
  }

  if (pathname === '/api/premium/our-songs' && req.method === 'POST') {
    return handleAddOurSong(req, res);
  }

  if (pathname === '/api/premium/our-songs/designate' && req.method === 'POST') {
    return handleDesignateOurSong(req, res);
  }

  if (pathname === '/api/premium/our-songs/suggestions') {
    return handleGetSongSuggestions(req, res, searchParams);
  }

  if (pathname === '/api/premium/our-songs/soundtrack') {
    return handleGetSoundtrack(req, res, searchParams);
  }

  if (pathname === '/api/premium/our-songs/stats') {
    return handleGetSongStats(req, res, searchParams);
  }

  if (pathname === '/api/premium/our-songs/card') {
    return handleGetOurSongCard(req, res, searchParams);
  }

  if (pathname === '/api/premium/our-songs/played' && req.method === 'POST') {
    return handleRecordSongPlayed(req, res);
  }

  return false;
}

// ============================================================================
// PREMIUM CONTENT HANDLERS
// ============================================================================

async function handleGetFeatures(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const tier = (searchParams.get('tier') as PremiumTier) || 'free';

  const available = getAvailableFeatures(tier);
  const locked = getLockedFeatures(tier);

  sendJSON(res, 200, {
    tier,
    available,
    locked,
    totalFeatures: available.length + locked.length,
  });

  return true;
}

async function handleGetContent(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const tier = (searchParams.get('tier') as PremiumTier) || 'free';
  const type = searchParams.get('type') || undefined;

  let content = getAvailableContent(tier);

  if (type) {
    content = content.filter((c) => c.type === type);
  }

  sendJSON(res, 200, {
    tier,
    content,
    total: content.length,
  });

  return true;
}

async function handleGetExclusivePreview(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const preview = getExclusiveContentPreview();

  sendJSON(res, 200, {
    exclusiveContent: preview,
    total: preview.length,
  });

  return true;
}

async function handleGetRecommendations(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const userId = searchParams.get('userId') || 'anonymous';
  const tier = (searchParams.get('tier') as PremiumTier) || 'free';
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const contentType = searchParams.get('type') as
    | 'video'
    | 'podcast'
    | 'guide'
    | 'course'
    | undefined;
  const topic = searchParams.get('topic') || undefined;

  const recommendations = getPersonalizedRecommendations(userId, tier, {
    limit,
    contentType,
    topic,
  });

  sendJSON(res, 200, {
    userId,
    tier,
    recommendations,
    total: recommendations.length,
  });

  return true;
}

async function handleGetPreferences(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const userId = searchParams.get('userId');
  if (!userId) {
    sendJSON(res, 400, { error: 'userId required' });
    return true;
  }

  const preferences = getUserPreferences(userId);

  sendJSON(res, 200, { preferences });
  return true;
}

async function handleUpdatePreferences(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const body = await parseBody(req);
  const userId = body.userId as string | undefined;
  const { userId: _, ...updates } = body;

  if (!userId) {
    sendJSON(res, 400, { error: 'userId required' });
    return true;
  }

  const preferences = updateUserPreferences(userId, updates);

  sendJSON(res, 200, { preferences });
  return true;
}

async function handleRecordEngagement(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseBody(req);
  const userId = body.userId as string | undefined;
  const contentId = body.contentId as string | undefined;
  const contentType = body.contentType as string | undefined;
  const watchedPercentage = body.watchedPercentage as number | undefined;
  const rating = body.rating as number | undefined;

  if (!userId || !contentId || !contentType) {
    sendJSON(res, 400, { error: 'userId, contentId, and contentType required' });
    return true;
  }

  recordContentEngagement(userId, contentId, contentType, watchedPercentage || 0, rating);

  sendJSON(res, 200, { success: true });
  return true;
}

// ============================================================================
// OUR SONG HANDLERS
// ============================================================================

async function handleGetOurSongs(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const userId = searchParams.get('userId');
  if (!userId) {
    sendJSON(res, 400, { error: 'userId required' });
    return true;
  }

  const songs = getOurSongs(userId);

  sendJSON(res, 200, {
    userId,
    songs,
    total: songs.length,
  });

  return true;
}

async function handleAddOurSong(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseBody(req);
  const userId = body.userId as string | undefined;
  const trackName = body.trackName as string | undefined;
  const artistName = body.artistName as string | undefined;
  const topic = body.topic as string | undefined;
  const emotionalTone = body.emotionalTone as string | undefined;
  const memory = body.memory as string | undefined;
  const keywords = body.keywords as string[] | undefined;
  const spotifyUri = body.spotifyUri as string | undefined;

  if (!userId || !trackName || !artistName) {
    sendJSON(res, 400, { error: 'userId, trackName, and artistName required' });
    return true;
  }

  const song = recordMeaningfulSong(
    userId,
    trackName,
    artistName,
    {
      topic: topic || 'general',
      emotionalTone:
        (emotionalTone as
          | 'joyful'
          | 'reflective'
          | 'comforting'
          | 'energizing'
          | 'nostalgic'
          | 'triumphant'
          | 'peaceful'
          | 'bittersweet') || 'reflective',
      memory: memory || `We listened to this together`,
      keywords,
    },
    spotifyUri
  );

  log.info({ userId, trackName }, '🎵 Our Song added via API');

  sendJSON(res, 200, { song });
  return true;
}

async function handleDesignateOurSong(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseBody(req);
  const userId = body.userId as string | undefined;
  const trackName = body.trackName as string | undefined;
  const artistName = body.artistName as string | undefined;
  const userNote = body.userNote as string | undefined;
  const spotifyUri = body.spotifyUri as string | undefined;

  if (!userId || !trackName || !artistName) {
    sendJSON(res, 400, { error: 'userId, trackName, and artistName required' });
    return true;
  }

  const song = designateAsOurSong(userId, trackName, artistName, userNote, spotifyUri);

  log.info({ userId, trackName }, '🎵 Song designated as "Our Song"');

  sendJSON(res, 200, { song });
  return true;
}

async function handleGetSongSuggestions(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const userId = searchParams.get('userId');
  if (!userId) {
    sendJSON(res, 400, { error: 'userId required' });
    return true;
  }

  const currentMood = searchParams.get('mood') || undefined;
  const conversationTopic = searchParams.get('topic') || undefined;
  const timeOfDay = searchParams.get('time') as
    | 'morning'
    | 'afternoon'
    | 'evening'
    | 'night'
    | undefined;
  const isMilestone = searchParams.get('milestone') === 'true';
  const keywords = searchParams.get('keywords')?.split(',') || undefined;

  const suggestions = getSongSuggestions(userId, {
    currentMood,
    conversationTopic,
    timeOfDay,
    isMilestone,
    keywords,
  });

  sendJSON(res, 200, {
    userId,
    suggestions,
    total: suggestions.length,
  });

  return true;
}

async function handleGetSoundtrack(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const userId = searchParams.get('userId');
  if (!userId) {
    sendJSON(res, 400, { error: 'userId required' });
    return true;
  }

  const soundtrack = getRelationshipSoundtrack(userId);

  sendJSON(res, 200, {
    userId,
    soundtrack,
    total: soundtrack.length,
  });

  return true;
}

async function handleGetSongStats(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const userId = searchParams.get('userId');
  if (!userId) {
    sendJSON(res, 400, { error: 'userId required' });
    return true;
  }

  const stats = getOurSongStats(userId);

  sendJSON(res, 200, { userId, stats });
  return true;
}

async function handleGetOurSongCard(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams
): Promise<boolean> {
  const userId = searchParams.get('userId');
  if (!userId) {
    sendJSON(res, 400, { error: 'userId required' });
    return true;
  }

  const cardData = getOurSongCardData(userId);

  sendJSON(res, 200, { cardData });
  return true;
}

async function handleRecordSongPlayed(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseBody(req);
  const userId = body.userId as string | undefined;
  const songId = body.songId as string | undefined;

  if (!userId || !songId) {
    sendJSON(res, 400, { error: 'userId and songId required' });
    return true;
  }

  recordSongPlayed(userId, songId);

  sendJSON(res, 200, { success: true });
  return true;
}

// ============================================================================
// UTILITIES
// ============================================================================

function sendJSON(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}
