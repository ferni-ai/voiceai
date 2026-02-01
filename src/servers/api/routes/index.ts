/**
 * API Routes
 */

export { handlePlaidRoutes } from './plaid.js';
export { handleSpotifyRoutes } from './spotify.js';
export { handleHealthRoutes } from './health.js';
export { handleTokenRoutes } from './token.js';
export { handleGoogleCalendarRoutes } from './google-calendar.js';
export { handleAppleCalendarRoutes } from './apple-calendar.js';
export { handleMicrosoftCalendarRoutes } from './microsoft-calendar.js';
export { handleMusicRoutes } from './music.js';
export { handleAgentRoutes } from './agents.js';
export { handlePushRoutes } from './push.js';
export { handleWebhookRoutes } from './webhooks.js';
export { handleSpotifyRoomsRoutes } from './spotify-rooms.js';
export { handleEcobeeRoutes } from './ecobee.js';
export { handleSmartHomeRoutes } from './smart-home.js';
export { handleVibeRoutes } from './vibe.js';
export { handleEightSleepRoutes } from './eight-sleep.js';
export { handleOuraRoutes } from './oura.js';
export { handleAppleHealthRoutes } from './apple-health.js';
// Apple Sign In notifications (server-to-server)
export { handleAppleNotification } from './apple-notifications.js';
// "Better Than Human" routes
export { handleVisualMemoryRoutes } from './visual-memory.js';
export { handleAmbientModeRoutes } from './ambient-mode.js';
// Intelligent routing (6-strategy cascade)
export {
  handleIntelligentRoutingRoutes,
  registerIntelligentRoutingRoutes,
} from './intelligent-routing.js';
// Telephony webhooks (Twilio call status)
export { handleTwilioCallStatus, trackOutboundCall } from './twilio-call-status.js';
// Semantic Intelligence API (V3.0-V3.7)
export { handleSemanticIntelligenceRoutes } from './semantic-intelligence.js';
// Digital Twin Profile API
export { handleTwinProfileRoutes } from './twin-profile.js';
// Utilities API (reminders, lists, alarms, voice memos)
export { handleUtilitiesRoutes } from './utilities.js';
// "Better Than Human" Intelligence Debug API
export { handleBTHIntelligenceRoutes } from './better-than-human-intelligence.js';
// NOTE: Semantic store routes are in health.ts (uses raw HTTP pattern)
// Available at: /api/semantic-store/health, /api/semantic-store/metrics, /api/semantic-store/dashboard
//               /api/semantic-store/diagnostics, /api/semantic-store/cleanup, /api/semantic-store/ttl-statistics
// NOTE: handleOutreachRoutes is registered from src/api/outreach.routes.ts in the main server
// NOTE: calendar-data.ts was removed - calendar data is served via /api/calendar/* routes in calendar-routes.ts
