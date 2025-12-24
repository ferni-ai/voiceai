/**
 * Task Tracker Tests
 *
 * Tests for the concierge request lifecycle management.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TaskTracker,
  getTaskTracker,
  resetTaskTracker,
  type CreateRequestOptions,
} from '../tracker/task-tracker.js';
import type {
  ConciergeRequest,
  ConciergeTarget,
  ConciergeResult,
  ConciergeEvent,
  DiscoveredBusiness,
} from '../types.js';

// Mock Firestore
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null, // Disable Firestore for unit tests
}));

describe('task-tracker', () => {
  let tracker: TaskTracker;

  const mockBusiness: DiscoveredBusiness = {
    placeId: 'place_123',
    name: 'Test Hotel',
    address: '123 Main St',
    phone: '+1234567890',
    website: 'https://testhotel.com',
    rating: 4.5,
    priceLevel: 3,
    types: ['lodging', 'hotel'],
    location: { lat: 40.7128, lng: -74.006 },
  };

  const createTestRequest = (): CreateRequestOptions => ({
    userId: `test-user-${Date.now()}`,
    sessionId: `session-${Date.now()}`,
    domain: 'hotel',
    type: 'quote',
    description: 'Find hotel rates for weekend trip',
    requirements: {
      location: 'New York, NY',
      dateRange: {
        start: new Date('2025-02-01'),
        end: new Date('2025-02-03'),
      },
      guests: 2,
      rooms: 1,
    },
    preferredChannel: 'phone',
    maxTargets: 5,
    businesses: [mockBusiness],
  });

  beforeEach(() => {
    resetTaskTracker();
    tracker = getTaskTracker();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getTaskTracker', () => {
    it('should return singleton instance', () => {
      const tracker1 = getTaskTracker();
      const tracker2 = getTaskTracker();
      expect(tracker1).toBe(tracker2);
    });

    it('should return new instance after reset', () => {
      const tracker1 = getTaskTracker();
      resetTaskTracker();
      const tracker2 = getTaskTracker();
      expect(tracker1).not.toBe(tracker2);
    });
  });

  describe('createRequest', () => {
    it('should create a request with correct fields', async () => {
      const options = createTestRequest();
      const request = await tracker.createRequest(options);

      expect(request.id).toMatch(/^conc_\d+_[a-z0-9]+$/);
      expect(request.userId).toBe(options.userId);
      expect(request.domain).toBe('hotel');
      expect(request.type).toBe('quote');
      expect(request.description).toBe(options.description);
      expect(request.status).toBe('pending');
      expect(request.targets.length).toBe(1);
      expect(request.results).toHaveLength(0);
      expect(request.preferredChannel).toBe('phone');
    });

    it('should convert businesses to targets', async () => {
      const options = createTestRequest();
      const request = await tracker.createRequest(options);

      const target = request.targets[0];
      expect(target.name).toBe('Test Hotel');
      expect(target.phone).toBe('+1234567890');
      expect(target.source).toBe('google_places');
      expect(target.sourceId).toBe('place_123');
      expect(target.status).toBe('pending');
      expect(target.attempts).toBe(0);
      expect(target.priority).toBe(0);
    });

    it('should emit request_created event', async () => {
      const events: ConciergeEvent[] = [];
      tracker.onEvent((event) => events.push(event));

      const options = createTestRequest();
      const request = await tracker.createRequest(options);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('request_created');
      expect(events[0].requestId).toBe(request.id);
      expect(events[0].data?.targetCount).toBe(1);
    });

    it('should handle multiple businesses', async () => {
      const options = createTestRequest();
      options.businesses = [
        mockBusiness,
        { ...mockBusiness, placeId: 'place_456', name: 'Second Hotel' },
        { ...mockBusiness, placeId: 'place_789', name: 'Third Hotel' },
      ];

      const request = await tracker.createRequest(options);
      expect(request.targets.length).toBe(3);
      expect(request.targets[0].priority).toBe(0);
      expect(request.targets[1].priority).toBe(1);
      expect(request.targets[2].priority).toBe(2);
    });
  });

  describe('getRequest', () => {
    it('should return null for non-existent request', async () => {
      const request = await tracker.getRequest('non-existent-id');
      expect(request).toBeNull();
    });

    it('should return request by ID', async () => {
      const options = createTestRequest();
      const created = await tracker.createRequest(options);

      const retrieved = await tracker.getRequest(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.domain).toBe('hotel');
    });
  });

  describe('getUserRequests', () => {
    it('should return empty array for user with no requests', async () => {
      const requests = await tracker.getUserRequests('no-requests-user');
      expect(requests).toHaveLength(0);
    });

    it('should return all requests for a user', async () => {
      const userId = 'multi-request-user';

      await tracker.createRequest({ ...createTestRequest(), userId });
      await tracker.createRequest({ ...createTestRequest(), userId, domain: 'restaurant' });
      await tracker.createRequest({ ...createTestRequest(), userId: 'other-user' });

      const requests = await tracker.getUserRequests(userId);
      expect(requests.length).toBe(2);
      expect(requests.every((r) => r.userId === userId)).toBe(true);
    });
  });

  describe('updateStatus', () => {
    it('should update request status', async () => {
      const request = await tracker.createRequest(createTestRequest());

      await tracker.updateStatus(request.id, 'in_progress', 'Starting outreach');

      const updated = await tracker.getRequest(request.id);
      expect(updated?.status).toBe('in_progress');
      expect(updated?.statusMessage).toBe('Starting outreach');
    });

    it('should set completedAt for terminal statuses', async () => {
      const request = await tracker.createRequest(createTestRequest());

      await tracker.updateStatus(request.id, 'completed', 'All calls complete');

      const updated = await tracker.getRequest(request.id);
      expect(updated?.completedAt).toBeDefined();
    });

    it('should emit appropriate events for status changes', async () => {
      const events: ConciergeEvent[] = [];
      tracker.onEvent((event) => events.push(event));

      const request = await tracker.createRequest(createTestRequest());
      events.length = 0; // Clear creation event

      await tracker.updateStatus(request.id, 'completed', 'Done');

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('request_completed');
    });

    it('should handle non-existent request gracefully', async () => {
      // Should not throw
      await tracker.updateStatus('non-existent', 'completed', 'Done');
    });
  });

  describe('updateTargetStatus', () => {
    it('should update target status', async () => {
      const request = await tracker.createRequest(createTestRequest());
      const targetId = request.targets[0].id;

      await tracker.updateTargetStatus(request.id, targetId, 'calling');

      const updated = await tracker.getRequest(request.id);
      const target = updated?.targets.find((t) => t.id === targetId);
      expect(target?.status).toBe('calling');
      expect(target?.lastAttemptAt).toBeDefined();
    });

    it('should increment attempts for queued status', async () => {
      const request = await tracker.createRequest(createTestRequest());
      const targetId = request.targets[0].id;

      await tracker.updateTargetStatus(request.id, targetId, 'queued');

      const updated = await tracker.getRequest(request.id);
      const target = updated?.targets.find((t) => t.id === targetId);
      expect(target?.attempts).toBe(1);
    });

    it('should emit call_started event', async () => {
      const events: ConciergeEvent[] = [];
      tracker.onEvent((event) => events.push(event));

      const request = await tracker.createRequest(createTestRequest());
      const targetId = request.targets[0].id;
      events.length = 0;

      await tracker.updateTargetStatus(request.id, targetId, 'calling');

      const callEvent = events.find((e) => e.type === 'call_started');
      expect(callEvent).toBeDefined();
      expect(callEvent?.targetId).toBe(targetId);
    });

    it('should emit call_completed event', async () => {
      const events: ConciergeEvent[] = [];
      tracker.onEvent((event) => events.push(event));

      const request = await tracker.createRequest(createTestRequest());
      const targetId = request.targets[0].id;
      events.length = 0;

      await tracker.updateTargetStatus(request.id, targetId, 'completed');

      const callEvent = events.find((e) => e.type === 'call_completed');
      expect(callEvent).toBeDefined();
    });
  });

  describe('addResult', () => {
    it('should add result to request', async () => {
      const request = await tracker.createRequest(createTestRequest());
      const targetId = request.targets[0].id;

      await tracker.addResult(request.id, {
        requestId: request.id,
        targetId,
        channel: 'phone',
        attemptNumber: 1,
        success: true,
        summary: 'Got quote: $150/night',
        data: {
          price: 150,
          pricePerUnit: 150,
          available: true,
          currency: 'USD',
        },
        timestamp: new Date(),
      });

      const updated = await tracker.getRequest(request.id);
      expect(updated?.results.length).toBe(1);
      expect(updated?.results[0].success).toBe(true);
      expect(updated?.results[0].data.price).toBe(150);
    });

    it('should update target status on result', async () => {
      const request = await tracker.createRequest(createTestRequest());
      const targetId = request.targets[0].id;

      await tracker.addResult(request.id, {
        requestId: request.id,
        targetId,
        channel: 'phone',
        attemptNumber: 1,
        success: true,
        summary: 'Booked!',
        data: {},
        timestamp: new Date(),
      });

      const updated = await tracker.getRequest(request.id);
      const target = updated?.targets.find((t) => t.id === targetId);
      expect(target?.status).toBe('completed');
    });

    it('should emit result_received event', async () => {
      const events: ConciergeEvent[] = [];
      tracker.onEvent((event) => events.push(event));

      const request = await tracker.createRequest(createTestRequest());
      events.length = 0;

      await tracker.addResult(request.id, {
        requestId: request.id,
        targetId: request.targets[0].id,
        channel: 'phone',
        attemptNumber: 1,
        success: true,
        summary: 'Success',
        data: {},
        timestamp: new Date(),
      });

      const resultEvent = events.find((e) => e.type === 'result_received');
      expect(resultEvent).toBeDefined();
      expect(resultEvent?.data?.success).toBe(true);
    });
  });

  describe('setRecommendation', () => {
    it('should set recommendation and update status', async () => {
      const request = await tracker.createRequest(createTestRequest());
      const targetId = request.targets[0].id;

      await tracker.setRecommendation(request.id, {
        targetId,
        targetName: 'Test Hotel',
        reason: 'Best price and rating',
        confidence: 0.9,
        highlights: ['Great location', 'Free breakfast'],
      });

      const updated = await tracker.getRequest(request.id);
      expect(updated?.recommendation).toBeDefined();
      expect(updated?.recommendation?.targetName).toBe('Test Hotel');
      expect(updated?.recommendation?.confidence).toBe(0.9);
      expect(updated?.status).toBe('awaiting_user');
    });

    it('should emit awaiting_user event', async () => {
      const events: ConciergeEvent[] = [];
      tracker.onEvent((event) => events.push(event));

      const request = await tracker.createRequest(createTestRequest());
      events.length = 0;

      await tracker.setRecommendation(request.id, {
        targetId: request.targets[0].id,
        targetName: 'Test Hotel',
        reason: 'Best option',
        confidence: 0.85,
        highlights: [],
      });

      expect(events.some((e) => e.type === 'awaiting_user')).toBe(true);
    });
  });

  describe('getNextTarget', () => {
    it('should return pending target', async () => {
      const request = await tracker.createRequest(createTestRequest());

      const next = tracker.getNextTarget(request);
      expect(next).toBeDefined();
      expect(next?.status).toBe('pending');
    });

    it('should return no_answer target if below max attempts', async () => {
      const request = await tracker.createRequest(createTestRequest());
      request.targets[0].status = 'no_answer';
      request.targets[0].attempts = 1;

      const next = tracker.getNextTarget(request);
      expect(next).toBeDefined();
    });

    it('should skip no_answer target at max attempts', async () => {
      const request = await tracker.createRequest(createTestRequest());
      request.targets[0].status = 'no_answer';
      request.targets[0].attempts = 3; // maxAttempts = 3

      const next = tracker.getNextTarget(request);
      expect(next).toBeNull();
    });

    it('should return targets by priority order', async () => {
      const options = createTestRequest();
      options.businesses = [
        { ...mockBusiness, placeId: 'p1', name: 'Low Priority' },
        { ...mockBusiness, placeId: 'p2', name: 'High Priority' },
      ];

      const request = await tracker.createRequest(options);

      const next = tracker.getNextTarget(request);
      expect(next?.name).toBe('Low Priority'); // Index 0 has priority 0
    });

    it('should return null when all targets completed', async () => {
      const request = await tracker.createRequest(createTestRequest());
      request.targets[0].status = 'completed';

      const next = tracker.getNextTarget(request);
      expect(next).toBeNull();
    });
  });

  describe('isRequestComplete', () => {
    it('should return false for request with pending targets', async () => {
      const request = await tracker.createRequest(createTestRequest());

      expect(tracker.isRequestComplete(request)).toBe(false);
    });

    it('should return true when all targets are done', async () => {
      const request = await tracker.createRequest(createTestRequest());
      request.targets[0].status = 'completed';

      expect(tracker.isRequestComplete(request)).toBe(true);
    });

    it('should return true with 3 successful results', async () => {
      const options = createTestRequest();
      options.businesses = Array(5)
        .fill(null)
        .map((_, i) => ({
          ...mockBusiness,
          placeId: `place_${i}`,
          name: `Hotel ${i}`,
        }));

      const request = await tracker.createRequest(options);

      // Add 3 successful results
      for (let i = 0; i < 3; i++) {
        request.results.push({
          id: `result_${i}`,
          requestId: request.id,
          targetId: request.targets[i].id,
          channel: 'phone',
          attemptNumber: 1,
          success: true,
          summary: 'Got quote',
          data: {},
          timestamp: new Date(),
        });
      }

      expect(tracker.isRequestComplete(request)).toBe(true);
    });
  });

  describe('onEvent', () => {
    it('should subscribe to events', async () => {
      const events: ConciergeEvent[] = [];
      const unsubscribe = tracker.onEvent((event) => events.push(event));

      await tracker.createRequest(createTestRequest());

      expect(events.length).toBeGreaterThan(0);
      unsubscribe();
    });

    it('should unsubscribe from events', async () => {
      const events: ConciergeEvent[] = [];
      const unsubscribe = tracker.onEvent((event) => events.push(event));

      unsubscribe();
      await tracker.createRequest(createTestRequest());

      expect(events.length).toBe(0);
    });

    it('should handle listener errors gracefully', async () => {
      const errorListener = () => {
        throw new Error('Listener error');
      };
      const goodEvents: ConciergeEvent[] = [];

      tracker.onEvent(errorListener);
      tracker.onEvent((event) => goodEvents.push(event));

      // Should not throw
      await tracker.createRequest(createTestRequest());

      // Good listener should still receive events
      expect(goodEvents.length).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed requests from memory', async () => {
      const request = await tracker.createRequest(createTestRequest());
      await tracker.updateStatus(request.id, 'completed', 'Done');

      // Advance time past cleanup threshold (30 minutes)
      vi.advanceTimersByTime(31 * 60 * 1000);

      tracker.cleanup();

      // Request should be removed from memory cache
      // (getRequest will return null since Firestore is mocked)
      const retrieved = await tracker.getRequest(request.id);
      expect(retrieved).toBeNull();
    });

    it('should keep recent completed requests', async () => {
      const request = await tracker.createRequest(createTestRequest());
      await tracker.updateStatus(request.id, 'completed', 'Done');

      // Only advance 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      tracker.cleanup();

      const retrieved = await tracker.getRequest(request.id);
      expect(retrieved).toBeDefined();
    });

    it('should keep active requests', async () => {
      const request = await tracker.createRequest(createTestRequest());
      await tracker.updateStatus(request.id, 'in_progress', 'Working');

      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      tracker.cleanup();

      const retrieved = await tracker.getRequest(request.id);
      expect(retrieved).toBeDefined();
    });
  });
});
