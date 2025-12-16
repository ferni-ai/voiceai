/**
 * Token Routes
 *
 * LiveKit token generation and demo session handling.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { rateLimit } from '../../../api/auth-middleware.js';
import * as demoSessions from '../services/demo-sessions.js';

// Configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';

// Demo rate limiting configuration
const DEMO_CONFIG = {
  maxSessionsPerDay: 3,
  sessionDurationMinutes: 3,
  cooldownMinutes: 5,
};

// Demo rate limit storage
const demoRateLimits = new Map<
  string,
  { dayStart: number; sessionCount: number; lastSession: number }
>();

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
 * Get demo rate limit data for an IP
 */
function getDemoRateLimit(ip: string): {
  dayStart: number;
  sessionCount: number;
  lastSession: number;
} {
  const dayStart = new Date().setHours(0, 0, 0, 0);
  let data = demoRateLimits.get(ip);

  if (!data || data.dayStart !== dayStart) {
    data = { dayStart, sessionCount: 0, lastSession: 0 };
    demoRateLimits.set(ip, data);
  }
  return data;
}

/**
 * Check if demo is allowed for an IP
 */
function checkDemoAllowed(ip: string): {
  allowed: boolean;
  reason?: string;
  message?: string;
  sessionsRemaining?: number;
} {
  const data = getDemoRateLimit(ip);
  const now = Date.now();

  if (data.sessionCount >= DEMO_CONFIG.maxSessionsPerDay) {
    return {
      allowed: false,
      reason: 'daily_limit',
      message: `You've used all ${DEMO_CONFIG.maxSessionsPerDay} demo sessions today. Create a free account for unlimited access!`,
    };
  }

  const cooldownMs = DEMO_CONFIG.cooldownMinutes * 60 * 1000;
  if (data.lastSession && now - data.lastSession < cooldownMs) {
    const retryIn = Math.ceil((cooldownMs - (now - data.lastSession)) / 1000);
    return {
      allowed: false,
      reason: 'cooldown',
      message: `Please wait ${retryIn} seconds before starting another demo.`,
    };
  }

  return { allowed: true, sessionsRemaining: DEMO_CONFIG.maxSessionsPerDay - data.sessionCount };
}

/**
 * Record a demo session for an IP
 */
function recordDemoSession(ip: string): void {
  const data = getDemoRateLimit(ip);
  data.sessionCount++;
  data.lastSession = Date.now();
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
  const data = getDemoRateLimit(ip);
  const now = Date.now();
  const sessionsRemaining = Math.max(0, DEMO_CONFIG.maxSessionsPerDay - data.sessionCount);
  const cooldownMs = DEMO_CONFIG.cooldownMinutes * 60 * 1000;
  const timeSinceLastSession = data.lastSession ? now - data.lastSession : Infinity;
  const inCooldown = !!data.lastSession && timeSinceLastSession < cooldownMs;
  const cooldownRemaining = inCooldown ? Math.ceil((cooldownMs - timeSinceLastSession) / 1000) : 0;

  return {
    sessionsRemaining,
    sessionsTotal: DEMO_CONFIG.maxSessionsPerDay,
    sessionDurationMinutes: DEMO_CONFIG.sessionDurationMinutes,
    inCooldown,
    cooldownRemaining,
    cooldownMinutes: DEMO_CONFIG.cooldownMinutes,
    canStartSession: sessionsRemaining > 0 && !inCooldown,
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
  // LiveKit URL endpoint
  if (pathname === '/token-url') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: LIVEKIT_URL }));
    return true;
  }

  // Demo status endpoint (hyphenated path for backwards compatibility)
  if (pathname === '/demo-status') {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.socket.remoteAddress ||
      'unknown';
    const status = getDemoStatus(ip);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return true;
  }

  // Demo token endpoint (for landing page try-without-signup)
  if (pathname === '/demo-token') {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.socket.remoteAddress ||
      'unknown';

    // Check rate limits
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

      // Create demo session for "I remember you" experience
      const demoSession = demoSessions.createDemoSession(roomName, demoId, {
        ip,
        userAgent: req.headers['user-agent'],
      });

      // Record the session for rate limiting
      recordDemoSession(ip);

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
        console.log(`ℹ️ Demo agent dispatch note: ${(dispatchErr as Error).message}`);
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
          sessions_remaining: allowed.sessionsRemaining! - 1,
          claim_token: demoSession.claimToken,
          claim_expires_at: demoSession.expiresAt,
        })
      );
    } catch (error) {
      console.error('❌ Demo token error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create demo session' }));
    }
    return true;
  }

  // Demo session claim endpoint
  if (pathname === '/demo-claim' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    return new Promise((resolve) => {
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

          const result = demoSessions.claimDemoSession(claim_token, firebase_uid);

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
          console.error('❌ Demo claim error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
        resolve(true);
      });
    });
  }

  // Demo session update endpoint (called by voice agent)
  if (pathname === '/demo-session-update' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    return new Promise((resolve) => {
      req.on('end', () => {
        try {
          const data = JSON.parse(body) as { room_name: string; conversation: unknown };
          const { room_name, conversation } = data;

          if (!room_name || !conversation) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing room_name or conversation data' }));
            resolve(true);
            return;
          }

          const success = demoSessions.updateDemoSessionConversation(
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
          console.error('❌ Demo session update error:', err);
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
          const { verifyFirebaseToken } = await import('../../../services/firebase-auth.js');
          const firebaseToken = authHeader.slice(7);
          const verified = await verifyFirebaseToken(firebaseToken);
          if (verified) {
            firebaseUid = verified.uid;
            console.log(`🔐 Firebase auth: ${firebaseUid.substring(0, 8)}...`);
          }
        } catch (firebaseErr) {
          console.log(`🔐 Firebase auth note: ${(firebaseErr as Error).message}`);
        }
      }

      // Generate token
      const token = await createToken(room, username);

      // Detect geo/accent
      let geoData = {
        locale: 'en-US',
        locales: ['en-US'],
        detectedAccent: preferred_accent || 'american',
        countryCode: undefined as string | undefined,
      };

      try {
        const { detectGeoFromRequest } = await import('../../../services/geo-detection.js');
        const geo = await detectGeoFromRequest(req, {
          enableIpLookup: true,
          ipLookupTimeout: 2000,
        });
        geoData = {
          locale: geo.primaryLanguage || 'en-US',
          locales: geo.languages.length > 0 ? geo.languages : ['en-US'],
          detectedAccent: preferred_accent || geo.accent,
          countryCode: geo.countryCode,
        };
      } catch (geoErr) {
        console.log(`🌍 Geo detection note: ${(geoErr as Error).message}`);
      }

      console.log(
        `✅ Generated token for user "${username}" in room "${room}" (persona: ${selectedPersona}, accent: ${geoData.detectedAccent})`
      );

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
        };
        await getAgentDispatch().createDispatch(room, AGENT_NAME, {
          metadata: JSON.stringify(agentMetadata),
        });
        console.log(`✅ Dispatched agent "${AGENT_NAME}" to room "${room}"`);
      } catch (dispatchErr) {
        console.log(`ℹ️ Agent dispatch note: ${(dispatchErr as Error).message}`);
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
        })
      );
    } catch (error) {
      console.error('❌ Error generating token:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate token' }));
    }
    return true;
  }

  return false;
}

// Cleanup old rate limit entries hourly
setInterval(
  () => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [ip, data] of demoRateLimits.entries()) {
      if (data.lastSession < dayAgo) {
        demoRateLimits.delete(ip);
      }
    }
  },
  60 * 60 * 1000
);
