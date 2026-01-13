/**
 * Contextual Media Suggestions
 *
 * Recommends music, podcasts, and media based on current emotional
 * state, preferences, and what's worked before.
 *
 * Philosophy: The right song at the right moment can shift everything.
 * Media is emotional medicine when chosen thoughtfully.
 *
 * Suggestion Types:
 * - Music for mood (matching or shifting)
 * - Podcasts for learning/growth
 * - Guided experiences (meditation, breathwork)
 * - Comfort content (familiar favorites)
 *
 * @module MediaSuggestions
 */
export type MediaType = 'music' | 'podcast' | 'meditation' | 'breathwork' | 'ambient' | 'audiobook';
export type MoodIntent = 'match' | 'shift' | 'energize' | 'calm' | 'comfort' | 'focus';
export interface MediaSuggestion {
    id: string;
    type: MediaType;
    title: string;
    artist?: string;
    description: string;
    intent: MoodIntent;
    targetMood?: string;
    duration?: number;
    energy: 'low' | 'medium' | 'high';
    reason: string;
    spotifyUri?: string;
    appleMusicId?: string;
    youtubeId?: string;
    tags: string[];
}
export interface MediaPreferences {
    userId: string;
    favoriteGenres: string[];
    dislikedGenres: string[];
    favoriteArtists: string[];
    podcastTopics: string[];
    podcastStyles: Array<'interview' | 'narrative' | 'educational' | 'conversational'>;
    guidedVsUnguided: 'guided' | 'unguided' | 'both';
    preferredVoices: Array<'male' | 'female' | 'neutral'>;
    meditationLength: 'short' | 'medium' | 'long';
    effectiveSuggestions: EffectiveSuggestion[];
    dismissedSuggestions: string[];
}
export interface EffectiveSuggestion {
    suggestionId: string;
    type: MediaType;
    context: string;
    mood: string;
    rating: 1 | 2 | 3 | 4 | 5;
    usedAt: Date;
    helpedWith?: string;
}
export interface SuggestionContext {
    currentMood: string;
    moodIntensity: number;
    intent?: MoodIntent;
    recentTopics?: string[];
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    activity?: 'working' | 'relaxing' | 'commuting' | 'exercising' | 'winding_down';
    duration?: number;
    energy?: 'low' | 'medium' | 'high';
}
/**
 * Update preferences based on feedback
 */
export declare function recordSuggestionFeedback(userId: string, suggestionId: string, feedback: {
    used: boolean;
    rating?: 1 | 2 | 3 | 4 | 5;
    helpedWith?: string;
    mood: string;
}): void;
/**
 * Update genre preferences
 */
export declare function updateMusicPreferences(userId: string, preferences: Partial<Pick<MediaPreferences, 'favoriteGenres' | 'dislikedGenres' | 'favoriteArtists'>>): void;
/**
 * Generate media suggestions based on context
 */
export declare function generateSuggestions(userId: string, context: SuggestionContext): MediaSuggestion[];
/**
 * Get single best suggestion
 */
export declare function getBestSuggestion(userId: string, context: SuggestionContext): MediaSuggestion | null;
/**
 * Get suggestions for a specific type
 */
export declare function getSuggestionsForMood(userId: string, mood: string, type?: MediaType): MediaSuggestion[];
/**
 * Format suggestion for voice
 */
export declare function formatSuggestionForVoice(suggestion: MediaSuggestion): {
    text: string;
    ssml: string;
};
/**
 * Get user preferences
 */
export declare function getMediaPreferences(userId: string): MediaPreferences | null;
declare const _default: {
    generateSuggestions: typeof generateSuggestions;
    getBestSuggestion: typeof getBestSuggestion;
    getSuggestionsForMood: typeof getSuggestionsForMood;
    recordSuggestionFeedback: typeof recordSuggestionFeedback;
    updateMusicPreferences: typeof updateMusicPreferences;
    formatSuggestionForVoice: typeof formatSuggestionForVoice;
    getMediaPreferences: typeof getMediaPreferences;
};
export default _default;
//# sourceMappingURL=media-suggestions.d.ts.map