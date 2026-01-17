/**
 * User Routes API Handler
 *
 * Handles user-specific settings including:
 * - Profile creation and retrieval (CRITICAL for onboarding)
 * - Contact info (phone, email)
 * - Timezone detection and storage
 * - Quiet hours preferences
 * - Onboarding state (cross-device sync)
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
import type { UserProfile } from '../types/user-profile.js';

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

/**
 * Client-reported location (from browser geolocation or manual entry)
 */
interface LocationUpdate {
  city?: string;
  regionCode?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  source: 'browser-gps' | 'manual' | 'ip-geo' | 'timezone' | 'accept-language' | 'default';
  confidence: 'high' | 'medium' | 'low';
}

interface AccentPreferenceUpdate {
  accent: 'american' | 'british' | 'australian' | 'indian';
  /** Whether this was auto-detected (true) or manually set by user (false) */
  autoDetected?: boolean;
}

/**
 * Onboarding state - synced across devices via Firestore
 */
interface OnboardingState {
  /** Steps completed */
  completedSteps: Array<'welcome' | 'name' | 'preferences' | 'first_conversation'>;
  /** User's name captured during onboarding */
  userName?: string;
  /** When onboarding started */
  startedAt?: string;
  /** When onboarding completed */
  completedAt?: string;
  /** Whether user has had their first conversation */
  hasHadFirstConversation?: boolean;
}

/**
 * Profile initialization request (early profile creation)
 */
interface ProfileInitRequest {
  /** User's name from onboarding or auth */
  name?: string;
  /** Device ID for linking */
  deviceId?: string;
  /** Initial onboarding state */
  onboarding?: OnboardingState;
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
 * - GET /api/user/profile - Get user profile (creates if needed)
 * - POST /api/user/profile - Initialize/update profile (early creation for onboarding)
 * - GET /api/user/onboarding - Get onboarding state
 * - POST /api/user/onboarding - Update onboarding state
 * - POST /api/user/preferences - Update timezone & quiet hours
 * - GET /api/user/preferences - Get current preferences
 * - POST /api/user/contact - Update contact info
 * - GET /api/user/contact - Get contact info
 * - POST /api/user/timezone - Quick timezone update (for auto-detection)
 * - POST /api/user/accent - Update voice accent preference
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
  // GET /api/user/profile - Get user profile (creates if needed)
  // CRITICAL: This is the FIRST endpoint called on app init
  // Creates profile immediately so we can start tracking identity
  // ============================================================================
  if (route === '/profile' && method === 'GET') {
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;

    const { userId } = auth;
    try {
      const store = getDefaultStore();
      let profile = await store.getProfile(userId);

      // Create profile if it doesn't exist (early creation!)
      if (!profile) {
        profile = await store.getOrCreateProfile(userId);
        log.info({ userId }, '🎉 Created new profile on first visit');
      }

      // Return sanitized profile info
      sendJson(res, 200, {
        success: true,
        profile: {
          id: profile.id,
          name: profile.name,
          preferredName: profile.preferredName,
          hasVoiceSketch: !!profile.voiceSketch,
          totalConversations: profile.totalConversations,
          firstContact: profile.firstContact,
          lastContact: profile.lastContact,
          relationshipStage: profile.relationshipStage,
          onboarding: (profile as UserProfile & { onboarding?: OnboardingState }).onboarding,
        },
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to get/create profile');
      sendJson(res, 500, { success: false, error: 'Failed to get profile' });
    }
    return true;
  }

  // ============================================================================
  // POST /api/user/profile - Initialize or update profile
  // Called during onboarding to set name, link device, update onboarding state
  // ============================================================================
  if (route === '/profile' && method === 'POST') {
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;

    const body = await parseBody<ProfileInitRequest>(req);
    const { userId } = auth;

    try {
      const store = getDefaultStore();
      let profile = await store.getProfile(userId);

      // Create profile if it doesn't exist
      if (!profile) {
        profile = await store.getOrCreateProfile(userId);
        log.info({ userId }, '🎉 Created new profile via POST');
      }

      // Update name if provided and profile doesn't have one (or if provided is better)
      if (body?.name && (!profile.name || profile.name === 'User')) {
        profile.name = body.name;
        profile.preferredName = body.name;
        log.info({ userId, name: body.name }, '✨ Name set from onboarding');
      }

      // Link device ID if provided
      if (body?.deviceId) {
        const linkedIds = new Set(profile.linkedIdentifiers || []);
        linkedIds.add(`device:${body.deviceId}`);
        profile.linkedIdentifiers = Array.from(linkedIds);
        log.debug({ userId, deviceId: body.deviceId }, 'Device ID linked to profile');
      }

      // Update onboarding state
      if (body?.onboarding) {
        (profile as UserProfile & { onboarding?: OnboardingState }).onboarding = {
          ...(profile as UserProfile & { onboarding?: OnboardingState }).onboarding,
          ...body.onboarding,
        };
      }

      await store.saveProfile(profile);

      sendJson(res, 200, {
        success: true,
        profile: {
          id: profile.id,
          name: profile.name,
          preferredName: profile.preferredName,
          hasVoiceSketch: !!profile.voiceSketch,
          totalConversations: profile.totalConversations,
          onboarding: (profile as UserProfile & { onboarding?: OnboardingState }).onboarding,
        },
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to update profile');
      sendJson(res, 500, { success: false, error: 'Failed to update profile' });
    }
    return true;
  }

  // ============================================================================
  // GET /api/user/onboarding - Get onboarding state
  // ============================================================================
  if (route === '/onboarding' && method === 'GET') {
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;

    const { userId } = auth;
    try {
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);

      const onboarding = (profile as (UserProfile & { onboarding?: OnboardingState }) | null)
        ?.onboarding || {
        completedSteps: [],
        hasHadFirstConversation: (profile?.totalConversations || 0) > 0,
      };

      sendJson(res, 200, {
        success: true,
        onboarding,
        // Also return useful profile info
        userName: profile?.name,
        totalConversations: profile?.totalConversations || 0,
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to get onboarding state');
      sendJson(res, 500, { success: false, error: 'Failed to get onboarding state' });
    }
    return true;
  }

  // ============================================================================
  // POST /api/user/onboarding - Update onboarding state
  // ============================================================================
  if (route === '/onboarding' && method === 'POST') {
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;

    const body = await parseBody<{ step: string; userName?: string; completed?: boolean }>(req);
    const { userId } = auth;

    if (!body?.step) {
      sendJson(res, 400, { success: false, error: 'step is required' });
      return true;
    }

    try {
      const store = getDefaultStore();
      let profile = await store.getProfile(userId);

      if (!profile) {
        profile = await store.getOrCreateProfile(userId);
      }

      // Get or create onboarding state
      const profileWithOnboarding = profile as UserProfile & { onboarding?: OnboardingState };
      const onboarding = profileWithOnboarding.onboarding || {
        completedSteps: [],
        startedAt: new Date().toISOString(),
      };

      // Add step to completed if not already there
      const validSteps = ['welcome', 'name', 'preferences', 'first_conversation'] as const;
      if (validSteps.includes(body.step as (typeof validSteps)[number])) {
        const step = body.step as (typeof validSteps)[number];
        if (!onboarding.completedSteps.includes(step)) {
          onboarding.completedSteps.push(step);
        }
      }

      // Update name if provided
      if (body.userName && (!profile.name || profile.name === 'User')) {
        profile.name = body.userName;
        profile.preferredName = body.userName;
        onboarding.userName = body.userName;
        log.info({ userId, name: body.userName }, '✨ Name set from onboarding step');
      }

      // Mark completed if all steps done
      if (onboarding.completedSteps.length >= 3 && !onboarding.completedAt) {
        onboarding.completedAt = new Date().toISOString();
      }

      // Check first conversation
      onboarding.hasHadFirstConversation = profile.totalConversations > 0;

      // Save
      profileWithOnboarding.onboarding = onboarding;
      await store.saveProfile(profile);

      log.info(
        { userId, step: body.step, completedSteps: onboarding.completedSteps },
        '📋 Onboarding step completed'
      );

      sendJson(res, 200, {
        success: true,
        onboarding,
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to update onboarding state');
      sendJson(res, 500, { success: false, error: 'Failed to update onboarding state' });
    }
    return true;
  }

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
  // POST /api/user/location - Update user location (from browser geolocation)
  // "Better than Human" - We remember where you are without awkward questions
  // ============================================================================
  if (route === '/location' && method === 'POST') {
    const body = await parseBody<LocationUpdate>(req);
    const userId = authenticatedUserId;

    if (!body) {
      sendJson(res, 400, { success: false, error: 'Request body is required' });
      return true;
    }

    // Validate at least one location field is present
    if (!body.city && !body.countryCode && !body.latitude) {
      sendJson(res, 400, {
        success: false,
        error: 'At least city, countryCode, or coordinates required',
      });
      return true;
    }

    // Validate country code format (ISO 3166-1 alpha-2)
    if (body.countryCode && !/^[A-Z]{2}$/.test(body.countryCode)) {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid country code format (use ISO 3166-1 alpha-2)',
      });
      return true;
    }

    // Validate coordinates if provided
    if (body.latitude !== undefined || body.longitude !== undefined) {
      if (body.latitude === undefined || body.longitude === undefined) {
        sendJson(res, 400, {
          success: false,
          error: 'Both latitude and longitude required if providing coordinates',
        });
        return true;
      }
      if (body.latitude < -90 || body.latitude > 90) {
        sendJson(res, 400, { success: false, error: 'Latitude must be between -90 and 90' });
        return true;
      }
      if (body.longitude < -180 || body.longitude > 180) {
        sendJson(res, 400, { success: false, error: 'Longitude must be between -180 and 180' });
        return true;
      }
    }

    try {
      const store = getDefaultStore();
      let profile = await store.getProfile(userId);

      if (!profile) {
        profile = await store.getOrCreateProfile(userId);
      }

      // Store location in profile
      profile.location = {
        city: body.city,
        regionCode: body.regionCode,
        countryCode: body.countryCode,
        latitude: body.latitude,
        longitude: body.longitude,
        source: body.source || 'manual',
        confidence: body.confidence || 'medium',
        lastUpdated: new Date().toISOString(),
      };

      await store.saveProfile(profile);

      log.info(
        { userId, city: body.city, country: body.countryCode, source: body.source },
        '📍 User location updated'
      );

      sendJson(res, 200, {
        success: true,
        location: {
          city: profile.location.city,
          regionCode: profile.location.regionCode,
          countryCode: profile.location.countryCode,
          source: profile.location.source,
          confidence: profile.location.confidence,
        },
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to update location');
      sendJson(res, 500, { success: false, error: 'Failed to update location' });
    }
    return true;
  }

  // ============================================================================
  // GET /api/user/location - Get user location
  // ============================================================================
  if (route === '/location' && method === 'GET') {
    const userId = authenticatedUserId;

    try {
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);

      if (!profile?.location) {
        sendJson(res, 200, {
          success: true,
          location: null,
        });
        return true;
      }

      sendJson(res, 200, {
        success: true,
        location: {
          city: profile.location.city,
          regionCode: profile.location.regionCode,
          countryCode: profile.location.countryCode,
          source: profile.location.source,
          confidence: profile.location.confidence,
          lastUpdated: profile.location.lastUpdated,
        },
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to get location');
      sendJson(res, 500, { success: false, error: 'Failed to get location' });
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
