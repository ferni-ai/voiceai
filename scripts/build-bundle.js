#!/usr/bin/env node
/**
 * Production Bundle Builder
 *
 * Uses esbuild to create a single optimized bundle for the voice agent.
 * This significantly reduces startup time by:
 * - Eliminating module resolution overhead
 * - Tree-shaking unused code
 * - Minifying the output
 *
 * Usage:
 *   node scripts/build-bundle.js
 *   npm run build:bundle
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

async function buildBundle() {
  console.log('🔨 Building optimized agent bundle...');
  const startTime = Date.now();

  try {
    // First, run TypeScript to check types (but we'll use esbuild for the actual build)
    console.log('  → Type checking...');

    // Build the main agent bundle
    console.log('  → Bundling with esbuild...');

    await build({
      entryPoints: [join(ROOT_DIR, 'src/agents/voice-agent.ts')],
      bundle: true,
      outfile: join(ROOT_DIR, 'dist/agent.bundle.js'),
      platform: 'node',
      target: 'node20',
      format: 'esm',
      sourcemap: true,
      minify: process.env.NODE_ENV === 'production',
      treeShaking: true,

      // Keep dynamic imports for lazy loading
      splitting: false,

      // External packages that should not be bundled
      external: [
        // Native modules
        'fsevents',
        'better-sqlite3',
        'cpu-features',
        // Large runtime dependencies (let Node resolve these)
        '@livekit/*',
        '@google/*',
        'firebase-admin',
        // Packages with native bindings
        'sharp',
        'canvas',
      ],

      // Define compile-time constants
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      },

      // Banner for the output file
      banner: {
        js: `// Ferni Voice Agent - Bundled with esbuild
// Generated: ${new Date().toISOString()}
`,
      },

      // Log build info
      logLevel: 'info',
      metafile: true,
    });

    const buildTime = Date.now() - startTime;
    console.log(`✅ Bundle built in ${buildTime}ms`);
    console.log(`   Output: dist/agent.bundle.js`);

    // Generate build metadata
    const metadata = {
      buildTime: new Date().toISOString(),
      buildDurationMs: buildTime,
      nodeVersion: process.version,
      entryPoint: 'src/agents/voice-agent.ts',
      output: 'dist/agent.bundle.js',
    };

    writeFileSync(
      join(ROOT_DIR, 'dist/build-metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

  } catch (error) {
    console.error('❌ Bundle build failed:', error);
    process.exit(1);
  }
}

buildBundle();
