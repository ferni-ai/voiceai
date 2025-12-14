/**
 * UI Server with Token Server + Plaid Integration
 * Serves the frontend UI, provides LiveKit token generation, and handles Plaid OAuth flow
 */

import crypto from 'crypto';
import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import path from 'path';
import zlib from 'zlib';

// Engagement API routes (conversations, analytics, predictions, etc.)
import { handleEngagementRoutes } from './dist/api/engagement-routes.js';

// Diagnostics API routes (handoff metrics, etc.) - requires admin auth
import { handleDiagnosticsRoutes } from './dist/api/handoff-diagnostics.js';

// DORA metrics, voice presence, observability routes
import { handleDashboardMetricsRoutes } from './dist/api/dashboard-metrics-routes.js';
import { handleDORARoutes } from './dist/api/dora-routes.js';
import { handleObservabilityRoutes } from './dist/api/observability-routes.js';
import { handleToolsAnalyticsRoutes } from './dist/api/tools-analytics-routes.js';
import { handleVoicePresenceRoutes } from './dist/api/voice-presence-routes.js';

// Proactive Outreach API routes
import { handleOutreachRoutes } from './dist/api/outreach-handler.js';

// GDPR compliance routes (data export, deletion, consent)
import { handleGDPRRoutes } from './dist/api/gdpr-routes.js';

// Trust Journey & Export routes (Phase 1 & 2)
import { handleTrustExportRoutes } from './dist/api/trust-export-routes.js';
import { handleTrustJourneyRoutes } from './dist/api/trust-journey-routes.js';

// Calendar routes (for smart timing)
import { handleCalendarRoutes } from './dist/api/calendar-routes.js';

// Trust Systems consolidated routes (Phases 12-29)
import { handleTrustSystemsRoutes } from './dist/api/trust-systems-routes.js';

// Feature Flags routes (P7)
import { handleFeatureFlagsRoutes } from './dist/api/feature-flags-routes.js';

// Brand System routes (AI-powered brand management)
import { handleBrandRoutes } from './dist/api/brand-routes.js';

// Commands API routes (persona slash commands)
import { handleCommandsRoutes } from './dist/api/commands-routes.js';

// Widget SDK routes (embeddable widget for third-party hosting)
import { handleWidgetRoutes } from './dist/api/widget-routes.js';

// Monitoring routes (P11)
import { handleMonitoringRoutes } from './dist/api/monitoring-routes.js';

// Performance monitoring routes (lazy loading, memory, tools)
import { handlePerformanceRoutes } from './dist/api/performance-routes.js';

// Relationship Health Dashboard routes
import { relationshipHealthRoutes } from './dist/api/routes/relationship-health-routes.js';

// Relationship Progress routes
import { handleRelationshipRoutes } from './dist/api/routes/relationship.js';

// Voice Humanization routes (metrics, feature flags)
import { handleVoiceHumanizationRoutes } from './dist/api/voice-humanization-routes.js';

// Speech Metrics routes (unified speech pipeline metrics, per-persona analytics)
import { handleSpeechMetricsRoutes } from './dist/api/speech-metrics-routes.js';

// Voice Authentication routes (enrollment, verification, identification)
import { handleVoiceAuthRoutes } from './dist/api/voice-auth-handler.js';

// User preferences routes (timezone, quiet hours, contact info)
import { handleUserRoutes } from './dist/api/user-routes.js';

// Habit persistence routes (CRUD, completions, streaks)
import { handleHabitRoutes } from './dist/api/habit-routes.js';

// Wellbeing Dashboard routes (dashboard, trends, insights, snapshots)
import { handleWellbeingRoutes } from './dist/api/wellbeing-handler.js';

// Predictive Insights routes (energy, burnout, habits, goals, etc.)
import { handlePredictiveInsightsRequest } from './dist/api/predictive-insights-routes.js';

// Scheduled Jobs routes (for Cloud Scheduler)
import { handleScheduledJobsRoutes } from './dist/api/scheduled-jobs-handler.js';

// EvalOps - Quality evaluation system (LLM-as-judge, voice fingerprints, test scenarios)
import { handleEvalOpsRoutes } from './dist/api/evalops-handler.js';

// Household settings persistence
import { handleHouseholdRoutes } from './dist/api/household-routes.js';

// Story journey persistence
import { handleStoryJourneyRoutes } from './dist/api/story-journey-routes.js';

// Subscription routes (Stripe checkout, billing portal, usage tracking)
import { handleSubscriptionRequest, isSubscriptionRoute } from './dist/api/subscription-routes.js';

// User Analytics routes (DAU/WAU/MAU, session tracking, concurrent users)
import { handleAnalyticsRoutes } from './dist/api/user-analytics-routes.js';

// Builder Metrics routes (admin/monitoring - context builder performance)
import { handleBuilderMetricsRoutes } from './dist/api/routes/builder-metrics.js';

// Monetization routes (tip jar, value capture, ferni fund, B2B, partnerships)
import { handleMonetizationRequest, isMonetizationRoute } from './dist/api/monetization-routes.js';

// Apple In-App Purchase routes (iOS subscriptions)
import { handleAppleRoutes, isAppleRoute } from './dist/api/apple-iap-routes.js';

// Rate limiting and auth for sensitive endpoints
import { rateLimit, requireAdmin } from './dist/api/auth-middleware.js';

// DDoS protection utilities
import {
  addRequestId,
  createOAuthStateManager,
  handleHealthEndpoint,
  handleSecurityMonitoring,
  hardenServer,
  registerDDoSAlertCallback,
  startDDoSMonitoring,
} from './dist/utils/ddos-protection.js';

// Slack notifications for DDoS alerting
import { notifyDDoSAlert } from './dist/services/slack-notifications.js';

// API v1 Routes (new unified admin API)
import { handleV1Routes } from './dist/api/v1/index.js';

// Migration routes (device ID to Firebase UID)
import handleMigrationRoutes from './dist/api/migration-routes.js';

// Account routes (profile, deletion)
import handleAccountRoutes from './dist/api/account-routes.js';

// Auth monitoring routes (metrics, health)
import handleAuthMonitoringRoutes from './dist/api/auth-monitoring-routes.js';

// Session accent routes (mid-session accent changes)
import handleSessionAccentRoutes from './dist/api/session-accent-routes.js';

// Landing Intelligence routes (Gemini-powered landing page optimization)
import { handleLandingIntelligenceRoutes } from './dist/api/landing-intelligence-handler.js';

// Landing Optimization Agent routes (automated optimization, reports, experiments)
import { handleLandingOptimizationRoutes } from './dist/api/landing-optimization-handler.js';

// Garden routes (Seed Fund community contribution system)
import { handleCameoAnalyticsRoutes } from './dist/api/cameo-analytics-routes.js';
import { handleGardenRoutes } from './dist/api/garden-routes.js';

// Marketplace routes (publisher portal, browse, install, billing)
import { handleMarketplaceRoutes } from './dist/api/marketplace-routes.js';

const PORT = process.env.PORT || 3003;
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// Plaid configuration
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_BASE_URL =
  {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
  }[PLAID_ENV] || 'https://sandbox.plaid.com';

// Spotify configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_TOKENS_FILE = path.join(process.cwd(), '.spotify-tokens.json');

// Google Calendar OAuth configuration
const GOOGLE_CALENDAR_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
const GOOGLE_CALENDAR_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
const GOOGLE_CALENDAR_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'https://app.ferni.ai/auth/google/callback';
const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');
const GOOGLE_CALENDAR_TOKENS_FILE = path.join(process.cwd(), '.google-calendar-tokens.json');

// Google Calendar OAuth state storage (using DDoS-protected state manager)
const googleOAuthStates = createOAuthStateManager(5 * 60 * 1000); // 5 minute expiry

// Google Calendar token management
function loadGoogleCalendarUsers() {
  try {
    if (fs.existsSync(GOOGLE_CALENDAR_TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(GOOGLE_CALENDAR_TOKENS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading Google Calendar users:', e.message);
  }
  return {};
}

function saveGoogleCalendarUsers(users) {
  try {
    fs.writeFileSync(GOOGLE_CALENDAR_TOKENS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Error saving Google Calendar users:', e.message);
  }
}

function getGoogleCalendarUserTokens(userId) {
  const users = loadGoogleCalendarUsers();
  return users[userId] || null;
}

function saveGoogleCalendarUserTokens(userId, tokens) {
  const users = loadGoogleCalendarUsers();
  users[userId] = {
    ...tokens,
    updated_at: Date.now(),
  };
  saveGoogleCalendarUsers(users);
}

function removeGoogleCalendarUserTokens(userId) {
  const users = loadGoogleCalendarUsers();
  delete users[userId];
  saveGoogleCalendarUsers(users);
}

async function refreshGoogleCalendarToken(userId) {
  const userTokens = getGoogleCalendarUserTokens(userId);
  if (!userTokens?.refresh_token) return null;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: userTokens.refresh_token,
        client_id: GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: GOOGLE_CALENDAR_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh Google Calendar token');
      return null;
    }

    const tokens = await response.json();
    const newTokens = {
      ...userTokens,
      access_token: tokens.access_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    };
    saveGoogleCalendarUserTokens(userId, newTokens);
    return newTokens.access_token;
  } catch (error) {
    console.error('Error refreshing Google Calendar token:', error);
    return null;
  }
}

async function getValidGoogleCalendarToken(userId) {
  const userTokens = getGoogleCalendarUserTokens(userId);
  if (!userTokens) return null;

  // Check if token is expired or will expire in next 5 minutes
  if (userTokens.expires_at && Date.now() >= userTokens.expires_at - 5 * 60 * 1000) {
    return await refreshGoogleCalendarToken(userId);
  }

  return userTokens.access_token;
}

// Spotify state - device ID from web player
let spotifyWebDeviceId = null;
let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;

// ============================================================================
// DEMO SESSION RATE LIMITING (for landing page try-without-signup)
// ============================================================================

const demoRateLimits = new Map();

const DEMO_CONFIG = {
  maxSessionsPerDay: 3,
  sessionDurationMinutes: 3,
  cooldownMinutes: 5,
};

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

function getDemoRateLimit(ip) {
  const dayStart = new Date().setHours(0, 0, 0, 0);
  let data = demoRateLimits.get(ip);

  if (!data || data.dayStart !== dayStart) {
    data = { dayStart, sessionCount: 0, lastSession: 0 };
    demoRateLimits.set(ip, data);
  }
  return data;
}

function checkDemoAllowed(ip) {
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

function recordDemoSession(ip) {
  const data = getDemoRateLimit(ip);
  data.sessionCount++;
  data.lastSession = Date.now();
}

/**
 * Get demo status without consuming a session.
 * Returns proactive info so the frontend can show warm messaging.
 */
function getDemoStatus(ip) {
  const data = getDemoRateLimit(ip);
  const now = Date.now();
  const sessionsRemaining = Math.max(0, DEMO_CONFIG.maxSessionsPerDay - data.sessionCount);
  const cooldownMs = DEMO_CONFIG.cooldownMinutes * 60 * 1000;
  const timeSinceLastSession = data.lastSession ? now - data.lastSession : Infinity;
  const inCooldown = data.lastSession && timeSinceLastSession < cooldownMs;
  const cooldownRemaining = inCooldown ? Math.ceil((cooldownMs - timeSinceLastSession) / 1000) : 0;

  return {
    sessionsRemaining,
    sessionsTotal: DEMO_CONFIG.maxSessionsPerDay,
    sessionDurationMinutes: DEMO_CONFIG.sessionDurationMinutes,
    inCooldown,
    cooldownRemaining, // seconds
    cooldownMinutes: DEMO_CONFIG.cooldownMinutes,
    canStartSession: sessionsRemaining > 0 && !inCooldown,
  };
}

// ============================================================================
// DEMO SESSION STORAGE (Remember conversations for account migration)
// ============================================================================
// 
// "Better than human" - We remember our first conversation even before
// you formally introduce yourself. When a demo user creates an account,
// Ferni warmly acknowledges: "I remember you! You mentioned X..."
//

const demoSessions = new Map();
const DEMO_SESSION_TTL_HOURS = 48; // Keep demo sessions for 48 hours

/**
 * Create a new demo session that can be claimed later.
 * Returns a claim token the user can use to migrate their conversation.
 */
function createDemoSession(roomName, demoId, metadata = {}) {
  const claimToken = crypto.randomBytes(16).toString('hex');
  
  const session = {
    roomName,
    demoId,
    claimToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + (DEMO_SESSION_TTL_HOURS * 60 * 60 * 1000),
    metadata,
    // Conversation data (populated by voice agent via webhook)
    conversation: {
      messages: [],
      highlights: [], // Key moments from the conversation
      topics: [],     // Topics discussed
      userMood: null, // Detected emotional state
      ferniNotes: '', // What Ferni wants to remember
    },
    // Claim status
    claimed: false,
    claimedBy: null,
    claimedAt: null,
  };
  
  demoSessions.set(roomName, session);
  console.log(`📝 Demo session created: ${roomName} (claim: ${claimToken.substring(0, 8)}...)`);
  
  return { claimToken, roomName, expiresAt: session.expiresAt };
}

/**
 * Get a demo session by room name.
 */
function getDemoSession(roomName) {
  const session = demoSessions.get(roomName);
  if (!session) return null;
  
  // Check if expired
  if (Date.now() > session.expiresAt) {
    demoSessions.delete(roomName);
    return null;
  }
  
  return session;
}

/**
 * Get a demo session by claim token.
 */
function getDemoSessionByToken(claimToken) {
  for (const [roomName, session] of demoSessions.entries()) {
    if (session.claimToken === claimToken) {
      // Check if expired
      if (Date.now() > session.expiresAt) {
        demoSessions.delete(roomName);
        return null;
      }
      return session;
    }
  }
  return null;
}

/**
 * Update demo session with conversation data.
 * Called by voice agent via webhook when conversation ends.
 */
function updateDemoSessionConversation(roomName, conversationData) {
  const session = getDemoSession(roomName);
  if (!session) {
    console.log(`⚠️ Demo session not found for update: ${roomName}`);
    return false;
  }
  
  // Merge conversation data
  session.conversation = {
    ...session.conversation,
    ...conversationData,
  };
  
  console.log(`📝 Demo session updated: ${roomName} (${session.conversation.highlights?.length || 0} highlights)`);
  return true;
}

/**
 * Claim a demo session for a Firebase user.
 * Returns the session data for migration.
 */
function claimDemoSession(claimToken, firebaseUid) {
  const session = getDemoSessionByToken(claimToken);
  
  if (!session) {
    return { success: false, error: 'Session not found or expired' };
  }
  
  if (session.claimed) {
    // If already claimed by same user, return success
    if (session.claimedBy === firebaseUid) {
      return { success: true, session, alreadyClaimed: true };
    }
    return { success: false, error: 'Session already claimed by another user' };
  }
  
  // Mark as claimed
  session.claimed = true;
  session.claimedBy = firebaseUid;
  session.claimedAt = Date.now();
  
  console.log(`✅ Demo session claimed: ${session.roomName} by ${firebaseUid.substring(0, 8)}...`);
  
  return { success: true, session };
}

// Cleanup expired demo sessions every hour
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [roomName, session] of demoSessions.entries()) {
    if (now > session.expiresAt) {
      demoSessions.delete(roomName);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired demo sessions`);
  }
}, 60 * 60 * 1000);

// Get Spotify refresh token from file or .env
function getSpotifyRefreshToken() {
  // Try file first (new system)
  try {
    if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8'));
      if (data.refresh_token) {
        console.log('🎵 Using refresh token from .spotify-tokens.json');
        return data.refresh_token;
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not read Spotify tokens file:', err.message);
  }

  // Fall back to .env (old system)
  const envToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (envToken) {
    console.log('🎵 Using refresh token from .env (consider running scripts/spotify-auth.js)');
    return envToken;
  }

  return null;
}

// Save updated tokens to file
function saveSpotifyTokens(accessToken, refreshToken, expiresIn, scope = '') {
  try {
    // Preserve existing scope if not provided
    let existingScope = scope;
    if (!scope && fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      try {
        const existing = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8'));
        existingScope = existing.scope || '';
      } catch {}
    }

    const data = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + expiresIn * 1000,
      token_type: 'Bearer',
      scope: existingScope,
    };
    fs.writeFileSync(SPOTIFY_TOKENS_FILE, JSON.stringify(data, null, 2));
    console.log(
      '🎵 Saved updated tokens to .spotify-tokens.json (scope:',
      existingScope.slice(0, 50) + '...)'
    );
  } catch (err) {
    console.warn('⚠️ Could not save Spotify tokens:', err.message);
  }
}

// Get token expiry time from file
function getSpotifyTokenExpiry() {
  try {
    if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8'));
      return data.expires_at || 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

// Proactive token refresh - runs in background
async function refreshSpotifyTokenIfNeeded() {
  const refreshToken = getSpotifyRefreshToken();
  if (!refreshToken || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return; // Not configured
  }

  const expiresAt = getSpotifyTokenExpiry();
  const now = Date.now();
  const minutesUntilExpiry = Math.round((expiresAt - now) / 60000);

  // Refresh if less than 10 minutes remaining
  if (expiresAt > 0 && minutesUntilExpiry > 10) {
    console.log(`🎵 Spotify token valid for ${minutesUntilExpiry} more minutes`);
    return;
  }

  console.log(
    `🎵 Spotify token ${expiresAt === 0 ? 'not cached' : `expiring in ${minutesUntilExpiry} min`} - refreshing...`
  );

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('❌ Auto-refresh failed:', tokenResponse.status);
      return;
    }

    const data = await tokenResponse.json();
    spotifyAccessToken = data.access_token;
    spotifyTokenExpiry = Date.now() + data.expires_in * 1000;

    // Save to file
    saveSpotifyTokens(data.access_token, data.refresh_token || refreshToken, data.expires_in);

    const newMinutes = Math.round(data.expires_in / 60);
    console.log(`✅ Spotify token auto-refreshed! Valid for ${newMinutes} minutes`);
  } catch (err) {
    console.error('❌ Auto-refresh error:', err.message);
  }
}

// Start background refresh checker (every 5 minutes)
function startSpotifyAutoRefresh() {
  // Check immediately on startup
  refreshSpotifyTokenIfNeeded();

  // Then check every 5 minutes
  setInterval(refreshSpotifyTokenIfNeeded, 5 * 60 * 1000);
  console.log('🎵 Spotify auto-refresh enabled (checks every 5 min)');
}

// In-memory token storage (production would use database)
// This is shared between server and agent via file or Redis
const plaidAccessTokens = new Map();
const PLAID_TOKENS_FILE = path.join(process.cwd(), '.plaid-tokens.json');

// Load tokens from file on startup
function loadPlaidTokens() {
  try {
    if (fs.existsSync(PLAID_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLAID_TOKENS_FILE, 'utf8'));
      for (const [key, value] of Object.entries(data)) {
        plaidAccessTokens.set(key, value);
      }
      console.log(`✅ Loaded ${plaidAccessTokens.size} Plaid tokens from storage`);
    }
  } catch (err) {
    console.warn('⚠️ Could not load Plaid tokens:', err.message);
  }
}

// Save tokens to file
function savePlaidTokens() {
  try {
    const data = Object.fromEntries(plaidAccessTokens);
    fs.writeFileSync(PLAID_TOKENS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('⚠️ Could not save Plaid tokens:', err.message);
  }
}

// Store a Plaid access token for a user
function storePlaidToken(userId, accessToken, itemId, institution) {
  plaidAccessTokens.set(userId, {
    access_token: accessToken,
    item_id: itemId,
    institution,
    linked_at: new Date().toISOString(),
  });
  savePlaidTokens();
  console.log(`🔐 Stored Plaid token for user: ${userId} (${institution?.name || 'Unknown'})`);
}

// Get Plaid access token for a user (exported for agent use)
export function getPlaidToken(userId) {
  return plaidAccessTokens.get(userId);
}

loadPlaidTokens();

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error(
    '❌ Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET'
  );
  process.exit(1);
}

// Agent dispatch client for dispatching agents to rooms
const agentDispatch = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// Default agent name - must match livekit.toml agent name
// The persona is passed via metadata, not separate agents
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';

/**
 * Generate LiveKit access token
 */
async function createToken(roomName, participantName) {
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
 * Get MIME type for file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Serve static files from frontend-typescript/dist directory
 * With gzip compression for supported content types
 */
function serveStaticFile(filePath, res, req) {
  const fullPath = path.join(process.cwd(), 'frontend-typescript', 'dist', filePath);

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(fullPath);
  const frontendDir = path.resolve(process.cwd(), 'frontend-typescript', 'dist');
  if (!resolvedPath.startsWith(frontendDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Optimization: Use streams instead of readFile for better memory usage
  // Also add Cache-Control headers for production performance
  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const mimeType = getMimeType(filePath);

    // Cache strategy:
    // - Assets (in /assets/): Immutable, cache for 1 year
    // - Others (HTML, root files): Revalidate immediately
    const isAsset = filePath.includes('/assets/');
    const cacheControl = isAsset
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate';

    // Check if client accepts gzip and content is compressible
    const acceptEncoding = req?.headers?.['accept-encoding'] || '';
    const shouldCompress =
      acceptEncoding.includes('gzip') &&
      (mimeType.startsWith('text/') ||
        mimeType === 'application/javascript' ||
        mimeType === 'application/json' ||
        mimeType === 'image/svg+xml');

    const headers = {
      'Content-Type': mimeType,
      'Cache-Control': cacheControl,
      Vary: 'Accept-Encoding',
    };

    if (shouldCompress) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);

      const stream = fs.createReadStream(fullPath);
      const gzip = zlib.createGzip({ level: 6 }); // Balance speed vs compression
      stream.pipe(gzip).pipe(res);

      stream.on('error', (error) => {
        console.error(`❌ Stream error for ${filePath}:`, error);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
    } else {
      // No compression - send raw with Content-Length
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);

      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);

      stream.on('error', (error) => {
        console.error(`❌ Stream error for ${filePath}:`, error);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
    }
  });
}

// Allowed origins for CORS (restrict in production)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [
      'http://localhost:3004',
      'http://localhost:3002',
      'https://ferni.ai',
      'https://john-bogle-ui-1031920444452.us-central1.run.app',
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

// HTTP server
const server = http.createServer(async (req, res) => {
  // Add request ID for tracing
  const requestId = addRequestId(req, res);

  // Enable CORS with origin validation
  const corsOrigin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-User-Id, Authorization, Stripe-Signature'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ============================================================================
  // HEALTH ENDPOINT WITH RATE LIMITING (DDoS Protection)
  // ============================================================================
  if (handleHealthEndpoint(req, res, pathname, 'bogle-ui')) {
    return;
  }

  // ============================================================================
  // SECURITY MONITORING ENDPOINT (Admin Only)
  // ============================================================================
  if (handleSecurityMonitoring(req, res, pathname)) {
    return;
  }

  // ============================================================================
  // GLOBAL RATE LIMITING (applied to all API routes)
  // ============================================================================
  // Skip rate limiting for health checks and static files
  if (pathname.startsWith('/api/') && pathname !== '/api/health') {
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      // Rate limited - response already sent
      return;
    }
  }

  // ============================================================================
  // ENGAGEMENT API ROUTES (conversations, analytics, predictions, rituals, etc.)
  // ============================================================================
  try {
    const handled = await handleEngagementRoutes(req, res, pathname, parsedUrl);
    if (handled) return;
  } catch (err) {
    console.error('❌ Engagement route error:', err);
  }

  // ============================================================================
  // MARKETPLACE API ROUTES (publisher portal, browse, install, billing)
  // ============================================================================
  try {
    if (pathname.startsWith('/api/marketplace/')) {
      const handled = await handleMarketplaceRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }
  } catch (err) {
    console.error('❌ Marketplace route error:', err);
  }

  // ============================================================================
  // MARKETPLACE ADMIN ROUTES (review queue, moderation)
  // ============================================================================
  try {
    if (pathname.startsWith('/api/admin/marketplace')) {
      const { handleMarketplaceAdminRoutes } =
        await import('./dist/api/routes/marketplace-admin.js');
      const handled = await handleMarketplaceAdminRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    console.error('❌ Marketplace admin route error:', err);
  }

  // ============================================================================
  // DIAGNOSTICS API ROUTES (requires admin auth)
  // ============================================================================
  try {
    const handled = await handleDiagnosticsRoutes(req, res, pathname, parsedUrl);
    if (handled) return;
  } catch (err) {
    console.error('❌ Diagnostics route error:', err);
  }

  // ============================================================================
  // API V1 ROUTES (new unified admin API)
  // ============================================================================
  try {
    if (pathname.startsWith('/api/v1/')) {
      const handled = await handleV1Routes(req, res, pathname, parsedUrl);
      if (handled) return;
    }
  } catch (err) {
    console.error('❌ API v1 route error:', err);
  }

  // ============================================================================
  // MIGRATION ROUTES (device ID to Firebase UID)
  // ============================================================================
  try {
    if (pathname.startsWith('/api/auth/migrat')) {
      const handled = await handleMigrationRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    console.error('❌ Migration route error:', err);
  }

  // ============================================================================
  // ACCOUNT ROUTES (profile, deletion)
  // ============================================================================
  try {
    if (pathname.startsWith('/api/account')) {
      const handled = await handleAccountRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    console.error('❌ Account route error:', err);
  }

  // ============================================================================
  // SESSION ACCENT ROUTES (mid-session accent changes)
  // ============================================================================
  try {
    if (pathname.startsWith('/api/session/accent')) {
      const handled = await handleSessionAccentRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    console.error('❌ Session accent route error:', err);
  }

  // ============================================================================
  // AUTH MONITORING ROUTES (metrics, health)
  // ============================================================================
  try {
    if (pathname.startsWith('/api/auth/')) {
      const handled = await handleAuthMonitoringRoutes(req, res, pathname);
      if (handled) return;
    }
  } catch (err) {
    console.error('❌ Auth monitoring route error:', err);
  }

  // ============================================================================
  // DORA, VOICE PRESENCE, OBSERVABILITY ROUTES
  // ============================================================================
  try {
    // DORA metrics
    if (pathname.startsWith('/api/dora')) {
      const handled = await handleDORARoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Voice presence
    if (pathname.startsWith('/api/voice-presence')) {
      const handled = await handleVoicePresenceRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Observability
    if (pathname.startsWith('/api/observability')) {
      const handled = await handleObservabilityRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Tools Analytics (for tools-dashboard.html)
    if (pathname.startsWith('/api/tools')) {
      const handled = await handleToolsAnalyticsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Dashboard metrics (for HTML dashboards - /api/metrics/*, /api/cognitive/*)
    if (pathname.startsWith('/api/metrics') || pathname.startsWith('/api/cognitive')) {
      const handled = await handleDashboardMetricsRoutes(req, res, pathname);
      if (handled) return;
    }

    // GDPR compliance (data export, deletion, consent)
    if (pathname.startsWith('/api/gdpr')) {
      const handled = await handleGDPRRoutes(req, res, pathname);
      if (handled) return;
    }

    // Trust Journey visualization (Phase 1)
    if (pathname.startsWith('/api/trust-journey')) {
      const handled = await handleTrustJourneyRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Trust data export (Phase 2)
    if (pathname.startsWith('/api/trust-export')) {
      const handled = await handleTrustExportRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Calendar routes (for smart outreach timing)
    if (pathname.startsWith('/api/calendar')) {
      const handled = await handleCalendarRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Trust Systems consolidated routes (Phases 12-29)
    if (pathname.startsWith('/api/trust/')) {
      const handled = await handleTrustSystemsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Relationship Progress routes (must be before health routes for specificity)
    if (pathname === '/api/relationship/progress') {
      const handled = await handleRelationshipRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Relationship Health Dashboard routes
    if (pathname.startsWith('/api/relationship/')) {
      const handled = await relationshipHealthRoutes(req, res);
      if (handled) return;
    }

    // Proactive Outreach routes
    if (pathname.startsWith('/api/outreach')) {
      const handled = await handleOutreachRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Feature Flags routes (P7)
    if (pathname.startsWith('/api/flags')) {
      const handled = await handleFeatureFlagsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Brand System routes (AI-powered brand management)
    if (pathname.startsWith('/api/brand')) {
      const handled = await handleBrandRoutes(req, res, pathname);
      if (handled) return;
    }

    // Landing Intelligence routes (Gemini-powered landing page optimization)
    if (pathname.startsWith('/api/landing')) {
      // Check optimization routes first (more specific)
      if (pathname.startsWith('/api/landing/optimization')) {
        const handled = await handleLandingOptimizationRoutes(req, res, pathname);
        if (handled) return;
      }
      // Then general landing routes
      const handled = await handleLandingIntelligenceRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Commands API routes (persona slash commands)
    if (pathname.startsWith('/api/commands')) {
      const handled = await handleCommandsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Widget SDK routes (embeddable widget for third-party hosting)
    if (pathname.startsWith('/api/widget')) {
      const handled = await handleWidgetRoutes(req, res, pathname);
      if (handled) return;
    }

    // Monitoring routes (P11)
    if (pathname.startsWith('/api/monitoring')) {
      const handled = await handleMonitoringRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Performance monitoring routes (lazy loading, memory, tools)
    if (pathname.startsWith('/api/performance')) {
      const handled = await handlePerformanceRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Voice Humanization routes (metrics, feature toggles, dashboard)
    if (pathname.startsWith('/api/voice-humanization')) {
      const handled = await handleVoiceHumanizationRoutes(req, res, pathname);
      if (handled) return;
    }

    // Speech Metrics routes (unified speech pipeline metrics, per-persona analytics)
    if (pathname.startsWith('/api/speech-metrics')) {
      const handled = await handleSpeechMetricsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Voice Authentication routes (enrollment, verification, identification)
    if (pathname.startsWith('/api/voice/')) {
      const handled = await handleVoiceAuthRoutes(req, res, pathname);
      if (handled) return;
    }

    // User preferences routes (timezone, quiet hours, contact info)
    if (pathname.startsWith('/api/user')) {
      const handled = await handleUserRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Habit persistence routes (CRUD, completions, streaks)
    if (pathname.startsWith('/api/habits')) {
      const handled = await handleHabitRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Garden routes (Seed Fund community contribution system)
    if (pathname.startsWith('/api/garden')) {
      const handled = await handleGardenRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Cameo Analytics routes
    if (pathname.startsWith('/api/cameo')) {
      const handled = await handleCameoAnalyticsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Wellbeing Dashboard routes (dashboard, trends, insights, snapshots)
    if (pathname.startsWith('/api/wellbeing')) {
      const handled = await handleWellbeingRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Predictive Insights routes (energy, burnout, habits, goals, etc.)
    if (pathname.startsWith('/api/insights')) {
      // Extract userId from auth token
      const userId = req.headers['x-user-id'] || 'anonymous';
      const handled = await handlePredictiveInsightsRequest(req, res, parsedUrl, userId);
      if (handled) return;
    }

    // Scheduled Jobs routes (for Cloud Scheduler)
    if (pathname.startsWith('/api/jobs')) {
      const handled = await handleScheduledJobsRoutes(req, res, pathname);
      if (handled) return;
    }

    // EvalOps - Quality evaluation system
    if (pathname.startsWith('/api/evalops')) {
      const handled = await handleEvalOpsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Household settings persistence
    if (pathname.startsWith('/api/household')) {
      const handled = await handleHouseholdRoutes(req, res, pathname);
      if (handled) return;
    }

    // Story journey persistence
    if (pathname.startsWith('/api/story-journey')) {
      const handled = await handleStoryJourneyRoutes(req, res, pathname);
      if (handled) return;
    }

    // User Analytics routes (DAU/WAU/MAU, sessions, concurrent users)
    if (pathname.startsWith('/api/analytics')) {
      const handled = await handleAnalyticsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Builder Metrics routes (admin/monitoring - context builder performance)
    if (pathname.startsWith('/api/admin/builder-metrics')) {
      const handled = await handleBuilderMetricsRoutes(req, res, pathname);
      if (handled) return;
    }

    // Subscription routes (Stripe checkout, billing portal, usage tracking)
    if (isSubscriptionRoute(pathname)) {
      try {
        // Parse body for POST requests
        let body = undefined;
        let rawBody = undefined;

        if (req.method === 'POST' || req.method === 'PUT') {
          // Collect raw body first
          const chunks = [];
          await new Promise((resolve) => {
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', resolve);
          });
          rawBody = Buffer.concat(chunks).toString('utf8');

          // For webhook routes, keep raw body for signature verification
          // For other routes, parse as JSON
          const isWebhook = pathname.endsWith('/webhook');
          if (isWebhook) {
            body = rawBody; // Keep raw for Stripe signature verification
          } else {
            try {
              body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              body = rawBody; // Fallback to raw if not valid JSON
            }
          }
        }

        // Build request context
        const ctx = {
          method: req.method,
          pathname,
          query: Object.fromEntries(parsedUrl.searchParams),
          body,
          headers: req.headers,
        };

        // Handle the request
        const response = await handleSubscriptionRequest(ctx);

        // Send response
        res.writeHead(response.status, response.headers);
        res.end(JSON.stringify(response.body));
        return;
      } catch (err) {
        console.error('❌ Subscription route error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }
    }

    // Monetization routes (tip jar, value capture, ferni fund, B2B, partnerships)
    if (isMonetizationRoute(pathname)) {
      try {
        // Parse body for POST requests
        let body = undefined;

        if (req.method === 'POST' || req.method === 'PUT') {
          const chunks = [];
          await new Promise((resolve) => {
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', resolve);
          });
          const rawBody = Buffer.concat(chunks).toString('utf8');
          try {
            body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            body = {};
          }
        }

        // Build request context
        const ctx = {
          method: req.method,
          pathname,
          query: Object.fromEntries(parsedUrl.searchParams),
          body,
          headers: req.headers,
        };

        // Handle the request
        const response = await handleMonetizationRequest(ctx);

        // Send response
        res.writeHead(response.status, response.headers);
        res.end(JSON.stringify(response.body));
        return;
      } catch (err) {
        console.error('❌ Monetization route error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }
    }

    // Apple In-App Purchase routes (iOS subscriptions)
    if (isAppleRoute(pathname)) {
      try {
        const handled = await handleAppleRoutes(req, res);
        if (handled) return;
      } catch (err) {
        console.error('❌ Apple IAP route error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }
    }
  } catch (err) {
    console.error('❌ API route error:', err);
  }

  // Health check endpoint
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ status: 'ok', service: 'ferni-ui', timestamp: new Date().toISOString() })
    );
    return;
  }

  // ============================================================================
  // MEMORY SYSTEM HEALTH ENDPOINT
  // ============================================================================
  if (pathname === '/api/memory/health') {
    try {
      const {
        getMemoryMetricsCollector,
        getMemoryDecayManager,
        getMemoryConsolidator,
        getMemoryDeduplicator,
      } = await import('./dist/memory/index.js');

      const metrics = getMemoryMetricsCollector();
      const decayManager = getMemoryDecayManager();
      const consolidator = getMemoryConsolidator();
      const deduplicator = getMemoryDeduplicator();

      // Collect health data from all memory subsystems
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        subsystems: {
          metrics: {
            status: metrics ? 'active' : 'inactive',
            // Safely access metrics if available
            stats: metrics
              ? {
                  // Get summary stats if metrics module exposes them
                  description: 'Memory metrics collector',
                }
              : null,
          },
          decay: {
            status: decayManager ? 'active' : 'inactive',
            description: 'Applies graceful forgetting to old memories',
          },
          consolidation: {
            status: consolidator ? 'active' : 'inactive',
            description: 'Compresses related memories for long-term users',
          },
          deduplication: {
            status: deduplicator ? 'active' : 'inactive',
            description: 'Removes redundant memories to optimize storage',
          },
        },
        features: {
          sessionPriming: true,
          humanSignalExtraction: true,
          memoryIndexWarming: true,
          crossPersonaHandoff: true,
          advancedRetrieval: true,
        },
        alerts: [],
      };

      // Add alerts for inactive subsystems
      if (!metrics)
        health.alerts.push({ level: 'warn', message: 'Memory metrics not initialized' });
      if (!decayManager)
        health.alerts.push({ level: 'warn', message: 'Memory decay manager not initialized' });
      if (!consolidator)
        health.alerts.push({ level: 'warn', message: 'Memory consolidator not initialized' });
      if (!deduplicator)
        health.alerts.push({ level: 'warn', message: 'Memory deduplicator not initialized' });

      // Set overall status based on alerts
      if (health.alerts.some((a) => a.level === 'error')) {
        health.status = 'error';
      } else if (health.alerts.length > 0) {
        health.status = 'degraded';
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } catch (err) {
      console.error('❌ Memory health check error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: err.message,
          alerts: [{ level: 'error', message: `Memory system error: ${err.message}` }],
        })
      );
    }
    return;
  }

  // Comprehensive health dashboard endpoint
  if (pathname === '/health/dashboard') {
    // NOTE: CORS already set at top of handler via getCorsOrigin()

    const dashboard = {
      status: 'ok',
      service: 'ferni-ui',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node: process.version,
      checks: {
        livekit: {
          configured: !!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
          url: LIVEKIT_URL ? LIVEKIT_URL.replace(/\/\/.*@/, '//***@') : null, // Mask creds
        },
        plaid: {
          configured: !!(PLAID_CLIENT_ID && PLAID_SECRET),
          environment: PLAID_ENV,
        },
        spotify: {
          configured: !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET),
          hasRefreshToken: !!getSpotifyRefreshToken(),
          hasWebDevice: !!spotifyWebDeviceId,
        },
        firebase: {
          projectId: process.env.GCP_PROJECT_ID || null,
        },
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: PORT,
        version: process.env.npm_package_version || 'unknown',
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dashboard, null, 2));
    return;
  }

  // Circuit Breaker Health Dashboard - Self-healing monitoring
  if (pathname === '/health/circuits' || pathname === '/api/diagnostics/circuits') {
    try {
      // Dynamic import of self-healing module
      const { getAllClientStats, getAllCircuitStats, getUnhealthyClients } =
        await import('./dist/services/self-healing/index.js');

      const httpClients = getAllClientStats();
      const circuits = getAllCircuitStats();
      const unhealthyClients = getUnhealthyClients();

      const circuitHealth = {
        status: unhealthyClients.length === 0 ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        summary: {
          totalClients: httpClients.length,
          healthyClients: httpClients.filter((c) => c.state === 'closed').length,
          openCircuits: httpClients.filter((c) => c.state === 'open').length,
          halfOpenCircuits: httpClients.filter((c) => c.state === 'half_open').length,
        },
        unhealthyServices: unhealthyClients,
        httpClients: httpClients.map((client) => ({
          name: client.name,
          state: client.state,
          failures: client.failures,
          successes: client.successes,
          totalRequests: client.totalRequests,
          totalFailures: client.totalFailures,
          totalSuccesses: client.totalSuccesses,
          successRate:
            client.totalRequests > 0
              ? ((client.totalSuccesses / client.totalRequests) * 100).toFixed(1) + '%'
              : 'N/A',
          lastStateChange: new Date(client.lastStateChange).toISOString(),
        })),
        allCircuits: circuits.map((circuit) => ({
          name: circuit.name,
          state: circuit.state,
          failures: circuit.failures,
          successes: circuit.successes,
          totalRequests: circuit.totalRequests,
          successRate:
            circuit.totalRequests > 0
              ? ((circuit.totalSuccesses / circuit.totalRequests) * 100).toFixed(1) + '%'
              : 'N/A',
        })),
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(circuitHealth, null, 2));
    } catch (error) {
      // Self-healing module not available yet
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'unavailable',
          message: 'Self-healing module not loaded yet',
          timestamp: new Date().toISOString(),
        })
      );
    }
    return;
  }

  // LiveKit URL endpoint
  if (pathname === '/token-url') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: LIVEKIT_URL }));
    return;
  }

  // ============================================================================
  // PLAID ROUTES
  // ============================================================================

  // Serve Plaid Link page
  if (pathname === '/link-account') {
    serveStaticFile('plaid-link.html', res, req);
    return;
  }

  // Exchange Plaid public token for access token
  if (pathname === '/plaid/exchange' && req.method === 'POST') {
    // Rate limit: 5 exchanges per minute per IP (financial operation)
    if (rateLimit(req, res, { maxRequests: 5, windowMs: 60000 })) {
      return; // Rate limited
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { public_token, user_id, institution, accounts } = JSON.parse(body);

        if (!public_token || !user_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing public_token or user_id' }));
          return;
        }

        if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Plaid not configured' }));
          return;
        }

        // Exchange public token for access token
        const exchangeResponse = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            public_token,
          }),
        });

        if (!exchangeResponse.ok) {
          const error = await exchangeResponse.json();
          console.error('❌ Plaid exchange error:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.error_message || 'Token exchange failed' }));
          return;
        }

        const { access_token, item_id } = await exchangeResponse.json();

        // Store the access token for this user
        storePlaidToken(user_id, access_token, item_id, institution);

        console.log(`✅ Plaid account linked for user: ${user_id}`);
        console.log(`   Institution: ${institution?.name || 'Unknown'}`);
        console.log(`   Accounts: ${accounts?.length || 0}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            institution: institution?.name,
            accounts_linked: accounts?.length || 0,
          })
        );
      } catch (err) {
        console.error('❌ Plaid exchange error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  // Check if user has Plaid linked
  if (pathname === '/plaid/status') {
    const user_id = parsedUrl.searchParams.get('user_id');

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing user_id' }));
      return;
    }

    const tokenData = getPlaidToken(user_id);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        linked: !!tokenData,
        institution: tokenData?.institution?.name,
        linked_at: tokenData?.linked_at,
      })
    );
    return;
  }

  // ============================================================================
  // SPOTIFY ROUTES - Web Playback SDK support
  // ============================================================================

  // Get Spotify access token for Web Playback SDK
  if (pathname === '/spotify/token') {
    const forceRefresh = parsedUrl.searchParams.get('force') === '1';
    console.log('🎵 /spotify/token requested', forceRefresh ? '(force refresh)' : '');
    const refreshToken = getSpotifyRefreshToken();

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !refreshToken) {
      console.error('❌ Spotify not configured:', {
        hasClientId: !!SPOTIFY_CLIENT_ID,
        hasClientSecret: !!SPOTIFY_CLIENT_SECRET,
        hasRefreshToken: !!refreshToken,
      });
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Spotify not configured',
          help: 'Run: node scripts/spotify-auth.js',
        })
      );
      return;
    }

    // Get scope from tokens file
    let tokenScope = '';
    try {
      if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
        const existing = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8'));
        tokenScope = existing.scope || '';
      }
    } catch {}

    // Return cached token if still valid (unless force refresh)
    if (!forceRefresh && spotifyAccessToken && Date.now() < spotifyTokenExpiry - 60000) {
      console.log(
        '🎵 Returning cached token (valid for',
        Math.round((spotifyTokenExpiry - Date.now()) / 60000),
        'min)'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: spotifyAccessToken,
          scope: tokenScope,
          expires_in: Math.round((spotifyTokenExpiry - Date.now()) / 1000),
        })
      );
      return;
    }

    // Refresh the token
    console.log('🎵 Refreshing Spotify token...');
    try {
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('❌ Spotify API error:', tokenResponse.status, errorText);
        throw new Error(`Spotify token refresh failed: ${tokenResponse.status} - ${errorText}`);
      }

      const data = await tokenResponse.json();
      spotifyAccessToken = data.access_token;
      spotifyTokenExpiry = Date.now() + data.expires_in * 1000;

      // Scope comes from the refresh response or keep existing
      const newScope = data.scope || tokenScope;

      // Save updated tokens (Spotify may return new refresh token)
      saveSpotifyTokens(
        data.access_token,
        data.refresh_token || refreshToken,
        data.expires_in,
        newScope
      );

      console.log('🎵 Spotify token refreshed successfully');
      console.log('   Scope:', newScope || '(none)');
      console.log('   Expires in:', Math.round(data.expires_in / 60), 'minutes');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: spotifyAccessToken,
          scope: newScope,
          expires_in: data.expires_in,
        })
      );
    } catch (err) {
      console.error('❌ Spotify token error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to get Spotify token',
          message: err.message,
          help: 'Your refresh token may have expired. Run: node scripts/spotify-auth.js',
        })
      );
    }
    return;
  }

  // Register Web Playback SDK device
  if (pathname === '/spotify/device' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { device_id } = JSON.parse(body);
        spotifyWebDeviceId = device_id;
        console.log(`🎵 Spotify Web Player device registered: ${device_id}`);

        // Write to a file so the agent can read it
        const deviceFile = path.join(process.cwd(), '.spotify-device.json');
        fs.writeFileSync(
          deviceFile,
          JSON.stringify({ device_id, registered_at: new Date().toISOString() })
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, device_id }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // Get current Spotify device (for agent to use)
  if (pathname === '/spotify/device' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        device_id: spotifyWebDeviceId,
        has_device: !!spotifyWebDeviceId,
      })
    );
    return;
  }

  // Check Spotify link status
  if (pathname === '/spotify/status') {
    const refreshToken = getSpotifyRefreshToken();
    const isConfigured = !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
    const isLinked = !!(refreshToken && isConfigured);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        linked: isLinked,
        configured: isConfigured,
        hasRefreshToken: !!refreshToken,
        hasWebDevice: !!spotifyWebDeviceId,
        deviceId: spotifyWebDeviceId,
      })
    );
    return;
  }

  // ============================================================================
  // GOOGLE CALENDAR OAUTH ROUTES
  // ============================================================================

  // Start Google Calendar OAuth flow
  if (pathname === '/auth/google/login') {
    const userId = parsedUrl.searchParams.get('user_id');
    const returnUrl = parsedUrl.searchParams.get('return_url');

    if (!GOOGLE_CALENDAR_CLIENT_ID || !GOOGLE_CALENDAR_CLIENT_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Google Calendar OAuth not configured',
          message: 'Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET',
        })
      );
      return;
    }

    // Generate state for CSRF protection (using DDoS-protected state manager)
    const state = googleOAuthStates.create({
      user_id: userId || 'anonymous',
      return_url: returnUrl || '/',
    });

    if (!state) {
      console.error('❌ Google Calendar OAuth: State limit reached (possible attack)');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service temporarily unavailable, try again' }));
      return;
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CALENDAR_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_CALENDAR_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    console.log(`📅 Google Calendar OAuth: Redirecting user ${userId} to Google`);
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // Google Calendar OAuth callback
  if (pathname === '/auth/google/callback') {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      console.error(`❌ Google Calendar OAuth error: ${error}`);
      res.writeHead(302, { Location: '/?calendar_error=' + encodeURIComponent(error) });
      res.end();
      return;
    }

    // Verify state (one-time use - automatically deleted on consume)
    const stateData = googleOAuthStates.consume(state);
    if (!stateData) {
      console.error('❌ Google Calendar OAuth: Invalid or expired state');
      res.writeHead(302, { Location: '/?calendar_error=invalid_state' });
      res.end();
      return;
    }

    try {
      // Exchange code for tokens
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CALENDAR_CLIENT_ID,
          client_secret: GOOGLE_CALENDAR_CLIENT_SECRET,
          redirect_uri: GOOGLE_CALENDAR_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Google Calendar token exchange failed: ${errorText}`);
        res.writeHead(302, { Location: '/?calendar_error=token_exchange_failed' });
        res.end();
        return;
      }

      const tokens = await response.json();

      // Save tokens for this user
      saveGoogleCalendarUserTokens(stateData.user_id, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
        scope: tokens.scope,
      });

      console.log(`✅ Google Calendar linked for user ${stateData.user_id}`);

      // Redirect back to app
      const returnUrl = stateData.return_url || '/?calendar_linked=true';
      res.writeHead(302, { Location: returnUrl });
      res.end();
    } catch (err) {
      console.error('❌ Google Calendar OAuth callback error:', err);
      res.writeHead(302, { Location: '/?calendar_error=callback_failed' });
      res.end();
    }
    return;
  }

  // Get Google Calendar access token for a user
  if (pathname === '/auth/google/token') {
    const userId = parsedUrl.searchParams.get('user_id');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return;
    }

    const accessToken = await getValidGoogleCalendarToken(userId);
    if (!accessToken) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          linked: false,
          error: 'Google Calendar not linked for this user',
          login_url: `/auth/google/login?user_id=${encodeURIComponent(userId)}`,
        })
      );
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        linked: true,
        access_token: accessToken,
      })
    );
    return;
  }

  // Check Google Calendar link status
  if (pathname === '/auth/google/status') {
    const userId = parsedUrl.searchParams.get('user_id');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return;
    }

    const userTokens = getGoogleCalendarUserTokens(userId);
    const googleConfigured = !!(GOOGLE_CALENDAR_CLIENT_ID && GOOGLE_CALENDAR_CLIENT_SECRET);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        google_calendar_configured: googleConfigured,
        linked: !!userTokens,
        expires_at: userTokens?.expires_at || null,
        login_url: googleConfigured
          ? `/auth/google/login?user_id=${encodeURIComponent(userId)}`
          : null,
      })
    );
    return;
  }

  // Unlink Google Calendar for a user
  if (pathname === '/auth/google/unlink') {
    const userId = parsedUrl.searchParams.get('user_id');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return;
    }

    removeGoogleCalendarUserTokens(userId);
    console.log(`📅 Google Calendar unlinked for user ${userId}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Google Calendar unlinked' }));
    return;
  }

  // ============================================================================
  // MUSIC STATUS API - For dev panel diagnostics
  // ============================================================================

  // Music player status - returns info about music system readiness
  // Note: The actual music player runs in the voice agent, not UI server
  // This provides what we can check from UI server (Spotify, iTunes availability)
  if (pathname === '/api/music/status' && method === 'GET') {
    const refreshToken = getSpotifyRefreshToken();
    const isSpotifyConfigured = !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
    const isSpotifyLinked = !!(refreshToken && isSpotifyConfigured);

    // Check iTunes API availability
    let itunesAvailable = false;
    try {
      const itunesCheck = await fetch(
        'https://itunes.apple.com/search?term=test&limit=1&media=music',
        { signal: AbortSignal.timeout(3000) }
      );
      itunesAvailable = itunesCheck.ok;
    } catch {
      itunesAvailable = false;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        // Note: Music player runs in voice agent, not UI server
        // These are the checks we can do from here
        initialized: false, // Can only check in voice agent
        isPlaying: false,
        currentTrack: null,
        volume: 0.25,
        isDucked: false,
        isAmbient: false,
        queueLength: 0,
        itunesAvailable,
        spotifyStatus: {
          configured: isSpotifyConfigured,
          linked: isSpotifyLinked,
          accessToken: false, // Would need to try refresh to check
          deviceConnected: !!spotifyWebDeviceId,
        },
        note: 'Music player runs in voice agent. This shows API availability only.',
      })
    );
    return;
  }

  // Test iTunes API - search for a track
  if (pathname === '/api/music/test-itunes' && method === 'POST') {
    try {
      const testQuery = 'Beatles Yesterday';
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(testQuery)}&limit=1&media=music`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) {
        throw new Error(`iTunes API returned ${response.status}`);
      }

      const data = await response.json();
      const track = data.results?.[0];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          track: track
            ? {
                name: track.trackName,
                artist: track.artistName,
                previewUrl: track.previewUrl?.slice(0, 50) + '...',
                hasPreview: !!track.previewUrl,
              }
            : null,
        })
      );
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: err.message,
        })
      );
    }
    return;
  }

  // ============================================================================
  // MARKETPLACE PROXY ROUTES (GitHub private repo access)
  // ============================================================================

  const GITHUB_MARKETPLACE_TOKEN = process.env.GITHUB_MARKETPLACE_TOKEN || '';
  const GITHUB_MARKETPLACE_REPO = 'sethdford/voiceai-agents';
  const MARKETPLACE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  let marketplaceRegistryCache = null;
  let marketplaceRegistryCacheTime = 0;

  // Proxy for marketplace registry (keeps GitHub token server-side)
  // Falls back to local marketplace-agents/ folder if no token is set
  if (pathname === '/api/marketplace/registry') {
    const now = Date.now();

    // Return cache if valid
    if (marketplaceRegistryCache && now - marketplaceRegistryCacheTime < MARKETPLACE_CACHE_TTL) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'X-Cache': 'HIT',
      });
      res.end(JSON.stringify(marketplaceRegistryCache));
      return;
    }

    // If no GitHub token, try to read from local marketplace-agents folder
    if (!GITHUB_MARKETPLACE_TOKEN) {
      try {
        const localRegistryPath = path.join(process.cwd(), 'marketplace-agents', 'registry.json');
        if (fs.existsSync(localRegistryPath)) {
          const localRegistry = JSON.parse(fs.readFileSync(localRegistryPath, 'utf-8'));

          // Cache and return
          marketplaceRegistryCache = localRegistry;
          marketplaceRegistryCacheTime = now;

          console.log(
            `✅ Marketplace: Loaded local registry with ${localRegistry.agents?.length || 0} agents`
          );

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
            'X-Source': 'local',
          });
          res.end(JSON.stringify(localRegistry));
          return;
        }
      } catch (localErr) {
        console.warn('⚠️ Could not read local marketplace registry:', localErr.message);
      }

      // No local file either - return empty registry
      console.warn(
        '⚠️ No GITHUB_MARKETPLACE_TOKEN and no local registry - returning empty marketplace'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          version: '0.0.0',
          updated_at: new Date().toISOString(),
          agents: [],
          categories: [],
        })
      );
      return;
    }

    try {
      const githubResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_MARKETPLACE_REPO}/contents/registry.json`,
        {
          headers: {
            Accept: 'application/vnd.github.raw+json',
            Authorization: `Bearer ${GITHUB_MARKETPLACE_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!githubResponse.ok) {
        throw new Error(`GitHub API error: ${githubResponse.status}`);
      }

      const registryData = await githubResponse.json();

      // Cache the response
      marketplaceRegistryCache = registryData;
      marketplaceRegistryCacheTime = now;

      console.log(
        `✅ Marketplace: Fetched registry with ${registryData.agents?.length || 0} agents`
      );

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'X-Cache': 'MISS',
      });
      res.end(JSON.stringify(registryData));
    } catch (err) {
      console.error('❌ Marketplace proxy error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to fetch marketplace registry',
          message: err.message,
        })
      );
    }
    return;
  }

  // Proxy for individual agent manifests
  // Falls back to local marketplace-agents/ folder if no token is set
  if (pathname.startsWith('/api/marketplace/agents/') && pathname.endsWith('/manifest')) {
    const agentId = pathname.replace('/api/marketplace/agents/', '').replace('/manifest', '');

    // If no GitHub token, try to read from local marketplace-agents folder
    if (!GITHUB_MARKETPLACE_TOKEN) {
      try {
        const localManifestPath = path.join(
          process.cwd(),
          'marketplace-agents',
          'agents',
          agentId,
          'persona.manifest.json'
        );
        if (fs.existsSync(localManifestPath)) {
          const localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf-8'));

          console.log(`✅ Marketplace: Loaded local manifest for ${agentId}`);

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'X-Source': 'local',
          });
          res.end(JSON.stringify(localManifest));
          return;
        }

        // Not found locally
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Agent manifest not found: ${agentId}` }));
        return;
      } catch (localErr) {
        console.warn(`⚠️ Could not read local manifest for ${agentId}:`, localErr.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'Failed to read local manifest', message: localErr.message })
        );
        return;
      }
    }

    try {
      const githubResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_MARKETPLACE_REPO}/contents/agents/${agentId}/persona.manifest.json`,
        {
          headers: {
            Accept: 'application/vnd.github.raw+json',
            Authorization: `Bearer ${GITHUB_MARKETPLACE_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!githubResponse.ok) {
        if (githubResponse.status === 404) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Agent manifest not found: ${agentId}` }));
          return;
        }
        throw new Error(`GitHub API error: ${githubResponse.status}`);
      }

      const manifestData = await githubResponse.json();

      console.log(`✅ Marketplace: Fetched manifest for ${agentId}`);

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      });
      res.end(JSON.stringify(manifestData));
    } catch (err) {
      console.error(`❌ Marketplace manifest proxy error for ${agentId}:`, err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to fetch agent manifest',
          message: err.message,
        })
      );
    }
    return;
  }

  // ============================================================================
  // AGENT REGISTRY ROUTES (Dynamic agent discovery)
  // ============================================================================

  // Get all available agents (for dynamic UI rendering)
  if (pathname === '/api/agents') {
    try {
      // Dynamic import to use ES modules
      const { AgentRegistry } = await import('./dist/personas/registry/unified-registry.js');
      let agents = await AgentRegistry.getEnabledAgents();

      // Load disabled agents from config
      const configPath = path.join(process.cwd(), 'data', 'agent-config.json');
      let disabledAgents = [];
      try {
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          disabledAgents = config.disabledAgents || [];
        }
      } catch (configErr) {
        console.warn('Could not read agent config:', configErr.message);
      }

      // Filter out disabled agents (but never disable the coordinator)
      if (disabledAgents.length > 0) {
        agents = agents.filter((a) => a.isCoordinator || !disabledAgents.includes(a.id));
      }

      // Transform agents for UI consumption
      const uiAgents = agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        initials: agent.ui.initials,
        subtitle: agent.ui.subtitle,
        role: agent.role,
        roleId: agent.roleId,
        isCoordinator: agent.isCoordinator,
        canHandoff: agent.canHandoff,
        handoffToolName: agent.handoffToolName,
        entrancePhrase: agent.ui.entrancePhrase,
        themeClass: agent.ui.themeClass,
        // Include voice for reference (not used directly in UI)
        voiceId: agent.voiceId,
        // Include colors if available in manifest marketplace
        colors: agent.manifest.marketplace?.colors || null,
      }));

      // Sort: coordinator (Ferni) first, then alphabetically by name
      // Check both isCoordinator flag AND id='ferni' for robustness
      uiAgents.sort((a, b) => {
        const aIsCoordinator = a.isCoordinator || a.id === 'ferni';
        const bIsCoordinator = b.isCoordinator || b.id === 'ferni';

        if (aIsCoordinator && !bIsCoordinator) return -1;
        if (!aIsCoordinator && bIsCoordinator) return 1;
        return a.name.localeCompare(b.name);
      });

      // Build response
      const responseData = {
        agents: uiAgents,
        count: uiAgents.length,
        timestamp: new Date().toISOString(),
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      });
      res.end(JSON.stringify(responseData));
    } catch (err) {
      console.error('❌ Failed to get agents:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to load agents',
          message: err.message,
          // Provide fallback agent IDs for graceful degradation (canonical IDs)
          fallback: [
            'ferni',
            'peter-john',
            'alex-chen',
            'maya-santos',
            'jordan-taylor',
            'nayan-patel',
          ],
        })
      );
    }
    return;
  }

  // GET /api/agents/config - Get agent configuration (disabled agents list)
  // Must come BEFORE the single agent route to not be caught by it
  if (pathname === '/api/agents/config' && req.method === 'GET') {
    try {
      const configPath = path.join(process.cwd(), 'data', 'agent-config.json');
      let config = { disabledAgents: [] };

      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          disabledAgents: config.disabledAgents || [],
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err) {
      console.error('❌ Failed to read agent config:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read config', message: err.message }));
    }
    return;
  }

  // Get a single agent by ID/alias (excludes special paths like /config, /validate)
  if (
    pathname.startsWith('/api/agents/') &&
    req.method === 'GET' &&
    !pathname.includes('/config') &&
    !pathname.includes('/validate')
  ) {
    const agentId = pathname.replace('/api/agents/', '');

    try {
      const { AgentRegistry } = await import('./dist/personas/registry/unified-registry.js');
      const agent = await AgentRegistry.getAgentOrNull(agentId);

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Agent not found: ${agentId}` }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: agent.id,
          name: agent.name,
          initials: agent.ui.initials,
          subtitle: agent.ui.subtitle,
          role: agent.role,
          roleId: agent.roleId,
          isCoordinator: agent.isCoordinator,
          canHandoff: agent.canHandoff,
          handoffToolName: agent.handoffToolName,
          entrancePhrase: agent.ui.entrancePhrase,
          themeClass: agent.ui.themeClass,
          voiceId: agent.voiceId,
          aliases: agent.aliases,
          handoffTriggers: agent.handoffTriggers,
          colors: agent.manifest.marketplace?.colors || null,
        })
      );
    } catch (err) {
      console.error('❌ Failed to get agent:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load agent', message: err.message }));
    }
    return;
  }

  // ============================================================================
  // ADMIN API ROUTES
  // ============================================================================

  // Helper to parse JSON body
  const parseJsonBody = (req) =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    });

  // POST /api/agents/:id/enable - Enable or disable an agent
  // Persists to data/agent-config.json for production use
  if (pathname.match(/^\/api\/agents\/[^/]+\/enable$/) && req.method === 'POST') {
    // Rate limit: 10 enable/disable per minute per IP
    if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
      return; // Rate limited
    }

    const agentId = pathname.split('/')[3];

    try {
      const { enabled } = await parseJsonBody(req);

      // Persist to config file
      const configPath = path.join(process.cwd(), 'data', 'agent-config.json');
      let config = { disabledAgents: [] };

      // Load existing config
      try {
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
      } catch (readErr) {
        console.warn('Could not read agent config, creating new one');
      }

      // Ensure array exists
      if (!Array.isArray(config.disabledAgents)) {
        config.disabledAgents = [];
      }

      // Update disabled agents list
      if (enabled) {
        // Remove from disabled list
        config.disabledAgents = config.disabledAgents.filter((id) => id !== agentId);
      } else {
        // Add to disabled list (if not already there)
        if (!config.disabledAgents.includes(agentId)) {
          config.disabledAgents.push(agentId);
        }
      }

      // Save config
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log(
        `${enabled ? '✅ Enabling' : '❌ Disabling'} agent: ${agentId} (persisted to ${configPath})`
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          agentId,
          enabled,
          message: `Agent ${agentId} ${enabled ? 'enabled' : 'disabled'}`,
          persisted: true,
        })
      );
    } catch (err) {
      console.error('❌ Failed to update agent status:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update agent', message: err.message }));
    }
    return;
  }

  // PUT /api/agents/:id - Update agent settings (colors, subtitle, etc.)
  if (
    pathname.match(/^\/api\/agents\/[^/]+$/) &&
    !pathname.includes('/enable') &&
    req.method === 'PUT'
  ) {
    const agentId = pathname.split('/')[3];

    try {
      const updates = await parseJsonBody(req);

      console.log(`📝 Updating agent ${agentId}:`, updates);

      // In production, this would update the bundle's persona.manifest.json
      // For now, we log the update and acknowledge it

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          agentId,
          updates,
          message: 'Agent settings updated (note: restart required for full effect)',
        })
      );
    } catch (err) {
      console.error('❌ Failed to update agent:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update agent', message: err.message }));
    }
    return;
  }

  // POST /api/team/order - Update team roster order
  if (pathname === '/api/team/order' && req.method === 'POST') {
    try {
      const { order } = await parseJsonBody(req);

      if (!Array.isArray(order)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'order must be an array of agent IDs' }));
        return;
      }

      console.log(`📋 Updating team order:`, order);

      // In production, this would update team-config.ts or a database
      // For now, we acknowledge the request

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          order,
          message: 'Team order updated',
        })
      );
    } catch (err) {
      console.error('❌ Failed to update team order:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update team order', message: err.message }));
    }
    return;
  }

  // POST /api/agents/validate - Validate all agent bundles (ADMIN ONLY)
  if (pathname === '/api/agents/validate' && req.method === 'POST') {
    // SECURITY: This endpoint runs shell commands - require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return; // 401/403 already sent

    try {
      const { execSync } = await import('child_process');

      // Run the CLI validation command
      const output = execSync('npm run agents validate', {
        encoding: 'utf-8',
        timeout: 30000,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          output,
          message: 'Validation complete',
        })
      );
    } catch (err) {
      console.error('❌ Validation failed:', err);
      res.writeHead(200, { 'Content-Type': 'application/json' }); // Still 200, validation ran
      res.end(
        JSON.stringify({
          success: false,
          output: err.stdout || err.message,
          errors: err.stderr,
          message: 'Validation found issues',
        })
      );
    }
    return;
  }

  // GET /api/voice/preview/:voiceId - Get voice preview URL
  if (pathname.match(/^\/api\/voice\/preview\//) && req.method === 'GET') {
    const voiceId = pathname.split('/')[4];

    // Return Cartesia playground URL for voice preview
    const previewUrl = `https://play.cartesia.ai/voice/${voiceId}`;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        voiceId,
        previewUrl,
        message: 'Use Cartesia playground to preview this voice',
      })
    );
    return;
  }

  // ============================================================================
  // TOOLS ANALYTICS API
  // ============================================================================

  // GET /api/tools/analytics - Dashboard data for tool analytics (ADMIN ONLY)
  if (pathname === '/api/tools/analytics' && req.method === 'GET') {
    // SECURITY: Internal analytics data - require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return; // 401/403 already sent

    try {
      // Dynamic import of the optimization API
      const { getDashboardData } = await import('./dist/services/optimization-api.js');
      const data = await getDashboardData();

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30',
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('❌ Failed to get tools analytics:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to get analytics',
          message: err.message,
        })
      );
    }
    return;
  }

  // POST /api/tools/optimize - Trigger optimization cycle (ADMIN ONLY)
  if (pathname === '/api/tools/optimize' && req.method === 'POST') {
    // SECURITY: Expensive operation - require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return; // 401/403 already sent

    // Rate limit: 2 optimizations per minute per IP (expensive operation)
    if (rateLimit(req, res, { maxRequests: 2, windowMs: 60000 })) {
      return; // Rate limited
    }

    try {
      const { triggerOptimizationCycle } = await import('./dist/services/optimization-api.js');
      const result = await triggerOptimizationCycle();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('❌ Failed to trigger optimization:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ============================================================================
  // PUSH NOTIFICATIONS API
  // ============================================================================

  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

  // In-memory push subscription storage (production would use database)
  if (!global.pushSubscriptions) {
    global.pushSubscriptions = new Map();
  }

  // GET /api/push/vapid-key - Get VAPID public key for web push
  if (pathname === '/api/push/vapid-key' && req.method === 'GET') {
    if (!VAPID_PUBLIC_KEY) {
      console.warn('⚠️ VAPID_PUBLIC_KEY not set - push notifications unavailable');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Push notifications not configured',
          message:
            'VAPID_PUBLIC_KEY environment variable not set. Run: node scripts/generate-vapid-keys.js',
        })
      );
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        publicKey: VAPID_PUBLIC_KEY,
      })
    );
    return;
  }

  // POST /api/push/subscribe - Register push subscription
  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const subscription = JSON.parse(body);

        if (!subscription.endpoint || !subscription.keys) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid subscription format' }));
          return;
        }

        // Store subscription (in production, this would go to database)
        const userId = subscription.userId || 'anonymous';
        const userSubs = global.pushSubscriptions.get(userId) || [];

        // Avoid duplicates
        const exists = userSubs.some((s) => s.endpoint === subscription.endpoint);
        if (!exists) {
          userSubs.push({
            ...subscription,
            createdAt: new Date().toISOString(),
          });
          global.pushSubscriptions.set(userId, userSubs);
          console.log(`🔔 Push subscription registered for user: ${userId}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('❌ Failed to register push subscription:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to register subscription' }));
      }
    });
    return;
  }

  // POST /api/push/unsubscribe - Remove push subscription
  if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { endpoint, userId } = JSON.parse(body);
        const userSubs = global.pushSubscriptions.get(userId || 'anonymous') || [];
        const filtered = userSubs.filter((s) => s.endpoint !== endpoint);

        if (filtered.length > 0) {
          global.pushSubscriptions.set(userId || 'anonymous', filtered);
        } else {
          global.pushSubscriptions.delete(userId || 'anonymous');
        }

        console.log(`🔕 Push subscription removed for user: ${userId || 'anonymous'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to unsubscribe' }));
      }
    });
    return;
  }

  // POST /api/push/send - Send a push notification (ADMIN ONLY)
  if (pathname === '/api/push/send' && req.method === 'POST') {
    // SECURITY: Sending notifications to users - require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return; // 401/403 already sent

    // Rate limit: 10 notifications per minute per IP (prevents spam)
    if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
      return; // Rate limited
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { userId, title, body: notificationBody, type } = JSON.parse(body);

        // Try to use backend service if available
        try {
          const { getPushNotificationsService } =
            await import('./dist/services/push-notifications.js');
          const service = getPushNotificationsService();
          const success = await service.sendNotification(userId || 'anonymous', {
            title: title || 'Test Notification',
            body: notificationBody || 'This is a test notification',
            type: type || 'general',
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success,
              message: success ? 'Notification sent' : 'No subscriptions found',
            })
          );
        } catch (err) {
          // Service not available, return placeholder response
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              message: 'Push notification service not available (web-push module not installed)',
            })
          );
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to send notification' }));
      }
    });
    return;
  }

  // ============================================================================
  // LIVEKIT ROUTES
  // ============================================================================

  // Demo status endpoint - proactive check before starting session
  // Returns session availability so frontend can show warm, brand-aligned messaging
  if (pathname === '/demo-status') {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket.remoteAddress ||
      'unknown';

    const status = getDemoStatus(ip);

    // Add CORS headers for cross-origin requests from landing page
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  // ============================================================================
  // DEMO SESSION CLAIM & UPDATE ENDPOINTS
  // "Better than human" - Remember conversations before formal introduction
  // ============================================================================

  // POST /demo-claim - Claim a demo session for a Firebase user
  // Called when a demo user creates an account to migrate their conversation
  if (pathname === '/demo-claim' && req.method === 'POST') {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { claim_token, firebase_uid } = data;

        if (!claim_token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing claim_token' }));
          return;
        }

        // Try to get Firebase UID from Authorization header if not in body
        let firebaseUid = firebase_uid;
        const authHeader = req.headers['authorization'];
        if (!firebaseUid && authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const { verifyFirebaseToken } = await import('./dist/services/firebase-auth.js');
            const verified = await verifyFirebaseToken(authHeader.slice(7));
            if (verified) {
              firebaseUid = verified.uid;
            }
          } catch (authErr) {
            console.log('Auth verification failed:', authErr.message);
          }
        }

        if (!firebaseUid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Authentication required to claim demo session' }));
          return;
        }

        const result = claimDemoSession(claim_token, firebaseUid);

        if (!result.success) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }

        // Return the conversation data for migration
        const session = result.session;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          already_claimed: result.alreadyClaimed || false,
          conversation: {
            highlights: session.conversation.highlights,
            topics: session.conversation.topics,
            user_mood: session.conversation.userMood,
            ferni_notes: session.conversation.ferniNotes,
            message_count: session.conversation.messages?.length || 0,
          },
          metadata: {
            accent: session.metadata.accent,
            created_at: session.createdAt,
          },
        }));
      } catch (err) {
        console.error('Demo claim error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to claim demo session' }));
      }
    });
    return;
  }

  // Handle OPTIONS preflight for demo-claim
  if (pathname === '/demo-claim' && req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /demo-session-update - Update demo session with conversation data
  // Called by voice agent when conversation ends or when user wants to save
  if (pathname === '/demo-session-update' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { room_name, conversation } = data;

        if (!room_name || !conversation) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing room_name or conversation data' }));
          return;
        }

        const success = updateDemoSessionConversation(room_name, conversation);

        if (!success) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Demo session not found' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Demo session update error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update demo session' }));
      }
    });
    return;
  }

  // Demo token endpoint - for landing page try-without-signup
  if (pathname === '/demo-token') {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket.remoteAddress ||
      'unknown';

    const rateCheck = checkDemoAllowed(ip);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: rateCheck.reason,
          message: rateCheck.message,
        })
      );
      return;
    }

    try {
      const demoId = `demo-${crypto.randomBytes(8).toString('hex')}`;
      const roomName = `demo-${crypto.randomBytes(12).toString('hex')}`;
      const username = 'Visitor';

      const token = await createToken(roomName, username);

      // 🌍 INTERNATIONAL ACCENT SUPPORT
      // Detect user's accent from HTTP headers for demo users too!
      let geoData = {
        locale: 'en-US',
        locales: ['en-US'],
        detectedAccent: 'american',
        countryCode: undefined,
      };

      try {
        const { detectGeoFromRequest } = await import('./dist/services/geo-detection.js');
        // Enable IP geolocation for more accurate accent detection
        // Uses ip-api.com with 2s timeout (free tier, no API key needed)
        const geo = await detectGeoFromRequest(req, {
          enableIpLookup: true,
          ipLookupTimeout: 2000,
        });
        geoData = {
          locale: geo.primaryLanguage || 'en-US',
          locales: geo.languages.length > 0 ? geo.languages : ['en-US'],
          detectedAccent: geo.accent,
          countryCode: geo.countryCode,
        };
        console.log(
          `🌍 Demo geo detected: ${geoData.detectedAccent} accent from ${geo.countryCode || 'unknown'} (source: ${geo.source})`
        );
      } catch (geoErr) {
        // Geo detection is optional - continue without it
        console.log('🌍 Geo detection skipped:', geoErr.message);
      }

      // Dispatch agent with demo metadata
      // 🌍 Now includes accent detection data!
      try {
        await agentDispatch.createDispatch(roomName, AGENT_NAME, {
          metadata: JSON.stringify({
            user_name: username,
            device_id: demoId,
            persona_id: 'ferni',
            is_demo: true,
            source: 'landing_page',
            // 🌍 International accent support
            locale: geoData.locale,
            locales: geoData.locales,
            preferredAccent: geoData.detectedAccent,
            countryCode: geoData.countryCode,
          }),
        });
        console.log(
          `🎯 Demo session created: ${roomName} (IP: ${ip.substring(0, 10)}..., accent: ${geoData.detectedAccent})`
        );
      } catch (dispatchError) {
        console.log(`ℹ️ Demo dispatch note: ${dispatchError.message}`);
      }

      recordDemoSession(ip);

      // 🎯 Create claimable demo session for "better than human" experience
      // This allows the user to claim their conversation when they create an account
      const demoSession = createDemoSession(roomName, demoId, {
        accent: geoData.detectedAccent,
        countryCode: geoData.countryCode,
        ip: ip.substring(0, 10), // Partial IP for matching (privacy-conscious)
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          token,
          url: LIVEKIT_URL,
          room: roomName,
          username,
          persona_id: 'ferni',
          is_demo: true,
          session_duration_minutes: DEMO_CONFIG.sessionDurationMinutes,
          sessions_remaining: rateCheck.sessionsRemaining - 1,
          upgrade_url: 'https://app.ferni.ai',
          // 🌍 Include accent info in response
          accent: geoData.detectedAccent,
          countryCode: geoData.countryCode,
          // 🎯 Claim token for "I remember you" experience
          claim_token: demoSession.claimToken,
          claim_expires_at: demoSession.expiresAt,
        })
      );
    } catch (error) {
      console.error('❌ Demo token error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create demo session' }));
    }
    return;
  }

  // Token generation endpoint (authenticated users)
  if (pathname === '/token') {
    // Rate limit: 20 tokens per minute per IP (prevents abuse)
    if (rateLimit(req, res, { maxRequests: 20, windowMs: 60000 })) {
      return; // Rate limited
    }

    const room = parsedUrl.searchParams.get('room');
    const username = parsedUrl.searchParams.get('username');
    const device_id = parsedUrl.searchParams.get('device_id');
    const persona_id = parsedUrl.searchParams.get('persona_id');
    // Allow frontend to override accent detection
    const preferred_accent = parsedUrl.searchParams.get('accent');

    if (!room || !username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Missing required parameters: room and username',
        })
      );
      return;
    }

    // Default to ferni persona if not specified
    const selectedPersona = persona_id || 'ferni';

    // 🔐 FIREBASE AUTH: Try to verify Firebase token for user identification
    // This is the primary user identifier now. Device ID is kept for migration.
    let firebaseUid = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const { verifyFirebaseToken } = await import('./dist/services/firebase-auth.js');
        const firebaseToken = authHeader.slice(7);
        const verified = await verifyFirebaseToken(firebaseToken);
        if (verified) {
          firebaseUid = verified.uid;
          console.log(`🔐 Firebase auth: ${firebaseUid.substring(0, 8)}...`);
        }
      } catch (firebaseErr) {
        // Firebase auth optional - continue with device ID
        console.log(`🔐 Firebase auth note: ${firebaseErr.message}`);
      }
    }

    createToken(room, username)
      .then(async (token) => {
        // 🌍 INTERNATIONAL ACCENT SUPPORT
        // Detect user's accent from HTTP headers (Accept-Language, cloud geo headers)
        let geoData = {
          locale: 'en-US',
          locales: ['en-US'],
          detectedAccent: 'american',
          countryCode: undefined,
          geoSource: 'default',
          geoConfidence: 'low',
        };

        try {
          const { detectGeoFromRequest } = await import('./dist/services/geo-detection.js');
          // Enable IP geolocation for more accurate accent detection
          // Uses ip-api.com with 2s timeout (free tier, no API key needed)
          const geo = await detectGeoFromRequest(req, {
            enableIpLookup: true,
            ipLookupTimeout: 2000,
          });
          geoData = {
            locale: geo.primaryLanguage || 'en-US',
            locales: geo.languages.length > 0 ? geo.languages : ['en-US'],
            detectedAccent: preferred_accent || geo.accent, // Allow frontend override
            countryCode: geo.countryCode,
            geoSource: geo.source,
            geoConfidence: geo.confidence,
          };
          console.log(
            `🌍 Geo detected: ${geoData.detectedAccent} accent from ${geo.countryCode || 'unknown'} (source: ${geoData.geoSource}, confidence: ${geoData.geoConfidence})`
          );
        } catch (geoErr) {
          console.log(`🌍 Geo detection note: ${geoErr.message}`);
        }

        console.log(
          `✅ Generated token for user "${username}" in room "${room}" (persona: ${selectedPersona}, accent: ${geoData.detectedAccent})${firebaseUid ? ` (firebase: ${firebaseUid.substring(0, 8)}...)` : device_id ? ` (device: ${device_id})` : ''}`
        );

        // Dispatch the agent to the room with persona metadata
        // The agent will read persona_id from metadata and load the appropriate persona
        // 🔐 Now includes Firebase UID for user identification!
        // 🌍 Also includes accent detection data!
        try {
          const agentMetadata = {
            user_name: username,
            // 🔐 PRIMARY: Firebase UID (preferred)
            firebase_uid: firebaseUid || undefined,
            // 🔐 FALLBACK: Device ID (for migration period)
            device_id: device_id || undefined,
            persona_id: selectedPersona, // Pass persona selection!
            source: 'web', // Mark as web connection
            // 🌍 International accent support
            locale: geoData.locale,
            locales: geoData.locales,
            preferredAccent: geoData.detectedAccent,
            countryCode: geoData.countryCode,
          };
          await agentDispatch.createDispatch(room, AGENT_NAME, {
            metadata: JSON.stringify(agentMetadata),
          });
          console.log(
            `✅ Dispatched agent "${AGENT_NAME}" to room "${room}" with persona: ${selectedPersona}`,
            agentMetadata
          );
        } catch (dispatchError) {
          // Agent might already be dispatched, or room doesn't exist yet - that's ok
          console.log(`ℹ️ Agent dispatch note: ${dispatchError.message}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            token,
            url: LIVEKIT_URL,
            room,
            username,
            device_id,
            firebase_uid: firebaseUid, // Include in response for frontend
            persona_id: selectedPersona,
            // 🌍 Include accent info in response (for frontend display)
            accent: geoData.detectedAccent,
            countryCode: geoData.countryCode,
          })
        );
      })
      .catch((error) => {
        console.error('❌ Error generating token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to generate token' }));
      });
    return;
  }

  // Serve static files
  if (pathname === '/' || pathname === '') {
    serveStaticFile('index.html', res, req);
    return;
  }

  // Serve admin page (same SPA, JS handles routing)
  if (pathname === '/admin') {
    serveStaticFile('index.html', res, req);
    return;
  }

  // Serve garden payment result pages (SPA handles routing)
  if (pathname === '/garden/success' || pathname === '/garden/cancel') {
    serveStaticFile('index.html', res, req);
    return;
  }

  // Serve developer portal
  if (pathname === '/developers' || pathname === '/dev') {
    const devPortalPath = path.join(process.cwd(), 'docs', 'developer-portal.html');
    if (fs.existsSync(devPortalPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(devPortalPath, 'utf-8'));
      return;
    }
  }

  // Serve other static files
  serveStaticFile(pathname, res, req);
});

// Harden server with DDoS protection (timeouts, connection limits)
hardenServer(server);

// Register DDoS alerting to Slack
registerDDoSAlertCallback(async (details) => {
  await notifyDDoSAlert(details);
});

// Start automatic DDoS monitoring (checks every 30s, alerts to Slack)
const stopDDoSMonitoring = startDDoSMonitoring('ui-server', 30_000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🌐 John Bogle UI Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  📍 Server: http://0.0.0.0:${PORT}`);
  console.log(`  🔗 LiveKit: ${LIVEKIT_URL}`);
  console.log('  🛡️  DDoS Protection: ENABLED (Slack alerts active)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Start Spotify token auto-refresh
  startSpotifyAutoRefresh();
});
