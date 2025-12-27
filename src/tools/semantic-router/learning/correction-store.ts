/**
 * Correction Store - Active Learning Foundation
 *
 * Stores routing corrections to learn from mistakes.
 * This is the foundation for "better than human" - we improve over time.
 *
 * NOW WITH FIRESTORE PERSISTENCE - corrections survive server restarts!
 *
 * @module tools/semantic-router/learning/correction-store
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import {
  initializeFirestorePersistence,
  isPersistenceAvailable,
  saveCorrection as persistCorrection,
  loadCorrections as loadPersistedCorrections,
  saveUserProfile as persistUserProfile,
  loadUserProfile as loadPersistedUserProfile,
  type PersistedCorrection,
  type PersistedUserProfile,
} from '../persistence/index.js';

const log = createLogger({ module: 'semantic-router:corrections' });

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingCorrection {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;

  // What happened
  originalQuery: string;
  normalizedQuery: string;
  predictedTool: string;
  predictedConfidence: number;
  predictedArgs: Record<string, unknown>;

  // What should have happened
  actualTool: string | null; // null if no tool should have been called
  actualArgs?: Record<string, unknown>;
  correctionSource: 'user_explicit' | 'user_implicit' | 'system';

  // Context
  conversationContext: string[];
  personaId: string;

  // Metadata
  feedbackType: 'wrong_tool' | 'wrong_args' | 'should_not_call' | 'missed_tool';
  userFeedback?: string;
}

export interface UserPreferences {
  userId: string;
  lastUpdated: Date;

  // Tool-specific adjustments (learned from corrections)
  toolBoosts: Map<string, number>; // toolId → confidence adjustment

  // Usage patterns
  frequentTools: string[]; // Most used tools
  recentTools: string[]; // Last 10 tools used
  toolUsageCount: Map<string, number>;

  // Time patterns
  morningTools: string[]; // Tools used 6am-12pm
  afternoonTools: string[]; // 12pm-6pm
  eveningTools: string[]; // 6pm-12am

  // Correction patterns
  commonMistakes: Array<{
    predictedTool: string;
    actualTool: string;
    count: number;
  }>;
}

// ============================================================================
// IN-MEMORY CACHE + FIRESTORE PERSISTENCE
// ============================================================================

// In-memory cache for fast access (also persisted to Firestore)
const corrections: RoutingCorrection[] = [];
const userPreferences = new Map<string, UserPreferences>();

// Track users whose preferences need to be saved
const dirtyUserProfiles = new Set<string>();
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Initialize persistence on module load
let persistenceInitialized = false;

/**
 * Initialize persistence and load existing corrections
 */
export async function initializeCorrectionStore(): Promise<void> {
  if (persistenceInitialized) return;

  try {
    await initializeFirestorePersistence();
    persistenceInitialized = true;

    if (isPersistenceAvailable()) {
      // Load recent corrections into memory
      const recent = await loadPersistedCorrections({ limit: 1000 });
      for (const c of recent) {
        corrections.push({
          ...c,
          timestamp: c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp),
        });
      }
      log.info({ count: recent.length }, 'Loaded corrections from Firestore');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to initialize persistence - using in-memory only');
  }
}

// ============================================================================
// CORRECTION OPERATIONS
// ============================================================================

/**
 * Record a routing correction
 * Now persists to Firestore for cross-session learning!
 * Also reports to community learning for aggregated patterns.
 */
export function recordCorrection(correction: Omit<RoutingCorrection, 'id' | 'timestamp'>): void {
  const fullCorrection: RoutingCorrection = {
    ...correction,
    id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
  };

  // Add to in-memory cache
  corrections.push(fullCorrection);

  // Update user preferences based on correction
  updateUserPreferencesFromCorrection(fullCorrection);

  // Persist to Firestore (fire-and-forget)
  if (isPersistenceAvailable()) {
    const persisted: PersistedCorrection = {
      ...fullCorrection,
    };
    persistCorrection(persisted).catch((err) => {
      log.warn({ error: String(err) }, 'Failed to persist correction');
    });
  }

  // Report to community learning (fire-and-forget)
  // This aggregates patterns across all users to improve routing for everyone
  import('./community-learning.js')
    .then(({ reportCorrectionToCommunity }) => {
      void reportCorrectionToCommunity(fullCorrection);
    })
    .catch(() => {
      // Community learning is optional - don't block on errors
    });

  log.info(
    {
      correctionId: fullCorrection.id,
      userId: correction.userId,
      predictedTool: correction.predictedTool,
      actualTool: correction.actualTool,
      feedbackType: correction.feedbackType,
      persisted: isPersistenceAvailable(),
    },
    'Routing correction recorded'
  );
}

/**
 * Record implicit correction (user used different tool after prediction)
 */
export function recordImplicitCorrection(
  userId: string,
  sessionId: string,
  originalQuery: string,
  predictedTool: string,
  actualToolUsed: string,
  personaId: string
): void {
  if (predictedTool === actualToolUsed) return; // Not a correction

  recordCorrection({
    userId,
    sessionId,
    originalQuery,
    normalizedQuery: originalQuery.toLowerCase().trim(),
    predictedTool,
    predictedConfidence: 0, // Unknown
    predictedArgs: {},
    actualTool: actualToolUsed,
    correctionSource: 'user_implicit',
    conversationContext: [],
    personaId,
    feedbackType: 'wrong_tool',
  });
}

/**
 * Get corrections for analysis
 */
export function getCorrections(options?: {
  userId?: string;
  toolId?: string;
  since?: Date;
  limit?: number;
}): RoutingCorrection[] {
  let result = [...corrections];

  if (options?.userId) {
    result = result.filter((c) => c.userId === options.userId);
  }
  if (options?.toolId) {
    const toolId = options.toolId;
    result = result.filter((c) => c.predictedTool === toolId || c.actualTool === toolId);
  }
  if (options?.since) {
    const since = options.since;
    result = result.filter((c) => c.timestamp >= since);
  }

  // Sort by timestamp descending
  result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (options?.limit) {
    result = result.slice(0, options.limit);
  }

  return result;
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * Get user preferences for routing personalization
 * Loads from Firestore on first access, then caches in memory
 */
export function getUserPreferences(userId: string): UserPreferences {
  let prefs = userPreferences.get(userId);

  if (!prefs) {
    prefs = {
      userId,
      lastUpdated: new Date(),
      toolBoosts: new Map(),
      frequentTools: [],
      recentTools: [],
      toolUsageCount: new Map(),
      morningTools: [],
      afternoonTools: [],
      eveningTools: [],
      commonMistakes: [],
    };
    userPreferences.set(userId, prefs);

    // Try to load from Firestore in background (don't block)
    if (isPersistenceAvailable()) {
      loadPersistedUserProfile(userId)
        .then((persisted) => {
          if (persisted) {
            // Merge persisted data into in-memory cache
            const existing = userPreferences.get(userId);
            if (existing) {
              existing.toolBoosts = new Map(Object.entries(persisted.toolBoosts || {}));
              existing.frequentTools = persisted.vocabulary
                ? Object.keys(persisted.vocabulary).slice(0, 10)
                : [];
              existing.lastUpdated = persisted.lastUpdated;
              log.debug({ userId }, 'Loaded user preferences from Firestore');
            }
          }
        })
        .catch((err) => {
          log.debug({ error: String(err), userId }, 'Failed to load persisted preferences');
        });
    }
  }

  return prefs;
}

/**
 * Get user preferences asynchronously (ensures Firestore data is loaded)
 */
export async function getUserPreferencesAsync(userId: string): Promise<UserPreferences> {
  let prefs = userPreferences.get(userId);

  if (!prefs) {
    // Try to load from Firestore first
    if (isPersistenceAvailable()) {
      const persisted = await loadPersistedUserProfile(userId);
      if (persisted) {
        prefs = {
          userId,
          lastUpdated: persisted.lastUpdated,
          toolBoosts: new Map(Object.entries(persisted.toolBoosts || {})),
          frequentTools: [],
          recentTools: [],
          toolUsageCount: new Map(),
          morningTools: [],
          afternoonTools: [],
          eveningTools: [],
          commonMistakes: [],
        };
        userPreferences.set(userId, prefs);
        log.debug({ userId }, 'Loaded user preferences from Firestore');
        return prefs;
      }
    }

    // Create new preferences
    prefs = {
      userId,
      lastUpdated: new Date(),
      toolBoosts: new Map(),
      frequentTools: [],
      recentTools: [],
      toolUsageCount: new Map(),
      morningTools: [],
      afternoonTools: [],
      eveningTools: [],
      commonMistakes: [],
    };
    userPreferences.set(userId, prefs);
  }

  return prefs;
}

/**
 * Record tool usage (for learning preferences)
 */
export function recordToolUsage(userId: string, toolId: string): void {
  const prefs = getUserPreferences(userId);

  // Update usage count
  const currentCount = prefs.toolUsageCount.get(toolId) || 0;
  prefs.toolUsageCount.set(toolId, currentCount + 1);

  // Update recent tools
  prefs.recentTools = [toolId, ...prefs.recentTools.filter((t) => t !== toolId)].slice(0, 10);

  // Update frequent tools
  const usageCounts = Array.from(prefs.toolUsageCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  prefs.frequentTools = usageCounts.map(([id]) => id);

  // Update time-of-day patterns
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) {
    if (!prefs.morningTools.includes(toolId)) {
      prefs.morningTools = [...prefs.morningTools, toolId].slice(-10);
    }
  } else if (hour >= 12 && hour < 18) {
    if (!prefs.afternoonTools.includes(toolId)) {
      prefs.afternoonTools = [...prefs.afternoonTools, toolId].slice(-10);
    }
  } else {
    if (!prefs.eveningTools.includes(toolId)) {
      prefs.eveningTools = [...prefs.eveningTools, toolId].slice(-10);
    }
  }

  prefs.lastUpdated = new Date();
}

/**
 * Update user preferences based on a correction
 */
function updateUserPreferencesFromCorrection(correction: RoutingCorrection): void {
  const prefs = getUserPreferences(correction.userId);

  // Decrease confidence for predicted tool
  const currentBoost = prefs.toolBoosts.get(correction.predictedTool) || 0;
  prefs.toolBoosts.set(correction.predictedTool, Math.max(currentBoost - 0.05, -0.3));

  // Increase confidence for actual tool (if any)
  if (correction.actualTool) {
    const actualBoost = prefs.toolBoosts.get(correction.actualTool) || 0;
    prefs.toolBoosts.set(correction.actualTool, Math.min(actualBoost + 0.05, 0.3));
  }

  // Track common mistakes
  if (correction.actualTool) {
    const existingMistake = prefs.commonMistakes.find(
      (m) => m.predictedTool === correction.predictedTool && m.actualTool === correction.actualTool
    );

    if (existingMistake) {
      existingMistake.count++;
    } else {
      prefs.commonMistakes.push({
        predictedTool: correction.predictedTool,
        actualTool: correction.actualTool,
        count: 1,
      });
    }

    // Keep only top 20 common mistakes
    prefs.commonMistakes.sort((a, b) => b.count - a.count);
    prefs.commonMistakes = prefs.commonMistakes.slice(0, 20);
  }

  prefs.lastUpdated = new Date();

  // Mark profile as dirty and schedule debounced save
  markProfileDirty(correction.userId);
}

/**
 * Mark a user profile as needing to be saved
 */
function markProfileDirty(userId: string): void {
  dirtyUserProfiles.add(userId);
  scheduleDebouncedSave();
}

/**
 * Schedule a debounced save of all dirty profiles
 */
function scheduleDebouncedSave(): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(() => {
    void saveDirtyProfiles();
    saveDebounceTimer = null;
  }, 30000); // 30 second debounce
}

/**
 * Save all dirty user profiles to Firestore
 */
async function saveDirtyProfiles(): Promise<void> {
  if (!isPersistenceAvailable() || dirtyUserProfiles.size === 0) {
    return;
  }

  const userIds = Array.from(dirtyUserProfiles);
  dirtyUserProfiles.clear();

  for (const userId of userIds) {
    const prefs = userPreferences.get(userId);
    if (!prefs) continue;

    try {
      const persisted: PersistedUserProfile = {
        userId,
        toolBoosts: Object.fromEntries(prefs.toolBoosts),
        vocabulary: {}, // Vocabulary is stored elsewhere
        timePatterns: {},
        contextPatterns: {},
        totalInteractions: prefs.toolUsageCount.size,
        lastUpdated: prefs.lastUpdated,
        correctionRate: 0.1, // Default
      };

      await persistUserProfile(persisted);
      log.debug({ userId }, 'Saved user preferences to Firestore');
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to save user preferences');
      // Re-mark as dirty for retry
      dirtyUserProfiles.add(userId);
    }
  }
}

/**
 * Force save all dirty profiles immediately (call on shutdown)
 */
export async function flushDirtyProfiles(): Promise<void> {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  await saveDirtyProfiles();
}

/**
 * Get confidence adjustment for a tool based on user history
 */
export function getToolBoostForUser(userId: string, toolId: string): number {
  const prefs = getUserPreferences(userId);
  let boost = prefs.toolBoosts.get(toolId) || 0;

  // Time-of-day boost
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12 && prefs.morningTools.includes(toolId)) {
    boost += 0.05;
  } else if (hour >= 12 && hour < 18 && prefs.afternoonTools.includes(toolId)) {
    boost += 0.05;
  } else if (prefs.eveningTools.includes(toolId)) {
    boost += 0.05;
  }

  // Frequency boost (small)
  if (prefs.frequentTools.slice(0, 3).includes(toolId)) {
    boost += 0.03;
  }

  // Recency boost (small)
  if (prefs.recentTools.slice(0, 3).includes(toolId)) {
    boost += 0.02;
  }

  return boost;
}

// ============================================================================
// ANALYTICS
// ============================================================================

export interface CorrectionAnalytics {
  totalCorrections: number;
  correctionsByType: Record<string, number>;
  correctionsByTool: Record<string, number>;
  accuracyTrend: Array<{ date: string; accuracy: number }>;
  topMistakes: Array<{ predicted: string; actual: string; count: number }>;
}

/**
 * Get correction analytics
 */
export function getCorrectionAnalytics(options?: {
  userId?: string;
  since?: Date;
}): CorrectionAnalytics {
  const filtered = getCorrections(options);

  // Group by type
  const byType: Record<string, number> = {};
  const byTool: Record<string, number> = {};
  const mistakes: Record<string, number> = {};

  for (const c of filtered) {
    byType[c.feedbackType] = (byType[c.feedbackType] || 0) + 1;
    byTool[c.predictedTool] = (byTool[c.predictedTool] || 0) + 1;

    if (c.actualTool) {
      const key = `${c.predictedTool}→${c.actualTool}`;
      mistakes[key] = (mistakes[key] || 0) + 1;
    }
  }

  // Top mistakes
  const topMistakes = Object.entries(mistakes)
    .map(([key, count]) => {
      const [predicted, actual] = key.split('→');
      return { predicted, actual, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalCorrections: filtered.length,
    correctionsByType: byType,
    correctionsByTool: byTool,
    accuracyTrend: [], // TODO: Calculate from routing logs
    topMistakes,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { corrections as _corrections }; // For testing only
