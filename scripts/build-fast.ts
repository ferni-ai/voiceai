#!/usr/bin/env npx tsx
/**
 * Fast Build Script using esbuild
 *
 * ~10-50x faster than tsc for transpilation.
 *
 * Usage:
 *   npx tsx scripts/build-fast.ts          # Build with esbuild
 *   npx tsx scripts/build-fast.ts --types  # Also generate .d.ts files (slower)
 *   npx tsx scripts/build-fast.ts --watch  # Watch mode
 *
 * How it works:
 *   1. esbuild transpiles TS → JS (very fast, ~2-5 seconds)
 *   2. Optionally runs tsc --emitDeclarationOnly for .d.ts files
 *
 * For production Docker builds, we skip .d.ts generation since
 * the runtime doesn't need type declarations.
 */

import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  srcDir: join(PROJECT_ROOT, 'src'),
  outDir: join(PROJECT_ROOT, 'dist'),
  target: 'es2022' as const,
  format: 'esm' as const,
  platform: 'node' as const,

  // Files to exclude from build
  exclude: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/tests/**',
    '**/__tests__/**',
    '**/test-*.ts',
  ],

  // JSON files to copy (needed at runtime)
  copyPatterns: ['**/*.json', '**/*.md'],
};

// ============================================================================
// COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (msg: string) =>
    console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// HELPERS
// ============================================================================

function findFiles(dir: string): string[] {
  const files: string[] = [];

  // Recursive walk (Node 20 compatible - no glob needed)
  const walk = (d: string) => {
    try {
      const entries = readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(d, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walk(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory might not be readable, skip it
    }
  };
  walk(dir);

  return files;
}

function copyStaticFiles(): void {
  // Copy persona bundles (JSON, MD files)
  const bundlesDir = join(CONFIG.srcDir, 'personas', 'bundles');
  const bundlesOutDir = join(CONFIG.outDir, 'personas', 'bundles');

  if (existsSync(bundlesDir)) {
    cpSync(bundlesDir, bundlesOutDir, {
      recursive: true,
      filter: (src) => {
        // Copy directories and non-TS files
        const stat = statSync(src);
        if (stat.isDirectory()) return true;
        return !src.endsWith('.ts');
      },
    });
    log.success('Copied persona bundles');
  }
}

// ============================================================================
// BUILD FUNCTIONS
// ============================================================================

async function buildWithEsbuild(watch = false): Promise<void> {
  log.step('BUILDING WITH ESBUILD');

  const startTime = Date.now();

  // Find all TypeScript files
  log.info('Finding TypeScript files...');
  const allFiles = findFiles(CONFIG.srcDir);

  // Filter out test files and excluded patterns
  const entryPoints = allFiles.filter((file) => {
    const relPath = relative(CONFIG.srcDir, file);
    return !CONFIG.exclude.some((pattern) => {
      // Simple glob matching
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      );
      return regex.test(relPath);
    });
  });

  log.info(`Found ${entryPoints.length} TypeScript files to compile`);

  // Ensure output directory exists
  if (!existsSync(CONFIG.outDir)) {
    mkdirSync(CONFIG.outDir, { recursive: true });
  }

  // Build options
  const buildOptions: esbuild.BuildOptions = {
    entryPoints,
    outdir: CONFIG.outDir,
    outbase: CONFIG.srcDir,
    target: CONFIG.target,
    format: CONFIG.format,
    platform: CONFIG.platform,
    sourcemap: true,
    bundle: false, // Don't bundle - preserve file structure
    splitting: false,
    treeShaking: false, // Preserve exports
    keepNames: true,
    minify: false, // Don't minify for debugging
    logLevel: 'warning',

    // Handle .js extensions for ESM imports
    outExtension: { '.js': '.js' },

    // Preserve import paths
    packages: 'external',
  };

  if (watch) {
    log.info('Starting watch mode...');
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    log.success('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log.success(`esbuild completed in ${duration}s (${entryPoints.length} files)`);
  }

  // Copy static files
  copyStaticFiles();
}

async function generateDeclarations(): Promise<void> {
  log.step('GENERATING TYPE DECLARATIONS');

  const startTime = Date.now();
  log.info('Running tsc --emitDeclarationOnly...');

  try {
    execSync('npx tsc -p tsconfig.build.json --emitDeclarationOnly', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log.success(`Type declarations generated in ${duration}s`);
  } catch (error) {
    log.warn('Type declaration generation had errors (continuing anyway)');
  }
}

async function typeCheck(): Promise<void> {
  log.step('TYPE CHECKING');

  const startTime = Date.now();
  log.info('Running tsc --noEmit...');

  try {
    execSync('npx tsc -p tsconfig.build.json --noEmit', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log.success(`Type check passed in ${duration}s`);
  } catch (error) {
    log.warn('Type check had errors');
    process.exit(1);
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const watch = args.includes('--watch') || args.includes('-w');
  const withTypes = args.includes('--types') || args.includes('-t');
  const typeCheckOnly = args.includes('--typecheck') || args.includes('-c');

  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI FAST BUILD${colors.reset}                                           ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  Powered by esbuild ⚡                                        ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const totalStart = Date.now();

  if (typeCheckOnly) {
    await typeCheck();
  } else {
    // Run esbuild (fast transpilation)
    await buildWithEsbuild(watch);

    // Optionally generate .d.ts files
    if (withTypes && !watch) {
      await generateDeclarations();
    }
  }

  if (!watch) {
    const totalDuration = ((Date.now() - totalStart) / 1000).toFixed(2);
    log.step('BUILD COMPLETE');
    log.success(`Total time: ${totalDuration}s`);

    if (!withTypes) {
      log.info('Tip: Run with --types to also generate .d.ts files');
    }
  }
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});

