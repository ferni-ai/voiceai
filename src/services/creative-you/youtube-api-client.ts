/**
 * 📺 YouTube Data API v3 Client
 *
 * Live content discovery from YouTube for Creative You.
 * Supplements curated content with fresh, relevant videos.
 *
 * Uses GOOGLE_API_KEY from environment (same key as other Google APIs).
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Quality filtering (view count, engagement ratio)
 * - Safety filtering (educational channels only by default)
 * - Caching to respect rate limits
 * - Discussion prompt generation for discovered videos
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getConfig } from '../../config/environment.js';
import type { VideoCategory, YouTubeVideo, VideoRecommendation } from './youtube-integration.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface YouTubeSearchResult {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: Array<{
    kind: string;
    etag: string;
    id: {
      kind: string;
      videoId?: string;
      channelId?: string;
      playlistId?: string;
    };
    snippet: {
      publishedAt: string;
      channelId: string;
      title: string;
      description: string;
      thumbnails: {
        default: { url: string; width: number; height: number };
        medium: { url: string; width: number; height: number };
        high: { url: string; width: number; height: number };
      };
      channelTitle: string;
      liveBroadcastContent: string;
    };
  }>;
}

interface YouTubeVideoDetails {
  kind: string;
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      channelId: string;
      channelTitle: string;
      thumbnails: {
        maxres?: { url: string };
        high?: { url: string };
        medium?: { url: string };
      };
      tags?: string[];
      categoryId: string;
      publishedAt: string;
    };
    contentDetails: {
      duration: string; // ISO 8601 format (PT5M30S)
    };
    statistics: {
      viewCount: string;
      likeCount: string;
      commentCount: string;
    };
  }>;
}

interface SearchOptions {
  query: string;
  maxResults?: number;
  category?: VideoCategory;
  durationFilter?: 'short' | 'medium' | 'long';
  publishedAfter?: Date;
  safeSearch?: 'none' | 'moderate' | 'strict';
  relevanceLanguage?: string;
}

interface DiscoveredVideo extends YouTubeVideo {
  discoveredAt: Date;
  relevanceScore: number;
  generatedPrompts: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Trusted educational channels (IDs)
const TRUSTED_CHANNELS = new Set([
  'UCAuUUnT6oDeKwE6v1NGQxug', // TED
  'UCsT0YIqwnpJCM-mx7-gSA4Q', // TEDx Talks
  'UCsooa4yRKGN_zEE8iknghZA', // TED-Ed
  'UCWOA1ZGywLbqmigxE4Qlvuw', // Kurzgesagt
  'UC6nSFpj9HTCZ5t-N3Rm3-HA', // Vsauce
  'UCHnyfMqiRRG1u-2MsSQLbXA', // Veritasium
  'UCJ0-OtVpF0wOKEqT2Z1HEtA', // School of Life
  'UCGLupLv3TQX5bFYR0JIg9Tw', // Huberman Lab
  'UCN4vyryy6O4GlIXcXTIuZQQ', // Headspace
  'UC9-y-6csu5WGm29I7JiwpnA', // Computerphile
  'UCX6OQ3DkcsbYNE6H8uQQuVA', // MrSuicideSheep
  'UCW5YeuERMmlnqo4oq8vGKuA', // Traversy Media
  'UC8butISFwT-Wl7EV0hUK0BQ', // freeCodeCamp
  'UCvjgEDvShRsADYJq4rPuxTA', // Goalcast
  'UCVHFbqXqoYvEWM1Ddxl0QKg', // Big Think
  'UCX6b17PVsYBQ0ip5gyeme-Q', // CrashCourse
  'UConVfxXodg78Tzh5nNu85Ew', // Wisecrack
  'UCLXo7UDZvByw2ixzpQCufnA', // Vox
  'UCNYkR63-8q2RaXN5sNvMqww', // Improvement Pill
  'UCMb0O2CdPBNi-QqPk5T3gsQ', // James Clear
]);

// Topic to search query mapping
const TOPIC_SEARCH_QUERIES: Record<string, string[]> = {
  anxiety: ['anxiety management techniques', 'calm anxiety naturally', 'mindfulness for anxiety'],
  stress: ['stress relief techniques', 'manage work stress', 'stress management tips'],
  productivity: ['productivity tips', 'focus techniques', 'deep work strategies'],
  creativity: ['unlock creativity', 'creative thinking', 'boost creativity'],
  relationships: ['healthy relationships', 'communication skills', 'relationship advice'],
  sleep: ['improve sleep quality', 'sleep science', 'better sleep habits'],
  habits: ['habit formation', 'build good habits', 'break bad habits'],
  motivation: ['motivation techniques', 'stay motivated', 'find your purpose'],
  mindfulness: ['mindfulness meditation', 'present moment awareness', 'mindfulness exercises'],
  philosophy: ['philosophy of life', 'stoicism explained', 'existentialism meaning'],
  career: ['career growth', 'professional development', 'career advice'],
  health: ['health tips', 'wellness habits', 'healthy lifestyle'],
  finances: ['personal finance', 'money management', 'financial literacy'],
  leadership: ['leadership skills', 'become a leader', 'leadership principles'],
};

// Simple in-memory cache (would use Redis in production)
const searchCache = new Map<string, { results: DiscoveredVideo[]; cachedAt: Date }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour cache

// ============================================================================
// API CLIENT
// ============================================================================

/**
 * Get the YouTube API key from environment
 */
function getApiKey(): string | null {
  try {
    const config = getConfig();
    return config.apis.googleApiKey || null;
  } catch {
    return process.env.GOOGLE_API_KEY || null;
  }
}

/**
 * Search YouTube for videos
 */
async function searchVideos(options: SearchOptions): Promise<YouTubeSearchResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    log.warn('YouTube API key not configured');
    return null;
  }

  const params = new URLSearchParams({
    part: 'snippet',
    q: options.query,
    type: 'video',
    maxResults: String(options.maxResults || 10),
    safeSearch: options.safeSearch || 'moderate',
    relevanceLanguage: options.relevanceLanguage || 'en',
    videoEmbeddable: 'true',
    key: apiKey,
  });

  // Duration filter
  if (options.durationFilter) {
    const durationMap = {
      short: 'short', // < 4 minutes
      medium: 'medium', // 4-20 minutes
      long: 'long', // > 20 minutes
    };
    params.set('videoDuration', durationMap[options.durationFilter]);
  }

  // Published after
  if (options.publishedAfter) {
    params.set('publishedAfter', options.publishedAfter.toISOString());
  }

  try {
    const url = `${YOUTUBE_API_BASE}/search?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      log.error({ status: response.status }, 'YouTube search failed');
      return null;
    }

    return (await response.json()) as YouTubeSearchResult;
  } catch (error) {
    log.error({ error }, 'YouTube API error');
    return null;
  }
}

/**
 * Get video details (duration, stats)
 */
async function getVideoDetails(videoIds: string[]): Promise<YouTubeVideoDetails | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    id: videoIds.join(','),
    key: apiKey,
  });

  try {
    const url = `${YOUTUBE_API_BASE}/videos?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      log.error({ status: response.status }, 'YouTube video details failed');
      return null;
    }

    return (await response.json()) as YouTubeVideoDetails;
  } catch (error) {
    log.error({ error }, 'YouTube API error');
    return null;
  }
}

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Calculate engagement score (likes / views)
 */
function calculateEngagement(likes: number, views: number): number {
  if (views === 0) return 0;
  return (likes / views) * 100;
}

/**
 * Determine video category from search query/tags
 */
function inferCategory(query: string, tags: string[] = []): VideoCategory {
  const allText = (query + ' ' + tags.join(' ')).toLowerCase();

  if (allText.includes('ted') || allText.includes('talk')) return 'ted-talk';
  if (allText.includes('documentary')) return 'documentary';
  if (allText.includes('tutorial') || allText.includes('how to')) return 'tutorial';
  if (allText.includes('meditation') || allText.includes('mindfulness')) return 'mindfulness';
  if (allText.includes('science') || allText.includes('physics')) return 'science';
  if (allText.includes('philosophy') || allText.includes('stoic')) return 'philosophy';
  if (allText.includes('motivation') || allText.includes('inspire')) return 'inspiration';
  if (allText.includes('self') || allText.includes('habit') || allText.includes('productivity'))
    return 'self-improvement';

  return 'educational';
}

/**
 * Generate discussion prompts based on video title/description
 */
function generateDiscussionPrompts(title: string, description: string): string[] {
  const prompts: string[] = [];

  // Generic prompts that work for most content
  prompts.push("What stood out to you most in this video?");
  prompts.push("How does this connect to something in your own life?");

  // Topic-specific prompts
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();
  const combined = lowerTitle + ' ' + lowerDesc;

  if (combined.includes('habit') || combined.includes('routine')) {
    prompts.push("What's one habit from this you'd want to try?");
  }
  if (combined.includes('anxiety') || combined.includes('stress')) {
    prompts.push("What technique from this would help you most right now?");
  }
  if (combined.includes('productivity') || combined.includes('focus')) {
    prompts.push("What's one thing blocking your productivity that this might help with?");
  }
  if (combined.includes('relationship') || combined.includes('communication')) {
    prompts.push("Who in your life would you apply these ideas with?");
  }
  if (combined.includes('purpose') || combined.includes('meaning')) {
    prompts.push("How does this change how you think about what matters?");
  }

  return prompts.slice(0, 3);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Discover fresh videos for a topic
 */
export async function discoverVideosForTopic(
  topic: string,
  options: {
    maxResults?: number;
    trustedChannelsOnly?: boolean;
    minViews?: number;
    minEngagement?: number;
    durationFilter?: 'short' | 'medium' | 'long';
  } = {}
): Promise<DiscoveredVideo[]> {
  const {
    maxResults = 5,
    trustedChannelsOnly = true,
    minViews = 10000,
    minEngagement = 2.0, // 2% like ratio
    durationFilter = 'medium',
  } = options;

  // Check cache first
  const cacheKey = `${topic}-${maxResults}-${trustedChannelsOnly}-${durationFilter}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt.getTime() < CACHE_TTL_MS) {
    log.debug({ topic, cacheHit: true }, 'Returning cached YouTube results');
    return cached.results;
  }

  // Get search queries for this topic
  const searchQueries = TOPIC_SEARCH_QUERIES[topic.toLowerCase()] || [topic];
  const discoveredVideos: DiscoveredVideo[] = [];

  for (const query of searchQueries.slice(0, 2)) {
    // Limit API calls
    const searchResults = await searchVideos({
      query,
      maxResults: 10,
      durationFilter,
      safeSearch: 'moderate',
    });

    if (!searchResults || searchResults.items.length === 0) continue;

    // Get video IDs for detail lookup
    const videoIds = searchResults.items
      .filter((item) => item.id.videoId)
      .map((item) => item.id.videoId as string);

    if (videoIds.length === 0) continue;

    // Get full video details
    const details = await getVideoDetails(videoIds);
    if (!details) continue;

    // Process each video
    for (const video of details.items) {
      const viewCount = parseInt(video.statistics.viewCount || '0');
      const likeCount = parseInt(video.statistics.likeCount || '0');
      const engagement = calculateEngagement(likeCount, viewCount);

      // Quality filters
      if (viewCount < minViews) continue;
      if (engagement < minEngagement) continue;
      if (trustedChannelsOnly && !TRUSTED_CHANNELS.has(video.snippet.channelId)) continue;

      const durationSeconds = parseDuration(video.contentDetails.duration);

      // Skip very short or very long videos
      if (durationSeconds < 120 || durationSeconds > 3600) continue;

      const thumbnail =
        video.snippet.thumbnails.maxres?.url ||
        video.snippet.thumbnails.high?.url ||
        video.snippet.thumbnails.medium?.url ||
        '';

      const discoveredVideo: DiscoveredVideo = {
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description.slice(0, 500),
        channelId: video.snippet.channelId,
        channelTitle: video.snippet.channelTitle,
        thumbnailUrl: thumbnail,
        duration: video.contentDetails.duration,
        durationSeconds,
        publishedAt: video.snippet.publishedAt,
        viewCount,
        likeCount,
        category: inferCategory(query, video.snippet.tags),
        tags: video.snippet.tags || [],
        discoveredAt: new Date(),
        relevanceScore: engagement / 10 + Math.log10(viewCount) / 10,
        generatedPrompts: generateDiscussionPrompts(video.snippet.title, video.snippet.description),
      };

      discoveredVideos.push(discoveredVideo);
    }
  }

  // Sort by relevance and limit
  discoveredVideos.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const results = discoveredVideos.slice(0, maxResults);

  // Cache results
  searchCache.set(cacheKey, { results, cachedAt: new Date() });

  log.info(
    {
      topic,
      discovered: results.length,
      queries: searchQueries.slice(0, 2),
    },
    '🔍 Discovered fresh YouTube content'
  );

  return results;
}

/**
 * Convert discovered video to recommendation format
 */
export function discoveredToRecommendation(
  video: DiscoveredVideo,
  relevantTopic?: string
): VideoRecommendation {
  const mood = inferMood(video.category);

  return {
    video: {
      id: video.id,
      title: video.title,
      description: video.description,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      durationSeconds: video.durationSeconds,
      publishedAt: video.publishedAt,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      category: video.category,
      tags: video.tags,
    },
    reason: relevantTopic
      ? `Fresh content about ${relevantTopic} I found for you`
      : `Discovered this based on your interests`,
    discussionPrompts: video.generatedPrompts,
    relevantTopic,
    mood,
  };
}

/**
 * Infer mood from category
 */
function inferMood(category: VideoCategory): 'learn' | 'chill' | 'inspire' | 'reflect' {
  switch (category) {
    case 'mindfulness':
    case 'music-video':
      return 'chill';
    case 'ted-talk':
    case 'inspiration':
      return 'inspire';
    case 'philosophy':
      return 'reflect';
    default:
      return 'learn';
  }
}

/**
 * Search for videos matching a user query
 */
export async function searchYouTubeVideos(
  query: string,
  options: {
    maxResults?: number;
    trustedChannelsOnly?: boolean;
  } = {}
): Promise<VideoRecommendation[]> {
  const discovered = await discoverVideosForTopic(query, {
    ...options,
    trustedChannelsOnly: options.trustedChannelsOnly ?? false, // Allow broader search for explicit queries
  });

  return discovered.map((v) => discoveredToRecommendation(v, query));
}

/**
 * Check if YouTube API is available
 */
export function isYouTubeApiAvailable(): boolean {
  return !!getApiKey();
}

/**
 * Clear the search cache
 */
export function clearYouTubeCache(): void {
  searchCache.clear();
  log.info('YouTube search cache cleared');
}

// ============================================================================
// EXPORTS
// ============================================================================

export { TRUSTED_CHANNELS, TOPIC_SEARCH_QUERIES };

