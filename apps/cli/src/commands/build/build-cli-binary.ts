#!/usr/bin/env npx tsx
/**
 * Build Ferni CLI Binary
 *
 * Creates a standalone macOS binary for the Ferni CLI using Node.js SEA
 * (Single Executable Applications).
 *
 * Usage:
 *   npx tsx scripts/build-cli-binary.ts          # Development build
 *   npx tsx scripts/build-cli-binary.ts --release # Release build (optimized)
 *
 * Output:
 *   dist/ferni - Standalone binary (~90MB, includes Node.js runtime)
 */

import { execSync } from 'child_process';
import { chmodSync, copyFileSync, existsSync, statSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`  ${colors.dim}→${colors.reset} ${msg}`),
};

function run(cmd: string, options: { cwd?: string; stdio?: 'inherit' | 'pipe' } = {}): string {
  log.step(cmd);
  try {
    const result = execSync(cmd, {
      cwd: options.cwd || PROJECT_ROOT,
      stdio: options.stdio || 'pipe',
      encoding: 'utf-8',
    });
    return result?.toString() || '';
  } catch (err) {
    const error = err as { stderr?: Buffer; stdout?: Buffer; message: string };
    if (error.stderr) {
      console.error(error.stderr.toString());
    }
    throw new Error(`Command failed: ${cmd}\n${error.message}`);
  }
}

function checkPrerequisites(): void {
  log.info('Checking prerequisites...');

  // Check Node.js version (need 20+ for SEA)
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (majorVersion < 20) {
    throw new Error(`Node.js 20+ required for SEA. Current: ${nodeVersion}`);
  }
  log.success(`Node.js ${nodeVersion}`);

  // Check for postject
  try {
    run('npx postject --help', { stdio: 'pipe' });
    log.success('postject available');
  } catch {
    log.warn('Installing postject...');
    run('npm install -D postject');
  }

  // Check for esbuild
  try {
    run('npx esbuild --version', { stdio: 'pipe' });
    log.success('esbuild available');
  } catch {
    throw new Error('esbuild not found. Run: npm install');
  }
}

function bundleCli(isRelease: boolean): void {
  log.info('Bundling CLI with esbuild...');

  const outfile = join(PROJECT_ROOT, 'dist', 'cli-bundle.js');
  const entryPoint = join(PROJECT_ROOT, 'scripts', 'ferni.ts');

  // Ensure dist directory exists
  if (!existsSync(join(PROJECT_ROOT, 'dist'))) {
    run('mkdir -p dist');
  }

  const minify = isRelease ? '--minify' : '';
  const sourcemap = isRelease ? '' : '--sourcemap';

  // Bundle to CJS with import.meta polyfill for SEA compatibility
  // We define import.meta.url as a special marker that the code can detect
  const shimUrl = 'file:///ferni-sea-binary/scripts/ferni.ts';
  run(
    `npx esbuild "${entryPoint}" --bundle --platform=node --target=node20 ` +
      `--outfile="${outfile}" --format=cjs ${minify} ${sourcemap} ` +
      `--external:@livekit/* --external:@sentry/* --external:pg-native ` +
      `--external:@google/* --external:../src/* ` +
      `--define:import.meta.url='"${shimUrl}"'`,
    { stdio: 'inherit' }
  );

  log.success(`Bundled to ${outfile}`);
}

function generateSeaBlob(): void {
  log.info('Generating SEA blob...');

  const configPath = join(PROJECT_ROOT, 'sea-config.json');
  if (!existsSync(configPath)) {
    throw new Error('sea-config.json not found');
  }

  run(`node --experimental-sea-config "${configPath}"`, { stdio: 'inherit' });

  const blobPath = join(PROJECT_ROOT, 'dist', 'sea-prep.blob');
  if (!existsSync(blobPath)) {
    throw new Error('SEA blob generation failed');
  }

  log.success('Generated SEA blob');
}

function createBinary(): void {
  log.info('Creating binary...');

  const nodePath = process.execPath;
  const binaryPath = join(PROJECT_ROOT, 'dist', 'ferni');
  const blobPath = join(PROJECT_ROOT, 'dist', 'sea-prep.blob');

  // Remove existing binary if present
  if (existsSync(binaryPath)) {
    unlinkSync(binaryPath);
  }

  // Copy Node.js binary
  log.step(`Copying Node.js from ${nodePath}`);
  copyFileSync(nodePath, binaryPath);

  // Make executable
  chmodSync(binaryPath, 0o755);

  // Inject SEA blob using postject
  log.step('Injecting SEA blob...');
  run(
    `npx postject "${binaryPath}" NODE_SEA_BLOB "${blobPath}" ` +
      `--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ` +
      `--macho-segment-name NODE_SEA`,
    { stdio: 'inherit' }
  );

  log.success('Injected SEA blob');
}

function signBinary(): void {
  log.info('Code-signing binary (required for macOS)...');

  const binaryPath = join(PROJECT_ROOT, 'dist', 'ferni');

  // Ad-hoc signing (no Apple Developer certificate required)
  run(`codesign --sign - --force --deep "${binaryPath}"`, { stdio: 'inherit' });

  log.success('Binary signed');
}

function printStats(): void {
  const binaryPath = join(PROJECT_ROOT, 'dist', 'ferni');
  const stats = statSync(binaryPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

  console.log('');
  console.log(`${colors.bold}${colors.green}Build complete!${colors.reset}`);
  console.log('');
  console.log(`  Binary: ${colors.cyan}dist/ferni${colors.reset}`);
  console.log(`  Size:   ${sizeMB} MB`);
  console.log('');
  console.log(`${colors.dim}Test with:${colors.reset}`);
  console.log(`  ./dist/ferni --help`);
  console.log(`  ./dist/ferni status`);
  console.log('');
  console.log(`${colors.dim}Install globally:${colors.reset}`);
  console.log(`  sudo cp dist/ferni /usr/local/bin/`);
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isRelease = args.includes('--release');

  console.log('');
  console.log(`${colors.bold}Building Ferni CLI Binary${colors.reset}`);
  console.log(`${colors.dim}Mode: ${isRelease ? 'Release' : 'Development'}${colors.reset}`);
  console.log('');

  try {
    checkPrerequisites();
    bundleCli(isRelease);
    generateSeaBlob();
    createBinary();
    signBinary();
    printStats();
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }
}

main();
