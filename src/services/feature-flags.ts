/**
 * Feature Flags Service
 *
 * Enables gradual rollout of trust systems with kill switches.
 * Supports:
 * - Global enable/disable
 * - Percentage-based rollout
 * - User-level overrides
 * - Real-time updates (no deploy required)
 *
 * @module FeatureFlags
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'FeatureFlags' });

// ============================================================================
// TYPES
// ============================================================================

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  percentage?: number; // Alias for rolloutPercentage
  type?: string; // Category type
  userOverrides: Map<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlagConfig {
  enabled: boolean;
  percentage: number;
  overrides?: Record<string, boolean>;
}

// ============================================================================
// TRUST SYSTEM FLAGS
// ============================================================================

export const TRUST_FLAGS = {
  // Core Systems (Original)
  'trust.reading-between-lines': 'Detect unspoken emotional cues',
  'trust.boundary-memory': 'Remember topics to avoid',
  'trust.growth-reflection': 'Notice user evolution over time',
  'trust.inside-jokes': 'Track shared moments for callbacks',
  'trust.small-wins': 'Celebrate effort and progress',
  'trust.thinking-of-you': 'Proactive check-ins',

  // Phase 12-17: Advanced Systems
  'trust.relationship-health': 'Relationship health scoring',
  'trust.conversation-starters': 'Context-aware greetings',
  'trust.life-events': 'Detect and track life events',
  'trust.response-tuning': 'Dynamic response style adjustment',
  'trust.celebration-momentum': 'Win streaks and momentum',
  'trust.sentiment-timeline': 'Emotional journey tracking',

  // Phase 24-29: Personalization
  'trust.voice-prosody': 'Voice pattern learning',
  'trust.journaling-prompts': 'Contextual journaling',
  'trust.seasonal-awareness': 'Seasonal pattern adaptation',
  'trust.learning-style': 'Learning style adaptation',
  'trust.insights-reports': 'Relationship insights reports',
  'trust.media-suggestions': 'Contextual media suggestions',

  // Infrastructure
  'trust.persistence': 'Save/load trust profiles',
  'trust.cross-device-sync': 'Real-time cross-device sync',
  'trust.notifications': 'Proactive notifications',
} as const;

export type TrustFlagId = keyof typeof TRUST_FLAGS;

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const flagCache = new Map<string, FlagConfig>();
let cacheInitialized = false;
let cacheLastUpdated = 0;
const CACHE_TTL_MS = 60000; // 1 minute

// Default configurations
const DEFAULT_FLAGS: Record<TrustFlagId, FlagConfig> = {
  // Core Systems - 100% rollout (stable)
  'trust.reading-between-lines': { enabled: true, percentage: 100 },
  'trust.boundary-memory': { enabled: true, percentage: 100 },
  'trust.growth-reflection': { enabled: true, percentage: 100 },
  'trust.inside-jokes': { enabled: true, percentage: 100 },
  'trust.small-wins': { enabled: true, percentage: 100 },
  'trust.thinking-of-you': { enabled: true, percentage: 100 },

  // Phase 12-17 - Gradual rollout
  'trust.relationship-health': { enabled: true, percentage: 50 },
  'trust.conversation-starters': { enabled: true, percentage: 50 },
  'trust.life-events': { enabled: true, percentage: 50 },
  'trust.response-tuning': { enabled: true, percentage: 25 },
  'trust.celebration-momentum': { enabled: true, percentage: 50 },
  'trust.sentiment-timeline': { enabled: true, percentage: 50 },

  // Phase 24-29 - Limited rollout
  'trust.voice-prosody': { enabled: true, percentage: 10 },
  'trust.journaling-prompts': { enabled: true, percentage: 25 },
  'trust.seasonal-awareness': { enabled: true, percentage: 25 },
  'trust.learning-style': { enabled: true, percentage: 10 },
  'trust.insights-reports': { enabled: true, percentage: 25 },
  'trust.media-suggestions': { enabled: true, percentage: 10 },

  // Infrastructure - 100% rollout
  'trust.persistence': { enabled: true, percentage: 100 },
  'trust.cross-device-sync': { enabled: true, percentage: 50 },
  'trust.notifications': { enabled: true, percentage: 25 },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if a feature flag is enabled for a specific user
 */
export function isEnabled(flagId: TrustFlagId, userId?: string): boolean {
  const config = getFlag(flagId);

  if (!config.enabled) {
    return false;
  }

  // Check user override first
  if (userId && config.overrides?.[userId] !== undefined) {
    return config.overrides[userId];
  }

  // Percentage-based rollout
  if (config.percentage < 100) {
    if (!userId) {
      // No userId - use percentage as probability
      return Math.random() * 100 < config.percentage;
    }

    // Deterministic based on userId hash
    const hash = hashUserId(userId, flagId);
    return hash < config.percentage;
  }

  return true;
}

/**
 * Get flag configuration
 */
export function getFlag(flagId: TrustFlagId): FlagConfig {
  // Check cache
  if (flagCache.has(flagId) && Date.now() - cacheLastUpdated < CACHE_TTL_MS) {
    return flagCache.get(flagId)!;
  }

  // Return default
  return DEFAULT_FLAGS[flagId] || { enabled: false, percentage: 0 };
}

/**
 * Get all flags with their current status
 */
export function getAllFlags(): Record<TrustFlagId, FlagConfig & { description: string }> {
  const result: Record<string, FlagConfig & { description: string }> = {};

  for (const [flagId, description] of Object.entries(TRUST_FLAGS)) {
    const config = getFlag(flagId as TrustFlagId);
    result[flagId] = {
      ...config,
      description,
    };
  }

  return result as Record<TrustFlagId, FlagConfig & { description: string }>;
}

/**
 * Update a flag configuration
 */
export async function setFlag(flagId: TrustFlagId, config: Partial<FlagConfig>): Promise<void> {
  const current = getFlag(flagId);
  const updated = { ...current, ...config };

  flagCache.set(flagId, updated);
  cacheLastUpdated = Date.now();

  // Persist to Firestore
  try {
    const db = getFirestore();
    await db
      .collection('feature_flags')
      .doc(flagId)
      .set(
        {
          ...updated,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    log.info({ flagId, config: updated }, '🚩 Feature flag updated');
  } catch (error) {
    log.warn({ error, flagId }, 'Failed to persist flag to Firestore');
  }
}

/**
 * Set user override for a flag
 */
export async function setUserOverride(
  flagId: TrustFlagId,
  userId: string,
  enabled: boolean
): Promise<void> {
  const config = getFlag(flagId);
  const overrides = { ...config.overrides, [userId]: enabled };

  await setFlag(flagId, { overrides });

  log.info({ flagId, userId, enabled }, '🚩 User override set');
}

/**
 * Remove user override
 */
export async function removeUserOverride(flagId: TrustFlagId, userId: string): Promise<void> {
  const config = getFlag(flagId);
  const overrides = { ...config.overrides };
  delete overrides[userId];

  await setFlag(flagId, { overrides });

  log.info({ flagId, userId }, '🚩 User override removed');
}

/**
 * Enable a flag for all users
 */
export async function enableFlag(flagId: TrustFlagId): Promise<void> {
  await setFlag(flagId, { enabled: true, percentage: 100 });
}

/**
 * Disable a flag for all users (kill switch)
 */
export async function disableFlag(flagId: TrustFlagId): Promise<void> {
  await setFlag(flagId, { enabled: false, percentage: 0 });
  log.warn({ flagId }, '⚠️ Feature flag KILLED');
}

/**
 * Set rollout percentage
 */
export async function setRolloutPercentage(flagId: TrustFlagId, percentage: number): Promise<void> {
  if (percentage < 0 || percentage > 100) {
    throw new Error('Percentage must be between 0 and 100');
  }

  await setFlag(flagId, { percentage });
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Enable all trust system flags
 */
export async function enableAllTrustFlags(): Promise<void> {
  for (const flagId of Object.keys(TRUST_FLAGS) as TrustFlagId[]) {
    await setFlag(flagId, { enabled: true, percentage: 100 });
  }

  log.info('🚩 All trust flags enabled');
}

/**
 * Disable all trust system flags (emergency kill switch)
 */
export async function disableAllTrustFlags(): Promise<void> {
  for (const flagId of Object.keys(TRUST_FLAGS) as TrustFlagId[]) {
    await setFlag(flagId, { enabled: false, percentage: 0 });
  }

  log.warn('⚠️ ALL TRUST FLAGS KILLED');
}

/**
 * Reset all flags to defaults
 */
export async function resetToDefaults(): Promise<void> {
  for (const [flagId, config] of Object.entries(DEFAULT_FLAGS)) {
    flagCache.set(flagId, config);
  }

  cacheLastUpdated = Date.now();
  log.info('🚩 All flags reset to defaults');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize feature flags from Firestore
 */
export async function initializeFeatureFlags(): Promise<void> {
  if (cacheInitialized) return;

  try {
    const db = getFirestore();
    const snapshot = await db.collection('feature_flags').get();

    for (const doc of snapshot.docs) {
      const data = doc.data() as FlagConfig;
      flagCache.set(doc.id, data);
    }

    cacheInitialized = true;
    cacheLastUpdated = Date.now();

    log.info({ flagCount: snapshot.size }, '🚩 Feature flags initialized');
  } catch (error) {
    log.warn({ error }, 'Failed to load flags from Firestore, using defaults');
    // Use defaults - already in DEFAULT_FLAGS
  }
}

/**
 * Refresh flags from Firestore
 */
export async function refreshFlags(): Promise<void> {
  cacheInitialized = false;
  await initializeFeatureFlags();
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate deterministic hash for percentage-based rollout
 * Same user + flag always gets same result
 */
function hashUserId(userId: string, flagId: string): number {
  const str = `${userId}:${flagId}`;
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Convert to 0-100 range
  return Math.abs(hash % 100);
}

// ============================================================================
// GUARD FUNCTIONS
// ============================================================================

/**
 * Execute callback only if flag is enabled
 */
export function withFlag<T>(
  flagId: TrustFlagId,
  userId: string | undefined,
  callback: () => T,
  fallback?: T
): T | undefined {
  if (isEnabled(flagId, userId)) {
    return callback();
  }
  return fallback;
}

/**
 * Async version of withFlag
 */
export async function withFlagAsync<T>(
  flagId: TrustFlagId,
  userId: string | undefined,
  callback: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  if (isEnabled(flagId, userId)) {
    return callback();
  }
  return fallback;
}

// ============================================================================
// SIMPLE UTILITIES CONFIG (stub for compatibility)
// ============================================================================

/**
 * Get simple utilities configuration
 * Stub: Returns default config
 */
export function getSimpleUtilitiesConfig(): Record<string, boolean> {
  return {
    timers: true,
    tips: true,
    timezone: true,
    reminders: true,
  };
}

/**
 * Get feature flags service object
 * Returns an object with all flag management methods
 */
export function getFeatureFlags() {
  return {
    getAllFlags: () => Object.values(getAllFlags()),
    getCategories: () => ['trust', 'features', 'experimental'],
    getFlag: (flagId: string) => getFlag(flagId as TrustFlagId),
    createFlag: async (flag: Partial<FeatureFlag>) =>
      setFlag((flag.id || '') as TrustFlagId, {
        enabled: flag.enabled || false,
        percentage: flag.rolloutPercentage || 0,
      }),
    updateFlag: async (id: string, updates: Partial<FeatureFlag>) => {
      await setFlag(id as TrustFlagId, {
        enabled: updates.enabled || false,
        percentage: updates.rolloutPercentage || updates.percentage || 0,
      });
      return getFlag(id as TrustFlagId);
    },
    deleteFlag: async (_id: string) => {
      // Flags cannot be deleted, only disabled
      return true;
    },
    reload: async () => refreshFlags(),
    isEnabled,
  };
}

// ============================================================================
// NOTE: Functions are exported directly at declaration (export function ...)
// ============================================================================

export default {
  isEnabled,
  getFlag,
  getAllFlags,
  setFlag,
  setUserOverride,
  removeUserOverride,
  enableFlag,
  disableFlag,
  setRolloutPercentage,
  enableAllTrustFlags,
  disableAllTrustFlags,
  resetToDefaults,
  initializeFeatureFlags,
  refreshFlags,
  withFlag,
  withFlagAsync,
  TRUST_FLAGS,
  getFeatureFlags,
  getSimpleUtilitiesConfig,
};
