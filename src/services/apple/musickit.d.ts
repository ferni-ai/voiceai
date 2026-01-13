/**
 * Apple MusicKit Service
 *
 * Search and play music from Apple Music catalog.
 * Requires user to have Apple Music subscription for full playback.
 *
 * Features:
 * - Search songs, albums, artists
 * - Get song previews (30-sec, no subscription needed)
 * - Full playback control (requires Apple Music subscription)
 *
 * @see https://developer.apple.com/documentation/applemusicapi
 */
export interface AppleMusicTrack {
    id: string;
    name: string;
    artistName: string;
    albumName: string;
    durationMs: number;
    previewUrl: string | null;
    artworkUrl: string | null;
    isExplicit: boolean;
}
export interface AppleMusicSearchResult {
    tracks: AppleMusicTrack[];
    totalResults: number;
}
/**
 * Check if Apple Music is available
 */
export declare function isAppleMusicAvailable(): boolean;
/**
 * Search Apple Music catalog
 */
export declare function searchAppleMusic(query: string, limit?: number, storefront?: string): Promise<AppleMusicSearchResult>;
/**
 * Get a specific song by ID
 */
export declare function getAppleMusicTrack(trackId: string, storefront?: string): Promise<AppleMusicTrack | null>;
/**
 * Format track for voice output
 */
export declare function formatTrackForVoice(track: AppleMusicTrack): string;
/**
 * Format search results for voice output
 */
export declare function formatSearchResultsForVoice(result: AppleMusicSearchResult): string;
declare const _default: {
    isAppleMusicAvailable: typeof isAppleMusicAvailable;
    searchAppleMusic: typeof searchAppleMusic;
    getAppleMusicTrack: typeof getAppleMusicTrack;
    formatTrackForVoice: typeof formatTrackForVoice;
    formatSearchResultsForVoice: typeof formatSearchResultsForVoice;
};
export default _default;
//# sourceMappingURL=musickit.d.ts.map