/**
 * Calendar on Behalf Tests
 * Run: pnpm vitest run src/tests/agi-features/calendar-on-behalf.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateTestUserId, createMockFirestoreDb } from './index.js';

const mockFirestoreDb = createMockFirestoreDb();
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => mockFirestoreDb) }));
vi.mock('../../services/automation/trust-level-system.js', () => ({
  checkActionPermission: vi
    .fn()
    .mockResolvedValue({ success: true, requiresApproval: true, pendingActionId: 'mock_123' }),
  markActionExecuted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/calendar/calendar-service.js', () => ({
  isConnected: vi.fn().mockResolvedValue(true),
  createEvent: vi
    .fn()
    .mockResolvedValue({ id: 'mock_event_id', htmlLink: 'https://calendar.google.com/event/123' }),
  deleteEvent: vi.fn().mockResolvedValue(true),
}));

import {
  createEventOnBehalf,
  deleteEvent,
  type CalendarEventRequest,
} from '../../services/automation/calendar-on-behalf.js';

describe('Calendar on Behalf', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('calendar');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
  });

  describe('Request Validation', () => {
    it('should reject request without userId', async () => {
      const request: CalendarEventRequest = { userId: '', title: 'Meeting', startTime: new Date() };
      const result = await createEventOnBehalf(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should reject request without title', async () => {
      const request: CalendarEventRequest = {
        userId: testUserId,
        title: '',
        startTime: new Date(),
      };
      const result = await createEventOnBehalf(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    it('should accept valid request', async () => {
      const request: CalendarEventRequest = {
        userId: testUserId,
        title: 'Meeting',
        startTime: new Date(Date.now() + 86400000),
      };
      const result = await createEventOnBehalf(request);
      expect(result.success).toBe(true);
    });
  });

  describe('Approval Flow', () => {
    it('should require approval for new users', async () => {
      const request: CalendarEventRequest = {
        userId: testUserId,
        title: 'Meeting',
        startTime: new Date(Date.now() + 86400000),
      };
      const result = await createEventOnBehalf(request);
      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.pendingActionId).toBeDefined();
    });
  });

  describe('Event Deletion', () => {
    it('should delete event successfully', async () => {
      const result = await deleteEvent(testUserId, 'test_event_id');
      expect(result.success).toBe(true);
    });
  });
});
