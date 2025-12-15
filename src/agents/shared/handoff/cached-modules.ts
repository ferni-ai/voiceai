/**
 * Cached Modules for Handoff
 *
 * Lazy-loaded and cached module imports to reduce handoff latency.
 * These are loaded once and reused for subsequent handoffs.
 *
 * @module agents/shared/handoff/cached-modules
 */

// ============================================================================
// CACHED MODULE STRUCTURE
// ============================================================================

interface CachedModules {
  getSessionVoiceManager:
    | typeof import('../../../speech/voice-manager.js').getSessionVoiceManager
    | null;
  getMusicPlayer: typeof import('../../../audio/index.js').getMusicPlayer | null;
  getPersonaAsync: typeof import('../../../personas/index.js').getPersonaAsync | null;
  loadBundleById: typeof import('../../../personas/bundles/index.js').loadBundleById | null;
  createBundleRuntime:
    | typeof import('../../../personas/bundles/runtime.js').createBundleRuntime
    | null;
}

const cachedModules: CachedModules = {
  getSessionVoiceManager: null,
  getMusicPlayer: null,
  getPersonaAsync: null,
  loadBundleById: null,
  createBundleRuntime: null,
};

// ============================================================================
// CACHED ACCESSORS
// ============================================================================

/**
 * Get VoiceManager with caching (session-scoped)
 */
export async function getVoiceManagerCached(sessionId: string) {
  if (!cachedModules.getSessionVoiceManager) {
    const mod = await import('../../../speech/voice-manager.js');
    cachedModules.getSessionVoiceManager = mod.getSessionVoiceManager;
  }
  return cachedModules.getSessionVoiceManager(sessionId);
}

/**
 * Get MusicPlayer with caching - returns null if music is disabled
 */
export async function getMusicPlayerCached() {
  // Check if music is enabled first
  const { isMusicEnabled } = await import('../../../config/environment.js');
  if (!isMusicEnabled()) {
    return null;
  }

  if (!cachedModules.getMusicPlayer) {
    const mod = await import('../../../audio/index.js');
    cachedModules.getMusicPlayer = mod.getMusicPlayer;
  }
  return cachedModules.getMusicPlayer();
}

/**
 * Get getPersonaAsync with caching
 */
export async function getPersonaAsyncCached(personaId: string) {
  if (!cachedModules.getPersonaAsync) {
    const mod = await import('../../../personas/index.js');
    cachedModules.getPersonaAsync = mod.getPersonaAsync;
  }
  return cachedModules.getPersonaAsync(personaId);
}

/**
 * Get bundle loading functions with caching
 */
export async function getBundleFunctionsCached() {
  if (!cachedModules.loadBundleById) {
    const bundleMod = await import('../../../personas/bundles/index.js');
    cachedModules.loadBundleById = bundleMod.loadBundleById;
  }
  if (!cachedModules.createBundleRuntime) {
    const runtimeMod = await import('../../../personas/bundles/runtime.js');
    cachedModules.createBundleRuntime = runtimeMod.createBundleRuntime;
  }
  return {
    loadBundleById: cachedModules.loadBundleById,
    createBundleRuntime: cachedModules.createBundleRuntime,
  };
}

/**
 * Clear all cached modules (for testing)
 */
export function clearCachedModules(): void {
  cachedModules.getSessionVoiceManager = null;
  cachedModules.getMusicPlayer = null;
  cachedModules.getPersonaAsync = null;
  cachedModules.loadBundleById = null;
  cachedModules.createBundleRuntime = null;
}
