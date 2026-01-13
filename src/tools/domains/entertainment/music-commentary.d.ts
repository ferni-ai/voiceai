/**
 * Music Commentary System
 *
 * Stories, facts, and commentary about artists and songs
 * that personas can share when music plays.
 *
 * NOTE: This module provides general music facts and commentary.
 * For persona-specific music preferences, see persona bundles:
 *   src/personas/bundles/{persona}/content/behaviors/music-preferences.json
 *
 * The commentary here is domain knowledge, not persona-specific personality.
 */
/**
 * Get commentary for a song/artist
 * Returns a comment about the music with natural, human delivery
 *
 * @param trackName - Name of the track
 * @param artistName - Name of the artist
 * @param personaId - Optional persona ID. Personal stories and investing wisdom
 *                    are only returned for 'peter-john' persona (Jack Bogle style).
 *                    All personas can share facts and fun facts.
 */
export declare function getMusicCommentary(trackName: string, artistName: string, personaId?: string): string | null;
/**
 * Get music trivia question for the trivia game
 */
export declare function getMusicTrivia(artistName?: string): {
    question: string;
    answer: string;
    hint: string;
} | null;
/**
 * Get investing lesson connected to music
 */
export declare function getMusicInvestingWisdom(artistName?: string): string | null;
/**
 * Check if we have commentary for this artist
 */
export declare function hasArtistInfo(artistName: string): boolean;
/**
 * Get all artist names we have info about (for logging/debugging)
 */
export declare function getKnownArtists(): string[];
//# sourceMappingURL=music-commentary.d.ts.map