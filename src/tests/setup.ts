import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as dotenv from 'dotenv';
import { initializeLogger, log } from '@livekit/agents';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test setup
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.MEMORY_STORE_TYPE = 'memory'; // Use in-memory store for tests

  // CRITICAL: Initialize LiveKit logger before any tests run
  // This prevents "logger not initialized" errors throughout the test suite
  initializeLogger({ pretty: false });
});

// Cleanup after all tests
afterAll(() => {
  // Cleanup any global resources
});

// Reset state before each test
beforeEach(() => {
  // Clear any test state
});

// Cleanup after each test
afterEach(() => {
  // Reset mocks, clear timers, etc.
});
