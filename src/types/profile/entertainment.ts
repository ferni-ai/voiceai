/**
 * Entertainment Aggregate
 *
 * User's music and game preferences learned over time.
 * These make Ferni feel like they truly know the user.
 */

// ============================================================================
// MUSIC MEMORY
// ============================================================================

/**
 * Music preferences learned across sessions
 */
export interface MusicMemory {
  /** Artists they've requested or enjoyed */
  favoriteArtists: string[];
  /** Genres they gravitate toward */
  favoriteGenres: string[];
  /** Artists/genres they've skipped or disliked */
  dislikedArtists: string[];
  /** Total tracks played across all sessions */
  totalTracksPlayed: number;
  /** Last artist played */
  lastPlayedArtist?: string;
  /** Last track played */
  lastPlayedTrack?: string;
  /** Time of day they usually listen */
  preferredMusicTimes?: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
  /** Moods when they tend to want music */
  musicMoods?: string[];
  /** Music preferences by mood */
  moodMusicPreferences?: Record<string, string[]>;
  /** Special music moments shared */
  sharedMoments?: Array<{
    description: string;
    artist: string;
    timestamp: number;
  }>;
  /** Last updated */
  updatedAt?: Date;
}

// ============================================================================
// GAME MEMORY
// ============================================================================

/**
 * Stats for a specific game type
 */
export interface GameTypeStats {
  gamesPlayed: number;
  highScore: number;
  totalScore: number;
  averageScore: number;
  lastPlayed: Date;
  winRate?: number;
}

/**
 * A single game session record
 */
export interface GameSessionRecord {
  gameType: string;
  score: number;
  roundsPlayed: number;
  durationSeconds: number;
  playedAt: Date;
  personaId: string;
  highlights?: string[];
}

/**
 * Affinity score for a genre or decade
 */
export interface AffinityScore {
  category: string;
  correctGuesses: number;
  totalAttempts: number;
  avgGuessTimeMs: number;
  successRate: number;
  affinityScore: number;
}

/**
 * Game milestone achievement
 */
export interface GameMilestone {
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
  achievedAt: Date;
  gameType: string;
  context?: string;
  celebrated: boolean;
}

/**
 * Musical personality trait
 */
export interface MusicalPersonalityTrait {
  trait:
    | 'nostalgic'
    | 'eclectic'
    | 'genre_loyal'
    | 'decade_specialist'
    | 'quick_ear'
    | 'thoughtful'
    | 'adventurous'
    | 'classic_lover'
    | 'deep_cuts_fan'
    | 'lyric_focused'
    | 'vibe_chaser';
  confidence: number;
  evidence: string[];
  updatedAt: Date;
}

/**
 * Complete game memory for a user
 */
export interface GameMemory {
  gameStats: Record<string, GameTypeStats>;
  recentGames: GameSessionRecord[];
  favoriteGames: string[];
  totalGamesPlayed: number;
  lastGamePlayed?: {
    gameType: string;
    playedAt: Date;
    score: number;
  };
  songsGuessedCorrectly?: string[];
  desertIslandPicks?: string[];
  genreAffinities?: Record<string, AffinityScore>;
  decadeAffinities?: Record<string, AffinityScore>;
  fastestGuessMs?: number;
  fastestGuessSong?: string;
  currentStreak?: number;
  bestStreak?: number;
  milestones?: GameMilestone[];
  musicalPersonality?: MusicalPersonalityTrait[];
  preferredDifficulty?: 'easy' | 'medium' | 'hard' | 'adaptive';
  adaptiveDifficultyMultiplier?: number;
  updatedAt: Date;
}

// ============================================================================
// ENTERTAINMENT PROFILE
// ============================================================================

/**
 * Complete entertainment profile
 */
export interface EntertainmentProfile {
  music?: MusicMemory;
  games?: GameMemory;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create default entertainment profile
 */
export function createEntertainmentProfile(): EntertainmentProfile {
  return {
    music: {
      favoriteArtists: [],
      favoriteGenres: [],
      dislikedArtists: [],
      totalTracksPlayed: 0,
    },
    games: {
      gameStats: {},
      recentGames: [],
      favoriteGames: [],
      totalGamesPlayed: 0,
      updatedAt: new Date(),
    },
  };
}
