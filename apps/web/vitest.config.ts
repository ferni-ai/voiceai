import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Stub for Firebase when not configured (dev only)
const firebaseStub = resolve(__dirname, 'src/stubs/firebase-stub.ts');

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    // Allow .js imports to resolve to .ts files (Node-style ESM imports)
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: {
      '@': resolve(__dirname, './src'),
      // Design system - specific file alias first, then directory
      '@design-system/tokens': resolve(__dirname, '../../design-system/dist/tokens.ts'),
      '@design-system': resolve(__dirname, '../../design-system/dist'),
      // Firebase stubs for tests
      'firebase/app': firebaseStub,
      'firebase/auth': firebaseStub,
    },
  },
});
