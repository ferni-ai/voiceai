/**
 * 🎨 Creative You API Routes
 *
 * Endpoints for the Creative You feature:
 * - Video recommendations
 * - Podcast discovery
 * - Watch sessions
 * - Creative DNA
 * - Insights
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import {
  getVideoRecommendations,
  getVideoById,
  getDailyVideoPick,
  startWatchSession,
  completeWatchSession,
  getWatchHistory,
  getYouTubeEmbedUrl,
} from '../../services/creative-you/youtube-integration.js';
import {
  getPodcastRecommendations,
  getPodcastById,
  getEpisodeById,
  getDailyPodcastPick,
  getLearningTracks,
  getLearningTrackById,
} from '../../services/creative-you/podcast-discovery.js';
import {
  getCreativeDNA,
  updateCreativeDNA,
  saveInsight,
  getInsights,
  getCreativeJourneyStats,
  getCreativeProfileCardData,
} from '../../services/creative-you/creative-dna.js';

const log = getLogger();

/**
 * Handle Creative You API routes
 */
export async function handleCreativeYouRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: Record<string, string | string[]>
): Promise<boolean> {
  // Only handle /api/creative/* routes
  if (!pathname.startsWith('/api/creative')) {
    return false;
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  const method = req.method || 'GET';

  try {
    // ========================================
    // VIDEO ROUTES
    // ========================================

    // GET /api/creative/videos/recommendations?userId=xxx&mood=learn&maxResults=5
    if (pathname === '/api/creative/videos/recommendations' && method === 'GET') {
      const userId = (query?.userId as string) || '';
      const mood = query?.mood as 'learn' | 'chill' | 'inspire' | 'reflect' | undefined;
      const maxResults = parseInt((query?.maxResults as string) || '5');
      const topic = query?.topic as string | undefined;

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const recommendations = getVideoRecommendations(userId, {
        mood,
        topic,
        maxResults,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ recommendations }));
      return true;
    }

    // GET /api/creative/videos/daily?userId=xxx
    if (pathname === '/api/creative/videos/daily' && method === 'GET') {
      const userId = (query?.userId as string) || '';

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const pick = getDailyVideoPick(userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ dailyPick: pick }));
      return true;
    }

    // GET /api/creative/videos/:videoId
    if (pathname.match(/^\/api\/creative\/videos\/[^/]+$/) && method === 'GET') {
      const videoId = pathname.split('/').pop() || '';
      const video = getVideoById(videoId);

      if (!video) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Video not found' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          video,
          embedUrl: getYouTubeEmbedUrl(video.id),
        })
      );
      return true;
    }

    // ========================================
    // WATCH SESSION ROUTES
    // ========================================

    // POST /api/creative/watch/start
    if (pathname === '/api/creative/watch/start' && method === 'POST') {
      const body = await parseBody(req);
      const userId = body.userId as string | undefined;
      const videoId = body.videoId as string | undefined;

      if (!userId || !videoId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId or videoId' }));
        return true;
      }

      const session = startWatchSession(userId, videoId);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Video not found' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session }));
      return true;
    }

    // POST /api/creative/watch/complete
    if (pathname === '/api/creative/watch/complete' && method === 'POST') {
      const body = await parseBody(req);
      const userId = body.userId as string | undefined;
      const sessionId = body.sessionId as string | undefined;

      if (!userId || !sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId or sessionId' }));
        return true;
      }

      const session = completeWatchSession(userId, sessionId);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return true;
      }

      // Update Creative DNA
      updateCreativeDNA(userId, {
        type: 'video_watched',
        category: session.video.category,
        topics: session.video.tags,
        completionPercent: session.percentWatched,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session, message: 'Watch session completed!' }));
      return true;
    }

    // GET /api/creative/watch/history?userId=xxx
    if (pathname === '/api/creative/watch/history' && method === 'GET') {
      const userId = (query?.userId as string) || '';
      const limit = parseInt((query?.limit as string) || '20');

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const history = getWatchHistory(userId, limit);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ history }));
      return true;
    }

    // ========================================
    // PODCAST ROUTES
    // ========================================

    // GET /api/creative/podcasts/recommendations?userId=xxx&mood=learn
    if (pathname === '/api/creative/podcasts/recommendations' && method === 'GET') {
      const userId = (query?.userId as string) || '';
      const mood = query?.mood as 'learn' | 'chill' | 'inspire' | 'reflect' | undefined;
      const maxResults = parseInt((query?.maxResults as string) || '5');
      const maxDuration = query?.maxDuration
        ? parseInt(query.maxDuration as string)
        : undefined;

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const recommendations = getPodcastRecommendations(userId, {
        mood,
        maxResults,
        maxDuration,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ recommendations }));
      return true;
    }

    // GET /api/creative/podcasts/daily?userId=xxx
    if (pathname === '/api/creative/podcasts/daily' && method === 'GET') {
      const userId = (query?.userId as string) || '';

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const pick = getDailyPodcastPick(userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ dailyPick: pick }));
      return true;
    }

    // GET /api/creative/podcasts/:podcastId
    if (pathname.match(/^\/api\/creative\/podcasts\/[^/]+$/) && method === 'GET') {
      const podcastId = pathname.split('/').pop() || '';

      // Check if it's an episode or podcast
      const episode = getEpisodeById(podcastId);
      if (episode) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ episode }));
        return true;
      }

      const podcast = getPodcastById(podcastId);
      if (podcast) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ podcast }));
        return true;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Podcast not found' }));
      return true;
    }

    // ========================================
    // LEARNING TRACKS ROUTES
    // ========================================

    // GET /api/creative/tracks
    if (pathname === '/api/creative/tracks' && method === 'GET') {
      const tracks = getLearningTracks();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tracks }));
      return true;
    }

    // GET /api/creative/tracks/:trackId
    if (pathname.match(/^\/api\/creative\/tracks\/[^/]+$/) && method === 'GET') {
      const trackId = pathname.split('/').pop() || '';
      const track = getLearningTrackById(trackId);

      if (!track) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Track not found' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ track }));
      return true;
    }

    // ========================================
    // CREATIVE DNA ROUTES
    // ========================================

    // GET /api/creative/dna?userId=xxx
    if (pathname === '/api/creative/dna' && method === 'GET') {
      const userId = (query?.userId as string) || '';

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const dna = getCreativeDNA(userId);
      const stats = getCreativeJourneyStats(userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ dna, stats }));
      return true;
    }

    // GET /api/creative/dna/card?userId=xxx
    if (pathname === '/api/creative/dna/card' && method === 'GET') {
      const userId = (query?.userId as string) || '';

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const cardData = getCreativeProfileCardData(userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cardData }));
      return true;
    }

    // ========================================
    // INSIGHTS ROUTES
    // ========================================

    // POST /api/creative/insights
    if (pathname === '/api/creative/insights' && method === 'POST') {
      const body = await parseBody(req);
      const userId = body.userId as string | undefined;
      const content = body.content as string | undefined;
      const source = body.source as {
        type: 'video' | 'podcast' | 'conversation';
        id: string;
        title: string;
      } | undefined;
      const tags = (body.tags as string[]) || [];

      if (!userId || !content || !source) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return true;
      }

      const insight = saveInsight(userId, {
        userId,
        content,
        source,
        tags,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ insight }));
      return true;
    }

    // GET /api/creative/insights?userId=xxx
    if (pathname === '/api/creative/insights' && method === 'GET') {
      const userId = (query?.userId as string) || '';
      const limit = parseInt((query?.limit as string) || '50');
      const topic = query?.topic as string | undefined;

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const insights = getInsights(userId, { limit, topic });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ insights }));
      return true;
    }

    // Route not found
    return false;
  } catch (error) {
    log.error({ error, pathname }, '🎨 Creative You route error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return true;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

