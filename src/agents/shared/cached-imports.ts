/**
 * Cached Imports - Re-export from services layer + agent-specific imports
 *
 * This file re-exports from src/services/cached-imports.ts
 * to maintain backward compatibility while respecting architecture layers.
 *
 * Startup functions are defined here (not in services) because
 * startup.js is at the application level and services cannot import it.
 *
 * @deprecated Import from '../../services/cached-imports.js' instead for non-startup functions
 */

export {
  getBehavioralContextBuilder,
  getEasterEggChecker,
  getTaskManagerCached,
  getPersonaAsyncCached,
  getBundleFunctionsCached,
  getVoiceManagerCached,
  getMusicPlayerCached,
  getIdentifyFromMetadataCached,
  isMusicEnabledCached,
  preloadCommonModules,
  resetCachedModules,
} from '../../services/cached-imports.js';

// ============================================================================
// STARTUP FUNCTIONS (agent-level only)
// ============================================================================

// Startup is application-level code, so it must be cached here in agents layer
// (not in services layer which cannot import from startup.js)

interface StartupModuleRefs {
  startup: typeof import('../../startup.js').startup | null;
  registerShutdownHandlers: typeof import('../../startup.js').registerShutdownHandlers | null;
}

const startupModules: StartupModuleRefs = {
  startup: null,
  registerShutdownHandlers: null,
};

/**
 * Get cached startup functions
 */
export async function getStartupFunctionsCached(): Promise<{
  startup: NonNullable<StartupModuleRefs['startup']>;
  registerShutdownHandlers: NonNullable<StartupModuleRefs['registerShutdownHandlers']>;
}> {
  if (!startupModules.startup) {
    const mod = await import('../../startup.js');
    startupModules.startup = mod.startup;
    startupModules.registerShutdownHandlers = mod.registerShutdownHandlers;
  }
  return {
    startup: startupModules.startup!,
    registerShutdownHandlers: startupModules.registerShutdownHandlers!,
  };
}
