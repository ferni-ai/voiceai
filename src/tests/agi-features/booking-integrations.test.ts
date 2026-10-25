/**
 * Booking Integrations Tests
 * Run: pnpm vitest run src/tests/agi-features/booking-integrations.test.ts
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

const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  getRideEstimates,
  bookRide,
  getRideHistory,
  type RideRequest,
} from '../../services/integrations/rideshare-booking.js';

describe('Booking Integrations', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('booking');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Rideshare Booking', () => {
    it('should get ride estimates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ geometry: { location: { lat: 37.77, lng: -122.41 } } }],
          rows: [
            { elements: [{ status: 'OK', duration: { value: 1200 }, distance: { value: 8000 } }] },
          ],
        }),
      });
      const estimates = await getRideEstimates({ address: '123 Main St' }, { address: 'Airport' });
      expect(Array.isArray(estimates)).toBe(true);
    });

    it('should require approval for ride booking', async () => {
      const request: RideRequest = {
        userId: testUserId,
        pickup: { address: '123 Main St', lat: 37.77, lng: -122.41 },
        dropoff: { address: 'Airport', lat: 37.62, lng: -122.37 },
        provider: 'uber',
        productId: 'uberx',
      };
      const result = await bookRide(request);
      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should get ride history', async () => {
      const history = await getRideHistory(testUserId);
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
