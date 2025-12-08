/**
 * 🎵 Game Music Helper
 *
 * Connects games to the music player.
 * Handles searching, playing, and managing music during games.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getMusicPlayer } from '../../audio/music-player.js';
import { findTrack, searchItunes } from '../itunes.js';
import type { MusicTrack } from '../../audio/music-player.js';
import type { iTunesTrack } from '../itunes.js';

const log = getLogger();

// ============================================================================
// FALLBACK SONGS (when iTunes fails)
// ============================================================================

const FALLBACK_SONGS: GameTrack[] = [
  { name: 'Bohemian Rhapsody', artist: 'Queen', previewUrl: '', decade: '1970s', genre: 'rock' },
  { name: 'Billie Jean', artist: 'Michael Jackson', previewUrl: '', decade: '1980s', genre: 'pop' },
  { name: 'Smells Like Teen Spirit', artist: 'Nirvana', previewUrl: '', decade: '1990s', genre: 'rock' },
  { name: 'Hey Ya!', artist: 'OutKast', previewUrl: '', decade: '2000s', genre: 'pop' },
  { name: 'Happy', artist: 'Pharrell Williams', previewUrl: '', decade: '2010s', genre: 'pop' },
  { name: 'Blinding Lights', artist: 'The Weeknd', previewUrl: '', decade: '2020s', genre: 'pop' },
  { name: 'Hotel California', artist: 'Eagles', previewUrl: '', decade: '1970s', genre: 'rock' },
  { name: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses', previewUrl: '', decade: '1980s', genre: 'rock' },
  { name: 'Wonderwall', artist: 'Oasis', previewUrl: '', decade: '1990s', genre: 'rock' },
  { name: 'Mr. Brightside', artist: 'The Killers', previewUrl: '', decade: '2000s', genre: 'rock' },
];

// Cache for iTunes results to avoid redundant API calls
const searchCache = new Map<string, { result: SearchResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Request queue to prevent rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 100;

/**
 * Rate-limited search with caching
 */
async function rateLimitedSearch(query: string): Promise<SearchResult> {
  // Check cache first
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    log.debug({ query }, '🎮 Cache hit for search');
    return cached.result;
  }

  // Rate limit
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  // Perform search
  const result = await searchSongDirect(query);
  
  // Cache result
  searchCache.set(query, { result, timestamp: Date.now() });
  
  return result;
}

/**
 * Direct search without rate limiting (internal use)
 */
async function searchSongDirect(query: string): Promise<SearchResult> {
  try {
    const result = await findTrack(query);
    
    if (!result.found || !result.track) {
      return { found: false, error: result.error || 'Track not found' };
    }

    return {
      found: true,
      track: {
        name: result.track.name,
        artist: result.track.artist,
        previewUrl: result.track.previewUrl,
        duration: result.track.duration,
      },
    };
  } catch (error) {
    log.error({ error, query }, '🎮 Failed to search song');
    return { found: false, error: 'Search failed' };
  }
}

/**
 * Get a fallback song when iTunes fails
 */
function getFallbackSong(hint?: { decade?: string; genre?: string }): GameTrack {
  let candidates = [...FALLBACK_SONGS];
  
  if (hint?.decade) {
    const decadeMatches = candidates.filter(s => s.decade === hint.decade);
    if (decadeMatches.length > 0) candidates = decadeMatches;
  }
  
  if (hint?.genre) {
    const genreMatches = candidates.filter(s => s.genre === hint.genre);
    if (genreMatches.length > 0) candidates = genreMatches;
  }
  
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ============================================================================
// TYPES
// ============================================================================

export interface GameTrack {
  name: string;
  artist: string;
  previewUrl: string;
  duration?: number;
  decade?: string;
  genre?: string;
}

export interface SearchResult {
  found: boolean;
  track?: GameTrack;
  error?: string;
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

/**
 * Search for a specific song (for Name That Tune)
 * Uses rate limiting, caching, and fallback
 */
export async function searchSong(query: string, useFallback = true): Promise<SearchResult> {
  try {
    const result = await rateLimitedSearch(query);
    
    if (!result.found && useFallback) {
      log.warn({ query }, '🎮 iTunes search failed, using fallback');
      const fallback = getFallbackSong();
      return {
        found: true,
        track: fallback,
      };
    }
    
    return result;
  } catch (error) {
    log.error({ error, query }, '🎮 Search failed completely');
    
    if (useFallback) {
      const fallback = getFallbackSong();
      return {
        found: true,
        track: fallback,
      };
    }
    
    return { found: false, error: 'Search failed' };
  }
}

/**
 * Search for songs containing a word (for One Word Song)
 */
export async function searchSongWithWord(word: string): Promise<SearchResult> {
  try {
    // Search iTunes for songs with this word in title
    const results = await searchItunes(word, 10);
    
    if (results.resultCount === 0) {
      return { found: false, error: `No songs found with "${word}"` };
    }

    // Find a track with a preview URL that actually contains the word
    const matchingTrack = results.results.find(
      (t: iTunesTrack) => t.previewUrl && t.trackName.toLowerCase().includes(word.toLowerCase())
    );

    if (!matchingTrack) {
      // Fall back to first track with preview
      const firstWithPreview = results.results.find((t: iTunesTrack) => t.previewUrl);
      if (!firstWithPreview) {
        return { found: false, error: `No playable songs found with "${word}"` };
      }
      
      return {
        found: true,
        track: {
          name: firstWithPreview.trackName,
          artist: firstWithPreview.artistName,
          previewUrl: firstWithPreview.previewUrl,
          duration: firstWithPreview.trackTimeMillis,
        },
      };
    }

    return {
      found: true,
      track: {
        name: matchingTrack.trackName,
        artist: matchingTrack.artistName,
        previewUrl: matchingTrack.previewUrl,
        duration: matchingTrack.trackTimeMillis,
      },
    };
  } catch (error) {
    log.error({ error, word }, '🎮 Failed to search song with word');
    return { found: false, error: 'Search failed' };
  }
}

/**
 * Search for random songs from a decade or genre (for Name That Tune variety)
 */
export async function getRandomGameSongs(
  count: number = 10,
  options?: { decade?: string; genre?: string }
): Promise<GameTrack[]> {
  // Mix of classic and popular songs that most people would recognize
  const searchQueries = [
    // 70s
    'Bohemian Rhapsody Queen',
    'Hotel California Eagles',
    'Dancing Queen ABBA',
    'Stayin Alive Bee Gees',
    // 80s
    'Billie Jean Michael Jackson',
    'Take On Me a-ha',
    'Sweet Child O Mine',
    'Livin on a Prayer Bon Jovi',
    'Africa Toto',
    'Every Breath You Take Police',
    // 90s
    'Smells Like Teen Spirit Nirvana',
    'Wonderwall Oasis',
    'Losing My Religion REM',
    'Creep Radiohead',
    'No Diggity Blackstreet',
    // 2000s
    'Hey Ya OutKast',
    'Crazy In Love Beyonce',
    'Mr Brightside Killers',
    'Seven Nation Army',
    'Toxic Britney Spears',
    // 2010s
    'Happy Pharrell',
    'Uptown Funk Bruno Mars',
    'Shape of You Ed Sheeran',
    'Rolling in the Deep Adele',
    'Blinding Lights Weeknd',
    'Bad Guy Billie Eilish',
    'Old Town Road',
    // Classic Rock
    'Sweet Home Alabama',
    'Dont Stop Believin Journey',
    'Eye of the Tiger',
    // Pop
    'Call Me Maybe',
    'Shake It Off Taylor Swift',
    'Despacito',
    'Gangnam Style',
  ];

  // Shuffle and pick random queries
  const shuffled = searchQueries.sort(() => Math.random() - 0.5);
  const selectedQueries = shuffled.slice(0, count * 2); // Request more in case some fail

  const tracks: GameTrack[] = [];
  
  for (const query of selectedQueries) {
    if (tracks.length >= count) break;
    
    try {
      const result = await findTrack(query);
      if (result.found && result.track?.previewUrl) {
        tracks.push({
          name: result.track.name,
          artist: result.track.artist,
          previewUrl: result.track.previewUrl,
          duration: result.track.duration,
        });
      }
    } catch {
      // Skip failed searches
      continue;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  log.info({ count: tracks.length, requested: count }, '🎮 Loaded game songs');
  return tracks;
}

/**
 * Search for songs matching a mood (for Mood DJ Challenge)
 */
export async function searchSongForMood(mood: string): Promise<SearchResult> {
  // Map moods to search terms
  const moodSearches: Record<string, string[]> = {
    happy: ['happy upbeat pop', 'feel good song', 'dance party'],
    sad: ['sad emotional ballad', 'heartbreak song', 'melancholy'],
    energetic: ['pump up workout', 'high energy dance', 'hype song'],
    relaxed: ['chill acoustic', 'calm piano', 'peaceful ambient'],
    romantic: ['love song ballad', 'romantic slow dance', 'love duet'],
    nostalgic: ['throwback classic', '80s hit', '90s nostalgic'],
    focused: ['lo-fi study', 'concentration music', 'ambient focus'],
    angry: ['rock anthem', 'metal intense', 'rage song'],
  };

  const moodLower = mood.toLowerCase();
  let searchTerms = moodSearches.happy; // default

  // Find matching mood
  for (const [key, terms] of Object.entries(moodSearches)) {
    if (moodLower.includes(key)) {
      searchTerms = terms;
      break;
    }
  }

  // Also check for specific scenarios
  if (moodLower.includes('driv') || moodLower.includes('road')) {
    searchTerms = ['road trip song', 'driving music', 'highway playlist'];
  } else if (moodLower.includes('work') || moodLower.includes('study')) {
    searchTerms = ['focus music', 'study beats', 'concentration'];
  } else if (moodLower.includes('party') || moodLower.includes('danc')) {
    searchTerms = ['party anthem', 'dance hit', 'club banger'];
  } else if (moodLower.includes('sleep') || moodLower.includes('bed')) {
    searchTerms = ['sleep music', 'lullaby soft', 'bedtime peaceful'];
  }

  // Pick random search term
  const searchQuery = searchTerms[Math.floor(Math.random() * searchTerms.length)];
  
  return searchSong(searchQuery);
}

// ============================================================================
// PLAYBACK FUNCTIONS
// ============================================================================

/**
 * Play a game track
 * Returns true if playback started successfully
 * 
 * @param waitForStart - If true, waits for music to actually start before resolving
 *                       This prevents the agent from speaking over the music intro
 */
export async function playGameTrack(track: GameTrack, waitForStart: boolean = true): Promise<boolean> {
  const player = getMusicPlayer();
  
  if (!player.isInitialized()) {
    log.warn('🎮 Music player not initialized, cannot play game track');
    return false;
  }

  const musicTrack: MusicTrack = {
    name: track.name,
    artist: track.artist,
    previewUrl: track.previewUrl,
    duration: track.duration,
  };

  // Set game volume (moderate - user needs to hear and think)
  player.setVolume(0.4);

  const success = await player.playFromUrl(track.previewUrl, musicTrack);
  
  if (success) {
    log.info({ track: track.name }, '🎮 Playing game track');
    
    // 🎵 Wait for music to actually start playing
    // This prevents the agent from talking over the music intro
    if (waitForStart) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  } else {
    log.error({ track: track.name }, '🎮 Failed to play game track');
  }

  return success;
}

/**
 * Stop current game track
 */
export function stopGameTrack(): void {
  const player = getMusicPlayer();
  player.stop();
  log.debug('🎮 Stopped game track');
}

/**
 * Fade out current track (for dramatic reveals)
 */
export async function fadeOutGameTrack(durationMs: number = 2000): Promise<void> {
  const player = getMusicPlayer();
  
  // Gradually reduce volume
  const startVolume = 0.4;
  const steps = 10;
  const stepDelay = durationMs / steps;
  const volumeStep = startVolume / steps;

  for (let i = 0; i < steps; i++) {
    player.setVolume(startVolume - (volumeStep * (i + 1)));
    await new Promise(resolve => setTimeout(resolve, stepDelay));
  }

  player.stop();
  log.debug('🎮 Faded out game track');
}

/**
 * Check if music player is available
 */
export function isMusicAvailable(): boolean {
  const player = getMusicPlayer();
  return player.isInitialized();
}

/**
 * Get current playback status
 */
export function isPlaying(): boolean {
  const player = getMusicPlayer();
  return player.isPlaying();
}

/**
 * 🎮 Duck game music (lower volume) when user speaks during a game
 * Called when user starts speaking - they're making a guess!
 */
export function duckForUserGuess(): void {
  const player = getMusicPlayer();
  if (player.isPlaying()) {
    // Lower volume to let user's guess come through clearly
    player.setVolume(0.15); // 15% - barely audible
    log.debug('🎮 Ducked game music for user guess');
  }
}

/**
 * 🎮 Restore game music volume after user stops speaking
 */
export function unduckAfterGuess(): void {
  const player = getMusicPlayer();
  if (player.isPlaying()) {
    // Restore to game volume
    player.setVolume(0.4); // 40% - normal game volume
    log.debug('🎮 Restored game music volume after guess');
  }
}

// ============================================================================
// PRELOADING SYSTEM
// ============================================================================

// Preloaded tracks ready for next rounds
const preloadQueue: GameTrack[] = [];
const MAX_PRELOAD_SIZE = 5;
let isPreloading = false;

/**
 * Preload songs for upcoming rounds
 * Call this at game start or after each round
 */
export async function preloadNextRoundSongs(count: number = 3): Promise<void> {
  if (isPreloading || preloadQueue.length >= MAX_PRELOAD_SIZE) {
    return;
  }

  isPreloading = true;

  try {
    const tracks = await getRandomGameSongs(count);
    
    for (const track of tracks) {
      if (preloadQueue.length < MAX_PRELOAD_SIZE) {
        preloadQueue.push(track);
      }
    }
    
    log.debug({ queueSize: preloadQueue.length }, '🎮 Preloaded game songs');
  } catch (error) {
    log.warn({ error }, '🎮 Failed to preload songs');
  } finally {
    isPreloading = false;
  }
}

/**
 * Get a preloaded track (or search for one if queue is empty)
 */
export async function getPreloadedOrSearch(query?: string): Promise<GameTrack | null> {
  // If we have preloaded tracks and no specific query, use one
  if (!query && preloadQueue.length > 0) {
    const track = preloadQueue.shift();
    
    // Start preloading more in background
    void preloadNextRoundSongs(1);
    
    return track || null;
  }

  // Otherwise search
  if (query) {
    const result = await searchSong(query);
    return result.found ? (result.track || null) : null;
  }

  // Fallback: load and return first track
  const tracks = await getRandomGameSongs(1);
  return tracks[0] || getFallbackSong();
}

/**
 * Clear the preload queue (e.g., when game ends)
 */
export function clearPreloadQueue(): void {
  preloadQueue.length = 0;
  log.debug('🎮 Cleared preload queue');
}

/**
 * Get preload queue size (for debugging)
 */
export function getPreloadQueueSize(): number {
  return preloadQueue.length;
}
