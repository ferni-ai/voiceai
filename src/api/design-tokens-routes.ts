/**
 * Design Tokens API Routes
 *
 * Public endpoints for accessing design system tokens.
 * Supports dynamic theming and cross-platform consistency.
 *
 * Endpoints:
 * - GET /api/design-tokens - Get all design tokens
 * - GET /api/design-tokens/:category - Get specific token category
 * - GET /api/design-tokens/version - Get token version info
 * - GET /api/design-tokens/persona/:personaId - Get persona-specific tokens
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from './helpers.js';
import { rateLimit } from './auth-middleware.js';
import fs from 'fs/promises';
import path from 'path';

const log = createLogger({ module: 'DesignTokensAPI' });

// Token categories that can be requested
const TOKEN_CATEGORIES = [
  'colors',
  'typography',
  'spacing',
  'animation',
  'motion',
  'effects',
  'components',
  'personas',
  'sounds',
  'haptics',
  'feedback',
  'responsive',
  'version',
] as const;

type TokenCategory = (typeof TOKEN_CATEGORIES)[number];

// Cache tokens in memory (refreshed on server restart)
let tokenCache: Record<string, unknown> | null = null;
let tokenCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Handle design tokens routes
 */
export async function handleDesignTokensRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/design-tokens/* routes
  if (!pathname.startsWith('/api/design-tokens')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting (generous for design tokens)
  if (rateLimit(req, res, { maxRequests: 200, windowMs: 60000 })) {
    return true;
  }

  try {
    // GET /api/design-tokens - Get all design tokens
    if (pathname === '/api/design-tokens' && req.method === 'GET') {
      const tokens = await getAllTokens();
      sendJSONCached(res, tokens, 3600); // 1 hour cache
      return true;
    }

    // GET /api/design-tokens/version - Get token version info
    if (pathname === '/api/design-tokens/version' && req.method === 'GET') {
      const version = await getTokenVersion();
      sendJSONCached(res, version, 300); // 5 minute cache
      return true;
    }

    // GET /api/design-tokens/persona/:personaId - Get persona-specific tokens
    const personaMatch = pathname.match(/^\/api\/design-tokens\/persona\/([^/]+)$/);
    if (personaMatch && req.method === 'GET') {
      const personaId = personaMatch[1];
      const tokens = await getPersonaTokens(personaId);

      if (!tokens) {
        sendError(res, `Persona '${personaId}' not found`, 404);
        return true;
      }

      sendJSONCached(res, tokens, 3600);
      return true;
    }

    // GET /api/design-tokens/:category - Get specific token category
    const categoryMatch = pathname.match(/^\/api\/design-tokens\/([^/]+)$/);
    if (categoryMatch && req.method === 'GET') {
      const category = categoryMatch[1] as TokenCategory;

      if (!TOKEN_CATEGORIES.includes(category)) {
        sendError(res, `Invalid category. Valid: ${TOKEN_CATEGORIES.join(', ')}`, 400);
        return true;
      }

      const tokens = await getCategoryTokens(category);
      sendJSONCached(res, tokens, 3600);
      return true;
    }

    // Unknown design tokens route
    sendError(res, 'Design tokens endpoint not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err) }, 'Design tokens route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

/**
 * Send JSON with cache headers
 */
function sendJSONCached(res: ServerResponse, data: unknown, maxAgeSeconds: number): void {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * Get the tokens directory path
 */
function getTokensDir(): string {
  // Handle both development and production paths
  const devPath = path.join(process.cwd(), 'design-system', 'tokens');
  return devPath;
}

/**
 * Load all tokens from disk or cache
 */
async function loadAllTokens(): Promise<Record<string, unknown>> {
  const now = Date.now();

  // Return cached if still valid
  if (tokenCache && now - tokenCacheTimestamp < CACHE_TTL_MS) {
    return tokenCache;
  }

  const tokensDir = getTokensDir();
  const tokens: Record<string, unknown> = {};

  for (const category of TOKEN_CATEGORIES) {
    try {
      const filePath = path.join(tokensDir, `${category}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      tokens[category] = JSON.parse(content);
    } catch (err) {
      // Category not available
      log.debug({ category, error: String(err) }, 'Token category not found');
    }
  }

  // Update cache
  tokenCache = tokens;
  tokenCacheTimestamp = now;

  return tokens;
}

/**
 * Get all design tokens
 */
async function getAllTokens(): Promise<Record<string, unknown>> {
  const tokens = await loadAllTokens();

  return {
    timestamp: new Date().toISOString(),
    categories: Object.keys(tokens),
    tokens,
  };
}

/**
 * Get token version info
 */
async function getTokenVersion(): Promise<Record<string, unknown>> {
  const tokens = await loadAllTokens();
  const version = tokens.version as Record<string, unknown> | undefined;

  return {
    version: version?.version ?? 'unknown',
    lastUpdated: version?.lastUpdated ?? null,
    changelog: version?.changelog ?? [],
  };
}

/**
 * Get tokens for a specific category
 */
async function getCategoryTokens(category: TokenCategory): Promise<Record<string, unknown>> {
  const tokens = await loadAllTokens();

  return {
    category,
    timestamp: new Date().toISOString(),
    tokens: tokens[category] ?? {},
  };
}

/**
 * Get tokens specific to a persona
 */
async function getPersonaTokens(personaId: string): Promise<Record<string, unknown> | null> {
  const tokens = await loadAllTokens();
  const personas = tokens.personas as Record<string, unknown> | undefined;
  const colors = tokens.colors as Record<string, unknown> | undefined;

  // Find persona in personas.json
  const personaList = personas?.personas as Array<{ id: string }> | undefined;
  const persona = personaList?.find((p) => p.id === personaId);

  if (!persona) {
    return null;
  }

  // Get persona color from colors.json
  const personaColors = colors?.personas as Record<string, unknown> | undefined;
  const personaColor = personaColors?.[personaId];

  // Extract ui and brand colors with type casting
  const uiColors = colors?.ui as Record<string, string> | undefined;
  const brandColors = colors?.brand as Record<string, string> | undefined;

  return {
    personaId,
    timestamp: new Date().toISOString(),
    persona,
    color: personaColor ?? null,
    // Include commonly needed tokens for theming
    theme: {
      primary: personaColor,
      background: uiColors?.background ?? '#FAF8F5',
      text: uiColors?.text ?? '#2C2520',
      accent: brandColors?.accent ?? '#3D5A45',
    },
  };
}

/**
 * Invalidate the token cache (call after token changes)
 */
export function invalidateTokenCache(): void {
  tokenCache = null;
  tokenCacheTimestamp = 0;
  log.debug('Token cache invalidated');
}
