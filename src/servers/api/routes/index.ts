/**
 * API Routes
 */

export { handlePlaidRoutes } from './plaid.js';
export { handleSpotifyRoutes } from './spotify.js';
export { handleHealthRoutes } from './health.js';
export { handleTokenRoutes } from './token.js';
export { handleGoogleCalendarRoutes } from './google-calendar.js';
export { handleMicrosoftCalendarRoutes } from './microsoft-calendar.js';
export { handleMusicRoutes } from './music.js';
export { handleAgentRoutes } from './agents.js';
export { handlePushRoutes } from './push.js';
export { handleWebhookRoutes } from './webhooks.js';
export { handleSpotifyRoomsRoutes } from './spotify-rooms.js';
export { handleEcobeeRoutes } from './ecobee.js';
export { handleEightSleepRoutes } from './eight-sleep.js';
export { handleOuraRoutes } from './oura.js';
export { handleAppleHealthRoutes } from './apple-health.js';
// NOTE: calendar-data.ts was removed - calendar data is served via /api/calendar/* routes in calendar-routes.ts
