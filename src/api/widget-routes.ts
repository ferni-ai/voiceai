/**
 * Widget API Routes
 *
 * HTTP endpoints for embeddable widget configuration and token generation.
 * Allows third-party websites to embed a Ferni voice agent.
 *
 * @module @ferni/api/widget-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { createLogger } from '../utils/safe-logger.js';
import { registerInterval } from '../utils/interval-manager.js';
import { sendError, sendJsonResponse, parseRequestBody } from './helpers.js';
import { requireAuth, type AuthContext } from './auth-middleware.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

const log = createLogger({ module: 'WidgetRoutes' });

// ============================================================================
// TYPES
// ============================================================================

export interface WidgetConfig {
  /** Unique widget ID (API key) */
  widgetId: string;
  /** Persona to use for the widget */
  personaId: string;
  /** Allowed domains for CORS */
  allowedDomains: string[];
  /** Display name for the widget */
  displayName: string;
  /** Primary color (hex) */
  primaryColor?: string;
  /** Position: bottom-right, bottom-left */
  position?: 'bottom-right' | 'bottom-left';
  /** Whether to auto-greet on open */
  autoGreet?: boolean;
  /** Custom greeting message */
  greetingMessage?: string;
  /** Rate limit per day */
  dailyLimit: number;
  /** Session duration in minutes */
  sessionDurationMinutes: number;
  /** Created timestamp */
  createdAt: string;
  /** Owner user ID */
  ownerId: string;
}

export interface WidgetSession {
  sessionId: string;
  widgetId: string;
  createdAt: number;
  expiresAt: number;
  origin: string;
}

// ============================================================================
// IN-MEMORY STORAGE (Replace with DB in production)
// ============================================================================

// Widget configurations (in production, store in Firestore)
const widgetConfigs = new Map<string, WidgetConfig>();

// Active sessions for rate limiting
const activeSessions = new Map<string, WidgetSession[]>();

// Daily usage tracking: widgetId -> { date: count }
const dailyUsage = new Map<string, Map<string, number>>();

// ============================================================================
// HELPERS
// ============================================================================

function generateWidgetId(): string {
  return `wgt_${crypto.randomBytes(16).toString('hex')}`;
}

function generateSessionId(): string {
  return `ses_${crypto.randomBytes(24).toString('hex')}`;
}

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function getDailyUsageCount(widgetId: string): number {
  const todayKey = getTodayKey();
  const usage = dailyUsage.get(widgetId);
  return usage?.get(todayKey) || 0;
}

function incrementDailyUsage(widgetId: string): void {
  const todayKey = getTodayKey();
  let usage = dailyUsage.get(widgetId);
  if (!usage) {
    usage = new Map();
    dailyUsage.set(widgetId, usage);
  }
  usage.set(todayKey, (usage.get(todayKey) || 0) + 1);
}

function isOriginAllowed(config: WidgetConfig, origin: string): boolean {
  // Allow localhost for development
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return true;
  }

  // Check allowed domains
  for (const domain of config.allowedDomains) {
    if (domain === '*') return true;
    if (origin.includes(domain)) return true;
  }
  return false;
}

function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [widgetId, sessions] of activeSessions.entries()) {
    const validSessions = sessions.filter((s) => s.expiresAt > now);
    if (validSessions.length > 0) {
      activeSessions.set(widgetId, validSessions);
    } else {
      activeSessions.delete(widgetId);
    }
  }
}

// Clean expired sessions every 5 minutes (managed interval for proper shutdown)
registerInterval('widget-session-cleanup', cleanExpiredSessions, 5 * 60 * 1000);

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle all widget-related routes
 */
export async function handleWidgetRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  try {
    // GET /api/widget/config/:widgetId - Get widget configuration (public)
    const configMatch = path.match(/^\/api\/widget\/config\/([^/]+)$/);
    if (configMatch && method === 'GET') {
      return handleGetWidgetConfig(req, res, configMatch[1]);
    }

    // POST /api/widget/session - Create a new widget session (public)
    if (path === '/api/widget/session' && method === 'POST') {
      return handleCreateSession(req, res);
    }

    // POST /api/widget/register - Register a new widget (authenticated)
    if (path === '/api/widget/register' && method === 'POST') {
      return handleRegisterWidget(req, res);
    }

    // GET /api/widget/list - List widgets for a user (authenticated)
    if (path === '/api/widget/list' && method === 'GET') {
      return handleListWidgets(req, res);
    }

    // DELETE /api/widget/:widgetId - Delete a widget (authenticated)
    const deleteMatch = path.match(/^\/api\/widget\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      return handleDeleteWidget(req, res, deleteMatch[1]);
    }

    // GET /api/widget/embed.js - Serve the embed script
    if (path === '/api/widget/embed.js' && method === 'GET') {
      return handleServeEmbedScript(req, res);
    }

    return false; // Route not handled
  } catch (error) {
    log.error({ error, path, method }, 'Widget route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * GET /api/widget/config/:widgetId
 * Returns public configuration for a widget
 */
async function handleGetWidgetConfig(
  req: IncomingMessage,
  res: ServerResponse,
  widgetId: string
): Promise<boolean> {
  const config = widgetConfigs.get(widgetId);

  if (!config) {
    sendError(res, 'Widget not found', 404);
    return true;
  }

  // Check origin
  const origin = req.headers.origin || req.headers.referer || '';
  if (!isOriginAllowed(config, origin)) {
    sendError(res, 'Origin not allowed', 403);
    return true;
  }

  // Return public config (no secrets)
  sendJsonResponse(res, 200, {
    widgetId: config.widgetId,
    personaId: config.personaId,
    displayName: config.displayName,
    primaryColor: config.primaryColor,
    position: config.position,
    autoGreet: config.autoGreet,
    greetingMessage: config.greetingMessage,
  });

  return true;
}

/**
 * POST /api/widget/session
 * Creates a new widget session and returns a token
 */
async function handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseRequestBody<{
    widgetId: string;
    visitorId?: string;
  }>(req);

  if (!body?.widgetId) {
    sendError(res, 'widgetId is required', 400);
    return true;
  }

  const config = widgetConfigs.get(body.widgetId);
  if (!config) {
    sendError(res, 'Widget not found', 404);
    return true;
  }

  // Check origin
  const origin = req.headers.origin || req.headers.referer || '';
  if (!isOriginAllowed(config, origin)) {
    sendError(res, 'Origin not allowed', 403);
    return true;
  }

  // Check rate limit
  const dailyCount = getDailyUsageCount(body.widgetId);
  if (dailyCount >= config.dailyLimit) {
    sendError(res, 'Daily limit exceeded', 429);
    return true;
  }

  // Create session
  const sessionId = generateSessionId();
  const now = Date.now();
  const session: WidgetSession = {
    sessionId,
    widgetId: body.widgetId,
    createdAt: now,
    expiresAt: now + config.sessionDurationMinutes * 60 * 1000,
    origin,
  };

  // Track session
  const sessions = activeSessions.get(body.widgetId) || [];
  sessions.push(session);
  activeSessions.set(body.widgetId, sessions);
  incrementDailyUsage(body.widgetId);

  log.info({ widgetId: body.widgetId, sessionId, origin }, 'Widget session created');

  // Return session info (client will use this to get LiveKit token)
  sendJsonResponse(res, 200, {
    sessionId,
    expiresAt: session.expiresAt,
    personaId: config.personaId,
    config: {
      displayName: config.displayName,
      primaryColor: config.primaryColor,
      position: config.position,
      autoGreet: config.autoGreet,
      greetingMessage: config.greetingMessage,
    },
  });

  return true;
}

/**
 * POST /api/widget/register
 * Registers a new widget (requires authentication)
 */
async function handleRegisterWidget(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // SECURITY: Use Firebase auth instead of deprecated x-user-id header
  const auth = await requireAuth(req, res);
  if (!auth) return true; // 401 already sent
  const { userId } = auth;

  const body = await parseRequestBody<{
    displayName: string;
    personaId?: string;
    allowedDomains: string[];
    primaryColor?: string;
    position?: 'bottom-right' | 'bottom-left';
    autoGreet?: boolean;
    greetingMessage?: string;
    dailyLimit?: number;
    sessionDurationMinutes?: number;
  }>(req);

  if (!body?.displayName || !body?.allowedDomains?.length) {
    sendError(res, 'displayName and allowedDomains are required', 400);
    return true;
  }

  const widgetId = generateWidgetId();
  const config: WidgetConfig = {
    widgetId,
    personaId: body.personaId || 'ferni',
    allowedDomains: body.allowedDomains,
    displayName: body.displayName,
    primaryColor: body.primaryColor || '#4a6741',
    position: body.position || 'bottom-right',
    autoGreet: body.autoGreet ?? true,
    greetingMessage: body.greetingMessage,
    dailyLimit: Math.min(body.dailyLimit || 100, 1000), // Max 1000/day
    sessionDurationMinutes: Math.min(body.sessionDurationMinutes || 15, 60), // Max 60 min
    createdAt: new Date().toISOString(),
    ownerId: userId,
  };

  widgetConfigs.set(widgetId, config);
  log.info({ widgetId, userId, displayName: body.displayName }, 'Widget registered');

  sendJsonResponse(res, 201, {
    widgetId,
    embedCode: getEmbedCode(widgetId),
    config: {
      displayName: config.displayName,
      personaId: config.personaId,
      allowedDomains: config.allowedDomains,
      dailyLimit: config.dailyLimit,
      sessionDurationMinutes: config.sessionDurationMinutes,
    },
  });

  return true;
}

/**
 * GET /api/widget/list
 * Lists all widgets for the authenticated user
 */
async function handleListWidgets(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // SECURITY: Use Firebase auth instead of deprecated x-user-id header
  const auth = await requireAuth(req, res);
  if (!auth) return true; // 401 already sent
  const { userId } = auth;

  const userWidgets: WidgetConfig[] = [];
  for (const config of widgetConfigs.values()) {
    if (config.ownerId === userId) {
      userWidgets.push(config);
    }
  }

  sendJsonResponse(res, 200, {
    widgets: userWidgets.map((w) => ({
      widgetId: w.widgetId,
      displayName: w.displayName,
      personaId: w.personaId,
      allowedDomains: w.allowedDomains,
      dailyLimit: w.dailyLimit,
      createdAt: w.createdAt,
      todayUsage: getDailyUsageCount(w.widgetId),
    })),
  });

  return true;
}

/**
 * DELETE /api/widget/:widgetId
 * Deletes a widget (requires ownership)
 */
async function handleDeleteWidget(
  req: IncomingMessage,
  res: ServerResponse,
  widgetId: string
): Promise<boolean> {
  // SECURITY: Use Firebase auth instead of deprecated x-user-id header
  const auth = await requireAuth(req, res);
  if (!auth) return true; // 401 already sent
  const { userId } = auth;

  const config = widgetConfigs.get(widgetId);
  if (!config) {
    sendError(res, 'Widget not found', 404);
    return true;
  }

  if (config.ownerId !== userId) {
    sendError(res, 'Not authorized', 403);
    return true;
  }

  widgetConfigs.delete(widgetId);
  activeSessions.delete(widgetId);
  dailyUsage.delete(widgetId);

  log.info({ widgetId, userId }, 'Widget deleted');
  sendJsonResponse(res, 200, { deleted: true });

  return true;
}

/**
 * GET /api/widget/embed.js
 * Serves the embeddable JavaScript SDK
 */
async function handleServeEmbedScript(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=3600',
  });

  res.end(EMBED_SCRIPT);
  return true;
}

// ============================================================================
// EMBED CODE GENERATOR
// ============================================================================

function getEmbedCode(widgetId: string): string {
  return `<!-- Ferni Voice Agent Widget -->
<script>
  (function(w,d,s,id){
    w.FerniWidget=w.FerniWidget||{};
    w.FerniWidget.widgetId='${widgetId}';
    var js,fjs=d.getElementsByTagName(s)[0];
    if(d.getElementById(id))return;
    js=d.createElement(s);js.id=id;
    js.src='https://your-domain.com/api/widget/embed.js';
    js.async=true;
    fjs.parentNode.insertBefore(js,fjs);
  })(window,document,'script','ferni-widget');
</script>`;
}

// ============================================================================
// EMBED SCRIPT
// ============================================================================

const EMBED_SCRIPT = `
/**
 * Ferni Voice Agent - Embeddable Widget SDK
 *
 * Usage:
 *   <script>
 *     window.FerniWidget = { widgetId: 'YOUR_WIDGET_ID' };
 *   </script>
 *   <script src="https://your-domain.com/api/widget/embed.js" async></script>
 */
(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.FerniWidgetLoaded) return;
  window.FerniWidgetLoaded = true;

  const API_BASE = window.FerniWidget?.apiBase || '';
  const WIDGET_ID = window.FerniWidget?.widgetId;

  if (!WIDGET_ID) {
    if (window.FerniWidget?.debug) console.error('[Ferni] Widget ID not configured. Set window.FerniWidget.widgetId');
    return;
  }

  // State
  let config = null;
  let session = null;
  let isOpen = false;
  let iframe = null;
  let button = null;

  // Styles
  const STYLES = \`
    .ferni-widget-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--ferni-primary, #4a6741);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      z-index: 999998;
    }
    .ferni-widget-button:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 24px rgba(0,0,0,0.3);
    }
    .ferni-widget-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }
    .ferni-widget-button.ferni-widget-button--left {
      right: auto;
      left: 20px;
    }
    .ferni-widget-iframe {
      position: fixed;
      bottom: 100px;
      right: 20px;
      width: 380px;
      height: 600px;
      max-height: calc(100vh - 140px);
      border: none;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.2);
      background: white;
      z-index: 999999;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
    }
    .ferni-widget-iframe.ferni-widget-iframe--open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .ferni-widget-iframe.ferni-widget-iframe--left {
      right: auto;
      left: 20px;
    }
    @media (max-width: 480px) {
      .ferni-widget-iframe {
        width: calc(100vw - 40px);
        height: calc(100vh - 140px);
        bottom: 90px;
        right: 20px;
        left: 20px;
      }
      .ferni-widget-iframe.ferni-widget-iframe--left {
        right: 20px;
      }
    }
  \`;

  // Icons
  const MIC_ICON = '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  // Initialize
  async function init() {
    try {
      // Fetch config
      const configRes = await fetch(API_BASE + '/api/widget/config/' + WIDGET_ID);
      if (!configRes.ok) throw new Error('Failed to load widget config');
      config = await configRes.json();

      // Inject styles
      const style = document.createElement('style');
      style.textContent = STYLES;
      if (config.primaryColor) {
        style.textContent = ':root { --ferni-primary: ' + config.primaryColor + '; }' + style.textContent;
      }
      document.head.appendChild(style);

      // Create button
      createButton();

      // Auto-greet if configured
      if (config.autoGreet && window.FerniWidget.autoOpen) {
        setTimeout(open, 2000);
      }

      if (window.FerniWidget?.debug) console.log('[Ferni] Widget initialized:', config.displayName);
    } catch (err) {
      if (window.FerniWidget?.debug) console.error('[Ferni] Failed to initialize:', err);
    }
  }

  function createButton() {
    button = document.createElement('button');
    button.className = 'ferni-widget-button';
    if (config.position === 'bottom-left') {
      button.classList.add('ferni-widget-button--left');
    }
    button.innerHTML = MIC_ICON;
    button.setAttribute('aria-label', 'Open ' + (config.displayName || 'Voice Assistant'));
    button.addEventListener('click', toggle);
    document.body.appendChild(button);
  }

  function createIframe() {
    if (iframe) return;

    iframe = document.createElement('iframe');
    iframe.className = 'ferni-widget-iframe';
    if (config.position === 'bottom-left') {
      iframe.classList.add('ferni-widget-iframe--left');
    }
    iframe.setAttribute('allow', 'microphone');
    iframe.setAttribute('title', config.displayName || 'Voice Assistant');

    // Build widget URL with session info
    const params = new URLSearchParams({
      widget: WIDGET_ID,
      session: session.sessionId,
      persona: session.personaId,
    });
    iframe.src = API_BASE + '/widget?' + params.toString();

    document.body.appendChild(iframe);
  }

  async function open() {
    if (isOpen) return;

    try {
      // Create session
      const sessionRes = await fetch(API_BASE + '/api/widget/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetId: WIDGET_ID }),
      });
      if (!sessionRes.ok) {
        const err = await sessionRes.json();
        throw new Error(err.error || 'Failed to create session');
      }
      session = await sessionRes.json();

      // Create iframe
      createIframe();

      // Animate open
      requestAnimationFrame(() => {
        iframe.classList.add('ferni-widget-iframe--open');
        button.innerHTML = CLOSE_ICON;
        isOpen = true;
      });
    } catch (err) {
      if (window.FerniWidget?.debug) console.error('[Ferni] Failed to open:', err);
      alert('Unable to start voice assistant. Please try again later.');
    }
  }

  function close() {
    if (!isOpen || !iframe) return;

    iframe.classList.remove('ferni-widget-iframe--open');
    button.innerHTML = MIC_ICON;
    isOpen = false;

    // Remove iframe after animation
    setTimeout(() => {
      if (iframe && !isOpen) {
        iframe.remove();
        iframe = null;
        session = null;
      }
    }, 300);
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // Public API
  window.FerniWidget.open = open;
  window.FerniWidget.close = close;
  window.FerniWidget.toggle = toggle;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;

export default handleWidgetRoutes;
