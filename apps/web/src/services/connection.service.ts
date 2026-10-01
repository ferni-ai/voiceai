/**
 * Connection Service (compatibility shim)
 *
 * The implementation lives in ./connection/ (state, lifecycle, room handlers,
 * audio/music tracks, quality monitoring). This file re-exports the public API
 * so existing imports keep working.
 */

export { connectionService, type ConnectionCallbacks } from './connection/index.js';
