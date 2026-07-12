/**
 * esbuild configuration for fast TypeScript compilation
 *
 * Usage: node esbuild.config.js
 *
 * ~12x faster than tsc for compilation (no type checking)
 */

import { readdirSync, statSync } from 'fs';
import { join } from 'path';

import * as esbuild from 'esbuild';

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

console.log(`Building ${entryPoints.length} async TypeScript files...`);
const start = Date.now();

await esbuild.build({
  entryPoints,
  outdir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  outExtension: { '.js': '.js' },
  bundle: false,
  preserveSymlinks: true,
});

const elapsed = Date.now() - start;
console.log(`✅ Built async worker in ${elapsed}ms`);
