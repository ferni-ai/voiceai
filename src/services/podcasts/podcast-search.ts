/**
 * Podcast Search Service
 *
 * Provides podcast discovery using iTunes Podcast API (free, no auth required)
 * and Spotify Podcasts API (requires auth, used as enhancement when available).
 *
 * iTunes API: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 * Spotify API: https://developer.spotify.com/documentation/web-api/reference/search
 */

import { CircuitOpenError, getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getSlidingWindowLimiter } from '../../utils/rate-limiter.js';

const log = createLogger({ module: 'PodcastSearch' });

// Circuit breaker for podcast APIs
const podcastCircuitBreaker = getCircuitBreaker('podcast-api', {
  failureThreshold: 5,
  resetTimeout: 15000,
  successThreshold: 1,
});

// Rate limiter for iTunes API
// iTunes API allows ~20 requests per minute per IP
const podcastRateLimiter = getSlidingWindowLimiter('podcast-itunes-api', 18, 60000);

// ============================================================================
// TYPES
// ============================================================================

export interface PodcastShow {
  id: string;
  name: string;
  description: string;
  publisher: string;
  imageUrl: string;
  feedUrl?: string;
  totalEpisodes?: number;
  genres: string[];
  explicit: boolean;
  source: 'itunes' | 'spotify';
}

export interface PodcastEpisode {
  id: string;
  showId: string;
  showName: string;
  title: string;
  description: string;
  releaseDate: string;
  durationMs: number;
  audioUrl?: string;
  imageUrl?: string;
  source: 'itunes' | 'spotify';
}

export interface PodcastSearchResult {
  found: boolean;
  shows: PodcastShow[];
  error?: string;
}

export interface PodcastEpisodeResult {
  found: boolean;
  episodes: PodcastEpisode[];
  error?: string;
}

// iTunes API response types
interface iTunesPodcastResult {
  resultCount: number;
  results: Array<{
    collectionId: number;
    collectionName: string;
    artistName: string;
    feedUrl?: string;
    artworkUrl600?: string;
    artworkUrl100: string;
    trackCount: number;
    primaryGenreName: string;
    genreIds: string[];
    collectionExplicitness: string;
    // Episode-specific fields
    trackId?: number;
    trackName?: string;
    description?: string;
    releaseDate?: string;
    trackTimeMillis?: number;
    episodeUrl?: string;
  }>;
}

// ============================================================================
// ITUNES PODCAST API
// ============================================================================

const ITUNES_API_BASE = 'https://itunes.apple.com';

/**
 * Search for podcasts using iTunes API.
 * Free, no authentication required.
 */
export async function searchPodcasts(query: string, limit = 10): Promise<PodcastSearchResult> {
  const url = `${ITUNES_API_BASE}/search?term=${encodeURIComponent(query)}&media=podcast&entity=podcast&limit=${limit}`;

  if (!podcastCircuitBreaker.canRequest()) {
    log.warn({ query }, 'Podcast circuit breaker is OPEN');
    return { found: false, shows: [], error: 'Service temporarily unavailable' };
  }

  // Check rate limiter
  if (!podcastRateLimiter.tryRequest()) {
    const waitTime = podcastRateLimiter.getResetTime();
    log.warn({ query, waitTimeMs: waitTime }, 'Podcast rate limit exceeded');
    return { found: false, shows: [], error: 'Rate limit exceeded. Please try again shortly.' };
  }

  log.info({ query, limit }, 'Searching podcasts');

  try {
    const data = await podcastCircuitBreaker.execute(async () => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`iTunes API error: ${response.status}`);
      }

      return (await response.json()) as iTunesPodcastResult;
    });

    if (data.resultCount === 0) {
      return {
        found: false,
        shows: [],
        error: `Couldn't find podcasts matching "${query}"`,
      };
    }

    const shows: PodcastShow[] = data.results.map((r) => ({
      id: `itunes:${r.collectionId}`,
      name: r.collectionName,
      description: '', // iTunes search doesn't return descriptions
      publisher: r.artistName,
      imageUrl: r.artworkUrl600 || r.artworkUrl100,
      feedUrl: r.feedUrl,
      totalEpisodes: r.trackCount,
      genres: [r.primaryGenreName],
      explicit: r.collectionExplicitness === 'explicit',
      source: 'itunes' as const,
    }));

    log.info({ query, resultCount: shows.length }, 'Podcast search complete');
    return { found: true, shows };
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      return { found: false, shows: [], error: 'Service temporarily unavailable' };
    }
    log.error({ error, query }, 'Podcast search failed');
    return { found: false, shows: [], error: 'Search failed' };
  }
}

/**
 * Get episodes for a podcast.
 * Uses iTunes lookup + podcast feed.
 */
export async function getPodcastEpisodes(
  podcastId: string,
  limit = 10
): Promise<PodcastEpisodeResult> {
  // Extract iTunes ID from our format
  const itunesId = podcastId.replace('itunes:', '');
  const url = `${ITUNES_API_BASE}/lookup?id=${itunesId}&entity=podcastEpisode&limit=${limit}`;

  if (!podcastCircuitBreaker.canRequest()) {
    return { found: false, episodes: [], error: 'Service temporarily unavailable' };
  }

  // Check rate limiter
  if (!podcastRateLimiter.tryRequest()) {
    const waitTime = podcastRateLimiter.getResetTime();
    log.warn({ podcastId, waitTimeMs: waitTime }, 'Podcast rate limit exceeded');
    return { found: false, episodes: [], error: 'Rate limit exceeded. Please try again shortly.' };
  }

  log.info({ podcastId, limit }, 'Fetching podcast episodes');

  try {
    const data = await podcastCircuitBreaker.execute(async () => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`iTunes API error: ${response.status}`);
      }

      return (await response.json()) as iTunesPodcastResult;
    });

    // First result is the podcast itself, rest are episodes
    const episodeResults = data.results.slice(1);

    if (episodeResults.length === 0) {
      return {
        found: false,
        episodes: [],
        error: 'No episodes found',
      };
    }

    const showName = data.results[0]?.collectionName || 'Unknown Show';

    const episodes: PodcastEpisode[] = episodeResults.map((r) => ({
      id: `itunes:${r.trackId}`,
      showId: podcastId,
      showName,
      title: r.trackName || 'Untitled Episode',
      description: r.description || '',
      releaseDate: r.releaseDate || '',
      durationMs: r.trackTimeMillis || 0,
      audioUrl: r.episodeUrl,
      imageUrl: r.artworkUrl600 || r.artworkUrl100,
      source: 'itunes' as const,
    }));

    log.info({ podcastId, episodeCount: episodes.length }, 'Episodes fetched');
    return { found: true, episodes };
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      return { found: false, episodes: [], error: 'Service temporarily unavailable' };
    }
    log.error({ error, podcastId }, 'Episode fetch failed');
    return { found: false, episodes: [], error: 'Failed to fetch episodes' };
  }
}

/**
 * Get top/trending podcasts by genre.
 */
export async function getTopPodcasts(genre?: string, limit = 10): Promise<PodcastSearchResult> {
  // Use genre-based searches for "top" podcasts
  const genreQueries: Record<string, string> = {
    comedy: 'comedy podcast top',
    news: 'news daily podcast',
    true_crime: 'true crime podcast',
    business: 'business entrepreneur podcast',
    health: 'health wellness podcast',
    technology: 'tech podcast',
    education: 'educational podcast',
    sports: 'sports podcast',
    music: 'music podcast interview',
    society: 'society culture podcast',
  };

  const searchQuery = genre
    ? genreQueries[genre.toLowerCase()] || `${genre} podcast`
    : 'popular podcast 2024';

  return searchPodcasts(searchQuery, limit);
}

/**
 * Get podcast recommendations based on interests/mood.
 */
export async function getPodcastRecommendations(
  interests: string[],
  mood?: string,
  limit = 5
): Promise<PodcastSearchResult> {
  // Build query from interests
  const interestQuery = interests.slice(0, 3).join(' ');
  const moodModifier = mood ? ` ${mood}` : '';
  const query = `${interestQuery}${moodModifier} podcast`;

  return searchPodcasts(query, limit);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if podcast API is available.
 */
export async function isPodcastApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${ITUNES_API_BASE}/search?term=test&media=podcast&limit=1`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
