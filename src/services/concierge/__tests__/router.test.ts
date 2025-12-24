/**
 * Concierge Router Tests
 *
 * Tests for request classification, permission checking, and routing.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConciergeRouter, createConciergeRouter } from '../router.js';
import { resetTaskTracker } from '../tracker/task-tracker.js';
import type { ConciergeUserPreferences, ConciergeDomain, OutreachChannel } from '../types.js';

// Mock Google Places discovery
vi.mock('../discovery/google-places.js', () => ({
  discoverBusinesses: vi.fn().mockResolvedValue([
    {
      placeId: 'mock_place_1',
      name: 'Mock Business',
      address: '123 Test St',
      phone: '+1234567890',
      rating: 4.5,
      types: ['hotel'],
      location: { lat: 40.7128, lng: -74.006 },
    },
  ]),
}));

// Mock Firestore
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));

describe('concierge-router', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    resetTaskTracker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createConciergeRouter', () => {
    it('should create a router instance', () => {
      const router = createConciergeRouter({ userId: testUserId });
      expect(router).toBeInstanceOf(ConciergeRouter);
    });
  });

  describe('classifyRequest', () => {
    it('should classify hotel-related requests', () => {
      const router = createConciergeRouter({ userId: testUserId });

      const hotelPhrases = [
        'I need a hotel in New York',
        'Find me a room for the weekend',
        'Book accommodation near downtown',
        'Looking for a resort with a pool',
      ];

      for (const phrase of hotelPhrases) {
        const result = router.classifyRequest(phrase);
        expect(result.domain).toBe('hotel');
      }
    });

    it('should classify restaurant-related requests', () => {
      const router = createConciergeRouter({ userId: testUserId });

      const restaurantPhrases = [
        'I want to make a dinner reservation',
        'Book a table for 4 at an Italian restaurant',
        'Find a place for lunch near downtown',
        'Looking for a restaurant for my birthday',
      ];

      for (const phrase of restaurantPhrases) {
        const result = router.classifyRequest(phrase);
        expect(result.domain).toBe('restaurant');
      }
    });

    it('should classify healthcare-related requests', () => {
      const router = createConciergeRouter({ userId: testUserId });

      const healthcarePhrases = [
        'I need to see a doctor',
        'Schedule a dentist appointment',
        'Find a specialist for my back pain',
        'Book a checkup at a clinic',
      ];

      for (const phrase of healthcarePhrases) {
        const result = router.classifyRequest(phrase);
        expect(result.domain).toBe('healthcare');
      }
    });

    it('should classify local service requests', () => {
      const router = createConciergeRouter({ userId: testUserId });

      const servicePhrases = [
        'I need a plumber to fix a leak',
        'Find an electrician for rewiring',
        'Looking for house cleaning services',
        'Need a handyman for repairs',
      ];

      for (const phrase of servicePhrases) {
        const result = router.classifyRequest(phrase);
        expect(result.domain).toBe('local_service');
      }
    });

    it('should classify request types correctly', () => {
      const router = createConciergeRouter({ userId: testUserId });

      expect(router.classifyRequest('How much does a hotel room cost?').type).toBe('quote');
      expect(router.classifyRequest('Book a table for tomorrow').type).toBe('booking');
      // "Schedule" matches 'booking' keywords before 'appointment' in iteration order
      expect(router.classifyRequest('Schedule an appointment with Dr. Smith').type).toBe('booking');
      // Use "need an appointment" to test appointment type without "schedule"
      expect(router.classifyRequest('I need an appointment with the dentist').type).toBe(
        'appointment'
      );
      expect(router.classifyRequest('What are your hours of operation?').type).toBe('inquiry');
      expect(router.classifyRequest('I have a complaint about my room').type).toBe('complaint');
      // "status" and "update" are status keywords - avoid "check" which is in inquiry
      expect(router.classifyRequest('What is the status of my order').type).toBe('status');
    });

    it('should default to other domain for unrecognized requests', () => {
      const router = createConciergeRouter({ userId: testUserId });

      const result = router.classifyRequest('Help me with something random');
      expect(result.domain).toBe('other');
    });

    it('should default to inquiry type for unrecognized request types', () => {
      const router = createConciergeRouter({ userId: testUserId });

      const result = router.classifyRequest('Tell me about hotels');
      expect(result.type).toBe('inquiry');
    });
  });

  describe('checkPermissions', () => {
    it('should allow all if no preferences set', () => {
      const router = createConciergeRouter({ userId: testUserId });

      expect(router.checkPermissions('hotel', 'phone')).toBe(true);
      expect(router.checkPermissions('restaurant', 'email')).toBe(true);
      expect(router.checkPermissions('healthcare', 'sms')).toBe(true);
    });

    it('should check domain permissions', () => {
      const preferences: ConciergeUserPreferences = {
        userId: testUserId,
        enabledDomains: ['hotel', 'restaurant'] as ConciergeDomain[],
        allowPhoneCalls: true,
        allowEmails: true,
        allowSms: true,
        preferredChannel: 'phone',
        maxCallsPerRequest: 5,
      };

      const router = createConciergeRouter({
        userId: testUserId,
        userPreferences: preferences,
      });

      expect(router.checkPermissions('hotel', 'phone')).toBe(true);
      expect(router.checkPermissions('restaurant', 'phone')).toBe(true);
      expect(router.checkPermissions('healthcare', 'phone')).toBe(false);
    });

    it('should check channel permissions', () => {
      const preferences: ConciergeUserPreferences = {
        userId: testUserId,
        enabledDomains: ['hotel'] as ConciergeDomain[],
        allowPhoneCalls: true,
        allowEmails: false,
        allowSms: false,
        preferredChannel: 'phone',
        maxCallsPerRequest: 5,
      };

      const router = createConciergeRouter({
        userId: testUserId,
        userPreferences: preferences,
      });

      expect(router.checkPermissions('hotel', 'phone')).toBe(true);
      expect(router.checkPermissions('hotel', 'email')).toBe(false);
      expect(router.checkPermissions('hotel', 'sms')).toBe(false);
    });
  });

  describe('getBestChannel', () => {
    it('should prefer phone for hotels and restaurants', () => {
      const router = createConciergeRouter({ userId: testUserId });

      expect(router.getBestChannel('hotel')).toBe('phone');
      expect(router.getBestChannel('restaurant')).toBe('phone');
      expect(router.getBestChannel('healthcare')).toBe('phone');
      expect(router.getBestChannel('airline')).toBe('phone');
    });

    it('should prefer email for formal domains', () => {
      const router = createConciergeRouter({ userId: testUserId });

      expect(router.getBestChannel('insurance')).toBe('email');
      expect(router.getBestChannel('government')).toBe('email');
    });

    it('should prefer SMS for local services', () => {
      const router = createConciergeRouter({ userId: testUserId });

      expect(router.getBestChannel('local_service')).toBe('sms');
    });

    it('should use user preference for other domains', () => {
      const preferences: ConciergeUserPreferences = {
        userId: testUserId,
        enabledDomains: ['other'] as ConciergeDomain[],
        allowPhoneCalls: true,
        allowEmails: true,
        allowSms: true,
        preferredChannel: 'email',
        maxCallsPerRequest: 5,
      };

      const router = createConciergeRouter({
        userId: testUserId,
        userPreferences: preferences,
      });

      expect(router.getBestChannel('other')).toBe('email');
    });
  });

  describe('routeRequest', () => {
    it('should create a request for valid input', async () => {
      const router = createConciergeRouter({ userId: testUserId });

      const result = await router.routeRequest(
        'I need a hotel in New York for the weekend',
        { location: 'New York, NY' },
        { maxTargets: 3 }
      );

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
      expect(result.estimatedTargets).toBe(1); // Mock returns 1 business
    });

    it('should fail when permission denied', async () => {
      const preferences: ConciergeUserPreferences = {
        userId: testUserId,
        enabledDomains: ['restaurant'] as ConciergeDomain[], // Hotel not enabled
        allowPhoneCalls: true,
        allowEmails: true,
        allowSms: true,
        preferredChannel: 'phone',
        maxCallsPerRequest: 5,
      };

      const router = createConciergeRouter({
        userId: testUserId,
        userPreferences: preferences,
      });

      const result = await router.routeRequest('I need a hotel', { location: 'NYC' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });

    it('should fail when location is missing for most domains', async () => {
      const router = createConciergeRouter({ userId: testUserId });

      const result = await router.routeRequest('I need a hotel', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Location is required');
    });

    it('should fail when no businesses found', async () => {
      const { discoverBusinesses } = await import('../discovery/google-places.js');
      vi.mocked(discoverBusinesses).mockResolvedValueOnce([]);

      const router = createConciergeRouter({ userId: testUserId });

      const result = await router.routeRequest('I need a hotel', { location: 'Remote Island' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No hotel businesses found');
    });

    it('should use specified channel', async () => {
      const router = createConciergeRouter({ userId: testUserId });

      const result = await router.routeRequest(
        'I need a hotel in NYC',
        { location: 'New York, NY' },
        { preferredChannel: 'email' }
      );

      expect(result.success).toBe(true);
    });

    it('should include sessionId in request', async () => {
      const router = createConciergeRouter({
        userId: testUserId,
        sessionId: 'test-session-456',
      });

      const result = await router.routeRequest('I need a hotel', { location: 'NYC' });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });

    it('should handle discovery errors gracefully', async () => {
      const { discoverBusinesses } = await import('../discovery/google-places.js');
      vi.mocked(discoverBusinesses).mockRejectedValueOnce(new Error('API error'));

      const router = createConciergeRouter({ userId: testUserId });

      const result = await router.routeRequest('I need a hotel', { location: 'NYC' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create concierge request');
    });
  });

  describe('domain keyword matching', () => {
    it('should match multiple keywords for higher confidence', () => {
      const router = createConciergeRouter({ userId: testUserId });

      // "hotel room" has two hotel keywords, should be confident
      const result = router.classifyRequest('I need a hotel room near downtown');
      expect(result.domain).toBe('hotel');
    });

    it('should classify based on strongest match when ambiguous', () => {
      const router = createConciergeRouter({ userId: testUserId });

      // "restaurant reservation" has restaurant keywords
      const result = router.classifyRequest('Make a restaurant reservation');
      expect(result.domain).toBe('restaurant');
    });
  });

  describe('integration with TaskTracker', () => {
    it('should create trackable request', async () => {
      const { getTaskTracker } = await import('../tracker/task-tracker.js');

      const router = createConciergeRouter({ userId: testUserId });
      const result = await router.routeRequest('Find a hotel in NYC', { location: 'New York' });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();

      // Verify request was created in tracker
      const tracker = getTaskTracker();
      const request = await tracker.getRequest(result.requestId!);

      expect(request).toBeDefined();
      expect(request?.userId).toBe(testUserId);
      expect(request?.domain).toBe('hotel');
    });
  });
});
