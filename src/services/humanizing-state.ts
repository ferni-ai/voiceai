/**
 * Humanizing State Service
 *
 * Persists humanizing context across sessions for genuine relationship depth.
 * This enables:
 * - Never repeating the same spontaneous story
 * - Remembering mood patterns
 * - Tracking relationship milestones
 * - Building genuine connection over time
 */

import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile } from '../types/user-profile.js';
import type { MoodState, RelationshipStage } from '../intelligence/context-builders/humanizing.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HumanizingStateUpdate {
  /** New share tags used this session */
  newShareTags?: string[];

  /** Spontaneous shares made this session */
  spontaneousShareCount?: number;

  /** Current mood state */
  currentMood?: MoodState;

  /** Stories told this session */
  storiesTold?: string[];

  /** Hot takes shared this session */
  hotTakesShared?: string[];

  /** Inner world content revealed */
  innerWorldRevealed?: Array<{
    type: string;
    content: string;
  }>;

  /** Relationship transition that occurred */
  relationshipTransition?: {
    from: RelationshipStage;
    to: RelationshipStage;
    acknowledged: boolean;
  };

  /** Session ID for tracking */
  sessionId: string;
}

export interface HumanizingState {
  usedShareTags: string[];
  totalSpontaneousShares: number;
  lastMood?: MoodState;
  moodHistory: Array<{
    mood: string;
    timestamp: Date;
    sessionId: string;
  }>;
  storiesTold: string[];
  hotTakesShared: string[];
  innerWorldRevealed: Array<{
    type: string;
    content: string;
    sharedAt: Date;
  }>;
  relationshipMilestones: Array<{
    from: string;
    to: string;
    timestamp: Date;
    acknowledgmentGiven: boolean;
  }>;
  vulnerabilityMoments: number;
  updatedAt: Date;

  // Greeting repetition prevention
  usedGreetings: string[]; // Hash/ID of greetings used (keep last 20)
  lastGreetingAt?: Date;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Get humanizing state from user profile
 */
export function getHumanizingState(profile: UserProfile | null): HumanizingState {
  if (!profile?.humanizingState) {
    return createDefaultHumanizingState();
  }

  return {
    usedShareTags: profile.humanizingState.usedShareTags || [],
    totalSpontaneousShares: profile.humanizingState.totalSpontaneousShares || 0,
    lastMood: profile.humanizingState.lastMood,
    moodHistory: profile.humanizingState.moodHistory || [],
    storiesTold: profile.humanizingState.storiesTold || [],
    hotTakesShared: profile.humanizingState.hotTakesShared || [],
    innerWorldRevealed: profile.humanizingState.innerWorldRevealed || [],
    relationshipMilestones: profile.humanizingState.relationshipMilestones || [],
    vulnerabilityMoments: profile.humanizingState.vulnerabilityMoments || 0,
    updatedAt: profile.humanizingState.updatedAt || new Date(),
    usedGreetings: (profile.humanizingState as { usedGreetings?: string[] }).usedGreetings || [],
    lastGreetingAt: (profile.humanizingState as { lastGreetingAt?: Date }).lastGreetingAt,
  };
}

/**
 * Create default humanizing state for new users
 */
function createDefaultHumanizingState(): HumanizingState {
  return {
    usedShareTags: [],
    totalSpontaneousShares: 0,
    lastMood: undefined,
    moodHistory: [],
    storiesTold: [],
    hotTakesShared: [],
    innerWorldRevealed: [],
    relationshipMilestones: [],
    vulnerabilityMoments: 0,
    updatedAt: new Date(),
    usedGreetings: [],
    lastGreetingAt: undefined,
  };
}

/**
 * Merge session updates into existing humanizing state
 */
export function mergeHumanizingStateUpdate(
  existing: HumanizingState,
  update: HumanizingStateUpdate
): HumanizingState {
  const now = new Date();

  // Merge share tags (dedupe)
  const mergedTags = [...new Set([...existing.usedShareTags, ...(update.newShareTags || [])])];

  // Merge stories (dedupe)
  const mergedStories = [...new Set([...existing.storiesTold, ...(update.storiesTold || [])])];

  // Merge hot takes (dedupe)
  const mergedHotTakes = [
    ...new Set([...existing.hotTakesShared, ...(update.hotTakesShared || [])]),
  ];

  // Merge inner world revealed
  const mergedInnerWorld = [
    ...existing.innerWorldRevealed,
    ...(update.innerWorldRevealed || []).map((item) => ({
      ...item,
      sharedAt: now,
    })),
  ];

  // Update mood history (keep last 10)
  const updatedMoodHistory = [...existing.moodHistory];
  if (update.currentMood) {
    updatedMoodHistory.push({
      mood: update.currentMood,
      timestamp: now,
      sessionId: update.sessionId,
    });
  }
  // Keep only last 10 entries
  const trimmedMoodHistory = updatedMoodHistory.slice(-10);

  // Add relationship milestone if there was a transition
  const updatedMilestones = [...existing.relationshipMilestones];
  if (update.relationshipTransition) {
    updatedMilestones.push({
      from: update.relationshipTransition.from,
      to: update.relationshipTransition.to,
      timestamp: now,
      acknowledgmentGiven: update.relationshipTransition.acknowledged,
    });
  }

  return {
    usedShareTags: mergedTags,
    totalSpontaneousShares: existing.totalSpontaneousShares + (update.spontaneousShareCount || 0),
    lastMood: update.currentMood || existing.lastMood,
    moodHistory: trimmedMoodHistory,
    storiesTold: mergedStories,
    hotTakesShared: mergedHotTakes,
    innerWorldRevealed: mergedInnerWorld.slice(-50), // Keep last 50
    relationshipMilestones: updatedMilestones,
    vulnerabilityMoments: existing.vulnerabilityMoments + (update.innerWorldRevealed?.length || 0),
    usedGreetings: existing.usedGreetings, // Preserve greetings (managed separately)
    lastGreetingAt: existing.lastGreetingAt,
    updatedAt: now,
  };
}

/**
 * Apply humanizing state to user profile
 */
export function applyHumanizingStateToProfile(
  profile: UserProfile,
  state: HumanizingState
): UserProfile {
  return {
    ...profile,
    humanizingState: {
      usedShareTags: state.usedShareTags,
      totalSpontaneousShares: state.totalSpontaneousShares,
      lastMood: state.lastMood,
      moodHistory: state.moodHistory,
      storiesTold: state.storiesTold,
      hotTakesShared: state.hotTakesShared,
      innerWorldRevealed: state.innerWorldRevealed,
      relationshipMilestones: state.relationshipMilestones,
      vulnerabilityMoments: state.vulnerabilityMoments,
      usedGreetings: state.usedGreetings,
      lastGreetingAt: state.lastGreetingAt,
      updatedAt: state.updatedAt,
    },
    updatedAt: new Date(),
  };
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Check if a story has already been told to this user
 */
export function hasStoryBeenTold(state: HumanizingState, storyId: string): boolean {
  return state.storiesTold.includes(storyId);
}

/**
 * Check if a hot take has already been shared with this user
 */
export function hasHotTakeBeenShared(state: HumanizingState, tags: string[]): boolean {
  return tags.some((tag) => state.hotTakesShared.includes(tag));
}

/**
 * Check if share tags have been used (to avoid repetition)
 */
export function haveShareTagsBeenUsed(state: HumanizingState, tags: string[]): boolean {
  return tags.some((tag) => state.usedShareTags.includes(tag));
}

/**
 * Get mood trend (is user's experience with persona getting better?)
 */
export function getMoodTrend(
  state: HumanizingState
): 'improving' | 'stable' | 'declining' | 'unknown' {
  if (state.moodHistory.length < 3) {
    return 'unknown';
  }

  const recentMoods = state.moodHistory.slice(-5);
  const moodScores: Record<string, number> = {
    energized: 0.9,
    playful: 0.85,
    grounded: 0.7,
    reflective: 0.65,
    philosophical: 0.6,
    nostalgic: 0.55,
    tired_but_present: 0.4,
  };

  const scores = recentMoods.map((m) => moodScores[m.mood] || 0.5);
  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = secondAvg - firstAvg;

  if (diff > 0.1) return 'improving';
  if (diff < -0.1) return 'declining';
  return 'stable';
}

/**
 * Get relationship depth score (0-100)
 */
export function getRelationshipDepthScore(state: HumanizingState): number {
  let score = 0;

  // Base score from milestones
  score += state.relationshipMilestones.length * 15;

  // Vulnerability moments
  score += Math.min(state.vulnerabilityMoments * 5, 25);

  // Inner world revealed
  score += Math.min(state.innerWorldRevealed.length * 3, 20);

  // Total spontaneous shares
  score += Math.min(state.totalSpontaneousShares * 2, 20);

  // Mood history (indicates sustained engagement)
  score += Math.min(state.moodHistory.length * 2, 20);

  return Math.min(score, 100);
}

/**
 * Log humanizing state summary
 */
export function logHumanizingStateSummary(state: HumanizingState, userId: string): void {
  getLogger().info(
    {
      userId,
      totalShares: state.totalSpontaneousShares,
      storiesCount: state.storiesTold.length,
      tagsUsed: state.usedShareTags.length,
      milestones: state.relationshipMilestones.length,
      depthScore: getRelationshipDepthScore(state),
      moodTrend: getMoodTrend(state),
    },
    '🎭 Humanizing state summary'
  );
}

// ============================================================================
// GREETING REPETITION PREVENTION
// ============================================================================

/**
 * Generate a simple hash for a greeting to track usage
 */
export function hashGreeting(greeting: string): string {
  // Simple hash: first 50 chars + length
  const normalized = greeting
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .trim();
  return `${normalized.substring(0, 50)}_${normalized.length}`;
}

/**
 * Check if a greeting has been used recently
 */
export function hasGreetingBeenUsed(state: HumanizingState, greeting: string): boolean {
  const hash = hashGreeting(greeting);
  return state.usedGreetings.includes(hash);
}

/**
 * Record that a greeting was used
 */
export function recordGreetingUsage(state: HumanizingState, greeting: string): HumanizingState {
  const hash = hashGreeting(greeting);
  const now = new Date();

  // Add to used greetings, keep last 20
  const updatedGreetings = [...state.usedGreetings, hash].slice(-20);

  return {
    ...state,
    usedGreetings: updatedGreetings,
    lastGreetingAt: now,
    updatedAt: now,
  };
}

/**
 * Get list of greeting hashes that should be avoided
 */
export function getUsedGreetingHashes(state: HumanizingState): string[] {
  return state.usedGreetings;
}

export default {
  getHumanizingState,
  mergeHumanizingStateUpdate,
  applyHumanizingStateToProfile,
  hasStoryBeenTold,
  hasHotTakeBeenShared,
  haveShareTagsBeenUsed,
  getMoodTrend,
  getRelationshipDepthScore,
  logHumanizingStateSummary,
  // Greeting repetition prevention
  hashGreeting,
  hasGreetingBeenUsed,
  recordGreetingUsage,
  getUsedGreetingHashes,
};
