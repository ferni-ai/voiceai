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
  clearHeldMusicProfile as clearHeldProfile,
  getUserProfile,
  importUserProfile,
  exportUserProfile,
  type UserTransitionProfile,
} from './music-user-learning.js';

import { cleanForFirestore } from '../utils/firestore-utils.js';
import { userHeld } from '../utils/minor-care.js';
import { cleanMusicEvidence, hasExtraEvidence } from './music-memory-evidence.js';
import {
  clearHeldMusicMemories as clearHeldMemories,
  exportUserMusicMemories,
  importUserMusicMemories,
  preferencesFrom,
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

/**
 * MINOR_CARE: was this memory made during a purged held call (held-window.ts)? minor-care-purge.ts
 * sets it (this layer can't import the trust stores). Answers false until then.
 */
let madeWhileHeld: (userId: string, at: number) => boolean = () => false;
export function setMusicHeldWindow(check: (userId: string, at: number) => boolean): void {
  madeWhileHeld = check;
}

function serializeMemories(
  userId: string,
  data: { memories: MusicHelpedMemory[]; preferences: MusicPreference[] }
): PersistedMusicMemories {
  const kept = data.memories.filter((m) => !madeWhileHeld(userId, m.createdAt));
  return {
    userId,
    updatedAt: new Date().toISOString(),
    preferences: kept.length < data.memories.length ? preferencesFrom(kept) : data.preferences,
    memories: kept.map((m) => ({
      id: m.id,
      createdAt: new Date(m.createdAt).toISOString(),
      emotionalContext: m.emotionalContext,
      music: m.music,
      evidence: cleanMusicEvidence(m.evidence), // labels only: never the caller's words
      effectiveTransition: m.effectiveTransition,
      confidence: m.confidence,
      tags: m.tags,
    })),
  };
}

/**
 * A stored doc as memory: the caller's words dropped (old docs kept them), and the memories made
 * during a purged held call, with preferences rebuilt without them. `changed`: the doc differs.
 */
function deserializeMemories(
  userId: string,
  data: PersistedMusicMemories
): { memories: MusicHelpedMemory[]; preferences: MusicPreference[]; changed: boolean } {
  const stored = Array.isArray(data.memories) ? data.memories : [];
  const all = stored.map((m) => ({
    id: m.id,
    userId,
    createdAt: new Date(m.createdAt).getTime(),
    emotionalContext: m.emotionalContext,
    music: m.music,
    evidence: cleanMusicEvidence(m.evidence),
    effectiveTransition: m.effectiveTransition as MusicHelpedMemory['effectiveTransition'],
    confidence: m.confidence,
    tags: m.tags,
  }));
  const memories = all.filter((m) => !madeWhileHeld(userId, m.createdAt));
  const dropped = memories.length < all.length;
  return {
    memories,
    preferences: dropped ? preferencesFrom(memories) : (data.preferences ?? []),
    changed: dropped || stored.some((m) => hasExtraEvidence(m.evidence)),
  };
}

/** The purge's scrub (scrubHeldDoc): the stored doc without held memories or words, else null. */
export function withoutHeldMusicMemories(
  userId: string,
  data: PersistedMusicMemories
): PersistedMusicMemories | null {
  const read = deserializeMemories(userId, data);
  return read.changed ? serializeMemories(userId, read) : null;
}

// ============================================================================
// PERSISTENCE STORES
// ============================================================================

let profilePersistence: PersistenceStore<PersistedTransitionProfile> | null = null;
let memoryPersistence: PersistenceStore<PersistedMusicMemories> | null = null;

// Track which users have been loaded
const loadedProfileUsers = new Set<string>();
const loadedMemoryUsers = new Set<string>();
// Users whose last read errored: their stored data is unread, so it is never saved over until a
// later load succeeds. A missing document is not an error: that user loads with nothing stored.
const failedProfileUsers = new Set<string>();
const failedMemoryUsers = new Set<string>();
/** Users whose stored memories doc loaded with words or held memories: saved back clean. */
const cleanedMemoryUsers = new Set<string>();

/** MINOR_CARE: drop everything music learning holds for this user (cleanup of a held session). */
export function purgeMusicLearning(userId: string): void {
  clearHeldProfile(userId);
  clearHeldMemories(userId);
  loadedProfileUsers.delete(userId); // the next session reloads before it writes
  loadedMemoryUsers.delete(userId);
  cleanedMemoryUsers.delete(userId);
  profilePersistence?.clearCache(userId); // never creates a store (they share one interval name)
  memoryPersistence?.clearCache(userId);
}

/** At each store sync or set: a held user is dropped, learning maps included, never written. */
const heldPurged = (userId: string): boolean =>
  userHeld(userId) && (purgeMusicLearning(userId), true);

function getProfilePersistence(): PersistenceStore<PersistedTransitionProfile> {
  if (!profilePersistence) {
    profilePersistence = createPersistenceStore<PersistedTransitionProfile>({
      collection: 'music_learning',
      documentId: 'profile',
      syncIntervalMs: 10000, // Sync every 10 seconds
      holdWrites: heldPurged, // MINOR_CARE: a held caller under 18's music learning: dropped
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
      holdWrites: heldPurged,
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
    const data = await getProfilePersistence().load(userId, { strict: true });
    if (data) {
      const profile = deserializeProfile(data);
      importUserProfile(profile);
      log.debug(
        { userId, totalTransitions: profile.totalTransitions },
        'Loaded music profile from persistence'
      );
    }
    loadedProfileUsers.add(userId);
    failedProfileUsers.delete(userId);
  } catch (error) {
    failedProfileUsers.add(userId);
    log.warn({ error, userId }, 'Failed to load music profile from persistence');
  }
}

/**
 * Ensure user's music memories are loaded from persistence
 */
export async function ensureMemoriesLoaded(userId: string): Promise<void> {
  if (loadedMemoryUsers.has(userId)) return;

  try {
    const data = await getMemoryPersistence().load(userId, { strict: true });
    const memories = data && deserializeMemories(userId, data);
    if (memories) {
      importUserMusicMemories(userId, memories);
      log.debug(
        { userId, memoryCount: memories.memories.length },
        'Loaded music memories from persistence'
      );
    }
    loadedMemoryUsers.add(userId);
    failedMemoryUsers.delete(userId);
    if (memories && memories.changed) {
      cleanedMemoryUsers.add(userId);
      saveMemories(userId); // the stored doc, without the words or the held memories
    }
  } catch (error) {
    failedMemoryUsers.add(userId);
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
 * Check if music learning data is already loaded for a user (sync check)
 *
 * Use this to check before using learned preferences - if not loaded yet,
 * the transition system will fall back to base behavior.
 */
export function isMusicLearningLoaded(userId: string): boolean {
  return loadedProfileUsers.has(userId);
}

/**
 * Save user's transition profile (queued for batch write)
 */
export function saveProfile(userId: string): void {
  if (failedProfileUsers.has(userId)) {
    log.warn({ userId }, 'Music profile read failed; not saving over it');
    return;
  }
  if (!loadedProfileUsers.has(userId)) return; // never loaded here: it would replace stored state
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
  if (failedMemoryUsers.has(userId)) {
    log.warn({ userId }, 'Music memories read failed; not saving over them');
    return;
  }
  if (!loadedMemoryUsers.has(userId)) return; // never loaded here: it would replace stored state
  try {
    const memories = exportUserMusicMemories(userId);
    const cleaned = cleanedMemoryUsers.delete(userId); // write even an emptied doc
    if (cleaned || memories.memories.length > 0 || memories.preferences.length > 0) {
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
  failedProfileUsers.delete(userId);
  failedMemoryUsers.delete(userId);
  cleanedMemoryUsers.delete(userId);
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
  failedProfileUsers.clear();
  failedMemoryUsers.clear();
  cleanedMemoryUsers.clear();
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
