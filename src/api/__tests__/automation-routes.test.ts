/**
 * Automation Routes API Tests
 *
 * Tests for autonomous action APIs including:
 * - Send message on behalf
 * - Create calendar events on behalf
 * - Audit log queries
 * - Pattern reinforcement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// Mocks
// ============================================================================

// Mock send-on-behalf service
const mockSendOnBehalf = {
  sendMessageOnBehalf: vi.fn(),
  executeApprovedMessage: vi.fn(),
  getMessageHistory: vi.fn(),
};

vi.mock('../../services/automation/send-on-behalf.js', () => mockSendOnBehalf);

// Mock calendar-on-behalf service
const mockCalendarOnBehalf = {
  createEventOnBehalf: vi.fn(),
  executeApprovedEvent: vi.fn(),
  deleteEvent: vi.fn(),
};

vi.mock('../../services/automation/calendar-on-behalf.js', () => mockCalendarOnBehalf);

// Mock audit-log service
const mockAuditLog = {
  queryAuditLog: vi.fn(),
  getAuditSummary: vi.fn(),
  getUndoableActions: vi.fn(),
  markUndone: vi.fn(),
};

vi.mock('../../services/automation/audit-log.js', () => mockAuditLog);

// Mock pattern-reinforcement service
const mockPatternReinforcement = {
  getPatternSummary: vi.fn(),
  processReinforcementOpportunities: vi.fn(),
  deliverReinforcement: vi.fn(),
  recordReinforcementReaction: vi.fn(),
};

vi.mock('../../services/automation/pattern-reinforcement.js', () => mockPatternReinforcement);

// Mock auth middleware
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId };
  }),
  rateLimit: vi.fn(() => false),
}));

// Mock helpers
vi.mock('../helpers.js', async () => {
  const actual = await vi.importActual('../helpers.js');
  return {
    ...actual,
    handleCorsPreflightIfNeeded: vi.fn(() => false),
    parseRequestBody: vi.fn().mockResolvedValue({}),
    sendJsonResponse: vi.fn((res, status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }),
  };
});

// Import after mocks
import { handleAutomationRoutes } from '../automation-routes.js';
import { parseRequestBody } from '../helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockRequest(options: {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = options.headers || {};
  req.url = options.url || '/';
  req.method = options.method || 'GET';
  return req;
}

function createMockResponse(): ServerResponse & { _data: string; _statusCode: number } {
  const res = {
    _data: '',
    _statusCode: 200,
    writeHead: vi.fn(function (this: typeof res, status: number) {
      this._statusCode = status;
    }),
    end: vi.fn(function (this: typeof res, data?: string) {
      this._data = data || '';
    }),
    writableEnded: false,
  } as unknown as ServerResponse & { _data: string; _statusCode: number };
  return res;
}

// ============================================================================
// Tests
// ============================================================================

describe('Automation Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Route matching', () => {
    it('should not handle non-automation routes', async () => {
      const req = createMockRequest({
        url: '/api/other-route',
        method: 'GET',
        headers: { 'x-user-id': 'user-123' },
      });
      const res = createMockResponse();

      const handled = await handleAutomationRoutes(req, res, '/api/other-route');

      expect(handled).toBe(false);
    });

    it('should handle automation routes', async () => {
      mockAuditLog.queryAuditLog.mockResolvedValue([]);

      const req = createMockRequest({
        url: '/api/automation/audit-log',
        method: 'GET',
        headers: { 'x-user-id': 'user-123', host: 'localhost:3000' },
      });
      const res = createMockResponse();

      const handled = await handleAutomationRoutes(req, res, '/api/automation/audit-log');

      expect(handled).toBe(true);
    });
  });

  describe('POST /api/automation/send-message', () => {
    it('should require channel, recipient, and message', async () => {
      vi.mocked(parseRequestBody).mockResolvedValue({});

      const req = createMockRequest({
        url: '/api/automation/send-message',
        method: 'POST',
        headers: { 'x-user-id': 'user-123' },
      });
      const res = createMockResponse();

      await handleAutomationRoutes(req, res, '/api/automation/send-message');

      expect(res._statusCode).toBe(400);
      expect(JSON.parse(res._data)).toEqual({
        success: false,
        error: 'channel, recipient, and message are required',
      });
    });

    it('should send message on behalf successfully', async () => {
      vi.mocked(parseRequestBody).mockResolvedValue({
        channel: 'sms',
        recipient: { name: 'John', phone: '+1234567890' },
        message: 'Hello!',
      });
      mockSendOnBehalf.sendMessageOnBehalf.mockResolvedValue({
        success: true,
        requiresApproval: false,
        messageId: 'msg-123',
      });

      const req = createMockRequest({
        url: '/api/automation/send-message',
        method: 'POST',
        headers: { 'x-user-id': 'user-123' },
      });
      const res = createMockResponse();

      await handleAutomationRoutes(req, res, '/api/automation/send-message');

      expect(res._statusCode).toBe(200);
      expect(mockSendOnBehalf.sendMessageOnBehalf).toHaveBeenCalledWith({
        userId: 'user-123',
        channel: 'sms',
        recipient: { name: 'John', phone: '+1234567890' },
        message: 'Hello!',
        context: undefined,
        metadata: undefined,
      });
    });
  });

  describe('POST /api/automation/create-event', () => {
    it('should require title and startTime', async () => {
      vi.mocked(parseRequestBody).mockResolvedValue({});

      const req = createMockRequest({
        url: '/api/automation/create-event',
        method: 'POST',
        headers: { 'x-user-id': 'user-123' },
      });
      const res = createMockResponse();

      await handleAutomationRoutes(req, res, '/api/automation/create-event');

      expect(res._statusCode).toBe(400);
      expect(JSON.parse(res._data)).toEqual({
        success: false,
        error: 'title and startTime are required',
      });
    });

    it('should create event on behalf successfully', async () => {
      vi.mocked(parseRequestBody).mockResolvedValue({
        title: 'Team Meeting',
        startTime: '2026-01-20T10:00:00Z',
      });
      mockCalendarOnBehalf.createEventOnBehalf.mockResolvedValue({
        success: true,
        requiresApproval: true,
        pendingActionId: 'action-123',
      });

      const req = createMockRequest({
        url: '/api/automation/create-event',
        method: 'POST',
        headers: { 'x-user-id': 'user-123' },
      });
      const res = createMockResponse();

      await handleAutomationRoutes(req, res, '/api/automation/create-event');

      expect(res._statusCode).toBe(200);
      expect(mockCalendarOnBehalf.createEventOnBehalf).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          title: 'Team Meeting',
          startTime: '2026-01-20T10:00:00Z',
        })
      );
    });
  });

  describe('GET /api/automation/audit-log', () => {
    it('should return audit log entries', async () => {
      const mockEntries = [
        { id: '1', actionType: 'send_sms', status: 'executed' },
        { id: '2', actionType: 'create_event', status: 'pending' },
      ];
      mockAuditLog.queryAuditLog.mockResolvedValue(mockEntries);

      const req = createMockRequest({
        url: '/api/automation/audit-log?limit=50',
        method: 'GET',
        headers: { 'x-user-id': 'user-123', host: 'localhost:3000' },
      });
      const res = createMockResponse();

      await handleAutomationRoutes(req, res, '/api/automation/audit-log');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);
      expect(data.success).toBe(true);
      expect(data.entries).toEqual(mockEntries);
      expect(data.count).toBe(2);
    });

    it('should filter by category', async () => {
      mockAuditLog.queryAuditLog.mockResolvedValue([]);

      const req = createMockRequest({
        url: '/api/automation/audit-log?category=messaging',
        method: 'GET',
        headers: { 'x-user-id': 'user-123', host: 'localhost:3000' },
      });
      const res = createMockResponse();

      await handleAutomationRoutes(req, res, '/api/automation/audit-log');

      expect(mockAuditLog.queryAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          category: 'messaging',
        })
      );
    });
  });

  describe('GET /api/automation/audit-log/summary', () => {
    it('should return audit summary', async () => {
      const mockSummary = {
        totalActions: 100,
        byCategory: { messaging: 50, calendar: 50 },
        byStatus: { executed: 80, pending: 20 },
      };
      mockAuditLog.getAuditSummary.mockResolvedValue(mockSummary);

      const req = createMockRequest({
        url: '/api/automation/audit-log/summary?days=30',
        method: 'GET',
        headers: { 'x-user-id': 'user-123', host: 'localhost:3000' },
      });
      const res = createMockResponse();

      await handleAutomationRoutes(req, res, '/api/automation/audit-log/summary');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);
      expect(data.success).toBe(true);
      expect(data.summary).toEqual(mockSummary);
    });
  });

  describe('Pattern Reinforcement Endpoints', () => {
    describe('GET /api/automation/patterns', () => {
      it('should return pattern summary', async () => {
        const mockSummary = {
          totalPatterns: 5,
          patterns: [
            { type: 'habit_streak', count: 3 },
            { type: 'mood_improvement', count: 2 },
          ],
        };
        mockPatternReinforcement.getPatternSummary.mockResolvedValue(mockSummary);

        const req = createMockRequest({
          url: '/api/automation/patterns',
          method: 'GET',
          headers: { 'x-user-id': 'user-123' },
        });
        const res = createMockResponse();

        await handleAutomationRoutes(req, res, '/api/automation/patterns');

        expect(res._statusCode).toBe(200);
        const data = JSON.parse(res._data);
        expect(data.success).toBe(true);
        expect(data.totalPatterns).toBe(5);
      });
    });

    describe('GET /api/automation/patterns/reinforcements', () => {
      it('should return pending reinforcement messages', async () => {
        const mockMessages = [
          {
            patternId: 'pattern-1',
            message: 'Great job on your 7-day streak!',
            personaVoice: 'maya',
          },
        ];
        mockPatternReinforcement.processReinforcementOpportunities.mockResolvedValue(mockMessages);

        const req = createMockRequest({
          url: '/api/automation/patterns/reinforcements',
          method: 'GET',
          headers: { 'x-user-id': 'user-123' },
        });
        const res = createMockResponse();

        await handleAutomationRoutes(req, res, '/api/automation/patterns/reinforcements');

        expect(res._statusCode).toBe(200);
        const data = JSON.parse(res._data);
        expect(data.success).toBe(true);
        expect(data.messages).toEqual(mockMessages);
        expect(data.count).toBe(1);
      });
    });

    describe('POST /api/automation/patterns/reinforcements/:id/deliver', () => {
      it('should mark reinforcement as delivered', async () => {
        const mockMessage = {
          patternId: 'pattern-1',
          message: 'Great job!',
          personaVoice: 'maya',
        };
        mockPatternReinforcement.processReinforcementOpportunities.mockResolvedValue([mockMessage]);
        mockPatternReinforcement.deliverReinforcement.mockResolvedValue(undefined);

        const req = createMockRequest({
          url: '/api/automation/patterns/reinforcements/pattern-1/deliver',
          method: 'POST',
          headers: { 'x-user-id': 'user-123' },
        });
        const res = createMockResponse();

        await handleAutomationRoutes(
          req,
          res,
          '/api/automation/patterns/reinforcements/pattern-1/deliver'
        );

        expect(res._statusCode).toBe(200);
        expect(mockPatternReinforcement.deliverReinforcement).toHaveBeenCalledWith(mockMessage);
      });

      it('should return 404 if reinforcement not found', async () => {
        mockPatternReinforcement.processReinforcementOpportunities.mockResolvedValue([]);

        const req = createMockRequest({
          url: '/api/automation/patterns/reinforcements/nonexistent/deliver',
          method: 'POST',
          headers: { 'x-user-id': 'user-123' },
        });
        const res = createMockResponse();

        await handleAutomationRoutes(
          req,
          res,
          '/api/automation/patterns/reinforcements/nonexistent/deliver'
        );

        expect(res._statusCode).toBe(404);
        const data = JSON.parse(res._data);
        expect(data.error).toBe('Reinforcement message not found');
      });
    });

    describe('POST /api/automation/patterns/reinforcements/:id/feedback', () => {
      it('should record user feedback', async () => {
        vi.mocked(parseRequestBody).mockResolvedValue({ reaction: 'engaged' });
        mockPatternReinforcement.recordReinforcementReaction.mockResolvedValue(undefined);

        const req = createMockRequest({
          url: '/api/automation/patterns/reinforcements/pattern-1/feedback',
          method: 'POST',
          headers: { 'x-user-id': 'user-123' },
        });
        const res = createMockResponse();

        await handleAutomationRoutes(
          req,
          res,
          '/api/automation/patterns/reinforcements/pattern-1/feedback'
        );

        expect(res._statusCode).toBe(200);
        expect(mockPatternReinforcement.recordReinforcementReaction).toHaveBeenCalledWith(
          'user-123',
          'pattern-1',
          'engaged'
        );
      });

      it('should require reaction parameter', async () => {
        vi.mocked(parseRequestBody).mockResolvedValue({});

        const req = createMockRequest({
          url: '/api/automation/patterns/reinforcements/pattern-1/feedback',
          method: 'POST',
          headers: { 'x-user-id': 'user-123' },
        });
        const res = createMockResponse();

        await handleAutomationRoutes(
          req,
          res,
          '/api/automation/patterns/reinforcements/pattern-1/feedback'
        );

        expect(res._statusCode).toBe(400);
        const data = JSON.parse(res._data);
        expect(data.error).toContain('reaction is required');
      });
    });
  });

  describe('Authentication', () => {
    it('should require authentication', async () => {
      const req = createMockRequest({
        url: '/api/automation/audit-log',
        method: 'GET',
        headers: {}, // No user-id
      });
      const res = createMockResponse();

      await handleAutomationRoutes(req, res, '/api/automation/audit-log');

      expect(res._statusCode).toBe(401);
    });
  });
});
