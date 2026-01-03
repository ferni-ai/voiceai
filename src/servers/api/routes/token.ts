/**
 * Token Routes
 *
 * LiveKit token generation and demo session handling.
 * Uses shared rate limiting from src/servers/token/demo-rate-limit.ts
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { rateLimit } from '../../../api/auth-middleware.js';
import * as demoSessions from '../services/demo-sessions.js';
import { prewarmContent, type ContentType } from '../../../services/llm-dynamic-content.js';
import { createLogger } from '../../../utils/safe-logger.js';

// Import shared rate limiting from token server module (single source of truth)
import {
  DEMO_CONFIG,
  checkDemoAllowed,
  recordDemoSession,
  startRateLimitCleanup as startSharedRateLimitCleanup,
  stopRateLimitCleanup as stopSharedRateLimitCleanup,
} from '../../token/demo-rate-limit.js';

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
 * ⚡ OPTIMIZATION: Pre-fetch user data during token generation
 *
 * This saves 200-500ms on session start by loading:
 * - User profile from Firestore
 * - Trust profiles
 * - Cross-persona insights
 * - Memory embeddings
 *
 * Data is cached in memory and ready when agent session starts.
 * Fire-and-forget - failures don't block token generation.
 */
function prefetchUserData(userId: string, personaId: string): void {
  if (!userId || userId.length < 10) return; // Skip invalid/test IDs

  const startTime = Date.now();

  // Fire-and-forget all pre-fetches in parallel
  Promise.all([
    // 1. Pre-warm user profile (biggest latency saver)
    (async () => {
      try {
        const { getGlobalServices } = await import('../../../services/global-services.js');
        const global = await getGlobalServices();
        if (global?.store) {
          const profile = await global.store.getProfile(userId);
          if (profile) {
            log.debug(
              { userId: userId.slice(0, 8), totalConvs: profile.totalConversations },
              '⚡ User profile pre-fetched'
            );
          }
        }
      } catch (e) {
        log.debug({ error: String(e) }, 'Profile pre-fetch failed (non-fatal)');
      }
    })(),

    // 2. Pre-warm trust profiles
    (async () => {
      try {
        const { onSessionStart } = await import('../../../services/trust-systems/index.js');
        await onSessionStart(userId);
        log.debug({ userId: userId.slice(0, 8) }, '⚡ Trust profiles pre-fetched');
      } catch (e) {
        log.debug({ error: String(e) }, 'Trust pre-fetch failed (non-fatal)');
      }
    })(),

    // 3. Pre-warm cross-persona insights
    (async () => {
      try {
        const { loadInsights } = await import('../../../services/cross-persona-insights.js');
        await loadInsights(userId);
        log.debug({ userId: userId.slice(0, 8) }, '⚡ Cross-persona insights pre-fetched');
      } catch (e) {
        log.debug({ error: String(e) }, 'Insights pre-fetch failed (non-fatal)');
      }
    })(),

    // 4. Pre-compute memory embeddings for faster search
    // NOTE: Skipped - precomputeUserMemoryEmbeddings requires memory content arrays
    // which requires an additional DB fetch. The optimization isn't worth the
    // complexity here. Embeddings will be computed on-demand during conversation.

    // 5. Pre-warm persona bundle
    (async () => {
      try {
        const { loadBundle } = await import('../../../personas/bundles/loader.js');
        await loadBundle(personaId);
        log.debug({ personaId }, '⚡ Persona bundle pre-loaded');
      } catch (e) {
        log.debug({ error: String(e) }, 'Persona bundle pre-load failed (non-fatal)');
      }
    })(),
  ])
    .then(() => {
      const elapsed = Date.now() - startTime;
      log.info(
        { userId: userId.slice(0, 8), personaId, elapsedMs: elapsed },
        '⚡ User data pre-fetch complete'
      );
    })
    .catch((err) => {
      log.debug({ error: String(err) }, 'User data pre-fetch partially failed (non-fatal)');
    });
}

// Configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';

// Agent dispatch client
let agentDispatch: AgentDispatchClient | null = null;

/**
 * Initialize the agent dispatch client
 */
function getAgentDispatch(): AgentDispatchClient {
  if (!agentDispatch) {
    agentDispatch = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return agentDispatch;
}

/**
 * Generate LiveKit access token
 */
async function createToken(roomName: string, participantName: string): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await at.toJwt();
}

/**
 * Get IP address from request
 */
function getClientIp(req: IncomingMessage): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Get demo status without consuming a session
 */
function getDemoStatus(ip: string): {
  sessionsRemaining: number;
  sessionsTotal: number;
  sessionDurationMinutes: number;
  inCooldown: boolean;
  cooldownRemaining: number;
  cooldownMinutes: number;
  canStartSession: boolean;
} {
  // Use the shared checkDemoAllowed to get current status
  const check = checkDemoAllowed(ip);

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
    res.end(JSON.stringify({ url: LIVEKIT_URL }));
    return true;
  }

  // Demo status endpoint - rate limit: 60/min (prevent status polling abuse)
  if (pathname === '/demo-status') {
    if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
      return true;
    }
    const ip = getClientIp(req);
    const status = getDemoStatus(ip);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return true;
  }

  // Demo token endpoint (for landing page try-without-signup)
  if (pathname === '/demo-token') {
    const ip = getClientIp(req);

    // Check rate limits using shared module
    const allowed = checkDemoAllowed(ip);
    if (!allowed.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: allowed.reason,
          message: allowed.message,
        })
      );
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

      // Record the session for rate limiting using shared module
      recordDemoSession(ip);

      // Pre-warm LLM content cache for demo (fire-and-forget)
      prewarmLLMContentForPersona('ferni');

      // Generate token
      const token = await createToken(roomName, username);

      // Dispatch agent
      try {
        const agentMetadata = {
          is_demo: true,
          demo_id: demoId,
          session_duration_minutes: DEMO_CONFIG.sessionDurationMinutes,
          persona_id: 'ferni',
        };
        await getAgentDispatch().createDispatch(roomName, AGENT_NAME, {
          metadata: JSON.stringify(agentMetadata),
        });
      } catch (dispatchErr) {
        log.debug({ note: (dispatchErr as Error).message }, 'Demo agent dispatch note');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          token,
          url: LIVEKIT_URL,
          room: roomName,
          username,
          demo_id: demoId,
          expires_in_minutes: DEMO_CONFIG.sessionDurationMinutes,
          sessions_remaining: (allowed.sessionsRemaining ?? 1) - 1,
          claim_token: demoSession.claimToken,
          claim_expires_at: demoSession.expiresAt,
        })
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Demo token error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create demo session' }));
    }
    return true;
  }

  // Demo session claim endpoint - rate limit: 10/min (one-time operation)
  if (pathname === '/demo-claim' && req.method === 'POST') {
    if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
      return true;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    // FIX BUG: Add error handler to prevent hanging promises on request errors
    return new Promise((resolve) => {
      req.on('error', (err) => {
        log.error({ error: err.message }, 'Request error in demo claim');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request error' }));
        }
        resolve(true);
      });

      req.on('end', async () => {
        try {
          const { claim_token, firebase_uid } = JSON.parse(body) as {
            claim_token: string;
            firebase_uid: string;
          };

          if (!claim_token || !firebase_uid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing claim_token or firebase_uid' }));
            resolve(true);
            return;
          }

          // Async - loads from Firestore if needed
          const result = await demoSessions.claimDemoSession(claim_token, firebase_uid);

          if (!result.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            resolve(true);
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              already_claimed: result.alreadyClaimed,
              conversation: result.session?.conversation,
            })
          );
        } catch (err) {
          log.error({ error: String(err) }, 'Demo claim error');
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
        resolve(true);
      });
    });
  }

  // Demo session update endpoint (called by voice agent) - rate limit: 30/min (frequent updates)
  if (pathname === '/demo-session-update' && req.method === 'POST') {
    if (rateLimit(req, res, { maxRequests: 30, windowMs: 60000 })) {
      return true;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    // FIX BUG: Add error handler to prevent hanging promises on request errors
    return new Promise((resolve) => {
      req.on('error', (err) => {
        log.error({ error: err.message }, 'Request error in demo session update');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request error' }));
        }
        resolve(true);
      });

      req.on('end', async () => {
        try {
          const data = JSON.parse(body) as { room_name: string; conversation: unknown };
          const { room_name, conversation } = data;

          if (!room_name || !conversation) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing room_name or conversation data' }));
            resolve(true);
            return;
          }

          // Async - persists to Firestore
          const success = await demoSessions.updateDemoSessionConversation(
            room_name,
            conversation as Parameters<typeof demoSessions.updateDemoSessionConversation>[1]
          );

          if (!success) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Demo session not found' }));
            resolve(true);
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          log.error({ error: String(err) }, 'Demo session update error');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to update demo session' }));
        }
        resolve(true);
      });
    });
  }

  // Token generation endpoint (authenticated users)
  if (pathname === '/token') {
    // Rate limit: 20 tokens per minute per IP
    if (rateLimit(req, res, { maxRequests: 20, windowMs: 60000 })) {
      return true;
    }

    const room = parsedUrl.searchParams.get('room');
    const username = parsedUrl.searchParams.get('username');
    const device_id = parsedUrl.searchParams.get('device_id');
    const persona_id = parsedUrl.searchParams.get('persona_id');
    const preferred_accent = parsedUrl.searchParams.get('accent');

    if (!room || !username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required parameters: room and username' }));
      return true;
    }

    const selectedPersona = persona_id || 'ferni';

    try {
      // Try to verify Firebase token
      let firebaseUid: string | null = null;
      const authHeader = req.headers['authorization'];
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        try {
          const { verifyFirebaseToken } =
            await import('../../../services/identity/firebase-auth.js');
          const firebaseToken = authHeader.slice(7);
          const verified = await verifyFirebaseToken(firebaseToken);
          if (verified) {
            firebaseUid = verified.uid;
            log.debug({ firebaseUid: firebaseUid.substring(0, 8) }, 'Firebase auth');
          }
        } catch (firebaseErr) {
          log.debug({ note: (firebaseErr as Error).message }, 'Firebase auth note');
        }
      }

      // Generate token
      const token = await createToken(room, username);

      // 🌍 INTERNATIONAL ACCENT SUPPORT
      // Priority order:
      // 1. Explicit accent parameter from frontend (user's saved preference)
      // 2. User's saved accent preference from Firestore profile (if authenticated)
      // 3. Geo-detected accent from IP/locale
      // 4. Default to 'american'

      // Try to load user's saved accent AND location from profile if authenticated
      // "Better than Human" - We remember your accent preference AND location
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
          const { getDefaultStore } = await import('../../../memory/index.js');
          const store = getDefaultStore();
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

      // Detect geo/accent (fallback if no explicit or saved preference)
      // Priority: saved location (browser-gps/manual) > IP geolocation > timezone inference
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

      // Pre-warm LLM content cache (fire-and-forget, before session starts)
      prewarmLLMContentForPersona(selectedPersona, firebaseUid || undefined);

      // ⚡ OPTIMIZATION: Pre-fetch user data while token is being prepared
      // This starts loading profile, trust, insights BEFORE session starts
      if (firebaseUid) {
        prefetchUserData(firebaseUid, selectedPersona);
      }

      // Dispatch agent
      try {
        const agentMetadata = {
          user_name: username,
          firebase_uid: firebaseUid || undefined,
          device_id: device_id || undefined,
          persona_id: selectedPersona,
          source: 'web',
          locale: geoData.locale,
          locales: geoData.locales,
          preferredAccent: geoData.detectedAccent,
          countryCode: geoData.countryCode,
          // IP-detected location for weather, local content hints (TikTok-style)
          city: geoData.city,
          regionCode: geoData.regionCode,
        };
        await getAgentDispatch().createDispatch(room, AGENT_NAME, {
          metadata: JSON.stringify(agentMetadata),
        });
        log.info({ agent: AGENT_NAME, room }, 'Dispatched agent');
      } catch (dispatchErr) {
        log.debug({ note: (dispatchErr as Error).message }, 'Agent dispatch note');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          token,
          url: LIVEKIT_URL,
          room,
          username,
          device_id,
          firebase_uid: firebaseUid,
          persona_id: selectedPersona,
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
