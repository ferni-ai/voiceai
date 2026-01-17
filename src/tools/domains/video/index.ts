/**
 * Video Domain Tools
 *
 * Tools for YouTube video discovery.
 * Uses YouTube Data API v3 (requires API key).
 *
 * DOMAIN: video
 * TOOLS:
 *   Discovery: searchYouTube, getVideoRecommendations
 *   Trending: getTrendingVideos
 *   Details: getVideoDetails
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';

// Import video services
import {
  searchVideos,
  getVideoDetails,
  getTrendingVideos,
  getVideoRecommendations,
  getApiKeyConfigured,
  type YouTubeVideo,
  type VideoDuration,
} from '../../../services/video/index.js';

const log = getLogger();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
  return `${views} views`;
}

function formatVideoForSpeech(video: YouTubeVideo): string {
  const duration = video.durationSeconds ? ` (${formatDuration(video.durationSeconds)})` : '';
  const views = video.viewCount ? ` - ${formatViews(video.viewCount)}` : '';
  return `"${video.title}" by ${video.channelTitle}${duration}${views}`;
}

function formatVideoList(videos: YouTubeVideo[], limit = 5): string {
  const limited = videos.slice(0, limit);
  if (limited.length === 0) return 'No videos found.';

  if (limited.length === 1) {
    const video = limited[0];
    return `I found ${formatVideoForSpeech(video)}. Watch it here: ${video.url}`;
  }

  const formatted = limited.map((video, i) => `${i + 1}. ${formatVideoForSpeech(video)}`);
  return `Here are some videos:\n${formatted.join('\n')}`;
}

function checkApiConfigured(): string | null {
  if (!getApiKeyConfigured()) {
    return 'YouTube search is not configured. The YOUTUBE_API_KEY environment variable needs to be set.';
  }
  return null;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const searchYouTubeTool: ToolDefinition = {
  id: 'searchYouTube',
  name: 'Search YouTube',
  description: 'Search for videos on YouTube',
  domain: 'video',
  tags: ['video', 'youtube', 'discovery', 'search', 'entertainment'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Search for videos on YouTube by topic, title, or keyword. Can filter by duration (short: <4min, medium: 4-20min, long: >20min).',
      parameters: z.object({
        query: z.string().describe('Search query (topic, video title, or keyword)'),
        duration: z
          .enum(['short', 'medium', 'long', 'any'])
          .optional()
          .describe('Duration filter: short (<4min), medium (4-20min), long (>20min), any'),
        limit: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe('Maximum number of results (default: 5)'),
      }),
      execute: async ({ query, duration = 'any', limit = 5 }) => {
        const configError = checkApiConfigured();
        if (configError) return configError;

        log.info({ query, duration, limit }, 'Searching YouTube');

        try {
          const result = await searchVideos(query, {
            limit,
            duration: duration as VideoDuration,
          });

          if (!result.found || result.videos.length === 0) {
            return `Couldn't find videos matching "${query}". Try a different search?`;
          }

          return formatVideoList(result.videos, limit);
        } catch (error) {
          log.error({ error: String(error), query }, 'YouTube search failed');
          return "Sorry, I couldn't search YouTube right now. Try again in a moment?";
        }
      },
    });
  },
};

const getVideoRecommendationsTool: ToolDefinition = {
  id: 'getVideoRecommendations',
  name: 'Get Video Recommendations',
  description: 'Get YouTube video recommendations based on interests',
  domain: 'video',
  tags: ['video', 'youtube', 'recommendations', 'discovery'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get YouTube video recommendations based on user interests. Great for discovering new content.',
      parameters: z.object({
        interests: z
          .array(z.string())
          .describe('List of interests or topics (e.g., ["cooking", "Italian recipes"])'),
        duration: z
          .enum(['short', 'medium', 'long', 'any'])
          .optional()
          .describe('Duration filter: short (<4min), medium (4-20min), long (>20min), any'),
        limit: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe('Maximum number of results (default: 5)'),
      }),
      execute: async ({ interests, duration = 'any', limit = 5 }) => {
        const configError = checkApiConfigured();
        if (configError) return configError;

        log.info({ interests, duration, limit }, 'Getting video recommendations');

        try {
          const result = await getVideoRecommendations(interests, {
            limit,
            duration: duration as VideoDuration,
          });

          if (!result.found || result.videos.length === 0) {
            return `Couldn't find videos matching your interests. Try different topics?`;
          }

          const intro = `Based on your interest in ${interests.join(', ')}:`;
          return `${intro}\n${formatVideoList(result.videos, limit)}`;
        } catch (error) {
          log.error({ error: String(error), interests }, 'Video recommendations failed');
          return "Sorry, I couldn't get recommendations right now. Try again?";
        }
      },
    });
  },
};

const getTrendingVideosTool: ToolDefinition = {
  id: 'getTrendingVideos',
  name: 'Get Trending Videos',
  description: 'Get trending/popular videos on YouTube',
  domain: 'video',
  tags: ['video', 'youtube', 'trending', 'popular'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get trending and popular videos on YouTube. Can filter by category like music, gaming, entertainment, news, howto, education, science, sports, film, or comedy.',
      parameters: z.object({
        category: z
          .string()
          .optional()
          .describe(
            'Category filter (music, gaming, entertainment, news, howto, education, science, sports, film, comedy)'
          ),
        limit: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe('Maximum number of results (default: 5)'),
      }),
      execute: async ({ category, limit = 5 }) => {
        const configError = checkApiConfigured();
        if (configError) return configError;

        log.info({ category, limit }, 'Getting trending videos');

        try {
          const result = await getTrendingVideos({ category, limit });

          if (!result.found || result.videos.length === 0) {
            return category
              ? `Couldn't find trending ${category} videos. Try a different category?`
              : "Couldn't find trending videos right now.";
          }

          const intro = category ? `Trending ${category} videos:` : "What's trending on YouTube:";
          return `${intro}\n${formatVideoList(result.videos, limit)}`;
        } catch (error) {
          log.error({ error: String(error), category }, 'Trending videos fetch failed');
          return "Sorry, I couldn't get trending videos. Try again?";
        }
      },
    });
  },
};

const getVideoDetailsTool: ToolDefinition = {
  id: 'getVideoDetails',
  name: 'Get Video Details',
  description: 'Get detailed information about a specific YouTube video',
  domain: 'video',
  tags: ['video', 'youtube', 'details', 'info'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get detailed information about a specific YouTube video including duration, view count, and description.',
      parameters: z.object({
        videoId: z.string().describe('The YouTube video ID'),
      }),
      execute: async ({ videoId }) => {
        const configError = checkApiConfigured();
        if (configError) return configError;

        log.info({ videoId }, 'Getting video details');

        try {
          const result = await getVideoDetails(videoId);

          if (!result.found || !result.video) {
            return "Couldn't find that video. It might be unavailable or private.";
          }

          const video = result.video;
          const duration = video.durationSeconds
            ? `Duration: ${formatDuration(video.durationSeconds)}`
            : '';
          const views = video.viewCount ? `Views: ${formatViews(video.viewCount)}` : '';
          const likes = video.likeCount ? `Likes: ${video.likeCount.toLocaleString()}` : '';

          const details = [
            `"${video.title}" by ${video.channelTitle}`,
            duration,
            views,
            likes,
            video.description ? `\nDescription: ${video.description.slice(0, 200)}...` : '',
            `\nWatch: ${video.url}`,
          ]
            .filter(Boolean)
            .join('\n');

          return details;
        } catch (error) {
          log.error({ error: String(error), videoId }, 'Video details fetch failed');
          return "Sorry, I couldn't get video details. Try again?";
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const videoTools: ToolDefinition[] = [
  searchYouTubeTool,
  getVideoRecommendationsTool,
  getTrendingVideosTool,
  getVideoDetailsTool,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport('video', videoTools);

export default getToolDefinitions;
