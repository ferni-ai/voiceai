/**
 * World model — compact cached snapshot for the live voice prompt.
 *
 * @module intelligence/world-model
 */

export { worldModelBuilder, buildWorldModelContext } from './builder.js';
export { resetWorldModelCacheForTests, WORLD_MODEL_CACHE_TTL_MS } from './cache.js';
export { renderWorldModelSection, WORLD_MODEL_MAX_CHARS } from './render.js';
export { buildWorldModelSnapshot } from './snapshot.js';
export { createDefaultWorldModelSources } from './sources.js';
export type { WorldModelSources } from './sources.js';
export type { WorldModelSnapshot } from './types.js';
export { isEmptySnapshot } from './types.js';
