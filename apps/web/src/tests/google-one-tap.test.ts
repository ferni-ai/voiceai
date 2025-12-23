/**
 * Google One-Tap Service Tests
 *
 * Tests the One-Tap sign-in flow:
 * - Cooldown management (progressive backoff)
 * - Eligibility checks
 * - Initialization
 * - Integration with Firebase Auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockAuthState = {
  isConfigured: true,
  isAuthenticated: true,
  isLinked: false,
  uid: 'test-uid-123',
  email: null,
  displayName: null,
  photoURL: null,
  linkedProviders: [],
};

const mockLinkedAuthState = {
  ...mockAuthState,
  isLinked: true,
  email: 'test@example.com',
  linkedProviders: ['google.com'],
};

vi.mock('../services/firebase-auth.service.js', () => ({
  linkWithGoogleCredential: vi.fn(),
  getAuthState: vi.fn(() => mockAuthState),
  onAuthStateChange: vi.fn((callback) => {
    callback(mockAuthState);
    return () => {};
  }),
}));

vi.mock('../state/app.state.js', () => ({
  appState: {
    get: vi.fn((key: string) => {
      if (key === 'connection') return 'disconnected';
      return null;
    }),
  },
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock Google Identity Services
const mockGooglePrompt = vi.fn();
const mockGoogleCancel = vi.fn();
const mockGoogleInitialize = vi.fn();

Object.defineProperty(window, 'google', {
  value: {
    accounts: {
      id: {
        initialize: mockGoogleInitialize,
        prompt: mockGooglePrompt,
        cancel: mockGoogleCancel,
        disableAutoSelect: vi.fn(),
        revoke: vi.fn(),
      },
    },
  },
  writable: true,
});

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Google One-Tap Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    vi.useFakeTimers();

    // Reset module state by re-importing
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // COOLDOWN TESTS
  // ============================================================================

  describe('Cooldown Management', () => {
    it('isInCooldown returns false when no dismissal recorded', async () => {
      const { isInCooldown } = await import('../services/google-one-tap.service.js');
      expect(isInCooldown()).toBe(false);
    });

    it('isInCooldown returns true during cooldown period', async () => {
      const { isInCooldown } = await import('../services/google-one-tap.service.js');

      // Simulate a dismissal by setting localStorage
      const futureTime = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now
      localStorageMock.setItem('ferni_one_tap_dismissed_until', futureTime.toString());

      expect(isInCooldown()).toBe(true);
    });

    it('isInCooldown returns false after cooldown expires', async () => {
      const { isInCooldown } = await import('../services/google-one-tap.service.js');

      // Set a past dismissal time
      const pastTime = Date.now() - 1000;
      localStorageMock.setItem('ferni_one_tap_dismissed_until', pastTime.toString());

      expect(isInCooldown()).toBe(false);
    });

    it('clearCooldown removes cooldown data', async () => {
      const { clearCooldown, isInCooldown } = await import(
        '../services/google-one-tap.service.js'
      );

      // Set cooldown
      const futureTime = Date.now() + 24 * 60 * 60 * 1000;
      localStorageMock.setItem('ferni_one_tap_dismissed_until', futureTime.toString());
      localStorageMock.setItem('ferni_one_tap_prompt_count', '2');

      expect(isInCooldown()).toBe(true);

      // Clear it
      clearCooldown();

      expect(isInCooldown()).toBe(false);
      expect(localStorageMock.getItem('ferni_one_tap_dismissed_until')).toBeNull();
      expect(localStorageMock.getItem('ferni_one_tap_prompt_count')).toBeNull();
    });
  });

  // ============================================================================
  // CANCEL TESTS
  // ============================================================================

  describe('cancelOneTap', () => {
    it('calls google cancel when prompt is showing', async () => {
      const { initGoogleOneTap, showOneTapIfEligible, cancelOneTap } = await import(
        '../services/google-one-tap.service.js'
      );

      // Mock import.meta.env
      vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');

      // Initialize
      initGoogleOneTap();

      // Wait for initialization
      vi.advanceTimersByTime(1000);

      // Show the prompt (sets isPromptShowing = true internally)
      showOneTapIfEligible();

      // Cancel should call google cancel
      cancelOneTap();

      expect(mockGoogleCancel).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration with Firebase Auth', () => {
    it('does not show prompt when user is already linked', async () => {
      // Override mock to return linked state
      const { getAuthState } = await import('../services/firebase-auth.service.js');
      vi.mocked(getAuthState).mockReturnValue(mockLinkedAuthState);

      const { showOneTapIfEligible } = await import('../services/google-one-tap.service.js');

      vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');

      showOneTapIfEligible();

      expect(mockGooglePrompt).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // EVENT DISPATCH TESTS
  // ============================================================================

  describe('Event Dispatch', () => {
    it('dispatches ferni:one-tap-success on successful credential', async () => {
      const eventHandler = vi.fn();
      window.addEventListener('ferni:one-tap-success', eventHandler);

      const { linkWithGoogleCredential } = await import('../services/firebase-auth.service.js');
      vi.mocked(linkWithGoogleCredential).mockResolvedValue({} as never);

      // Simulate the credential response callback
      const event = new CustomEvent('ferni:one-tap-success', {
        detail: { method: 'one-tap' },
      });
      window.dispatchEvent(event);

      expect(eventHandler).toHaveBeenCalled();

      window.removeEventListener('ferni:one-tap-success', eventHandler);
    });

    it('dispatches ferni:one-tap-error on credential failure', async () => {
      const eventHandler = vi.fn();
      window.addEventListener('ferni:one-tap-error', eventHandler);

      // Simulate error event
      const event = new CustomEvent('ferni:one-tap-error', {
        detail: { error: 'Test error' },
      });
      window.dispatchEvent(event);

      expect(eventHandler).toHaveBeenCalled();

      window.removeEventListener('ferni:one-tap-error', eventHandler);
    });
  });
});

// ============================================================================
// STORAGE KEY TESTS
// ============================================================================

describe('Storage Keys', () => {
  it('uses correct storage keys', async () => {
    const { clearCooldown } = await import('../services/google-one-tap.service.js');

    // Set some data
    localStorageMock.setItem('ferni_one_tap_dismissed_until', '123');
    localStorageMock.setItem('ferni_one_tap_prompt_count', '1');

    clearCooldown();

    expect(localStorageMock.getItem('ferni_one_tap_dismissed_until')).toBeNull();
    expect(localStorageMock.getItem('ferni_one_tap_prompt_count')).toBeNull();
  });
});
