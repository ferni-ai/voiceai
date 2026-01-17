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

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedMusicPreference {
  type: 'like' | 'dislike';
  category: 'genre' | 'artist';
  value: string;
  confidence: number; // 0-1, how confident we are in this extraction
}

// ============================================================================
// MUSIC GENRE DATABASE
// ============================================================================

const MUSIC_GENRES = new Set([
  // Main genres
  'pop',
  'rock',
  'jazz',
  'classical',
  'hip hop',
  'hip-hop',
  'rap',
  'r&b',
  'rnb',
  'country',
  'folk',
  'electronic',
  'edm',
  'house',
  'techno',
  'dubstep',
  'trance',
  'metal',
  'punk',
  'indie',
  'alternative',
  'blues',
  'soul',
  'funk',
  'disco',
  'reggae',
  'ska',
  'latin',
  'salsa',
  'bachata',
  'cumbia',
  'k-pop',
  'kpop',
  'j-pop',
  'jpop',
  'anime',
  'lofi',
  'lo-fi',
  'chill',
  'ambient',
  'new age',
  // Sub-genres
  'death metal',
  'black metal',
  'thrash metal',
  'progressive rock',
  'prog rock',
  'classic rock',
  'soft rock',
  'hard rock',
  'grunge',
  'shoegaze',
  'post-punk',
  'synth-pop',
  'synthwave',
  'retrowave',
  'vaporwave',
  'future bass',
  'drum and bass',
  'dnb',
  'trap',
  'drill',
  'grime',
  'garage',
  'uk garage',
  'afrobeats',
  'afropop',
  'bossa nova',
  'smooth jazz',
  'acid jazz',
  'bebop',
  'big band',
  'swing',
  'broadway',
  'show tunes',
  'musical theater',
  'opera',
  'orchestral',
  'chamber',
  'worship',
  'gospel',
  'christian',
  'praise',
  'hymns',
  // Moods/styles (often used as genres)
  'chill',
  'relaxing',
  'upbeat',
  'energetic',
  'sad',
  'happy',
  'romantic',
  'workout',
  'focus',
  'study',
  'sleep',
  'meditation',
  'party',
  'driving',
]);

// Common words that indicate preference expressions
const LIKE_INDICATORS = [
  'love',
  'like',
  'enjoy',
  'dig',
  'into',
  'favorite',
  'favourite',
  'best',
  'obsessed with',
  'fan of',
  'really into',
  'always listen to',
  "can't get enough of",
  'my jam',
  'my thing',
  'vibe with',
  'prefer',
  'appreciate',
  'adore',
];

const DISLIKE_INDICATORS = [
  'hate',
  'dislike',
  "can't stand",
  'not a fan',
  'not into',
  "don't like",
  'not my thing',
  'never liked',
  'avoid',
  'skip',
  "can't listen to",
  'tired of',
  'sick of',
  'annoyed by',
  'bored by',
  'not for me',
];

// ============================================================================
// EXTRACTION LOGIC
// ============================================================================

/**
 * Extract music preferences from user speech
 *
 * @param text - User's speech/message
 * @returns Array of extracted preferences (may be empty if none found)
 */
export function extractMusicPreferences(text: string): ExtractedMusicPreference[] {
  const results: ExtractedMusicPreference[] = [];
  const lowerText = text.toLowerCase();

  // Quick check: does text mention music-related content?
  const hasMusicContext = /music|song|listen|play|artist|singer|band|genre|album/i.test(text);
  if (!hasMusicContext && !MUSIC_GENRES.has(lowerText.split(/\s+/).slice(-1)[0])) {
    // No obvious music context - still check for genres mentioned
    // but require higher confidence
  }

  // Check for explicit like/dislike patterns with genres
  for (const genre of MUSIC_GENRES) {
    // Genre mentioned in text?
    const genreRegex = new RegExp(`\\b${escapeRegex(genre)}\\b`, 'i');
    if (!genreRegex.test(lowerText)) continue;

    // Check for like indicators
    for (const indicator of LIKE_INDICATORS) {
      const likePatterns = [
        new RegExp(`\\b${escapeRegex(indicator)}\\b.*\\b${escapeRegex(genre)}\\b`, 'i'),
        new RegExp(
          `\\b${escapeRegex(genre)}\\b.*\\b(is|are)\\s+(my|the)\\s+(favorite|best|jam)`,
          'i'
        ),
      ];

      for (const pattern of likePatterns) {
        if (pattern.test(lowerText)) {
          results.push({
            type: 'like',
            category: 'genre',
            value: genre,
            confidence: 0.8,
          });
          break;
        }
      }
    }

    // Check for dislike indicators
    for (const indicator of DISLIKE_INDICATORS) {
      const dislikePatterns = [
        new RegExp(`\\b${escapeRegex(indicator)}\\b.*\\b${escapeRegex(genre)}\\b`, 'i'),
        new RegExp(`\\b${escapeRegex(genre)}\\b.*\\b(is|are)\\s+(not|never)`, 'i'),
      ];

      for (const pattern of dislikePatterns) {
        if (pattern.test(lowerText)) {
          results.push({
            type: 'dislike',
            category: 'genre',
            value: genre,
            confidence: 0.8,
          });
          break;
        }
      }
    }
  }

  // Check for artist preferences (harder - need to detect proper nouns)
  // Pattern: "I love/hate [Artist Name]" or "[Artist Name] is my favorite"
  const artistPatterns = [
    // "I love Taylor Swift"
    /\b(?:love|like|enjoy|hate|dislike)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    // "Taylor Swift is my favorite"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|are)\s+(?:my|the)\s+(?:favorite|best)/,
    // "I'm a big fan of The Beatles"
    /(?:fan of|into|obsessed with)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    // "Can't stand Nickelback"
    /(?:can't stand|hate|dislike)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
  ];

  for (const pattern of artistPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const artistName = match[1].trim();
      // Skip if it's a genre we already captured
      if (!MUSIC_GENRES.has(artistName.toLowerCase())) {
        const isDislike = /hate|dislike|can't stand|not a fan/i.test(text);
        results.push({
          type: isDislike ? 'dislike' : 'like',
          category: 'artist',
          value: artistName,
          confidence: 0.7, // Lower confidence for artist extraction
        });
      }
    }
  }

  // De-duplicate results (same value + type + category)
  const unique = results.filter(
    (item, index, self) =>
      index ===
      self.findIndex(
        (t) =>
          t.type === item.type &&
          t.category === item.category &&
          t.value.toLowerCase() === item.value.toLowerCase()
      )
  );

  if (unique.length > 0) {
    log.debug('🎵 Extracted music preferences from conversation', {
      text: text.slice(0, 100),
      preferences: unique,
    });
  }

  return unique;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if text mentions any music-related content worth analyzing
 */
export function hasMusicContext(text: string): boolean {
  const musicKeywords = /music|song|listen|play|artist|singer|band|genre|album|track|tune/i;
  if (musicKeywords.test(text)) return true;

  // Check if any genre is mentioned
  const lowerText = text.toLowerCase();
  for (const genre of MUSIC_GENRES) {
    if (lowerText.includes(genre)) return true;
  }

  return false;
}

export default {
  extractMusicPreferences,
  hasMusicContext,
};
