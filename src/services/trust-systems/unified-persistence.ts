/**
 * Unified Trust Profile Persistence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module ensures all trust profile data has a SINGLE source of truth
 * in Firestore. It prevents data drift between in-memory and persisted state.
 *
 * The Problem:
 * - Multiple systems maintain their own in-memory Maps
 * - Periodic sync can lead to stale/inconsistent data
 * - Server restarts lose recent changes
 *
 * The Solution:
 * - Real-time write-through for critical changes
 * - Periodic batch sync for efficiency
 * - Single document structure per user
 * - Conflict resolution with timestamps
 *
 * @module UnifiedTrustPersistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';

const log = createLogger({ module: 'UnifiedTrustPersistence' });

// Module-level Firestore instance (lazy initialized)
let db: FirestoreType | null = null;

/**
 * Get Firestore connection (lazy initialized)
 */
async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Unified trust persistence Firestore initialized');
    return db;
  } catch (error) {
    log.warn(
      { error },
      'Firestore not available for unified persistence'
    );
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedTrustProfile {
  userId: string;
  
  /** Version for conflict resolution */
  version: number;
  
  /** Last modification timestamps for each system */
  systemVersions: Record<string, number>;
  
  /** Core trust system data */
  systems: {
    boundaries?: unknown;
    growth?: unknown;
    insideJokes?: unknown;
    smallWins?: unknown;
    thinkingOfYou?: unknown;
    unsaid?: unknown;
    relationshipHealth?: unknown;
    celebrationMomentum?: unknown;
    sentimentTimeline?: unknown;
    voiceProsody?: unknown;
    journaling?: unknown;
    seasonal?: unknown;
    learningStyle?: unknown;
    media?: unknown;
    insights?: unknown;
    crossPersonaInsights?: unknown;
  };
  
  /** Metadata */
  createdAt: Date;
  updatedAt: Date;
  lastSessionId?: string;
}

export interface PersistenceConfig {
  /** How often to batch sync (ms) */
  batchSyncIntervalMs: number;
  
  /** Max changes before forcing a sync */
  maxPendingChanges: number;
  
  /** Whether to use real-time write-through for critical systems */
  realtimeWriteThrough: boolean;
  
  /** Systems that should be written through immediately */
  criticalSystems: string[];
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: PersistenceConfig = {
  batchSyncIntervalMs: 30000, // 30 seconds
  maxPendingChanges: 50,
  realtimeWriteThrough: true,
  criticalSystems: ['boundaries', 'relationshipHealth', 'unsaid'],
};

// ============================================================================
// STATE
// ============================================================================

let config = { ...DEFAULT_CONFIG };
const pendingChanges = new Map<string, Set<string>>(); // userId -> set of system names
const profileCache = new Map<string, UnifiedTrustProfile>();
let syncInterval: NodeJS.Timeout | null = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the unified persistence system
 */
export function initializeUnifiedPersistence(customConfig?: Partial<PersistenceConfig>): void {
  if (isInitialized) {
    log.warn('Unified persistence already initialized');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...customConfig };
  
  // Start batch sync interval
  syncInterval = setInterval(async () => {
    await flushPendingChanges();
  }, config.batchSyncIntervalMs);

  isInitialized = true;
  log.info({ config }, '✅ Unified trust persistence initialized');
}

/**
 * Shutdown the persistence system
 */
export async function shutdownUnifiedPersistence(): Promise<void> {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  
  // Flush any remaining changes
  await flushPendingChanges();
  
  profileCache.clear();
  pendingChanges.clear();
  isInitialized = false;
  
  log.info('🛑 Unified trust persistence shut down');
}

// ============================================================================
// CORE API
// ============================================================================

/**
 * Load a user's unified trust profile
 */
export async function loadUnifiedProfile(userId: string): Promise<UnifiedTrustProfile | null> {
  // Check cache first
  const cached = profileCache.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const firestore = await getFirestore();
    if (!firestore) {
      log.warn({ userId }, 'Firestore not available for loading profile');
      return null;
    }

    const doc = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('trust')
      .doc('unified_profile')
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as Record<string, unknown>;
    const profile: UnifiedTrustProfile = {
      userId,
      version: (data.version as number) || 1,
      systemVersions: (data.systemVersions as Record<string, number>) || {},
      systems: (data.systems as UnifiedTrustProfile['systems']) || {},
      createdAt: data.createdAt ? new Date(data.createdAt as string) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt as string) : new Date(),
      lastSessionId: data.lastSessionId as string | undefined,
    };

    profileCache.set(userId, profile);
    
    log.debug({ userId, version: profile.version }, 'Loaded unified trust profile');
    return profile;
  } catch (error) {
    log.error({ error, userId }, 'Failed to load unified profile');
    return null;
  }
}

/**
 * Save a specific system's data
 */
export async function saveSystemData(
  userId: string,
  systemName: string,
  data: unknown,
  options: { immediate?: boolean } = {}
): Promise<void> {
  const shouldWriteThrough = 
    options.immediate || 
    (config.realtimeWriteThrough && config.criticalSystems.includes(systemName));

  // Get or create profile
  let profile = profileCache.get(userId);
  if (!profile) {
    profile = await loadUnifiedProfile(userId) || createEmptyProfile(userId);
  }

  // Update the system data
  profile.systems[systemName as keyof typeof profile.systems] = data;
  profile.systemVersions[systemName] = Date.now();
  profile.version++;
  profile.updatedAt = new Date();

  profileCache.set(userId, profile);

  if (shouldWriteThrough) {
    // Write immediately
    await persistProfile(userId, profile);
    log.debug({ userId, systemName }, 'Real-time write-through completed');
  } else {
    // Queue for batch sync
    if (!pendingChanges.has(userId)) {
      pendingChanges.set(userId, new Set());
    }
    pendingChanges.get(userId)!.add(systemName);

    // Check if we should force sync
    const userPending = pendingChanges.get(userId)!;
    if (userPending.size >= config.maxPendingChanges) {
      await flushUserChanges(userId);
    }
  }
}

/**
 * Get a specific system's data
 */
export async function getSystemData<T>(
  userId: string,
  systemName: string
): Promise<T | null> {
  const profile = await loadUnifiedProfile(userId);
  if (!profile) return null;
  
  return (profile.systems[systemName as keyof typeof profile.systems] as T) || null;
}

/**
 * Get the entire unified profile
 */
export async function getUnifiedProfile(userId: string): Promise<UnifiedTrustProfile | null> {
  return loadUnifiedProfile(userId);
}

/**
 * Check if a system has been modified since a given timestamp
 */
export function hasSystemChanged(userId: string, systemName: string, since: number): boolean {
  const profile = profileCache.get(userId);
  if (!profile) return false;
  
  const systemVersion = profile.systemVersions[systemName];
  return systemVersion !== undefined && systemVersion > since;
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Flush all pending changes for all users
 */
export async function flushPendingChanges(): Promise<number> {
  let flushedCount = 0;
  
  for (const userId of pendingChanges.keys()) {
    try {
      await flushUserChanges(userId);
      flushedCount++;
    } catch (error) {
      log.error({ error, userId }, 'Failed to flush changes for user');
    }
  }
  
  if (flushedCount > 0) {
    log.debug({ flushedCount }, 'Batch sync completed');
  }
  
  return flushedCount;
}

/**
 * Flush pending changes for a specific user
 */
async function flushUserChanges(userId: string): Promise<void> {
  const userPending = pendingChanges.get(userId);
  if (!userPending || userPending.size === 0) return;

  const profile = profileCache.get(userId);
  if (!profile) return;

  await persistProfile(userId, profile);
  pendingChanges.delete(userId);
  
  log.debug({ userId, systemCount: userPending.size }, 'Flushed user changes');
}

/**
 * Persist a profile to Firestore
 */
async function persistProfile(userId: string, profile: UnifiedTrustProfile): Promise<void> {
  try {
    const firestore = await getFirestore();
    if (!firestore) return;

    await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('trust')
      .doc('unified_profile')
      .set({
        ...profile,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
  } catch (error) {
    log.error({ error, userId }, 'Failed to persist profile');
    throw error;
  }
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Migrate from old per-system collections to unified profile
 */
export async function migrateToUnifiedProfile(userId: string): Promise<boolean> {
  try {
    const firestore = await getFirestore();
    if (!firestore) return false;

    // Check if already migrated
    const existingProfile = await loadUnifiedProfile(userId);
    if (existingProfile && Object.keys(existingProfile.systems).length > 0) {
      log.debug({ userId }, 'User already has unified profile');
      return true;
    }

    // Load from old collections
    const oldCollections = [
      'trust_profiles/boundaries',
      'trust_profiles/growth',
      'trust_profiles/inside_jokes',
      'trust_profiles/small_wins',
      'trust_profiles/thinking_of_you',
    ];

    const systems: UnifiedTrustProfile['systems'] = {};
    const systemVersions: Record<string, number> = {};

    for (const path of oldCollections) {
      const doc = await firestore
        .collection('bogle_users')
        .doc(userId)
        .collection(path.split('/')[0])
        .doc(path.split('/')[1])
        .get();

      if (doc.exists) {
        const systemName = path.split('/')[1];
        systems[systemName as keyof typeof systems] = doc.data();
        systemVersions[systemName] = Date.now();
      }
    }

    if (Object.keys(systems).length === 0) {
      log.debug({ userId }, 'No old trust data to migrate');
      return true;
    }

    // Create unified profile
    const profile = createEmptyProfile(userId);
    profile.systems = systems;
    profile.systemVersions = systemVersions;

    await persistProfile(userId, profile);
    profileCache.set(userId, profile);

    log.info(
      { userId, migratedSystems: Object.keys(systems) },
      '✅ Migrated to unified trust profile'
    );

    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to migrate to unified profile');
    return false;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyProfile(userId: string): UnifiedTrustProfile {
  return {
    userId,
    version: 1,
    systemVersions: {},
    systems: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================================
// SESSION HOOKS
// ============================================================================

/**
 * Call at session start to load and cache trust data
 */
export async function onSessionStartUnified(userId: string, sessionId: string): Promise<void> {
  const profile = await loadUnifiedProfile(userId);
  
  if (profile) {
    profile.lastSessionId = sessionId;
    profileCache.set(userId, profile);
  }
  
  log.debug({ userId, sessionId }, 'Session started with unified trust profile');
}

/**
 * Call at session end to flush all changes
 */
export async function onSessionEndUnified(userId: string): Promise<void> {
  await flushUserChanges(userId);
  log.debug({ userId }, 'Session ended, trust data persisted');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeUnifiedPersistence,
  shutdownUnifiedPersistence,
  loadUnifiedProfile,
  saveSystemData,
  getSystemData,
  getUnifiedProfile,
  hasSystemChanged,
  flushPendingChanges,
  migrateToUnifiedProfile,
  onSessionStartUnified,
  onSessionEndUnified,
};

