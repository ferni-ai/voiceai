/**
 * Visual Memory API Routes
 *
 * "Better than Human" - We remember every photo you share.
 *
 * Endpoints:
 * - POST /api/visual-memory/upload → Upload an image to visual memory
 * - GET /api/visual-memory/search → Search visual memories
 * - GET /api/visual-memory/:id → Get a specific visual memory
 * - DELETE /api/visual-memory/:id → Delete a visual memory
 * - GET /api/visual-memory/preferences → Get user's visual memory preferences
 * - PUT /api/visual-memory/preferences → Update preferences
 * - GET /api/visual-memory/recent → Get recent visual memories
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  visualMemory,
  type VisualUploadRequest,
  type VisualSearchRequest,
  type VisualMemoryPreferences,
} from '../../../services/visual-memory/index.js';

const log = createLogger({ module: 'visual-memory-routes' });

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
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleVisualMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/visual-memory/* routes
  if (!pathname.startsWith('/api/visual-memory')) {
    return false;
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // All routes require user authentication
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, 'Authentication required');
    return true;
  }

  // ============================================================================
  // POST /api/visual-memory/upload - Upload an image
  // ============================================================================
  if (pathname === '/api/visual-memory/upload' && req.method === 'POST') {
    log.info({ userId }, 'Uploading visual memory');

    const body = await parseBody<{
      imageData: string; // Base64 encoded
      mimeType: string;
      caption?: string;
      source?: string;
      isPrivate?: boolean;
    }>(req);

    if (!body?.imageData || !body?.mimeType) {
      sendError(res, 400, 'imageData and mimeType required');
      return true;
    }

    try {
      // Check if visual memory is enabled
      const isEnabled = await visualMemory.isEnabled(userId);
      if (!isEnabled) {
        sendError(res, 403, 'Visual memory is not enabled. Enable it in settings.');
        return true;
      }

      const result = await visualMemory.upload({
        userId,
        imageData: body.imageData,
        mimeType: body.mimeType,
        description: body.caption, // Map caption to description (type uses description)
        source: (body.source || 'api_upload') as VisualUploadRequest['source'],
        isPrivate: body.isPrivate ?? false,
      });

      if (!result.success) {
        sendError(res, 500, result.error || 'Upload failed');
        return true;
      }

      log.info({ userId, memoryId: result.memoryId }, 'Visual memory uploaded');
      sendJson(res, 200, {
        success: true,
        memoryId: result.memoryId,
        quickAnalysis: result.quickAnalysis,
      });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Visual memory upload failed');
      sendError(res, 500, 'Upload failed');
      return true;
    }
  }

  // ============================================================================
  // GET /api/visual-memory/search - Search visual memories
  // ============================================================================
  if (pathname === '/api/visual-memory/search' && req.method === 'GET') {
    const url = new URL(req.url || '', 'http://localhost');
    const query = url.searchParams.get('query') || '';
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    if (!query) {
      sendError(res, 400, 'Query parameter required');
      return true;
    }

    try {
      const results = await visualMemory.search({
        userId,
        query,
        limit: Math.min(limit, 50), // Cap at 50
      });

      sendJson(res, 200, { success: true, results });
      return true;
    } catch (error) {
      log.error({ userId, query, error: String(error) }, 'Visual memory search failed');
      sendError(res, 500, 'Search failed');
      return true;
    }
  }

  // ============================================================================
  // GET /api/visual-memory/recent - Get recent visual memories
  // ============================================================================
  if (pathname === '/api/visual-memory/recent' && req.method === 'GET') {
    const url = new URL(req.url || '', 'http://localhost');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    try {
      const memories = await visualMemory.getRecent(userId, Math.min(limit, 50));
      sendJson(res, 200, { success: true, memories });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Get recent visual memories failed');
      sendError(res, 500, 'Failed to get recent memories');
      return true;
    }
  }

  // ============================================================================
  // GET /api/visual-memory/preferences - Get visual memory preferences
  // ============================================================================
  if (pathname === '/api/visual-memory/preferences' && req.method === 'GET') {
    try {
      const preferences = await visualMemory.getPreferences(userId);
      sendJson(res, 200, { success: true, preferences });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Get visual memory preferences failed');
      sendError(res, 500, 'Failed to get preferences');
      return true;
    }
  }

  // ============================================================================
  // PUT /api/visual-memory/preferences - Update visual memory preferences
  // ============================================================================
  if (pathname === '/api/visual-memory/preferences' && req.method === 'PUT') {
    const body = await parseBody<Partial<VisualMemoryPreferences>>(req);

    if (!body) {
      sendError(res, 400, 'Invalid request body');
      return true;
    }

    try {
      await visualMemory.updatePreferences(userId, body);
      log.info({ userId, updates: Object.keys(body) }, 'Visual memory preferences updated');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Update visual memory preferences failed');
      sendError(res, 500, 'Failed to update preferences');
      return true;
    }
  }

  // ============================================================================
  // POST /api/visual-memory/enable - Enable visual memory
  // ============================================================================
  if (pathname === '/api/visual-memory/enable' && req.method === 'POST') {
    try {
      await visualMemory.enable(userId);
      sendJson(res, 200, { success: true, message: 'Visual memory enabled' });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Enable visual memory failed');
      sendError(res, 500, 'Failed to enable visual memory');
      return true;
    }
  }

  // ============================================================================
  // POST /api/visual-memory/disable - Disable visual memory
  // ============================================================================
  if (pathname === '/api/visual-memory/disable' && req.method === 'POST') {
    try {
      await visualMemory.disable(userId);
      sendJson(res, 200, { success: true, message: 'Visual memory disabled' });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Disable visual memory failed');
      sendError(res, 500, 'Failed to disable visual memory');
      return true;
    }
  }

  // ============================================================================
  // GET /api/visual-memory/:id - Get a specific visual memory
  // ============================================================================
  const memoryIdMatch = pathname.match(/^\/api\/visual-memory\/([a-zA-Z0-9_-]+)$/);
  if (memoryIdMatch && req.method === 'GET') {
    const memoryId = memoryIdMatch[1];

    try {
      const memory = await visualMemory.get(userId, memoryId);

      if (!memory) {
        sendError(res, 404, 'Visual memory not found');
        return true;
      }

      sendJson(res, 200, { success: true, memory });
      return true;
    } catch (error) {
      log.error({ userId, memoryId, error: String(error) }, 'Get visual memory failed');
      sendError(res, 500, 'Failed to get visual memory');
      return true;
    }
  }

  // ============================================================================
  // DELETE /api/visual-memory/:id - Delete a visual memory
  // ============================================================================
  if (memoryIdMatch && req.method === 'DELETE') {
    const memoryId = memoryIdMatch[1];

    try {
      await visualMemory.delete(userId, memoryId);
      log.info({ userId, memoryId }, 'Visual memory deleted');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      log.error({ userId, memoryId, error: String(error) }, 'Delete visual memory failed');
      sendError(res, 500, 'Failed to delete visual memory');
      return true;
    }
  }

  // Not a visual memory route we handle
  return false;
}
