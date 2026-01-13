/**
 * 🎵 Music Preference Extractor
 *
 * Extracts music preferences from natural conversation.
 * Detects when users express likes/dislikes about music genres or artists.
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This enables Ferni to learn what you like simply by you mentioning it in conversation,
 * without needing explicit commands.
 *
 * @example
 * "I really love jazz" → { type: 'like', category: 'genre', value: 'jazz' }
 * "I'm not a fan of country music" → { type: 'dislike', category: 'genre', value: 'country' }
 * "Taylor Swift is my favorite" → { type: 'like', category: 'artist', value: 'Taylor Swift' }
 *
 * @module audio/music-preference-extractor
 */
export interface ExtractedMusicPreference {
    type: 'like' | 'dislike';
    category: 'genre' | 'artist';
    value: string;
    confidence: number;
}
/**
 * Extract music preferences from user speech
 *
 * @param text - User's speech/message
 * @returns Array of extracted preferences (may be empty if none found)
 */
export declare function extractMusicPreferences(text: string): ExtractedMusicPreference[];
/**
 * Check if text mentions any music-related content worth analyzing
 */
export declare function hasMusicContext(text: string): boolean;
declare const _default: {
    extractMusicPreferences: typeof extractMusicPreferences;
    hasMusicContext: typeof hasMusicContext;
};
export default _default;
//# sourceMappingURL=music-preference-extractor.d.ts.map