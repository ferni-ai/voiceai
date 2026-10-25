/**
 * Data Export/Delete Routes
 *
 * GET /api/export/categories - Get exportable categories
 * POST /api/export - Export user data
 * DELETE /api/export/all - GDPR data deletion
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { rateLimit } from '../auth-middleware.js';
import { requireUserId, sendJSON, sendError } from '../helpers.js';
import { rateLimitUid } from '../rate-limit-identity.js';
import { ExportLimitError } from '../../services/platform/bounded-reader.js';
import { assertErased, erasureErrorCode } from '../../services/platform/erasure-step.js';
import { validateBody, ExportDataSchema, DeleteAllDataSchema } from '../validators.js';
import { API_ERRORS } from '../error-messages.js';

const log = createLogger({ module: 'DataAPI' });

/**
 * GET /api/export/categories - Get exportable categories
 */
export async function handleGetExportCategories(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;
  // Each listing counts every store: bounded per person like the export itself
  if (rateLimit(req, res, { maxRequests: 20, windowMs: 60_000, keyPrefix: 'export-categories' })) {
    return;
  }

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
  // A flood guard only; the per-person limit is claimExport's, shared by every instance
  if (rateLimit(req, res, { maxRequests: 10, windowMs: 60_000, keyPrefix: 'data-export' })) {
    return;
  }
  try {
    const body = await validateBody(req, res, ExportDataSchema);
    if (!body) return;

    // Never body.userId: the caller is who their verified credentials say.
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return;

    // The person's slot, by the uid the server verified, before any export read
    const { claimExport } = await import('../../services/platform/export-rate-limit.js');
    const release = await claimExport(rateLimitUid(req) ?? userId);
    let data: string;
    try {
      const { getDataExportService } = await import('../../services/data-export.js');
      const exportService = getDataExportService();
      data = await exportService.exportData(userId, body.format, body.categories || []);
    } finally {
      await release();
    }

    const contentType = body.format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `ferni-export-${new Date().toISOString().split('T')[0]}.${body.format}`;

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(data);
  } catch (err) {
    if (err instanceof ExportLimitError) {
      log.warn({ reason: err.reason }, 'Export stopped at a limit');
      const tooLarge = err.status === 413;
      if (!tooLarge) res.setHeader('Retry-After', err.status === 429 ? '600' : '60');
      const error = tooLarge
        ? API_ERRORS.DATA_EXPORT_TOO_LARGE
        : err.status === 429
          ? API_ERRORS.DATA_EXPORT_TOO_OFTEN
          : API_ERRORS.DATA_EXPORT_BUSY;
      sendJSON(res, { error, reason: err.reason }, err.status);
      return;
    }
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
  try {
    const body = await validateBody(req, res, DeleteAllDataSchema);
    if (!body) return;

    // Never body.userId: the caller is who their verified credentials say.
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return;

    if (body.confirmDelete !== true) {
      sendError(res, API_ERRORS.DATA_DELETE_CONFIRMATION, 400);
      return;
    }

    const { getDataExportService } = await import('../../services/data-export.js');
    const exportService = getDataExportService();
    assertErased(await exportService.deleteAllData(userId));

    log.info({ userId }, 'All user data deleted (GDPR request)');
    sendJSON(res, { success: true, message: 'All data deleted' });
  } catch (err) {
    log.error({ error: erasureErrorCode(err) }, 'Failed to delete data');
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
