/**
 * esbuild configuration for fast TypeScript compilation
 * 
 * Usage: node esbuild.config.js
 * 
 * ~12x faster than tsc for compilation (no type checking)
 */

import * as esbuild from 'esbuild';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

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

console.log(`Building ${entryPoints.length} TypeScript files...`);
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

const elapsed = Date.now() - start;
console.log(`✅ Built ${entryPoints.length} files in ${elapsed}ms`);

