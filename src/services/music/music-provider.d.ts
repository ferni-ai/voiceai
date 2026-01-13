/**
 * Unified Music Provider
 *
 * Balances music playback across multiple sources:
 *
 * 1. **iTunes Previews** (Default) - Free 30-sec clips for everyone
 *    - No auth needed
 *    - Perfect for ambient/background music
 *    - Same catalog as Apple Music!
 *
 * 2. **Apple Music Previews** - Same 30-sec clips via MusicKit API
 *    - Requires Apple Developer credentials
 *    - Better search results for some queries
 *    - Falls back to iTunes if not configured
 *
 * 3. **Spotify** (Premium) - Full-length tracks
 *    - Requires user to link their Premium account
 *    - Best for "I want to hear the whole song"
 *
 * 4. **Sonos** - Play on Sonos speakers
 *    - Searches user's favorites
 *    - Plays on specified room or default room
 *
 * ## Intent-Based Routing
 *
 * - "Play some jazz" → Ambient mode → iTunes previews (chains them like a DJ)
 * - "Play Taylor Swift" → Listening mode → Spotify first, iTunes fallback
 * - "Search Apple Music for..." → Direct Apple Music search
 * - "Play jazz on living room Sonos" → Sonos mode → Play on Sonos speakers
 */
export type MusicIntent = 'ambient' | 'listening' | 'search' | 'sonos';
export type MusicSource = 'itunes' | 'apple_music' | 'spotify' | 'sonos';
export interface MusicTrackInfo {
    name: string;
    artist: string;
    album?: string;
    previewUrl?: string;
    spotifyUri?: string;
    duration?: number;
    source: MusicSource;
}
export interface PlayMusicResult {
    success: boolean;
    source: MusicSource;
    track?: MusicTrackInfo;
    message: string;
    isPreview: boolean;
}
export interface MusicSourceConfig {
    spotify: {
        available: boolean;
        premium: boolean;
        deviceReady: boolean;
    };
    sonos: {
        available: boolean;
        rooms: string[];
        defaultRoom?: string;
    };
    itunes: {
        available: true;
    };
}
/**
 * Build a music source config from available services
 */
export declare function buildSourceConfig(options: {
    spotifyLinked?: boolean;
    spotifyPremium?: boolean;
    spotifyDeviceReady?: boolean;
    sonosLinked?: boolean;
    sonosRooms?: string[];
    sonosDefaultRoom?: string;
}): MusicSourceConfig;
/**
 * Select the best music source based on intent and configuration
 *
 * Priority:
 * 1. Sonos (if user said "on Sonos" or has default room and intent is listening)
 * 2. Spotify Connect (if Premium + device ready and intent is listening)
 * 3. Sonos search+play (if available and intent is listening)
 * 4. iTunes preview (always works)
 */
export declare function selectBestSource(intent: MusicIntent, config: MusicSourceConfig, options?: {
    explicitSonos?: boolean;
    explicitSpotify?: boolean;
    roomSpecified?: string;
}): MusicSource;
/**
 * Detect user's intent from their music request
 */
export declare function detectMusicIntent(query: string): MusicIntent;
/**
 * Extract room name from a music query
 * e.g., "play jazz in the living room" → "living room"
 */
export declare function extractRoomFromQuery(query: string): string | undefined;
/**
 * Check if query explicitly mentions Sonos
 */
export declare function mentionsSonos(query: string): boolean;
/**
 * Check if query explicitly mentions Spotify
 */
export declare function mentionsSpotify(query: string): boolean;
/**
 * Get the best music source for the user's intent (backward compatible)
 * @deprecated Use selectBestSource with MusicSourceConfig instead
 */
export declare function getBestSource(intent: MusicIntent, options?: {
    spotifyLinked?: boolean;
    spotifyPremium?: boolean;
    spotifyDeviceReady?: boolean;
    appleMusicAvailable?: boolean;
    sonosLinked?: boolean;
    sonosRooms?: string[];
}): MusicSource;
/**
 * Format a playback result for voice output
 */
export declare function formatPlaybackResult(result: PlayMusicResult, room?: string): string;
/**
 * Log music playback for analytics
 */
export declare function logMusicPlay(userId: string, track: MusicTrackInfo, intent: MusicIntent, success: boolean): void;
declare const _default: {
    detectMusicIntent: typeof detectMusicIntent;
    getBestSource: typeof getBestSource;
    selectBestSource: typeof selectBestSource;
    buildSourceConfig: typeof buildSourceConfig;
    formatPlaybackResult: typeof formatPlaybackResult;
    logMusicPlay: typeof logMusicPlay;
    extractRoomFromQuery: typeof extractRoomFromQuery;
    mentionsSonos: typeof mentionsSonos;
    mentionsSpotify: typeof mentionsSpotify;
};
export default _default;
//# sourceMappingURL=music-provider.d.ts.map