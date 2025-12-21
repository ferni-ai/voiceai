/**
 * Calendar Integration API Routes
 *
 * OAuth flows and management for calendar platforms.
 * Supports: Google Calendar, Apple Calendar (via native)
 *
 * @module api/v1/integrations/calendar
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';

// SECURITY: Schema for validating OAuth state parameter
const OAuthStateSchema = z.object({
  userId: z.string().min(1),
});
import {
  getCalendarAuthUrl,
  fetchUpcomingEvents,
  hasCalendarConnected,
  getUpcomingEvents,
  getCurrentLocation,
  saveLocation,
  updateLocation,
  disconnectCalendar,
  type LocationType,
} from '../../../services/context-awareness/location-calendar.js';
import {
  exchangeCodeForTokens,
  storeUserTokens,
} from '../../../services/identity/google-calendar-oauth.js';

const log = createLogger({ module: 'api:calendar' });
const router = Router();

// ============================================================================
// GET /api/v1/integrations/calendar/status
// Check if user has calendar connected
// ============================================================================
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const connected = await hasCalendarConnected(userId);
    const events = connected ? getUpcomingEvents(userId) : [];
    const location = connected ? getCurrentLocation(userId) : null;

    return res.json({
      connected,
      upcomingEventsCount: events.length,
      currentLocation: location?.type || null,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get calendar status');
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

// ============================================================================
// GET /api/v1/integrations/calendar/connect
// Get OAuth authorization URL
// ============================================================================
router.get('/connect', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const authUrl = getCalendarAuthUrl(userId);

    log.info({ userId }, 'Generated calendar auth URL');
    return res.json({ authUrl });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate auth URL');
    return res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// ============================================================================
// GET /api/v1/integrations/calendar/callback
// OAuth callback handler
// ============================================================================
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      log.warn({ error }, 'OAuth error from Google');
      return res.redirect(`/settings/integrations?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    // SECURITY: Decode and validate state parameter with Zod schema
    let userId: string;
    try {
      const rawDecoded = JSON.parse(Buffer.from(state, 'base64').toString());
      const parsed = OAuthStateSchema.safeParse(rawDecoded);
      if (!parsed.success) {
        log.warn({ issues: parsed.error.issues }, 'Invalid OAuth state structure');
        return res.status(400).json({ error: 'Invalid state parameter' });
      }
      userId = parsed.data.userId;
    } catch {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    // Exchange code for tokens and store them
    try {
      const tokens = await exchangeCodeForTokens(code);
      await storeUserTokens(userId, tokens);

      // Trigger initial event fetch
      void fetchUpcomingEvents(userId, 48);

      log.info({ userId }, 'Calendar connected successfully');
      return res.redirect('/settings/integrations?success=calendar');
    } catch (tokenError) {
      log.error({ error: String(tokenError), userId }, 'Token exchange failed');
      return res.redirect('/settings/integrations?error=token_exchange_failed');
    }
  } catch (error) {
    log.error({ error: String(error) }, 'OAuth callback failed');
    return res.redirect('/settings/integrations?error=callback_failed');
  }
});

// ============================================================================
// GET /api/v1/integrations/calendar/events
// Get upcoming calendar events
// ============================================================================
router.get('/events', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const hours = parseInt(req.query.hours as string) || 24;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!hasCalendarConnected(userId)) {
      return res.status(400).json({ error: 'Calendar not connected' });
    }

    // Fetch fresh events
    const events = await fetchUpcomingEvents(userId, hours);

    return res.json({
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        eventType: e.eventType,
        attendeeCount: e.attendees?.length || 0,
      })),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get events');
    return res.status(500).json({ error: 'Failed to get events' });
  }
});

// ============================================================================
// POST /api/v1/integrations/calendar/location
// Update user's current location
// ============================================================================
router.post('/location', async (req: Request, res: Response) => {
  try {
    const { userId, latitude, longitude, accuracy } = req.body as {
      userId: string;
      latitude: number;
      longitude: number;
      accuracy: number;
    };

    if (!userId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'userId, latitude, and longitude are required' });
    }

    updateLocation(userId, latitude, longitude, accuracy || 0);

    const currentLocation = getCurrentLocation(userId);
    return res.json({
      success: true,
      locationType: currentLocation?.type || 'unknown',
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update location');
    return res.status(500).json({ error: 'Failed to update location' });
  }
});

// ============================================================================
// POST /api/v1/integrations/calendar/location/save
// Save a named location (home, work, etc.)
// ============================================================================
router.post('/location/save', async (req: Request, res: Response) => {
  try {
    const { userId, name, type, latitude, longitude } = req.body as {
      userId: string;
      name: string;
      type: LocationType;
      latitude: number;
      longitude: number;
    };

    if (!userId || !name || !type || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: 'userId, name, type, latitude, and longitude are required',
      });
    }

    saveLocation(userId, name, type, latitude, longitude);

    log.info({ userId, name, type }, 'Location saved');
    return res.json({ success: true });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save location');
    return res.status(500).json({ error: 'Failed to save location' });
  }
});

// ============================================================================
// DELETE /api/v1/integrations/calendar/disconnect
// Disconnect calendar
// ============================================================================
router.delete('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    disconnectCalendar(userId);

    log.info({ userId }, 'Calendar disconnected');
    return res.json({ success: true });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to disconnect calendar');
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;
