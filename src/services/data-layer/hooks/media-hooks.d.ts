/**
 * Media & Entertainment Hooks
 *
 * Auto-indexing hooks for media preferences and memories.
 * Tracks music, books, podcasts, and entertainment context.
 *
 * @module services/data-layer/hooks/media-hooks
 */
import type { MusicPreferenceEntity, BookHighlightEntity, ReadingListEntity, CreativeMemoryEntity } from '../types.js';
/**
 * Track music preferences and associations
 */
export declare const onMusicPreferenceChange: import("../hook-generator.js").DomainHook<MusicPreferenceEntity>;
/**
 * Track book highlights and notes
 */
export declare const onBookHighlightChange: import("../hook-generator.js").DomainHook<BookHighlightEntity>;
interface EmotionalSongEntity {
    song: string;
    artist: string;
    emotion: string;
    memory?: string;
    context?: string;
}
/**
 * Track songs tied to emotions/memories
 */
export declare const onEmotionalSongChange: import("../hook-generator.js").DomainHook<EmotionalSongEntity>;
interface PlaylistMemoryEntity {
    playlistName: string;
    association: string;
    mood?: string;
    period?: string;
    songs?: string[];
}
/**
 * Track playlist associations
 */
export declare const onPlaylistMemoryChange: import("../hook-generator.js").DomainHook<PlaylistMemoryEntity>;
interface ReadingGoalEntity {
    goal: string;
    booksTarget?: number;
    booksRead?: number;
    genres?: string[];
    status: 'active' | 'completed' | 'paused';
}
/**
 * Track reading goals
 */
export declare const onReadingGoalChange: import("../hook-generator.js").DomainHook<ReadingGoalEntity>;
interface PodcastInsightEntity {
    podcastName: string;
    episodeTitle?: string;
    insight: string;
    topic?: string;
    actionItem?: string;
}
/**
 * Track podcast takeaways
 */
export declare const onPodcastInsightChange: import("../hook-generator.js").DomainHook<PodcastInsightEntity>;
interface MoviePreferenceEntity {
    title: string;
    genre?: string;
    reaction: 'loved' | 'liked' | 'neutral' | 'disliked';
    memorable?: string;
    recommendation?: boolean;
}
/**
 * Track movie/TV preferences
 */
export declare const onMoviePreferenceChange: import("../hook-generator.js").DomainHook<MoviePreferenceEntity>;
interface GamePreferenceEntity {
    game: string;
    platform?: string;
    genre?: string;
    playStyle?: string;
    memorable?: string;
}
/**
 * Track gaming preferences
 */
export declare const onGamePreferenceChange: import("../hook-generator.js").DomainHook<GamePreferenceEntity>;
interface ContentRecommendationEntity {
    content: string;
    type: 'book' | 'movie' | 'podcast' | 'music' | 'article' | 'video';
    reason: string;
    context?: string;
    engaged?: boolean;
    feedback?: string;
}
/**
 * Track content recommendations
 */
export declare const onContentRecommendationChange: import("../hook-generator.js").DomainHook<ContentRecommendationEntity>;
interface MediaMemoryEntity {
    media: string;
    type: 'song' | 'movie' | 'book' | 'show' | 'game';
    memory: string;
    period?: string;
    emotionalWeight?: 'light' | 'meaningful' | 'significant';
}
/**
 * Track memories tied to media
 */
export declare const onMediaMemoryChange: import("../hook-generator.js").DomainHook<MediaMemoryEntity>;
/**
 * Track books in reading list
 */
export declare const onReadingListChange: import("../hook-generator.js").DomainHook<ReadingListEntity>;
/**
 * Track creative discoveries and memories
 */
export declare const onCreativeMemoryChange: import("../hook-generator.js").DomainHook<CreativeMemoryEntity>;
export declare const mediaHooks: {
    onMusicPreferenceChange: import("../hook-generator.js").DomainHook<MusicPreferenceEntity>;
    onBookHighlightChange: import("../hook-generator.js").DomainHook<BookHighlightEntity>;
    onEmotionalSongChange: import("../hook-generator.js").DomainHook<EmotionalSongEntity>;
    onPlaylistMemoryChange: import("../hook-generator.js").DomainHook<PlaylistMemoryEntity>;
    onReadingGoalChange: import("../hook-generator.js").DomainHook<ReadingGoalEntity>;
    onPodcastInsightChange: import("../hook-generator.js").DomainHook<PodcastInsightEntity>;
    onMoviePreferenceChange: import("../hook-generator.js").DomainHook<MoviePreferenceEntity>;
    onGamePreferenceChange: import("../hook-generator.js").DomainHook<GamePreferenceEntity>;
    onContentRecommendationChange: import("../hook-generator.js").DomainHook<ContentRecommendationEntity>;
    onMediaMemoryChange: import("../hook-generator.js").DomainHook<MediaMemoryEntity>;
    onReadingListChange: import("../hook-generator.js").DomainHook<ReadingListEntity>;
    onCreativeMemoryChange: import("../hook-generator.js").DomainHook<CreativeMemoryEntity>;
};
export default mediaHooks;
//# sourceMappingURL=media-hooks.d.ts.map