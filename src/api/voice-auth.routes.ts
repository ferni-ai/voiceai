/**
 * Voice Authentication API Handler
 *
 * This file is a backward-compatible re-export from the modular voice-auth/ directory.
 * The implementation has been split into smaller, focused modules:
 *
 * - voice-auth/types.ts           - Shared types and constants
 * - voice-auth/helpers.ts         - Utility functions and session storage
 * - voice-auth/enrollment-routes.ts   - Enrollment operations
 * - voice-auth/verification-routes.ts - Verify, identify, continuous auth
 * - voice-auth/household-routes.ts    - Multi-user household management
 * - voice-auth/memory-routes.ts       - Conversation memory
 * - voice-auth/index.ts           - Main router
 *
 * @module VoiceAuthHandler
 */

// Re-export everything from the modular implementation
export { handleVoiceAuthRoutes } from './voice-auth/index.js';
export * from './voice-auth/types.js';
export {
  enrollmentSessions,
  continuousAuthenticators,
  getUserId,
  getVerifiedUserId,
  getClientIP,
  getDeviceInfo,
} from './voice-auth/helpers.js';
