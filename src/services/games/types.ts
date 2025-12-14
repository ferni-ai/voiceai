/**
 * 🎮 Games Types
 *
 * Type definitions for the games service.
 * Games are a layer on top of existing services (music, etc.)
 */

// ============================================================================
// GAME TYPES
// ============================================================================

/**
 * Currently implemented game types
 */
export type GameType =
  | 'name-that-tune' // Guess the song from a clip
  | 'one-word-song' // User says word, find a song with it
  | 'this-or-that' // Pick favorite between two songs
  | 'desert-island-discs' // Pick 5 songs for a desert island
  | 'mood-dj-challenge'; // Describe mood, agent finds song

/**
 * Future game types (not yet implemented)
 * These are defined separately to allow type-safe feature flags
 */
export type FutureGameType =
  | 'finish-the-lyric' // Complete the song lyric (requires lyrics API)
  | 'decade-challenge' // Guess what decade a song is from
  | 'song-dedication' // Dedicate a song to someone
  | 'music-trivia'; // Music knowledge questions (requires trivia database)

/**
 * All game types (implemented and future)
 */
export type AllGameTypes = GameType | FutureGameType;

export type GameStatus = 'idle' | 'active' | 'paused' | 'completed';

// ============================================================================
// GAME STATE
// ============================================================================

export interface GameState {
  /** Current game type */
  gameType: GameType | null;
  /** Current status */
  status: GameStatus;
  /** Current round number */
  currentRound: number;
  /** Total rounds for this game */
  totalRounds: number;
  /** Current score */
  score: number;
  /** High score for this game type */
  highScore: number;
  /** Game-specific data */
  gameData: Record<string, unknown>;
  /** Started at timestamp */
  startedAt: number | null;
  /** Last activity timestamp */
  lastActivityAt: number;
}

export interface GameResult {
  /** Was the answer correct? */
  correct: boolean;
  /** Points earned this round */
  pointsEarned: number;
  /** Feedback message */
  feedback: string;
  /** The correct answer (for learning) */
  correctAnswer?: string;
  /** Is the game over? */
  gameOver: boolean;
  /** Final score if game over */
  finalScore?: number;
}

// ============================================================================
// NAME THAT TUNE
// ============================================================================

export interface NameThatTuneData {
  /** Current song being played */
  currentSong: {
    name: string;
    artist: string;
    previewUrl: string;
  } | null;
  /** Acceptable answers (song name, artist, etc.) */
  acceptableAnswers: string[];
  /** Hints given */
  hintsUsed: number;
  /** Time limit in seconds */
  timeLimit: number;
  /** Songs already played this game */
  playedSongs: string[];
}

export interface NameThatTuneConfig {
  /** Number of rounds */
  rounds: number;
  /** Difficulty: easy (full 30s), medium (15s), hard (5s) */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Genre filter (optional) */
  genre?: string;
  /** Decade filter (optional) */
  decade?: string;
}

// ============================================================================
// ONE WORD SONG
// ============================================================================

export interface OneWordSongData {
  /** The word the user gave */
  currentWord: string | null;
  /** Song found for that word */
  foundSong: {
    name: string;
    artist: string;
    previewUrl: string;
  } | null;
  /** Words used this game */
  usedWords: string[];
  /** Songs played this game */
  playedSongs: string[];
}

// ============================================================================
// FINISH THE LYRIC
// ============================================================================

export interface FinishTheLyricData {
  /** The lyric prompt */
  lyricPrompt: string | null;
  /** The expected completion */
  expectedCompletion: string | null;
  /** The full lyric line */
  fullLyric: string | null;
  /** Song info */
  song: {
    name: string;
    artist: string;
  } | null;
  /** Hints given */
  hintsUsed: number;
}

// ============================================================================
// THIS OR THAT
// ============================================================================

export interface ThisOrThatData {
  /** First song option */
  songA: {
    name: string;
    artist: string;
    previewUrl: string;
  } | null;
  /** Second song option */
  songB: {
    name: string;
    artist: string;
    previewUrl: string;
  } | null;
  /** User's choices history (for learning preferences) */
  choices: Array<{
    chosen: 'A' | 'B';
    songA: string;
    songB: string;
  }>;
}

// ============================================================================
// DESERT ISLAND DISCS
// ============================================================================

export interface DesertIslandDiscsData {
  /** Songs picked so far */
  pickedSongs: Array<{
    name: string;
    artist?: string;
    reason?: string;
  }>;
  /** Current prompt/question */
  currentPrompt: string | null;
  /** Number of songs to pick */
  totalPicks: number;
}

// ============================================================================
// DECADE CHALLENGE
// ============================================================================

export interface DecadeChallengeData {
  /** Current song being played */
  currentSong: {
    name: string;
    artist: string;
    previewUrl: string;
    releaseYear: number;
    decade: string;
  } | null;
  /** Songs already played */
  playedSongs: string[];
}

// ============================================================================
// MOOD DJ CHALLENGE
// ============================================================================

export interface MoodDJChallengeData {
  /** The mood/scenario described */
  currentMood: string | null;
  /** Song picked for the mood */
  pickedSong: {
    name: string;
    artist: string;
    previewUrl: string;
  } | null;
  /** User's rating of the pick (1-5) */
  userRating: number | null;
  /** Moods and ratings history */
  history: Array<{
    mood: string;
    song: string;
    rating: number;
  }>;
}

// ============================================================================
// SONG DEDICATION
// ============================================================================

export interface SongDedicationData {
  /** Who the song is for */
  dedicateTo: string | null;
  /** Relationship to the person */
  relationship?: string;
  /** The occasion */
  occasion?: string;
  /** Song picked */
  pickedSong: {
    name: string;
    artist: string;
    previewUrl: string;
  } | null;
  /** Dedication message */
  dedicationMessage?: string;
}

// ============================================================================
// MUSIC TRIVIA
// ============================================================================

export interface MusicTriviaData {
  /** Current question */
  currentQuestion: {
    question: string;
    options?: string[];
    correctAnswer: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
  } | null;
  /** Questions asked */
  questionsAsked: number;
  /** Categories covered */
  categories: string[];
}

// ============================================================================
// SESSION GAME HISTORY
// ============================================================================

export interface GameSession {
  /** Game type */
  gameType: GameType;
  /** Final score */
  score: number;
  /** Rounds played */
  roundsPlayed: number;
  /** Duration in seconds */
  durationSeconds: number;
  /** Timestamp */
  playedAt: number;
  /** Persona who played with them */
  personaId: string;
}

export interface GameHistory {
  /** Games played this session */
  sessionGames: GameSession[];
  /** All-time stats by game type */
  allTimeStats: Record<
    GameType,
    {
      gamesPlayed: number;
      highScore: number;
      totalScore: number;
      averageScore: number;
      lastPlayed: number;
    }
  >;
}

// ============================================================================
// GAME ENGINE INTERFACE
// ============================================================================

export interface IGameEngine {
  /** Get current game state */
  getState: () => GameState;

  /** Start a new game */
  startGame: (gameType: GameType, config?: Record<string, unknown>) => Promise<string>;

  /** Submit an answer/action */
  submitAnswer: (answer: string) => Promise<GameResult>;

  /** Get a hint */
  getHint: () => string | null;

  /** Skip current round */
  skipRound: () => Promise<GameResult>;

  /** End the current game */
  endGame: () => GameSession;

  /** Pause the game */
  pauseGame: () => void;

  /** Resume the game */
  resumeGame: () => void;

  /** Get game history */
  getHistory: () => GameHistory;
}
