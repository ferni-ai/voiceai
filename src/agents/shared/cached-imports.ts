/**
 * Cached Imports - Re-export from services layer
 *
 * This file re-exports from src/services/cached-imports.ts
 * to maintain backward compatibility while respecting architecture layers.
 *
 * @deprecated Import from '../../services/cached-imports.js' instead
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
  getStartupFunctionsCached,
  isMusicEnabledCached,
  preloadCommonModules,
  resetCachedModules,
} from '../../services/cached-imports.js';
