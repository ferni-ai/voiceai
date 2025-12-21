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
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Cached module references
 */
interface CachedModuleRefs {
  // Context builders
  buildConversationContext:
    | typeof import('../../intelligence/context-builders/index.js').buildConversationContext
    | null;
  formatContextForPrompt:
    | typeof import('../../intelligence/context-builders/index.js').formatContextForPrompt
    | null;

  // Easter eggs
  checkForEasterEgg: typeof import('../../personas/easter-eggs.js').checkForEasterEgg | null;

  // Task manager
  getTaskManager: typeof import('../../tasks/task-manager.js').getTaskManager | null;

  // Persona lookup
  getPersonaAsync: typeof import('../../personas/index.js').getPersonaAsync | null;

  // Bundle system
  loadBundleById: typeof import('../../personas/bundles/index.js').loadBundleById | null;
  createBundleRuntime:
    | typeof import('../../personas/bundles/runtime.js').createBundleRuntime
    | null;

  // Voice manager
  getVoiceManager: typeof import('../../speech/voice-manager.js').getVoiceManager | null;

  // Music player
  getMusicPlayer: typeof import('../../audio/index.js').getMusicPlayer | null;

  // User identification
  identifyFromMetadata:
    | typeof import('../../services/identity/user-identification.js').identifyFromMetadata
    | null;

  // Startup
  startup: typeof import('../../startup.js').startup | null;
  registerShutdownHandlers: typeof import('../../startup.js').registerShutdownHandlers | null;

  // Environment
  isMusicEnabled: typeof import('../../config/environment.js').isMusicEnabled | null;
}

// ============================================================================
// CACHED MODULE STORE
// ============================================================================

const cachedModules: CachedModuleRefs = {
  buildConversationContext: null,
  formatContextForPrompt: null,
  checkForEasterEgg: null,
  getTaskManager: null,
  getPersonaAsync: null,
  loadBundleById: null,
  createBundleRuntime: null,
  getVoiceManager: null,
  getMusicPlayer: null,
  identifyFromMetadata: null,
  startup: null,
  registerShutdownHandlers: null,
  isMusicEnabled: null,
};

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

/**
 * Get cached context builders
 */
export async function getContextBuilders(): Promise<{
  buildConversationContext: NonNullable<CachedModuleRefs['buildConversationContext']>;
  formatContextForPrompt: NonNullable<CachedModuleRefs['formatContextForPrompt']>;
}> {
  if (!cachedModules.buildConversationContext) {
    const mod = await import('../../intelligence/context-builders/index.js');
    cachedModules.buildConversationContext = mod.buildConversationContext;
    cachedModules.formatContextForPrompt = mod.formatContextForPrompt;
  }
  return {
    buildConversationContext: cachedModules.buildConversationContext!,
    formatContextForPrompt: cachedModules.formatContextForPrompt!,
  };
}

// ============================================================================
// EASTER EGGS
// ============================================================================

/**
 * Get cached easter egg checker
 */
export async function getEasterEggChecker(): Promise<
  NonNullable<CachedModuleRefs['checkForEasterEgg']>
> {
  if (!cachedModules.checkForEasterEgg) {
    const mod = await import('../../personas/easter-eggs.js');
    cachedModules.checkForEasterEgg = mod.checkForEasterEgg;
  }
  return cachedModules.checkForEasterEgg!;
}

// ============================================================================
// TASK MANAGER
// ============================================================================

/**
 * Get cached task manager instance
 */
export async function getTaskManagerCached(): Promise<
  ReturnType<NonNullable<CachedModuleRefs['getTaskManager']>>
> {
  if (!cachedModules.getTaskManager) {
    const mod = await import('../../tasks/task-manager.js');
    cachedModules.getTaskManager = mod.getTaskManager;
  }
  return cachedModules.getTaskManager!();
}

// ============================================================================
// PERSONA SYSTEM
// ============================================================================

/**
 * Get cached persona lookup function
 */
export async function getPersonaAsyncCached(
  personaId: string
): Promise<ReturnType<NonNullable<CachedModuleRefs['getPersonaAsync']>>> {
  if (!cachedModules.getPersonaAsync) {
    const mod = await import('../../personas/index.js');
    cachedModules.getPersonaAsync = mod.getPersonaAsync;
  }
  return cachedModules.getPersonaAsync!(personaId);
}

// ============================================================================
// BUNDLE SYSTEM
// ============================================================================

/**
 * Get cached bundle functions
 */
export async function getBundleFunctionsCached(): Promise<{
  loadBundleById: NonNullable<CachedModuleRefs['loadBundleById']>;
  createBundleRuntime: NonNullable<CachedModuleRefs['createBundleRuntime']>;
}> {
  if (!cachedModules.loadBundleById) {
    const bundleMod = await import('../../personas/bundles/index.js');
    cachedModules.loadBundleById = bundleMod.loadBundleById;
  }
  if (!cachedModules.createBundleRuntime) {
    const runtimeMod = await import('../../personas/bundles/runtime.js');
    cachedModules.createBundleRuntime = runtimeMod.createBundleRuntime;
  }
  return {
    loadBundleById: cachedModules.loadBundleById!,
    createBundleRuntime: cachedModules.createBundleRuntime!,
  };
}

// ============================================================================
// VOICE MANAGER
// ============================================================================

/**
 * Get cached voice manager
 */
export async function getVoiceManagerCached(): Promise<
  ReturnType<NonNullable<CachedModuleRefs['getVoiceManager']>>
> {
  if (!cachedModules.getVoiceManager) {
    const mod = await import('../../speech/voice-manager.js');
    cachedModules.getVoiceManager = mod.getVoiceManager;
  }
  return cachedModules.getVoiceManager!();
}

// ============================================================================
// MUSIC PLAYER
// ============================================================================

/**
 * Get cached music player (returns null if music is disabled)
 */
export async function getMusicPlayerCached(): Promise<ReturnType<
  NonNullable<CachedModuleRefs['getMusicPlayer']>
> | null> {
  // Check if music is enabled first
  if (!cachedModules.isMusicEnabled) {
    const envMod = await import('../../config/environment.js');
    cachedModules.isMusicEnabled = envMod.isMusicEnabled;
  }

  if (!cachedModules.isMusicEnabled!()) {
    return null;
  }

  if (!cachedModules.getMusicPlayer) {
    const mod = await import('../../audio/index.js');
    cachedModules.getMusicPlayer = mod.getMusicPlayer;
  }
  return cachedModules.getMusicPlayer!();
}

// ============================================================================
// USER IDENTIFICATION
// ============================================================================

/**
 * Get cached user identification function
 */
export async function getIdentifyFromMetadataCached(): Promise<
  NonNullable<CachedModuleRefs['identifyFromMetadata']>
> {
  if (!cachedModules.identifyFromMetadata) {
    const mod = await import('../../services/identity/user-identification.js');
    cachedModules.identifyFromMetadata = mod.identifyFromMetadata;
  }
  return cachedModules.identifyFromMetadata!;
}

// ============================================================================
// STARTUP
// ============================================================================

/**
 * Get cached startup functions
 */
export async function getStartupFunctionsCached(): Promise<{
  startup: NonNullable<CachedModuleRefs['startup']>;
  registerShutdownHandlers: NonNullable<CachedModuleRefs['registerShutdownHandlers']>;
}> {
  if (!cachedModules.startup) {
    const mod = await import('../../startup.js');
    cachedModules.startup = mod.startup;
    cachedModules.registerShutdownHandlers = mod.registerShutdownHandlers;
  }
  return {
    startup: cachedModules.startup!,
    registerShutdownHandlers: cachedModules.registerShutdownHandlers!,
  };
}

// ============================================================================
// ENVIRONMENT
// ============================================================================

/**
 * Check if music is enabled (cached)
 */
export async function isMusicEnabledCached(): Promise<boolean> {
  if (!cachedModules.isMusicEnabled) {
    const mod = await import('../../config/environment.js');
    cachedModules.isMusicEnabled = mod.isMusicEnabled;
  }
  return cachedModules.isMusicEnabled!();
}

// ============================================================================
// PRELOADING
// ============================================================================

/**
 * Preload frequently-used modules during prewarm
 * Call this during agent prewarm to reduce latency on first turn
 */
export async function preloadCommonModules(): Promise<void> {
  await Promise.all([
    getContextBuilders(),
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
export function resetCachedModules(): void {
  const keys = Object.keys(cachedModules) as Array<keyof CachedModuleRefs>;
  keys.forEach((key) => {
    cachedModules[key] = null;
  });
}
