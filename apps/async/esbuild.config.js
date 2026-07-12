/**
 * esbuild configuration for fast TypeScript compilation
 * 
 * Usage: node esbuild.config.js
 * 
 * ~12x faster than tsc for compilation (no type checking)
 */

import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

import * as esbuild from 'esbuild';

const asyncLoggerShim = resolve('./src/daily-outreach-logger-shim.ts');
const asyncLoggerPlugin = {
  name: 'async-logger-shim',
  setup(build) {
    build.onResolve({ filter: /utils\/safe-logger\.js$/ }, () => ({
      path: asyncLoggerShim,
    }));
  },
};

// Recursively find all TypeScript files in src/
function findTsFiles(dir, files = []) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    if (statSync(fullPath).isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (item.endsWith('.ts') && !item.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const entryPoints = findTsFiles('./src');
const dailyOutreachEntry = '../../src/services/outreach/daily-outreach-job.ts';

console.log(`Building ${entryPoints.length} async TypeScript files...`);
const start = Date.now();

await esbuild.build({
  entryPoints,
  outdir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  // Keep .js extensions for ESM imports
  outExtension: { '.js': '.js' },
  // Bundle dependencies? No - we want Node to resolve them
  bundle: false,
  // Preserve directory structure
  preserveSymlinks: true,
});

console.log('Building bundled daily outreach job...');
await esbuild.build({
  entryPoints: [dailyOutreachEntry],
  outfile: 'dist/daily-outreach/daily-outreach-job.js',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  bundle: true,
  // Single file — Cloud Build upload cannot ship thousands of split chunks.
  splitting: false,
  packages: 'external',
  preserveSymlinks: true,
  plugins: [asyncLoggerPlugin],
});

const elapsed = Date.now() - start;
console.log(`✅ Built async worker and daily outreach bundle in ${elapsed}ms`);

