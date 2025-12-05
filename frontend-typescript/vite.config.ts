import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@design-system': resolve(__dirname, '../design-system/dist'),
    },
  },
  server: {
    port: 3004,
    proxy: {
      '/token': 'http://localhost:3001',
      '/token-url': 'http://localhost:3001',
      '/spotify': 'http://localhost:3001',
      // Agent routes go to ui-server (which has the registry integration)
      '/api/agents': 'http://localhost:3003',
      // Other API routes to token server
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor libraries
          'vendor-particles': ['@tsparticles/engine', '@tsparticles/slim'],
          // UI components (lazy loadable)
          'ui-premium': [
            './src/ui/celebrations.ui.ts',
            './src/ui/easter-eggs.ui.ts',
            './src/ui/stats.ui.ts',
            './src/ui/agent-particles.ui.ts',
          ],
        },
      },
    },
    // Increase warning limit since we're chunking now
    chunkSizeWarningLimit: 400,
  },
});

