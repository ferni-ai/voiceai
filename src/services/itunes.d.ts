/**
 * iTunes Search API Service
 *
 * Provides free music search and 30-second preview URLs without authentication.
 * Perfect for music playback when users don't have Spotify Premium.
 *
 * API Documentation: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 */
export interface iTunesTrack {
    trackId: number;
    trackName: string;
    artistName: string;
    collectionName: string;
    previewUrl: string;
    artworkUrl100: string;
    trackTimeMillis: number;
    primaryGenreName: string;
    releaseDate: string;
}
export interface iTunesSearchResult {
    resultCount: number;
    results: iTunesTrack[];
}
export interface MusicSearchResult {
    found: boolean;
    track?: {
        name: string;
        artist: string;
        album: string;
        previewUrl: string;
        duration: number;
        genre: string;
        artwork: string;
    };
    alternatives?: Array<{
        name: string;
        artist: string;
        previewUrl: string;
    }>;
    error?: string;
}
/**
 * Search for tracks on iTunes.
 * No authentication required!
 */
export declare function searchItunes(query: string, limit?: number): Promise<iTunesSearchResult>;
/**
 * Search for a single best match track.
 * Returns the track with preview URL, or null if not found.
 */
export declare function findTrack(query: string): Promise<MusicSearchResult>;
/**
 * Search for tracks by artist.
 */
export declare function searchByArtist(artist: string, limit?: number): Promise<iTunesTrack[]>;
/**
 * Search for tracks by genre/mood.
 * iTunes doesn't have a great genre search, so we use keyword combinations.
 */
export declare function searchByMood(mood: string): Promise<MusicSearchResult>;
/**
 * Get popular/trending tracks (by searching common chart terms).
 */
export declare function getPopularTracks(): Promise<iTunesTrack[]>;
/**
 * Check if iTunes API is reachable.
 */
export declare function isItunesAvailable(): Promise<boolean>;
//# sourceMappingURL=itunes.d.ts.map