/**
 * Profile Pruning Service
 *
 * Trims unbounded arrays in user profiles to prevent profile bloat.
 * Runs automatically at session end and as a scheduled job.
 *
 * Philosophy: Like human memory, we naturally let less important details
 * fade while preserving what matters. This service ensures profiles
 * stay lean while retaining emotionally significant memories.
 *
 * @module services/data-layer/profile-pruning
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { UserProfile, KeyMoment, EmotionalPattern, ConversationSummary } from '../../types/user-profile.js';

const log = createLogger({ module: 'ProfilePruning' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Pruning limits for each unbounded array in UserProfile
 */
export interface PruningConfig {
  /** Max emotional patterns to keep (most recent, preserving high-intensity) */
  maxEmotionalPatterns: number;
  /** Max key moments to keep (preserving high emotional weight) */
  maxKeyMoments: number;
  /** Max conversation summaries to keep */
  maxConversationSummaries: number;
  /** Max shared stories to keep */
  maxSharedStories: number;
  /** Max investment events to keep */
  maxInvestmentEvents: number;
  /** Max financial goals to keep (completed ones are pruned first) */
  maxFinancialGoals: number;
  /** Max life events to keep */
  maxLifeEvents: number;
  /** Max game sessions to keep */
  maxGameSessions: number;
  /** Max guess timing records to keep */
  maxGuessTimingRecords: number;
  /** Max game milestones to keep */
  maxGameMilestones: number;
  /** Days to keep emotional patterns (oldest are pruned) */
  emotionalPatternRetentionDays: number;
  /** Days to keep conversation summaries */
  conversationSummaryRetentionDays: number;
}

const DEFAULT_CONFIG: PruningConfig = {
  maxEmotionalPatterns: 100,
  maxKeyMoments: 50,
  maxConversationSummaries: 100,
  maxSharedStories: 50,
  maxInvestmentEvents: 100,
  maxFinancialGoals: 30,
  maxLifeEvents: 50,
  maxGameSessions: 50,
  maxGuessTimingRecords: 200,
  maxGameMilestones: 30,
  emotionalPatternRetentionDays: 90,
  conversationSummaryRetentionDays: 180,
};

// ============================================================================
// TYPES
// ============================================================================

export interface PruningResult {
  userId: string;
  profileModified: boolean;
  itemsPruned: {
    emotionalPatterns: number;
    keyMoments: number;
    conversationSummaries: number;
    sharedStories: number;
    investmentEvents: number;
    financialGoals: number;
    lifeEvents: number;
    gameSessions: number;
    guessTimingRecords: number;
    gameMilestones: number;
  };
  totalPruned: number;
  durationMs: number;
}

// ============================================================================
// PRUNING FUNCTIONS
// ============================================================================

/**
 * Prune emotional patterns - keep recent + high intensity
 */
function pruneEmotionalPatterns(
  patterns: EmotionalPattern[] | undefined,
  config: PruningConfig
): { pruned: EmotionalPattern[]; count: number } {
  if (!patterns || patterns.length === 0) {
    return { pruned: [], count: 0 };
  }

  const originalCount = patterns.length;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.emotionalPatternRetentionDays);

  // Filter by date first
  let filtered = patterns.filter((p) => new Date(p.timestamp) > cutoffDate);

  // If still too many, keep high intensity + most recent
  if (filtered.length > config.maxEmotionalPatterns) {
    // Sort by intensity (desc) then date (desc)
    filtered.sort((a, b) => {
      if (b.intensity !== a.intensity) return b.intensity - a.intensity;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Keep top N, but ensure we have recent ones
    const highIntensity = filtered.slice(0, Math.floor(config.maxEmotionalPatterns * 0.6));
    const recent = filtered
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, Math.floor(config.maxEmotionalPatterns * 0.4));

    // Merge and deduplicate
    const merged = new Map<string, EmotionalPattern>();
    [...highIntensity, ...recent].forEach((p) => {
      const key = `${p.timestamp}_${p.emotion}`;
      if (!merged.has(key)) merged.set(key, p);
    });

    filtered = Array.from(merged.values()).slice(0, config.maxEmotionalPatterns);
  }

  return {
    pruned: filtered,
    count: originalCount - filtered.length,
  };
}

/**
 * Prune key moments - preserve emotionally significant ones
 */
function pruneKeyMoments(
  moments: KeyMoment[] | undefined,
  config: PruningConfig
): { pruned: KeyMoment[]; count: number } {
  if (!moments || moments.length === 0) {
    return { pruned: [], count: 0 };
  }

  const originalCount = moments.length;

  if (moments.length <= config.maxKeyMoments) {
    return { pruned: moments, count: 0 };
  }

  // Weight factors for keeping moments
  const weightMap: Record<string, number> = {
    life_changing: 10,
    major: 8,
    meaningful: 5,
    routine: 1,
  };

  const typeWeight: Record<string, number> = {
    breakthrough: 8,
    milestone: 7,
    shared_vulnerability: 6,
    celebration: 5,
    decision: 4,
    concern: 3,
  };

  // Score each moment
  const scored = moments.map((m) => ({
    moment: m,
    score:
      (weightMap[m.emotionalWeight] || 1) * (typeWeight[m.type] || 1) +
      (m.followUpNeeded ? 5 : 0),
  }));

  // Sort by score (desc), then by date (desc)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.moment.timestamp).getTime() - new Date(a.moment.timestamp).getTime();
  });

  const pruned = scored.slice(0, config.maxKeyMoments).map((s) => s.moment);

  return {
    pruned,
    count: originalCount - pruned.length,
  };
}

/**
 * Prune conversation summaries - keep recent ones
 */
function pruneConversationSummaries(
  summaries: ConversationSummary[] | undefined,
  config: PruningConfig
): { pruned: ConversationSummary[]; count: number } {
  if (!summaries || summaries.length === 0) {
    return { pruned: [], count: 0 };
  }

  const originalCount = summaries.length;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.conversationSummaryRetentionDays);

  // Filter by date
  let filtered = summaries.filter((s) => new Date(s.timestamp) > cutoffDate);

  // Sort by date (desc) and take max
  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  filtered = filtered.slice(0, config.maxConversationSummaries);

  return {
    pruned: filtered,
    count: originalCount - filtered.length,
  };
}

/**
 * Generic array pruner - keeps most recent N items
 */
function pruneRecentArray<T extends { timestamp?: Date; createdAt?: Date; playedAt?: Date }>(
  items: T[] | undefined,
  maxItems: number,
  dateField: 'timestamp' | 'createdAt' | 'playedAt' = 'timestamp'
): { pruned: T[]; count: number } {
  if (!items || items.length === 0) {
    return { pruned: [], count: 0 };
  }

  const originalCount = items.length;

  if (items.length <= maxItems) {
    return { pruned: items, count: 0 };
  }

  // Sort by date (desc) and take max
  const sorted = [...items].sort((a, b) => {
    const dateA = a[dateField] as Date | undefined;
    const dateB = b[dateField] as Date | undefined;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const pruned = sorted.slice(0, maxItems);

  return {
    pruned,
    count: originalCount - pruned.length,
  };
}

// ============================================================================
// MAIN PRUNING FUNCTION
// ============================================================================

/**
 * Prune a user profile to remove unbounded growth
 * Returns a new profile object (does not mutate original)
 */
export function pruneProfile(
  profile: UserProfile,
  config: Partial<PruningConfig> = {}
): { profile: UserProfile; result: PruningResult } {
  const startTime = performance.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const result: PruningResult = {
    userId: profile.id,
    profileModified: false,
    itemsPruned: {
      emotionalPatterns: 0,
      keyMoments: 0,
      conversationSummaries: 0,
      sharedStories: 0,
      investmentEvents: 0,
      financialGoals: 0,
      lifeEvents: 0,
      gameSessions: 0,
      guessTimingRecords: 0,
      gameMilestones: 0,
    },
    totalPruned: 0,
    durationMs: 0,
  };

  // Clone profile to avoid mutation
  const prunedProfile = JSON.parse(JSON.stringify(profile)) as UserProfile;

  // Prune emotional patterns
  const emotionalResult = pruneEmotionalPatterns(prunedProfile.emotionalPatterns, cfg);
  if (emotionalResult.count > 0) {
    prunedProfile.emotionalPatterns = emotionalResult.pruned;
    result.itemsPruned.emotionalPatterns = emotionalResult.count;
    result.profileModified = true;
  }

  // Prune key moments
  const momentsResult = pruneKeyMoments(prunedProfile.keyMoments, cfg);
  if (momentsResult.count > 0) {
    prunedProfile.keyMoments = momentsResult.pruned;
    result.itemsPruned.keyMoments = momentsResult.count;
    result.profileModified = true;
  }

  // Prune conversation summaries
  const summariesResult = pruneConversationSummaries(prunedProfile.conversationSummaries, cfg);
  if (summariesResult.count > 0) {
    prunedProfile.conversationSummaries = summariesResult.pruned;
    result.itemsPruned.conversationSummaries = summariesResult.count;
    result.profileModified = true;
  }

  // Prune shared stories (simple recent pruning)
  if (prunedProfile.sharedStories && prunedProfile.sharedStories.length > cfg.maxSharedStories) {
    const storiesResult = pruneRecentArray(
      prunedProfile.sharedStories as Array<{ timestamp?: Date; createdAt?: Date; playedAt?: Date; sharedAt?: Date }>,
      cfg.maxSharedStories,
      'timestamp'
    );
    prunedProfile.sharedStories = storiesResult.pruned as typeof prunedProfile.sharedStories;
    result.itemsPruned.sharedStories = storiesResult.count;
    result.profileModified = true;
  }

  // Prune investment events
  if (prunedProfile.investmentEvents && prunedProfile.investmentEvents.length > cfg.maxInvestmentEvents) {
    const eventsResult = pruneRecentArray(prunedProfile.investmentEvents, cfg.maxInvestmentEvents);
    prunedProfile.investmentEvents = eventsResult.pruned;
    result.itemsPruned.investmentEvents = eventsResult.count;
    result.profileModified = true;
  }

  // Prune financial goals (keep active, prune old completed)
  // Note: UserProfile uses 'goals' for financial goals
  if (prunedProfile.goals && prunedProfile.goals.length > cfg.maxFinancialGoals) {
    // Keep all active, prune oldest completed/abandoned
    const active = prunedProfile.goals.filter(
      (g) => g.status === 'active' || g.status === 'on_track' || g.status === 'planning'
    );
    const inactive = prunedProfile.goals.filter(
      (g) => g.status === 'achieved' || g.status === 'abandoned' || g.status === 'behind'
    );

    const keepInactive = cfg.maxFinancialGoals - active.length;
    const prunedInactive = inactive
      .sort((a: typeof inactive[0], b: typeof inactive[0]) => 
        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      )
      .slice(0, Math.max(0, keepInactive));

    const originalCount = prunedProfile.goals.length;
    prunedProfile.goals = [...active, ...prunedInactive];
    const prunedCount = originalCount - prunedProfile.goals.length;

    if (prunedCount > 0) {
      result.itemsPruned.financialGoals = prunedCount;
      result.profileModified = true;
    }
  }

  // Prune life events
  if (prunedProfile.lifeEvents && prunedProfile.lifeEvents.length > cfg.maxLifeEvents) {
    const eventsResult = pruneRecentArray(prunedProfile.lifeEvents, cfg.maxLifeEvents, 'createdAt');
    prunedProfile.lifeEvents = eventsResult.pruned;
    result.itemsPruned.lifeEvents = eventsResult.count;
    result.profileModified = true;
  }

  // Prune game memory
  if (prunedProfile.gameMemory) {
    // Prune recent games
    if (prunedProfile.gameMemory.recentGames && prunedProfile.gameMemory.recentGames.length > cfg.maxGameSessions) {
      const gamesResult = pruneRecentArray(prunedProfile.gameMemory.recentGames, cfg.maxGameSessions, 'playedAt');
      prunedProfile.gameMemory.recentGames = gamesResult.pruned;
      result.itemsPruned.gameSessions = gamesResult.count;
      result.profileModified = true;
    }

    // Note: musicalDNA was removed from GameMemory type
    // Guess timing records are now stored directly in gameStats per game type

    // Prune milestones (keep celebrated ones)
    if (prunedProfile.gameMemory.milestones && prunedProfile.gameMemory.milestones.length > cfg.maxGameMilestones) {
      // Keep celebrated ones, prune oldest uncelebrated
      const celebrated = prunedProfile.gameMemory.milestones.filter((m) => m.celebrated);
      const uncelebrated = prunedProfile.gameMemory.milestones.filter((m) => !m.celebrated);

      const keepUncelebrated = cfg.maxGameMilestones - celebrated.length;
      const prunedUncelebrated = uncelebrated
        .sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
        .slice(0, Math.max(0, keepUncelebrated));

      const originalCount = prunedProfile.gameMemory.milestones.length;
      prunedProfile.gameMemory.milestones = [...celebrated, ...prunedUncelebrated];
      const prunedCount = originalCount - prunedProfile.gameMemory.milestones.length;

      if (prunedCount > 0) {
        result.itemsPruned.gameMilestones = prunedCount;
        result.profileModified = true;
      }
    }
  }

  // Calculate totals
  result.totalPruned = Object.values(result.itemsPruned).reduce((a, b) => a + b, 0);
  result.durationMs = Math.round(performance.now() - startTime);

  if (result.profileModified) {
    log.info(
      {
        userId: profile.id,
        totalPruned: result.totalPruned,
        breakdown: result.itemsPruned,
        durationMs: result.durationMs,
      },
      '✂️ Profile pruned'
    );
  }

  return { profile: prunedProfile, result };
}

// ============================================================================
// SCHEDULED PRUNING
// ============================================================================

/**
 * Prune all user profiles (scheduled job)
 */
export async function pruneAllProfiles(options?: {
  maxUsers?: number;
  dryRun?: boolean;
  config?: Partial<PruningConfig>;
}): Promise<{
  usersProcessed: number;
  usersModified: number;
  totalItemsPruned: number;
  durationMs: number;
  errors: string[];
}> {
  const startTime = performance.now();
  const isDryRun = options?.dryRun ?? false;
  const config = options?.config ?? {};

  const result = {
    usersProcessed: 0,
    usersModified: 0,
    totalItemsPruned: 0,
    durationMs: 0,
    errors: [] as string[],
  };

  try {
    const { getStore } = await import('../../memory/store-factory.js');
    const store = await getStore();

    // Get all users (with limit)
    const profiles = await store.listProfiles({ limit: options?.maxUsers ?? 1000 });

    log.info({ userCount: profiles.length, isDryRun }, '🧹 Starting profile pruning job');

    for (const profile of profiles) {
      try {
        const { profile: prunedProfile, result: pruneResult } = pruneProfile(profile, config);

        result.usersProcessed++;

        if (pruneResult.profileModified) {
          result.usersModified++;
          result.totalItemsPruned += pruneResult.totalPruned;

          if (!isDryRun) {
            await store.saveProfile(prunedProfile);
          }
        }
      } catch (error) {
        result.errors.push(`${profile.id}: ${String(error)}`);
      }
    }
  } catch (error) {
    result.errors.push(String(error));
    log.error({ error: String(error) }, 'Profile pruning job failed');
  }

  result.durationMs = Math.round(performance.now() - startTime);

  log.info(
    {
      usersProcessed: result.usersProcessed,
      usersModified: result.usersModified,
      totalItemsPruned: result.totalItemsPruned,
      durationMs: result.durationMs,
      errors: result.errors.length,
      isDryRun,
    },
    '🧹 Profile pruning job completed'
  );

  return result;
}

// ============================================================================
// SESSION HOOK
// ============================================================================

/**
 * Prune profile at session end (lightweight, fast)
 */
export async function pruneProfileOnSessionEnd(
  userId: string,
  options?: { saveImmediately?: boolean }
): Promise<PruningResult | null> {
  try {
    const { getStore } = await import('../../memory/store-factory.js');
    const store = await getStore();

    const profile = await store.getProfile(userId);
    if (!profile) return null;

    const { profile: prunedProfile, result } = pruneProfile(profile);

    if (result.profileModified && options?.saveImmediately !== false) {
      await store.saveProfile(prunedProfile);
    }

    return result;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to prune profile on session end');
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DEFAULT_CONFIG as DEFAULT_PRUNING_CONFIG };
