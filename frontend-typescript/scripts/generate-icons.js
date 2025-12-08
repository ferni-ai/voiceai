#!/usr/bin/env node
/**
 * Icon Generation Script
 * 
 * Generates all PWA icons from the master SVG design.
 * Uses sharp for high-quality PNG conversion.
 * 
 * Usage:
 *   npm run generate:icons
 *   node scripts/generate-icons.js
 * 
 * Requirements:
 *   npm install sharp --save-dev
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '../public/icons');
const PUBLIC_DIR = join(__dirname, '../public');

// ============================================================================
// SVG TEMPLATES - The new eye/circle design
// ============================================================================

/**
 * Generate the Ferni eye logo SVG at any size
 * @param {number} size - Icon size in pixels
 * @param {object} options - Customization options
 */
function generateEyeLogoSVG(size, options = {}) {
  const {
    background = '#F5F1E8',  // Paper cream
    stoneColor = '#4a6741',  // Sage green
    irisColor = '#5a8060',   // Light sage
    pupilColor = '#2c2520',  // Dark ink
    showCatchlight = size >= 48,
    rounded = true,
    cornerRadius = size >= 32 ? Math.round(size * 0.1875) : Math.round(size * 0.15),
    padding = 0.175, // 17.5% padding from edge
  } = options;

  const center = size / 2;
  const logoRadius = (size / 2) * (1 - padding * 2);
  
  // Proportions based on the zen design
  const stoneR = logoRadius;
  const whiteR = stoneR * 0.4;
  const irisR = whiteR * 0.667;
  const pupilR = irisR * 0.5;
  
  const catchlight = showCatchlight ? `
    <circle cx="${center - pupilR * 0.4}" cy="${center - pupilR * 0.4}" r="${pupilR * 0.3}" fill="white" opacity="0.9"/>
  ` : '';

  const bgShape = rounded 
    ? `<rect width="${size}" height="${size}" rx="${cornerRadius}" fill="${background}"/>`
    : `<rect width="${size}" height="${size}" fill="${background}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <!-- Ferni Eye Logo - ${size}x${size} -->
  ${bgShape}
  <g>
    <!-- Outer Stone: Body -->
    <circle cx="${center}" cy="${center}" r="${stoneR}" fill="${stoneColor}"/>
    <!-- White foundation -->
    <circle cx="${center}" cy="${center}" r="${whiteR}" fill="white"/>
    <!-- Iris ring -->
    <circle cx="${center}" cy="${center}" r="${irisR}" fill="${irisColor}"/>
    <!-- Pupil -->
    <circle cx="${center}" cy="${center}" r="${pupilR}" fill="${pupilColor}"/>
    ${catchlight}
  </g>
</svg>`;
}

/**
 * Generate maskable icon (more padding, fills safe zone)
 */
function generateMaskableSVG(size) {
  return generateEyeLogoSVG(size, {
    padding: 0.2, // 20% padding for maskable safe zone
    rounded: false,
  });
}

/**
 * Generate Safari pinned tab SVG (monochrome)
 */
function generateSafariPinnedSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <!-- Safari Pinned Tab - Monochrome -->
  <circle cx="8" cy="8" r="7" fill="black"/>
  <circle cx="8" cy="8" r="2.8" fill="white"/>
  <circle cx="8" cy="8" r="1.4" fill="black"/>
</svg>`;
}

/**
 * Generate OG image SVG (wide format with text)
 */
function generateOGImageSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <!-- Open Graph Image -->
  <rect width="1200" height="630" fill="#F5F1E8"/>
  
  <!-- Logo -->
  <g transform="translate(500, 215)">
    <circle cx="100" cy="100" r="100" fill="#4a6741"/>
    <circle cx="100" cy="100" r="40" fill="white"/>
    <circle cx="100" cy="100" r="26" fill="#5a8060"/>
    <circle cx="100" cy="100" r="13" fill="#2c2520"/>
    <circle cx="95" cy="95" r="4" fill="white" opacity="0.9"/>
  </g>
  
  <!-- Text -->
  <text x="600" y="480" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="700" fill="#2c2520" text-anchor="middle">Ferni</text>
  <text x="600" y="540" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="400" fill="#5a5550" text-anchor="middle">Your AI Life Coach</text>
</svg>`;
}

// ============================================================================
// FILE GENERATION
// ============================================================================

const SVG_FILES = [
  // Favicons (in public/)
  { path: 'favicon.svg', generator: () => generateEyeLogoSVG(32), dir: PUBLIC_DIR },
  { path: 'apple-touch-icon.svg', generator: () => generateEyeLogoSVG(180, { cornerRadius: 0 }), dir: PUBLIC_DIR },
  { path: 'logo-icon.svg', generator: () => generateEyeLogoSVG(64), dir: PUBLIC_DIR },
  { path: 'ferni-avatar.svg', generator: () => generateEyeLogoSVG(200, { rounded: false, background: 'transparent' }), dir: PUBLIC_DIR },
  
  // Favicons (in public/icons/)
  { path: 'favicon-16.svg', generator: () => generateEyeLogoSVG(16, { showCatchlight: false }), dir: ICONS_DIR },
  { path: 'favicon-32.svg', generator: () => generateEyeLogoSVG(32), dir: ICONS_DIR },
  
  // App icons
  { path: 'icon-base.svg', generator: () => generateEyeLogoSVG(512), dir: ICONS_DIR },
  { path: 'icon-1024.svg', generator: () => generateEyeLogoSVG(1024), dir: ICONS_DIR },
  { path: 'app-icon-1024.svg', generator: () => generateEyeLogoSVG(1024), dir: ICONS_DIR },
  { path: 'app-icon-zen.svg', generator: () => generateEyeLogoSVG(512), dir: ICONS_DIR },
  
  // Android icons
  { path: 'android-chrome-192.svg', generator: () => generateEyeLogoSVG(192), dir: ICONS_DIR },
  { path: 'android-chrome-512.svg', generator: () => generateEyeLogoSVG(512), dir: ICONS_DIR },
  { path: 'app-icon-android.svg', generator: () => generateEyeLogoSVG(512, { rounded: false }), dir: ICONS_DIR },
  { path: 'app-icon-android-background.svg', generator: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" fill="#F5F1E8"/></svg>`, dir: ICONS_DIR },
  
  // iOS icons
  { path: 'apple-touch-icon.svg', generator: () => generateEyeLogoSVG(180, { cornerRadius: 0 }), dir: ICONS_DIR },
  { path: 'app-icon-ios-simple.svg', generator: () => generateEyeLogoSVG(1024, { cornerRadius: 0 }), dir: ICONS_DIR },
  
  // Maskable icons (for PWA)
  { path: 'maskable-icon.svg', generator: () => generateMaskableSVG(512), dir: ICONS_DIR },
  
  // Special icons
  { path: 'safari-pinned-tab.svg', generator: generateSafariPinnedSVG, dir: ICONS_DIR },
  { path: 'mstile-150.svg', generator: () => generateEyeLogoSVG(150), dir: ICONS_DIR },
  { path: 'og-image.svg', generator: generateOGImageSVG, dir: ICONS_DIR },
];

// PNG sizes to generate (will need sharp)
const PNG_SIZES = [
  // Favicons
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  
  // Android Chrome
  { name: 'android-chrome-16x16.png', size: 16 },
  { name: 'android-chrome-32x32.png', size: 32 },
  { name: 'android-chrome-48x48.png', size: 48 },
  { name: 'android-chrome-96x96.png', size: 96 },
  { name: 'android-chrome-144x144.png', size: 144 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-256x256.png', size: 256 },
  { name: 'android-chrome-512x512.png', size: 512 },
  
  // Apple Touch Icons
  { name: 'apple-touch-icon.png', size: 180, cornerRadius: 0 },
  { name: 'apple-touch-icon-120x120.png', size: 120, cornerRadius: 0 },
  { name: 'apple-touch-icon-152x152.png', size: 152, cornerRadius: 0 },
  { name: 'apple-touch-icon-167x167.png', size: 167, cornerRadius: 0 },
  { name: 'apple-touch-icon-180x180.png', size: 180, cornerRadius: 0 },
  
  // Standard icons
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-256x256.png', size: 256 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'icon-1024x1024.png', size: 1024 },
  
  // Maskable icons (extra padding)
  { name: 'maskable-icon-192x192.png', size: 192, maskable: true },
  { name: 'maskable-icon-512x512.png', size: 512, maskable: true },
  
  // Microsoft
  { name: 'mstile-150x150.png', size: 150 },
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🎨 Generating Ferni icons...\n');
  
  // Generate SVG files
  console.log('📝 Generating SVG files...');
  for (const file of SVG_FILES) {
    const fullPath = join(file.dir, file.path);
    const svg = file.generator();
    writeFileSync(fullPath, svg);
    console.log(`  ✓ ${file.path}`);
  }
  
  // Check if sharp is available for PNG generation
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('\n⚠️  sharp not installed - skipping PNG generation');
    console.log('   To generate PNGs, run: npm install sharp --save-dev');
    console.log('   Then re-run this script.\n');
    
    console.log('📋 PNG files that need regeneration:');
    for (const png of PNG_SIZES) {
      console.log(`   - icons/${png.name}`);
    }
    console.log('\n💡 Alternative: Use an online tool like realfavicongenerator.net');
    console.log('   Upload the SVG from public/icons/icon-base.svg');
    return;
  }
  
  // Generate PNG files
  console.log('\n🖼️  Generating PNG files...');
  for (const png of PNG_SIZES) {
    const svg = png.maskable 
      ? generateMaskableSVG(png.size)
      : generateEyeLogoSVG(png.size, { cornerRadius: png.cornerRadius });
    
    const pngPath = join(ICONS_DIR, png.name);
    
    await sharp(Buffer.from(svg))
      .png()
      .toFile(pngPath);
    
    console.log(`  ✓ ${png.name}`);
  }
  
  // Generate root apple-touch-icon.png
  const appleTouchSvg = generateEyeLogoSVG(180, { cornerRadius: 0 });
  await sharp(Buffer.from(appleTouchSvg))
    .png()
    .toFile(join(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('  ✓ apple-touch-icon.png (root)');
  
  // Generate OG image PNG
  const ogSvg = generateOGImageSVG();
  await sharp(Buffer.from(ogSvg))
    .png()
    .toFile(join(ICONS_DIR, 'og-image.png'));
  console.log('  ✓ og-image.png');
  
  console.log('\n✅ All icons generated successfully!');
  console.log('   Don\'t forget to commit the changes.');
}

main().catch(console.error);

