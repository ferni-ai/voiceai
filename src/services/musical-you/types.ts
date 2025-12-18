/**
 * Musical You - Type Definitions
 *
 * Types for the Musical You engagement system:
 * - Music games and DNA tracking
 * - Spotify deep integration
 * - Shareable identity cards
 * - Social/multiplayer features
 *
 * @module MusicalYou
 */

// ============================================================================
// MUSICAL DNA
// ============================================================================

export interface MusicalDNA {
  userId: string;

  // Personality
  personalityType: MusicalPersonalityType;
  personalityLabel: string;
  personalityDescription: string;

  // Affinities
  genreAffinities: GenreAffinity[];
  decadeAffinities: DecadeAffinity[];
  artistAffinities: ArtistAffinity[];

  // Behavioral traits
  traits: MusicalTrait[];

  // Computed scores
  overallScore: number;
  discoveryOpenness: number; // 0-1: How open to new music
  energyPreference: 'low' | 'medium' | 'high' | 'varies';
  lyricVsMelody: 'lyric-focused' | 'melody-focused' | 'balanced';
  soloVsSocial: 'private-listener' | 'social-sharer' | 'balanced';

  // Time-based
  peakListeningHours: number[]; // 0-23
  weekdayVsWeekend: 'weekday' | 'weekend' | 'balanced';

  // Journey
  totalGamesPlayed: number;
  totalMinutesPlayed: number;
  firstGameDate: Date | null;
  lastGameDate: Date | null;

  // Milestones
  milestones: MusicalMilestone[];
  nextMilestone: MusicalMilestone | null;

  updatedAt: Date;
}

export type MusicalPersonalityType =
  | 'nostalgic-explorer'
  | 'genre-specialist'
  | 'decade-devotee'
  | 'eclectic-wanderer'
  | 'deep-listener'
  | 'social-curator'
  | 'mood-master'
  | 'discovery-seeker';

export interface GenreAffinity {
  genre: string;
  displayName: string;
  accuracy: number; // 0-100
  avgGuessTimeMs: number;
  totalGuesses: number;
  correctGuesses: number;
  affinityScore: number; // 0-100 composite
  trend: 'improving' | 'stable' | 'declining';
}

export interface DecadeAffinity {
  decade: string; // "1980s", "1990s", etc.
  displayName: string;
  accuracy: number;
  avgGuessTimeMs: number;
  totalGuesses: number;
  affinityScore: number;
}

export interface ArtistAffinity {
  artistId: string;
  artistName: string;
  recognitionSpeed: number; // avg ms
  correctGuesses: number;
  isFavorite: boolean;
}

export interface MusicalTrait {
  trait: MusicalTraitType;
  displayName: string;
  confidence: number; // 0-1
  explanation: string;
  detectedFrom: string; // Which games/data
}

export type MusicalTraitType =
  | 'quick-recognizer'
  | 'deep-knowledge'
  | 'broad-taste'
  | 'era-specialist'
  | 'lyric-memorizer'
  | 'melody-matcher'
  | 'mood-sensitive'
  | 'consistent-performer'
  | 'clutch-player'
  | 'streak-builder';

export interface MusicalMilestone {
  id: string;
  type: MilestoneType;
  displayName: string;
  description: string;
  icon: string;
  achievedAt: Date | null;
  celebrated: boolean;
  progress?: number; // 0-100 for unachieved
}

export type MilestoneType =
  | 'first-game'
  | 'first-perfect'
  | 'games-10'
  | 'games-50'
  | 'games-100'
  | 'streak-3'
  | 'streak-7'
  | 'streak-14'
  | 'streak-30'
  | 'speed-demon' // < 1s guess
  | 'genre-master'
  | 'decade-master'
  | 'desert-island-complete'
  | 'social-butterfly' // 10 challenges sent
  | 'leaderboard-top10';

// ============================================================================
// SPOTIFY INTEGRATION
// ============================================================================

export interface SpotifyLibraryData {
  userId: string;
  spotifyUserId: string;
  connected: boolean;
  lastSyncedAt: Date | null;

  // Library summary
  savedTracksCount: number;
  savedAlbumsCount: number;
  playlistCount: number;
  followedArtistsCount: number;

  // Top items
  topArtists: SpotifyArtist[];
  topGenres: string[];
  topDecades: string[];

  // For games
  libraryTracks: SpotifyTrack[]; // Cached subset for games
  playableTracks: SpotifyTrack[]; // With preview URLs
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artistName: string;
  artistId: string;
  albumName: string;
  albumArt: string;
  previewUrl: string | null;
  uri: string;
  durationMs: number;
  popularity: number;
  releaseYear: number;
  genres: string[];
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  imageUrl: string;
  popularity: number;
}

export interface OurSongsPlaylist {
  spotifyPlaylistId: string | null;
  songs: OurSong[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OurSong {
  trackId: string;
  trackName: string;
  artistName: string;
  addedAt: Date;
  reason: string; // Why this became "our song"
  conversationContext?: string;
  spotifyUri?: string;
  appleMusicId?: string;
}

// ============================================================================
// SHAREABLE CARDS
// ============================================================================

export type CardType =
  | 'musical-dna'
  | 'desert-island'
  | 'game-victory'
  | 'weekly-recap'
  | 'milestone-achieved'
  | 'challenge-invite'
  | 'creative-profile'; // Creative You profile card

export interface ShareableCard {
  id: string;
  type: CardType;
  userId: string;

  // Card data (varies by type)
  data:
    | MusicalDNACardData
    | DesertIslandCardData
    | GameVictoryCardData
    | WeeklyRecapCardData
    | CreativeProfileCardData;

  // Generated assets
  imageUrl: string | null;
  shareUrl: string;

  // Metadata
  createdAt: Date;
  expiresAt: Date | null;
  viewCount: number;
}

export interface MusicalDNACardData {
  type: 'musical-dna';
  personalityLabel: string;
  personalityDescription: string;
  topGenres: Array<{ name: string; score: number }>;
  totalGames: number;
  currentStreak: number;
}

export interface DesertIslandCardData {
  type: 'desert-island';
  picks: Array<{
    rank: number;
    trackName: string;
    artistName: string;
    reason?: string;
  }>;
  curatedDate: Date;
}

export interface GameVictoryCardData {
  type: 'game-victory';
  gameType: string;
  gameDisplayName: string;
  score: number;
  guessTimeMs?: number;
  trackName?: string;
  artistName?: string;
  isPersonalBest: boolean;
}

export interface WeeklyRecapCardData {
  type: 'weekly-recap';
  weekOf: Date;
  gamesPlayed: number;
  totalMinutes: number;
  bestMoment: string;
  topGenreThisWeek: string;
  streakDays: number;
}

export interface CreativeProfileCardData {
  type: 'creative-profile';
  personalityLabel: string;
  personalityDescription: string;
  topTopics: Array<{ name: string; score: number }>;
  totalContent: number;
  insightsSaved: number;
  learningStyle: string;
}

// ============================================================================
// SOCIAL & MULTIPLAYER
// ============================================================================

export interface MusicChallenge {
  id: string;
  type: 'score-beat' | 'speed-beat' | 'head-to-head';
  gameType: string;
  challengerId: string;
  challengerName: string;
  challengerScore: number;
  challengerTime?: number;

  challengeeId: string;
  challengeeName?: string;
  challengeeScore?: number;
  challengeeTime?: number;

  status: 'pending' | 'accepted' | 'completed' | 'declined' | 'expired';
  winnerId?: string;

  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
}

export interface Leaderboard {
  type: 'weekly' | 'monthly' | 'all-time';
  gameType: string | 'overall';
  entries: LeaderboardEntry[];
  updatedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  score: number;
  gamesPlayed: number;
  bestStreak: number;
  change: number; // Position change from previous period
}

export interface TasteMatch {
  userId1: string;
  userId2: string;
  matchScore: number; // 0-100
  sharedGenres: string[];
  sharedArtists: string[];
  sharedDecades: string[];
  uniqueToUser1: string[];
  uniqueToUser2: string[];
  calculatedAt: Date;
}

// ============================================================================
// DAILY CHALLENGES
// ============================================================================

export interface DailyChallenge {
  id: string;
  date: string; // YYYY-MM-DD
  area: 'musical' | 'creative' | 'both';

  type: DailyChallengeType;
  title: string;
  description: string;
  instructions: string;

  // Game config
  gameType?: string;
  targetScore?: number;
  timeLimit?: number; // seconds

  // Rewards
  xpReward: number;
  streakBonus: boolean;
  specialReward?: string;

  // Participation
  participantCount: number;
  completionRate: number;
}

export type DailyChallengeType =
  | 'speed-round'
  | 'theme-day'
  | 'wildcard'
  | 'throwback'
  | 'mood-match'
  | 'social-challenge'
  | 'reflection';

export interface UserDailyChallengeProgress {
  challengeId: string;
  userId: string;
  status: 'not-started' | 'in-progress' | 'completed' | 'failed';
  score?: number;
  completedAt?: Date;
  xpEarned: number;
}

// ============================================================================
// MEMORABLE MOMENTS
// ============================================================================

export interface MemorableMoment {
  id: string;
  userId: string;
  type: MomentType;

  // Content
  title: string;
  value: string;
  icon: string;
  coachingNote: string;

  // Context
  gameType?: string;
  trackName?: string;
  artistName?: string;

  occurredAt: Date;
  celebrated: boolean;
}

export type MomentType =
  | 'fastest-guess'
  | 'longest-streak'
  | 'first-perfect-round'
  | 'genre-breakthrough'
  | 'decade-mastery'
  | 'comeback-victory'
  | 'clutch-moment'
  | 'discovery-moment';

// ============================================================================
// DESERT ISLAND DISCS
// ============================================================================

export interface DesertIslandPicks {
  userId: string;
  picks: DesertIslandSong[];
  completedAt: Date | null;
  lastUpdatedAt: Date;
  totalRevisions: number;
  isPublic: boolean;
}

export interface DesertIslandSong {
  rank: 1 | 2 | 3 | 4 | 5;
  trackId: string;
  trackName: string;
  artistName: string;
  reason: string;
  memory?: string; // Personal memory attached
  addedAt: Date;
  spotifyUri?: string;
  appleMusicId?: string;
}

// ============================================================================
// GAME ENHANCEMENTS
// ============================================================================

export interface FinishTheLyricRound {
  trackId: string;
  trackName: string;
  artistName: string;
  lyricSnippet: string; // The part Ferni sings
  correctContinuation: string; // What user should say
  alternatives: string[]; // Acceptable variations
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
}

export interface DecadeChallengeRound {
  trackId: string;
  trackName: string;
  artistName: string;
  correctDecade: string;
  previewUrl: string;
  hints: string[];
  points: number;
}

export interface MusicTriviaQuestion {
  id: string;
  category: 'artist' | 'song' | 'album' | 'history' | 'awards';
  question: string;
  correctAnswer: string;
  wrongAnswers: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  funFact?: string;
  points: number;
}
