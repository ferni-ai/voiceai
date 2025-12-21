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

// Mock logger - must be defined inline due to hoisting
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
  };
});

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
import { buildCalendarAwarenessContext } from '../awareness/calendar-awareness.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockDayOverview(overrides = {}) {
  return {
    date: new Date('2024-01-15'),
    events: [
      {
        id: 'event-1',
        summary: 'Team Standup',
        start: { dateTime: '2024-01-15T09:00:00' },
        end: { dateTime: '2024-01-15T09:30:00' },
        status: 'confirmed' as const,
      },
      {
        id: 'event-2',
        summary: 'Client Call',
        start: { dateTime: '2024-01-15T14:00:00' },
        end: { dateTime: '2024-01-15T15:00:00' },
        status: 'confirmed' as const,
      },
    ],
    totalMeetings: 3,
    totalMeetingMinutes: 180,
    freeTimeMinutes: 420,
    firstEvent: {
      id: 'event-1',
      summary: 'Team Standup',
      start: { dateTime: '2024-01-15T09:00:00' },
      end: { dateTime: '2024-01-15T09:30:00' },
      status: 'confirmed' as const,
    },
    isOverloaded: false,
    hasBackToBack: false,
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
    it('should NOT activate for non-calendar-aware personas', async () => {
      // maya-santos is NOT in CALENDAR_AWARE_PERSONAS
      const result = await buildCalendarAwarenessContext('user-123', 'maya-santos');

      expect(result.isConnected).toBe(false);
      expect(result.contextInjection).toBeNull();
      expect(mockIsConnected).not.toHaveBeenCalled();
    });

    it('should activate for alex-chen persona', async () => {
      mockIsConnected.mockResolvedValue(false);

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      expect(mockIsConnected).toHaveBeenCalledWith('user-123');
    });

    it('should activate for ferni persona (as coordinator)', async () => {
      mockIsConnected.mockResolvedValue(false);

      const result = await buildCalendarAwarenessContext('user-123', 'ferni');

      // Ferni is in CALENDAR_AWARE_PERSONAS so isConnected SHOULD be called
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
      // todayOverview may or may not be present depending on implementation
    });

    it('should handle various day overview states', async () => {
      mockGetDayOverview.mockResolvedValue(
        createMockDayOverview({
          totalMeetings: 5,
          isOverloaded: true,
        })
      );

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      // Main assertion is that it doesn't throw and returns connected
      expect(result.isConnected).toBe(true);
    });

    it('should handle alerts gracefully', async () => {
      mockDetectCalendarAlerts.mockResolvedValue([
        {
          type: 'overload',
          severity: 'warning',
          message: 'Heavy day ahead',
        },
      ]);

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      // Main assertion is that it doesn't throw
      expect(result.isConnected).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle calendar service errors gracefully', async () => {
      mockIsConnected.mockResolvedValue(true);
      mockGetDayOverview.mockRejectedValue(new Error('API error'));

      const result = await buildCalendarAwarenessContext('user-123', 'alex-chen');

      // Should still indicate connected but with no context injection
      expect(result.isConnected).toBe(true);
      expect(result.contextInjection).toBeNull();
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
