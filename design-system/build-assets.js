#!/usr/bin/env node
/**
 * Design System Asset Builder
 *
 * Generates PNG sizes from SVG masters and copies assets to frontend.
 * This script is the single source of truth for all brand assets.
 *
 * Usage:
 *   node design-system/build-assets.js
 *   npm run build:assets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Source directories (design-system/)
  sourceAssets: path.join(__dirname, 'assets'),
  sourceDist: path.join(__dirname, 'dist'),

  // Target directory (frontend-typescript/public/design-system/)
  targetDir: path.join(PROJECT_ROOT, 'frontend-typescript/public/design-system'),

  // Logo PNG sizes to generate
  logoSizes: [16, 32, 48, 64, 96, 128, 180, 192, 256, 300, 512, 1024],

  // Favicon PNG sizes to generate
  faviconSizes: [16, 32, 48, 96, 144, 192, 256, 512],

  // App icon PNG sizes to generate (for iOS/Android)
  iconSizes: [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 512, 1024],
};

// ============================================================================
// UTILITIES
// ============================================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}


// ============================================================================
// PNG GENERATION FROM SVG
// ============================================================================

/**
 * Logo variants to generate PNGs for
 */
const LOGO_VARIANTS = [
  { name: 'ferni-logo', svg: 'ferni-logo.svg' },
  { name: 'ferni-logo-dark', svg: 'ferni-logo-dark.svg' },
  { name: 'ferni-logo-simple', svg: 'ferni-logo-simple.svg' },
];

/**
 * Favicon to generate PNGs for
 */
const FAVICON_SVG = 'favicon-32.svg';

/**
 * App icon to generate PNGs for
 */
const APP_ICON_SVG = 'app-icon-1024.svg';

let sharpModule = null;
let sharpChecked = false;

/**
 * Load Sharp module (lazy loading)
 */
async function getSharp() {
  if (sharpChecked) return sharpModule;
  sharpChecked = true;

  try {
    sharpModule = (await import('sharp')).default;
    return sharpModule;
  } catch {
    console.log('  ℹ️  Sharp not installed - PNG generation will be skipped');
    console.log('     Install with: npm install sharp');
    return null;
  }
}

/**
 * Generate PNG from SVG at a specific size
 */
async function generatePngFromSvg(sharp, svgPath, pngPath, size) {
  try {
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(pngPath);
    return true;
  } catch (error) {
    console.log(`  ⚠️  Failed: ${path.basename(pngPath)} - ${error.message}`);
    return false;
  }
}

/**
 * Generate all PNG sizes for logos
 */
async function generateLogoPngs() {
  const sharp = await getSharp();
  if (!sharp) return;

  console.log('🖼️  Generating logo PNGs from SVG...');

  const logosDir = path.join(CONFIG.sourceAssets, 'logos');
  let generated = 0;

  for (const variant of LOGO_VARIANTS) {
    const svgPath = path.join(logosDir, variant.svg);
    if (!fs.existsSync(svgPath)) {
      console.log(`  ⚠️  SVG not found: ${variant.svg}`);
      continue;
    }

    for (const size of CONFIG.logoSizes) {
      const pngName = `${variant.name}-${size}.png`;
      const pngPath = path.join(logosDir, pngName);

      // Skip if PNG already exists and is newer than SVG
      if (fs.existsSync(pngPath)) {
        const svgStat = fs.statSync(svgPath);
        const pngStat = fs.statSync(pngPath);
        if (pngStat.mtime > svgStat.mtime) continue;
      }

      if (await generatePngFromSvg(sharp, svgPath, pngPath, size)) {
        generated++;
      }
    }
  }

  if (generated > 0) {
    console.log(`  ✅ Generated ${generated} logo PNGs`);
  } else {
    console.log(`  ✅ Logo PNGs up to date`);
  }
}

/**
 * Generate all PNG sizes for favicons
 */
async function generateFaviconPngs() {
  const sharp = await getSharp();
  if (!sharp) return;

  console.log('🖼️  Generating favicon PNGs from SVG...');

  const faviconsDir = path.join(CONFIG.sourceAssets, 'favicons');
  const svgPath = path.join(faviconsDir, FAVICON_SVG);

  if (!fs.existsSync(svgPath)) {
    console.log(`  ⚠️  SVG not found: ${FAVICON_SVG}`);
    return;
  }

  let generated = 0;

  for (const size of CONFIG.faviconSizes) {
    const pngName = `favicon-${size}.png`;
    const pngPath = path.join(faviconsDir, pngName);

    // Skip if PNG already exists and is newer than SVG
    if (fs.existsSync(pngPath)) {
      const svgStat = fs.statSync(svgPath);
      const pngStat = fs.statSync(pngPath);
      if (pngStat.mtime > svgStat.mtime) continue;
    }

    if (await generatePngFromSvg(sharp, svgPath, pngPath, size)) {
      generated++;
    }
  }

  if (generated > 0) {
    console.log(`  ✅ Generated ${generated} favicon PNGs`);
  } else {
    console.log(`  ✅ Favicon PNGs up to date`);
  }
}

/**
 * Generate all PNG sizes for app icons (iOS/Android)
 */
async function generateAppIconPngs() {
  const sharp = await getSharp();
  if (!sharp) return;

  console.log('🖼️  Generating app icon PNGs from SVG...');

  const iconsDir = path.join(CONFIG.sourceAssets, 'icons');
  const svgPath = path.join(iconsDir, APP_ICON_SVG);

  if (!fs.existsSync(svgPath)) {
    console.log(`  ⚠️  SVG not found: ${APP_ICON_SVG}`);
    return;
  }

  let generated = 0;

  for (const size of CONFIG.iconSizes) {
    const pngName = `app-icon-${size}.png`;
    const pngPath = path.join(iconsDir, pngName);

    // Skip if PNG already exists and is newer than SVG
    if (fs.existsSync(pngPath)) {
      const svgStat = fs.statSync(svgPath);
      const pngStat = fs.statSync(pngPath);
      if (pngStat.mtime > svgStat.mtime) continue;
    }

    if (await generatePngFromSvg(sharp, svgPath, pngPath, size)) {
      generated++;
    }
  }

  if (generated > 0) {
    console.log(`  ✅ Generated ${generated} app icon PNGs`);
  } else {
    console.log(`  ✅ App icon PNGs up to date`);
  }
}

// ============================================================================
// ASSET COPY FUNCTIONS
// ============================================================================

function copyTokens() {
  console.log('📄 Copying design tokens...');

  const files = ['tokens.css', 'tokens.ts', 'components.css', 'app-components.css'];
  let copied = 0;

  for (const file of files) {
    const src = path.join(CONFIG.sourceDist, file);
    const dest = path.join(CONFIG.targetDir, file);
    if (fs.existsSync(src)) {
      copyFile(src, dest);
      copied++;
    }
  }

  console.log(`  ✅ Copied ${copied} token files`);
}

function copyAssets() {
  console.log('🎨 Copying assets...');

  // Copy logos (SVGs + existing PNGs)
  const logosDir = path.join(CONFIG.sourceAssets, 'logos');
  const targetLogosDir = path.join(CONFIG.targetDir, 'assets/logos');
  if (fs.existsSync(logosDir)) {
    copyDir(logosDir, targetLogosDir);
    const count = fs.readdirSync(logosDir).length;
    console.log(`  ✅ Copied ${count} logo files`);
  }

  // Copy icons (SVGs + existing PNGs)
  const iconsDir = path.join(CONFIG.sourceAssets, 'icons');
  const targetIconsDir = path.join(CONFIG.targetDir, 'assets/icons');
  if (fs.existsSync(iconsDir)) {
    copyDir(iconsDir, targetIconsDir);
    const count = fs.readdirSync(iconsDir).length;
    console.log(`  ✅ Copied ${count} icon files`);
  }

  // Copy favicons
  const faviconsDir = path.join(CONFIG.sourceAssets, 'favicons');
  const targetFaviconsDir = path.join(CONFIG.targetDir, 'assets/favicons');
  if (fs.existsSync(faviconsDir)) {
    copyDir(faviconsDir, targetFaviconsDir);
    const count = fs.readdirSync(faviconsDir).length;
    console.log(`  ✅ Copied ${count} favicon files`);
  }

  // Copy sounds
  const soundsDir = path.join(CONFIG.sourceAssets, 'sounds');
  const targetSoundsDir = path.join(CONFIG.targetDir, 'sounds');
  if (fs.existsSync(soundsDir)) {
    copyDir(soundsDir, targetSoundsDir);
    const count = fs.readdirSync(soundsDir).length;
    console.log(`  ✅ Copied ${count} sound files`);
  }
}

function copyBrandDocs() {
  console.log('📚 Copying brand documentation...');

  const brandDir = path.join(__dirname, 'brand');
  const targetBrandDir = path.join(CONFIG.targetDir, 'brand');

  if (fs.existsSync(brandDir)) {
    copyDir(brandDir, targetBrandDir);
    const count = fs.readdirSync(brandDir).length;
    console.log(`  ✅ Copied ${count} brand documentation files`);
  }
}

// ============================================================================
// COMPATIBILITY COPY - Keep legacy locations working
// ============================================================================

function copyToLegacyLocations() {
  console.log('🔗 Copying to legacy locations for compatibility...');

  // Copy key files to root of public/ for existing imports
  const publicDir = path.join(PROJECT_ROOT, 'frontend-typescript/public');

  // favicon.svg at root
  const faviconSrc = path.join(CONFIG.sourceAssets, 'favicons/favicon-32.svg');
  if (fs.existsSync(faviconSrc)) {
    copyFile(faviconSrc, path.join(publicDir, 'favicon.svg'));
  }

  // logo.svg at root
  const logoSrc = path.join(CONFIG.sourceAssets, 'logos/ferni-logo.svg');
  if (fs.existsSync(logoSrc)) {
    copyFile(logoSrc, path.join(publicDir, 'logo.svg'));
  }

  // apple-touch-icon
  const appleTouchSrc = path.join(CONFIG.sourceAssets, 'favicons/favicon-192.svg');
  if (fs.existsSync(appleTouchSrc)) {
    copyFile(appleTouchSrc, path.join(publicDir, 'apple-touch-icon.svg'));
  }

  // Copy sounds to legacy location
  const soundsSrc = path.join(CONFIG.sourceAssets, 'sounds');
  const soundsDest = path.join(publicDir, 'sounds');
  if (fs.existsSync(soundsSrc)) {
    copyDir(soundsSrc, soundsDest);
  }

  // Copy existing icons directory structure (for manifest.json compatibility)
  const iconsSrc = path.join(CONFIG.sourceAssets, 'icons');
  const iconsDest = path.join(publicDir, 'icons');
  if (fs.existsSync(iconsSrc)) {
    // Copy SVGs to icons dir
    ensureDir(iconsDest);
    const iconFiles = fs.readdirSync(iconsSrc).filter(f => f.endsWith('.svg'));
    for (const file of iconFiles) {
      copyFile(path.join(iconsSrc, file), path.join(iconsDest, file));
    }
  }

  // Copy favicons for PWA manifest compatibility
  const faviconsSrc = path.join(CONFIG.sourceAssets, 'favicons');
  if (fs.existsSync(faviconsSrc)) {
    const pngFiles = fs.readdirSync(faviconsSrc).filter(f => f.endsWith('.png'));
    for (const file of pngFiles) {
      // Copy to icons/ with appropriate naming for manifest
      const size = file.match(/\d+/)?.[0];
      if (size) {
        copyFile(
          path.join(faviconsSrc, file),
          path.join(iconsDest, `android-chrome-${size}x${size}.png`)
        );
      }
    }
  }

  console.log('  ✅ Legacy locations updated');
}

// ============================================================================
// ASSET MANIFEST GENERATION
// ============================================================================

function generateManifest() {
  console.log('📋 Generating asset manifest...');

  const manifest = {
    generated: new Date().toISOString(),
    tokens: {
      css: 'tokens.css',
      ts: 'tokens.ts',
    },
    assets: {
      logos: [],
      icons: [],
      favicons: [],
      sounds: [],
    },
    brand: [],
  };

  // Scan logos
  const logosDir = path.join(CONFIG.targetDir, 'assets/logos');
  if (fs.existsSync(logosDir)) {
    manifest.assets.logos = fs.readdirSync(logosDir);
  }

  // Scan icons
  const iconsDir = path.join(CONFIG.targetDir, 'assets/icons');
  if (fs.existsSync(iconsDir)) {
    manifest.assets.icons = fs.readdirSync(iconsDir);
  }

  // Scan favicons
  const faviconsDir = path.join(CONFIG.targetDir, 'assets/favicons');
  if (fs.existsSync(faviconsDir)) {
    manifest.assets.favicons = fs.readdirSync(faviconsDir);
  }

  // Scan sounds
  const soundsDir = path.join(CONFIG.targetDir, 'sounds');
  if (fs.existsSync(soundsDir)) {
    manifest.assets.sounds = fs.readdirSync(soundsDir);
  }

  // Scan brand docs
  const brandDir = path.join(CONFIG.targetDir, 'brand');
  if (fs.existsSync(brandDir)) {
    manifest.brand = fs.readdirSync(brandDir);
  }

  // Write manifest
  fs.writeFileSync(
    path.join(CONFIG.targetDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('  ✅ Generated manifest.json');
}

// ============================================================================
// MAIN BUILD
// ============================================================================

async function build() {
  console.log('');
  console.log('🎨 Building Design System Assets');
  console.log('================================');
  console.log('');

  // Ensure target directory exists
  ensureDir(CONFIG.targetDir);

  // Generate PNGs from SVGs (if Sharp is available)
  await generateLogoPngs();
  await generateFaviconPngs();
  await generateAppIconPngs();

  // Copy all assets (including newly generated PNGs)
  copyTokens();
  copyAssets();
  copyBrandDocs();
  copyToLegacyLocations();
  generateManifest();

  console.log('');
  console.log('✅ Asset build complete!');
  console.log('');
  console.log('Output directory:', CONFIG.targetDir);
  console.log('');
}

// Run build
build().catch(console.error);

