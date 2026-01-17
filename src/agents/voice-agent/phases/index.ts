/**
 * Voice Agent Phases
 *
 * Re-exports all phase modules for voice agent entry.
 * Phases are designed to be composed together in the main entry function.
 *
 * @module voice-agent/phases
 */

export type * from './types.js';
export { loadVoiceDeps, getCachedVoiceDeps, areVoiceDepsLoaded } from './load-deps.js';
export { loadPersonaPhase, getPrewarmedResources, loadPersonaLocally } from './load-persona.js';
// buildTools removed - agents now build their own tools via direct domain imports
export { connectToRoom, waitForParticipant, detectConnectionType } from './connect-room.js';

// ============================================================================
// NEW MODULAR PHASES (Dec 2024)
// ============================================================================

// Performance optimizations
export {
  initializePerformance,
  type PerformanceConfig,
  type PerformanceResult,
} from './performance-init.js';

// Tool setup
export {
  setupTools,
  getLocalizedVoice,
  type ToolSetupConfig,
  type ToolSetupResult,
  type VoiceLocalizationConfig,
  type VoiceLocalizationResult,
} from './tool-setup.js';

// Connection state monitoring
export {
  setupConnectionMonitoring,
  type ConnectionMonitorConfig,
  type DisconnectInfo,
} from './connection-state.js';

// User awareness building (Better Than Human context)
export {
  buildUserAwareness,
  type UserAwarenessConfig,
  type UserAwarenessResult,
} from './user-awareness.js';

// Noise cancellation setup (Krisp-powered)
export {
  setupNoiseCancellation,
  type NoiseCancellationConfig,
  type NoiseCancellationResult,
} from './noise-cancellation.js';
