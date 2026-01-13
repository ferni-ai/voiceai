/**
 * Podcast Search Service
 *
 * Provides podcast discovery using iTunes Podcast API (free, no auth required)
 * and Spotify Podcasts API (requires auth, used as enhancement when available).
 *
 * iTunes API: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 * Spotify API: https://developer.spotify.com/documentation/web-api/reference/search
 */
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
/**
 * Search for podcasts using iTunes API.
 * Free, no authentication required.
 */
export declare function searchPodcasts(query: string, limit?: number): Promise<PodcastSearchResult>;
/**
 * Get episodes for a podcast.
 * Uses iTunes lookup + podcast feed.
 */
export declare function getPodcastEpisodes(podcastId: string, limit?: number): Promise<PodcastEpisodeResult>;
/**
 * Get top/trending podcasts by genre.
 */
export declare function getTopPodcasts(genre?: string, limit?: number): Promise<PodcastSearchResult>;
/**
 * Get podcast recommendations based on interests/mood.
 */
export declare function getPodcastRecommendations(interests: string[], mood?: string, limit?: number): Promise<PodcastSearchResult>;
/**
 * Check if podcast API is available.
 */
export declare function isPodcastApiAvailable(): Promise<boolean>;
//# sourceMappingURL=podcast-search.d.ts.map