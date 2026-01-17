/**
 * Vitest config for E2E integration tests.
 *
 * These tests require real API credentials and are run manually:
 *   npx vitest run --config vitest.integration.config.ts
 *
 * They test full integration flows with external services like:
 * - Plaid (banking)
 * - Google Calendar
 * - Terra/Oura/Whoop (biometrics)
 * - Twilio (telephony)
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/integration/**/*.test.ts'],
    // Override the exclude to allow integration tests
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 60000, // Longer timeout for external API calls
    hookTimeout: 30000,
  },
});
