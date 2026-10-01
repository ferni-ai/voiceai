import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import { stripUntranslatedI18n } from './vite-plugins/strip-untranslated-i18n';
import { noChunkCycles } from './vite-plugins/no-chunk-cycles';

// Stub for native Capacitor plugins that don't exist in web builds
const capacitorStub = resolve(__dirname, 'src/stubs/capacitor-stub.ts');
// Stub for Firebase when not configured (dev only)
const firebaseStub = resolve(__dirname, 'src/stubs/firebase-stub.ts');

/**
 * Whether a module is loaded at startup: the entry imports it through a chain
 * of static imports. Used to keep lazily imported code out of startup chunks.
 */
type ModuleInfoLookup = (
  id: string
) => { isEntry: boolean; importers: readonly string[]; importedIds: readonly string[] } | null;

const startupCache = new Map<string, boolean>();
function isStartupModule(id: string, getModuleInfo: ModuleInfoLookup): boolean {
  const cached = startupCache.get(id);
  if (cached !== undefined) return cached;
  startupCache.set(id, false); // cycle guard
  const info = getModuleInfo(id);
  const result =
    !!info &&
    (info.isEntry || info.importers.some((importer) => isStartupModule(importer, getModuleInfo)));
  startupCache.set(id, result);
  return result;
}

/**
 * Whether a startup module only (transitively) imports other such modules:
 * utilities, config, tokens and other foundations. Modules in an import cycle
 * are excluded, so the core chunk never needs anything outside itself.
 */
const coreCache = new Map<string, boolean>();
function isCoreModule(id: string, getModuleInfo: ModuleInfoLookup): boolean {
  const cached = coreCache.get(id);
  if (cached !== undefined) return cached;
  coreCache.set(id, false); // cycle: stay out of core
  const info = getModuleInfo(id);
  const result =
    !!info &&
    !info.isEntry &&
    info.importedIds
      .filter((dep) => !dep.includes('node_modules') && !dep.startsWith('\0'))
      .every((dep) => isCoreModule(dep, getModuleInfo));
  coreCache.set(id, result);
  return result;
}

/** Longest chain of app-code imports below a core module (leaves are 0). */
const heightCache = new Map<string, number>();
function coreHeight(id: string, getModuleInfo: ModuleInfoLookup): number {
  const cached = heightCache.get(id);
  if (cached !== undefined) return cached;
  const deps = (getModuleInfo(id)?.importedIds ?? []).filter(
    (dep) => !dep.includes('node_modules') && !dep.startsWith('\0')
  );
  const height = deps.length
    ? 1 + Math.max(...deps.map((dep) => coreHeight(dep, getModuleInfo)))
    : 0;
  heightCache.set(id, height);
  return height;
}

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
    plugins: [stripUntranslatedI18n(), noChunkCycles()],
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
      ],
      // Pre-bundle these heavy dependencies on server start (not on first request)
      // This significantly speeds up the first page load
      include: [
        'livekit-client',
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
      // The offline E2E suite (playwright.config.ts) mocks the backend and must
      // never reach a real UI server.
      proxy:
        process.env.FERNI_E2E_OFFLINE === '1'
          ? undefined
          : {
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
        output: {
          // Map gsap imports to the global
          globals: {
            gsap: 'gsap',
          },
          // Fold tiny lazy chunks into their neighbours (fewer requests, better
          // compression); Rollup only merges where load order stays the same.
          experimentalMinChunkSize: 25_000,
          // Smart chunking strategy for optimal loading
          manualChunks(id, { getModuleInfo }) {
            // Vendor libraries - separate chunks for parallel loading
            if (id.includes('node_modules')) {
              if (id.includes('@tsparticles')) return 'vendor-particles';
              if (id.includes('livekit-client')) return 'vendor-rtc';
              if (id.includes('@capacitor')) return 'vendor-capacitor';
              // Other node_modules go to vendor chunk
              return 'vendor';
            }

            // App code needed at startup is spread over a few chunks so none
            // gets too large and they download in parallel. Only modules the
            // entry reaches through static imports are grouped: grouping by
            // path alone pulled lazy code (dev panel, admin, dashboards) into
            // startup chunks. Everything else splits along its dynamic imports.
            if (!isStartupModule(id, getModuleInfo)) return undefined;
            // Shared foundations go in their own chunk; the entry keeps the rest.
            // app-core only ever imports app-core, so the two can't form an
            // import cycle (a cycle across chunks breaks module init order).
            if (isCoreModule(id, getModuleInfo)) {
              // Band core by dependency height: a module only imports lower
              // heights, so lower bands never import higher ones (still acyclic)
              const height = coreHeight(id, getModuleInfo);
              if (height <= 3) return 'app-core-1';
              if (height === 4) return 'app-core-2';
              return 'app-core-3';
            }
            return undefined;
          },
        },
      },
      // Increase warning limit since we're chunking now
      chunkSizeWarningLimit: 500,
    },
  };
});
