/**
 * Sites API Routes
 *
 * RESTful API endpoints for managing deployed agent websites.
 * Handles site deployment, subdomain management, and status tracking.
 *
 * @module sites-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import admin from 'firebase-admin';
import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import { getFirestore } from 'firebase-admin/firestore';
import {
  sendJSON,
  sendError,
  parseBody,
  handleCorsPreflightIfNeeded,
  getUserId,
} from './helpers.js';
import {
  generateAgentPage,
  generatePreviewSnippet,
  type AgentPageConfig,
} from '../services/page-generator/index.js';

const log = createLogger({ module: 'SitesRoutes' });

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

/**
 * Ensure Firebase Admin is initialized before accessing Firestore
 */
function ensureFirebaseInitialized(): void {
  if (admin.apps.length === 0) {
    try {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for sites routes');
      } else {
        admin.initializeApp();
        log.info('Firebase initialized with default credentials for sites routes');
      }
    } catch {
      log.debug('Firebase already initialized elsewhere');
    }
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface DeployedSite {
  id: string;
  userId: string;
  agentId: string;
  agentName: string;
  url: string;
  subdomain?: string;
  tier: 'free' | 'premium';
  status: 'active' | 'pending' | 'error';
  files: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  analytics?: {
    views: number;
    conversations: number;
    lastVisit?: string;
  };
}

interface DeployRequest {
  files: Record<string, string>;
  subdomain?: string;
}

interface SubdomainCheckResponse {
  available: boolean;
  subdomain: string;
  suggestedAlternatives?: string[];
}

interface GenerateRequest {
  config: AgentPageConfig;
}

interface GenerateAndDeployRequest {
  config: AgentPageConfig;
  subdomain?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate alternative subdomain suggestions
 */
function generateAlternatives(subdomain: string): string[] {
  const alternatives: string[] = [];
  const base = subdomain.replace(/-+$/, '');

  // Add number suffix
  alternatives.push(`${base}-1`);
  alternatives.push(`${base}-2`);

  // Add random suffix
  const random = Math.random().toString(36).slice(2, 5);
  alternatives.push(`${base}-${random}`);

  return alternatives;
}

/**
 * Extract route parameters from pathname
 */
function extractSiteId(pathname: string): string | null {
  // Match /api/sites/:id but not /api/sites/deploy or /api/sites/subdomains
  const match = pathname.match(/^\/api\/sites\/([^/]+)$/);
  if (match && match[1] !== 'deploy' && match[1] !== 'subdomains') {
    return match[1];
  }
  return null;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/sites
 * List all deployed sites for the authenticated user
 */
async function listSites(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  try {
    const db = getFirestore();
    const sitesRef = db.collection('deployed-sites');
    const snapshot = await sitesRef
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const sites: DeployedSite[] = [];
    snapshot.forEach((doc) => {
      sites.push({ id: doc.id, ...doc.data() } as DeployedSite);
    });

    sendJSON(res, sites);
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to list sites');
    sendError(res, 'Failed to list sites', 500);
    return true;
  }
}

/**
 * GET /api/sites/:id
 * Get details for a specific site
 */
async function getSite(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  siteId: string
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  try {
    const db = getFirestore();
    const siteDoc = await db.collection('deployed-sites').doc(siteId).get();

    if (!siteDoc.exists) {
      sendError(res, 'Site not found', 404);
      return true;
    }

    const site = { id: siteDoc.id, ...siteDoc.data() } as DeployedSite;

    // Check ownership
    if (site.userId !== userId) {
      sendError(res, 'Access denied', 403);
      return true;
    }

    sendJSON(res, site);
    return true;
  } catch (error) {
    log.error({ error, userId, siteId }, 'Failed to get site');
    sendError(res, 'Failed to get site', 500);
    return true;
  }
}

/**
 * POST /api/sites/deploy
 * Deploy a new site or update an existing one
 */
async function deploySite(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  try {
    const body = await parseBody<DeployRequest>(req);
    const { files, subdomain } = body;

    if (!files || !files['index.html']) {
      sendError(res, 'index.html is required', 400);
      return true;
    }

    const db = getFirestore();

    // Check subdomain availability if requested
    if (subdomain) {
      const existing = await db
        .collection('deployed-sites')
        .where('subdomain', '==', subdomain.toLowerCase())
        .get();

      if (!existing.empty) {
        const existingSite = existing.docs[0];
        if (existingSite.data().userId !== userId) {
          sendJSON(
            res,
            {
              error: 'Subdomain already taken',
              suggestedAlternatives: generateAlternatives(subdomain),
            },
            409
          );
          return true;
        }
      }
    }

    // Extract agent ID from the embedded config
    const indexContent = files['index.html'];
    const agentIdMatch = indexContent.match(/agentId:\s*['"]([^'"]+)['"]/);
    const agentId = agentIdMatch ? agentIdMatch[1] : 'unknown';

    // Get agent name
    let agentName = 'Custom Agent';
    if (agentId !== 'unknown') {
      try {
        const agentDoc = await db.collection('custom-agents').doc(agentId).get();
        if (agentDoc.exists) {
          agentName = agentDoc.data()?.displayName || 'Custom Agent';
        }
      } catch {
        // Ignore - use default name
      }
    }

    // Generate site ID
    const siteId = `site_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Determine URL
    const tier = subdomain ? 'premium' : 'free';
    const url = subdomain
      ? `https://${subdomain.toLowerCase()}.ferni.ai`
      : `https://ferni.ai/sites/${siteId}`;

    // Create site record
    const site: Omit<DeployedSite, 'id'> = {
      userId,
      agentId,
      agentName,
      url,
      subdomain: subdomain?.toLowerCase(),
      tier,
      status: 'active',
      files,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      analytics: {
        views: 0,
        conversations: 0,
      },
    };

    // Save to Firestore
    await db.collection('deployed-sites').doc(siteId).set(cleanForFirestore(site));

    log.info({ userId, siteId, agentId, subdomain }, 'Site deployed');

    sendJSON(
      res,
      {
        success: true,
        url,
        siteId,
        subdomain: subdomain?.toLowerCase(),
      },
      201
    );
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to deploy site');
    sendError(res, 'Failed to deploy site', 500);
    return true;
  }
}

/**
 * DELETE /api/sites/:id
 * Delete a deployed site
 */
async function deleteSite(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  siteId: string
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  try {
    const db = getFirestore();
    const siteDoc = await db.collection('deployed-sites').doc(siteId).get();

    if (!siteDoc.exists) {
      sendError(res, 'Site not found', 404);
      return true;
    }

    const site = siteDoc.data() as DeployedSite;

    // Check ownership
    if (site.userId !== userId) {
      sendError(res, 'Access denied', 403);
      return true;
    }

    // Delete the site
    await db.collection('deployed-sites').doc(siteId).delete();

    log.info({ userId, siteId }, 'Site deleted');

    sendJSON(res, { success: true });
    return true;
  } catch (error) {
    log.error({ error, userId, siteId }, 'Failed to delete site');
    sendError(res, 'Failed to delete site', 500);
    return true;
  }
}

/**
 * GET /api/sites/subdomains/check
 * Check if a subdomain is available
 */
async function checkSubdomain(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  const subdomain = parsedUrl.searchParams.get('subdomain')?.toLowerCase();

  if (!subdomain) {
    sendError(res, 'subdomain parameter required', 400);
    return true;
  }

  // Validate subdomain format
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
    sendJSON(res, {
      available: false,
      subdomain,
      error: 'Invalid subdomain format',
    } as SubdomainCheckResponse);
    return true;
  }

  // Reserved subdomains
  const reserved = ['www', 'app', 'api', 'admin', 'mail', 'ftp', 'staging', 'dev', 'test'];
  if (reserved.includes(subdomain)) {
    sendJSON(res, {
      available: false,
      subdomain,
      suggestedAlternatives: generateAlternatives(subdomain),
    } as SubdomainCheckResponse);
    return true;
  }

  try {
    const db = getFirestore();
    const existing = await db
      .collection('deployed-sites')
      .where('subdomain', '==', subdomain)
      .get();

    if (existing.empty) {
      sendJSON(res, {
        available: true,
        subdomain,
      } as SubdomainCheckResponse);
    } else {
      // Check if the user owns it
      const existingSite = existing.docs[0].data();
      if (existingSite.userId === userId) {
        sendJSON(res, {
          available: true,
          subdomain,
        } as SubdomainCheckResponse);
      } else {
        sendJSON(res, {
          available: false,
          subdomain,
          suggestedAlternatives: generateAlternatives(subdomain),
        } as SubdomainCheckResponse);
      }
    }
    return true;
  } catch (error) {
    log.error({ error, userId, subdomain }, 'Failed to check subdomain');
    sendError(res, 'Failed to check subdomain', 500);
    return true;
  }
}

// ============================================================================
// PAGE GENERATION (NEW)
// ============================================================================

/**
 * POST /api/sites/generate
 * Generate an agent page without deploying it.
 * Returns the complete HTML for preview or download.
 */
async function generatePage(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  try {
    const body = await parseBody<GenerateRequest>(req);
    const { config } = body;

    if (!config) {
      sendError(res, 'config is required', 400);
      return true;
    }

    // Generate the page
    const result = await generateAgentPage(config);

    log.info(
      { userId, agentId: config.agent.id, sizeKb: Math.round(result.size / 1024) },
      'Page generated'
    );

    sendJSON(res, {
      success: true,
      html: result.html,
      size: result.size,
      generatedAt: result.generatedAt.toISOString(),
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: message, userId }, 'Failed to generate page');
    sendError(res, `Generation failed: ${message}`, 400);
    return true;
  }
}

/**
 * POST /api/sites/generate-and-deploy
 * Generate an agent page and deploy it in one step.
 * Combines page generation with the existing deploy flow.
 */
async function generateAndDeployPage(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  try {
    ensureFirebaseInitialized();
    const body = await parseBody<GenerateAndDeployRequest>(req);
    const { config, subdomain } = body;

    if (!config) {
      sendError(res, 'config is required', 400);
      return true;
    }

    const db = getFirestore();

    // Check subdomain availability if requested
    if (subdomain) {
      const existing = await db
        .collection('deployed-sites')
        .where('subdomain', '==', subdomain.toLowerCase())
        .get();

      if (!existing.empty) {
        const existingSite = existing.docs[0];
        if (existingSite.data().userId !== userId) {
          sendJSON(
            res,
            {
              error: 'Subdomain already taken',
              suggestedAlternatives: generateAlternatives(subdomain),
            },
            409
          );
          return true;
        }
      }
    }

    // Generate the page
    const generated = await generateAgentPage(config);

    // Generate site ID
    const siteId = `site_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Determine URL
    const tier = subdomain ? 'premium' : 'free';
    const url = subdomain
      ? `https://${subdomain.toLowerCase()}.ferni.ai`
      : `https://ferni.ai/sites/${siteId}`;

    // Create site record with generated HTML
    const site: Omit<DeployedSite, 'id'> = {
      userId,
      agentId: config.agent.id,
      agentName: config.agent.name,
      url,
      subdomain: subdomain?.toLowerCase(),
      tier,
      status: 'active',
      files: {
        'index.html': generated.html,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      analytics: {
        views: 0,
        conversations: 0,
      },
    };

    // Save to Firestore
    await db.collection('deployed-sites').doc(siteId).set(cleanForFirestore(site));

    log.info(
      {
        userId,
        siteId,
        agentId: config.agent.id,
        subdomain,
        sizeKb: Math.round(generated.size / 1024),
      },
      'Page generated and deployed'
    );

    sendJSON(
      res,
      {
        success: true,
        url,
        siteId,
        subdomain: subdomain?.toLowerCase(),
        size: generated.size,
      },
      201
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: message, userId }, 'Failed to generate and deploy page');
    sendError(res, `Deployment failed: ${message}`, 400);
    return true;
  }
}

/**
 * POST /api/sites/preview
 * Generate a preview snippet for live builder UI.
 * Returns just CSS and avatar HTML, not full page.
 */
async function generatePreview(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  try {
    const body = await parseBody<GenerateRequest>(req);
    const { config } = body;

    if (!config) {
      sendError(res, 'config is required', 400);
      return true;
    }

    // Generate preview snippet
    const preview = await generatePreviewSnippet(config);

    sendJSON(res, {
      success: true,
      css: preview.css,
      avatarHtml: preview.avatarHtml,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: message, userId }, 'Failed to generate preview');
    sendError(res, `Preview failed: ${message}`, 400);
    return true;
  }
}

// ============================================================================
// STATIC SITE SERVING
// ============================================================================

/**
 * Serve static site content for /sites/:subdomain paths
 */
async function serveStaticSite(
  res: ServerResponse,
  subdomainOrId: string,
  filePath: string
): Promise<boolean> {
  try {
    ensureFirebaseInitialized();
    const db = getFirestore();

    // First try to find by subdomain (URL path uses subdomain, not siteId)
    let siteDoc;
    let siteId = subdomainOrId;

    const subdomainQuery = await db
      .collection('deployed-sites')
      .where('subdomain', '==', subdomainOrId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (!subdomainQuery.empty) {
      siteDoc = subdomainQuery.docs[0];
      siteId = siteDoc.id;
    } else {
      // Fall back to direct ID lookup for backward compatibility
      siteDoc = await db.collection('deployed-sites').doc(subdomainOrId).get();
      if (!siteDoc.exists) {
        siteDoc = null;
      }
    }

    if (!siteDoc || !siteDoc.exists) {
      // Site not found - send 404 HTML
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Site Not Found</title></head>
<body style="font-family: system-ui; text-align: center; padding: 40px;">
  <h1>Site Not Found</h1>
  <p>This site doesn't exist or has been removed.</p>
  <a href="https://ferni.ai">Go to Ferni</a>
</body>
</html>`);
      return true;
    }

    const site = siteDoc.data() as DeployedSite;

    // Determine which file to serve
    const requestedFile = filePath || 'index.html';
    const content = site.files[requestedFile];

    if (!content) {
      // File not found - try index.html for SPA routing
      const indexContent = site.files['index.html'];
      if (indexContent) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(indexContent);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      }
      return true;
    }

    // Determine content type
    let contentType = 'text/plain';
    if (requestedFile.endsWith('.html')) {
      contentType = 'text/html';
    } else if (requestedFile.endsWith('.css')) {
      contentType = 'text/css';
    } else if (requestedFile.endsWith('.js')) {
      contentType = 'application/javascript';
    } else if (requestedFile.endsWith('.json')) {
      contentType = 'application/json';
    } else if (requestedFile.endsWith('.svg')) {
      contentType = 'image/svg+xml';
    } else if (requestedFile.endsWith('.png')) {
      contentType = 'image/png';
    } else if (requestedFile.endsWith('.jpg') || requestedFile.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    }

    // Update view analytics
    db.collection('deployed-sites')
      .doc(siteId)
      .update(
        cleanForFirestore({
          'analytics.views': (site.analytics?.views || 0) + 1,
          'analytics.lastVisit': new Date().toISOString(),
        })
      )
      .catch((err: unknown) => log.warn({ err, siteId }, 'Failed to update analytics'));

    // Permissive CSP for landing pages - allows LiveKit and inline scripts
    const landingPageCSP = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://apis.google.com https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com https://constellation-static.web.vanguard.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.livekit.cloud wss://*.livekit.cloud https://*.firebaseio.com https://*.googleapis.com https://api.stripe.com https://api.cartesia.ai https://cdn.jsdelivr.net",
      "media-src 'self' blob: https:",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
    ].join('; ');

    // Short cache for landing pages - allows quick updates after regeneration
    // CloudFlare will also cache, but can be purged manually if needed
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300, s-maxage=60',
      'Content-Security-Policy': landingPageCSP,
    });
    res.end(content);
    return true;
  } catch (error) {
    log.error({ error, subdomainOrId, filePath }, 'Failed to serve static site');
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
    return true;
  }
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

/**
 * Main route handler for /api/sites/* and /sites/* (static serving)
 */
export async function handleSitesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl?: URL
): Promise<boolean> {
  // Ensure Firebase is initialized before any Firestore operations
  ensureFirebaseInitialized();

  // Handle /sites/:id paths for static site serving
  if (pathname.startsWith('/sites/') && !pathname.startsWith('/sites/api')) {
    const match = pathname.match(/^\/sites\/([^/]+)(\/.*)?$/);
    if (match) {
      const siteId = match[1];
      const filePath = match[2] ? match[2].slice(1) : 'index.html';
      return serveStaticSite(res, siteId, filePath);
    }
  }

  // Only handle /api/sites routes for API
  if (!pathname.startsWith('/api/sites')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Parse URL if not provided
  const url = parsedUrl || new URL(pathname, `http://${req.headers.host || 'localhost'}`);

  // Route: GET /api/sites
  if (pathname === '/api/sites' && req.method === 'GET') {
    return listSites(req, res, url);
  }

  // Route: POST /api/sites/deploy
  if (pathname === '/api/sites/deploy' && req.method === 'POST') {
    return deploySite(req, res, url);
  }

  // Route: POST /api/sites/generate (generate page without deploying)
  if (pathname === '/api/sites/generate' && req.method === 'POST') {
    return generatePage(req, res, url);
  }

  // Route: POST /api/sites/generate-and-deploy (generate + deploy in one step)
  if (pathname === '/api/sites/generate-and-deploy' && req.method === 'POST') {
    return generateAndDeployPage(req, res, url);
  }

  // Route: POST /api/sites/preview (generate preview snippet for builder UI)
  if (pathname === '/api/sites/preview' && req.method === 'POST') {
    return generatePreview(req, res, url);
  }

  // Route: GET /api/sites/subdomains/check
  if (pathname === '/api/sites/subdomains/check' && req.method === 'GET') {
    return checkSubdomain(req, res, url);
  }

  // Route: GET /api/sites/:id
  const siteId = extractSiteId(pathname);
  if (siteId && req.method === 'GET') {
    return getSite(req, res, url, siteId);
  }

  // Route: DELETE /api/sites/:id
  if (siteId && req.method === 'DELETE') {
    return deleteSite(req, res, url, siteId);
  }

  // Unknown route
  sendError(res, 'Not found', 404);
  return true;
}
