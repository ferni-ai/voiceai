/**
 * Music Learning Persistence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Persists music learning data to Firestore so it survives server restarts:
 * - User transition profiles (Thompson Sampling arms)
 * - Music memories (what music helped in what situations)
 * - Analytics data (optional - can be too large for Firestore)
 *
 * Storage Strategy:
 * - bogle_users/{userId}/music_learning/profile - User transition profile
 * - bogle_users/{userId}/music_learning/memories - Music memories
 *
 * @module MusicLearningPersistence
 */

import { createLogger } from '../utils/safe-logger.js';
import { createPersistenceStore, type PersistenceStore } from '../services/persistence/index.js';

// Import types and functions from learning modules
import {
  getUserProfile,
  importUserProfile,
  exportUserProfile,
  type UserTransitionProfile,
} from './music-user-learning.js';

import { cleanForFirestore } from '../utils/firestore-utils.js';
import {
  exportUserMusicMemories,
  importUserMusicMemories,
  type MusicHelpedMemory,
  type MusicPreference,
} from './music-memory-integration.js';

const log = createLogger({ module: 'MusicLearningPersistence' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Persisted format for user transition profile
 */
interface PersistedTransitionProfile {
  userId: string;
  createdAt: string;
  updatedAt: string;
  totalTransitions: number;
  transitionArms: UserTransitionProfile['transitionArms'];
  contextPreferences: UserTransitionProfile['contextPreferences'];
  musicMemory?: UserTransitionProfile['musicMemory'];
}

/**
 * Persisted format for music memories
 */
interface PersistedMusicMemories {
  userId: string;
  updatedAt: string;
  memories: Array<{
    id: string;
    createdAt: string;
    emotionalContext: MusicHelpedMemory['emotionalContext'];
    music: MusicHelpedMemory['music'];
    evidence: MusicHelpedMemory['evidence'];
    effectiveTransition: string;
    confidence: number;
    tags: string[];
  }>;
  preferences: MusicPreference[];
}

// ============================================================================
// SERIALIZATION
// ============================================================================

function serializeProfile(profile: UserTransitionProfile): PersistedTransitionProfile {
  return {
    userId: profile.userId,
    createdAt: new Date(profile.createdAt).toISOString(),
    updatedAt: new Date(profile.updatedAt).toISOString(),
    totalTransitions: profile.totalTransitions,
    transitionArms: profile.transitionArms,
    contextPreferences: profile.contextPreferences,
    musicMemory: profile.musicMemory,
  };
}

function deserializeProfile(data: PersistedTransitionProfile): UserTransitionProfile {
  return {
    userId: data.userId,
    createdAt: new Date(data.createdAt).getTime(),
    updatedAt: new Date(data.updatedAt).getTime(),
    totalTransitions: data.totalTransitions,
    transitionArms: data.transitionArms,
    contextPreferences: data.contextPreferences,
    musicMemory: data.musicMemory || [],
  };
}

function serializeMemories(
  userId: string,
  data: { memories: MusicHelpedMemory[]; preferences: MusicPreference[] }
): PersistedMusicMemories {
  return {
    userId,
    updatedAt: new Date().toISOString(),
    memories: data.memories.map((m) => ({
      id: m.id,
      createdAt: new Date(m.createdAt).toISOString(),
      emotionalContext: m.emotionalContext,
      music: m.music,
      evidence: m.evidence,
      effectiveTransition: m.effectiveTransition,
      confidence: m.confidence,
      tags: m.tags,
    })),
    preferences: data.preferences,
  };
}

function deserializeMemories(data: PersistedMusicMemories): {
  memories: MusicHelpedMemory[];
  preferences: MusicPreference[];
} {
  return {
    memories: data.memories.map((m) => ({
      id: m.id,
      userId: data.userId,
      createdAt: new Date(m.createdAt).getTime(),
      emotionalContext: m.emotionalContext,
      music: m.music,
      evidence: m.evidence,
      effectiveTransition: m.effectiveTransition as MusicHelpedMemory['effectiveTransition'],
      confidence: m.confidence,
      tags: m.tags,
    })),
    preferences: data.preferences,
  };
}

// ============================================================================
// PERSISTENCE STORES
// ============================================================================

let profilePersistence: PersistenceStore<PersistedTransitionProfile> | null = null;
let memoryPersistence: PersistenceStore<PersistedMusicMemories> | null = null;

// Track which users have been loaded
const loadedProfileUsers = new Set<string>();
const loadedMemoryUsers = new Set<string>();

function getProfilePersistence(): PersistenceStore<PersistedTransitionProfile> {
  if (!profilePersistence) {
    profilePersistence = createPersistenceStore<PersistedTransitionProfile>({
      collection: 'music_learning',
      documentId: 'profile',
      syncIntervalMs: 10000, // Sync every 10 seconds
    });
  }
  return profilePersistence;
}

function getMemoryPersistence(): PersistenceStore<PersistedMusicMemories> {
  if (!memoryPersistence) {
    memoryPersistence = createPersistenceStore<PersistedMusicMemories>({
      collection: 'music_learning',
      documentId: 'memories',
      syncIntervalMs: 15000, // Sync every 15 seconds (less frequent)
    });
  }
  return memoryPersistence;
}

// ============================================================================
// CORE API
// ============================================================================

/**
 * Ensure user's transition profile is loaded from persistence
 */
export async function ensureProfileLoaded(userId: string): Promise<void> {
  if (loadedProfileUsers.has(userId)) return;

  try {
    const data = await getProfilePersistence().load(userId);
    if (data) {
      const profile = deserializeProfile(data);
      importUserProfile(profile);
      log.debug(
        { userId, totalTransitions: profile.totalTransitions },
        'Loaded music profile from persistence'
      );
    }
    loadedProfileUsers.add(userId);
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load music profile from persistence');
  }
}

/**
 * Ensure user's music memories are loaded from persistence
 */
export async function ensureMemoriesLoaded(userId: string): Promise<void> {
  if (loadedMemoryUsers.has(userId)) return;

  try {
    const data = await getMemoryPersistence().load(userId);
    if (data) {
      const memories = deserializeMemories(data);
      importUserMusicMemories(userId, memories);
      log.debug(
        { userId, memoryCount: memories.memories.length },
        'Loaded music memories from persistence'
      );
    }
    loadedMemoryUsers.add(userId);
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load music memories from persistence');
  }
}

/**
 * Ensure all music learning data is loaded for a user
 */
export async function ensureMusicLearningLoaded(userId: string): Promise<void> {
  await Promise.all([ensureProfileLoaded(userId), ensureMemoriesLoaded(userId)]);
}

/**
 * Save user's transition profile (queued for batch write)
 */
export function saveProfile(userId: string): void {
  try {
    const profile = exportUserProfile(userId);
    if (profile) {
      const serialized = serializeProfile(profile);
      getProfilePersistence().set(userId, serialized);
      log.debug({ userId }, 'Music profile queued for persistence');
    }
  } catch (error) {
    log.warn({ error, userId }, 'Failed to queue music profile for persistence');
  }
}

/**
 * Save user's music memories (queued for batch write)
 */
export function saveMemories(userId: string): void {
  try {
    const memories = exportUserMusicMemories(userId);
    if (memories.memories.length > 0 || memories.preferences.length > 0) {
      const serialized = serializeMemories(userId, memories);
      getMemoryPersistence().set(userId, serialized);
      log.debug(
        { userId, count: memories.memories.length },
        'Music memories queued for persistence'
      );
    }
  } catch (error) {
    log.warn({ error, userId }, 'Failed to queue music memories for persistence');
  }
}

/**
 * Save all music learning data for a user
 */
export function saveMusicLearning(userId: string): void {
  saveProfile(userId);
  saveMemories(userId);
}

/**
 * Save and flush immediately (use on session end)
 */
export async function flushMusicLearning(userId: string): Promise<void> {
  saveProfile(userId);
  saveMemories(userId);

  await Promise.all([
    getProfilePersistence().flushUser(userId),
    getMemoryPersistence().flushUser(userId),
  ]);

  log.info({ userId }, 'Music learning data flushed to persistence');
}

/**
 * Flush all pending changes
 */
export async function flushAllMusicLearning(): Promise<void> {
  await Promise.all([getProfilePersistence().flush(), getMemoryPersistence().flush()]);
}

/**
 * Clear cached data for a user (for testing)
 */
export function clearUserCache(userId: string): void {
  loadedProfileUsers.delete(userId);
  loadedMemoryUsers.delete(userId);
  getProfilePersistence().clearCache(userId);
  getMemoryPersistence().clearCache(userId);
}

/**
 * Shutdown persistence (call on server shutdown)
 */
export async function shutdownMusicLearningPersistence(): Promise<void> {
  await Promise.all([profilePersistence?.shutdown(), memoryPersistence?.shutdown()]);

  loadedProfileUsers.clear();
  loadedMemoryUsers.clear();
  profilePersistence = null;
  memoryPersistence = null;

  log.info('Music learning persistence shutdown complete');
}

/**
 * Get persistence stats
 */
export function getMusicLearningStats(): {
  profiles: { cached: number; dirty: number };
  memories: { cached: number; dirty: number };
  loadedUsers: { profiles: number; memories: number };
} {
  return {
    profiles: profilePersistence?.getStats() || { cached: 0, dirty: 0 },
    memories: memoryPersistence?.getStats() || { cached: 0, dirty: 0 },
    loadedUsers: {
      profiles: loadedProfileUsers.size,
      memories: loadedMemoryUsers.size,
    },
  };
}

// ============================================================================
// AUTO-SAVE HOOKS
// ============================================================================

/**
 * Hook to call after recording transition feedback
 * This ensures the updated Thompson Sampling state is persisted
 */
export function onTransitionFeedbackRecorded(userId: string): void {
  // Queue for batch save (debounced)
  saveProfile(userId);
}

/**
 * Hook to call after storing a music memory
 */
export function onMusicMemoryStored(userId: string): void {
  saveMemories(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ensureProfileLoaded,
  ensureMemoriesLoaded,
  ensureMusicLearningLoaded,
  saveProfile,
  saveMemories,
  saveMusicLearning,
  flushMusicLearning,
  flushAllMusicLearning,
  clearUserCache,
  shutdownMusicLearningPersistence,
  getMusicLearningStats,
  onTransitionFeedbackRecorded,
  onMusicMemoryStored,
};
