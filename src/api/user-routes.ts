/**
 * User Routes API Handler
 *
 * Handles user-specific settings including:
 * - Contact info (phone, email)
 * - Timezone detection and storage
 * - Quiet hours preferences
 *
 * @module UserRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';

import { getDefaultStore } from '../memory/in-memory-store.js';
import {
  getTimingProfile,
  updateTimingPreferences,
} from '../services/outreach/timing-intelligence.js';
import { getLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { getUserId, handleCorsPreflightIfNeeded, parseBody } from './helpers.js';

const log = getLogger().child({ module: 'user-routes' });

// ============================================================================
// TYPES
// ============================================================================

interface UserPreferencesUpdate {
  timezone?: string;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
}

interface ContactInfoUpdate {
  phone?: string;
  email?: string;
  preferredName?: string;
  timezone?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

// getUserId and parseBody imported from ./helpers.js

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Validate timezone string using Intl API
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate time string format (HH:MM)
 */
function isValidTimeString(time: string): boolean {
  const match = time.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match !== null;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle user-related API routes
 *
 * Supported routes:
 * - POST /api/user/preferences - Update timezone & quiet hours
 * - GET /api/user/preferences - Get current preferences
 * - POST /api/user/contact - Update contact info
 * - GET /api/user/contact - Get contact info
 * - POST /api/user/timezone - Quick timezone update (for auto-detection)
 */
export async function handleUserRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  // Only handle /api/user/* routes
  if (!pathname.startsWith('/api/user')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  // Use authenticated userId (prevents user enumeration)
  const authenticatedUserId = auth.userId;

  const route = pathname.replace('/api/user', '');

  // ============================================================================
  // POST /api/user/timezone - Quick timezone auto-detection update
  // ============================================================================
  if (route === '/timezone' && method === 'POST') {
    const body = await parseBody<{ timezone: string }>(req);
    const userId = authenticatedUserId;

    if (!body?.timezone) {
      sendJson(res, 400, { success: false, error: 'timezone is required' });
      return true;
    }

    if (!isValidTimezone(body.timezone)) {
      sendJson(res, 400, { success: false, error: 'Invalid timezone' });
      return true;
    }

    try {
      // Update timing profile
      updateTimingPreferences(userId, { timezone: body.timezone });

      // Also update user profile if it exists
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);
      if (profile) {
        profile.contactInfo = {
          ...profile.contactInfo,
          timezone: body.timezone,
        };
        await store.saveProfile(profile);
      }

      log.info({ userId, timezone: body.timezone }, '🌍 User timezone updated');
      sendJson(res, 200, { success: true, timezone: body.timezone });
    } catch (error) {
      log.error({ error, userId }, 'Failed to update timezone');
      sendJson(res, 500, { success: false, error: 'Failed to update timezone' });
    }
    return true;
  }

  // ============================================================================
  // POST /api/user/preferences - Update user preferences
  // ============================================================================
  if (route === '/preferences' && method === 'POST') {
    const body = await parseBody<UserPreferencesUpdate>(req);
    // Use authenticated userId
    const userId = authenticatedUserId;

    try {
      const updates: Partial<{
        timezone: string;
        quietHoursStart: string;
        quietHoursEnd: string;
      }> = {};

      // Validate and apply timezone
      if (body?.timezone) {
        if (!isValidTimezone(body.timezone)) {
          sendJson(res, 400, { success: false, error: 'Invalid timezone' });
          return true;
        }
        updates.timezone = body.timezone;
      }

      // Validate and apply quiet hours
      if (body?.quietHoursStart) {
        if (!isValidTimeString(body.quietHoursStart)) {
          sendJson(res, 400, {
            success: false,
            error: 'Invalid quietHoursStart format. Use HH:MM',
          });
          return true;
        }
        updates.quietHoursStart = body.quietHoursStart;
      }

      if (body?.quietHoursEnd) {
        if (!isValidTimeString(body.quietHoursEnd)) {
          sendJson(res, 400, {
            success: false,
            error: 'Invalid quietHoursEnd format. Use HH:MM',
          });
          return true;
        }
        updates.quietHoursEnd = body.quietHoursEnd;
      }

      // Update timing preferences
      if (Object.keys(updates).length > 0) {
        updateTimingPreferences(userId, updates);
      }

      // Also update user profile
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);
      if (profile && updates.timezone) {
        profile.contactInfo = {
          ...profile.contactInfo,
          timezone: updates.timezone,
        };
        await store.saveProfile(profile);
      }

      const timingProfile = getTimingProfile(userId);

      log.info({ userId, updates }, '⚙️ User preferences updated');
      sendJson(res, 200, {
        success: true,
        preferences: {
          timezone: timingProfile.preferences.timezone,
          quietHoursStart: timingProfile.preferences.quietHoursStart,
          quietHoursEnd: timingProfile.preferences.quietHoursEnd,
        },
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to update preferences');
      sendJson(res, 500, { success: false, error: 'Failed to update preferences' });
    }
    return true;
  }

  // ============================================================================
  // GET /api/user/preferences - Get current preferences
  // ============================================================================
  if (route === '/preferences' && method === 'GET') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    try {
      const timingProfile = getTimingProfile(userId);

      sendJson(res, 200, {
        success: true,
        preferences: {
          timezone: timingProfile.preferences.timezone,
          quietHoursStart: timingProfile.preferences.quietHoursStart,
          quietHoursEnd: timingProfile.preferences.quietHoursEnd,
        },
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to get preferences');
      sendJson(res, 500, { success: false, error: 'Failed to get preferences' });
    }
    return true;
  }

  // ============================================================================
  // POST /api/user/contact - Update contact info
  // ============================================================================
  if (route === '/contact' && method === 'POST') {
    const body = await parseBody<ContactInfoUpdate>(req);
    // Use authenticated userId
    const userId = authenticatedUserId;

    try {
      const store = getDefaultStore();
      let profile = await store.getProfile(userId);

      if (!profile) {
        // Create a minimal profile via the store's getOrCreateProfile method
        profile = await store.getOrCreateProfile(userId);
      }

      // Update contact info
      profile.contactInfo = {
        ...profile.contactInfo,
        phone: body?.phone ?? profile.contactInfo?.phone,
        email: body?.email ?? profile.contactInfo?.email,
        timezone: body?.timezone ?? profile.contactInfo?.timezone,
      };

      // Update preferred name if provided
      if (body?.preferredName) {
        profile.preferredName = body.preferredName;
      }

      // If timezone provided, also update timing preferences
      if (body?.timezone && isValidTimezone(body.timezone)) {
        updateTimingPreferences(userId, { timezone: body.timezone });
      }

      await store.saveProfile(profile);

      log.info({ userId }, '📇 Contact info updated');
      sendJson(res, 200, {
        success: true,
        contactInfo: {
          phone: profile.contactInfo?.phone ? '***' : undefined,
          email: profile.contactInfo?.email ? '***' : undefined,
          timezone: profile.contactInfo?.timezone,
          hasPhone: !!profile.contactInfo?.phone,
          hasEmail: !!profile.contactInfo?.email,
        },
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to update contact info');
      sendJson(res, 500, { success: false, error: 'Failed to update contact info' });
    }
    return true;
  }

  // ============================================================================
  // GET /api/user/contact - Get contact info
  // ============================================================================
  if (route === '/contact' && method === 'GET') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    try {
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);

      if (!profile) {
        sendJson(res, 200, {
          success: true,
          contactInfo: null,
        });
        return true;
      }

      sendJson(res, 200, {
        success: true,
        contactInfo: {
          phone: profile.contactInfo?.phone ? '***' : undefined,
          email: profile.contactInfo?.email ? '***' : undefined,
          timezone: profile.contactInfo?.timezone,
          hasPhone: !!profile.contactInfo?.phone,
          hasEmail: !!profile.contactInfo?.email,
        },
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to get contact info');
      sendJson(res, 500, { success: false, error: 'Failed to get contact info' });
    }
    return true;
  }

  // Not handled
  return false;
}

export default handleUserRoutes;
