/**
 * Roadmap/Seeds Types
 *
 * Types for the feature voting and seeds economy system.
 */

// ============================================================================
// SEED ECONOMY TYPES
// ============================================================================

export interface UserSeeds {
  userId: string;
  balance: number;
  lifetimePlanted: number;
  lifetimeEarned: number;
  featuresUnlocked: string[];
  earnedFrom: {
    conversations: number;
    streaks: number;
    referrals: number;
    feedback: number;
    suggestionsAccepted: number;
    featuresBloomed: number;
  };
}

export type SeedSource = keyof UserSeeds['earnedFrom'];

// ============================================================================
// FEATURE TYPES
// ============================================================================

export interface FeatureVote {
  userId: string;
  featureId: string;
  seedsPlanted: number;
  createdAt: Date;
}

export interface FeatureSuggestion {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: 'pending' | 'reviewing' | 'accepted' | 'declined';
  seedsReceived: number;
  votedByUsers: string[];
  createdAt: Date;
  reviewedAt?: Date;
  reviewerNotes?: string;
}

export interface FeatureWithVotes {
  id: string;
  title: string;
  description: string;
  status: 'planned' | 'in-progress' | 'coming-soon' | 'launched' | 'community';
  seedsPlanted: number;
  voterCount: number;
  bloomThreshold: number;
  userVoted: boolean;
  userSeedsPlanted: number;
  category: string;
  priority?: number;
  estimatedDate?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_SEED_BALANCE = 5;

export const SEEDS_PER_CONVERSATION = 1;
export const SEEDS_PER_SUGGESTION_ACCEPTED = 10;
export const SEEDS_PER_REFERRAL = 3;
export const SEEDS_PER_FEEDBACK = 2;
export const SEEDS_PER_FEATURE_BLOOMED = 5;

export const STREAK_REWARDS = {
  3: 2, // 3-day streak: 2 seeds
  7: 5, // 7-day streak: 5 seeds
  30: 15, // 30-day streak: 15 seeds
} as const;

export const MIN_BLOOM_THRESHOLD = 100;
export const DEFAULT_BLOOM_THRESHOLD = 500;
