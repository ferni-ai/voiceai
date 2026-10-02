/**
 * Game Memory Types
 *
 * Cross-session game history and musical DNA (genre/decade affinity) types
 * stored on the user profile. Re-exported from user-profile.ts.
 */

// ============================================================================
// GAME MEMORY (cross-session game history)
// ============================================================================

/** Stats for a specific game type */
export interface GameTypeStats {
  /** Total games played */
  gamesPlayed: number;
  /** All-time high score */
  highScore: number;
  /** Total points earned across all games */
  totalScore: number;
  /** Average score */
  averageScore: number;
  /** Last time this game was played */
  lastPlayed: Date;
  /** Win rate (for games with win/lose) */
  winRate?: number;
}

/** A single game session record */
export interface GameSessionRecord {
  /** Which game was played */
  gameType: string;
  /** Score achieved */
  score: number;
  /** Rounds played */
  roundsPlayed: number;
  /** Duration in seconds */
  durationSeconds: number;
  /** When it was played */
  playedAt: Date;
  /** Which persona played with them */
  personaId: string;
  /** Notable moments (e.g., "guessed Bohemian Rhapsody in 2 seconds!") */
  highlights?: string[];
}

// ============================================================================
// MUSICAL DNA - Genre/Decade affinity tracking
// ============================================================================

/** Affinity score for a genre or decade */
export interface AffinityScore {
  /** The category (genre or decade) */
  category: string;
  /** How many times they've guessed correctly in this category */
  correctGuesses: number;
  /** How many times they've been tested in this category */
  totalAttempts: number;
  /** Average guess time in milliseconds (lower = stronger affinity) */
  avgGuessTimeMs: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Overall affinity score (0-100) combining speed and accuracy */
  affinityScore: number;
}

/** Milestone achievement */
export interface GameMilestone {
  /** Milestone type */
  type:
    | 'first_game'
    | 'first_perfect_round'
    | 'ten_games'
    | 'fifty_games'
    | 'fastest_guess'
    | 'high_score_beaten'
    | 'genre_master'
    | 'decade_specialist'
    | 'streak_five'
    | 'streak_ten'
    | 'music_savant';
  /** When it was achieved */
  achievedAt: Date;
  /** Game it was achieved in */
  gameType: string;
  /** Additional context */
  context?: string;
  /** Has it been celebrated? */
  celebrated: boolean;
}

/** Musical personality trait */
export interface MusicalPersonalityTrait {
  /** The trait */
  trait:
    | 'nostalgic' // Picks emotional/meaningful songs
    | 'eclectic' // Wide variety of tastes
    | 'genre_loyal' // Sticks to favorite genres
    | 'decade_specialist' // Knows one era really well
    | 'quick_ear' // Fast guesser
    | 'thoughtful' // Takes time, high accuracy
    | 'adventurous' // Open to new music
    | 'classic_lover' // Loves timeless hits
    | 'deep_cuts_fan' // Knows obscure tracks
    | 'lyric_focused' // Remembers lyrics
    | 'vibe_chaser'; // Picks by mood
  /** Confidence in this trait (0-1) */
  confidence: number;
  /** Evidence for this trait */
  evidence: string[];
  /** When this was last updated */
  updatedAt: Date;
}

/** Guess timing record */
export interface GuessTimingRecord {
  /** Song or item guessed */
  item: string;
  /** Time to guess in milliseconds */
  guessTimeMs: number;
  /** Was it correct */
  correct: boolean;
  /** Genre if known */
  genre?: string;
  /** Decade if known */
  decade?: string;
  /** When this happened */
  timestamp: Date;
}

/** Complete game memory for a user */
export interface GameMemory {
  /** Stats by game type */
  gameStats: Record<string, GameTypeStats>;
  /** Recent game sessions (last 20) */
  recentGames: GameSessionRecord[];
  /** Favorite games (most played) */
  favoriteGames: string[];
  /** Total games played across all types */
  totalGamesPlayed: number;
  /** Last game played */
  lastGamePlayed?: {
    gameType: string;
    playedAt: Date;
    score: number;
  };
  /** Songs they've correctly guessed in Name That Tune */
  songsGuessedCorrectly?: string[];
  /** Their Desert Island picks (memorable!) */
  desertIslandPicks?: string[];

  // ============================================================================
  // 🎵 MUSICAL DNA - "More than human" tracking
  // ============================================================================

  /** Genre affinity scores */
  genreAffinities?: Record<string, AffinityScore>;
  /** Decade affinity scores */
  decadeAffinities?: Record<string, AffinityScore>;
  /** Recent guess timing records (for calculating averages) */
  recentGuessTimings?: GuessTimingRecord[];
  /** Fastest guess ever (milliseconds) */
  fastestGuessMs?: number;
  /** Fastest guess song */
  fastestGuessSong?: string;
  /** Current correct streak */
  currentStreak?: number;
  /** Best streak ever */
  bestStreak?: number;
  /** Milestones achieved */
  milestones?: GameMilestone[];
  /** Musical personality traits detected */
  musicalPersonality?: MusicalPersonalityTrait[];
  /** Difficulty preference (auto-adjusted) */
  preferredDifficulty?: 'easy' | 'medium' | 'hard' | 'adaptive';
  /** Current adaptive difficulty multiplier (0.5-2.0) */
  adaptiveDifficultyMultiplier?: number;
  /** Topics/themes mentioned in conversation that relate to music */
  conversationMusicHints?: Array<{
    topic: string;
    relatedArtists?: string[];
    relatedGenres?: string[];
    mentionedAt: Date;
  }>;

  /** Last updated */
  updatedAt: Date;
}
