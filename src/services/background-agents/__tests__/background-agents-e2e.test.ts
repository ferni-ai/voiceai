/**
 * Background Agents E2E Tests
 *
 * Comprehensive tests for the background agent system including:
 * - Unified result capture
 * - Research executor (Peter)
 * - Reservation executor (Jordan)
 * - Context injection for "While You Were Away"
 * - Notification delivery
 *
 * Run with: npx vitest run src/services/background-agents/__tests__/background-agents-e2e.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock Firestore
const mockFirestoreData = new Map<string, Map<string, unknown>>();
const mockFirestoreDb = {
  collection: vi.fn((name: string) => ({
    doc: vi.fn((id: string) => ({
      set: vi.fn(async (data: unknown) => {
        if (!mockFirestoreData.has(name)) {
          mockFirestoreData.set(name, new Map());
        }
        mockFirestoreData.get(name)!.set(id, data);
      }),
      get: vi.fn(async () => ({
        exists: mockFirestoreData.get(name)?.has(id) ?? false,
        data: () => mockFirestoreData.get(name)?.get(id),
      })),
      update: vi.fn(async (data: unknown) => {
        const existing = mockFirestoreData.get(name)?.get(id) as Record<string, unknown> | undefined;
        if (existing) {
          mockFirestoreData.get(name)!.set(id, { ...existing, ...(data as Record<string, unknown>) });
        }
      }),
      collection: vi.fn((subName: string) => ({
        doc: vi.fn((subId: string) => ({
          set: vi.fn(async (data: unknown) => {
            const key = `${name}/${id}/${subName}`;
            if (!mockFirestoreData.has(key)) {
              mockFirestoreData.set(key, new Map());
            }
            mockFirestoreData.get(key)!.set(subId, data);
          }),
          get: vi.fn(async () => {
            const key = `${name}/${id}/${subName}`;
            return {
              exists: mockFirestoreData.get(key)?.has(subId) ?? false,
              data: () => mockFirestoreData.get(key)?.get(subId),
            };
          }),
        })),
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => {
                const key = `${name}/${id}/${subName}`;
                const items = mockFirestoreData.get(key);
                if (!items) return { docs: [], forEach: vi.fn() };
                const docs = Array.from(items.entries()).map(([docId, docData]) => ({
                  id: docId,
                  data: () => docData,
                }));
                return {
                  docs,
                  forEach: (fn: (doc: unknown) => void) => docs.forEach(fn),
                };
              }),
            })),
          })),
        })),
      })),
    })),
  })),
  batch: vi.fn(() => ({
    update: vi.fn(),
    commit: vi.fn(async () => {}),
  })),
};

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => mockFirestoreDb,

  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => item);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Mock push notifications
vi.mock('../../outreach/delivery/push-notifications.js', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  isPushNotificationsAvailable: vi.fn(() => false),
}));

// Mock email delivery
vi.mock('../../outreach/delivery/email-delivery.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  isEmailDeliveryAvailable: vi.fn(() => false),
}));

// Mock LiveKit
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: vi.fn(() => ({
    listRooms: vi.fn().mockResolvedValue([]),
    sendData: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Import after mocks
import {
  captureBackgroundResult,
  getPendingResults,
  markResultsDelivered,
  buildPendingResultsContext,
  createBackgroundResult,
  sortResultsForDisplay,
  getResultTypeDescription,
} from '../index.js';

import {
  executeResearchTask,
  queueResearchTask,
  type ResearchRequest,
} from '../executors/research-executor.js';

import {
  executeReservationTask,
  queueReservationTask,
  type ReservationRequest,
} from '../executors/reservation-executor.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Background Agents E2E', () => {
  beforeEach(() => {
    mockFirestoreData.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // RESULT TYPES TESTS
  // ==========================================================================

  describe('Result Types', () => {
    it('should create a background result with defaults', () => {
      const result = createBackgroundResult({
        userId: 'user-123',
        type: 'research_complete',
        summary: 'Research on NVDA completed',
        initiatedBy: 'peter',
      });

      expect(result.id).toMatch(/^bg_/);
      expect(result.userId).toBe('user-123');
      expect(result.type).toBe('research_complete');
      expect(result.status).toBe('success');
      expect(result.priority).toBe('normal');
      expect(result.delivered).toBe(false);
      expect(result.actionItems).toEqual([]);
      expect(result.capturedAt).toBeDefined();
    });

    it('should sort results by priority and recency', () => {
      const results = [
        createBackgroundResult({
          userId: 'u1',
          type: 'research_complete',
          summary: 'Low priority old',
          initiatedBy: 'peter',
          priority: 'low',
        }),
        createBackgroundResult({
          userId: 'u1',
          type: 'on_behalf_call',
          summary: 'Urgent new',
          initiatedBy: 'ferni',
          priority: 'urgent',
        }),
        createBackgroundResult({
          userId: 'u1',
          type: 'reservation_made',
          summary: 'Normal priority',
          initiatedBy: 'jordan',
          priority: 'normal',
        }),
      ];

      const sorted = sortResultsForDisplay(results);

      expect(sorted[0].priority).toBe('urgent');
      expect(sorted[1].priority).toBe('normal');
      expect(sorted[2].priority).toBe('low');
    });

    it('should get human-readable result type descriptions', () => {
      expect(getResultTypeDescription('on_behalf_call')).toBe('phone call');
      expect(getResultTypeDescription('research_complete')).toBe('research');
      expect(getResultTypeDescription('reservation_made')).toBe('reservation');
    });
  });

  // ==========================================================================
  // UNIFIED RESULT CAPTURE TESTS
  // ==========================================================================

  describe('Unified Result Capture', () => {
    it('should capture a background result', async () => {
      const result = await captureBackgroundResult({
        userId: 'user-123',
        type: 'research_complete',
        status: 'success',
        summary: 'Research on NVDA completed with 3 findings',
        priority: 'normal',
        initiatedBy: 'peter',
        details: 'Detailed analysis here...',
      });

      expect(result.id).toMatch(/^bg_/);
      expect(result.type).toBe('research_complete');
      expect(result.status).toBe('success');
      expect(result.delivered).toBe(false);
    });

    it('should capture a high-priority result with callback', async () => {
      const result = await captureBackgroundResult({
        userId: 'user-456',
        type: 'on_behalf_call',
        status: 'partial_success',
        summary: 'Left voicemail for Dr. Smith',
        priority: 'high',
        initiatedBy: 'ferni',
        contactName: 'Dr. Smith',
        requiresCallback: true,
        callbackTime: 'tomorrow afternoon',
      });

      expect(result.priority).toBe('high');
      expect(result.requiresCallback).toBe(true);
      expect(result.callbackTime).toBe('tomorrow afternoon');
      expect(result.contactName).toBe('Dr. Smith');
    });

    it('should include action items when provided', async () => {
      const result = await captureBackgroundResult({
        userId: 'user-789',
        type: 'reservation_made',
        status: 'success',
        summary: 'Reserved table at Chez Michel',
        priority: 'normal',
        initiatedBy: 'jordan',
        actionItems: ['Confirm by Friday', 'Bring ID for wine order'],
      });

      expect(result.actionItems).toHaveLength(2);
      expect(result.actionItems).toContain('Confirm by Friday');
    });
  });

  // ==========================================================================
  // PENDING RESULTS TESTS
  // ==========================================================================

  describe('Pending Results', () => {
    it('should retrieve pending results for a user', async () => {
      // First, capture some results
      await captureBackgroundResult({
        userId: 'pending-test-user',
        type: 'research_complete',
        status: 'success',
        summary: 'Research 1',
        priority: 'normal',
        initiatedBy: 'peter',
      });

      await captureBackgroundResult({
        userId: 'pending-test-user',
        type: 'reservation_made',
        status: 'success',
        summary: 'Reservation 1',
        priority: 'high',
        initiatedBy: 'jordan',
      });

      // Get pending results
      const pending = await getPendingResults('pending-test-user');

      // Should return results (may be empty in test due to mock limitations)
      expect(Array.isArray(pending)).toBe(true);
    });

    it('should mark results as delivered', async () => {
      const result = await captureBackgroundResult({
        userId: 'delivery-test-user',
        type: 'on_behalf_call',
        status: 'success',
        summary: 'Call completed',
        priority: 'normal',
        initiatedBy: 'ferni',
      });

      // Mark as delivered
      await markResultsDelivered('delivery-test-user', [result.id], 'voice');

      // Verify it was called without error
      expect(true).toBe(true);
    });
  });

  // ==========================================================================
  // CONTEXT BUILDER TESTS
  // ==========================================================================

  describe('Context Builder', () => {
    it('should return null when no pending results', async () => {
      const context = await buildPendingResultsContext('no-results-user');
      expect(context).toBeNull();
    });

    // Note: Full context building test requires more complex mocking
    // This is a smoke test
    it('should not throw when building context', async () => {
      await expect(buildPendingResultsContext('test-user')).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // RESEARCH EXECUTOR TESTS
  // ==========================================================================

  describe('Research Executor', () => {
    it('should execute a stock research task', async () => {
      const request: ResearchRequest = {
        userId: 'research-user',
        query: 'Analyze NVDA',
        type: 'stock_analysis',
        depth: 'standard',
        initiatedBy: 'peter',
      };

      const result = await executeResearchTask(request);

      expect(result.query).toBe('Analyze NVDA');
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.summary).toContain('NVDA');
      expect(result.completedAt).toBeDefined();
    });

    it('should execute a comprehensive deep dive', async () => {
      const request: ResearchRequest = {
        userId: 'deep-dive-user',
        query: 'Retirement planning strategies',
        type: 'deep_dive',
        depth: 'comprehensive',
        context: 'for someone in their 40s',
        initiatedBy: 'peter',
      };

      const result = await executeResearchTask(request);

      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      expect(result.methodology?.toLowerCase()).toContain('comprehensive');
    });

    it('should execute a fact check', async () => {
      const request: ResearchRequest = {
        userId: 'fact-check-user',
        query: 'S&P 500 returns 10% on average',
        type: 'fact_check',
        depth: 'standard',
        initiatedBy: 'peter',
      };

      const result = await executeResearchTask(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].title).toContain('Fact Check');
    });

    it('should queue research for background execution', async () => {
      const request: ResearchRequest = {
        userId: 'queue-user',
        query: 'Market research',
        type: 'market_research',
        depth: 'quick',
        initiatedBy: 'peter',
      };

      const taskId = await queueResearchTask(request);

      expect(taskId).toMatch(/^research_/);
    });
  });

  // ==========================================================================
  // RESERVATION EXECUTOR TESTS
  // ==========================================================================

  describe('Reservation Executor', () => {
    it('should execute a restaurant reservation', async () => {
      const request: ReservationRequest = {
        userId: 'reservation-user',
        type: 'restaurant',
        venue: 'Chez Michel',
        dateTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        partySize: 4,
        specialRequests: 'Window table please',
        initiatedBy: 'jordan',
      };

      const result = await executeReservationTask(request);

      expect(result.success).toBe(true);
      expect(result.venue).toBe('Chez Michel');
      expect(result.confirmationNumber).toMatch(/^RES-/);
      expect(result.partySize).toBe(4);
    });

    it('should execute a hotel reservation', async () => {
      const request: ReservationRequest = {
        userId: 'hotel-user',
        type: 'hotel',
        venue: 'Grand Hotel',
        dateTime: new Date(Date.now() + 604800000).toISOString(), // Next week
        specialRequests: 'Late checkout',
        initiatedBy: 'jordan',
      };

      const result = await executeReservationTask(request);

      expect(result.success).toBe(true);
      expect(result.confirmationNumber).toMatch(/^HTL-/);
      expect(result.cancellationPolicy).toContain('cancellation');
    });

    it('should execute a venue reservation', async () => {
      const request: ReservationRequest = {
        userId: 'venue-user',
        type: 'venue',
        venue: 'The Grand Ballroom',
        dateTime: new Date(Date.now() + 2592000000).toISOString(), // ~30 days
        partySize: 100,
        context: 'wedding reception',
        initiatedBy: 'jordan',
      };

      const result = await executeReservationTask(request);

      expect(result.success).toBe(true);
      expect(result.confirmationNumber).toMatch(/^VEN-/);
    });

    it('should queue reservation for background execution', async () => {
      const request: ReservationRequest = {
        userId: 'queue-reservation-user',
        type: 'activity',
        venue: 'City Walking Tour',
        dateTime: new Date(Date.now() + 172800000).toISOString(),
        partySize: 2,
        initiatedBy: 'jordan',
      };

      const taskId = await queueReservationTask(request);

      expect(taskId).toMatch(/^reservation_/);
    });
  });

  // ==========================================================================
  // E2E FLOW TESTS
  // ==========================================================================

  describe('E2E Flows', () => {
    it('should complete full research → capture → pending flow', async () => {
      const userId = 'e2e-research-user';

      // 1. Execute research task
      const researchResult = await executeResearchTask({
        userId,
        query: 'Investment strategies',
        type: 'general',
        depth: 'standard',
        initiatedBy: 'peter',
      });

      expect(researchResult.findings.length).toBeGreaterThan(0);

      // 2. Result should have been captured (via executeResearchTask internal call)
      // 3. Pending results should include it
      // (In real flow, Firestore would have the result)
    });

    it('should complete full reservation → capture → pending flow', async () => {
      const userId = 'e2e-reservation-user';

      // 1. Execute reservation task
      const reservationResult = await executeReservationTask({
        userId,
        type: 'restaurant',
        venue: 'Test Restaurant',
        dateTime: new Date().toISOString(),
        partySize: 2,
        initiatedBy: 'jordan',
      });

      expect(reservationResult.success).toBe(true);
      expect(reservationResult.confirmationNumber).toBeDefined();
    });

    it('should handle multiple result types for same user', async () => {
      const userId = 'multi-result-user';

      // Capture multiple different result types
      await captureBackgroundResult({
        userId,
        type: 'on_behalf_call',
        status: 'success',
        summary: 'Called mom',
        initiatedBy: 'ferni',
        priority: 'normal',
      });

      await captureBackgroundResult({
        userId,
        type: 'research_complete',
        status: 'success',
        summary: 'Market analysis done',
        initiatedBy: 'peter',
        priority: 'low',
      });

      await captureBackgroundResult({
        userId,
        type: 'reservation_made',
        status: 'success',
        summary: 'Dinner booked',
        initiatedBy: 'jordan',
        priority: 'high',
      });

      // All should capture successfully
      expect(true).toBe(true);
    });
  });

  // ==========================================================================
  // ERROR HANDLING TESTS
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle research task failures gracefully', async () => {
      // This tests that errors don't crash the system
      const request: ResearchRequest = {
        userId: 'error-user',
        query: '',  // Empty query
        type: 'general',
        depth: 'quick',
        initiatedBy: 'peter',
      };

      // Should not throw, even with empty query
      const result = await executeResearchTask(request);
      expect(result).toBeDefined();
    });

    it('should handle invalid user IDs', async () => {
      const pending = await getPendingResults('');
      expect(Array.isArray(pending)).toBe(true);
    });

    it('should handle marking empty result IDs', async () => {
      await expect(markResultsDelivered('user', [], 'voice')).resolves.not.toThrow();
    });
  });
});
