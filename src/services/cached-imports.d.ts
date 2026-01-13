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
/**
 * Cached module references
 */
interface CachedModuleRefs {
    buildIntegratedContext: typeof import('../intelligence/context-builders/behavioral/integration.js').buildIntegratedContext | null;
    checkForEasterEgg: typeof import('../personas/easter-eggs.js').checkForEasterEgg | null;
    getTaskManager: typeof import('../tasks/task-manager.js').getTaskManager | null;
    getPersonaAsync: typeof import('../personas/index.js').getPersonaAsync | null;
    loadBundleById: typeof import('../personas/bundles/index.js').loadBundleById | null;
    createBundleRuntime: typeof import('../personas/bundles/runtime.js').createBundleRuntime | null;
    getVoiceManager: typeof import('../speech/voice-manager.js').getVoiceManager | null;
    getMusicPlayer: typeof import('../audio/index.js').getMusicPlayer | null;
    identifyFromMetadata: typeof import('./identity/user-identification.js').identifyFromMetadata | null;
    isMusicEnabled: typeof import('../config/environment.js').isMusicEnabled | null;
}
/**
 * Get cached behavioral context builder
 *
 * This replaces the old getContextBuilders() function.
 * Returns a function that produces:
 * - Behavioral directive (HOW to behave)
 * - Awareness facts (WHAT to know)
 * - Tool guidance (WHEN to query)
 */
export declare function getBehavioralContextBuilder(): Promise<NonNullable<CachedModuleRefs['buildIntegratedContext']>>;
/**
 * Get cached easter egg checker
 */
export declare function getEasterEggChecker(): Promise<NonNullable<CachedModuleRefs['checkForEasterEgg']>>;
/**
 * Get cached task manager instance
 */
export declare function getTaskManagerCached(): Promise<ReturnType<NonNullable<CachedModuleRefs['getTaskManager']>>>;
/**
 * Get cached persona lookup function
 */
export declare function getPersonaAsyncCached(personaId: string): Promise<ReturnType<NonNullable<CachedModuleRefs['getPersonaAsync']>>>;
/**
 * Get cached bundle functions
 */
export declare function getBundleFunctionsCached(): Promise<{
    loadBundleById: NonNullable<CachedModuleRefs['loadBundleById']>;
    createBundleRuntime: NonNullable<CachedModuleRefs['createBundleRuntime']>;
}>;
/**
 * Get cached voice manager
 */
export declare function getVoiceManagerCached(): Promise<ReturnType<NonNullable<CachedModuleRefs['getVoiceManager']>>>;
/**
 * Get cached music player (returns null if music is disabled)
 */
export declare function getMusicPlayerCached(): Promise<ReturnType<NonNullable<CachedModuleRefs['getMusicPlayer']>> | null>;
/**
 * Get cached user identification function
 */
export declare function getIdentifyFromMetadataCached(): Promise<NonNullable<CachedModuleRefs['identifyFromMetadata']>>;
/**
 * Check if music is enabled (cached)
 */
export declare function isMusicEnabledCached(): Promise<boolean>;
/**
 * Preload frequently-used modules during prewarm
 * Call this during agent prewarm to reduce latency on first turn
 */
export declare function preloadCommonModules(): Promise<void>;
/**
 * Clear all cached modules (for testing)
 */
export declare function resetCachedModules(): void;
export {};
//# sourceMappingURL=cached-imports.d.ts.map