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
import { getLogger } from '../../utils/safe-logger.js';
import { getMusicKitToken, isAppleConfigured } from './apple-jwt.js';
const log = getLogger();
const MUSICKIT_BASE_URL = 'https://api.music.apple.com/v1';
/**
 * Check if Apple Music is available
 */
export function isAppleMusicAvailable() {
    return isAppleConfigured();
}
/**
 * Make authenticated request to Apple Music API
 */
async function musicKitRequest(endpoint, options = {}) {
    const token = getMusicKitToken();
    const response = await fetch(`${MUSICKIT_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        const error = await response.text();
        log.error({ status: response.status, error }, '🍎 Apple Music API error');
        throw new Error(`Apple Music API error: ${response.status}`);
    }
    return response.json();
}
/**
 * Search Apple Music catalog
 */
export async function searchAppleMusic(query, limit = 5, storefront = 'us') {
    if (!isAppleMusicAvailable()) {
        log.warn('Apple Music not configured');
        return { tracks: [], totalResults: 0 };
    }
    log.info({ query, limit }, '🍎 Searching Apple Music');
    try {
        const encodedQuery = encodeURIComponent(query);
        const endpoint = `/catalog/${storefront}/search?term=${encodedQuery}&types=songs&limit=${limit}`;
        const data = await musicKitRequest(endpoint);
        const songs = data.results?.songs?.data || [];
        const tracks = songs.map((song) => ({
            id: song.id,
            name: song.attributes?.name || 'Unknown',
            artistName: song.attributes?.artistName || 'Unknown Artist',
            albumName: song.attributes?.albumName || 'Unknown Album',
            durationMs: song.attributes?.durationInMillis || 0,
            previewUrl: song.attributes?.previews?.[0]?.url || null,
            artworkUrl: song.attributes?.artwork?.url?.replace('{w}x{h}', '300x300') || null,
            isExplicit: song.attributes?.contentRating === 'explicit',
        }));
        log.info({ query, found: tracks.length }, '🍎 Apple Music search complete');
        return {
            tracks,
            totalResults: data.results?.songs?.meta?.total || tracks.length,
        };
    }
    catch (error) {
        log.error({ query, error: String(error) }, '🍎 Apple Music search failed');
        return { tracks: [], totalResults: 0 };
    }
}
/**
 * Get a specific song by ID
 */
export async function getAppleMusicTrack(trackId, storefront = 'us') {
    if (!isAppleMusicAvailable()) {
        return null;
    }
    try {
        const data = await musicKitRequest(`/catalog/${storefront}/songs/${trackId}`);
        const song = data.data?.[0];
        if (!song)
            return null;
        return {
            id: song.id,
            name: song.attributes?.name || 'Unknown',
            artistName: song.attributes?.artistName || 'Unknown Artist',
            albumName: song.attributes?.albumName || 'Unknown Album',
            durationMs: song.attributes?.durationInMillis || 0,
            previewUrl: song.attributes?.previews?.[0]?.url || null,
            artworkUrl: song.attributes?.artwork?.url?.replace('{w}x{h}', '300x300') || null,
            isExplicit: song.attributes?.contentRating === 'explicit',
        };
    }
    catch (error) {
        log.error({ trackId, error: String(error) }, '🍎 Failed to get Apple Music track');
        return null;
    }
}
/**
 * Format track for voice output
 */
export function formatTrackForVoice(track) {
    return `${track.name} by ${track.artistName}`;
}
/**
 * Format search results for voice output
 */
export function formatSearchResultsForVoice(result) {
    if (result.tracks.length === 0) {
        return "I couldn't find any songs matching that on Apple Music.";
    }
    const trackList = result.tracks
        .slice(0, 3)
        .map((t, i) => `${i + 1}. ${formatTrackForVoice(t)}`)
        .join('. ');
    return `Found ${result.totalResults} songs on Apple Music. Top results: ${trackList}`;
}
export default {
    isAppleMusicAvailable,
    searchAppleMusic,
    getAppleMusicTrack,
    formatTrackForVoice,
    formatSearchResultsForVoice,
};
//# sourceMappingURL=musickit.js.map