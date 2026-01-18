/**
 * Booking Integrations Tests
 * Run: pnpm vitest run src/tests/agi-features/booking-integrations.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateTestUserId, createMockFirestoreDb } from './index.js';

const mockFirestoreDb = createMockFirestoreDb();
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => mockFirestoreDb) }));
vi.mock('../../services/automation/trust-level-system.js', () => ({
  checkActionPermission: vi.fn().mockResolvedValue({ success: true, requiresApproval: true, pendingActionId: 'mock_123' }),
  markActionExecuted: vi.fn().mockResolvedValue(undefined),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { searchRestaurants, checkAvailability, bookReservation, getReservations, type Restaurant, type ReservationRequest } from '../../services/integrations/restaurant-booking.js';
import { getRideEstimates, bookRide, getRideHistory, type RideRequest } from '../../services/integrations/rideshare-booking.js';

describe('Booking Integrations', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('booking');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Restaurant Booking', () => {
    it('should return results for restaurant search', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ businesses: [] }) });
      const results = await searchRestaurants('pizza', 'San Francisco');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should check availability', async () => {
      const restaurant: Restaurant = { id: 'test_1', name: 'Test Place', address: '123 Main St', city: 'SF', provider: 'google' };
      const slots = await checkAvailability(restaurant, '2025-02-15', 4);
      expect(Array.isArray(slots)).toBe(true);
    });

    it('should require approval for booking', async () => {
      const request: ReservationRequest = {
        userId: testUserId, restaurant: { id: 'rest_1', name: 'Fine Dining', address: '123 St', city: 'SF', provider: 'google' },
        date: '2025-02-20', time: '19:00', partySize: 4, guestName: 'John', guestPhone: '+1234567890', guestEmail: 'john@test.com',
      };
      const result = await bookReservation(request);
      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should get reservations', async () => {
      const reservations = await getReservations(testUserId);
      expect(Array.isArray(reservations)).toBe(true);
    });
  });

  describe('Rideshare Booking', () => {
    it('should get ride estimates', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [{ geometry: { location: { lat: 37.77, lng: -122.41 } } }], rows: [{ elements: [{ status: 'OK', duration: { value: 1200 }, distance: { value: 8000 } }] }] }) });
      const estimates = await getRideEstimates({ address: '123 Main St' }, { address: 'Airport' });
      expect(Array.isArray(estimates)).toBe(true);
    });

    it('should require approval for ride booking', async () => {
      const request: RideRequest = { userId: testUserId, pickup: { address: '123 Main St', lat: 37.77, lng: -122.41 }, dropoff: { address: 'Airport', lat: 37.62, lng: -122.37 }, provider: 'uber', productId: 'uberx' };
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
