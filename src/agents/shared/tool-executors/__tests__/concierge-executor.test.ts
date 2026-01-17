/**
 * Concierge Executor Tests
 *
 * Tests for concierge service tools: requestHotelQuotes, makeRestaurantReservation,
 * scheduleHealthcareAppointment, getServiceQuotes, checkConciergeStatus.
 * Covers third-party booking integrations.
 *
 * @module agents/shared/tool-executors/__tests__/concierge-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { conciergeExecutor } from '../concierge-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock Firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          add: vi.fn().mockResolvedValue({ id: 'request-123' }),
          doc: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ status: 'pending' }) }),
            update: vi.fn().mockResolvedValue(undefined),
          })),
          where: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
          })),
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        })),
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
      })),
    })),
  })),
}));

// Mock concierge service
vi.mock('../../../../services/concierge/concierge-service.js', () => ({
  requestHotelQuotes: vi.fn().mockResolvedValue({ requestId: 'hotel-123', status: 'searching' }),
  makeRestaurantReservation: vi
    .fn()
    .mockResolvedValue({ reservationId: 'res-123', confirmed: true }),
  scheduleHealthcareAppointment: vi.fn().mockResolvedValue({ appointmentId: 'apt-123' }),
  getServiceQuotes: vi.fn().mockResolvedValue([]),
  checkConciergeStatus: vi.fn().mockResolvedValue({ status: 'pending', quotes: [] }),
}));

describe('ConciergeExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(conciergeExecutor.domain).toBe('concierge');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'requesthotelquotes',
        'makerestaurantreservation',
        'schedulehealthcareappointment',
        'getservicequotes',
        'checkconciergerstatus',
      ];

      for (const tool of expectedTools) {
        expect(conciergeExecutor.handles).toContain(tool);
      }
    });
  });

  describe('requestHotelQuotes', () => {
    it('should request hotel quotes', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'requestHotelQuotes',
        {
          destination: 'New York',
          checkIn: '2024-03-15',
          checkOut: '2024-03-18',
        },
        ctx
      );

      expect(result).toContain('New York');
    });

    it('should request hotel quotes with guests', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'requestHotelQuotes',
        {
          destination: 'Paris',
          checkIn: '2024-04-01',
          checkOut: '2024-04-05',
          guests: 2,
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should request hotel quotes with budget', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'requestHotelQuotes',
        {
          destination: 'London',
          checkIn: '2024-05-10',
          checkOut: '2024-05-14',
          maxBudget: 300,
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for destination if missing', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'requestHotelQuotes',
        { checkIn: '2024-03-15' },
        ctx
      );

      expect(result).toContain('Where');
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await conciergeExecutor.execute(
        'REQUESTHOTELQUOTES',
        { destination: 'NYC' },
        ctx
      );
      const result2 = await conciergeExecutor.execute(
        'RequestHotelQuotes',
        { destination: 'NYC' },
        ctx
      );

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('makeRestaurantReservation', () => {
    it('should make a restaurant reservation', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'makeRestaurantReservation',
        {
          restaurant: 'The French Laundry',
          date: '2024-03-20',
          time: '7pm',
          partySize: 4,
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle reservation with special requests', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'makeRestaurantReservation',
        {
          restaurant: 'Nobu',
          date: '2024-03-25',
          time: '8pm',
          partySize: 2,
          specialRequests: 'Window seat, anniversary celebration',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for restaurant if missing', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'makeRestaurantReservation',
        { date: '2024-03-20', partySize: 2 },
        ctx
      );

      expect(result).toContain('Which restaurant');
    });

    it('should handle missing party size gracefully', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'makeRestaurantReservation',
        { restaurant: 'Test Restaurant', date: '2024-03-20' },
        ctx
      );

      // May prompt for restaurant or party size
      expect(result).toBeDefined();
    });
  });

  describe('scheduleHealthcareAppointment', () => {
    it('should schedule a healthcare appointment', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'scheduleHealthcareAppointment',
        {
          provider: 'Dr. Smith',
          type: 'annual checkup',
          preferredDate: 'next week',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle appointment with specific requirements', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'scheduleHealthcareAppointment',
        {
          provider: 'City Dental',
          type: 'cleaning',
          preferredDate: 'Monday or Tuesday',
          preferredTime: 'morning',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for appointment type if missing', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'scheduleHealthcareAppointment',
        { provider: 'Dr. Jones' },
        ctx
      );

      expect(result).toContain('What type');
    });
  });

  describe('getServiceQuotes', () => {
    it('should get service quotes', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'getServiceQuotes',
        {
          service: 'house cleaning',
          location: 'San Francisco',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should get quotes with specific requirements', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'getServiceQuotes',
        {
          service: 'car detailing',
          location: 'Los Angeles',
          requirements: 'Deep clean, ceramic coating',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for service type if missing', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute('getServiceQuotes', { location: 'NYC' }, ctx);

      // Asks what kind of service is needed
      expect(typeof result === 'string' ? result.toLowerCase() : '').toContain('service');
    });
  });

  describe('checkConciergeStatus', () => {
    it('should check status of a request', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'checkConciergeStatus',
        { requestId: 'request-123' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should check status of all pending requests', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute('checkConciergeStatus', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should filter status by type', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute(
        'checkConciergeStatus',
        { type: 'hotel' },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await conciergeExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'addTask', 'setLights', 'scheduleMessage'];

      for (const tool of otherDomainTools) {
        const result = await conciergeExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});
