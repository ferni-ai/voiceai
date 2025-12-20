import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';

// Stub for native Capacitor plugins that don't exist in web builds
const capacitorStub = resolve(__dirname, 'src/stubs/capacitor-stub.ts');
// Stub for Firebase when not configured (dev only)
const firebaseStub = resolve(__dirname, 'src/stubs/firebase-stub.ts');

export default defineConfig(({ mode }) => {
  // Load env vars to check if Firebase is configured
  const env = loadEnv(mode, process.cwd(), '');
  const isFirebaseConfigured = !!(
    env.VITE_FIREBASE_API_KEY &&
    env.VITE_FIREBASE_AUTH_DOMAIN &&
    env.VITE_FIREBASE_PROJECT_ID
  );

  // Only stub Firebase in development when credentials aren't provided
  const shouldStubFirebase = mode === 'development' && !isFirebaseConfigured;

  return {
    root: '.',
    publicDir: 'public',
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        // Design system - specific file alias first, then directory
        '@design-system/tokens': resolve(__dirname, '../../design-system/dist/tokens.ts'),
        '@design-system': resolve(__dirname, '../../design-system/dist'),
        // Stub native-only Capacitor plugins for web development
        '@ferni/capacitor-purchases': capacitorStub,
        '@capacitor/browser': capacitorStub,
        '@capacitor/push-notifications': capacitorStub,
        '@capacitor/local-notifications': capacitorStub,
        // Firebase stubs ONLY in development without credentials
        ...(shouldStubFirebase && {
          'firebase/app': firebaseStub,
          'firebase/auth': firebaseStub,
        }),
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
        // UI server handles EVERYTHING (tokens, OAuth, APIs)
        // Run with: PORT=3002 node ui-server.js
        '/token': 'http://localhost:3002',
        '/token-url': 'http://localhost:3002',
        '/demo-token': 'http://localhost:3002',
        '/spotify': 'http://localhost:3002',
        '/auth': 'http://localhost:3002',
        '/api': 'http://localhost:3002',
        '/calendar': 'http://localhost:3002', // Calendar provider routes (Apple, Outlook)
        '/subscription': 'http://localhost:3002',
        '/usage': 'http://localhost:3002',
        '/health': 'http://localhost:3002',
        // WebSocket for real-time team insights
        '/ws': {
          target: 'http://localhost:3002',
          ws: true,
        },
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
  };
});
