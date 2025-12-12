import { resolve } from 'path';
import { defineConfig } from 'vite';

// Stub for native Capacitor plugins that don't exist in web builds
const capacitorStub = resolve(__dirname, 'src/stubs/capacitor-stub.ts');

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@design-system': resolve(__dirname, '../design-system/dist'),
      // Stub native-only Capacitor plugins for web development
      '@ferni/capacitor-purchases': capacitorStub,
      '@capacitor/browser': capacitorStub,
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
      // Token server runs on port 3001 (LiveKit tokens, Spotify OAuth)
      '/token': 'http://localhost:3001',
      '/token-url': 'http://localhost:3001',
      '/spotify': 'http://localhost:3001',
      // UI server runs on port 3002 (APIs, subscriptions)
      '/api/agents': 'http://localhost:3002',
      '/api/cognitive': 'http://localhost:3002',
      '/api/conversations': 'http://localhost:3002',
      '/api/analytics': 'http://localhost:3002',
      '/api/predictions': 'http://localhost:3002',
      '/api/rituals': 'http://localhost:3002',
      '/api/huddles': 'http://localhost:3002',
      '/api/export': 'http://localhost:3002',
      '/api/relationship': 'http://localhost:3002',
      '/api/voice': 'http://localhost:3002',
      '/api/trust': 'http://localhost:3002',
      '/api/marketplace': 'http://localhost:3002',
      '/subscription': 'http://localhost:3002',
      '/api/subscription': 'http://localhost:3002',
      '/api/v1': 'http://localhost:3002',
      '/api/evalops': 'http://localhost:3002',
      '/api/metrics': 'http://localhost:3002',
      '/api': 'http://localhost:3002',
      '/health': 'http://localhost:3002',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.SOURCE_MAP === 'true', // Only enable if explicitly requested
    minify: 'esbuild',
    target: 'es2022',
    // Drop console logs and debugger in production
    esbuild: {
      drop: ['console', 'debugger'],
    },
    rollupOptions: {
      // Treat gsap as external - use window.gsap from CDN
      external: ['gsap'],
      output: {
        // Map gsap imports to the global
        globals: {
          gsap: 'gsap',
        },
        // Smart chunking strategy for optimal loading
        manualChunks(id) {
          // Vendor libraries - separate chunks for parallel loading
          if (id.includes('node_modules')) {
            if (id.includes('@tsparticles')) return 'vendor-particles';
            if (id.includes('livekit-client')) return 'vendor-rtc';
            if (id.includes('@capacitor')) return 'vendor-capacitor';
            // Other node_modules go to vendor chunk
            return 'vendor';
          }

          // Admin portal - lazy loaded, separate chunk
          if (id.includes('/admin/')) return 'admin';

          // Dev panel - lazy loaded for 17KB gzipped savings
          if (id.includes('dev-panel')) return 'dev-panel';

          // Engagement features - heavy dashboards, lazy loaded
          if (
            id.includes('engagement') ||
            id.includes('predictions') ||
            id.includes('analytics-dashboard') ||
            id.includes('prediction-tracker') ||
            id.includes('team-huddle') ||
            id.includes('cognitive-insights')
          ) {
            return 'ui-engagement';
          }

          // Premium effects - celebrations, particles, etc.
          if (
            id.includes('celebrations') ||
            id.includes('easter-eggs') ||
            id.includes('streak-celebrations') ||
            id.includes('agent-particles') ||
            id.includes('weather-effects')
          ) {
            return 'ui-premium';
          }

          // Secondary modals - lazy loaded
          if (
            id.includes('onboarding') ||
            id.includes('conversation-history') ||
            id.includes('ritual-builder') ||
            id.includes('data-export') ||
            id.includes('settings-menu') ||
            id.includes('marketplace')
          ) {
            return 'ui-secondary';
          }

          // Animation systems
          if (
            id.includes('animation-orchestrator') ||
            id.includes('micro-interactions') ||
            id.includes('kinetic-typography') ||
            id.includes('ambient-effects') ||
            id.includes('loading-states') ||
            id.includes('persona-transition')
          ) {
            return 'ui-animations';
          }

          // Services - split heavy from light
          if (id.includes('/services/')) {
            if (id.includes('spotify') || id.includes('music')) return 'services-music';
            if (id.includes('engagement') || id.includes('ritual')) return 'services-engagement';
          }
        },
      },
    },
    // Increase warning limit since we're chunking now
    chunkSizeWarningLimit: 500,
  },
});
