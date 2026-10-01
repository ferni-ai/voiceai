/**
 * Vibe Controller UI (compatibility shim)
 *
 * The implementation lives in ./vibe-controller/ (split by responsibility:
 * types, state, presets, styles, rendering, API actions, device setup flows;
 * index.ts owns the panel lifecycle). This file re-exports the public API so
 * existing imports keep working.
 */

export {
  initialize,
  show,
  hide,
  setCallbacks,
  getState,
  default,
} from './vibe-controller/index.js';
