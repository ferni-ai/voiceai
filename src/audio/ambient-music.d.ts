/**
 * Ambient Music Configuration
 *
 * Provides ambient/thinking music tracks for quiet moments.
 *
 * Sources (in order of preference):
 * 1. Environment variables (AMBIENT_TRACK_1, etc.)
 * 2. Spotify ambient tracks (if connected)
 * 3. Fallback to simple acknowledgment
 *
 * To add custom tracks:
 * 1. Set AMBIENT_TRACK_1, AMBIENT_TRACK_2, etc. with audio URLs
 * 2. Or set AMBIENT_MUSIC_URLS environment variable (comma-separated)
 */
import { type MusicTrack } from './music-player.js';
/**
 * Fetch ambient tracks from Spotify (cached with TTL)
 * Returns tracks with preview URLs that can be played
 *
 * Cache invalidates after 30 minutes to pick up new tracks and handle Spotify reconnections
 */
export declare function fetchSpotifyAmbientTracks(): Promise<MusicTrack[]>;
/**
 * Clear the ambient tracks cache
 * Call this when Spotify connection state changes (disconnect/reconnect)
 */
export declare function clearAmbientTracksCache(): void;
/**
 * Get all available ambient tracks (env + built-in + Spotify)
 */
export declare function getAmbientTracks(): MusicTrack[];
/**
 * Async version that fetches Spotify tracks if needed
 */
export declare function getAmbientTracksAsync(): Promise<MusicTrack[]>;
/**
 * Check if ambient music is enabled
 * Note: Even if no tracks are available now, Spotify might fetch some later
 *
 * Music is ENABLED by default. Requires MUSIC_ENABLED !== 'false' and AMBIENT_MUSIC_ENABLED !== 'false'
 */
export declare function isAmbientMusicEnabled(): boolean;
/**
 * Get a random ambient track
 */
export declare function getRandomAmbientTrack(): MusicTrack | null;
/**
 * Play ambient/thinking music
 * Used during extended silences to fill the quiet without being intrusive
 *
 * Requires MUSIC_ENABLED=true (master flag) to work.
 *
 * Sources (in order of preference):
 * 1. Environment-configured tracks
 * 2. Spotify ambient tracks (fetched if not cached)
 */
export declare function playAmbientMusic(): Promise<boolean>;
/**
 * Stop ambient music (only if music is in ambient mode)
 *
 * This is called when the user starts speaking to stop thinking/silence music.
 * It should NOT stop regular user-requested music.
 */
export declare function stopAmbientMusic(): void;
/**
 * Get a phrase for when ambient music ends
 * The agent should acknowledge gently - these should feel natural, not robotic
 *
 * NOTE: These are only spoken ~20% of the time (see music-handler.ts)
 * Most of the time we stay quiet after ambient music ends
 */
export declare function getAmbientMusicEndedPhrase(personaId?: string): string;
/**
 * Get a DJ-style outro phrase when user-requested music is fading out.
 * Spoken DURING the fade (~5 seconds before track ends) like a real DJ.
 *
 * The agent becomes the DJ - wrapping up the track with style!
 * Includes track name for that authentic radio feel.
 *
 * @param trackName - The name of the track (for DJ-style callout)
 * @param artistName - The artist name (optional, for fuller callout)
 * @param personaId - The persona speaking (for voice variation)
 */
export declare function getDJOutroPhrase(trackName?: string, artistName?: string, personaId?: string): string;
/**
 * Get a DJ-style transition phrase when changing tracks.
 * Spoken DURING the crossfade as we switch from one track to another.
 *
 * This is the magic that makes Ferni feel like a real DJ - acknowledging
 * the current track while building excitement for what's next!
 *
 * @param currentTrack - The track we're switching FROM (for context)
 * @param newTrackName - The track we're switching TO (may be unknown yet)
 * @param personaId - The persona speaking (for voice variation)
 */
export declare function getDJTrackChangePhrase(currentTrack?: {
    name: string;
    artist?: string;
}, newTrackName?: string, personaId?: string): string;
/**
 * Get a DJ-style intro phrase for when the new track starts after a crossfade.
 * This is spoken right as the new track kicks in - the "drop" moment!
 *
 * @param trackName - The new track name
 * @param artistName - The artist name
 * @param personaId - The persona speaking
 */
export declare function getDJDropPhrase(trackName: string, artistName: string, personaId?: string): string;
/**
 * Get a "Wait for it..." phrase for mid-song interjections.
 * These make the DJ feel alive and present - like they're enjoying the music with you!
 *
 * @param momentType - 'buildup' (anticipation) or 'highlight' (appreciation)
 * @param trackName - The track name for personalization
 * @param personaId - The persona speaking
 */
export declare function getMidSongMomentPhrase(momentType: 'buildup' | 'drop' | 'highlight', trackName?: string, personaId?: string): string;
/**
 * Get a proactive music offer based on detected user mood.
 * The agent notices how the user is feeling and offers music to match or soothe.
 *
 * @param mood - Detected user mood (happy, sad, stressed, excited, etc.)
 * @param personaId - The persona speaking
 */
export declare function getMoodAwareMusicOffer(mood: string, personaId?: string): string | null;
/**
 * Get a session callback phrase - referencing music played earlier.
 * "We listened to some jazz earlier - want to keep that vibe?"
 *
 * @param sessionVibe - The vibe from the session (genres, artists)
 * @param personaId - The persona speaking
 */
export declare function getSessionCallbackPhrase(sessionVibe: {
    genres: string[];
    artists: string[];
}, personaId?: string): string | null;
/**
 * Get a phrase when music stops unexpectedly (crash, network issue, user pause).
 * The agent acknowledges something happened without making it awkward.
 *
 * These are casual, human reactions - not error messages!
 *
 * @param personaId - The persona speaking
 * @param wasPaused - True if user explicitly paused (vs stopped/crashed)
 */
export declare function getMusicStoppedPhrase(personaId?: string, wasPaused?: boolean): string;
declare const _default: {
    playAmbientMusic: typeof playAmbientMusic;
    stopAmbientMusic: typeof stopAmbientMusic;
    isAmbientMusicEnabled: typeof isAmbientMusicEnabled;
    getAmbientTracks: typeof getAmbientTracks;
    getRandomAmbientTrack: typeof getRandomAmbientTrack;
    getAmbientMusicEndedPhrase: typeof getAmbientMusicEndedPhrase;
    getDJOutroPhrase: typeof getDJOutroPhrase;
    getDJTrackChangePhrase: typeof getDJTrackChangePhrase;
    getDJDropPhrase: typeof getDJDropPhrase;
    getMidSongMomentPhrase: typeof getMidSongMomentPhrase;
    getMoodAwareMusicOffer: typeof getMoodAwareMusicOffer;
    getSessionCallbackPhrase: typeof getSessionCallbackPhrase;
    getMusicStoppedPhrase: typeof getMusicStoppedPhrase;
};
export default _default;
//# sourceMappingURL=ambient-music.d.ts.map