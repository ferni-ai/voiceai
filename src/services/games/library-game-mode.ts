/**
 * 🎧 Library Game Mode
 *
 * "Play from Your Library" - Use the user's own Spotify library
 * for music games. A more personal experience where they guess
 * songs they've saved but might not remember!
 *
 * Features:
 * - Name That Tune with YOUR songs
 * - Desert Island from YOUR library
 * - Decade Challenge with YOUR decades
 * - Challenge mode with YOUR deep cuts
 *
 * @module LibraryGameMode
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getSpotifyLibrary,
  getRandomPlayableTracks,
  hasEnoughPlayableContent,
  getChallengerTracks,
  analyzeLibraryTaste,
} from '../musical-you/spotify-library.js';
import type { SpotifyTrack } from '../musical-you/types.js';

// Extended game types for library mode (includes future games)
export type LibraryGameType =
  | 'name-that-tune'
  | 'this-or-that'
  | 'decade-challenge' // Future game
  | 'finish-the-lyric'; // Future game

const log = createLogger({ module: 'LibraryGameMode' });

// ============================================================================
// TYPES
// ============================================================================

export interface LibraryGameConfig {
  userId: string;
  gameType: LibraryGameType;
  mode: 'library' | 'mixed' | 'challenge';
  roundCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface LibraryGameRound {
  roundNumber: number;
  track: SpotifyTrack;
  isFromLibrary: boolean;
  hints: string[];
  points: number;
  timeLimit: number; // seconds
}

export interface LibraryGameSession {
  id: string;
  config: LibraryGameConfig;
  rounds: LibraryGameRound[];
  currentRound: number;
  score: number;
  correctAnswers: number;
  startedAt: Date;
  status: 'ready' | 'playing' | 'completed' | 'abandoned';
}

export interface LibraryAvailability {
  available: boolean;
  reason?: string;
  playableCount: number;
  totalCount: number;
  percentage: number;
  topDecades: string[];
  topArtists: string[];
}

// ============================================================================
// AVAILABILITY CHECK
// ============================================================================

/**
 * Check if user can play library mode
 */
export async function checkLibraryAvailability(
  userId: string,
  accessToken?: string
): Promise<LibraryAvailability> {
  // Try to get library (sync if needed)
  const library = await getSpotifyLibrary(userId, accessToken);

  if (!library) {
    return {
      available: false,
      reason: 'Spotify not connected. Connect Spotify to play from your library!',
      playableCount: 0,
      totalCount: 0,
      percentage: 0,
      topDecades: [],
      topArtists: [],
    };
  }

  const { hasEnough, playableCount, totalCount, percentage } = hasEnoughPlayableContent(userId);

  if (!hasEnough) {
    return {
      available: false,
      reason: `Not enough playable songs (${playableCount} of ${totalCount}). You need at least 20 songs with preview clips.`,
      playableCount,
      totalCount,
      percentage,
      topDecades: library.topDecades,
      topArtists: library.topArtists.map((a) => a.name),
    };
  }

  return {
    available: true,
    playableCount,
    totalCount,
    percentage,
    topDecades: library.topDecades,
    topArtists: library.topArtists.map((a) => a.name),
  };
}

// ============================================================================
// GAME SESSION CREATION
// ============================================================================

const activeSessions = new Map<string, LibraryGameSession>();

/**
 * Create a library game session
 */
export function createLibraryGameSession(config: LibraryGameConfig): LibraryGameSession | null {
  const { hasEnough } = hasEnoughPlayableContent(config.userId);

  if (!hasEnough && config.mode === 'library') {
    log.warn({ userId: config.userId }, '⚠️ Not enough library content for pure library mode');
    return null;
  }

  // Get tracks based on mode
  let tracks: SpotifyTrack[];

  switch (config.mode) {
    case 'library':
      // All tracks from user's library
      tracks = getRandomPlayableTracks(config.userId, config.roundCount);
      break;

    case 'challenge':
      // Harder tracks (older, less popular)
      tracks = getChallengerTracks(config.userId, config.roundCount);
      break;

    case 'mixed':
    default:
      // Mix of library and potentially new discoveries
      // For now, use library tracks
      tracks = getRandomPlayableTracks(config.userId, config.roundCount);
      break;
  }

  if (tracks.length < config.roundCount) {
    log.warn(
      { userId: config.userId, requested: config.roundCount, got: tracks.length },
      '⚠️ Not enough tracks for requested rounds'
    );
  }

  // Create rounds
  const rounds: LibraryGameRound[] = tracks.map((track, i) => ({
    roundNumber: i + 1,
    track,
    isFromLibrary: true,
    hints: generateHints(track, config.difficulty),
    points: calculatePoints(config.difficulty, i + 1),
    timeLimit: getTimeLimit(config.gameType, config.difficulty),
  }));

  const session: LibraryGameSession = {
    id: `lib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    config,
    rounds,
    currentRound: 0,
    score: 0,
    correctAnswers: 0,
    startedAt: new Date(),
    status: 'ready',
  };

  activeSessions.set(session.id, session);

  log.info(
    {
      sessionId: session.id,
      userId: config.userId,
      mode: config.mode,
      rounds: rounds.length,
    },
    '🎮 Created library game session'
  );

  return session;
}

/**
 * Get current round for a session
 */
export function getCurrentRound(sessionId: string): LibraryGameRound | null {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'playing') return null;

  return session.rounds[session.currentRound] || null;
}

/**
 * Submit answer for current round
 */
export function submitLibraryAnswer(
  sessionId: string,
  answer: string,
  timeMs: number
): {
  correct: boolean;
  correctAnswer: string;
  points: number;
  nextRound: LibraryGameRound | null;
  gameComplete: boolean;
  totalScore: number;
} {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'playing') {
    return {
      correct: false,
      correctAnswer: '',
      points: 0,
      nextRound: null,
      gameComplete: true,
      totalScore: 0,
    };
  }

  const round = session.rounds[session.currentRound];
  const correct = checkAnswer(answer, round.track);

  if (correct) {
    const points = calculatePointsWithTime(round.points, timeMs, round.timeLimit);
    session.score += points;
    session.correctAnswers++;
  }

  // Move to next round
  session.currentRound++;
  const gameComplete = session.currentRound >= session.rounds.length;

  if (gameComplete) {
    session.status = 'completed';
  }

  return {
    correct,
    correctAnswer: `"${round.track.name}" by ${round.track.artistName}`,
    points: correct ? round.points : 0,
    nextRound: gameComplete ? null : session.rounds[session.currentRound],
    gameComplete,
    totalScore: session.score,
  };
}

/**
 * Start the game (move from ready to playing)
 */
export function startLibraryGame(sessionId: string): LibraryGameRound | null {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'ready') return null;

  session.status = 'playing';
  return session.rounds[0] || null;
}

/**
 * Abandon a game session
 */
export function abandonLibraryGame(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = 'abandoned';
    log.info({ sessionId }, '🎮 Library game abandoned');
  }
}

/**
 * Get session stats
 */
export function getSessionStats(sessionId: string): {
  score: number;
  correctAnswers: number;
  totalRounds: number;
  accuracy: number;
  status: string;
} | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  return {
    score: session.score,
    correctAnswers: session.correctAnswers,
    totalRounds: session.rounds.length,
    accuracy:
      session.currentRound > 0
        ? Math.round((session.correctAnswers / session.currentRound) * 100)
        : 0,
    status: session.status,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateHints(track: SpotifyTrack, difficulty: string): string[] {
  const hints: string[] = [];

  // Easy mode gets more hints
  if (difficulty === 'easy') {
    hints.push(`From the album "${track.albumName}"`);
    hints.push(`Released in ${track.releaseYear}`);
  }

  // Medium gets some hints
  if (difficulty !== 'hard') {
    hints.push(`By an artist starting with "${track.artistName[0]}"`);
  }

  // Everyone gets decade hint
  const decade = Math.floor(track.releaseYear / 10) * 10;
  hints.push(`From the ${decade}s`);

  return hints;
}

function calculatePoints(difficulty: string, roundNumber: number): number {
  const basePoints: Record<string, number> = {
    easy: 100,
    medium: 200,
    hard: 300,
  };

  const base = basePoints[difficulty] || 100;

  // Slight bonus for later rounds (momentum)
  return base + roundNumber * 10;
}

function calculatePointsWithTime(
  basePoints: number,
  timeMs: number,
  timeLimitSeconds: number
): number {
  // Bonus for quick answers
  const timeLimitMs = timeLimitSeconds * 1000;
  const timeBonus = Math.max(0, (timeLimitMs - timeMs) / timeLimitMs);

  return Math.round(basePoints * (1 + timeBonus * 0.5));
}

function getTimeLimit(gameType: LibraryGameType, difficulty: string): number {
  const limits: Record<string, Record<string, number>> = {
    'name-that-tune': { easy: 30, medium: 20, hard: 10 },
    'this-or-that': { easy: 15, medium: 10, hard: 5 },
    'decade-challenge': { easy: 20, medium: 15, hard: 10 },
  };

  return limits[gameType]?.[difficulty] || 20;
}

function checkAnswer(answer: string, track: SpotifyTrack): boolean {
  const normalizedAnswer = answer.toLowerCase().trim();
  const trackName = track.name.toLowerCase();
  const artistName = track.artistName.toLowerCase();

  // Exact match on song name
  if (normalizedAnswer === trackName) return true;

  // Partial match on song name (at least 60% of words)
  const answerWords = normalizedAnswer.split(/\s+/);
  const trackWords = trackName.split(/\s+/);
  const matchingWords = answerWords.filter(
    (w) => trackWords.includes(w) || trackWords.some((tw) => tw.includes(w))
  );

  if (matchingWords.length >= trackWords.length * 0.6) return true;

  // Artist name counts too
  if (normalizedAnswer.includes(artistName)) return true;

  return false;
}

// ============================================================================
// PERSONALIZED GAME SUGGESTIONS
// ============================================================================

/**
 * Get personalized game suggestions based on library
 */
export function getLibraryGameSuggestions(userId: string): Array<{
  gameType: LibraryGameType;
  mode: 'library' | 'challenge';
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
}> {
  const taste = analyzeLibraryTaste(userId);
  if (!taste) return [];

  const suggestions: Array<{
    gameType: LibraryGameType;
    mode: 'library' | 'challenge';
    title: string;
    description: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }> = [];

  // If they have strong decade preferences
  if (taste.topDecades.length > 0) {
    const topDecade = taste.topDecades[0];
    suggestions.push({
      gameType: 'decade-challenge',
      mode: 'library',
      title: `${topDecade.decade} Challenge`,
      description: `Test your ${topDecade.decade} knowledge with songs from your library`,
      difficulty: 'medium',
    });
  }

  // If they have high diversity, they might like a challenge
  if (taste.diversityScore > 60) {
    suggestions.push({
      gameType: 'name-that-tune',
      mode: 'challenge',
      title: 'Deep Cuts Challenge',
      description: 'Can you remember the songs you saved ages ago?',
      difficulty: 'hard',
    });
  }

  // Everyone gets the standard library mode
  suggestions.push({
    gameType: 'name-that-tune',
    mode: 'library',
    title: 'Your Library Mix',
    description: 'Name the songs from your own Spotify library',
    difficulty: 'easy',
  });

  return suggestions;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  checkLibraryAvailability,
  createLibraryGameSession,
  getCurrentRound,
  submitLibraryAnswer,
  startLibraryGame,
  abandonLibraryGame,
  getSessionStats,
  getLibraryGameSuggestions,
};
