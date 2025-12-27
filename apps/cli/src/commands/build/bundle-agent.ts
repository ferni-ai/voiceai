#!/usr/bin/env npx tsx
/**
 * Bundle Voice Agent Child Process
 *
 * Creates a single-file bundle of voice-agent-child.ts with all lightweight
 * internal dependencies inlined. This eliminates import resolution time
 * during child process startup.
 *
 * External packages (@livekit/*, @google/*) are kept external since they're
 * already in node_modules and bundling them would bloat the output.
 *
 * Usage:
 *   npx tsx scripts/bundle-child.ts
 *
 * Output:
 *   dist/agents/voice-agent-child.bundle.js
 */

import * as esbuild from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Use the COMPILED JS file from dist/ as entry point
  // This is AFTER build:fast runs, so all .ts files have been compiled to .js
  // Using source .ts files would fail because imports use .js extensions
  entry: join(PROJECT_ROOT, 'dist/agents/voice-agent-entry.js'),
  outfile: join(PROJECT_ROOT, 'dist/agents/voice-agent-bundle.js'),
  target: 'es2022' as const,
  format: 'esm' as const,
  platform: 'node' as const,

  // External packages - don't bundle these (they're in node_modules)
  external: [
    // LiveKit packages - have complex dependencies and native bindings
    '@livekit/agents',
    '@livekit/agents-plugin-google',
    '@livekit/agents-plugin-silero',
    '@livekit/agents-plugin-cartesia',
    '@livekit/rtc-node',
    '@livekit/noise-cancellation-node',
    // Google packages
    '@google/genai',
    '@google/generative-ai',
    // Node.js built-ins (both bare and node: prefixed)
    'fs',
    'fs/promises',
    'path',
    'url',
    'worker_threads',
    'crypto',
    'http',
    'https',
    'stream',
    'events',
    'buffer',
    'util',
    'os',
    'child_process',
    'net',
    'tls',
    'dns',
    'zlib',
    'querystring',
    'assert',
    // Node.js prefixed imports (node:*)
    'node:fs',
    'node:fs/promises',
    'node:path',
    'node:url',
    'node:worker_threads',
    'node:crypto',
    'node:http',
    'node:https',
    'node:stream',
    'node:events',
    'node:buffer',
    'node:util',
    'node:os',
    'node:child_process',
    'node:net',
    'node:tls',
    'node:dns',
    'node:zlib',
    'node:querystring',
    'node:assert',
    'node:process',
    'node:timers',
    'node:timers/promises',
    // Other external deps
    'dotenv',
    'dotenv/config',
  ],
};

// ============================================================================
// COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
};

// ============================================================================
// BUILD
// ============================================================================

async function bundleChild(): Promise<void> {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}BUNDLE VOICE AGENT CHILD${colors.reset}                                  ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  Single-file bundle for faster startup ⚡                     ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const startTime = Date.now();

  // Ensure output directory exists
  const outDir = dirname(CONFIG.outfile);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  try {
    const result = await esbuild.build({
      entryPoints: [CONFIG.entry],
      outfile: CONFIG.outfile,
      bundle: true, // Bundle all imports!
      target: CONFIG.target,
      format: CONFIG.format,
      platform: CONFIG.platform,
      sourcemap: true,
      minify: false, // Keep readable for debugging
      keepNames: true,
      treeShaking: true,
      external: CONFIG.external,
      logLevel: 'warning',
      
      // Handle JSON imports (for seed-data.json etc.)
      loader: { '.json': 'json' },

      // Add banner to identify this as a bundle
      banner: {
        js: `/**
 * BUNDLED: voice-agent-child.bundle.js
 * Generated: ${new Date().toISOString()}
 * 
 * This is a single-file bundle of voice-agent-child.ts with all lightweight
 * internal dependencies inlined. External packages are kept external.
 * 
 * DO NOT EDIT - regenerate with: npx tsx scripts/bundle-child.ts
 */
`,
      },

      // Metafile for analysis
      metafile: true,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Log bundle stats
    if (result.metafile) {
      const outputs = result.metafile.outputs;
      const bundleStats = outputs[CONFIG.outfile.replace(PROJECT_ROOT + '/', '')];
      if (bundleStats) {
        const sizeKB = Math.round(bundleStats.bytes / 1024);
        const inputCount = Object.keys(bundleStats.inputs).length;
        log.success(`Bundle created: ${sizeKB}KB (${inputCount} files inlined)`);
      }
    }

    log.success(`Completed in ${duration}s`);
    log.info(`Output: ${CONFIG.outfile}`);

    log.info('Bundle ready. Update voice-worker.ts to use ./voice-agent-bundle.js');
  } catch (error) {
    log.error(`Bundle failed: ${error}`);
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

bundleChild().catch((error) => {
  console.error('Bundle failed:', error);
  process.exit(1);
});

