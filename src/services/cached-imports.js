/**
 * Cached Imports
 *
 * Lazy-loaded and cached dynamic imports to reduce latency.
 * All frequently-used dynamic imports should be centralized here.
 *
 * Benefits:
 * - Single location for all cached imports
 * - Consistent caching pattern
 * - Reduced latency after first load
 * - Easy to test and mock
 *
 * Note: This file was moved from agents/shared/ to services/
 * to fix architecture layer violations (tools should not import from agents)
 */
// ============================================================================
// CACHED MODULE STORE
// ============================================================================
const cachedModules = {
    buildIntegratedContext: null,
    checkForEasterEgg: null,
    getTaskManager: null,
    getPersonaAsync: null,
    loadBundleById: null,
    createBundleRuntime: null,
    getVoiceManager: null,
    getMusicPlayer: null,
    identifyFromMetadata: null,
    isMusicEnabled: null,
};
// ============================================================================
// BEHAVIORAL CONTEXT BUILDER
// ============================================================================
/**
 * Get cached behavioral context builder
 *
 * This replaces the old getContextBuilders() function.
 * Returns a function that produces:
 * - Behavioral directive (HOW to behave)
 * - Awareness facts (WHAT to know)
 * - Tool guidance (WHEN to query)
 */
export async function getBehavioralContextBuilder() {
    if (!cachedModules.buildIntegratedContext) {
        const mod = await import('../intelligence/context-builders/behavioral/integration.js');
        cachedModules.buildIntegratedContext = mod.buildIntegratedContext;
    }
    return cachedModules.buildIntegratedContext;
}
// ============================================================================
// EASTER EGGS
// ============================================================================
/**
 * Get cached easter egg checker
 */
export async function getEasterEggChecker() {
    if (!cachedModules.checkForEasterEgg) {
        const mod = await import('../personas/easter-eggs.js');
        cachedModules.checkForEasterEgg = mod.checkForEasterEgg;
    }
    return cachedModules.checkForEasterEgg;
}
// ============================================================================
// TASK MANAGER
// ============================================================================
/**
 * Get cached task manager instance
 */
export async function getTaskManagerCached() {
    if (!cachedModules.getTaskManager) {
        const mod = await import('../tasks/task-manager.js');
        cachedModules.getTaskManager = mod.getTaskManager;
    }
    return cachedModules.getTaskManager();
}
// ============================================================================
// PERSONA SYSTEM
// ============================================================================
/**
 * Get cached persona lookup function
 */
export async function getPersonaAsyncCached(personaId) {
    if (!cachedModules.getPersonaAsync) {
        const mod = await import('../personas/index.js');
        cachedModules.getPersonaAsync = mod.getPersonaAsync;
    }
    return cachedModules.getPersonaAsync(personaId);
}
// ============================================================================
// BUNDLE SYSTEM
// ============================================================================
/**
 * Get cached bundle functions
 */
export async function getBundleFunctionsCached() {
    if (!cachedModules.loadBundleById) {
        const bundleMod = await import('../personas/bundles/index.js');
        cachedModules.loadBundleById = bundleMod.loadBundleById;
    }
    if (!cachedModules.createBundleRuntime) {
        const runtimeMod = await import('../personas/bundles/runtime.js');
        cachedModules.createBundleRuntime = runtimeMod.createBundleRuntime;
    }
    return {
        loadBundleById: cachedModules.loadBundleById,
        createBundleRuntime: cachedModules.createBundleRuntime,
    };
}
// ============================================================================
// VOICE MANAGER
// ============================================================================
/**
 * Get cached voice manager
 */
export async function getVoiceManagerCached() {
    if (!cachedModules.getVoiceManager) {
        const mod = await import('../speech/voice-manager.js');
        cachedModules.getVoiceManager = mod.getVoiceManager;
    }
    return cachedModules.getVoiceManager();
}
// ============================================================================
// MUSIC PLAYER
// ============================================================================
/**
 * Get cached music player (returns null if music is disabled)
 */
export async function getMusicPlayerCached() {
    // Check if music is enabled first
    if (!cachedModules.isMusicEnabled) {
        const envMod = await import('../config/environment.js');
        cachedModules.isMusicEnabled = envMod.isMusicEnabled;
    }
    if (!cachedModules.isMusicEnabled()) {
        return null;
    }
    if (!cachedModules.getMusicPlayer) {
        const mod = await import('../audio/index.js');
        cachedModules.getMusicPlayer = mod.getMusicPlayer;
    }
    return cachedModules.getMusicPlayer();
}
// ============================================================================
// USER IDENTIFICATION
// ============================================================================
/**
 * Get cached user identification function
 */
export async function getIdentifyFromMetadataCached() {
    if (!cachedModules.identifyFromMetadata) {
        const mod = await import('./identity/user-identification.js');
        cachedModules.identifyFromMetadata = mod.identifyFromMetadata;
    }
    return cachedModules.identifyFromMetadata;
}
// ============================================================================
// ENVIRONMENT
// ============================================================================
/**
 * Check if music is enabled (cached)
 */
export async function isMusicEnabledCached() {
    if (!cachedModules.isMusicEnabled) {
        const mod = await import('../config/environment.js');
        cachedModules.isMusicEnabled = mod.isMusicEnabled;
    }
    return cachedModules.isMusicEnabled();
}
// ============================================================================
// PRELOADING
// ============================================================================
/**
 * Preload frequently-used modules during prewarm
 * Call this during agent prewarm to reduce latency on first turn
 */
export async function preloadCommonModules() {
    await Promise.all([
        getBehavioralContextBuilder(),
        getEasterEggChecker(),
        getTaskManagerCached(),
        getVoiceManagerCached(),
        isMusicEnabledCached(),
    ]);
}
// ============================================================================
// RESET (for testing)
// ============================================================================
/**
 * Clear all cached modules (for testing)
 */
export function resetCachedModules() {
    const keys = Object.keys(cachedModules);
    keys.forEach((key) => {
        cachedModules[key] = null;
    });
}
//# sourceMappingURL=cached-imports.js.map