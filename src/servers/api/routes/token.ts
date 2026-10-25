/**
 * Token Routes
 *
 * LiveKit token generation and demo session handling.
 * Uses shared rate limiting from src/servers/token/demo-rate-limit.ts
 */

import { getProfileStore } from '../../../memory/profile-store.js';
import { isValidTimeZone } from '../../../agents/shared/time-context.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { rateLimit } from '../../../api/auth-middleware.js';
import { createToken, createRoomWithAgent, getLiveKitUrl } from '../../token/livekit.js';
import type { RoomMetadata } from '../../shared/types.js';
import { prewarmContent, type ContentType } from '../../../services/llm-dynamic-content.js';
import { getClientIp } from '../../../utils/client-ip.js';
import { createLogger } from '../../../utils/safe-logger.js';
import * as demoSessions from '../services/demo-sessions.js';
import { prefetchUserData } from './user-data-prefetch.js';
import { refuseUnownedRoom } from './token-room-owner.js';
import { refuseUnadmitted } from '../../../api/admission.js';
import { demoPersonaFor, personaForCaller } from './token-persona-owner.js';
import { callLaunchFor, launchPersona } from './call-launch-param.js';
import { handleDemoClaim } from './demo-claim.js';
import { handleDemoSessionUpdate } from './demo-session-update.js';

// Import shared rate limiting from token server module (single source of truth)
import {
  DEMO_CONFIG,
  startRateLimitCleanup as startSharedRateLimitCleanup,
  stopRateLimitCleanup as stopSharedRateLimitCleanup,
} from '../../token/demo-rate-limit.js';
import {
  peekDemoAllowance,
  releaseDemoSession,
  reserveDemoSession,
} from '../../token/demo-rate-limit-shared.js';

// Developer Platform: marketplace registry for persona→publisher lookup
import { getAgentAsync } from '../../../marketplace/registry.js';
import { isSignedInAccount } from '../../../services/identity/verified-caller.js';

const log = createLogger({ module: 'TokenRoutes' });

/**
 * Pre-warm LLM content cache for a persona (fire-and-forget)
 * Called when user requests a token, BEFORE session starts
 */
function prewarmLLMContentForPersona(personaId: string, userId?: string): void {
  const contentTypes: ContentType[] = [
    'thinking_phrase',
    'greeting',
    'empathetic_reflection',
    'active_listening',
    'encouragement',
    'celebration',
  ];

  const contexts = contentTypes.map((contentType) => ({
    contentType,
    personaId,
    metadata: { userId, prewarmSource: 'token_request' },
  }));

  // Fire-and-forget - don't await, just log success/failure
  prewarmContent(contexts)
    .then(() => log.debug({ personaId, types: contentTypes.length }, '🔥 LLM cache pre-warmed'))
    .catch((err) => log.warn({ error: String(err) }, 'LLM pre-warm failed (non-fatal)'));
}

/**
 * 🔗 Developer Platform: Look up publisher ID for a persona
 *
 * For marketplace/custom personas, returns the publisher.id from AgentManifest.
 * For built-in personas (ferni, maya, etc.), returns undefined.
 *
 * This enables the Developer Platform to:
 * - Load publisher-registered MCP servers
 * - Dispatch webhooks to the correct publisher
 * - Track activities by publisher
 */
async function getPublisherIdForPersona(personaId: string): Promise<string | undefined> {
  try {
    // Check if this is a marketplace/custom persona
    const agent = await getAgentAsync(personaId);
    if (agent?.publisher?.id) {
      log.debug({ personaId, publisherId: agent.publisher.id }, '🔗 Publisher ID resolved');
      return agent.publisher.id;
    }
    // Built-in personas don't have a publisher
    return undefined;
  } catch (err) {
    // Non-fatal - fall back to no publisher
    log.debug({ personaId, error: String(err) }, 'Publisher lookup failed (non-fatal)');
    return undefined;
  }
}

/**
 * Get demo status without consuming a session
 */
async function getDemoStatus(ip: string): Promise<{
  sessionsRemaining: number;
  sessionsTotal: number;
  sessionDurationMinutes: number;
  inCooldown: boolean;
  cooldownRemaining: number;
  cooldownMinutes: number;
  canStartSession: boolean;
}> {
  const check = await peekDemoAllowance(ip);

  if (!check.allowed) {
    // Parse cooldown info from the message if in cooldown
    const cooldownMatch = check.message?.match(/wait (\d+) seconds/);
    const cooldownRemaining = cooldownMatch ? parseInt(cooldownMatch[1], 10) : 0;
    const inCooldown = check.reason === 'cooldown';

    return {
      sessionsRemaining: check.sessionsRemaining ?? 0,
      sessionsTotal: DEMO_CONFIG.maxSessionsPerDay,
      sessionDurationMinutes: DEMO_CONFIG.sessionDurationMinutes,
      inCooldown,
      cooldownRemaining,
      cooldownMinutes: DEMO_CONFIG.cooldownMinutes,
      canStartSession: false,
    };
  }

  return {
    sessionsRemaining: check.sessionsRemaining ?? DEMO_CONFIG.maxSessionsPerDay,
    sessionsTotal: DEMO_CONFIG.maxSessionsPerDay,
    sessionDurationMinutes: DEMO_CONFIG.sessionDurationMinutes,
    inCooldown: false,
    cooldownRemaining: 0,
    cooldownMinutes: DEMO_CONFIG.cooldownMinutes,
    canStartSession: true,
  };
}

/**
 * Handle token routes
 */
export async function handleTokenRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // LiveKit URL endpoint - rate limit: 100/min (simple read-only endpoint)
  if (pathname === '/token-url') {
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: getLiveKitUrl() }));
    return true;
  }

  // Demo status endpoint - rate limit: 60/min (prevent status polling abuse)
  if (pathname === '/demo-status') {
    if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
      return true;
    }
    const ip = getClientIp(req);
    const status = await getDemoStatus(ip);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return true;
  }

  // Demo token endpoint (for landing page try-without-signup)
  if (pathname === '/demo-token') {
    const ip = getClientIp(req);

    // persona_id defaults to 'ferni'; no one is signed in, so a custom agent id becomes Ferni.
    const personaId = await demoPersonaFor(parsedUrl);

    // Every demo counts against the limit: persona_id is the caller's choice, so it can't exempt one
    const allowed = await reserveDemoSession(ip);
    if (!allowed.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: allowed.reason, message: allowed.message }));
      return true;
    }

    try {
      // Generate unique demo identifiers
      const demoId = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const roomName = `demo-${demoId}`;
      const username = `guest-${Math.random().toString(36).slice(2, 8)}`;

      // Create demo session for "I remember you" experience (async - persists to Firestore)
      const demoSession = await demoSessions.createDemoSession(roomName, demoId, {
        ip,
        userAgent: req.headers['user-agent'],
      });

      // Pre-warm LLM content cache for the requested persona (fire-and-forget)
      prewarmLLMContentForPersona(personaId);

      // 🌍 Detect geo/location for demo users (enables weather, local content)
      let demoGeoData = {
        locale: 'en-US',
        detectedAccent: 'american',
        countryCode: undefined as string | undefined,
        city: undefined as string | undefined,
        regionCode: undefined as string | undefined,
      };

      try {
        const { detectGeoFromRequest } =
          await import('../../../services/identity/geo-detection.js');
        const geo = await detectGeoFromRequest(req, {
          enableIpLookup: true,
          ipLookupTimeout: 2000,
        });
        demoGeoData = {
          locale: geo.primaryLanguage || 'en-US',
          detectedAccent: geo.accent,
          countryCode: geo.countryCode,
          city: geo.city,
          regionCode: geo.regionCode,
        };

        if (geo.city) {
          log.info(
            { city: geo.city, region: geo.regionCode, country: geo.countryCode },
            '📍 Demo: location detected for weather/local content'
          );
        }
      } catch (geoErr) {
        log.debug({ note: (geoErr as Error).message }, 'Demo geo detection failed (non-fatal)');
      }

      // 🔗 Developer Platform: Look up publisher for marketplace personas (including demos)
      const publisherId = await getPublisherIdForPersona(personaId);

      // Build room metadata (shared type — also used for agent dispatch inside createRoomWithAgent)
      const demoRoomMetadata: RoomMetadata = {
        persona_id: personaId,
        device_id: demoId,
        is_demo: true,
        demo_id: demoId,
        session_duration_minutes: DEMO_CONFIG.sessionDurationMinutes,
        // 🔗 Developer Platform: publisher ID for custom/marketplace personas
        publisher_id: publisherId,
        source: 'landing_page',
        // 🌍 Geo data for weather and local content (TikTok-style)
        locale: demoGeoData.locale,
        preferredAccent: demoGeoData.detectedAccent,
        countryCode: demoGeoData.countryCode,
        city: demoGeoData.city,
        regionCode: demoGeoData.regionCode,
      };

      // Generate token with shared helper (includes metadata on the participant JWT)
      const token = await createToken({
        roomName,
        participantName: username,
        metadata: { is_demo: true, demo_id: demoId, persona_id: personaId },
      });

      // Create room and dispatch agent (createRoomWithAgent handles both — no double-dispatch)
      log.info(
        { room: roomName, persona: personaId, city: demoGeoData.city },
        '🚀 Dispatching agent'
      );
      // Failures are logged at error inside createRoomWithAgent; the client learns via agent_dispatched.
      const dispatch = await createRoomWithAgent(
        roomName,
        demoRoomMetadata,
        DEMO_CONFIG.sessionDurationMinutes * 60 + 30, // emptyTimeout in seconds + buffer
        2 // visitor + agent
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          token,
          url: getLiveKitUrl(),
          room: roomName,
          username,
          demo_id: demoId,
          agent_dispatched: dispatch.agentDispatched,
          expires_in_minutes: DEMO_CONFIG.sessionDurationMinutes,
          sessions_remaining: allowed.sessionsRemaining ?? 0,
          claim_token: demoSession.claimToken,
          claim_expires_at: demoSession.expiresAt,
          // 🌍 Include detected location for UI (weather, personalization)
          city: demoGeoData.city,
          regionCode: demoGeoData.regionCode,
          countryCode: demoGeoData.countryCode,
        })
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Demo token error');
      await releaseDemoSession(ip); // a server error doesn't cost the visitor a demo
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create demo session' }));
    }
    return true;
  }

  // Demo session claim endpoint: the account comes from the verified Firebase ID token
  if (pathname === '/demo-claim' && req.method === 'POST') {
    return handleDemoClaim(req, res);
  }

  // Demo session update endpoint: the caller proves the demo is theirs with its claim_token
  if (pathname === '/demo-session-update' && req.method === 'POST') {
    return handleDemoSessionUpdate(req, res);
  }

  // Token generation endpoint (authenticated users)
  if (pathname === '/token') {
    // Rate limit: 20 tokens a minute per person (else per IP), not shared with other routes
    if (rateLimit(req, res, { maxRequests: 20, windowMs: 60000, keyPrefix: 'token' })) {
      return true;
    }

    const room = parsedUrl.searchParams.get('room');
    const username = parsedUrl.searchParams.get('username');
    const device_id = parsedUrl.searchParams.get('device_id');
    const persona_id = parsedUrl.searchParams.get('persona_id');
    const preferred_accent = parsedUrl.searchParams.get('accent');
    // The caller's IANA time zone from the browser, so Ferni knows their local time.
    const timezoneParam = parsedUrl.searchParams.get('timezone');
    const timezone = isValidTimeZone(timezoneParam) ? timezoneParam : undefined;
    const firebase_uid_param = parsedUrl.searchParams.get('firebase_uid');
    let verifiedEmail: string | undefined; // from the verified token, never the query string
    let firebaseAccount = false; // a signed-in account, not an anonymous Firebase user

    if (!room || !username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required parameters: room and username' }));
      return true;
    }

    const requestedPersona = persona_id || 'ferni';

    try {
      // SECURITY: Require verified Firebase auth before issuing LiveKit tokens.
      // Anonymous Firebase users are an intentional product path (zero-friction onboarding);
      // they still present a verified ID token. Query-param firebase_uid alone is never trusted.
      const authHeader = req.headers['authorization'];
      if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        log.warn('SECURITY: /token rejected — missing Firebase auth');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Authentication required',
            message: 'Sign in (including anonymous Firebase) before requesting a voice token',
          })
        );
        return true;
      }

      let firebaseUid: string;
      let isAdmin = false;
      try {
        const { verifyFirebaseToken, isVerifiedToken } =
          await import('../../../services/identity/firebase-auth.js');
        const verified = await verifyFirebaseToken(authHeader.slice(7));
        if (!isVerifiedToken(verified)) {
          log.warn('SECURITY: /token rejected — invalid or expired Firebase token');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid or expired authentication token' }));
          return true;
        }
        isAdmin = verified.claims.admin === true;
        if (firebase_uid_param && firebase_uid_param !== verified.uid && !isAdmin) {
          log.warn(
            { claimed: firebase_uid_param.substring(0, 8), actual: verified.uid.substring(0, 8) },
            'SECURITY: /token rejected — firebase_uid does not match authenticated user'
          );
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'firebase_uid does not match authenticated user' }));
          return true;
        }
        firebaseUid = verified.uid;
        verifiedEmail = verified.emailVerified ? verified.email : undefined;
        firebaseAccount = isSignedInAccount(verified.signInProvider); // verified-caller.ts
        log.debug({ firebaseUid: firebaseUid.substring(0, 8) }, 'Firebase auth via header');
      } catch (firebaseErr) {
        log.error({ error: String(firebaseErr) }, 'Firebase auth verification failed for /token');
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication service unavailable' }));
        return true;
      }
      // WAITLIST_GATE=on: only admitted people get a voice session (the demo route stays open)
      if (await refuseUnadmitted({ uid: firebaseUid, email: verifiedEmail, isAdmin }, res))
        return true;
      if (await refuseUnownedRoom(room, firebaseUid, res)) return true; // never join another's room
      // CALL_LAUNCH_CONTEXT: where the call was started from; a practice run asks for Alex.
      const launch = await callLaunchFor(parsedUrl.searchParams.get('from'), firebaseUid);
      const persona = launchPersona(launch, requestedPersona);
      // A custom agent id must be the caller's own, else the call is with Ferni.
      const selectedPersona = await personaForCaller(persona, firebaseUid);

      log.info(
        {
          room,
          hasFirebaseUid: true,
          firebaseUidSource: 'auth_header',
          firebaseUidPrefix: firebaseUid.substring(0, 8),
          hasDeviceId: !!device_id,
          deviceIdPrefix: device_id ? device_id.substring(0, 16) : 'none',
        },
        '🧠 [MEMORY-AUDIT] Token endpoint identity chain'
      );

      // Accent: the explicit parameter, then the saved profile preference, then geo, then 'american'
      let savedAccent: string | undefined;
      let savedLocation:
        | {
            city?: string;
            regionCode?: string;
            countryCode?: string;
            source?: string;
          }
        | undefined;

      if (firebaseUid && !preferred_accent) {
        try {
          const store = await getProfileStore();
          const profile = await store.getProfile(firebaseUid);
          if (profile?.preferences?.preferredAccent) {
            savedAccent = profile.preferences.preferredAccent;
            log.debug(
              { firebaseUid: firebaseUid.substring(0, 8), accent: savedAccent },
              'Loaded saved accent from profile'
            );
          }
          // 📍 Load saved location (from browser geolocation or manual entry)
          if (profile?.location?.city || profile?.location?.countryCode) {
            savedLocation = {
              city: profile.location.city,
              regionCode: profile.location.regionCode,
              countryCode: profile.location.countryCode,
              source: profile.location.source,
            };
            log.debug(
              {
                firebaseUid: firebaseUid.substring(0, 8),
                city: savedLocation.city,
                source: savedLocation.source,
              },
              '📍 Loaded saved location from profile'
            );
          }
        } catch (profileErr) {
          log.debug({ note: (profileErr as Error).message }, 'Profile lookup note');
        }
      }

      // Geo/accent fallback: saved location (gps/manual) > IP geolocation > timezone inference
      let geoData = {
        locale: 'en-US',
        locales: ['en-US'],
        detectedAccent: preferred_accent || savedAccent || 'american',
        countryCode: savedLocation?.countryCode,
        city: savedLocation?.city,
        regionCode: savedLocation?.regionCode,
        source: savedLocation?.source || 'default',
      };

      // Only do IP geolocation if we don't have saved location
      if (!savedLocation?.city && !savedLocation?.countryCode) {
        try {
          const { detectGeoFromRequest } =
            await import('../../../services/identity/geo-detection.js');
          const geo = await detectGeoFromRequest(req, {
            enableIpLookup: true,
            ipLookupTimeout: 2000,
          });
          geoData = {
            locale: geo.primaryLanguage || 'en-US',
            locales: geo.languages.length > 0 ? geo.languages : ['en-US'],
            // Use explicit > saved > geo-detected accent
            detectedAccent: preferred_accent || savedAccent || geo.accent,
            countryCode: geo.countryCode,
            city: geo.city, // For weather, local content hints
            regionCode: geo.regionCode, // State/province for weather
            source: geo.source,
          };

          if (geo.city) {
            log.info(
              {
                city: geo.city,
                region: geo.regionCode,
                country: geo.countryCode,
                source: geo.source,
              },
              '📍 Token: location detected via IP/headers'
            );
          } else {
            log.info({ source: geo.source }, '📍 Token: no city detected in geo data');
          }
        } catch (geoErr) {
          log.warn({ note: (geoErr as Error).message }, 'Geo detection failed');
        }
      } else {
        log.info(
          {
            city: savedLocation?.city,
            region: savedLocation?.regionCode,
            country: savedLocation?.countryCode,
            source: savedLocation?.source,
          },
          '📍 Token: using saved location from profile (Better than Human!)'
        );
      }

      log.info(
        {
          username,
          room,
          persona: selectedPersona,
          accent: geoData.detectedAccent,
          city: geoData.city,
          region: geoData.regionCode,
        },
        'Generated token with geo'
      );

      prewarmLLMContentForPersona(selectedPersona, firebaseUid || undefined);

      // ⚡ Pre-fetch profile, trust and insights while the token is prepared, before the session
      if (firebaseUid) {
        prefetchUserData(firebaseUid, selectedPersona);
      }

      // 🔗 Developer Platform: the publisher enables MCP servers and webhooks for custom personas
      const publisherId = await getPublisherIdForPersona(selectedPersona);

      const roomMetadata: RoomMetadata = {
        user_name: username,
        firebase_uid: firebaseUid || undefined,
        firebase_account: firebaseAccount || undefined,
        user_email: verifiedEmail,
        device_id: device_id || undefined,
        persona_id: selectedPersona,
        // 🔗 Developer Platform: publisher ID for custom/marketplace personas
        publisher_id: publisherId,
        source: 'web',
        locale: geoData.locale,
        locales: geoData.locales,
        preferredAccent: geoData.detectedAccent,
        countryCode: geoData.countryCode,
        // IP-detected location for weather, local content hints (TikTok-style)
        city: geoData.city,
        regionCode: geoData.regionCode,
        timezone,
        ...(launch && { launch }), // only with CALL_LAUNCH_CONTEXT: off, the metadata is as before
      };

      const token = await createToken({
        roomName: room,
        participantName: username,
        identity: firebaseUid, // the verified uid; the client's username is only the display name
        metadata: { device_id, firebase_uid: firebaseUid, persona_id: selectedPersona },
      });

      // Create room and dispatch agent (createRoomWithAgent handles both — no double-dispatch)
      log.info({ room, persona_id: selectedPersona }, '🎯 Dispatching agent with persona');
      // Failures are logged at error inside createRoomWithAgent; the client learns via agent_dispatched.
      const dispatch = await createRoomWithAgent(room, roomMetadata);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          token,
          url: getLiveKitUrl(),
          room,
          username,
          device_id,
          firebase_uid: firebaseUid,
          persona_id: selectedPersona,
          agent_dispatched: dispatch.agentDispatched,
          accent: geoData.detectedAccent,
          countryCode: geoData.countryCode,
          // IP-detected location for weather, local content
          city: geoData.city,
          regionCode: geoData.regionCode,
        })
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Error generating token');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate token' }));
    }
    return true;
  }

  return false;
}

/**
 * Start rate limit cleanup interval
 * Delegates to shared module for single source of truth
 */
export function startRateLimitCleanup(): void {
  startSharedRateLimitCleanup();
  log.info('Rate limit cleanup started (delegating to shared module)');
}

/**
 * Stop rate limit cleanup interval (for graceful shutdown)
 * Delegates to shared module
 */
export function stopRateLimitCleanup(): void {
  stopSharedRateLimitCleanup();
  log.info('Rate limit cleanup stopped');
}

/**
 * Shutdown token routes (cleanup intervals)
 */
export async function shutdown(): Promise<void> {
  stopRateLimitCleanup();
  await demoSessions.shutdown();
  log.info('Token routes shutdown complete');
}

// Start cleanup on module load
startRateLimitCleanup();
