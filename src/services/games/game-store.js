/**
 * 🎮 Game Store
 *
 * Persistence layer for game data. Saves to EngagementProfile in Firestore.
 *
 * Responsibilities:
 * - Load game memory when session starts
 * - Save game memory after each game
 * - Save musical DNA after significant changes
 * - Handle offline/failure gracefully
 */
import { getLogger } from '../../utils/safe-logger.js';
import { createEmptyGameMemory } from './game-persistence.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = getLogger();
// In-memory cache for quick access
const gameMemoryCache = new Map();
const musicMemoryCache = new Map();
// Track dirty state for debounced saves
const dirtyUsers = new Set();
let saveTimer = null;
// ============================================================================
// LOAD GAME MEMORY
// ============================================================================
/**
 * Load game memory for a user
 * Called at session start
 */
export async function loadGameMemory(userId) {
    // Check cache first
    const cached = gameMemoryCache.get(userId);
    if (cached) {
        log.debug({ userId }, '🎮 Loaded game memory from cache');
        return cached;
    }
    try {
        const { getEngagementStore } = await import('../engagement/engagement-store.js');
        const store = await getEngagementStore();
        const profile = await store.getProfile(userId);
        if (profile.gameMemory) {
            gameMemoryCache.set(userId, profile.gameMemory);
            log.info({ userId, totalGames: profile.gameMemory.totalGamesPlayed }, '🎮 Loaded game memory from Firestore');
            return profile.gameMemory;
        }
    }
    catch (error) {
        log.warn({ error, userId }, '🎮 Failed to load game memory from Firestore');
    }
    // Return empty memory
    const emptyMemory = createEmptyGameMemory();
    gameMemoryCache.set(userId, emptyMemory);
    return emptyMemory;
}
/**
 * Load music memory for a user
 */
export async function loadMusicMemory(userId) {
    // Check cache first
    const cached = musicMemoryCache.get(userId);
    if (cached) {
        return cached;
    }
    try {
        const { getEngagementStore } = await import('../engagement/engagement-store.js');
        const store = await getEngagementStore();
        const profile = await store.getProfile(userId);
        if (profile.musicMemory) {
            musicMemoryCache.set(userId, profile.musicMemory);
            return profile.musicMemory;
        }
    }
    catch (error) {
        log.warn({ error, userId }, '🎵 Failed to load music memory from Firestore');
    }
    return null;
}
// ============================================================================
// SAVE GAME MEMORY
// ============================================================================
/**
 * Save game memory for a user
 * Debounced to avoid too many writes
 */
export async function saveGameMemory(userId, gameMemory) {
    // Update cache immediately
    gameMemoryCache.set(userId, gameMemory);
    // Mark as dirty for debounced save
    dirtyUsers.add(userId);
    // Schedule debounced save (3 seconds)
    if (!saveTimer) {
        saveTimer = setTimeout(() => {
            void flushDirtyUsers();
        }, 3000);
    }
    log.debug({ userId }, '🎮 Game memory updated (pending save)');
}
/**
 * Save music memory for a user
 */
export async function saveMusicMemory(userId, musicMemory) {
    // Update cache
    musicMemoryCache.set(userId, musicMemory);
    // Mark dirty
    dirtyUsers.add(userId);
    // Schedule debounced save
    if (!saveTimer) {
        saveTimer = setTimeout(() => {
            void flushDirtyUsers();
        }, 3000);
    }
}
/**
 * Flush all dirty users to Firestore
 */
async function flushDirtyUsers() {
    saveTimer = null;
    if (dirtyUsers.size === 0)
        return;
    const usersToSave = Array.from(dirtyUsers);
    dirtyUsers.clear();
    log.debug({ count: usersToSave.length }, '🎮 Flushing game memory to Firestore');
    try {
        const { getEngagementStore } = await import('../engagement/engagement-store.js');
        const store = await getEngagementStore();
        for (const userId of usersToSave) {
            try {
                const profile = await store.getProfile(userId);
                const gameMemory = gameMemoryCache.get(userId);
                const musicMemory = musicMemoryCache.get(userId);
                if (gameMemory) {
                    profile.gameMemory = gameMemory;
                }
                if (musicMemory) {
                    profile.musicMemory = musicMemory;
                }
                await store.saveProfile(profile);
                log.debug({ userId }, '🎮 Saved game memory to Firestore');
            }
            catch (error) {
                log.error({ error, userId }, '🎮 Failed to save game memory');
                // Re-add to dirty set for retry
                dirtyUsers.add(userId);
            }
        }
    }
    catch (error) {
        log.error({ error }, '🎮 Failed to get engagement store');
        // Re-add all users for retry
        usersToSave.forEach((u) => dirtyUsers.add(cleanForFirestore(u)));
    }
}
/**
 * Force immediate save for a user (call on session end)
 */
export async function forceSaveGameMemory(userId) {
    // Clear from pending
    dirtyUsers.delete(userId);
    const gameMemory = gameMemoryCache.get(userId);
    const musicMemory = musicMemoryCache.get(userId);
    if (!gameMemory && !musicMemory) {
        return;
    }
    try {
        const { getEngagementStore } = await import('../engagement/engagement-store.js');
        const store = await getEngagementStore();
        const profile = await store.getProfile(userId);
        if (gameMemory) {
            profile.gameMemory = gameMemory;
        }
        if (musicMemory) {
            profile.musicMemory = musicMemory;
        }
        await store.saveProfile(profile);
        log.info({ userId, totalGames: gameMemory?.totalGamesPlayed }, '🎮 Force saved game memory');
    }
    catch (error) {
        log.error({ error, userId }, '🎮 Failed to force save game memory');
    }
}
// ============================================================================
// QUICK ACCESS
// ============================================================================
/**
 * Get cached game memory (no async)
 * Returns null if not loaded
 */
export function getCachedGameMemory(userId) {
    return gameMemoryCache.get(userId) || null;
}
/**
 * Update cached game memory without saving
 * Used during active games for quick updates
 */
export function updateCachedGameMemory(userId, gameMemory) {
    gameMemoryCache.set(userId, gameMemory);
    dirtyUsers.add(userId);
}
/**
 * Clear cache for a user (on session end)
 */
export function clearCache(userId) {
    gameMemoryCache.delete(userId);
    musicMemoryCache.delete(userId);
}
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Record a game session completion
 * Handles all the persistence in one call
 */
export async function recordGameCompletion(userId, gameType, score, roundsPlayed, durationSeconds, personaId, highlights) {
    const gameMemory = await loadGameMemory(userId);
    // Import the persistence helper
    const { saveGameSession } = await import('./game-persistence.js');
    // Update memory
    const updatedMemory = saveGameSession(gameMemory, {
        gameType: gameType,
        score,
        roundsPlayed,
        durationSeconds,
        playedAt: Date.now(),
        personaId,
    }, highlights);
    // Save
    await saveGameMemory(userId, updatedMemory);
    log.info({
        userId,
        gameType,
        score,
        totalGames: updatedMemory.totalGamesPlayed,
    }, '🎮 Recorded game completion');
}
/**
 * Update musical DNA (affinities)
 * Called after significant game actions
 */
export async function updateMusicalDNA(userId, item, guessTimeMs, correct, genre, decade) {
    const gameMemory = await loadGameMemory(userId);
    const { recordGuess } = await import('./game-intelligence.js');
    const updatedMemory = recordGuess(gameMemory, item, guessTimeMs, correct, genre, decade);
    await saveGameMemory(userId, updatedMemory);
}
// ============================================================================
// SHUTDOWN
// ============================================================================
/**
 * Flush all pending saves on shutdown
 */
export async function shutdown() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    await flushDirtyUsers();
    log.info('🎮 Game store shut down');
}
//# sourceMappingURL=game-store.js.map