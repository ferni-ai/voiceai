/**
 * Media & Entertainment Hooks
 *
 * Auto-indexing hooks for media preferences and memories.
 * Tracks music, books, podcasts, and entertainment context.
 *
 * @module services/data-layer/hooks/media-hooks
 */

import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
import type {
  MusicPreferenceEntity,
  BookHighlightEntity,
  ReadingListEntity,
  CreativeMemoryEntity,
} from '../types.js';

// ============================================================================
// MUSIC PREFERENCES
// ============================================================================

/**
 * Track music preferences and associations
 */
export const onMusicPreferenceChange = createDomainHook<MusicPreferenceEntity>({
  storeType: 'media',
  entityType: 'music_preference',
  contentBuilder: (m) =>
    joinNonEmpty([
      m.song ? `Song: ${m.song}.` : '',
      formatField('Artist', m.artist),
      formatField('Genre', m.genre),
      formatField('Mood', m.mood),
      formatField('Context', m.context),
      formatField('Emotional association', m.emotionalAssociation),
    ]),
  metadataExtractor: (m) => ({
    artist: m.artist,
    genre: m.genre,
    mood: m.mood,
  }),
});

// ============================================================================
// BOOK HIGHLIGHTS
// ============================================================================

/**
 * Track book highlights and notes
 */
export const onBookHighlightChange = createDomainHook<BookHighlightEntity>({
  storeType: 'media',
  entityType: 'book_highlight',
  contentBuilder: (b) =>
    joinNonEmpty([
      `From "${b.bookTitle}"${b.author ? ` by ${b.author}` : ''}: "${b.highlight}"`,
      formatField('Page', b.page),
      formatField('Reflection', b.reflection),
    ]),
  metadataExtractor: (b) => ({
    bookTitle: b.bookTitle,
    author: b.author,
    page: b.page,
  }),
});

// ============================================================================
// ADDITIONAL MEDIA HOOKS
// ============================================================================

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
export const onEmotionalSongChange = createDomainHook<EmotionalSongEntity>({
  storeType: 'media',
  entityType: 'emotional_song',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Emotional song: "${e.song}" by ${e.artist}.`,
      `Emotion: ${e.emotion}.`,
      formatField('Memory', e.memory),
      formatField('Context', e.context),
    ]),
  metadataExtractor: (e) => ({
    song: e.song,
    artist: e.artist,
    emotion: e.emotion,
  }),
});

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
export const onPlaylistMemoryChange = createDomainHook<PlaylistMemoryEntity>({
  storeType: 'media',
  entityType: 'playlist_memory',
  contentBuilder: (p) =>
    joinNonEmpty([
      `Playlist: "${p.playlistName}".`,
      `Association: ${p.association}.`,
      formatField('Mood', p.mood),
      formatField('Period', p.period),
    ]),
  metadataExtractor: (p) => ({
    playlistName: p.playlistName,
    mood: p.mood,
  }),
});

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
export const onReadingGoalChange = createDomainHook<ReadingGoalEntity>({
  storeType: 'media',
  entityType: 'reading_goal',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Reading goal: ${r.goal}.`,
      r.booksTarget ? `Target: ${r.booksTarget} books.` : '',
      r.booksRead ? `Read: ${r.booksRead}.` : '',
      r.genres?.length ? `Genres: ${r.genres.join(', ')}.` : '',
    ]),
  metadataExtractor: (r) => ({
    status: r.status,
    booksTarget: r.booksTarget,
    booksRead: r.booksRead,
  }),
  shouldSkip: (r) => r.status === 'completed',
});

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
export const onPodcastInsightChange = createDomainHook<PodcastInsightEntity>({
  storeType: 'media',
  entityType: 'podcast_insight',
  contentBuilder: (p) =>
    joinNonEmpty([
      `From podcast "${p.podcastName}"${p.episodeTitle ? ` - "${p.episodeTitle}"` : ''}.`,
      `Insight: ${p.insight}.`,
      formatField('Topic', p.topic),
      formatField('Action item', p.actionItem),
    ]),
  metadataExtractor: (p) => ({
    podcastName: p.podcastName,
    topic: p.topic,
  }),
});

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
export const onMoviePreferenceChange = createDomainHook<MoviePreferenceEntity>({
  storeType: 'media',
  entityType: 'movie_preference',
  contentBuilder: (m) =>
    joinNonEmpty([
      `Movie: "${m.title}".`,
      formatField('Genre', m.genre),
      `Reaction: ${m.reaction}.`,
      formatField('Memorable', m.memorable),
      m.recommendation ? 'Would recommend.' : '',
    ]),
  metadataExtractor: (m) => ({
    genre: m.genre,
    reaction: m.reaction,
    recommendation: m.recommendation,
  }),
});

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
export const onGamePreferenceChange = createDomainHook<GamePreferenceEntity>({
  storeType: 'media',
  entityType: 'game_preference',
  contentBuilder: (g) =>
    joinNonEmpty([
      `Game: "${g.game}".`,
      formatField('Platform', g.platform),
      formatField('Genre', g.genre),
      formatField('Play style', g.playStyle),
    ]),
  metadataExtractor: (g) => ({
    genre: g.genre,
    platform: g.platform,
  }),
});

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
export const onContentRecommendationChange = createDomainHook<ContentRecommendationEntity>({
  storeType: 'media',
  entityType: 'content_recommendation',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Recommended ${c.type}: "${c.content}".`,
      `Reason: ${c.reason}.`,
      formatField('Context', c.context),
      c.engaged ? `Engaged: ${c.feedback || 'yes'}.` : '',
    ]),
  metadataExtractor: (c) => ({
    type: c.type,
    engaged: c.engaged,
  }),
});

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
export const onMediaMemoryChange = createDomainHook<MediaMemoryEntity>({
  storeType: 'media',
  entityType: 'media_memory',
  contentBuilder: (m) =>
    joinNonEmpty([
      `Memory tied to ${m.type} "${m.media}": ${m.memory}.`,
      formatField('Period', m.period),
      formatField('Significance', m.emotionalWeight),
    ]),
  metadataExtractor: (m) => ({
    type: m.type,
    emotionalWeight: m.emotionalWeight,
  }),
});

/**
 * Track books in reading list
 */
export const onReadingListChange = createDomainHook<ReadingListEntity>({
  storeType: 'media',
  entityType: 'reading_list',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Book: "${r.title}" by ${r.authors.join(', ')}.`,
      `Status: ${r.status.replace('_', ' ')}.`,
      r.currentPage ? `Currently on page ${r.currentPage}.` : '',
      r.rating ? `Rated ${r.rating}/5.` : '',
      formatField('Notes', r.notes),
      formatField('List', r.listName),
      formatField('Priority', r.priority),
    ]),
  metadataExtractor: (r) => ({
    status: r.status,
    rating: r.rating,
    priority: r.priority,
    listName: r.listName,
  }),
});

/**
 * Track creative discoveries and memories
 */
export const onCreativeMemoryChange = createDomainHook<CreativeMemoryEntity>({
  storeType: 'media',
  entityType: 'creative_memory',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Creative discovery (${c.type}): ${c.discovery}.`,
      formatField('Source', c.source),
      formatField('Emotional impact', c.emotionalImpact),
      c.sharedWith?.length ? `Shared with: ${c.sharedWith.join(', ')}.` : '',
    ]),
  metadataExtractor: (c) => ({
    type: c.type,
    source: c.source,
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const mediaHooks = {
  onMusicPreferenceChange,
  onBookHighlightChange,
  onEmotionalSongChange,
  onPlaylistMemoryChange,
  onReadingGoalChange,
  onPodcastInsightChange,
  onMoviePreferenceChange,
  onGamePreferenceChange,
  onContentRecommendationChange,
  onMediaMemoryChange,
  onReadingListChange,
  onCreativeMemoryChange,
};

export default mediaHooks;
