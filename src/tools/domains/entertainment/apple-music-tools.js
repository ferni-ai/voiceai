/**
 * Apple Music Tools
 *
 * Search and play music from Apple Music catalog.
 *
 * ## Key Insight: iTunes = Apple Music for Previews!
 *
 * The iTunes Search API returns 30-second previews from Apple's music catalog
 * without requiring any authentication. This is the SAME catalog as Apple Music.
 *
 * So we have two ways to play Apple Music content:
 * 1. **iTunes Search API** (free, no auth) - Perfect for previews
 * 2. **Apple MusicKit API** (requires Apple Dev) - Better search + metadata
 *
 * For playback, both use the same preview URLs (30-sec MP3s).
 * Full playback requires Apple Music subscription on user's device.
 *
 * Falls back gracefully when Apple Music is not configured.
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getMusicPlayer } from '../../../audio/index.js';
import { isMusicEnabled } from '../../../config/environment.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const log = getLogger();
// 30-second preview duration (same as iTunes)
const APPLE_PREVIEW_DURATION_MS = 30000;
// Lazy import to avoid startup errors when not configured
async function getAppleMusicService() {
    try {
        const { isAppleMusicAvailable, searchAppleMusic, formatSearchResultsForVoice, getAppleMusicTrack, } = await import('../../../services/apple/musickit.js');
        return {
            isAppleMusicAvailable,
            searchAppleMusic,
            formatSearchResultsForVoice,
            getAppleMusicTrack,
        };
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Apple Music service not available');
        return null;
    }
}
export const appleMusicTools = [
    {
        id: 'searchAppleMusic',
        name: 'Search Apple Music',
        description: 'Search for songs, albums, or artists on Apple Music catalog',
        domain: 'entertainment',
        tags: ['music', 'apple', 'search', 'songs'],
        create: (_ctx) => llm.tool({
            description: getToolDescription('searchAppleMusic'),
            parameters: z.object({
                query: z.string().describe('What to search for (song, artist, album)'),
                limit: z.number().optional().default(5).describe('Max results to return'),
            }),
            execute: async ({ query, limit }) => {
                log.info({ query, limit }, '🍎 Apple Music search requested');
                const service = await getAppleMusicService();
                if (!service) {
                    return "Apple Music search isn't set up. But I can still play music for you - just ask me to play something!";
                }
                if (!service.isAppleMusicAvailable()) {
                    return "Apple Music search isn't configured. I can still play music previews though - just tell me what you want to hear!";
                }
                try {
                    const results = await service.searchAppleMusic(query, limit);
                    return service.formatSearchResultsForVoice(results);
                }
                catch (error) {
                    log.error({ query, error: String(error) }, '🍎 Apple Music search failed');
                    return 'I had trouble searching Apple Music. Let me try again in a moment.';
                }
            },
        }),
    },
    {
        id: 'playAppleMusicPreview',
        name: 'Play Apple Music Preview',
        description: 'Play a 30-second preview of a song from Apple Music',
        domain: 'entertainment',
        tags: ['music', 'apple', 'play', 'preview'],
        create: (_ctx) => llm.tool({
            description: 'Play a 30-second preview of a song from Apple Music. Search first to get track info.',
            parameters: z.object({
                query: z.string().describe('Song name and artist to play'),
            }),
            execute: async ({ query }) => {
                log.info({ query }, '🍎 Apple Music play requested');
                if (!isMusicEnabled()) {
                    return "Music playback is currently disabled. Let's chat instead!";
                }
                const service = await getAppleMusicService();
                if (!service || !service.isAppleMusicAvailable()) {
                    // Fall back to iTunes (which has the same catalog!)
                    log.info({ query }, '🍎 Apple Music not available, suggesting iTunes fallback');
                    return `Apple Music API isn't configured, but I can play the same song through iTunes. Just ask me to "play ${query}"!`;
                }
                try {
                    // Search for the track
                    const results = await service.searchAppleMusic(query, 1);
                    if (results.tracks.length === 0) {
                        return `I couldn't find "${query}" on Apple Music. Try a different search?`;
                    }
                    const track = results.tracks[0];
                    if (!track.previewUrl) {
                        return `Found "${track.name}" by ${track.artistName}, but no preview is available.`;
                    }
                    // Get the music player
                    const musicPlayer = getMusicPlayer();
                    if (!musicPlayer.isInitialized()) {
                        log.warn('🍎 Music player not initialized');
                        return `Found "${track.name}" by ${track.artistName}! The audio system is still warming up - ask me again in a moment.`;
                    }
                    // Play the preview
                    const musicTrack = {
                        name: track.name,
                        artist: track.artistName,
                        previewUrl: track.previewUrl,
                        duration: APPLE_PREVIEW_DURATION_MS,
                    };
                    const success = await musicPlayer.playFromUrl(track.previewUrl, musicTrack);
                    if (!success) {
                        return `Had trouble playing "${track.name}". Want to try again?`;
                    }
                    log.info({ track: track.name, artist: track.artistName }, '🍎 Apple Music preview playing');
                    // Natural responses
                    const responses = [
                        `Here's "${track.name}" by ${track.artistName}...`,
                        `Playing ${track.name}...`,
                        `${track.artistName} coming up...`,
                    ];
                    return responses[Math.floor(Math.random() * responses.length)];
                }
                catch (error) {
                    log.error({ query, error: String(error) }, '🍎 Apple Music playback failed');
                    return 'Had trouble playing that. Want to try something else?';
                }
            },
        }),
    },
];
export default appleMusicTools;
//# sourceMappingURL=apple-music-tools.js.map