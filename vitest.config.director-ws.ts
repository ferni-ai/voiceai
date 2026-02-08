/**
 * Vitest config for Director WebSocket protocol test only.
 * Run: pnpm exec vitest run src/tests/integration/director-websocket-protocol.test.ts --config vitest.config.director-ws.ts
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/integration/director-websocket-protocol.test.ts'],
    exclude: ['node_modules/**', '**/node_modules/**'],
    testTimeout: 10000,
    setupFiles: ['./src/tests/setup.ts'],
  },
});
