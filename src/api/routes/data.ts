/**
 * Data Export/Delete Routes
 *
 * GET /api/export/categories - Get exportable categories
 * POST /api/export - Export user data
 * DELETE /api/export/all - GDPR data deletion
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireAuth } from '../auth-middleware.js';
import { sendJSON, sendError } from '../helpers.js';
import { validateBody, ExportDataSchema, DeleteAllDataSchema } from '../validators.js';
import { API_ERRORS } from '../error-messages.js';

const log = createLogger({ module: 'DataAPI' });

/**
 * Resolve the caller from a verified Firebase token (or API key), never from
 * the body, query or an x-firebase-uid header a client can set. A request
 * naming another user's id is refused rather than silently re-targeted.
 */
async function resolveCaller(
  req: IncomingMessage,
  res: ServerResponse,
  requestedUserId?: string | null
): Promise<string | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (requestedUserId && requestedUserId !== auth.userId) {
    log.warn({ authUserId: auth.userId }, 'Refused data request for a different user');
    sendError(res, 'Forbidden', 403);
    return null;
  }
  return auth.userId;
}

/**
 * GET /api/export/categories - Get exportable categories
 */
export async function handleGetExportCategories(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = await resolveCaller(req, res, parsedUrl.searchParams.get('userId'));
  if (!userId) return;

  try {
    const { getDataExportService } = await import('../../services/data-export.js');
    const exportService = getDataExportService();
    const categories = await exportService.getExportableCategories(userId);

    sendJSON(res, { categories });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get export categories');
    sendJSON(res, { error: 'Failed to get categories', categories: [] }, 500);
  }
}

/**
 * POST /api/export - Export user data
 */
export async function handleExportData(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const callerId = await resolveCaller(req, res, parsedUrl.searchParams.get('userId'));
  if (!callerId) return;

  try {
    const body = await validateBody(req, res, ExportDataSchema);
    if (!body) return;

    if (body.userId && body.userId !== callerId) {
      sendError(res, 'Forbidden', 403);
      return;
    }
    const userId = callerId;

    const { getDataExportService } = await import('../../services/data-export.js');
    const exportService = getDataExportService();
    const data = await exportService.exportData(userId, body.format, body.categories || []);

    const contentType = body.format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `ferni-export-${new Date().toISOString().split('T')[0]}.${body.format}`;

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(data);
  } catch (err) {
    log.error({ error: err }, 'Failed to export data');
    sendError(res, API_ERRORS.DATA_EXPORT_FAILED, 500);
  }
}

/**
 * DELETE /api/export/all - GDPR data deletion
 */
export async function handleDeleteAllData(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const callerId = await resolveCaller(req, res, parsedUrl.searchParams.get('userId'));
  if (!callerId) return;

  try {
    const body = await validateBody(req, res, DeleteAllDataSchema);
    if (!body) return;

    if (body.userId && body.userId !== callerId) {
      sendError(res, 'Forbidden', 403);
      return;
    }
    const userId = callerId;

    if (body.confirmDelete !== true) {
      sendError(res, API_ERRORS.DATA_DELETE_CONFIRMATION, 400);
      return;
    }

    const { getDataExportService } = await import('../../services/data-export.js');
    const exportService = getDataExportService();
    await exportService.deleteAllData(userId);

    log.info({ userId }, 'All user data deleted (GDPR request)');
    sendJSON(res, { success: true, message: 'All data deleted' });
  } catch (err) {
    log.error({ error: err }, 'Failed to delete data');
    sendError(res, API_ERRORS.DATA_DELETE_FAILED, 500);
  }
}

/**
 * Route handler for data endpoints
 */
export async function handleDataRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/export/categories' && req.method === 'GET') {
    await handleGetExportCategories(req, res, parsedUrl);
    return true;
  }

  if (pathname === '/api/export' && req.method === 'POST') {
    await handleExportData(req, res, parsedUrl);
    return true;
  }

  if (pathname === '/api/export/all' && req.method === 'DELETE') {
    await handleDeleteAllData(req, res, parsedUrl);
    return true;
  }

  return false;
}
