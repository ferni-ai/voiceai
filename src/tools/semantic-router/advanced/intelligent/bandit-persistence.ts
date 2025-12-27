/**
 * Bandit Optimizer Persistence
 *
 * Firestore persistence for the Multi-Armed Bandit optimizer.
 * Saves and loads arm statistics across sessions for continuous learning.
 *
 * Storage Structure:
 * - system_cache/bandit_arms - Global arm statistics
 * - bogle_users/{userId}/routing_preferences - Per-user preferences
 * - system_cache/bandit_metrics - Aggregate metrics
 *
 * @module semantic-router/advanced/intelligent/bandit-persistence
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { ToolArm, BanditConfig } from './bandit-optimizer.js';
import { cleanForFirestore } from '../../../../utils/firestore-utils.js';

const log = createLogger({ module: 'bandit-persistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface BanditPersistence {
  /** Save all arm data */
  save(arms: Map<string, ToolArm>): Promise<void>;
  /** Load all arm data */
  load(): Promise<Map<string, ToolArm>>;
}

export interface UserRoutingPreferences {
  preferredTools: string[];
  dislikedTools: string[];
  contextualBoosts: Record<string, number>;
  lastUpdated: Date;
}

export interface BanditMetrics {
  totalSelections: number;
  totalRewards: number;
  avgReward: number;
  topTools: Array<{ toolId: string; avgReward: number; count: number }>;
  lastUpdated: Date;
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

/**
 * Create Firestore-backed persistence for bandit optimizer
 */
export async function createFirestorePersistence(): Promise<BanditPersistence | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    log.info('Creating Firestore persistence for bandit optimizer');

    return {
      async save(arms: Map<string, ToolArm>): Promise<void> {
        try {
          const armsObj: Record<string, unknown> = {};

          for (const [id, arm] of arms) {
            // Safely convert contextWeights to plain object for Firestore
            // Firestore rejects non-plain objects (Maps, custom classes, etc.)
            let contextWeightsObj: Record<string, number> = {};
            
            try {
              if (arm.contextWeights) {
                if (arm.contextWeights instanceof Map) {
                  // Map → plain object via Object.fromEntries
                  for (const [k, v] of arm.contextWeights.entries()) {
                    if (typeof k === 'string' && typeof v === 'number') {
                      contextWeightsObj[k] = v;
                    }
                  }
                } else if (typeof arm.contextWeights === 'object' && arm.contextWeights !== null) {
                  // Object-like but might not be plain - extract key-value pairs safely
                  const weightObj = arm.contextWeights as unknown as Record<string, unknown>;
                  
                  // Check if it's a Map-like object with entries() method
                  if (typeof (weightObj as { entries?: unknown }).entries === 'function') {
                    const entriesFn = (weightObj as { entries: () => Iterable<[string, number]> }).entries;
                    for (const [k, v] of entriesFn.call(weightObj)) {
                      if (typeof k === 'string' && typeof v === 'number') {
                        contextWeightsObj[k] = v;
                      }
                    }
                  } else {
                    // Plain-ish object - copy own enumerable properties
                    for (const key of Object.keys(weightObj)) {
                      const val = weightObj[key];
                      if (typeof val === 'number') {
                        contextWeightsObj[key] = val;
                      }
                    }
                  }
                }
              }
            } catch (conversionErr) {
              // If conversion fails, just use empty object
              log.warn({ armId: id, error: String(conversionErr) }, 'Failed to convert contextWeights');
              contextWeightsObj = {};
            }

            // Build a completely plain object for Firestore
            armsObj[id] = Object.assign(Object.create(null), {
              toolId: String(arm.toolId || id),
              successes: Number(arm.successes) || 0,
              failures: Number(arm.failures) || 0,
              attempts: Number(arm.attempts) || 0,
              averageReward: Number(arm.averageReward) || 0.5,
              lastUpdated: arm.lastUpdated?.toISOString?.() || new Date().toISOString(),
              contextWeights: Object.assign(Object.create(null), contextWeightsObj),
            });
          }

          await db.collection('system_cache').doc('bandit_arms').set(
            cleanForFirestore({
              arms: armsObj,
              updatedAt: new Date(),
              armCount: arms.size,
            }),
            { merge: true }
          );

          log.debug({ armCount: arms.size }, 'Bandit arms saved to Firestore');
        } catch (error) {
          log.error({ error }, 'Failed to save bandit arms to Firestore');
          throw error;
        }
      },

      async load(): Promise<Map<string, ToolArm>> {
        try {
          const doc = await db.collection('system_cache').doc('bandit_arms').get();

          if (!doc.exists) {
            log.debug('No existing bandit arms in Firestore');
            return new Map();
          }

          const data = doc.data()?.arms || {};
          const arms = new Map<string, ToolArm>();

          for (const [id, armData] of Object.entries(data)) {
            const arm = armData as Record<string, unknown>;
            // Convert stored object back to Map for contextWeights
            const contextWeightsObj = arm.contextWeights as Record<string, number> | undefined;
            const contextWeights = new Map<string, number>(
              contextWeightsObj ? Object.entries(contextWeightsObj) : []
            );

            arms.set(cleanForFirestore(id), {
              toolId: String(arm.toolId || id),
              successes: Number(arm.successes) || 0,
              failures: Number(arm.failures) || 0,
              attempts: Number(arm.attempts) || 0,
              averageReward: Number(arm.averageReward) || 0,
              lastUpdated: arm.lastUpdated ? new Date(String(arm.lastUpdated)) : new Date(),
              contextWeights,
            });
          }

          log.debug({ armCount: arms.size }, 'Bandit arms loaded from Firestore');
          return arms;
        } catch (error) {
          log.error({ error }, 'Failed to load bandit arms from Firestore');
          return new Map();
        }
      },
    };
  } catch (error) {
    log.warn({ error }, 'Failed to create Firestore persistence - Firestore not available');
    return null;
  }
}

// ============================================================================
// USER PREFERENCES PERSISTENCE
// ============================================================================

/**
 * Save user-specific routing preferences
 */
export async function saveUserPreferences(
  userId: string,
  preferences: Partial<UserRoutingPreferences>
): Promise<void> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('routing_preferences')
      .doc('bandit')
      .set(
        cleanForFirestore({
          ...preferences,
          lastUpdated: new Date(),
        }),
        { merge: true }
      );

    log.debug({ userId }, 'User routing preferences saved');
  } catch (error) {
    log.warn({ error, userId }, 'Failed to save user routing preferences');
  }
}

/**
 * Load user-specific routing preferences
 */
export async function loadUserPreferences(
  userId: string
): Promise<UserRoutingPreferences | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('routing_preferences')
      .doc('bandit')
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      preferredTools: data?.preferredTools || [],
      dislikedTools: data?.dislikedTools || [],
      contextualBoosts: data?.contextualBoosts || {},
      lastUpdated: data?.lastUpdated?.toDate() || new Date(),
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load user routing preferences');
    return null;
  }
}

/**
 * Record user tool preference (like/dislike)
 */
export async function recordUserToolPreference(
  userId: string,
  toolId: string,
  liked: boolean
): Promise<void> {
  try {
    const existing = await loadUserPreferences(userId);
    const preferredTools = existing?.preferredTools || [];
    const dislikedTools = existing?.dislikedTools || [];

    if (liked) {
      // Add to preferred, remove from disliked
      if (!preferredTools.includes(toolId)) {
        preferredTools.push(toolId);
      }
      const dislikedIndex = dislikedTools.indexOf(toolId);
      if (dislikedIndex > -1) {
        dislikedTools.splice(dislikedIndex, 1);
      }
    } else {
      // Add to disliked, remove from preferred
      if (!dislikedTools.includes(toolId)) {
        dislikedTools.push(toolId);
      }
      const preferredIndex = preferredTools.indexOf(toolId);
      if (preferredIndex > -1) {
        preferredTools.splice(preferredIndex, 1);
      }
    }

    await saveUserPreferences(userId, {
      preferredTools,
      dislikedTools,
    });
  } catch (error) {
    log.warn({ error, userId, toolId }, 'Failed to record user tool preference');
  }
}

// ============================================================================
// METRICS PERSISTENCE
// ============================================================================

/**
 * Save aggregate bandit metrics
 */
export async function saveBanditMetrics(metrics: Partial<BanditMetrics>): Promise<void> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    await db.collection('system_cache').doc('bandit_metrics').set(
      cleanForFirestore({
        ...metrics,
        lastUpdated: new Date(),
      }),
      { merge: true }
    );

    log.debug('Bandit metrics saved');
  } catch (error) {
    log.warn({ error }, 'Failed to save bandit metrics');
  }
}

/**
 * Load aggregate bandit metrics
 */
export async function loadBanditMetrics(): Promise<BanditMetrics | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const doc = await db.collection('system_cache').doc('bandit_metrics').get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      totalSelections: data?.totalSelections || 0,
      totalRewards: data?.totalRewards || 0,
      avgReward: data?.avgReward || 0,
      topTools: data?.topTools || [],
      lastUpdated: data?.lastUpdated?.toDate() || new Date(),
    };
  } catch (error) {
    log.warn({ error }, 'Failed to load bandit metrics');
    return null;
  }
}

/**
 * Increment bandit metric counters
 */
export async function incrementBanditMetrics(
  selections: number,
  rewards: number
): Promise<void> {
  try {
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    const db = getFirestore();

    await db
      .collection('system_cache')
      .doc('bandit_metrics')
      .update(cleanForFirestore({
        totalSelections: FieldValue.increment(selections),
        totalRewards: FieldValue.increment(rewards),
        lastUpdated: new Date(),
      }));
  } catch (error) {
    // Document might not exist, try to create it
    try {
      await saveBanditMetrics({
        totalSelections: selections,
        totalRewards: rewards,
        avgReward: rewards / Math.max(selections, 1),
        topTools: [],
      });
    } catch (createError) {
      log.warn({ error: createError }, 'Failed to increment bandit metrics');
    }
  }
}

// ============================================================================
// ROUTING EVENT PERSISTENCE
// ============================================================================

export interface RoutingEvent {
  userId: string;
  sessionId: string;
  personaId: string;
  input: string;
  selectedTool: string;
  confidence: number;
  decidedBy: string;
  success?: boolean;
  reward?: number;
  timestamp: Date;
}

/**
 * Record a routing event for analytics
 */
export async function recordRoutingEvent(event: RoutingEvent): Promise<string | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const docRef = await db.collection('routing_events').add(cleanForFirestore({
      ...event,
      timestamp: event.timestamp || new Date(),
    }));

    return docRef.id;
  } catch (error) {
    log.warn({ error }, 'Failed to record routing event');
    return null;
  }
}

/**
 * Update routing event with outcome
 */
export async function updateRoutingEventOutcome(
  eventId: string,
  outcome: { success: boolean; reward: number }
): Promise<void> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    await db.collection('routing_events').doc(eventId).update(cleanForFirestore({
      success: outcome.success,
      reward: outcome.reward,
      outcomeRecordedAt: new Date(),
    }));
  } catch (error) {
    log.warn({ error, eventId }, 'Failed to update routing event outcome');
  }
}

// ============================================================================
// IN-MEMORY PERSISTENCE (Fallback)
// ============================================================================

/**
 * Create in-memory persistence (for testing or when Firestore unavailable)
 */
export function createInMemoryPersistence(): BanditPersistence {
  const storage = new Map<string, Map<string, ToolArm>>();
  const key = 'arms';

  return {
    async save(arms: Map<string, ToolArm>): Promise<void> {
      // Deep clone to prevent reference issues
      const clone = new Map<string, ToolArm>();
      for (const [id, arm] of arms) {
        clone.set(cleanForFirestore(id), { ...arm });
      }
      storage.set(key, clone);
    },

    async load(): Promise<Map<string, ToolArm>> {
      const arms = storage.get(key);
      if (!arms) {
        return new Map();
      }
      // Return deep clone
      const clone = new Map<string, ToolArm>();
      for (const [id, arm] of arms) {
        clone.set(cleanForFirestore(id), { ...arm });
      }
      return clone;
    },
  };
}

// ============================================================================
// AUTO-SAVE SCHEDULER
// ============================================================================

let autoSaveInterval: ReturnType<typeof setInterval> | null = null;
let pendingSave: Map<string, ToolArm> | null = null;

/**
 * Start automatic persistence on interval
 */
export function startAutoSave(
  persistence: BanditPersistence,
  intervalMs: number = 60000
): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }

  autoSaveInterval = setInterval(async () => {
    if (pendingSave) {
      try {
        await persistence.save(pendingSave);
        pendingSave = null;
        log.debug('Auto-saved bandit arms');
      } catch (error) {
        log.warn({ error }, 'Auto-save failed');
      }
    }
  }, intervalMs);

  log.info({ intervalMs }, 'Started bandit auto-save');
}

/**
 * Stop automatic persistence
 */
export function stopAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
    log.info('Stopped bandit auto-save');
  }
}

/**
 * Queue arms for auto-save
 */
export function queueForSave(arms: Map<string, ToolArm>): void {
  // Clone to prevent reference issues
  pendingSave = new Map(arms);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  createFirestorePersistence as default,
};

