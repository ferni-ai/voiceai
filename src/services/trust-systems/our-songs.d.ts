/**
 * Our Songs - Shared Musical Memories
 *
 * The most powerful relationship marker: "Remember when this was playing?"
 *
 * Philosophy: Music is temporal and emotional. When a song plays during
 * a significant moment, it becomes "our song" - a shared memory that
 * creates instant connection when heard again.
 *
 * This system tracks:
 * - Songs playing during emotional breakthroughs
 * - Music present during celebrations and milestones
 * - Tracks that accompanied vulnerable moments
 * - Songs the user explicitly loved or connected with
 *
 * The magic: When that song plays again, Ferni remembers.
 * "Oh... this was playing when you finally forgave yourself."
 *
 * @module OurSongs
 */
export interface SharedSongMemory {
    id: string;
    /** Song identification */
    song: {
        name: string;
        artist: string;
        spotifyId?: string;
        previewUrl?: string;
    };
    /** The moment this became "our song" */
    moment: {
        timestamp: Date;
        type: MomentType;
        emotion: EmotionDuringMoment;
        /** What was happening - brief context */
        context: string;
        /** What they said or were discussing */
        topic?: string;
        /** Key quote if applicable */
        memorableQuote?: string;
    };
    /** How significant is this memory */
    significance: 'life_changing' | 'meaningful' | 'warm' | 'fun';
    /** Times we've called back to this song */
    callbackCount: number;
    /** Last callback timestamp */
    lastCallback?: Date;
    /** How the user reacted to callbacks */
    callbackReception: 'loved_it' | 'positive' | 'neutral' | 'skip' | 'unknown';
    /** Should we actively play this song sometimes? */
    canSuggest: boolean;
}
export type MomentType = 'breakthrough' | 'celebration' | 'vulnerable' | 'comfort' | 'joy' | 'growth' | 'decision' | 'connection' | 'first_time' | 'they_loved_it';
export type EmotionDuringMoment = 'happy' | 'excited' | 'grateful' | 'relieved' | 'proud' | 'peaceful' | 'hopeful' | 'vulnerable' | 'tearful' | 'determined' | 'nostalgic' | 'playful';
export interface OurSongsProfile {
    userId: string;
    /** All our shared songs */
    songs: SharedSongMemory[];
    /** Total musical moments we've shared */
    totalMoments: number;
    /** Their music preferences we've learned */
    preferences: {
        lovedGenres: string[];
        lovedArtists: string[];
        preferredMoods: string[];
    };
    /** First song we ever shared */
    firstSong?: SharedSongMemory;
    /** Most meaningful song */
    mostMeaningful?: SharedSongMemory;
}
export interface SongCallback {
    memory: SharedSongMemory;
    phrase: string;
    ssml: string;
    timing: 'immediate' | 'after_intro' | 'mid_song' | 'before_end';
}
interface ConversationContext {
    recentUserText: string;
    emotion?: string;
    topic?: string;
    isUserSpeaking: boolean;
}
/**
 * Detect if the current moment is significant enough to mark a song
 */
export declare function detectSignificantMoment(context: ConversationContext): {
    isSignificant: boolean;
    type?: MomentType;
    emotion?: EmotionDuringMoment;
};
export interface RecordSongMomentParams {
    userId: string;
    song: {
        name: string;
        artist: string;
        spotifyId?: string;
    };
    momentType: MomentType;
    emotion: EmotionDuringMoment;
    context: string;
    topic?: string;
    memorableQuote?: string;
}
/**
 * Record a song as "our song" - a shared musical memory
 */
export declare function recordOurSong(params: RecordSongMomentParams): SharedSongMemory;
/**
 * Check if a song is "our song" and generate a callback if so
 */
export declare function checkForOurSong(userId: string, songName: string, artistName: string): SongCallback | null;
/**
 * Get a song memory to bring up proactively (for outreach, session openers, etc.)
 */
export declare function getProactiveRememberWhen(userId: string): SongCallback | null;
export declare function getOurSongsStats(userId: string): {
    totalSongs: number;
    byMomentType: Record<string, number>;
    mostMeaningful: SharedSongMemory | undefined;
    firstSong: SharedSongMemory | undefined;
} | null;
/**
 * Get all our songs for a user (for display/export)
 */
export declare function getAllOurSongs(userId: string): SharedSongMemory[];
export declare function loadOurSongsProfile(userId: string, data: OurSongsProfile): void;
export declare function getOurSongsProfileForPersistence(userId: string): OurSongsProfile | null;
declare const _default: {
    detectSignificantMoment: typeof detectSignificantMoment;
    recordOurSong: typeof recordOurSong;
    checkForOurSong: typeof checkForOurSong;
    getProactiveRememberWhen: typeof getProactiveRememberWhen;
    getOurSongsStats: typeof getOurSongsStats;
    getAllOurSongs: typeof getAllOurSongs;
    loadOurSongsProfile: typeof loadOurSongsProfile;
    getOurSongsProfileForPersistence: typeof getOurSongsProfileForPersistence;
};
export default _default;
//# sourceMappingURL=our-songs.d.ts.map