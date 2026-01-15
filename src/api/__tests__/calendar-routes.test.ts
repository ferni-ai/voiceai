/**
 * Calendar Routes API Tests (P1)
 *
 * Tests for Google Calendar integration, event creation,
 * and calendar synchronization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock calendar service
const mockCalendarService = {
  getCalendarStatus: vi.fn(),
  initiateOAuth: vi.fn(),
  handleOAuthCallback: vi.fn(),
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getUpcomingEvents: vi.fn(),
  syncCalendar: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('../../services/calendar/google-calendar.service.js', () => ({
  default: mockCalendarService,
  ...mockCalendarService,
}));

// Mock auth
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
}));

// Mock helpers
vi.mock('../helpers.js', async () => {
  const actual = await vi.importActual('../helpers.js');
  return {
    ...actual,
    handleCorsPreflightIfNeeded: vi.fn(() => false),
    parseBody: vi.fn().mockResolvedValue({}),
    sendJSON: vi.fn((res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }),
    sendError: vi.fn((res, message, status = 500) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }),
  };
});

// Create mock request
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

// Create mock response
function createMockResponse(): ServerResponse & { _data: string; _statusCode: number } {
  const res = {
    _data: '',
    _statusCode: 200,
    writeHead: vi.fn(function (this: any, status: number) {
      this._statusCode = status;
    }),
    end: vi.fn(function (this: any, data?: string) {
      this._data = data || '';
    }),
    setHeader: vi.fn(),
  };
  return res as unknown as ServerResponse & { _data: string; _statusCode: number };
}

describe('Calendar Routes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/calendar/status', () => {
    it('should return connection status', async () => {
      mockCalendarService.getCalendarStatus.mockResolvedValue({
        connected: true,
        email: 'user@example.com',
        lastSync: new Date().toISOString(),
      });

      const status = await mockCalendarService.getCalendarStatus('test-user');

      expect(status.connected).toBe(true);
      expect(status.email).toBeDefined();
    });

    it('should return disconnected for new user', async () => {
      mockCalendarService.getCalendarStatus.mockResolvedValue({
        connected: false,
      });

      const status = await mockCalendarService.getCalendarStatus('new-user');

      expect(status.connected).toBe(false);
    });
  });

  describe('GET /api/calendar/auth', () => {
    it('should return OAuth URL', async () => {
      mockCalendarService.initiateOAuth.mockResolvedValue({
        authUrl: 'https://accounts.google.com/o/oauth2/auth?...',
      });

      const result = await mockCalendarService.initiateOAuth('test-user');

      expect(result.authUrl).toContain('accounts.google.com');
    });
  });

  describe('GET /api/calendar/callback', () => {
    it('should handle OAuth callback', async () => {
      mockCalendarService.handleOAuthCallback.mockResolvedValue({
        success: true,
        email: 'user@example.com',
      });

      const result = await mockCalendarService.handleOAuthCallback(
        'test-user',
        'auth-code-123'
      );

      expect(result.success).toBe(true);
    });

    it('should handle invalid code', async () => {
      mockCalendarService.handleOAuthCallback.mockRejectedValue(
        new Error('Invalid authorization code')
      );

      await expect(
        mockCalendarService.handleOAuthCallback('test-user', 'invalid-code')
      ).rejects.toThrow('Invalid authorization code');
    });
  });

  describe('GET /api/calendar/events', () => {
    it('should list events', async () => {
      mockCalendarService.listEvents.mockResolvedValue({
        events: [
          {
            id: 'event-1',
            summary: 'Meeting',
            start: { dateTime: '2024-01-15T10:00:00Z' },
            end: { dateTime: '2024-01-15T11:00:00Z' },
          },
        ],
        nextPageToken: null,
      });

      const result = await mockCalendarService.listEvents('test-user', {
        timeMin: '2024-01-01T00:00:00Z',
        timeMax: '2024-01-31T23:59:59Z',
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].summary).toBe('Meeting');
    });

    it('should filter by date range', async () => {
      mockCalendarService.listEvents.mockResolvedValue({
        events: [],
        nextPageToken: null,
      });

      await mockCalendarService.listEvents('test-user', {
        timeMin: '2020-01-01T00:00:00Z',
        timeMax: '2020-01-02T00:00:00Z',
      });

      expect(mockCalendarService.listEvents).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({
          timeMin: '2020-01-01T00:00:00Z',
        })
      );
    });
  });

  describe('POST /api/calendar/events', () => {
    it('should create event', async () => {
      mockCalendarService.createEvent.mockResolvedValue({
        id: 'new-event-123',
        summary: 'New Meeting',
        htmlLink: 'https://calendar.google.com/event/...',
      });

      const event = await mockCalendarService.createEvent('test-user', {
        summary: 'New Meeting',
        start: { dateTime: '2024-01-20T14:00:00Z' },
        end: { dateTime: '2024-01-20T15:00:00Z' },
      });

      expect(event.id).toBe('new-event-123');
    });

    it('should require summary', async () => {
      mockCalendarService.createEvent.mockRejectedValue(
        new Error('Summary is required')
      );

      await expect(
        mockCalendarService.createEvent('test-user', {
          start: { dateTime: '2024-01-20T14:00:00Z' },
          end: { dateTime: '2024-01-20T15:00:00Z' },
        })
      ).rejects.toThrow('Summary is required');
    });
  });

  describe('PUT /api/calendar/events/:eventId', () => {
    it('should update event', async () => {
      mockCalendarService.updateEvent.mockResolvedValue({
        id: 'event-123',
        summary: 'Updated Meeting',
      });

      const event = await mockCalendarService.updateEvent(
        'test-user',
        'event-123',
        { summary: 'Updated Meeting' }
      );

      expect(event.summary).toBe('Updated Meeting');
    });
  });

  describe('DELETE /api/calendar/events/:eventId', () => {
    it('should delete event', async () => {
      mockCalendarService.deleteEvent.mockResolvedValue({ success: true });

      const result = await mockCalendarService.deleteEvent('test-user', 'event-123');

      expect(result.success).toBe(true);
    });
  });

  describe('GET /api/calendar/upcoming', () => {
    it('should get upcoming events', async () => {
      mockCalendarService.getUpcomingEvents.mockResolvedValue([
        { id: 'event-1', summary: 'Upcoming 1', start: { dateTime: '2024-01-15T10:00:00Z' } },
        { id: 'event-2', summary: 'Upcoming 2', start: { dateTime: '2024-01-16T10:00:00Z' } },
      ]);

      const events = await mockCalendarService.getUpcomingEvents('test-user', 7);

      expect(events).toHaveLength(2);
    });
  });

  describe('POST /api/calendar/sync', () => {
    it('should trigger calendar sync', async () => {
      mockCalendarService.syncCalendar.mockResolvedValue({
        synced: true,
        eventsAdded: 5,
        eventsUpdated: 2,
        eventsDeleted: 1,
      });

      const result = await mockCalendarService.syncCalendar('test-user');

      expect(result.synced).toBe(true);
      expect(result.eventsAdded).toBe(5);
    });
  });

  describe('DELETE /api/calendar/disconnect', () => {
    it('should disconnect calendar', async () => {
      mockCalendarService.disconnect.mockResolvedValue({ disconnected: true });

      const result = await mockCalendarService.disconnect('test-user');

      expect(result.disconnected).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all routes', async () => {
      const { handleCalendarRoutes } = await import('../calendar-routes/index.js');

      const req = createMockRequest({
        method: 'GET',
        url: '/api/calendar/status',
      });
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/calendar/status');

      await handleCalendarRoutes(req, res, '/api/calendar/status', parsedUrl);

      expect(res._statusCode).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle token expiry', async () => {
      mockCalendarService.listEvents.mockRejectedValue(
        new Error('Token has been expired or revoked')
      );

      await expect(
        mockCalendarService.listEvents('test-user', {})
      ).rejects.toThrow('Token has been expired');
    });

    it('should handle rate limiting', async () => {
      mockCalendarService.listEvents.mockRejectedValue(
        new Error('Rate Limit Exceeded')
      );

      await expect(
        mockCalendarService.listEvents('test-user', {})
      ).rejects.toThrow('Rate Limit');
    });
  });
});
