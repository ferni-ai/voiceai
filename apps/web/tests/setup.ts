/**
 * Test Setup - Global test configuration and mocks
 * 
 * This file runs before each test file and sets up:
 * - DOM environment
 * - Global mocks (localStorage, Audio, etc.)
 * - Test utilities
 */

import { vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK: localStorage
// ============================================================================

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
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// ============================================================================
// MOCK: Audio
// ============================================================================

class MockAudio {
  src = '';
  currentTime = 0;
  volume = 1;
  muted = false;
  paused = true;

  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

vi.stubGlobal('Audio', MockAudio);

// ============================================================================
// MOCK: matchMedia
// ============================================================================

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ============================================================================
// TEST LIFECYCLE
// ============================================================================

beforeEach(() => {
  // Clear mocks before each test
  vi.clearAllMocks();
  localStorageMock.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});

