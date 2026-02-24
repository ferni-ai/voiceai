#!/usr/bin/env npx tsx
/**
 * Build Ferni CLI Binary
 *
 * Creates standalone CLI binaries for local and container use.
 *
 * Modes:
 *   --local     Build macOS SEA binary (default on macOS)
 *   --container Build bundled JS + shell wrapper (for Docker)
 *   --release   Enable minification
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/build/build-cli-binary.ts              # Auto-detect
 *   npx tsx apps/cli/src/commands/build/build-cli-binary.ts --container  # For Docker
 *   npx tsx apps/cli/src/commands/build/build-cli-binary.ts --release    # Production
 *
 * Output:
 *   --local:     dist/ferni          (standalone binary, ~90MB)
 *   --container: dist/ferni-bundle/  (bundled JS + wrapper, ~2MB)
 */

import { execSync } from 'child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

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
      `--external:@google/* --external:../src/* --external:onnxruntime-node --external:@xenova/transformers --external:sharp ` +
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

function printStats(mode: 'local' | 'container'): void {
  if (mode === 'local') {
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
  } else {
    const bundlePath = join(PROJECT_ROOT, 'dist', 'ferni-bundle', 'ferni.js');
    const stats = statSync(bundlePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

    console.log('');
    console.log(`${colors.bold}${colors.green}Container build complete!${colors.reset}`);
    console.log('');
    console.log(`  Bundle: ${colors.cyan}dist/ferni-bundle/${colors.reset}`);
    console.log(`  Size:   ${sizeMB} MB`);
    console.log('');
    console.log(`${colors.dim}Files:${colors.reset}`);
    console.log(`  dist/ferni-bundle/ferni.js  (bundled CLI)`);
    console.log(`  dist/ferni-bundle/ferni     (shell wrapper)`);
    console.log('');
    console.log(`${colors.dim}In Docker:${colors.reset}`);
    console.log(`  COPY dist/ferni-bundle/ /usr/local/bin/ferni-bundle/`);
    console.log(`  RUN ln -s /usr/local/bin/ferni-bundle/ferni /usr/local/bin/ferni`);
    console.log('');
  }
}

// ============================================================================
// CONTAINER BUILD MODE
// ============================================================================

function buildContainerBundle(isRelease: boolean): void {
  log.info('Building container bundle...');

  const bundleDir = join(PROJECT_ROOT, 'dist', 'ferni-bundle');
  const outfile = join(bundleDir, 'ferni.js');
  const entryPoint = join(PROJECT_ROOT, 'apps', 'cli', 'src', 'index.ts');

  // Ensure bundle directory exists
  if (!existsSync(bundleDir)) {
    mkdirSync(bundleDir, { recursive: true });
  }

  const minify = isRelease ? '--minify' : '';

  // Bundle CLI to a single JS file
  // Mark import.meta.url as container mode so CLI knows its context
  const shimUrl = 'file:///ferni-container/apps/cli/src/index.ts';

  log.step('Bundling with esbuild...');
  // Banner provides a CJS require() shim for Node.js built-ins (fs, path, etc.)
  // that CJS dependencies (e.g. dotenv) need when bundled into ESM format
  const banner = `import { createRequire } from "module"; const require = createRequire(import.meta.url);`;
  run(
    `npx esbuild "${entryPoint}" --bundle --platform=node --target=node20 ` +
      `--outfile="${outfile}" --format=esm ${minify} ` +
      `--banner:js='${banner}' ` +
      `--external:@livekit/* --external:@sentry/* --external:pg-native ` +
      `--external:@google/* --external:onnxruntime-node --external:@xenova/transformers --external:sharp ` +
      `--define:import.meta.url='"${shimUrl}"'`,
    { stdio: 'inherit' }
  );

  log.success(`Bundled to ${outfile}`);

  // Create shell wrapper script
  const wrapperPath = join(bundleDir, 'ferni');
  const wrapperContent = `#!/bin/sh
# Ferni CLI - Container wrapper
# Runs the bundled CLI with node

SCRIPT_DIR="$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")"
exec node "\${SCRIPT_DIR}/ferni.js" "$@"
`;

  writeFileSync(wrapperPath, wrapperContent);
  chmodSync(wrapperPath, 0o755);
  log.success('Created shell wrapper');
}

// ============================================================================
// MAIN
// ============================================================================

type BuildMode = 'local' | 'container';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isRelease = args.includes('--release');
  const forceContainer = args.includes('--container');
  const forceLocal = args.includes('--local');

  // Auto-detect mode if not specified
  // In Docker (Linux), default to container mode
  // On macOS, default to local (SEA binary)
  let mode: BuildMode;
  if (forceContainer) {
    mode = 'container';
  } else if (forceLocal) {
    mode = 'local';
  } else {
    mode = platform() === 'darwin' ? 'local' : 'container';
  }

  console.log('');
  console.log(`${colors.bold}Building Ferni CLI${colors.reset}`);
  console.log(`${colors.dim}Mode: ${mode} (${isRelease ? 'Release' : 'Development'})${colors.reset}`);
  console.log('');

  try {
    if (mode === 'container') {
      // Container mode: Just bundle JS + shell wrapper
      buildContainerBundle(isRelease);
    } else {
      // Local mode: Full SEA binary (macOS only)
      checkPrerequisites();
      bundleCli(isRelease);
      generateSeaBlob();
      createBinary();
      signBinary();
    }
    printStats(mode);
  } catch (err) {
    log.error((err as Error).message);
    process.exit(1);
  }
}

main();
