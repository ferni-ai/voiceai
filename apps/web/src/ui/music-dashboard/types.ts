/**
 * Music Dashboard Types
 *
 * Type definitions for the Musical You dashboard.
 * These match the backend MusicInsights and MusicalYouProfile types.
 */

// ============================================================================
// INSIGHTS TYPES (from backend)
// ============================================================================

export interface PersonalitySummary {
  label: string;
  description: string;
  traits: Array<{
    trait: string;
    displayName: string;
    confidence: number;
    explanation: string;
  }>;
  coachingQuote: string;
}

export interface AffinityDisplay {
  category: string;
  displayName: string;
  accuracy: number;
  avgTimeSeconds: number;
  affinityScore: number;
  coachingNote: string;
}

export interface MilestoneDisplay {
  type: string;
  displayName: string;
  achievedAt: string;
  icon: string;
  description: string;
  celebrated: boolean;
}

export interface MemorableMoment {
  type: string;
  title: string;
  value: string;
  icon: string;
  coachingNote: string;
}

export interface JourneyStats {
  totalGames: number;
  totalRounds: number;
  totalMinutes: number;
  favoriteGame: string | null;
  favoriteGameDisplayName: string | null;
  gamesThisWeek: number;
  currentStreak: number;
  bestStreak: number;
  averageScore: number;
}

export interface PersonaPlayStats {
  personaId: string;
  displayName: string;
  gamesPlayed: number;
  lastPlayed: string | null;
}

export interface MusicInsights {
  hasData: boolean;
  gamesNeededForFullInsights: number;
  personality: PersonalitySummary | null;
  strengths: AffinityDisplay[];
  growthAreas: AffinityDisplay[];
  milestones: MilestoneDisplay[];
  nextMilestone: {
    type: string;
    displayName: string;
    description: string;
    progress: number;
  } | null;
  memorableMoments: MemorableMoment[];
  journeyStats: JourneyStats;
  personaStats: PersonaPlayStats[];
  coachingMessage: string;
  generatedAt: string;
}

// ============================================================================
// MUSICAL YOU PROFILE TYPES
// ============================================================================

export interface DailyChallenge {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  instructions: string;
  xpReward: number;
  participantCount: number;
  completionRate: number;
}

export interface DailyChallengeProgress {
  status: 'not-started' | 'in-progress' | 'completed' | 'failed';
  score?: number;
  xpEarned: number;
}

export interface TimeMachineEntry {
  category: string;
  displayName: string;
  type: 'genre' | 'decade';
  currentAffinity: number;
  milestone?: string;
}

export interface LeaderboardRank {
  rank: number;
  score: number;
  change: number;
}

export interface SocialStats {
  challengesSent: number;
  challengesReceived: number;
  challengesWon: number;
  currentLeaderboardRank: number | null;
}

export interface MusicSource {
  connected: boolean;
  gamesPlayed?: number;
  trackCount?: number;
  lastPlayed?: string | null;
  lastSynced?: string | null;
}

export interface MusicSources {
  games: MusicSource;
  spotify: MusicSource;
  appleMusic: MusicSource;
}

export interface MusicalYouProfile {
  dna: unknown;
  coachingMessage: string | null;
  timeMachine: TimeMachineEntry[];
  dailyChallenge: DailyChallenge;
  challengeStats: {
    totalCompleted: number;
    currentStreak: number;
    totalXpEarned: number;
  };
  socialStats: SocialStats;
  leaderboardRank: LeaderboardRank | null;
  musicSources?: MusicSources;
  spotifyConnected?: boolean;
  appleMusicConnected?: boolean;
}

// ============================================================================
// CALLBACK TYPES
// ============================================================================

export interface MusicDashboardUICallbacks {
  onClose?: () => void;
  onPlayGame?: (gameType: string) => void;
  onShareCard?: (cardType: string) => void;
  onStartChallenge?: (challengeId: string) => void;
  onViewLeaderboard?: () => void;
}

// ============================================================================
// MUSICKIT TYPE (Apple Music)
// ============================================================================

export interface MusicKitType {
  configure(config: {
    developerToken: string;
    app: { name: string; build: string };
  }): Promise<void>;
  getInstance(): {
    authorize(): Promise<string>;
  };
}

