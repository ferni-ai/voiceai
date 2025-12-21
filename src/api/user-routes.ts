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
import { handleCorsPreflightIfNeeded, parseBody } from './helpers.js';

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

interface AccentPreferenceUpdate {
  accent: 'american' | 'british' | 'australian' | 'indian';
  /** Whether this was auto-detected (true) or manually set by user (false) */
  autoDetected?: boolean;
}

type EnglishAccent = 'american' | 'british' | 'australian' | 'indian';

const VALID_ACCENTS: EnglishAccent[] = ['american', 'british', 'australian', 'indian'];

/**
 * Validate accent string
 */
function isValidAccent(accent: unknown): accent is EnglishAccent {
  return typeof accent === 'string' && VALID_ACCENTS.includes(accent as EnglishAccent);
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
 * - POST /api/user/accent - Update voice accent preference (american, british, australian, indian)
 * - GET /api/user/accent - Get voice accent preference
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

  const route = pathname.replace('/api/user', '');

  // ============================================================================
  // GET /api/user/accent - Get voice accent preference (OPTIONAL AUTH)
  // This endpoint uses optional auth to allow loading preferences before
  // Firebase auth completes. Returns defaults if not authenticated.
  // ============================================================================
  if (route === '/accent' && method === 'GET') {
    // Try to get auth but don't require it
    const optionalAuth = await requireAuth(req, res, { allowDevMode: true, optional: true });

    // If no auth, return defaults
    if (!optionalAuth) {
      sendJson(res, 200, {
        success: true,
        accent: 'american',
        autoDetected: true,
        locale: null,
        requiresAuth: true, // Hint that saving will need auth
      });
      return true;
    }

    // User is authenticated - fetch their preference
    const { userId } = optionalAuth;
    try {
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);

      if (!profile) {
        // No profile yet - return default
        sendJson(res, 200, {
          success: true,
          accent: 'american',
          autoDetected: true,
          locale: null,
        });
        return true;
      }

      sendJson(res, 200, {
        success: true,
        accent: profile.preferences?.preferredAccent || 'american',
        autoDetected: profile.preferences?.accentAutoDetected ?? true,
        locale: profile.preferences?.locale,
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to get accent preference');
      sendJson(res, 500, { success: false, error: 'Failed to get accent preference' });
    }
    return true;
  }

  // All other routes require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  // Use authenticated userId (prevents user enumeration)
  const authenticatedUserId = auth.userId;

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

  // ============================================================================
  // POST /api/user/accent - Update voice accent preference
  // ============================================================================
  if (route === '/accent' && method === 'POST') {
    const body = await parseBody<AccentPreferenceUpdate>(req);
    const userId = authenticatedUserId;

    if (!body?.accent) {
      sendJson(res, 400, { success: false, error: 'accent is required' });
      return true;
    }

    if (!isValidAccent(body.accent)) {
      sendJson(res, 400, {
        success: false,
        error: `Invalid accent. Must be one of: ${VALID_ACCENTS.join(', ')}`,
      });
      return true;
    }

    try {
      const store = getDefaultStore();
      let profile = await store.getProfile(userId);

      if (!profile) {
        profile = await store.getOrCreateProfile(userId);
      }

      // Update accent preference
      profile.preferences = {
        ...profile.preferences,
        preferredAccent: body.accent,
        accentAutoDetected: body.autoDetected ?? false,
      };

      await store.saveProfile(profile);

      log.info(
        { userId, accent: body.accent, autoDetected: body.autoDetected },
        '🌍 User accent preference updated'
      );
      sendJson(res, 200, {
        success: true,
        accent: body.accent,
        autoDetected: body.autoDetected ?? false,
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to update accent preference');
      sendJson(res, 500, { success: false, error: 'Failed to update accent preference' });
    }
    return true;
  }

  // ============================================================================
  // GET /api/user/reminders - Get reminder settings and upcoming dates
  // ============================================================================
  if (route === '/reminders' && method === 'GET') {
    const userId = authenticatedUserId;

    try {
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);

      // Default reminder settings
      const defaultSettings = {
        enabled: true,
        daysBefore: 7,
        channels: {
          voice: true,
          push: true,
          email: false,
        },
        includeGiftSuggestions: true,
        includeMessageDrafts: true,
      };

      const settings = profile?.preferences?.reminderSettings || defaultSettings;

      // Get upcoming important dates from contacts
      // This would ideally query the contacts service, but for now return from profile
      const upcomingDates = profile?.preferences?.upcomingReminders || [];

      sendJson(res, 200, {
        success: true,
        settings,
        upcomingDates,
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to get reminder settings');
      sendJson(res, 500, { success: false, error: 'Failed to get reminder settings' });
    }
    return true;
  }

  // ============================================================================
  // POST /api/user/reminders - Update reminder settings
  // ============================================================================
  if (route === '/reminders' && method === 'POST') {
    const body = await parseBody<{
      enabled?: boolean;
      daysBefore?: number;
      channels?: {
        voice?: boolean;
        push?: boolean;
        email?: boolean;
      };
      includeGiftSuggestions?: boolean;
      includeMessageDrafts?: boolean;
    }>(req);
    const userId = authenticatedUserId;

    try {
      const store = getDefaultStore();
      let profile = await store.getProfile(userId);

      if (!profile) {
        profile = await store.getOrCreateProfile(userId);
      }

      // Merge with existing settings
      const currentSettings = profile.preferences?.reminderSettings || {
        enabled: true,
        daysBefore: 7,
        channels: { voice: true, push: true, email: false },
        includeGiftSuggestions: true,
        includeMessageDrafts: true,
      };

      const updatedSettings = {
        ...currentSettings,
        ...(body?.enabled !== undefined && { enabled: body.enabled }),
        ...(body?.daysBefore !== undefined && { daysBefore: body.daysBefore }),
        ...(body?.channels && {
          channels: {
            ...currentSettings.channels,
            ...body.channels,
          },
        }),
        ...(body?.includeGiftSuggestions !== undefined && {
          includeGiftSuggestions: body.includeGiftSuggestions,
        }),
        ...(body?.includeMessageDrafts !== undefined && {
          includeMessageDrafts: body.includeMessageDrafts,
        }),
      };

      // Validate daysBefore
      if (
        updatedSettings.daysBefore &&
        (updatedSettings.daysBefore < 1 || updatedSettings.daysBefore > 30)
      ) {
        sendJson(res, 400, { success: false, error: 'daysBefore must be between 1 and 30' });
        return true;
      }

      // Update profile
      profile.preferences = {
        ...profile.preferences,
        reminderSettings: updatedSettings,
      };

      await store.saveProfile(profile);

      log.info({ userId, settings: updatedSettings }, '🔔 Reminder settings updated');
      sendJson(res, 200, {
        success: true,
        settings: updatedSettings,
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to update reminder settings');
      sendJson(res, 500, { success: false, error: 'Failed to update reminder settings' });
    }
    return true;
  }

  // Not handled
  return false;
}

export default handleUserRoutes;
