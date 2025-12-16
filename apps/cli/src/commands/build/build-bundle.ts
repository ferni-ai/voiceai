#!/usr/bin/env npx tsx
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
 *   npx tsx apps/cli/src/commands/build/build-bundle.ts
 *   ferni build bundle
 */

import { build, BuildOptions } from 'esbuild';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..', '..', '..', '..');

interface BuildMetadata {
  buildTime: string;
  buildDurationMs: number;
  nodeVersion: string;
  entryPoint: string;
  output: string;
}

export async function buildBundle(): Promise<boolean> {
  console.log('🔨 Building optimized agent bundle...');
  const startTime = Date.now();

  try {
    // Build the main agent bundle
    console.log('  → Bundling with esbuild...');

    const buildOptions: BuildOptions = {
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
    };

    await build(buildOptions);

    const buildTime = Date.now() - startTime;
    console.log(`✅ Bundle built in ${buildTime}ms`);
    console.log(`   Output: dist/agent.bundle.js`);

    // Generate build metadata
    const metadata: BuildMetadata = {
      buildTime: new Date().toISOString(),
      buildDurationMs: buildTime,
      nodeVersion: process.version,
      entryPoint: 'src/agents/voice-agent.ts',
      output: 'dist/agent.bundle.js',
    };

    writeFileSync(join(ROOT_DIR, 'dist/build-metadata.json'), JSON.stringify(metadata, null, 2));

    return true;
  } catch (error) {
    console.error('❌ Bundle build failed:', error);
    return false;
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  buildBundle()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
