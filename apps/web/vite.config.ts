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
      // Allow .js imports to resolve to .ts files (Node-style ESM imports)
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
      alias: {
        '@': resolve(__dirname, './src'),
        // Design system - specific file alias first, then directory
        '@design-system/tokens': resolve(__dirname, '../../design-system/dist/tokens.ts'),
        '@design-system/components': resolve(__dirname, '../../design-system/components/index.ts'),
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
      exclude: [
        'gsap',
        // Node/agent SDK - not for browser; excluding avoids 504 Outdated Optimize Dep
        '@livekit/agents',
        // LiveKit client - loaded via voice-engine.js UMD; no npm bundle needed
        'livekit-client',
      ],
      // Pre-bundle these heavy dependencies on server start (not on first request)
      // This significantly speeds up the first page load
      include: [
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        '@tsparticles/engine',
        '@tsparticles/slim',
        'uuid',
        'events',
      ],
    },
    // Warm up frequently used files for faster first load
    warmup: {
      clientFiles: [
        './src/app.ts',
        './src/ui/coach.ui.ts',
        './src/ui/controls.ui.ts',
        './src/ui/waveform.ui.ts',
        './src/services/livekit.service.ts',
      ],
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
        '/wearables': 'http://localhost:3002',
        '/auth': 'http://localhost:3002',
        '/api': 'http://localhost:3002',
        '/calendar': 'http://localhost:3002', // Calendar provider routes (Apple, Outlook)
        '/subscription': 'http://localhost:3002',
        '/usage': 'http://localhost:3002',
        '/health': 'http://localhost:3002',
        // WebSocket for real-time team insights
        // Note: WebSocket proxy can be flaky in dev - failures are non-critical
        '/ws/insights': {
          target: 'http://localhost:3002',
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', () => {
              // Silently handle proxy errors - WS reconnects automatically
            });
          },
        },
        '/ws/life-context': {
          target: 'http://localhost:3002',
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', () => {
              // Silently handle proxy errors - WS reconnects automatically
            });
          },
        },
        '/ws/director': {
          target: 'http://localhost:3002',
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', () => {
              // Silently handle proxy errors - WS reconnects automatically
            });
          },
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
        // A circular chunk is a runtime TDZ crash waiting for the right import
        // order; it shipped once as a warning nobody read. Fail the build.
        onwarn(warning, warn) {
          if (warning.code === 'CIRCULAR_CHUNK') {
            throw new Error(`[vite.config] ${warning.message}`);
          }
          warn(warning);
        },
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

            // App code is deliberately NOT hand-assigned. Name-based rules
            // (includes('engagement'), '/admin/', ...) split modules that import
            // each other eagerly into cyclic chunks; Rollup cannot order a chunk
            // cycle, so a chunk ran its top-level code before a dependency's
            // `const` was initialized ("Cannot access 'v' before initialization"
            // in admin-*.js took down app.ferni.ai). Rollup's automatic chunking
            // still splits at real dynamic-import() boundaries, and never cycles.
            return undefined;
          },
        },
      },
      // Increase warning limit since we're chunking now
      chunkSizeWarningLimit: 500,
    },
  };
});
