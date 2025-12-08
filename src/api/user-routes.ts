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
import { getLogger } from '../utils/safe-logger.js';
import {
  updateTimingPreferences,
  getTimingProfile,
} from '../services/outreach/timing-intelligence.js';

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

/**
 * Extract user ID from request headers or query params
 */
function getUserId(req: IncomingMessage, url: URL): string | null {
  // Try X-User-Id header first
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId && typeof headerUserId === 'string') {
    return headerUserId;
  }

  // Try query param
  const queryUserId = url.searchParams.get('userId');
  if (queryUserId) {
    return queryUserId;
  }

  return null;
}

/**
 * Parse request body as JSON
 */
async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

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
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const method = req.method?.toUpperCase();

  // Only handle /api/user/* routes
  if (!pathname.startsWith('/api/user')) {
    return false;
  }

  const route = pathname.replace('/api/user', '');

  // ============================================================================
  // POST /api/user/timezone - Quick timezone auto-detection update
  // ============================================================================
  if (route === '/timezone' && method === 'POST') {
    const body = await parseBody<{ userId?: string; timezone: string }>(req);
    const userId = body?.userId || getUserId(req, url);

    if (!userId) {
      sendJson(res, 400, { success: false, error: 'userId is required' });
      return true;
    }

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
    const body = await parseBody<{ userId?: string } & UserPreferencesUpdate>(req);
    const userId = body?.userId || getUserId(req, url);

    if (!userId) {
      sendJson(res, 400, { success: false, error: 'userId is required' });
      return true;
    }

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
    const userId = getUserId(req, url);

    if (!userId) {
      sendJson(res, 400, { success: false, error: 'userId is required' });
      return true;
    }

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
    const body = await parseBody<{ userId?: string } & ContactInfoUpdate>(req);
    const userId = body?.userId || getUserId(req, url);

    if (!userId) {
      sendJson(res, 400, { success: false, error: 'userId is required' });
      return true;
    }

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
    const userId = getUserId(req, url);

    if (!userId) {
      sendJson(res, 400, { success: false, error: 'userId is required' });
      return true;
    }

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
