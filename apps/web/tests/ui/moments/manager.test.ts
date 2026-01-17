/**
 * MomentsManager Unit Tests
 *
 * Tests for the unified feedback system manager.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('@/services/haptics.service.js', () => ({
  getHapticsService: () => ({
    play: vi.fn(),
  }),
}));

vi.mock('@/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/utils/tracked-timeout.js', () => ({
  createTimeoutTracker: () => ({
    trackedTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearAll: vi.fn(),
  }),
}));

// Import after mocks
import { getMomentsManager, resetMomentsManager } from '@/ui/moments/manager.js';

describe('MomentsManager', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Reset singleton
    resetMomentsManager();
  });

  afterEach(() => {
    resetMomentsManager();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create a singleton instance', () => {
      const manager1 = getMomentsManager();
      const manager2 = getMomentsManager();
      expect(manager1).toBe(manager2);
    });

    it('should inject styles on first use', () => {
      const manager = getMomentsManager();
      manager.whisper('test');

      const styleEl = document.getElementById('ferni-moments-styles');
      expect(styleEl).toBeTruthy();
    });

    it('should create moments container', () => {
      const manager = getMomentsManager();
      manager.whisper('test');

      const container = document.querySelector('.moments-container');
      expect(container).toBeTruthy();
      expect(container?.getAttribute('role')).toBe('status');
      expect(container?.getAttribute('aria-live')).toBe('polite');
    });
  });

  describe('whisper()', () => {
    it('should create whisper element with message', () => {
      const manager = getMomentsManager();
      manager.whisper('Saved!');

      const whisper = document.querySelector('.moment-whisper');
      expect(whisper).toBeTruthy();
      expect(whisper?.textContent).toBe('Saved!');
    });

    it('should apply correct type class', () => {
      const manager = getMomentsManager();

      manager.whisper('Info', { type: 'info' });
      expect(document.querySelector('.moment-whisper--info')).toBeTruthy();
    });

    it('should apply error type class', () => {
      const manager = getMomentsManager();
      manager.whisper('Error', { type: 'error' });
      expect(document.querySelector('.moment-whisper--error')).toBeTruthy();
    });

    it('should return unique IDs', () => {
      const manager = getMomentsManager();

      const id1 = manager.whisper('First');
      const id2 = manager.whisper('Second');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^moment-\d+$/);
    });

    it('should queue whispers when one is active', () => {
      const manager = getMomentsManager();

      manager.whisper('First');
      manager.whisper('Second');
      manager.whisper('Third');

      // Only one should be visible
      const whispers = document.querySelectorAll('.moment-whisper');
      expect(whispers.length).toBe(1);
    });
  });

  describe('notice()', () => {
    it('should create notice element', () => {
      const manager = getMomentsManager();
      manager.notice('+10 seeds', { type: 'seeds', amount: 10 });

      const notice = document.querySelector('.moment-notice');
      expect(notice).toBeTruthy();
    });

    it('should show amount for seeds type', () => {
      const manager = getMomentsManager();
      manager.notice('Daily bonus', { type: 'seeds', amount: 10 });

      const amount = document.querySelector('.moment-notice__amount');
      expect(amount?.textContent).toBe('+10');
    });

    it('should show action button when provided', () => {
      const mockCallback = vi.fn();
      const manager = getMomentsManager();

      manager.notice('New message', {
        action: { label: 'View', callback: mockCallback },
      });

      const actionBtn = document.querySelector('.moment-notice__action');
      expect(actionBtn).toBeTruthy();
      expect(actionBtn?.textContent).toBe('View');
    });
  });

  describe('dismiss()', () => {
    it('should dismiss active moment by ID', async () => {
      const manager = getMomentsManager();
      const id = manager.whisper('Test');

      manager.dismiss(id);

      // Wait for exit animation
      await new Promise((r) => setTimeout(r, 300));

      const whisper = document.querySelector('.moment-whisper');
      expect(whisper).toBeFalsy();
    });

    it('should not dismiss if ID does not match', () => {
      const manager = getMomentsManager();
      manager.whisper('Test');

      manager.dismiss('wrong-id');

      const whisper = document.querySelector('.moment-whisper');
      expect(whisper).toBeTruthy();
    });
  });

  describe('dismissAll()', () => {
    it('should dismiss all moments and clear queue', () => {
      const manager = getMomentsManager();

      manager.whisper('First');
      manager.whisper('Second');
      manager.whisper('Third');

      manager.dismissAll();

      // Queue should be empty (check by showing another)
      const id = manager.whisper('New');
      expect(id).toMatch(/^moment-\d+$/);
    });
  });

  describe('event system', () => {
    it('should emit whisper:shown event', () => {
      const manager = getMomentsManager();
      const listener = vi.fn();

      manager.on('whisper:shown', listener);
      manager.whisper('Test', { type: 'success' });

      expect(listener).toHaveBeenCalledWith({
        id: expect.stringMatching(/^moment-\d+$/),
        type: 'success',
      });
    });

    it('should return unsubscribe function', () => {
      const manager = getMomentsManager();
      const listener = vi.fn();

      const unsub = manager.on('whisper:shown', listener);
      unsub();

      manager.whisper('Test');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up on reset', () => {
      const manager = getMomentsManager();
      manager.whisper('Test');

      resetMomentsManager();

      expect(document.querySelector('.moments-container')).toBeFalsy();
      expect(document.getElementById('ferni-moments-styles')).toBeFalsy();
    });

    it('should clean up orphaned elements from HMR', () => {
      // Simulate orphaned element
      const orphan = document.createElement('div');
      orphan.className = 'moments-container';
      document.body.appendChild(orphan);

      // Initialize should clean it up
      const manager = getMomentsManager();
      manager.whisper('Test');

      const containers = document.querySelectorAll('.moments-container');
      expect(containers.length).toBe(1);
    });
  });
});
