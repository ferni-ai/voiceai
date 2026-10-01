/**
 * Local integration routes (TypeScript modules in src/servers/api/routes).
 *
 * Health, tokens, OAuth flows, devices and smart home, plus the
 * "Better Than Human" visual memory / ambient mode / BTH debug routes.
 * These run without an error boundary, exactly as before the split.
 */

import type { UrlWithParsedQuery } from 'url';
import {
  handlePlaidRoutes,
  handleSpotifyRoutes,
  handleHealthRoutes,
  handleTokenRoutes,
  handleGoogleCalendarRoutes,
  handleAppleCalendarRoutes,
  handleMicrosoftCalendarRoutes,
  handleMusicRoutes,
  handleAgentRoutes,
  handlePushRoutes,
  handleWebhookRoutes,
  handleSpotifyRoomsRoutes,
  handleSpotifyPlaybackRoutes,
  handleEcobeeRoutes,
  handleSmartHomeRoutes,
  handleVibeRoutes,
  handleEightSleepRoutes,
  handleOuraRoutes,
  handleAppleHealthRoutes,
  handleAppleNotification,
  handleIntelligentRoutingRoutes,
  // "Better Than Human" routes
  handleVisualMemoryRoutes,
  handleAmbientModeRoutes,
  handleBTHIntelligenceRoutes,
  // Wearables OAuth routes
  handleWearablesRoutes,
} from '../routes/index.js';
import { handleHealthSyncRoutes } from '../routes/health-sync.js';
import type { RouteContext } from './route-context.js';

/**
 * Dispatch local integration routes. Returns true when the request is finished.
 */
export async function dispatchIntegrationRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // Health routes
  if (await handleHealthRoutes(req, res, pathname)) return true;

  // Token routes (LiveKit tokens, demo sessions)
  if (await handleTokenRoutes(req, res, pathname, parsedUrl)) return true;

  // Plaid routes
  if (pathname.startsWith('/plaid')) {
    if (await handlePlaidRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Spotify routes (Web Playback SDK + OAuth device flows)
  if (pathname.startsWith('/spotify')) {
    if (await handleSpotifyRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Wearables OAuth routes (login, callback, token, unlink, status)
  if (pathname.startsWith('/wearables')) {
    if (await handleWearablesRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Google Calendar OAuth routes
  if (pathname.startsWith('/auth/google')) {
    if (await handleGoogleCalendarRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Apple Calendar OAuth routes (Sign in with Apple)
  if (pathname.startsWith('/auth/apple')) {
    if (await handleAppleCalendarRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Microsoft Calendar OAuth routes
  if (pathname.startsWith('/auth/microsoft')) {
    if (await handleMicrosoftCalendarRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Music status routes
  if (pathname.startsWith('/api/music')) {
    if (await handleMusicRoutes(req, res, pathname)) return true;
  }

  // Agent discovery routes
  if (pathname.startsWith('/api/agents') || pathname === '/api/team/order') {
    if (await handleAgentRoutes(req, res, pathname)) return true;
  }

  // Push notification routes
  if (pathname.startsWith('/api/push')) {
    if (await handlePushRoutes(req, res, pathname)) return true;
  }

  // Eight Sleep routes
  if (pathname.startsWith('/api/eight-sleep')) {
    if (await handleEightSleepRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Oura Ring routes
  if (pathname.startsWith('/api/oura')) {
    if (await handleOuraRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Apple Health routes
  // Health summaries from the mobile apps
  if (await handleHealthSyncRoutes(req, res, pathname)) return true;

  if (pathname.startsWith('/api/apple-health')) {
    if (await handleAppleHealthRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Apple Sign In notifications (server-to-server)
  if (pathname === '/api/apple/notifications') {
    await handleAppleNotification(req, res);
    return true;
  }

  // Webhooks routes (IFTTT, Zapier, Home Assistant, Siri Shortcuts)
  if (pathname.startsWith('/api/webhooks')) {
    if (await handleWebhookRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Spotify Rooms routes (multi-room audio)
  if (pathname.startsWith('/api/spotify/rooms') || pathname.startsWith('/api/spotify/devices')) {
    if (await handleSpotifyRoomsRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Spotify playback on the caller's own linked account (vibe controller)
  if (pathname.startsWith('/api/spotify/')) {
    if (await handleSpotifyPlaybackRoutes(req, res, pathname)) return true;
  }

  // Ecobee thermostat routes
  if (pathname.startsWith('/api/ecobee')) {
    if (await handleEcobeeRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Smart home routes (Hue, LIFX)
  if (pathname.startsWith('/api/smart-home')) {
    if (await handleSmartHomeRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // Vibe routes (unified environment control)
  if (pathname.startsWith('/api/vibe')) {
    if (await handleVibeRoutes(req, res, pathname)) return true;
  }

  // 🧠 Intelligent routing dashboard & control routes
  if (pathname.startsWith('/api/intelligent-routing')) {
    // Cast URL to expected type - the handler doesn't use parsed query features
    if (
      await handleIntelligentRoutingRoutes(
        req,
        res,
        pathname,
        parsedUrl as unknown as UrlWithParsedQuery
      )
    )
      return true;
  }

  // ============================================================================
  // "BETTER THAN HUMAN" ROUTES
  // Visual Memory, Ambient Mode - superhuman awareness & recall
  // ============================================================================

  // 📸 Visual Memory routes (photo/image recall)
  if (pathname.startsWith('/api/visual-memory')) {
    if (await handleVisualMemoryRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // 🌙 Ambient Mode routes (continuous background presence)
  if (pathname.startsWith('/api/ambient-mode')) {
    if (await handleAmbientModeRoutes(req, res, pathname, parsedUrl)) return true;
  }

  // 🧠 BTH Intelligence Debug routes (user knowledge aggregation)
  if (pathname.startsWith('/api/bth')) {
    if (await handleBTHIntelligenceRoutes(req, res)) return true;
  }

  return false;
}
