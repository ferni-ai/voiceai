#!/usr/bin/env npx tsx
/**
 * Unified Build CLI
 *
 * Single entry point for all build tasks.
 * Replaces: build-apps.sh, generate-store-assets.sh
 *
 * Usage:
 *   npx tsx scripts/build.ts                 # Show help
 *   npx tsx scripts/build.ts frontend        # Build frontend
 *   npx tsx scripts/build.ts electron        # Build Electron app
 *   npx tsx scripts/build.ts ios             # Build iOS app
 *   npx tsx scripts/build.ts android         # Build Android app
 *   npx tsx scripts/build.ts apps            # Build all native apps
 *   npx tsx scripts/build.ts store-assets    # Generate store marketing assets
 *   npx tsx scripts/build.ts sync            # Sync web assets to all platforms
 *
 * Or via npm:
 *   npm run build:apps
 *   npm run build:electron
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// ============================================================================
// COLORS & LOGGING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// UTILITIES
// ============================================================================

function exec(cmd: string, options: { cwd?: string; silent?: boolean } = {}): string {
  try {
    return execSync(cmd, {
      cwd: options.cwd || PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (!options.silent) throw error;
    return '';
  }
}

function checkCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function cleanDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

// ============================================================================
// BUILD FUNCTIONS
// ============================================================================

interface BuildOptions {
  verbose: boolean;
  skipFrontend: boolean;
}

async function buildFrontend(options: BuildOptions): Promise<boolean> {
  log.step('BUILDING FRONTEND');

  const frontendDir = join(PROJECT_ROOT, 'apps/web');

  if (!existsSync(frontendDir)) {
    log.error('Frontend directory not found');
    return false;
  }

  log.info('Building frontend...');
  exec('npm run build', { cwd: frontendDir });
  log.success('Frontend built');

  return true;
}

async function buildElectron(options: BuildOptions): Promise<boolean> {
  log.step('BUILDING ELECTRON APP');

  const electronDir = join(PROJECT_ROOT, 'apps/electron');
  const frontendDist = join(PROJECT_ROOT, 'apps/web/dist');

  if (!existsSync(electronDir)) {
    log.error('Electron directory not found: apps/electron');
    return false;
  }

  // Build frontend first if not skipped
  if (!options.skipFrontend) {
    await buildFrontend(options);
  }

  // Copy frontend to Electron web folder
  log.info('Copying frontend to Electron...');
  const webDir = join(electronDir, 'web');
  cleanDir(webDir);
  copyDir(frontendDist, webDir);

  // Install dependencies if needed
  if (!existsSync(join(electronDir, 'node_modules'))) {
    log.info('Installing Electron dependencies...');
    exec('npm install', { cwd: electronDir });
  }

  // Build for current platform
  const platform = process.platform;
  let buildCmd = 'npm run build';

  if (platform === 'darwin') {
    log.info('Building for macOS...');
    buildCmd = 'npm run build:mac';
  } else if (platform === 'win32') {
    log.info('Building for Windows...');
    buildCmd = 'npm run build:win';
  } else if (platform === 'linux') {
    log.info('Building for Linux...');
    buildCmd = 'npm run build:linux';
  }

  exec(buildCmd, { cwd: electronDir });
  log.success(`Electron build complete! Output: apps/electron/dist/`);

  return true;
}

async function buildIos(options: BuildOptions): Promise<boolean> {
  log.step('BUILDING iOS APP');

  if (process.platform !== 'darwin') {
    log.warn('iOS builds require macOS. Skipping...');
    return true;
  }

  if (!checkCommand('xcodebuild')) {
    log.warn('Xcode not found. Install Xcode to build iOS app.');
    return false;
  }

  const iosDir = join(PROJECT_ROOT, 'apps/ios');
  const frontendDist = join(PROJECT_ROOT, 'apps/web/dist');

  if (!existsSync(iosDir)) {
    log.error('iOS directory not found: apps/ios');
    return false;
  }

  // Build frontend first if not skipped
  if (!options.skipFrontend) {
    await buildFrontend(options);
  }

  // Install dependencies if needed
  if (!existsSync(join(iosDir, 'node_modules'))) {
    log.info('Installing Capacitor dependencies...');
    exec('npm install', { cwd: iosDir });
  }

  // Copy web assets
  log.info('Copying web assets to iOS project...');
  const publicDir = join(iosDir, 'ios/App/App/public');
  cleanDir(publicDir);
  copyDir(frontendDist, publicDir);

  log.success('iOS project synced!');
  console.log(`
Next steps:
  Open in Xcode: cd apps/ios && npx cap open ios
  Run on simulator: cd apps/ios && npx cap run ios
`);

  return true;
}

async function buildAndroid(options: BuildOptions): Promise<boolean> {
  log.step('BUILDING ANDROID APP');

  const androidDir = join(PROJECT_ROOT, 'apps/android');
  const frontendDist = join(PROJECT_ROOT, 'apps/web/dist');

  if (!existsSync(androidDir)) {
    log.error('Android directory not found: apps/android');
    return false;
  }

  // Build frontend first if not skipped
  if (!options.skipFrontend) {
    await buildFrontend(options);
  }

  // Install dependencies if needed
  if (!existsSync(join(androidDir, 'node_modules'))) {
    log.info('Installing Capacitor dependencies...');
    exec('npm install', { cwd: androidDir });
  }

  // Add Android platform if not exists
  if (!existsSync(join(androidDir, 'android'))) {
    log.info('Adding Android platform...');
    exec('npx cap add android', { cwd: androidDir });
  }

  // Sync web assets
  log.info('Syncing web assets to Android project...');
  exec('npx cap sync android', { cwd: androidDir });

  log.success('Android project synced!');
  console.log(`
Next steps:
  Open in Android Studio: cd apps/android && npx cap open android
  Run on emulator: cd apps/android && npx cap run android
`);

  return true;
}

async function syncAll(options: BuildOptions): Promise<boolean> {
  log.step('SYNCING WEB ASSETS TO ALL PLATFORMS');

  const frontendDist = join(PROJECT_ROOT, 'apps/web/dist');

  if (!existsSync(frontendDist)) {
    log.warn('Frontend not built. Building first...');
    await buildFrontend(options);
  }

  // Electron
  log.info('Syncing to Electron...');
  const electronWeb = join(PROJECT_ROOT, 'apps/electron/web');
  if (existsSync(join(PROJECT_ROOT, 'apps/electron'))) {
    cleanDir(electronWeb);
    copyDir(frontendDist, electronWeb);
    log.success('Electron synced');
  }

  // iOS
  if (process.platform === 'darwin') {
    log.info('Syncing to iOS...');
    const iosPublic = join(PROJECT_ROOT, 'apps/ios/ios/App/App/public');
    if (existsSync(join(PROJECT_ROOT, 'apps/ios'))) {
      cleanDir(iosPublic);
      copyDir(frontendDist, iosPublic);
      log.success('iOS synced');
    }
  }

  // Android
  log.info('Syncing to Android...');
  const androidDir = join(PROJECT_ROOT, 'apps/android');
  if (existsSync(join(androidDir, 'android'))) {
    exec('npx cap sync android --no-build 2>/dev/null || npx cap copy android', { cwd: androidDir, silent: true });
    log.success('Android synced');
  }

  log.success('All platforms synced!');
  return true;
}

async function buildStoreAssets(options: BuildOptions): Promise<boolean> {
  log.step('GENERATING STORE MARKETING ASSETS');

  if (!checkCommand('convert')) {
    log.error('ImageMagick required. Install with: brew install imagemagick');
    return false;
  }

  const generatedDir = join(PROJECT_ROOT, 'apps/website/ferni-website/images/generated');
  const brandIcons = join(PROJECT_ROOT, 'brand/icons/png');
  const outputDir = join(PROJECT_ROOT, 'apps/marketing');
  const graphicsDir = join(outputDir, 'graphics');
  const socialDir = join(outputDir, 'social');

  mkdirSync(graphicsDir, { recursive: true });
  mkdirSync(socialDir, { recursive: true });

  // Feature Graphic (Google Play - 1024x500)
  log.info('Creating Google Play Feature Graphic...');
  const heroSource = join(generatedDir, 'hero/hero-meadow.jpg');
  if (existsSync(heroSource)) {
    exec(`convert "${heroSource}" -resize 1024x500^ -gravity center -extent 1024x500 -quality 95 "${join(graphicsDir, 'feature-graphic-1024x500.jpg')}"`, { silent: true });
    log.success('feature-graphic-1024x500.jpg');
  } else {
    log.warn('Hero source not found, skipping feature graphic');
  }

  // Social Media Images
  log.info('Creating Social Media Assets...');
  const ogSource = join(generatedDir, 'social/og-image.jpg');
  if (existsSync(ogSource)) {
    exec(`convert "${ogSource}" -resize 1200x628^ -gravity center -extent 1200x628 -quality 90 "${join(socialDir, 'twitter-card-1200x628.jpg')}"`, { silent: true });
    exec(`convert "${ogSource}" -resize 1200x630^ -gravity center -extent 1200x630 -quality 90 "${join(socialDir, 'facebook-share-1200x630.jpg')}"`, { silent: true });
    exec(`convert "${ogSource}" -resize 1080x1080^ -gravity center -extent 1080x1080 -quality 90 "${join(socialDir, 'instagram-square-1080.jpg')}"`, { silent: true });
    log.success('Social media assets created');
  } else {
    log.warn('OG source not found, skipping social media assets');
  }

  // Windows Store Tiles
  log.info('Creating Windows Store Assets...');
  const iconSource = join(brandIcons, 'ios-1024.png');
  const windowsDir = join(graphicsDir, 'windows');
  mkdirSync(windowsDir, { recursive: true });
  
  if (existsSync(iconSource)) {
    exec(`convert "${iconSource}" -resize 300x300 "${join(windowsDir, 'store-logo-300.png')}"`, { silent: true });
    exec(`convert "${iconSource}" -resize 150x150 "${join(windowsDir, 'square-150.png')}"`, { silent: true });
    exec(`convert "${iconSource}" -resize 44x44 "${join(windowsDir, 'square-44.png')}"`, { silent: true });
    log.success('Windows store assets created');
  } else {
    log.warn('Icon source not found, skipping Windows assets');
  }

  // Press Kit
  log.info('Creating Press Kit...');
  const pressDir = join(graphicsDir, 'press-kit');
  mkdirSync(pressDir, { recursive: true });
  
  const pressFiles = [
    { src: join(brandIcons, 'ios-1024.png'), dest: join(pressDir, 'app-icon-1024.png') },
    { src: join(generatedDir, 'social/og-image.jpg'), dest: join(pressDir, 'og-image.jpg') },
    { src: join(PROJECT_ROOT, 'brand/logos/logo-primary.svg'), dest: join(pressDir, 'logo-primary.svg') },
  ];

  for (const { src, dest } of pressFiles) {
    if (existsSync(src)) {
      cpSync(src, dest);
    }
  }
  log.success('Press kit assembled');

  log.success('Store assets generated!');
  console.log(`
Output locations:
  Feature Graphic: ${graphicsDir}/feature-graphic-*.jpg
  Social Media: ${socialDir}/
  Windows Store: ${windowsDir}/
  Press Kit: ${pressDir}/
`);

  return true;
}

async function buildAll(options: BuildOptions): Promise<boolean> {
  log.step('BUILDING ALL NATIVE APPS');

  let success = true;

  success = await buildFrontend(options) && success;
  
  const skipFrontendOptions = { ...options, skipFrontend: true };
  success = await buildElectron(skipFrontendOptions) && success;
  success = await buildIos(skipFrontendOptions) && success;
  success = await buildAndroid(skipFrontendOptions) && success;

  return success;
}

// ============================================================================
// CLI
// ============================================================================

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}FERNI BUILD CLI${colors.reset}

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/build.ts <command> [options]
  npm run build:cli <command> [options]

${colors.bold}Commands:${colors.reset}
  ${colors.green}frontend${colors.reset}       Build frontend (Vite)
  ${colors.green}electron${colors.reset}       Build Electron desktop app
  ${colors.green}ios${colors.reset}            Build iOS app (macOS only)
  ${colors.green}android${colors.reset}        Build Android app
  ${colors.green}apps${colors.reset}           Build all native apps
  ${colors.green}sync${colors.reset}           Sync web assets to all platforms
  ${colors.green}store-assets${colors.reset}   Generate app store marketing assets

${colors.bold}Options:${colors.reset}
  --skip-frontend  Skip frontend build (use existing dist)
  --verbose        Show detailed output
  --help, -h       Show this help

${colors.bold}Examples:${colors.reset}
  npm run build:cli frontend       # Build frontend only
  npm run build:cli electron       # Build Electron app
  npm run build:cli apps           # Build all native apps
  npm run build:cli sync           # Sync to all platforms
  npm run build:cli store-assets   # Generate marketing assets
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse options
  const options: BuildOptions = {
    verbose: args.includes('--verbose'),
    skipFrontend: args.includes('--skip-frontend'),
  };

  // Get command
  const commands = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

  if (commands.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const command = commands[0];

  // Banner
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI BUILD${colors.reset}                                               ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  Command: ${colors.green}${command}${colors.reset}                                            ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  let success = true;

  switch (command) {
    case 'frontend':
      success = await buildFrontend(options);
      break;

    case 'electron':
      success = await buildElectron(options);
      break;

    case 'ios':
      success = await buildIos(options);
      break;

    case 'android':
      success = await buildAndroid(options);
      break;

    case 'apps':
    case 'all':
      success = await buildAll(options);
      break;

    case 'sync':
      success = await syncAll(options);
      break;

    case 'store-assets':
      success = await buildStoreAssets(options);
      break;

    default:
      log.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }

  if (success) {
    log.success('Build complete!');
  } else {
    log.error('Build failed');
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Build failed: ${error.message}`);
  process.exit(1);
});

