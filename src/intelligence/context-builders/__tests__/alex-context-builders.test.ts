/**
 * Tests for Alex's Context Builders
 *
 * Tests calendar-awareness, contact-awareness, and message-review-awareness
 * context builders that power Alex's communication capabilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => createMockLogger()),
});

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => createMockLogger(),
  getLogger: () => createMockLogger(),
}));

// Mock calendar service
const mockIsConnected = vi.fn();
const mockGetDayOverview = vi.fn();

vi.mock('../../../services/calendar/calendar-service.js', () => ({
  isConnected: (...args: unknown[]) => mockIsConnected(...args),
  getDayOverview: (...args: unknown[]) => mockGetDayOverview(...args),
}));

// Mock calendar intelligence
const mockDetectCalendarAlerts = vi.fn();

vi.mock('../../../services/calendar/calendar-intelligence.js', () => ({
  detectCalendarAlerts: (...args: unknown[]) => mockDetectCalendarAlerts(...args),
}));

// Mock contact service
const mockGetRelationshipInsights = vi.fn();
const mockGetContactsNeedingAttention = vi.fn();

vi.mock('../../../services/contacts/contact-relationship-service.js', () => ({
  getRelationshipInsights: (...args: unknown[]) => mockGetRelationshipInsights(...args),
  getContactsNeedingAttention: (...args: unknown[]) => mockGetContactsNeedingAttention(...args),
}));

// Mock message validation service
const mockGetPendingMessages = vi.fn();
const mockGetMessagesReadyForReview = vi.fn();

vi.mock('../../../services/message-validation/message-validation-service.js', () => ({
  getPendingMessages: (...args: unknown[]) => mockGetPendingMessages(...args),
  getMessagesReadyForReview: (...args: unknown[]) => mockGetMessagesReadyForReview(...args),
}));

// Import after mocks
import { buildCalendarAwarenessContext } from '../calendar-awareness.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockDayOverview(overrides = {}) {
  return {
    totalEvents: 3,
    busyHours: 4,
    freeHours: 4,
    events: [
      {
        id: 'event-1',
        title: 'Team Standup',
        startTime: new Date('2024-01-15T09:00:00'),
        endTime: new Date('2024-01-15T09:30:00'),
      },
      {
        id: 'event-2',
        title: 'Client Call',
        startTime: new Date('2024-01-15T14:00:00'),
        endTime: new Date('2024-01-15T15:00:00'),
      },
    ],
    firstEvent: {
      id: 'event-1',
      title: 'Team Standup',
      startTime: new Date('2024-01-15T09:00:00'),
      endTime: new Date('2024-01-15T09:30:00'),
    },
    isOverloaded: false,
    summary: '3 meetings today',
    ...overrides,
  };
}

// ============================================================================
// CALENDAR AWARENESS TESTS
// ============================================================================

describe('calendar-awareness context builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('persona filtering', () => {
    it('should only activate for alex-chen persona', async () => {
      const result = await buildCalendarAwarenessContext('user-123', 'ferni');

      expect(result.isConnected).toBe(false);
      expect(result.contextInjection).toBeNull();
      expect(mockIsConnected).not.toHaveBeenCalled();
    });

    it('should activate for alex-chen persona', async () => {
      mockIsConnected.mockResolvedValue(false);

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      expect(mockIsConnected).toHaveBeenCalledWith('user-123');
    });
  });

  describe('calendar not connected', () => {
    it('should suggest connecting when calendar not connected', async () => {
      mockIsConnected.mockResolvedValue(false);

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      expect(result.isConnected).toBe(false);
      expect(result.contextInjection).toContain('Not connected');
      expect(result.contextInjection).toContain('suggest connecting');
    });
  });

  describe('calendar connected', () => {
    beforeEach(() => {
      mockIsConnected.mockResolvedValue(true);
      mockGetDayOverview.mockResolvedValue(createMockDayOverview());
      mockDetectCalendarAlerts.mockResolvedValue([]);
    });

    it('should return connected status when calendar is linked', async () => {
      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      expect(result.isConnected).toBe(true);
      expect(result.todayOverview).toBeDefined();
    });

    it('should include day overview in context', async () => {
      mockGetDayOverview.mockResolvedValue(
        createMockDayOverview({
          totalEvents: 5,
          busyHours: 6,
          isOverloaded: true,
        })
      );

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      expect(result.todayOverview?.totalEvents).toBe(5);
      expect(result.todayOverview?.isOverloaded).toBe(true);
    });

    it('should include alerts in context', async () => {
      mockDetectCalendarAlerts.mockResolvedValue([
        {
          type: 'overload',
          severity: 'warning',
          message: 'Heavy day ahead',
        },
      ]);

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts?.[0].type).toBe('overload');
    });
  });

  describe('error handling', () => {
    it('should handle calendar service errors gracefully', async () => {
      mockIsConnected.mockResolvedValue(true);
      mockGetDayOverview.mockRejectedValue(new Error('API error'));

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      expect(result.isConnected).toBe(true);
      expect(result.contextInjection).toContain('error');
    });
  });

  describe('missing userId', () => {
    it('should return null context when userId is missing', async () => {
      const result = await buildCalendarAwarenessContext(undefined, 'alex-chen');

      expect(result.isConnected).toBe(false);
      expect(result.contextInjection).toBeNull();
    });
  });
});

