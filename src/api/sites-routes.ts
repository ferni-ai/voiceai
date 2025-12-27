/**
 * Sites API Routes
 *
 * RESTful API endpoints for managing deployed agent websites.
 * Handles site deployment, subdomain management, and status tracking.
 *
 * @module sites-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
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

const log = createLogger({ module: 'SitesRoutes' });

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
// STATIC SITE SERVING
// ============================================================================

/**
 * Serve static site content for /sites/:id paths
 */
async function serveStaticSite(
  res: ServerResponse,
  siteId: string,
  filePath: string
): Promise<boolean> {
  try {
    const db = getFirestore();
    const siteDoc = await db.collection('deployed-sites').doc(siteId).get();

    if (!siteDoc.exists) {
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

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(content);
    return true;
  } catch (error) {
    log.error({ error, siteId, filePath }, 'Failed to serve static site');
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
