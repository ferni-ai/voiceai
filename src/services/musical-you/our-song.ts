/**
 * 🎵 Our Song - Shared Music Memories
 *
 * "Our Song" is a special feature that tracks meaningful musical moments
 * between Ferni and the user. These songs become part of the relationship.
 *
 * How Songs Become "Our Songs":
 * 1. Played during a meaningful conversation
 * 2. User explicitly says "this is our song"
 * 3. Song played during a milestone moment
 * 4. Song that came up at an emotional breakthrough
 *
 * ✨ SUPERHUMAN FEATURE:
 * - Perfect recall of every song played together
 * - Associates songs with emotional context
 * - Proactively plays "our songs" at perfect moments
 * - Creates a relationship soundtrack over time
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface OurSong {
  id: string;
  userId: string;

  // Song details
  trackName: string;
  artistName: string;
  albumName?: string;
  spotifyUri?: string;
  appleMusicId?: string;
  previewUrl?: string;

  // When it became "ours"
  becameOursAt: Date;
  becameOursContext: OurSongContext;

  // Memory
  memory: string; // What was happening
  emotionalTone: EmotionalTone;
  conversationTopic?: string;

  // Stats
  timesPlayed: number;
  lastPlayedAt?: Date;
  firstPlayedAt: Date;

  // Triggers - when to suggest this song
  triggers: SongTrigger[];

  // User's explicit designation
  isExplicitlyChosen: boolean;
  userNote?: string;
}

export type OurSongContext =
  | 'meaningful-conversation'
  | 'user-designated'
  | 'milestone-moment'
  | 'emotional-breakthrough'
  | 'first-session'
  | 'celebration'
  | 'comfort-moment'
  | 'discovery-together';

export type EmotionalTone =
  | 'joyful'
  | 'reflective'
  | 'comforting'
  | 'energizing'
  | 'nostalgic'
  | 'triumphant'
  | 'peaceful'
  | 'bittersweet';

export interface SongTrigger {
  type: 'mood' | 'topic' | 'time' | 'milestone' | 'keyword';
  value: string;
  weight: number; // 0-1, how strongly this should trigger
}

export interface OurSongCollection {
  userId: string;
  songs: OurSong[];
  firstSongAt?: Date;
  totalPlayTime: number; // seconds
  topEmotionalTone?: EmotionalTone;
  relationshipSoundtrack: string[]; // ordered list of song IDs
}

export interface OurSongSuggestion {
  song: OurSong;
  reason: string;
  confidence: number; // 0-1
  contextMatch: string[];
}

// ============================================================================
// STORAGE
// ============================================================================

// In-memory store (would be Firestore in production)
const ourSongsStore = new Map<string, OurSongCollection>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Add a song to "Our Songs" collection
 */
export function addOurSong(
  userId: string,
  song: Omit<OurSong, 'id' | 'userId' | 'timesPlayed' | 'firstPlayedAt' | 'becameOursAt'>
): OurSong {
  const collection = getOrCreateCollection(userId);

  const newSong: OurSong = {
    id: `oursong_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    ...song,
    becameOursAt: new Date(),
    timesPlayed: 1,
    firstPlayedAt: new Date(),
  };

  collection.songs.push(newSong);
  collection.relationshipSoundtrack.push(newSong.id);

  if (!collection.firstSongAt) {
    collection.firstSongAt = new Date();
  }

  ourSongsStore.set(userId, collection);

  log.info(
    { userId, songId: newSong.id, trackName: song.trackName },
    '🎵 New song added to Our Songs'
  );

  return newSong;
}

/**
 * Get all "Our Songs" for a user
 */
export function getOurSongs(userId: string): OurSong[] {
  const collection = ourSongsStore.get(userId);
  return collection?.songs || [];
}

/**
 * Get "Our Songs" collection with stats
 */
export function getOurSongsCollection(userId: string): OurSongCollection {
  return getOrCreateCollection(userId);
}

/**
 * Record that a song was played
 */
export function recordSongPlayed(userId: string, songId: string): void {
  const collection = ourSongsStore.get(userId);
  if (!collection) return;

  const song = collection.songs.find((s) => s.id === songId);
  if (song) {
    song.timesPlayed++;
    song.lastPlayedAt = new Date();
    ourSongsStore.set(userId, collection);
  }
}

/**
 * Get suggestions for "Our Songs" based on current context
 */
export function getSongSuggestions(
  userId: string,
  context: {
    currentMood?: string;
    conversationTopic?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    isMilestone?: boolean;
    keywords?: string[];
  }
): OurSongSuggestion[] {
  const collection = ourSongsStore.get(userId);
  if (!collection || collection.songs.length === 0) {
    return [];
  }

  const suggestions: OurSongSuggestion[] = [];

  for (const song of collection.songs) {
    let confidence = 0;
    const contextMatches: string[] = [];

    // Check triggers
    for (const trigger of song.triggers) {
      switch (trigger.type) {
        case 'mood':
          if (context.currentMood?.toLowerCase().includes(trigger.value.toLowerCase())) {
            confidence += trigger.weight * 0.3;
            contextMatches.push(`Mood: ${trigger.value}`);
          }
          break;

        case 'topic':
          if (context.conversationTopic?.toLowerCase().includes(trigger.value.toLowerCase())) {
            confidence += trigger.weight * 0.3;
            contextMatches.push(`Topic: ${trigger.value}`);
          }
          break;

        case 'time':
          if (context.timeOfDay === trigger.value) {
            confidence += trigger.weight * 0.2;
            contextMatches.push(`Time: ${trigger.value}`);
          }
          break;

        case 'milestone':
          if (context.isMilestone && trigger.value === 'true') {
            confidence += trigger.weight * 0.4;
            contextMatches.push('Milestone moment');
          }
          break;

        case 'keyword':
          if (
            context.keywords?.some((k) => k.toLowerCase().includes(trigger.value.toLowerCase()))
          ) {
            confidence += trigger.weight * 0.2;
            contextMatches.push(`Keyword: ${trigger.value}`);
          }
          break;
      }
    }

    // Boost for emotional tone match
    if (context.currentMood) {
      const moodToTone: Record<string, EmotionalTone[]> = {
        happy: ['joyful', 'energizing', 'triumphant'],
        sad: ['comforting', 'bittersweet', 'reflective'],
        anxious: ['peaceful', 'comforting'],
        excited: ['energizing', 'joyful', 'triumphant'],
        nostalgic: ['nostalgic', 'reflective', 'bittersweet'],
        calm: ['peaceful', 'reflective'],
      };

      const matchingTones = moodToTone[context.currentMood.toLowerCase()] || [];
      if (matchingTones.includes(song.emotionalTone)) {
        confidence += 0.2;
        contextMatches.push(`Emotional match: ${song.emotionalTone}`);
      }
    }

    // Boost for explicitly chosen songs
    if (song.isExplicitlyChosen) {
      confidence += 0.15;
      contextMatches.push('Explicitly chosen as "Our Song"');
    }

    // Boost for frequently played songs
    if (song.timesPlayed > 3) {
      confidence += 0.1;
      contextMatches.push(`Played ${song.timesPlayed} times`);
    }

    // Generate suggestion reason
    const reason = generateSuggestionReason(song, contextMatches);

    if (confidence > 0.1) {
      suggestions.push({
        song,
        reason,
        confidence: Math.min(confidence, 1),
        contextMatch: contextMatches,
      });
    }
  }

  // Sort by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/**
 * Designate a song as "Our Song" by user request
 */
export function designateAsOurSong(
  userId: string,
  trackName: string,
  artistName: string,
  userNote?: string,
  spotifyUri?: string
): OurSong {
  return addOurSong(userId, {
    trackName,
    artistName,
    spotifyUri,
    becameOursContext: 'user-designated',
    memory: userNote || `You chose this as our special song`,
    emotionalTone: 'nostalgic',
    isExplicitlyChosen: true,
    userNote,
    triggers: [
      { type: 'milestone', value: 'true', weight: 0.8 },
      { type: 'mood', value: 'nostalgic', weight: 0.7 },
      { type: 'mood', value: 'happy', weight: 0.5 },
    ],
  });
}

/**
 * Record a song from a meaningful conversation
 */
export function recordMeaningfulSong(
  userId: string,
  trackName: string,
  artistName: string,
  conversationContext: {
    topic: string;
    emotionalTone: EmotionalTone;
    memory: string;
    keywords?: string[];
  },
  spotifyUri?: string
): OurSong {
  const triggers: SongTrigger[] = [
    { type: 'topic', value: conversationContext.topic, weight: 0.7 },
    { type: 'mood', value: conversationContext.emotionalTone, weight: 0.6 },
  ];

  if (conversationContext.keywords) {
    for (const keyword of conversationContext.keywords) {
      triggers.push({ type: 'keyword', value: keyword, weight: 0.4 });
    }
  }

  return addOurSong(userId, {
    trackName,
    artistName,
    spotifyUri,
    becameOursContext: 'meaningful-conversation',
    memory: conversationContext.memory,
    emotionalTone: conversationContext.emotionalTone,
    conversationTopic: conversationContext.topic,
    isExplicitlyChosen: false,
    triggers,
  });
}

/**
 * Get the "relationship soundtrack" - ordered list of our songs
 */
export function getRelationshipSoundtrack(userId: string): OurSong[] {
  const collection = ourSongsStore.get(userId);
  if (!collection) return [];

  const songMap = new Map(collection.songs.map((s) => [s.id, s]));
  return collection.relationshipSoundtrack
    .map((id) => songMap.get(id))
    .filter((s): s is OurSong => !!s);
}

/**
 * Get song stats for display
 */
export function getOurSongStats(userId: string): {
  totalSongs: number;
  totalPlays: number;
  firstSongDate?: Date;
  topEmotionalTone?: EmotionalTone;
  mostPlayedSong?: OurSong;
} {
  const collection = ourSongsStore.get(userId);
  if (!collection || collection.songs.length === 0) {
    return { totalSongs: 0, totalPlays: 0 };
  }

  const totalPlays = collection.songs.reduce((sum, s) => sum + s.timesPlayed, 0);

  // Count emotional tones
  const toneCounts: Record<string, number> = {};
  for (const song of collection.songs) {
    toneCounts[song.emotionalTone] = (toneCounts[song.emotionalTone] || 0) + 1;
  }
  const topTone = Object.entries(toneCounts).sort(([, a], [, b]) => b - a)[0];

  // Most played song
  const mostPlayed = collection.songs.reduce((max, s) =>
    s.timesPlayed > max.timesPlayed ? s : max
  );

  return {
    totalSongs: collection.songs.length,
    totalPlays,
    firstSongDate: collection.firstSongAt,
    topEmotionalTone: topTone?.[0] as EmotionalTone,
    mostPlayedSong: mostPlayed,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getOrCreateCollection(userId: string): OurSongCollection {
  let collection = ourSongsStore.get(userId);
  if (!collection) {
    collection = {
      userId,
      songs: [],
      totalPlayTime: 0,
      relationshipSoundtrack: [],
    };
    ourSongsStore.set(userId, collection);
  }
  return collection;
}

function generateSuggestionReason(song: OurSong, contextMatches: string[]): string {
  if (song.isExplicitlyChosen) {
    return `You chose "${song.trackName}" as our special song${song.userNote ? ` - "${song.userNote}"` : ''}`;
  }

  if (contextMatches.length === 0) {
    return `"${song.trackName}" by ${song.artistName} - ${song.memory}`;
  }

  const match = contextMatches[0];
  if (match.startsWith('Topic:')) {
    return `Remember when we talked about ${song.conversationTopic}? "${song.trackName}" was playing...`;
  }

  if (match.startsWith('Mood:') || match.startsWith('Emotional match:')) {
    return `"${song.trackName}" feels right for this moment - ${song.memory}`;
  }

  if (match === 'Milestone moment') {
    return `This calls for "${song.trackName}" - a special song for special moments`;
  }

  return `"${song.trackName}" - ${song.memory}`;
}

// ============================================================================
// SHAREABLE CARD DATA
// ============================================================================

export interface OurSongCardData {
  type: 'our-songs';
  totalSongs: number;
  topSongs: Array<{
    trackName: string;
    artistName: string;
    memory: string;
  }>;
  firstSongDate?: string;
  topEmotionalTone?: string;
  relationshipDuration: string;
}

export function getOurSongCardData(userId: string): OurSongCardData {
  const stats = getOurSongStats(userId);
  const soundtrack = getRelationshipSoundtrack(userId);

  const firstSong = soundtrack[0];
  let relationshipDuration = 'Just started';
  if (stats.firstSongDate) {
    const days = Math.floor((Date.now() - stats.firstSongDate.getTime()) / (1000 * 60 * 60 * 24));
    if (days > 365) {
      relationshipDuration = `${Math.floor(days / 365)} year${days >= 730 ? 's' : ''} of music`;
    } else if (days > 30) {
      relationshipDuration = `${Math.floor(days / 30)} month${days >= 60 ? 's' : ''} of music`;
    } else if (days > 0) {
      relationshipDuration = `${days} day${days > 1 ? 's' : ''} of music`;
    }
  }

  return {
    type: 'our-songs',
    totalSongs: stats.totalSongs,
    topSongs: soundtrack.slice(0, 5).map((s) => ({
      trackName: s.trackName,
      artistName: s.artistName,
      memory: s.memory,
    })),
    firstSongDate: stats.firstSongDate?.toISOString(),
    topEmotionalTone: stats.topEmotionalTone,
    relationshipDuration,
  };
}
