/**
 * Referral Service Tests
 *
 * Tests for referral code management:
 * - Code generation
 * - URL detection
 * - Referral tracking
 * - Garden stats
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock window.location for URL testing
const mockLocation = {
  href: 'https://ferni.ai',
  origin: 'https://ferni.ai',
  pathname: '/',
  search: '',
  searchParams: new URLSearchParams(),
};

// Mock history.replaceState
const mockReplaceState = vi.fn();
Object.defineProperty(global, 'history', {
  value: { replaceState: mockReplaceState },
  writable: true,
});

// Mock cosmetics service
vi.mock('../../src/services/cosmetics.service.js', () => ({
  addSeeds: vi.fn(),
}));

// Mock document.dispatchEvent
const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  mockLocation.href = 'https://ferni.ai';
  mockLocation.pathname = '/';
  mockLocation.search = '';
});

// Import after mocking
import {
  getReferralCode,
  getReferralUrl,
  checkReferralFromUrl,
  processPendingReferral,
  recordReferralSuccess,
  awardReferralMilestone,
  getGardenStats,
  getReferredBy,
  getTotalReferralSeeds,
  initReferralService,
  REFERRAL_SIGNUP_REWARD,
  REFERRAL_NEW_USER_BONUS,
} from '../../src/services/referral.service.js';
import { addSeeds } from '../../src/services/cosmetics.service.js';

describe('ReferralService', () => {
  describe('getReferralCode', () => {
    it('should return a referral code', () => {
      const code = getReferralCode();

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      // Code format: abc123-word
      expect(code).toMatch(/^[a-z0-9]{6}-[a-z]+$/);
    });

    it('should return the same code on subsequent calls', () => {
      const code1 = getReferralCode();
      const code2 = getReferralCode();

      expect(code1).toBe(code2);
    });
  });

  describe('getReferralUrl', () => {
    it('should return a shareable URL', () => {
      const url = getReferralUrl();

      expect(url).toContain('https://ferni.ai/grow/');
      expect(url).toContain(getReferralCode());
    });
  });

  describe('getGardenStats', () => {
    it('should return garden stats object', () => {
      const stats = getGardenStats();

      expect(stats).toHaveProperty('totalReferrals');
      expect(stats).toHaveProperty('activeReferrals');
      expect(stats).toHaveProperty('weeklyPassiveSeeds');
      expect(stats).toHaveProperty('gardenTitle');
    });

    it('should return seedling title for new users', () => {
      const stats = getGardenStats();

      expect(stats.gardenTitle).toBe('seedling');
      expect(stats.totalReferrals).toBe(0);
    });
  });

  describe('recordReferralSuccess', () => {
    it('should track new referral', () => {
      recordReferralSuccess('new-user-123');

      const stats = getGardenStats();
      expect(stats.totalReferrals).toBe(1);
    });

    it('should dispatch success event', () => {
      // Re-spy after clearAllMocks
      const spy = vi.spyOn(document, 'dispatchEvent');
      
      recordReferralSuccess('new-user-456');

      expect(spy).toHaveBeenCalled();
      const event = spy.mock.calls.find(
        (call) => (call[0] as CustomEvent).type === 'ferni:referral-success'
      );
      expect(event).toBeDefined();
      
      spy.mockRestore();
    });

    it('should award seeds to referrer', () => {
      recordReferralSuccess('new-user-789');

      expect(addSeeds).toHaveBeenCalledWith(REFERRAL_SIGNUP_REWARD);
    });
  });

  describe('getTotalReferralSeeds', () => {
    it('should return total seeds earned', () => {
      const seeds = getTotalReferralSeeds();

      expect(typeof seeds).toBe('number');
      expect(seeds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getReferredBy', () => {
    it('should return null for organic users', () => {
      const referrer = getReferredBy();

      // Fresh state should have no referrer
      expect(referrer).toBeNull();
    });
  });

  describe('processPendingReferral', () => {
    it('should return processed: false when no pending referral', () => {
      const result = processPendingReferral();

      expect(result.processed).toBe(false);
    });

    it('should process pending referral and award bonus', () => {
      localStorageMock.setItem('ferni_pending_referral', 'abc123-sunrise');

      const result = processPendingReferral();

      expect(result.processed).toBe(true);
      expect(result.bonusAwarded).toBe(REFERRAL_NEW_USER_BONUS);
    });
  });

  describe('awardReferralMilestone', () => {
    it('should return false for unknown referral', () => {
      const result = awardReferralMilestone('unknown-user', 'streak-7');

      expect(result).toBe(false);
    });

    it('should award milestone for known referral', () => {
      recordReferralSuccess('referred-user');
      const result = awardReferralMilestone('referred-user', 'streak-7');

      expect(result).toBe(true);
    });

    it('should not award same milestone twice', () => {
      recordReferralSuccess('referred-user-2');
      awardReferralMilestone('referred-user-2', 'streak-7');
      const result = awardReferralMilestone('referred-user-2', 'streak-7');

      expect(result).toBe(false);
    });
  });

  describe('initReferralService', () => {
    it('should initialize without errors', () => {
      expect(() => initReferralService()).not.toThrow();
    });
  });
});
