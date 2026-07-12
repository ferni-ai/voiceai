/**
 * Server Infrastructure
 *
 * Exports server modules for use in gateway or standalone mode.
 */

// Shared utilities
export * from './shared/index.js';

// Token utilities (library only — no HTTP server)
export {
  validateConfig,
  getLiveKitUrl,
  createToken,
  createRoomWithAgent,
  createDemoRoom,
} from './token/livekit.js';
export {
  isAllowedReturnUrl,
  sanitizeReturnUrl,
  isValidId,
  sendInvalidIdError,
  validateIds,
  validateRequired,
  sendMissingFieldError,
} from './token/validation.js';
export {
  DEMO_CONFIG,
  cleanupOldRateLimits,
  startRateLimitCleanup,
  stopRateLimitCleanup,
  checkDemoAllowed,
  recordDemoSession,
  getDemoStats,
} from './token/demo-rate-limit.js';
export * as spotifyOAuth from './token/oauth/spotify.js';
export * as googleCalendarOAuth from './token/oauth/google-calendar.js';
