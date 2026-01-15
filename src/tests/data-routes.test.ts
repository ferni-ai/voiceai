/**
 * Data Routes Tests
 *
 * Tests for data export/delete API endpoints:
 * - GET /api/export/categories - Get exportable categories
 * - POST /api/export - Export user data
 * - DELETE /api/export/all - GDPR data deletion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Use vi.hoisted to define mocks that are available when vi.mock is hoisted
const { mockExportService, mockValidateBody } = vi.hoisted(() => ({
  mockExportService: {
    getExportableCategories: vi.fn(),
    exportData: vi.fn(),
    deleteAllData: vi.fn(),
  },
  mockValidateBody: vi.fn(),
}));

// Mock data export service
vi.mock('../services/data-layer/data-export.js', () => ({
  getDataExportService: vi.fn(() => mockExportService),
}));

// Mock logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock helpers
vi.mock('../api/helpers.js', () => ({
  requireUserId: vi.fn((_req: unknown, res: ServerResponse, parsedUrl: URL) => {
    const userId = parsedUrl.searchParams.get('userId');
    if (!userId) {
      (res as { writeHead: (s: number, h?: Record<string, string>) => void }).writeHead(401);
      (res as { end: (d?: string) => void }).end(JSON.stringify({ error: 'User ID required' }));
      return null;
    }
    return userId;
  }),
  sendJSON: vi.fn((res: ServerResponse, data: unknown, status = 200) => {
    (res as { writeHead: (s: number, h?: Record<string, string>) => void }).writeHead(status, {
      'Content-Type': 'application/json',
    });
    (res as { end: (d?: string) => void }).end(JSON.stringify(data));
  }),
  sendError: vi.fn((res: ServerResponse, message: string, status: number) => {
    (res as { writeHead: (s: number, h?: Record<string, string>) => void }).writeHead(status);
    (res as { end: (d?: string) => void }).end(JSON.stringify({ error: message }));
  }),
}));

// Mock validators
vi.mock('../api/validators.js', () => ({
  validateBody: mockValidateBody,
  ExportDataSchema: {},
  DeleteAllDataSchema: {},
}));

// Mock API errors
vi.mock('../api/error-messages.js', () => ({
  API_ERRORS: {
    DATA_EXPORT_FAILED: 'Failed to export data',
    DATA_DELETE_CONFIRMATION: 'Delete confirmation required',
    DATA_DELETE_FAILED: 'Failed to delete data',
  },
}));

import {
  handleGetExportCategories,
  handleExportData,
  handleDeleteAllData,
  handleDataRoutes,
} from '../api/routes/data.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}): IncomingMessage {
  const { method = 'GET', url = '/', headers = {}, body = '' } = options;

  const req = {
    method,
    url,
    headers: { 'x-user-id': 'test-user', host: 'localhost:3002', ...headers },
    on: vi.fn((event: string, callback: (chunk?: unknown) => void) => {
      if (event === 'data' && body) {
        setTimeout(() => callback(Buffer.from(body)), 0);
      }
      if (event === 'end') {
        setTimeout(() => callback(), 1);
      }
      return req;
    }),
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;

  return req;
}

function createMockResponse(): {
  res: ServerResponse;
  getWrittenData: () => { status?: number; headers?: Record<string, string>; body?: string };
} {
  let status: number | undefined;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead: vi.fn((s: number, h?: Record<string, string>) => {
      status = s;
      if (h) headers = { ...headers, ...h };
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    end: vi.fn((data?: string) => {
      if (data) body = data;
    }),
  } as unknown as ServerResponse;

  return {
    res,
    getWrittenData: () => ({ status, headers, body }),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Data Routes', () => {
  const sampleCategories = [
    { id: 'conversations', name: 'Conversations', description: 'Chat history' },
    { id: 'goals', name: 'Financial Goals', description: 'Savings and investment goals' },
    { id: 'preferences', name: 'Preferences', description: 'App settings' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockExportService.getExportableCategories.mockResolvedValue(sampleCategories);
    mockExportService.exportData.mockResolvedValue('{"data":"exported"}');
    mockExportService.deleteAllData.mockResolvedValue(undefined);
  });

  describe('handleGetExportCategories', () => {
    it('should return exportable categories', async () => {
      const req = createMockRequest({ url: '/api/export/categories' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export/categories?userId=test-user', 'http://localhost:3002');

      await handleGetExportCategories(req, res, parsedUrl);

      expect(mockExportService.getExportableCategories).toHaveBeenCalledWith('test-user');
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.categories).toEqual(sampleCategories);
    });

    it('should return 401 when userId missing', async () => {
      const req = createMockRequest({ url: '/api/export/categories' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export/categories', 'http://localhost:3002'); // No userId

      await handleGetExportCategories(req, res, parsedUrl);

      expect(getWrittenData().status).toBe(401);
    });

    it('should handle service errors gracefully', async () => {
      mockExportService.getExportableCategories.mockRejectedValue(new Error('Service error'));

      const req = createMockRequest({ url: '/api/export/categories' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export/categories?userId=test-user', 'http://localhost:3002');

      await handleGetExportCategories(req, res, parsedUrl);

      expect(getWrittenData().status).toBe(500);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.categories).toEqual([]);
    });
  });

  describe('handleExportData', () => {
    it('should export data as JSON', async () => {
      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        format: 'json',
        categories: ['conversations'],
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/export',
      });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export', 'http://localhost:3002');

      await handleExportData(req, res, parsedUrl);

      expect(mockExportService.exportData).toHaveBeenCalledWith('test-user', 'json', [
        'conversations',
      ]);
      expect(getWrittenData().status).toBe(200);
      expect(getWrittenData().headers?.['Content-Type']).toBe('application/json');
    });

    it('should export data as CSV', async () => {
      mockExportService.exportData.mockResolvedValue('col1,col2\nval1,val2');

      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        format: 'csv',
        categories: ['goals'],
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/export',
      });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export', 'http://localhost:3002');

      await handleExportData(req, res, parsedUrl);

      expect(getWrittenData().status).toBe(200);
      expect(getWrittenData().headers?.['Content-Type']).toBe('text/csv');
    });

    it('should include Content-Disposition header with filename', async () => {
      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        format: 'json',
      });

      const req = createMockRequest({ method: 'POST', url: '/api/export' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export', 'http://localhost:3002');

      await handleExportData(req, res, parsedUrl);

      expect(getWrittenData().headers?.['Content-Disposition']).toContain('attachment');
      expect(getWrittenData().headers?.['Content-Disposition']).toContain('ferni-export-');
    });

    it('should handle validation failure', async () => {
      mockValidateBody.mockResolvedValue(null);

      const req = createMockRequest({ method: 'POST', url: '/api/export' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/export', 'http://localhost:3002');

      await handleExportData(req, res, parsedUrl);

      expect(mockExportService.exportData).not.toHaveBeenCalled();
    });

    it('should handle export errors', async () => {
      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        format: 'json',
      });
      mockExportService.exportData.mockRejectedValue(new Error('Export failed'));

      const req = createMockRequest({ method: 'POST', url: '/api/export' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export', 'http://localhost:3002');

      await handleExportData(req, res, parsedUrl);

      expect(getWrittenData().status).toBe(500);
    });
  });

  describe('handleDeleteAllData', () => {
    it('should delete all user data when confirmed', async () => {
      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        confirmDelete: true,
      });

      const req = createMockRequest({ method: 'DELETE', url: '/api/export/all' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export/all', 'http://localhost:3002');

      await handleDeleteAllData(req, res, parsedUrl);

      expect(mockExportService.deleteAllData).toHaveBeenCalledWith('test-user');
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
    });

    it('should return 400 when confirmation not provided', async () => {
      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        confirmDelete: false,
      });

      const req = createMockRequest({ method: 'DELETE', url: '/api/export/all' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export/all', 'http://localhost:3002');

      await handleDeleteAllData(req, res, parsedUrl);

      expect(mockExportService.deleteAllData).not.toHaveBeenCalled();
      expect(getWrittenData().status).toBe(400);
    });

    it('should handle validation failure', async () => {
      mockValidateBody.mockResolvedValue(null);

      const req = createMockRequest({ method: 'DELETE', url: '/api/export/all' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/export/all', 'http://localhost:3002');

      await handleDeleteAllData(req, res, parsedUrl);

      expect(mockExportService.deleteAllData).not.toHaveBeenCalled();
    });

    it('should handle delete errors', async () => {
      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        confirmDelete: true,
      });
      mockExportService.deleteAllData.mockRejectedValue(new Error('Delete failed'));

      const req = createMockRequest({ method: 'DELETE', url: '/api/export/all' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export/all', 'http://localhost:3002');

      await handleDeleteAllData(req, res, parsedUrl);

      expect(getWrittenData().status).toBe(500);
    });
  });

  describe('handleDataRoutes', () => {
    it('should route GET /api/export/categories', async () => {
      const req = createMockRequest({ method: 'GET', url: '/api/export/categories' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export/categories?userId=test-user', 'http://localhost:3002');

      const handled = await handleDataRoutes(req, res, '/api/export/categories', parsedUrl);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
    });

    it('should route POST /api/export', async () => {
      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        format: 'json',
      });

      const req = createMockRequest({ method: 'POST', url: '/api/export' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export', 'http://localhost:3002');

      const handled = await handleDataRoutes(req, res, '/api/export', parsedUrl);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
    });

    it('should route DELETE /api/export/all', async () => {
      mockValidateBody.mockResolvedValue({
        userId: 'test-user',
        confirmDelete: true,
      });

      const req = createMockRequest({ method: 'DELETE', url: '/api/export/all' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/export/all', 'http://localhost:3002');

      const handled = await handleDataRoutes(req, res, '/api/export/all', parsedUrl);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
    });

    it('should return false for non-data routes', async () => {
      const req = createMockRequest({ method: 'GET', url: '/api/other' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/other', 'http://localhost:3002');

      const handled = await handleDataRoutes(req, res, '/api/other', parsedUrl);

      expect(handled).toBe(false);
    });

    it('should return false for wrong method on categories', async () => {
      const req = createMockRequest({ method: 'POST', url: '/api/export/categories' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/export/categories', 'http://localhost:3002');

      const handled = await handleDataRoutes(req, res, '/api/export/categories', parsedUrl);

      expect(handled).toBe(false);
    });

    it('should return false for wrong method on export', async () => {
      const req = createMockRequest({ method: 'GET', url: '/api/export' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/export', 'http://localhost:3002');

      const handled = await handleDataRoutes(req, res, '/api/export', parsedUrl);

      expect(handled).toBe(false);
    });

    it('should return false for wrong method on delete', async () => {
      const req = createMockRequest({ method: 'POST', url: '/api/export/all' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/export/all', 'http://localhost:3002');

      const handled = await handleDataRoutes(req, res, '/api/export/all', parsedUrl);

      expect(handled).toBe(false);
    });
  });
});
