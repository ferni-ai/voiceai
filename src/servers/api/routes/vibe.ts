/**
 * Vibe API Routes
 *
 * Unified environment control - Music, Lights, Temperature in one experience.
 *
 * Routes:
 * - GET  /api/vibe/state    - Get current state of all vibe components
 * - GET  /api/vibe/presets  - Get available vibe presets
 * - POST /api/vibe/activate - Activate a vibe preset
 * - POST /api/vibe/music    - Set music parameters
 * - POST /api/vibe/lights   - Set light parameters
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getVibeState,
  activateVibe,
  setLights,
  getAvailablePresets,
  getPreset,
} from '../../../services/vibe/index.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'vibe-routes' });

// ============================================================================
// HELPERS
// ============================================================================

function getUserId(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader && typeof userIdHeader === 'string') {
    return userIdHeader;
  }

  return null;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString()) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// CORS SETUP
// ============================================================================

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const allowedOrigins = [
    'https://app.ferni.ai',
    'https://ferni.ai',
    'https://ferni-prod.web.app',
    'http://localhost:3004',
    'http://localhost:3002',
  ];
  const { origin } = req.headers;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleVibeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/vibe routes
  if (!pathname.startsWith('/api/vibe')) {
    return false;
  }

  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // ============================================================================
  // GET /api/vibe/presets - Get available presets (no auth required)
  // ============================================================================
  if (pathname === '/api/vibe/presets' && req.method === 'GET') {
    const presets = getAvailablePresets();
    sendJson(res, 200, {
      presets: presets.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        hasMusic: !!p.music,
        hasLights: !!p.lights,
        hasTemperature: !!p.temperature,
      })),
    });
    return true;
  }

  // ============================================================================
  // GET /api/vibe/preset/:id - Get a specific preset (no auth required)
  // ============================================================================
  const presetMatch = pathname.match(/^\/api\/vibe\/preset\/([a-z]+)$/);
  if (presetMatch && req.method === 'GET') {
    const presetId = presetMatch[1];
    const preset = getPreset(presetId);

    if (!preset) {
      sendError(res, 404, `Preset "${presetId}" not found`);
      return true;
    }

    sendJson(res, 200, { preset });
    return true;
  }

  // All routes below require authentication
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, 'Authentication required');
    return true;
  }

  // ============================================================================
  // GET /api/vibe/state - Get current vibe state
  // ============================================================================
  if (pathname === '/api/vibe/state' && req.method === 'GET') {
    log.debug({ userId }, 'Getting vibe state');

    const state = await getVibeState(userId);
    sendJson(res, 200, state);
    return true;
  }

  // ============================================================================
  // POST /api/vibe/activate - Activate a vibe preset
  // ============================================================================
  if (pathname === '/api/vibe/activate' && req.method === 'POST') {
    const body = await parseBody<{ presetId: string }>(req);

    if (!body?.presetId) {
      sendError(res, 400, 'presetId is required');
      return true;
    }

    log.info({ userId, preset: body.presetId }, 'Activating vibe');

    const result = await activateVibe(userId, body.presetId);

    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  // ============================================================================
  // POST /api/vibe/music - Set music parameters
  // ============================================================================
  if (pathname === '/api/vibe/music' && req.method === 'POST') {
    const body = await parseBody<{
      genre?: string;
      energy?: 'low' | 'medium' | 'high';
      volume?: number;
      action?: 'play' | 'pause' | 'skip';
    }>(req);

    if (!body) {
      sendError(res, 400, 'Invalid request body');
      return true;
    }

    log.info({ userId, music: body }, 'Setting music vibe');

    // For now, return success - music control is handled by Spotify routes
    // This endpoint provides a unified API that the voice agent can use
    sendJson(res, 200, {
      success: true,
      message: `Music set: ${body.genre || 'ambient'} at ${body.energy || 'medium'} energy`,
      applied: body,
    });
    return true;
  }

  // ============================================================================
  // POST /api/vibe/lights - Set light parameters
  // ============================================================================
  if (pathname === '/api/vibe/lights' && req.method === 'POST') {
    const body = await parseBody<{
      brightness?: number;
      colorTemp?: number;
      on?: boolean;
    }>(req);

    if (!body) {
      sendError(res, 400, 'Invalid request body');
      return true;
    }

    log.info({ userId, lights: body }, 'Setting lights');

    // If explicitly turning off
    if (body.on === false) {
      const result = await setLights(0);
      sendJson(res, 200, result);
      return true;
    }

    const result = await setLights(body.brightness, body.colorTemp);
    sendJson(res, result.success ? 200 : 500, result);
    return true;
  }

  // ============================================================================
  // GET /api/vibe/lights/status - Get lights status
  // ============================================================================
  if (pathname === '/api/vibe/lights/status' && req.method === 'GET') {
    const state = await getVibeState(userId);
    sendJson(res, 200, {
      connected: state.lights.connected,
      brightness: state.lights.brightness,
      colorTemp: state.lights.colorTemp,
      devices: state.lights.devices,
    });
    return true;
  }

  // ============================================================================
  // POST /api/vibe/lights/connect - Connect to a light provider
  // ============================================================================
  if (pathname === '/api/vibe/lights/connect' && req.method === 'POST') {
    const body = await parseBody<{ provider: 'home-assistant' | 'hue' | 'lifx' }>(req);

    if (!body?.provider) {
      sendError(res, 400, 'provider is required');
      return true;
    }

    log.info({ userId, provider: body.provider }, 'Connecting light provider');

    // Handle different providers
    switch (body.provider) {
      case 'home-assistant': {
        // For Home Assistant, return config info - actual connection happens client-side
        sendJson(res, 200, {
          success: true,
          message: 'Home Assistant requires local configuration',
          provider: 'home-assistant',
          instructions: 'Add your Home Assistant URL and token in settings',
        });
        break;
      }
      case 'hue': {
        // Philips Hue uses local bridge discovery
        sendJson(res, 200, {
          success: true,
          message: 'Press the button on your Hue bridge, then try again',
          provider: 'hue',
          discoveryUrl: 'https://discovery.meethue.com/',
        });
        break;
      }
      case 'lifx': {
        // LIFX uses cloud API with token
        sendJson(res, 200, {
          success: true,
          message: 'LIFX connection initiated',
          provider: 'lifx',
          authUrl: 'https://cloud.lifx.com/oauth/authorize',
        });
        break;
      }
      default:
        sendError(res, 400, `Unknown provider: ${body.provider}`);
    }
    return true;
  }

  // ============================================================================
  // POST /api/vibe/thermostat/connect - Connect to a thermostat provider
  // ============================================================================
  if (pathname === '/api/vibe/thermostat/connect' && req.method === 'POST') {
    const body = await parseBody<{ provider: 'ecobee' | 'nest' | 'home-assistant' }>(req);

    if (!body?.provider) {
      sendError(res, 400, 'provider is required');
      return true;
    }

    log.info({ userId, provider: body.provider }, 'Connecting thermostat provider');

    // Handle different providers
    switch (body.provider) {
      case 'nest': {
        // Google Nest requires OAuth
        const clientId = process.env.NEST_CLIENT_ID || '';
        if (!clientId) {
          sendError(res, 503, 'Nest integration not configured');
          return true;
        }
        const redirectUri = encodeURIComponent(
          process.env.NODE_ENV === 'production'
            ? 'https://app.ferni.ai/api/vibe/thermostat/callback'
            : 'http://localhost:3002/api/vibe/thermostat/callback'
        );
        const authUrl = `https://nestservices.google.com/partnerconnections/project-id/auth?redirect_uri=${redirectUri}&access_type=offline&prompt=consent&client_id=${clientId}&response_type=code&scope=https://www.googleapis.com/auth/sdm.service`;
        sendJson(res, 200, {
          success: true,
          provider: 'nest',
          authUrl,
        });
        break;
      }
      case 'home-assistant': {
        // Home Assistant can control any thermostat
        sendJson(res, 200, {
          success: true,
          message: 'Using Home Assistant for climate control',
          provider: 'home-assistant',
        });
        break;
      }
      case 'ecobee':
      default: {
        // Ecobee handled by dedicated routes
        sendJson(res, 200, {
          success: true,
          message: 'Use /api/ecobee/authorize to connect Ecobee',
          provider: 'ecobee',
        });
      }
    }
    return true;
  }

  // Not a vibe route we handle
  return false;
}
