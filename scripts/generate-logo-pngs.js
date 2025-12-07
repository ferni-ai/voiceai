#!/usr/bin/env node
/**
 * Generate all PNG versions of Ferni logos from SVG sources
 * 
 * Usage: node scripts/generate-logo-pngs.js
 * 
 * Requires: npm install sharp
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Logo variants with their SVG sources
const LOGO_VARIANTS = {
  'ferni-logo': join(ROOT, 'brand/logos/ferni-logo.svg'),
  'ferni-logo-simple': join(ROOT, 'brand/logos/ferni-logo-simple.svg'),
  'ferni-logo-dark': join(ROOT, 'brand/logos/ferni-logo-dark.svg'),
};

// Sizes to generate for design-system logos
const DESIGN_SYSTEM_SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 300, 512, 1024];

// iOS app icon sizes
const IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

// Android app icon sizes
const ANDROID_SIZES = [36, 48, 72, 96, 144, 192, 512];

// Favicon sizes
const FAVICON_SIZES = [16, 32, 48, 96, 144, 192, 256, 512];

async function generatePNG(svgPath, outputPath, size) {
  try {
    const svg = readFileSync(svgPath);
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`  ✓ ${outputPath} (${size}x${size})`);
  } catch (err) {
    console.error(`  ✗ Failed: ${outputPath} - ${err.message}`);
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function generateDesignSystemLogos() {
  console.log('\n📦 Generating Design System Logos...');
  const outputDir = join(ROOT, 'design-system/assets/logos');
  ensureDir(outputDir);

  for (const [name, svgPath] of Object.entries(LOGO_VARIANTS)) {
    console.log(`\n  ${name}:`);
    for (const size of DESIGN_SYSTEM_SIZES) {
      const outputPath = join(outputDir, `${name}-${size}.png`);
      await generatePNG(svgPath, outputPath, size);
    }
  }
}

async function generateBrandLogos() {
  console.log('\n🎨 Generating Brand Logos...');
  const outputDir = join(ROOT, 'brand/logos');
  ensureDir(outputDir);

  const brandSizes = [300, 512, 1024];
  
  for (const [name, svgPath] of Object.entries(LOGO_VARIANTS)) {
    console.log(`\n  ${name}:`);
    for (const size of brandSizes) {
      const outputPath = join(outputDir, `${name}-${size}.png`);
      await generatePNG(svgPath, outputPath, size);
    }
  }
}

async function generateFavicons() {
  console.log('\n⭐ Generating Favicons...');
  
  const svgPath = LOGO_VARIANTS['ferni-logo'];
  
  // Frontend favicons
  const frontendIconsDir = join(ROOT, 'frontend-typescript/public/icons');
  ensureDir(frontendIconsDir);
  
  await generatePNG(svgPath, join(frontendIconsDir, 'favicon-16x16.png'), 16);
  await generatePNG(svgPath, join(frontendIconsDir, 'favicon-32x32.png'), 32);
  
  // Marketing favicon
  const marketingDir = join(ROOT, 'apps/marketing/assets/web');
  ensureDir(marketingDir);
  await generatePNG(svgPath, join(marketingDir, 'favicon-512.png'), 512);
  
  // Design system favicons
  const faviconDir = join(ROOT, 'design-system/assets/favicons');
  ensureDir(faviconDir);
  
  for (const size of FAVICON_SIZES) {
    await generatePNG(svgPath, join(faviconDir, `favicon-${size}.png`), size);
  }
}

async function generateAppIcons() {
  console.log('\n📱 Generating App Icons...');
  
  const svgPath = LOGO_VARIANTS['ferni-logo'];
  const outputDir = join(ROOT, 'brand/icons/png');
  ensureDir(outputDir);
  
  // iOS icons
  console.log('\n  iOS:');
  for (const size of IOS_SIZES) {
    await generatePNG(svgPath, join(outputDir, `ios-${size}.png`), size);
  }
  
  // Android icons
  console.log('\n  Android:');
  for (const size of ANDROID_SIZES) {
    await generatePNG(svgPath, join(outputDir, `android-${size}.png`), size);
  }
}

async function generateCapacitorIcons() {
  console.log('\n📲 Generating Capacitor App Icons...');
  
  const svgPath = LOGO_VARIANTS['ferni-logo'];
  
  // iOS Capacitor icons
  const iosIconDir = join(ROOT, 'apps/ios/ios/App/App/Assets.xcassets/AppIcon.appiconset');
  if (existsSync(dirname(iosIconDir))) {
    ensureDir(iosIconDir);
    console.log('\n  iOS Capacitor:');
    for (const size of IOS_SIZES) {
      await generatePNG(svgPath, join(iosIconDir, `AppIcon-${size}.png`), size);
    }
  }
  
  // Android Capacitor icons
  const androidResDir = join(ROOT, 'apps/android/android/app/src/main/res');
  if (existsSync(androidResDir)) {
    console.log('\n  Android Capacitor:');
    const androidDirs = {
      'mipmap-ldpi': 36,
      'mipmap-mdpi': 48,
      'mipmap-hdpi': 72,
      'mipmap-xhdpi': 96,
      'mipmap-xxhdpi': 144,
      'mipmap-xxxhdpi': 192,
    };
    
    for (const [dir, size] of Object.entries(androidDirs)) {
      const iconDir = join(androidResDir, dir);
      ensureDir(iconDir);
      await generatePNG(svgPath, join(iconDir, 'ic_launcher.png'), size);
      await generatePNG(svgPath, join(iconDir, 'ic_launcher_round.png'), size);
      await generatePNG(svgPath, join(iconDir, 'ic_launcher_foreground.png'), size);
    }
  }
}

async function main() {
  console.log('🪨 Ferni Logo PNG Generator');
  console.log('===========================');
  console.log('Generating PNGs from new Three Stones design...\n');
  
  try {
    await generateDesignSystemLogos();
    await generateBrandLogos();
    await generateFavicons();
    await generateAppIcons();
    await generateCapacitorIcons();
    
    console.log('\n✅ All PNGs generated successfully!');
    console.log('\nRemember to:');
    console.log('  1. Commit the new PNG files');
    console.log('  2. Rebuild iOS/Android apps to pick up new icons');
    console.log('  3. Clear browser cache to see new favicons');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();

