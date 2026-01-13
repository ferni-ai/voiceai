/**
 * YouTube Search Service
 *
 * Provides YouTube video discovery using the YouTube Data API v3.
 * API key optional - works with limited functionality without it.
 *
 * API Documentation: https://developers.google.com/youtube/v3/docs/search/list
 */
export interface YouTubeVideo {
    id: string;
    title: string;
    description: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnailUrl: string;
    duration?: string;
    durationSeconds?: number;
    viewCount?: number;
    likeCount?: number;
    category?: string;
    tags?: string[];
    url: string;
}
export interface YouTubeSearchResult {
    found: boolean;
    videos: YouTubeVideo[];
    nextPageToken?: string;
    error?: string;
}
export interface YouTubeVideoDetails {
    found: boolean;
    video?: YouTubeVideo;
    error?: string;
}
export type VideoDuration = 'short' | 'medium' | 'long' | 'any';
export type SafeSearchLevel = 'none' | 'moderate' | 'strict';
/**
 * Search for videos on YouTube.
 */
export declare function searchVideos(query: string, options?: {
    limit?: number;
    duration?: VideoDuration;
    safeSearch?: SafeSearchLevel;
    pageToken?: string;
}): Promise<YouTubeSearchResult>;
/**
 * Get detailed video information including duration and stats.
 */
export declare function getVideoDetails(videoId: string): Promise<YouTubeVideoDetails>;
/**
 * Get trending/popular videos by category.
 */
export declare function getTrendingVideos(options?: {
    category?: string;
    limit?: number;
    regionCode?: string;
}): Promise<YouTubeSearchResult>;
/**
 * Get video recommendations based on interests.
 */
export declare function getVideoRecommendations(interests: string[], options?: {
    limit?: number;
    duration?: VideoDuration;
}): Promise<YouTubeSearchResult>;
/**
 * Check if YouTube API is available and configured.
 */
export declare function isYouTubeApiAvailable(): Promise<boolean>;
/**
 * Check remaining API quota (approximate based on response headers).
 */
export declare function getApiKeyConfigured(): boolean;
//# sourceMappingURL=youtube-search.d.ts.map