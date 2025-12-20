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
import {
  getIntelligentRecommendations,
  generateLearningTrackForUser,
} from '../../services/creative-you/intelligent-curator.js';
import {
  discoverVideosForTopic,
  searchYouTubeVideos,
  isYouTubeApiAvailable,
} from '../../services/creative-you/youtube-api-client.js';

const log = getLogger();

// ============================================================================
// WARM ERROR MESSAGES (Brand-compliant - friendly, not technical)
// ============================================================================

const WARM_ERRORS = {
  missingUserId: "Hmm, I'm not sure who you are. Try refreshing?",
  videoNotFound: "Can't find that video. It might have been removed.",
  sessionNotFound: "Lost track of where we were. Want to start fresh?",
  youtubeUnavailable: "Can't reach YouTube right now. Try the curated picks instead?",
  trackNotFound: "That learning track isn't available right now.",
  couldNotGenerateTrack: "Couldn't find enough content for those topics. Try something else?",
  internalError: "Something went wrong on my end. Mind trying again?",
} as const;

/**
 * Handle Creative You API routes
 */
export async function handleCreativeYouRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  searchParams: URLSearchParams
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
      const userId = searchParams.get('userId') || '';
      const mood = searchParams.get('mood') as
        | 'learn'
        | 'chill'
        | 'inspire'
        | 'reflect'
        | undefined;
      const maxResults = parseInt(searchParams.get('maxResults') || '5');
      const topic = searchParams.get('topic') || undefined;

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
      const userId = searchParams.get('userId') || '';

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
        res.end(JSON.stringify({ error: WARM_ERRORS.videoNotFound }));
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
      const userId = searchParams.get('userId') || '';
      const limit = parseInt(searchParams.get('limit') || '20');

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
      const userId = searchParams.get('userId') || '';
      const mood = searchParams.get('mood') as
        | 'learn'
        | 'chill'
        | 'inspire'
        | 'reflect'
        | undefined;
      const maxResults = parseInt(searchParams.get('maxResults') || '5');
      const maxDurationParam = searchParams.get('maxDuration');
      const maxDuration = maxDurationParam ? parseInt(maxDurationParam) : undefined;

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
      const userId = searchParams.get('userId') || '';

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
        // Get discussion prompts from curated episodes
        const { CURATED_EPISODES } = await import(
          '../../services/creative-you/podcast-discovery.js'
        );
        const curatedEpisode = CURATED_EPISODES.find((e) => e.id === podcastId);
        const discussionPrompts = curatedEpisode?.discussionPrompts || [];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ episode, discussionPrompts }));
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
    // YOUTUBE LIVE SEARCH (Fresh Content)
    // ========================================

    // GET /api/creative/youtube/search?query=productivity&maxResults=5
    if (pathname === '/api/creative/youtube/search' && method === 'GET') {
      if (!isYouTubeApiAvailable()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: WARM_ERRORS.youtubeUnavailable }));
        return true;
      }

      const query = searchParams.get('query') || '';
      const maxResults = parseInt(searchParams.get('maxResults') || '5');
      const trustedOnly = searchParams.get('trustedOnly') !== 'false';

      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing query parameter' }));
        return true;
      }

      const videos = await searchYouTubeVideos(query, {
        maxResults,
        trustedChannelsOnly: trustedOnly,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ videos, source: 'youtube_api' }));
      return true;
    }

    // GET /api/creative/youtube/discover?topic=anxiety&maxResults=5
    if (pathname === '/api/creative/youtube/discover' && method === 'GET') {
      if (!isYouTubeApiAvailable()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: WARM_ERRORS.youtubeUnavailable }));
        return true;
      }

      const topic = searchParams.get('topic') || '';
      const maxResults = parseInt(searchParams.get('maxResults') || '5');
      const trustedOnly = searchParams.get('trustedOnly') !== 'false';

      if (!topic) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing topic parameter' }));
        return true;
      }

      const videos = await discoverVideosForTopic(topic, {
        maxResults,
        trustedChannelsOnly: trustedOnly,
        minViews: 10000,
        durationFilter: 'medium',
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          videos,
          topic,
          source: 'youtube_api',
        })
      );
      return true;
    }

    // GET /api/creative/youtube/status - Check if YouTube API is available
    if (pathname === '/api/creative/youtube/status' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          available: isYouTubeApiAvailable(),
          message: isYouTubeApiAvailable()
            ? 'YouTube API is configured and ready'
            : 'YouTube API key not configured (GOOGLE_API_KEY)',
        })
      );
      return true;
    }

    // ========================================
    // INTELLIGENT RECOMMENDATIONS (AI-Powered)
    // ========================================

    // GET /api/creative/intelligent?userId=xxx&topics=creativity,productivity&mood=learn
    if (pathname === '/api/creative/intelligent' && method === 'GET') {
      const userId = searchParams.get('userId') || '';
      const topicsParam = searchParams.get('topics') || '';
      const recentTopics = topicsParam ? topicsParam.split(',').map((t) => t.trim()) : [];
      const mood = searchParams.get('mood') as
        | 'learn'
        | 'chill'
        | 'inspire'
        | 'reflect'
        | undefined;
      const count = parseInt(searchParams.get('count') || '5');
      const preferVideos = searchParams.get('preferVideos') === 'true';
      const preferPodcasts = searchParams.get('preferPodcasts') === 'true';

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId parameter' }));
        return true;
      }

      const recommendations = await getIntelligentRecommendations(userId, recentTopics, {
        count,
        mood,
        preferVideos,
        preferPodcasts,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          recommendations,
          meta: {
            basedOnTopics: recentTopics,
            mood: mood || 'auto',
            count: recommendations.length,
          },
        })
      );
      return true;
    }

    // POST /api/creative/intelligent/track - Generate personalized learning track
    if (pathname === '/api/creative/intelligent/track' && method === 'POST') {
      const body = await parseBody(req);
      const userId = body.userId as string | undefined;
      const topics = (body.topics as string[]) || [];

      if (!userId || topics.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId or topics' }));
        return true;
      }

      const track = generateLearningTrackForUser(userId, topics);

      if (!track) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: WARM_ERRORS.couldNotGenerateTrack,
            suggestion: 'Try topics like: productivity, creativity, anxiety, relationships',
          })
        );
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ track }));
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
        res.end(JSON.stringify({ error: WARM_ERRORS.trackNotFound }));
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
      const userId = searchParams.get('userId') || '';

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
      const userId = searchParams.get('userId') || '';

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
      const source = body.source as
        | {
            type: 'video' | 'podcast' | 'conversation';
            id: string;
            title: string;
          }
        | undefined;
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
      const userId = searchParams.get('userId') || '';
      const limit = parseInt(searchParams.get('limit') || '50');
      const topic = searchParams.get('topic') || undefined;

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
    res.end(JSON.stringify({ error: WARM_ERRORS.internalError }));
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
