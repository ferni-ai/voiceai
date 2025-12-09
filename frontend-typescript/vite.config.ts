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
  // Use global GSAP from CDN instead of bundling npm version
  // This avoids duplicate instances and plugin registration issues
  optimizeDeps: {
    exclude: ['gsap'],
  },
  server: {
    port: 3004,
    proxy: {
      '/token': 'http://localhost:3001',
      '/token-url': 'http://localhost:3001',
      // Spotify routes - use UI server (3002) which has fallback handling
      // Token server (3001) has per-user spotify linking, but may not always be running
      '/spotify': 'http://localhost:3002',
      // Agent routes go to ui-server (which has the registry integration)
      '/api/agents': 'http://localhost:3002',
      // Engagement API routes go to ui-server
      '/api/cognitive': 'http://localhost:3002',
      '/api/conversations': 'http://localhost:3002',
      '/api/analytics': 'http://localhost:3002',
      '/api/predictions': 'http://localhost:3002',
      '/api/rituals': 'http://localhost:3002',
      '/api/huddles': 'http://localhost:3002',
      '/api/export': 'http://localhost:3002',
      '/api/relationship': 'http://localhost:3002',
      // Voice authentication routes
      '/api/voice': 'http://localhost:3002',
      // Trust journey routes
      '/api/trust': 'http://localhost:3002',
      // Marketplace routes
      '/api/marketplace': 'http://localhost:3002',
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
          // Premium UI effects (celebrations, particles, etc.)
          'ui-premium': [
            './src/ui/celebrations.ui.ts',
            './src/ui/easter-eggs.ui.ts',
            './src/ui/stats.ui.ts',
            './src/ui/agent-particles.ui.ts',
            './src/ui/streak-celebrations.ui.ts',
          ],
          // Engagement UI (dashboards, analytics)
          'ui-engagement': [
            './src/ui/engagement.ui.ts',
            './src/ui/predictions.ui.ts',
            './src/ui/analytics-dashboard.ui.ts',
            './src/ui/prediction-tracker.ui.ts',
            './src/ui/team-huddle.ui.ts',
          ],
          // Secondary UI (modals, overlays)
          'ui-secondary': [
            './src/ui/onboarding.ui.ts',
            './src/ui/conversation-history.ui.ts',
            './src/ui/cognitive-insights.ui.ts',
            './src/ui/ritual-builder.ui.ts',
            './src/ui/data-export.ui.ts',
          ],
          // Animation orchestration
          'ui-animations': [
            './src/ui/animation-orchestrator.ui.ts',
            './src/ui/micro-interactions.ui.ts',
            './src/ui/kinetic-typography.ui.ts',
            './src/ui/ambient-effects.ui.ts',
            './src/ui/loading-states.ui.ts',
            './src/ui/persona-transition.ui.ts',
          ],
        },
      },
    },
    // Increase warning limit since we're chunking now
    chunkSizeWarningLimit: 400,
  },
});

