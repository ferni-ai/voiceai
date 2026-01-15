/**
 * Data Export/Delete Routes
 *
 * GET /api/export/categories - Get exportable categories
 * POST /api/export - Export user data
 * DELETE /api/export/all - GDPR data deletion
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendError } from '../helpers.js';
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

  try {
    const { getDataExportService } = await import('../../services/data-layer/data-export.js');
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
  try {
    const body = await validateBody(req, res, ExportDataSchema);
    if (!body) return;

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const { getDataExportService } = await import('../../services/data-layer/data-export.js');
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
  try {
    const body = await validateBody(req, res, DeleteAllDataSchema);
    if (!body) return;

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    if (body.confirmDelete !== true) {
      sendError(res, API_ERRORS.DATA_DELETE_CONFIRMATION, 400);
      return;
    }

    const { getDataExportService } = await import('../../services/data-layer/data-export.js');
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
