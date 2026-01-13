/**
 * Music Reactions and Personality
 *
 * Provides playful reactions, intros, and comments for music playback.
 * These add personality and warmth to the music experience.
 *
 * Uses SSML for natural pauses and emphasis.
 */
/**
 * Get a fun DJ moment (rare, special occasions)
 * Use sparingly for maximum delight!
 */
export declare function getFunDJMoment(): string | null;
/**
 * Get an air DJ moment (for playful music intros)
 */
export declare function getAirDJMoment(): string;
/**
 * Get an excited reaction for really good songs
 */
export declare function getExcitedMusicReaction(): string;
/**
 * Get a dancing/vibing comment
 */
export declare function getDancingComment(): string;
/**
 * Get a random music reaction of a specific type
 */
export declare function getMusicReaction(type: 'intro' | 'appreciation' | 'mood' | 'transition' | 'physical'): string;
/**
 * Determine if we should add a reaction (adds variety, not every time)
 */
export declare function shouldReactToMusic(): boolean;
/**
 * Get a playful intro for music
 */
export declare function getPlayfulMusicIntro(): string;
/**
 * Get a genre-specific reaction if applicable
 */
export declare function getGenreReaction(query: string): string | null;
/**
 * Get a mood-based music reaction
 */
export declare function getMoodMusicReaction(mood: string): string;
/**
 * Get a playful comment about music
 */
export declare function getPlayfulMusicComment(): string;
//# sourceMappingURL=music-reactions.d.ts.map