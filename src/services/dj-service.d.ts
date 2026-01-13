/**
 * 🎧 DJ Service - Human-Like Music Intelligence
 *
 * Makes Ferni feel like a real DJ who:
 * - Reads the room and offers music at the right moments
 * - Has different DJ styles per persona
 * - Appreciates music during playback
 * - Remembers your taste across sessions
 * - Suggests music that matches the conversation mood
 * - Introduces you to new music you might like
 *
 * This is the brain behind the DJ experience.
 */
import { type MusicTrack, type SessionMusicEntry } from '../audio/index.js';
/**
 * Check if music is currently playing (utility for external use)
 */
export declare function isMusicCurrentlyPlaying(): boolean;
/**
 * Get current track info if music is playing
 */
export declare function getCurrentPlayingTrack(): MusicTrack | null;
/**
 * Each persona has a distinct DJ style that affects:
 * - How they introduce music
 * - How they react during playback
 * - How they transition between tracks
 * - The energy level of their commentary
 */
export interface DJPersonaStyle {
    /** The overall DJ vibe */
    style: 'hype' | 'chill' | 'sophisticated' | 'playful' | 'mindful' | 'warm';
    /** How often they interject during music (0-1) */
    interjectionFrequency: number;
    /** Preferred music moods */
    preferredMoods: string[];
    /** How they refer to themselves as DJ */
    djName?: string;
}
export declare const DJ_PERSONA_STYLES: Record<string, DJPersonaStyle>;
export declare function getDJStyle(personaId: string): DJPersonaStyle;
/**
 * Get a spontaneous music offer based on context.
 * Used during silence or after emotional moments.
 */
export declare function getSpontaneousMusicOffer(personaId: string, context: {
    silenceDurationSec?: number;
    recentMood?: string;
    isAfterEmotionalMoment?: boolean;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    hasPlayedMusicThisSession?: boolean;
}): string | null;
/**
 * Get a teaser about what's coming next in the queue
 * Used after tracks end to maintain engagement
 */
export declare function getQueueTeaser(personaId: string, hasQueue: boolean): string | null;
/**
 * Get an appreciation comment about the music
 * These are brief comments that show the DJ is enjoying the music too
 * @param personaId - The persona's ID for style selection
 * @param _track - Track info for future track-specific comments (currently unused)
 */
export declare function getMusicAppreciationComment(personaId: string, _track: MusicTrack): string | null;
/**
 * Get a specific music element appreciation
 * "That bass line though..." style comments
 */
export declare function getMusicElementAppreciation(personaId: string): string | null;
/**
 * Get a conversation starter about music
 * Used to engage the user about their musical tastes
 */
export declare function getMusicConversationStarter(personaId: string, context: {
    track?: MusicTrack;
    sessionHistory?: SessionMusicEntry[];
}): string;
/**
 * Determine the right music behavior based on context
 */
export declare function getReadTheRoomAction(context: {
    userIsSilentDuringMusic?: boolean;
    userIsTalkingDuringMusic?: boolean;
    musicHasBeenPlayingFor?: number;
    userEngagementLevel?: 'high' | 'medium' | 'low';
}, personaId: string): {
    action: 'continue' | 'offer_stop' | 'auto_duck' | 'check_in';
    phrase?: string;
} | null;
/**
 * Suggest music based on conversation context
 */
export declare function getContextualMusicSuggestion(conversationContext: {
    topics?: string[];
    mood?: string;
    isHeavyTopic?: boolean;
    isCelebration?: boolean;
    needsFocus?: boolean;
}, personaId: string): {
    suggestion: string;
    genre: string;
} | null;
/**
 * Offer to introduce the user to new music
 */
export declare function getMusicDiscoveryOffer(personaId: string): string;
/**
 * Get a callback phrase referencing past music sessions
 */
export declare function getCrossSessionMusicCallback(personaId: string, musicMemory: {
    favoriteArtists?: string[];
    favoriteGenres?: string[];
    lastPlayedArtist?: string;
    totalTracksPlayed?: number;
}): string | null;
export declare const DJService: {
    getDJStyle: typeof getDJStyle;
    getSpontaneousMusicOffer: typeof getSpontaneousMusicOffer;
    getQueueTeaser: typeof getQueueTeaser;
    getMusicAppreciationComment: typeof getMusicAppreciationComment;
    getMusicElementAppreciation: typeof getMusicElementAppreciation;
    getMusicConversationStarter: typeof getMusicConversationStarter;
    getReadTheRoomAction: typeof getReadTheRoomAction;
    getContextualMusicSuggestion: typeof getContextualMusicSuggestion;
    getMusicDiscoveryOffer: typeof getMusicDiscoveryOffer;
    getCrossSessionMusicCallback: typeof getCrossSessionMusicCallback;
};
export default DJService;
//# sourceMappingURL=dj-service.d.ts.map