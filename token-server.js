/**
 * Token Server for LiveKit Voice AI Agent
 *
 * This server generates access tokens for clients and dispatches the AI agent.
 * Also handles Spotify OAuth for premium music playback.
 *
 * Run with: node token-server.js
 */

import 'dotenv/config';
import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// DDoS protection utilities
import {
  hardenServer,
  handleHealthEndpoint,
  handleSecurityMonitoring,
  addRequestId,
  createOAuthStateManager,
  registerDDoSAlertCallback,
  startDDoSMonitoring,
  getClientIp,
} from './dist/utils/ddos-protection.js';

// Slack notifications for DDoS alerting
import { notifyDDoSAlert } from './dist/services/slack-notifications.js';

const PORT = process.env.TOKEN_SERVER_PORT || 3001;

// ============================================================================
// SECURE TOKEN ENCRYPTION (AES-256-GCM)
// ============================================================================

const ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY || process.env.LOG_HASH_SECRET;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * Get encryption key (derive 32-byte key from secret)
 */
function getEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    console.warn('⚠️  SECURITY: OAUTH_ENCRYPTION_KEY not set - tokens stored without encryption');
    return null;
  }
  // Derive a 32-byte key using SHA-256
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

/**
 * Encrypt sensitive data before storing
 */
function encryptData(data) {
  const key = getEncryptionKey();
  if (!key) return JSON.stringify(data); // Fallback to plain JSON if no key

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Return as structured encrypted payload
  return JSON.stringify({
    encrypted: true,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted
  });
}

/**
 * Decrypt stored data
 */
function decryptData(encryptedStr) {
  try {
    const parsed = JSON.parse(encryptedStr);

    // If not encrypted, return as-is
    if (!parsed.encrypted) {
      return parsed;
    }

    const key = getEncryptionKey();
    if (!key) {
      console.warn('⚠️  Cannot decrypt - no encryption key configured');
      return null;
    }

    const iv = Buffer.from(parsed.iv, 'base64');
    const authTag = Buffer.from(parsed.authTag, 'base64');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(parsed.data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (e) {
    // If decryption fails, try parsing as plain JSON (migration from old format)
    try {
      return JSON.parse(encryptedStr);
    } catch {
      console.error('Failed to decrypt or parse token data');
      return null;
    }
  }
}
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';

// Spotify OAuth Configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${PORT}/spotify/callback`;

// Google Calendar OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;
const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

// File to store user Spotify tokens (per device_id)
const SPOTIFY_USERS_FILE = path.join(process.cwd(), '.spotify-users.json');

// Spotify OAuth state storage (using DDoS-protected state manager with auto-expiry)
const oauthStates = createOAuthStateManager(5 * 60 * 1000); // 5 minute expiry

// ============================================================================
// DEMO SESSION RATE LIMITING
// ============================================================================

// Track demo sessions per IP (in-memory, resets on server restart)
const demoRateLimits = new Map();

// Demo session configuration
const DEMO_CONFIG = {
  maxSessionsPerDay: 3,        // Max demo sessions per IP per day
  sessionDurationMinutes: 3,   // How long each demo session can last
  cooldownMinutes: 5,          // Cooldown between sessions from same IP
};

// Clean up old rate limit entries every hour
setInterval(() => {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  for (const [ip, data] of demoRateLimits.entries()) {
    if (data.lastSession < dayAgo) {
      demoRateLimits.delete(ip);
    }
  }
}, 60 * 60 * 1000);

function getDemoRateLimit(ip) {
  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  
  let data = demoRateLimits.get(ip);
  
  // Reset if new day
  if (!data || data.dayStart !== dayStart) {
    data = { 
      dayStart, 
      sessionCount: 0, 
      lastSession: 0,
      sessions: [] 
    };
    demoRateLimits.set(ip, data);
  }
  
  return data;
}

function checkDemoAllowed(ip) {
  const data = getDemoRateLimit(ip);
  const now = Date.now();
  
  // Check daily limit
  if (data.sessionCount >= DEMO_CONFIG.maxSessionsPerDay) {
    return { 
      allowed: false, 
      reason: 'daily_limit',
      message: `You've used all ${DEMO_CONFIG.maxSessionsPerDay} demo sessions today. Create a free account for unlimited access!`,
      retryAfter: new Date(data.dayStart + 24 * 60 * 60 * 1000).toISOString()
    };
  }
  
  // Check cooldown
  const cooldownMs = DEMO_CONFIG.cooldownMinutes * 60 * 1000;
  if (data.lastSession && (now - data.lastSession) < cooldownMs) {
    const retryIn = Math.ceil((cooldownMs - (now - data.lastSession)) / 1000);
    return {
      allowed: false,
      reason: 'cooldown',
      message: `Please wait ${retryIn} seconds before starting another demo.`,
      retryAfter: new Date(data.lastSession + cooldownMs).toISOString()
    };
  }
  
  return { 
    allowed: true,
    sessionsRemaining: DEMO_CONFIG.maxSessionsPerDay - data.sessionCount
  };
}

function recordDemoSession(ip) {
  const data = getDemoRateLimit(ip);
  data.sessionCount++;
  data.lastSession = Date.now();
  data.sessions.push({
    started: Date.now(),
    sessionId: crypto.randomBytes(16).toString('hex')
  });
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

// Safe pattern for IDs (alphanumeric, dash, underscore, max 128 chars)
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validate that an ID is safe (prevents injection attacks)
 * @param {string} id - The ID to validate
 * @returns {boolean} - True if valid
 */
function isValidId(id) {
  if (!id || typeof id !== 'string') return false;
  return SAFE_ID_PATTERN.test(id);
}

/**
 * Send 400 error for invalid input
 */
function sendInvalidIdError(res, field) {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'invalid_input',
    message: `Invalid ${field}: must be 1-128 alphanumeric characters, dashes, or underscores`
  }));
}

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

// Allowed origins for CORS (restrict in production)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [
      'http://localhost:3004', 
      'http://localhost:3002', 
      'http://localhost:8080',  // Local landing page dev
      'https://ferni.ai',
      'https://www.ferni.ai',
      'https://app.ferni.ai',
      'https://ferni-landing.web.app',
      'https://john-bogle-ui-1031920444452.us-central1.run.app'
    ];

function getCorsOrigin(req) {
  const origin = req.headers.origin;
  // In development or if origin matches allowed list, return it
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
    return origin;
  }
  // Default to first allowed origin (won't match, blocking the request effectively)
  return ALLOWED_ORIGINS[0];
}

// ============================================================================
// SPOTIFY USER TOKEN MANAGEMENT
// ============================================================================

function loadSpotifyUsers() {
  try {
    if (fs.existsSync(SPOTIFY_USERS_FILE)) {
      const content = fs.readFileSync(SPOTIFY_USERS_FILE, 'utf8');
      return decryptData(content) || {};
    }
  } catch (e) {
    console.error('Error loading Spotify users');
  }
  return {};
}

function saveSpotifyUsers(users) {
  try {
    const encrypted = encryptData(users);
    fs.writeFileSync(SPOTIFY_USERS_FILE, encrypted);
  } catch (e) {
    console.error('Error saving Spotify users');
  }
}

function getSpotifyUserTokens(deviceId) {
  const users = loadSpotifyUsers();
  return users[deviceId] || null;
}

function saveSpotifyUserTokens(deviceId, tokens) {
  const users = loadSpotifyUsers();
  users[deviceId] = {
    ...tokens,
    updated_at: Date.now(),
  };
  saveSpotifyUsers(users);
}

function removeSpotifyUserTokens(deviceId) {
  const users = loadSpotifyUsers();
  delete users[deviceId];
  saveSpotifyUsers(users);
}

// Refresh Spotify access token for a user
async function refreshSpotifyToken(deviceId) {
  const userTokens = getSpotifyUserTokens(deviceId);
  if (!userTokens?.refresh_token) {
    return null;
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: userTokens.refresh_token,
      }),
    });

    if (!response.ok) {
      console.error('Spotify token refresh failed');
      return null;
    }

    const data = await response.json();
    const newTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || userTokens.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      scope: data.scope || userTokens.scope,
    };

    saveSpotifyUserTokens(deviceId, newTokens);
    return newTokens;
  } catch (e) {
    console.error('Error refreshing Spotify token');
    return null;
  }
}

// Get valid access token for a user (refresh if needed)
async function getValidSpotifyToken(deviceId) {
  const userTokens = getSpotifyUserTokens(deviceId);
  if (!userTokens) {
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  const bufferMs = 5 * 60 * 1000;
  if (Date.now() >= userTokens.expires_at - bufferMs) {
    const refreshed = await refreshSpotifyToken(deviceId);
    return refreshed?.access_token || null;
  }

  return userTokens.access_token;
}

// ============================================================================
// GOOGLE CALENDAR USER TOKEN MANAGEMENT
// ============================================================================

const GOOGLE_USERS_FILE = path.join(process.cwd(), '.google-calendar-users.json');
const googleOAuthStates = new Map();

function loadGoogleUsers() {
  try {
    if (fs.existsSync(GOOGLE_USERS_FILE)) {
      const content = fs.readFileSync(GOOGLE_USERS_FILE, 'utf8');
      return decryptData(content) || {};
    }
  } catch (e) {
    console.error('Error loading Google Calendar users');
  }
  return {};
}

function saveGoogleUsers(users) {
  try {
    const encrypted = encryptData(users);
    fs.writeFileSync(GOOGLE_USERS_FILE, encrypted);
  } catch (e) {
    console.error('Error saving Google Calendar users');
  }
}

function getGoogleUserTokens(userId) {
  const users = loadGoogleUsers();
  return users[userId] || null;
}

function saveGoogleUserTokens(userId, tokens) {
  const users = loadGoogleUsers();
  users[userId] = {
    ...tokens,
    updated_at: Date.now(),
  };
  saveGoogleUsers(users);
}

function removeGoogleUserTokens(userId) {
  const users = loadGoogleUsers();
  delete users[userId];
  saveGoogleUsers(users);
}

async function refreshGoogleToken(userId) {
  const userTokens = getGoogleUserTokens(userId);
  if (!userTokens?.refresh_token) {
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: userTokens.refresh_token,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Google Calendar token refresh failed');
      return null;
    }

    const data = await response.json();
    const newTokens = {
      access_token: data.access_token,
      refresh_token: userTokens.refresh_token, // Keep existing refresh token
      expires_at: Date.now() + (data.expires_in * 1000),
      scope: data.scope || userTokens.scope,
    };

    saveGoogleUserTokens(userId, newTokens);
    return newTokens;
  } catch (e) {
    console.error('Error refreshing Google Calendar token');
    return null;
  }
}

async function getValidGoogleToken(userId) {
  const userTokens = getGoogleUserTokens(userId);
  if (!userTokens) {
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  const bufferMs = 5 * 60 * 1000;
  if (Date.now() >= userTokens.expires_at - bufferMs) {
    const refreshed = await refreshGoogleToken(userId);
    return refreshed?.access_token || null;
  }

  return userTokens.access_token;
}

// Validate configuration
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('❌ Missing required environment variables:');
  console.error('   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET');
  console.error('   Please check your .env file');
  process.exit(1);
}

// Convert WSS URL to HTTPS for API calls
const LIVEKIT_HOST = LIVEKIT_URL.replace('wss://', 'https://');

// Initialize LiveKit services
const roomService = new RoomServiceClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// Agent dispatch client (may not be available in all SDK versions)
let agentDispatch = null;
try {
  agentDispatch = new AgentDispatchClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
} catch (e) {
  console.log('⚠️  AgentDispatchClient not available - using room creation only');
}

// Create token for a participant
async function createToken(roomName, participantName, metadata = {}) {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: '10m',
    metadata: JSON.stringify(metadata),
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await token.toJwt();
}

// Create room and dispatch agent
async function createRoomWithAgent(roomName, personaId, deviceId, userName, firebaseUid) {
  try {
    // Build metadata object with all user identification info
    // firebase_uid is Priority 2 for user identification (after explicit user_id)
    const roomMetadata = {
      persona_id: personaId,
      device_id: deviceId,
      firebase_uid: firebaseUid, // CRITICAL: Enables cross-device memory recall!
      user_name: userName,
    };

    // Create the room first (this ensures it exists)
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 60, // Close room after 60 seconds if empty
      maxParticipants: 10,
      metadata: JSON.stringify(roomMetadata),
    });
    console.log(`✅ Room created: ${roomName} (firebase: ${firebaseUid || 'none'}, device: ${deviceId || 'anonymous'})`);

    // Try to dispatch agent if available
    if (agentDispatch) {
      try {
        // CRITICAL: Pass device_id to agent so it can identify returning users!
        await agentDispatch.createDispatch(roomName, AGENT_NAME, {
          metadata: JSON.stringify(roomMetadata),
        });
        console.log(`✅ Agent dispatched: ${AGENT_NAME} -> ${roomName}`);
      } catch (dispatchError) {
        console.log(`⚠️  Agent dispatch failed (may auto-dispatch): ${dispatchError.message}`);
      }
    }

    return true;
  } catch (error) {
    // Room might already exist, which is fine
    if (error.message?.includes('already exists')) {
      console.log(`ℹ️  Room already exists: ${roomName}`);
      return true;
    }
    console.error(`❌ Error creating room: ${error.message}`);
    return false;
  }
}

// HTTP server
const server = http.createServer(async (req, res) => {
  // Add request ID for tracing
  const requestId = addRequestId(req, res);

  // Enable CORS with origin validation
  const corsOrigin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Health endpoint with DDoS rate limiting
  if (handleHealthEndpoint(req, res, pathname, 'token-server')) {
    return;
  }

  // Security monitoring endpoint (admin only)
  if (handleSecurityMonitoring(req, res, pathname)) {
    return;
  }

  // LiveKit URL endpoint
  if (pathname === '/token-url') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: LIVEKIT_URL }));
    return;
  }

  // ============================================================================
  // DEMO TOKEN ENDPOINT - For landing page try-before-signup
  // ============================================================================
  if (pathname === '/demo-token') {
    // Get IP for rate limiting
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.headers['x-real-ip'] || 
               req.socket.remoteAddress || 
               'unknown';
    
    // Check rate limits
    const rateCheck = checkDemoAllowed(ip);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 
        'Content-Type': 'application/json',
        'Retry-After': rateCheck.retryAfter
      });
      res.end(JSON.stringify({
        error: rateCheck.reason,
        message: rateCheck.message,
        retryAfter: rateCheck.retryAfter
      }));
      return;
    }

    try {
      // Generate anonymous demo session ID
      const demoId = `demo-${crypto.randomBytes(16).toString('hex')}`;
      const roomName = `demo-${crypto.randomBytes(12).toString('hex')}`;
      const username = 'Visitor';
      
      // Create room with demo metadata
      const roomMetadata = {
        persona_id: 'ferni',
        device_id: demoId,
        user_name: username,
        is_demo: true,
        demo_started: Date.now(),
        demo_expires: Date.now() + (DEMO_CONFIG.sessionDurationMinutes * 60 * 1000),
        source: 'landing_page'
      };

      await roomService.createRoom({
        name: roomName,
        emptyTimeout: DEMO_CONFIG.sessionDurationMinutes * 60 + 30, // Session duration + buffer
        maxParticipants: 2, // Just visitor + agent
        metadata: JSON.stringify(roomMetadata),
      });
      console.log(`🎯 Demo room created: ${roomName} (IP: ${ip.substring(0, 10)}...)`);

      // Dispatch agent
      if (agentDispatch) {
        try {
          await agentDispatch.createDispatch(roomName, AGENT_NAME, {
            metadata: JSON.stringify(roomMetadata),
          });
          console.log(`🤖 Agent dispatched to demo room`);
        } catch (dispatchError) {
          console.log(`⚠️  Demo agent dispatch: ${dispatchError.message}`);
        }
      }

      // Create short-lived token
      const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: username,
        ttl: `${DEMO_CONFIG.sessionDurationMinutes}m`,
        metadata: JSON.stringify({
          device_id: demoId,
          persona_id: 'ferni',
          is_demo: true
        }),
      });

      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const jwt = await token.toJwt();
      
      // Record this demo session for rate limiting
      recordDemoSession(ip);
      
      console.log(`✅ Demo token generated (${rateCheck.sessionsRemaining - 1} sessions remaining for this IP today)`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        token: jwt,
        url: LIVEKIT_URL,
        room: roomName,
        username,
        persona_id: 'ferni',
        is_demo: true,
        session_duration_minutes: DEMO_CONFIG.sessionDurationMinutes,
        sessions_remaining: rateCheck.sessionsRemaining - 1,
        upgrade_url: 'https://app.ferni.ai'
      }));
    } catch (error) {
      console.error('❌ Demo token error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create demo session' }));
    }
    return;
  }

  // Token generation endpoint (authenticated users)
  if (pathname === '/token') {
    const { room, username, device_id, persona_id, firebase_uid } = parsedUrl.query;

    if (!room || !username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing required parameters: room and username'
      }));
      return;
    }

    // Input validation - prevent injection attacks
    if (device_id && !isValidId(device_id)) {
      sendInvalidIdError(res, 'device_id');
      return;
    }
    if (persona_id && !isValidId(persona_id)) {
      sendInvalidIdError(res, 'persona_id');
      return;
    }
    if (firebase_uid && !isValidId(firebase_uid)) {
      sendInvalidIdError(res, 'firebase_uid');
      return;
    }

    try {
      const personaId = persona_id || 'ferni';

      // Create room and dispatch agent with user identification
      // firebase_uid is CRITICAL for remembering users across sessions!
      // Falls back to device_id if no Firebase auth
      await createRoomWithAgent(room, personaId, device_id, username, firebase_uid);

      // Check if user has Spotify linked
      const spotifyLinked = !!getSpotifyUserTokens(device_id);

      // Create token for user with identification metadata
      const token = await createToken(room, username, {
        device_id,
        firebase_uid, // Priority 2 for user identification in voice agent
        persona_id: personaId,
        spotify_linked: spotifyLinked,
      });

      console.log(`✅ Token generated for "${username}" in room "${room}" (firebase: ${firebase_uid || 'none'}, persona: ${personaId}, spotify: ${spotifyLinked})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        token,
        url: LIVEKIT_URL,
        room,
        username,
        persona_id: personaId,
        spotify_linked: spotifyLinked,
      }));
    } catch (error) {
      console.error('❌ Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate token' }));
    }
    return;
  }

  // ============================================================================
  // SPOTIFY OAUTH ENDPOINTS
  // ============================================================================

  // Start Spotify OAuth flow
  if (pathname === '/spotify/login') {
    const { device_id, return_url } = parsedUrl.query;

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Spotify not configured',
        message: 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env'
      }));
      return;
    }

    if (!device_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'device_id is required' }));
      return;
    }

    // Input validation
    if (!isValidId(device_id)) {
      sendInvalidIdError(res, 'device_id');
      return;
    }

    // Generate state for CSRF protection (using DDoS-protected state manager)
    const state = oauthStates.create({
      device_id,
      return_url: return_url || '/',
    });

    if (!state) {
      console.error('❌ OAuth state limit reached (possible attack)');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service temporarily unavailable, try again' }));
      return;
    }

    // Build Spotify authorization URL
    const scopes = [
      'streaming',
      'user-read-email',
      'user-read-private',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-read-collaborative',
    ].join(' ');

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('show_dialog', 'true');

    console.log(`🎵 Spotify OAuth started for device: ${device_id}`);

    // Redirect to Spotify
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // Spotify OAuth callback
  if (pathname === '/spotify/callback') {
    const { code, state, error } = parsedUrl.query;

    if (error) {
      console.error(`❌ Spotify OAuth error: ${error}`);
      res.writeHead(302, { Location: '/?spotify_error=' + encodeURIComponent(error) });
      res.end();
      return;
    }

    // Validate state (one-time use - automatically deleted on consume)
    const stateData = oauthStates.consume(state);
    if (!stateData) {
      console.error('❌ Invalid or expired OAuth state');
      res.writeHead(302, { Location: '/?spotify_error=invalid_state' });
      res.end();
      return;
    }
    const { device_id, return_url } = stateData;

    try {
      // Exchange code for tokens
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: SPOTIFY_REDIRECT_URI,
        }),
      });

      if (!response.ok) {
        console.error('❌ Spotify token exchange failed');
        res.writeHead(302, { Location: return_url + '?spotify_error=token_exchange_failed' });
        res.end();
        return;
      }

      const tokens = await response.json();

      // Save tokens for this user (encrypted)
      saveSpotifyUserTokens(device_id, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000),
        scope: tokens.scope,
      });

      console.log('✅ Spotify linked successfully');

      // Redirect back to app with success
      res.writeHead(302, { Location: return_url + '?spotify_linked=true' });
      res.end();
    } catch (e) {
      console.error('❌ Spotify callback error');
      res.writeHead(302, { Location: return_url + '?spotify_error=callback_failed' });
      res.end();
    }
    return;
  }

  // Get Spotify access token for a user (agent calls this)
  if (pathname === '/spotify/token') {
    const { device_id } = parsedUrl.query;

    if (!device_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'device_id is required' }));
      return;
    }

    const accessToken = await getValidSpotifyToken(device_id);

    if (!accessToken) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        linked: false,
        error: 'Spotify not linked for this device',
        login_url: `/spotify/login?device_id=${encodeURIComponent(device_id)}`,
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      linked: true,
      access_token: accessToken,
    }));
    return;
  }

  // Check Spotify status for a user
  if (pathname === '/spotify/status') {
    const { device_id } = parsedUrl.query;

    if (!device_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'device_id is required' }));
      return;
    }

    const userTokens = getSpotifyUserTokens(device_id);
    const spotifyConfigured = !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      spotify_configured: spotifyConfigured,
      linked: !!userTokens,
      expires_at: userTokens?.expires_at || null,
      login_url: spotifyConfigured ? `/spotify/login?device_id=${encodeURIComponent(device_id)}` : null,
    }));
    return;
  }

  // Unlink Spotify for a user
  if (pathname === '/spotify/unlink') {
    const { device_id } = parsedUrl.query;

    if (!device_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'device_id is required' }));
      return;
    }

    removeSpotifyUserTokens(device_id);
    console.log(`🎵 Spotify unlinked for device: ${device_id}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Spotify unlinked' }));
    return;
  }

  // ============================================================================
  // GOOGLE CALENDAR OAUTH ENDPOINTS
  // ============================================================================

  // Start Google Calendar OAuth flow
  if (pathname === '/auth/google/login') {
    const { user_id, return_url } = parsedUrl.query;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Google Calendar OAuth not configured',
        message: 'Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET'
      }));
      return;
    }

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return;
    }

    // Input validation
    if (!isValidId(user_id)) {
      sendInvalidIdError(res, 'user_id');
      return;
    }

    // Generate state token for CSRF protection
    const state = crypto.randomUUID();
    googleOAuthStates.set(state, {
      user_id,
      return_url: return_url || '/?calendar_linked=true',
      created_at: Date.now(),
    });

    // Clean up old states (older than 10 minutes)
    const maxAge = 10 * 60 * 1000;
    for (const [key, value] of googleOAuthStates) {
      if (Date.now() - value.created_at > maxAge) {
        googleOAuthStates.delete(key);
      }
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    console.log(`📅 Starting Google Calendar OAuth for user: ${user_id}`);
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // Google Calendar OAuth callback
  if (pathname === '/auth/google/callback') {
    const { code, state, error } = parsedUrl.query;

    if (error) {
      console.error(`❌ Google Calendar OAuth error: ${error}`);
      res.writeHead(302, { Location: '/?calendar_error=' + encodeURIComponent(error) });
      res.end();
      return;
    }

    // Validate state
    const stateData = googleOAuthStates.get(state);
    if (!stateData) {
      console.error('❌ Invalid Google OAuth state');
      res.writeHead(302, { Location: '/?calendar_error=invalid_state' });
      res.end();
      return;
    }

    googleOAuthStates.delete(state);
    const { user_id, return_url } = stateData;

    try {
      // Exchange code for tokens
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        console.error('❌ Google Calendar token exchange failed');
        res.writeHead(302, { Location: return_url + '?calendar_error=token_exchange_failed' });
        res.end();
        return;
      }

      const tokens = await response.json();

      // Save tokens for this user (encrypted)
      saveGoogleUserTokens(user_id, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000),
        scope: tokens.scope,
      });

      console.log('✅ Google Calendar linked successfully');

      // Redirect back to app with success
      res.writeHead(302, { Location: return_url + '?calendar_linked=true' });
      res.end();
    } catch (e) {
      console.error('❌ Google Calendar callback error');
      res.writeHead(302, { Location: return_url + '?calendar_error=callback_failed' });
      res.end();
    }
    return;
  }

  // Get Google Calendar access token for a user
  if (pathname === '/auth/google/token') {
    const { user_id } = parsedUrl.query;

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return;
    }

    const accessToken = await getValidGoogleToken(user_id);

    if (!accessToken) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        linked: false,
        error: 'Google Calendar not linked for this user',
        login_url: `/auth/google/login?user_id=${encodeURIComponent(user_id)}`,
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      linked: true,
      access_token: accessToken,
    }));
    return;
  }

  // Check Google Calendar link status
  if (pathname === '/auth/google/status') {
    const { user_id } = parsedUrl.query;

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return;
    }

    const userTokens = getGoogleUserTokens(user_id);
    const googleConfigured = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      google_calendar_configured: googleConfigured,
      linked: !!userTokens,
      expires_at: userTokens?.expires_at || null,
      login_url: googleConfigured ? `/auth/google/login?user_id=${encodeURIComponent(user_id)}` : null,
    }));
    return;
  }

  // Unlink Google Calendar for a user
  if (pathname === '/auth/google/unlink') {
    const { user_id } = parsedUrl.query;

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return;
    }

    removeGoogleUserTokens(user_id);
    console.log(`📅 Google Calendar unlinked for user: ${user_id}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Google Calendar unlinked' }));
    return;
  }

  // ============================================================================
  // STATIC FILE SERVING (for deployed UI)
  // ============================================================================
  const publicDir = path.resolve(process.cwd(), 'public');

  // Serve static files from ./public if it exists
  if (fs.existsSync(publicDir)) {
    let filePath = pathname === '/' ? '/index.html' : pathname;

    // Security: Use path.resolve() to normalize and catch traversal attempts
    // path.join() alone doesn't prevent ../ sequences properly
    const fullPath = path.resolve(publicDir, filePath.replace(/^\//, ''));

    // Verify the resolved path is still within publicDir
    if (!fullPath.startsWith(publicDir + path.sep) && fullPath !== publicDir) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    
    // Try to serve the file
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.mp3': 'audio/mpeg',
      };
      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    }
  }

  // 404 for unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Harden server with DDoS protection (timeouts, connection limits)
hardenServer(server);

// Register DDoS alerting to Slack
registerDDoSAlertCallback(async (details) => {
  await notifyDDoSAlert(details);
});

// Start automatic DDoS monitoring (checks every 30s, alerts to Slack)
const stopDDoSMonitoring = startDDoSMonitoring('token-server', 30_000);

server.listen(PORT, () => {
  console.log('');
  console.log('🎫 LiveKit Token Server (with Agent Dispatch + OAuth)');
  console.log('━'.repeat(50));
  console.log(`📡 Server running at http://localhost:${PORT}`);
  console.log(`🔗 LiveKit URL: ${LIVEKIT_URL}`);
  console.log(`🤖 Agent Name: ${AGENT_NAME}`);
  console.log(`🎵 Spotify: ${SPOTIFY_CLIENT_ID ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`📅 Google Calendar: ${GOOGLE_CLIENT_ID ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🛡️  DDoS Alerting: Slack notifications active`);
  console.log(`🛡️  DDoS Protection: ✅ Enabled`);
  console.log('');
  console.log('LiveKit Endpoints:');
  console.log(`  GET /token?room=ROOM&username=NAME&device_id=ID&persona_id=ferni`);
  console.log(`  GET /token-url`);
  console.log(`  GET /health`);
  console.log('');
  console.log('🎯 Demo Endpoint (Landing Page):');
  console.log(`  GET /demo-token  - Get anonymous demo session (rate limited)`);
  console.log(`      Rate Limit: ${DEMO_CONFIG.maxSessionsPerDay} sessions/day, ${DEMO_CONFIG.sessionDurationMinutes}min each`);
  console.log('');
  console.log('Spotify OAuth Endpoints:');
  console.log(`  GET /spotify/login?device_id=ID   - Start OAuth flow`);
  console.log(`  GET /spotify/callback             - OAuth callback (auto)`);
  console.log(`  GET /spotify/token?device_id=ID   - Get access token`);
  console.log(`  GET /spotify/status?device_id=ID  - Check link status`);
  console.log(`  GET /spotify/unlink?device_id=ID  - Remove Spotify link`);
  console.log('');
  console.log('Google Calendar OAuth Endpoints:');
  console.log(`  GET /auth/google/login?user_id=ID   - Start OAuth flow`);
  console.log(`  GET /auth/google/callback           - OAuth callback (auto)`);
  console.log(`  GET /auth/google/token?user_id=ID   - Get access token`);
  console.log(`  GET /auth/google/status?user_id=ID  - Check link status`);
  console.log(`  GET /auth/google/unlink?user_id=ID  - Remove Google Calendar link`);
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('━'.repeat(50));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down token server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
