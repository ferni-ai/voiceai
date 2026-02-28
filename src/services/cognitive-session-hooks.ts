/**
 * Re-export shim for backward compatibility.
 * Canonical location: ./session/cognitive-session-hooks.ts
 * @module
 */
export {
  onCognitiveSessionStart,
  onCognitiveSessionEnd,
  syncCognitiveDataToProfile,
  getCognitiveSessionInfo,
  type CognitiveSessionStartOptions,
  type CognitiveSessionEndOptions,
} from './session/cognitive-session-hooks.js';
