/**
 * YouTube Search Service
 *
 * Provides YouTube video discovery using the YouTube Data API v3.
 * API key optional - works with limited functionality without it.
 *
 * API Documentation: https://developers.google.com/youtube/v3/docs/search/list
 */
import { CircuitOpenError, getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getSlidingWindowLimiter } from '../../utils/rate-limiter.js';
const log = createLogger({ module: 'YouTubeSearch' });
// Circuit breaker for YouTube API
const youtubeCircuitBreaker = getCircuitBreaker('youtube-api', {
    failureThreshold: 5,
    resetTimeout: 30000, // Longer reset due to quota limits
    successThreshold: 1,
});
// Rate limiter for YouTube API
// YouTube API has daily quota (10,000 units free). Search = 100 units, videos = 1 unit.
// Conservative: 50 requests per minute to spread quota across the day (~7200 total/day)
const youtubeRateLimiter = getSlidingWindowLimiter('youtube-data-api', 50, 60000);
// ============================================================================
// CONFIGURATION
// ============================================================================
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
function getApiKey() {
    return process.env.YOUTUBE_API_KEY;
}
/**
 * Parse ISO 8601 duration to seconds.
 * e.g., "PT4M13S" -> 253, "PT1H30M" -> 5400
 */
function parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match)
        return 0;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    return hours * 3600 + minutes * 60 + seconds;
}
// ============================================================================
// YOUTUBE API
// ============================================================================
/**
 * Search for videos on YouTube.
 */
export async function searchVideos(query, options = {}) {
    const { limit = 10, duration = 'any', safeSearch = 'moderate', pageToken } = options;
    const apiKey = getApiKey();
    if (!apiKey) {
        log.warn('YOUTUBE_API_KEY not configured');
        return {
            found: false,
            videos: [],
            error: 'YouTube API not configured. Set YOUTUBE_API_KEY environment variable.',
        };
    }
    if (!youtubeCircuitBreaker.canRequest()) {
        log.warn({ query }, 'YouTube circuit breaker is OPEN');
        return { found: false, videos: [], error: 'Service temporarily unavailable' };
    }
    // Check rate limiter (search costs 100 units, treat as 1 request)
    if (!youtubeRateLimiter.tryRequest()) {
        const waitTime = youtubeRateLimiter.getResetTime();
        log.warn({ query, waitTimeMs: waitTime }, 'YouTube rate limit exceeded');
        return { found: false, videos: [], error: 'Rate limit exceeded. Please try again shortly.' };
    }
    // Build URL with parameters
    const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: String(limit),
        safeSearch,
        key: apiKey,
    });
    // Add duration filter
    if (duration !== 'any') {
        params.set('videoDuration', duration);
    }
    if (pageToken) {
        params.set('pageToken', pageToken);
    }
    const url = `${YOUTUBE_API_BASE}/search?${params}`;
    log.info({ query, limit, duration }, 'Searching YouTube videos');
    try {
        const data = await youtubeCircuitBreaker.execute(async () => {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`YouTube API error: ${response.status} - ${JSON.stringify(errorData)}`);
            }
            return (await response.json());
        });
        if (data.error) {
            return { found: false, videos: [], error: data.error.message };
        }
        if (!data.items || data.items.length === 0) {
            return {
                found: false,
                videos: [],
                error: `Couldn't find videos matching "${query}"`,
            };
        }
        const videos = data.items.map((item) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            channelTitle: item.snippet.channelTitle,
            channelId: item.snippet.channelId,
            publishedAt: item.snippet.publishedAt,
            thumbnailUrl: item.snippet.thumbnails.high?.url ||
                item.snippet.thumbnails.medium?.url ||
                item.snippet.thumbnails.default?.url ||
                '',
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        }));
        log.info({ query, resultCount: videos.length }, 'YouTube search complete');
        return {
            found: true,
            videos,
            nextPageToken: data.nextPageToken,
        };
    }
    catch (error) {
        if (error instanceof CircuitOpenError) {
            return { found: false, videos: [], error: 'Service temporarily unavailable' };
        }
        log.error({ error, query }, 'YouTube search failed');
        return { found: false, videos: [], error: 'Search failed' };
    }
}
/**
 * Get detailed video information including duration and stats.
 */
export async function getVideoDetails(videoId) {
    const apiKey = getApiKey();
    if (!apiKey) {
        return { found: false, error: 'YouTube API not configured' };
    }
    if (!youtubeCircuitBreaker.canRequest()) {
        return { found: false, error: 'Service temporarily unavailable' };
    }
    // Check rate limiter (video details costs 1 unit)
    if (!youtubeRateLimiter.tryRequest()) {
        const waitTime = youtubeRateLimiter.getResetTime();
        log.warn({ videoId, waitTimeMs: waitTime }, 'YouTube rate limit exceeded');
        return { found: false, error: 'Rate limit exceeded. Please try again shortly.' };
    }
    const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: videoId,
        key: apiKey,
    });
    const url = `${YOUTUBE_API_BASE}/videos?${params}`;
    log.info({ videoId }, 'Fetching video details');
    try {
        const data = await youtubeCircuitBreaker.execute(async () => {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                throw new Error(`YouTube API error: ${response.status}`);
            }
            return (await response.json());
        });
        if (!data.items || data.items.length === 0) {
            return { found: false, error: 'Video not found' };
        }
        const item = data.items[0];
        const video = {
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            channelTitle: item.snippet.channelTitle,
            channelId: item.snippet.channelId,
            publishedAt: item.snippet.publishedAt,
            thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
            duration: item.contentDetails.duration,
            durationSeconds: parseDuration(item.contentDetails.duration),
            viewCount: parseInt(item.statistics.viewCount || '0', 10),
            likeCount: parseInt(item.statistics.likeCount || '0', 10),
            category: item.snippet.categoryId,
            tags: item.snippet.tags,
            url: `https://www.youtube.com/watch?v=${item.id}`,
        };
        log.info({ videoId, title: video.title }, 'Video details fetched');
        return { found: true, video };
    }
    catch (error) {
        if (error instanceof CircuitOpenError) {
            return { found: false, error: 'Service temporarily unavailable' };
        }
        log.error({ error, videoId }, 'Video details fetch failed');
        return { found: false, error: 'Failed to fetch video details' };
    }
}
/**
 * Get trending/popular videos by category.
 */
export async function getTrendingVideos(options = {}) {
    const { category, limit = 10, regionCode = 'US' } = options;
    const apiKey = getApiKey();
    if (!apiKey) {
        return { found: false, videos: [], error: 'YouTube API not configured' };
    }
    if (!youtubeCircuitBreaker.canRequest()) {
        return { found: false, videos: [], error: 'Service temporarily unavailable' };
    }
    // Check rate limiter (videos list costs ~1-5 units)
    if (!youtubeRateLimiter.tryRequest()) {
        const waitTime = youtubeRateLimiter.getResetTime();
        log.warn({ category, waitTimeMs: waitTime }, 'YouTube rate limit exceeded');
        return { found: false, videos: [], error: 'Rate limit exceeded. Please try again shortly.' };
    }
    // Category IDs for YouTube
    const categoryIds = {
        music: '10',
        gaming: '20',
        entertainment: '24',
        news: '25',
        howto: '26',
        education: '27',
        science: '28',
        sports: '17',
        film: '1',
        comedy: '23',
    };
    const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        chart: 'mostPopular',
        maxResults: String(limit),
        regionCode,
        key: apiKey,
    });
    if (category && categoryIds[category.toLowerCase()]) {
        params.set('videoCategoryId', categoryIds[category.toLowerCase()]);
    }
    const url = `${YOUTUBE_API_BASE}/videos?${params}`;
    log.info({ category, limit }, 'Fetching trending videos');
    try {
        const data = await youtubeCircuitBreaker.execute(async () => {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                throw new Error(`YouTube API error: ${response.status}`);
            }
            return (await response.json());
        });
        if (!data.items || data.items.length === 0) {
            return { found: false, videos: [], error: 'No trending videos found' };
        }
        const videos = data.items.map((item) => ({
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            channelTitle: item.snippet.channelTitle,
            channelId: item.snippet.channelId,
            publishedAt: item.snippet.publishedAt,
            thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
            duration: item.contentDetails.duration,
            durationSeconds: parseDuration(item.contentDetails.duration),
            viewCount: parseInt(item.statistics.viewCount || '0', 10),
            likeCount: parseInt(item.statistics.likeCount || '0', 10),
            category: item.snippet.categoryId,
            tags: item.snippet.tags,
            url: `https://www.youtube.com/watch?v=${item.id}`,
        }));
        log.info({ category, resultCount: videos.length }, 'Trending videos fetched');
        return { found: true, videos };
    }
    catch (error) {
        if (error instanceof CircuitOpenError) {
            return { found: false, videos: [], error: 'Service temporarily unavailable' };
        }
        log.error({ error, category }, 'Trending videos fetch failed');
        return { found: false, videos: [], error: 'Failed to fetch trending videos' };
    }
}
/**
 * Get video recommendations based on interests.
 */
export async function getVideoRecommendations(interests, options = {}) {
    const query = interests.slice(0, 3).join(' ');
    return searchVideos(query, { ...options, safeSearch: 'moderate' });
}
// ============================================================================
// HEALTH CHECK
// ============================================================================
/**
 * Check if YouTube API is available and configured.
 */
export async function isYouTubeApiAvailable() {
    const apiKey = getApiKey();
    if (!apiKey) {
        return false;
    }
    try {
        const response = await fetch(`${YOUTUBE_API_BASE}/search?part=snippet&q=test&type=video&maxResults=1&key=${apiKey}`, { signal: AbortSignal.timeout(5000) });
        return response.ok;
    }
    catch {
        return false;
    }
}
/**
 * Check remaining API quota (approximate based on response headers).
 */
export function getApiKeyConfigured() {
    return !!getApiKey();
}
//# sourceMappingURL=youtube-search.js.map