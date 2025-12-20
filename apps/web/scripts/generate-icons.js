#!/usr/bin/env node
/**
 * Icon Generation Script
 *
 * Generates all PWA icons from the Three Stones design.
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
// SVG TEMPLATES - The Ferni Three Stones design (zen eye)
// ============================================================================

/**
 * Generate the Ferni Three Stones logo SVG at any size
 * Represents: outer stone (grounding), eye white (clarity), pupil (awareness)
 * @param {number} size - Icon size in pixels
 * @param {object} options - Customization options
 */
function generateThreeStonesSVG(size, options = {}) {
  const {
    background = '#F5F1E8',  // Paper cream
    rounded = true,
    cornerRadius = size >= 32 ? Math.round(size * 0.1875) : Math.round(size * 0.15),
    showGlow = size >= 64,
    showGlowRing = size >= 64,
  } = options;

  const center = size / 2;
  const stoneRadius = size * 0.343;  // Outer stone radius
  const eyeWhiteRadius = stoneRadius * 0.41;  // Eye white
  const irisRadius = stoneRadius * 0.266;  // Iris
  const pupilRadius = stoneRadius * 0.133;  // Pupil
  const catchlightRadius = size >= 64 ? stoneRadius * 0.055 : stoneRadius * 0.04;

  const bgShape = rounded
    ? `<rect width="${size}" height="${size}" rx="${cornerRadius}" fill="${background}"/>`
    : `<rect width="${size}" height="${size}" fill="${background}"/>`;

  const glowFilter = showGlow ? `
    <filter id="glowFilter${size}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${Math.max(2, size * 0.01)}" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>` : '';

  const glowRing = showGlowRing ? `
  <circle cx="${center}" cy="${center}" r="${stoneRadius * 1.1}" fill="none" stroke="#4a6741" stroke-width="${Math.max(0.5, size * 0.003)}" opacity="0.25"/>` : '';

  // Catchlight position offset
  const catchlightOffset = stoneRadius * 0.16;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <!-- Ferni Three Stones Logo - ${size}x${size} -->
  <defs>
    <radialGradient id="stoneGrad${size}" cx="40%" cy="40%">
      <stop offset="0%" stop-color="#5a8060"/>
      <stop offset="70%" stop-color="#4a6741"/>
      <stop offset="100%" stop-color="#3d5a35"/>
    </radialGradient>
    <radialGradient id="catchlightGrad${size}" cx="30%" cy="30%">
      <stop offset="0%" stop-color="white" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>${glowFilter}
  </defs>

  <!-- Background -->
  ${bgShape}
  ${glowRing}
  <!-- Outer Stone: Body -->
  <circle cx="${center}" cy="${center}" r="${stoneRadius}" fill="url(#stoneGrad${size})"${showGlow ? ` filter="url(#glowFilter${size})"` : ''}/>

  <!-- Middle Stone: Eye White -->
  <circle cx="${center}" cy="${center}" r="${eyeWhiteRadius}" fill="white"/>

  <!-- Iris -->
  <circle cx="${center}" cy="${center}" r="${irisRadius}" fill="#5a8060"/>

  <!-- Inner Stone: Pupil -->
  <circle cx="${center}" cy="${center}" r="${pupilRadius}" fill="#2c2520"/>

  <!-- Catchlight (life spark) -->
  <circle cx="${center - catchlightOffset}" cy="${center - catchlightOffset}" r="${catchlightRadius}" fill="url(#catchlightGrad${size})"/>
  ${size >= 64 ? `
  <!-- Secondary catchlight -->
  <circle cx="${center + catchlightOffset * 0.5}" cy="${center + catchlightOffset * 0.4}" r="${catchlightRadius * 0.4}" fill="white" opacity="0.4"/>` : ''}
</svg>`;
}

/**
 * Generate maskable icon (safe zone design)
 */
function generateMaskableSVG(size) {
  return generateThreeStonesSVG(size, {
    rounded: false,
    showGlow: false,
    showGlowRing: false,
  });
}

/**
 * Generate Safari pinned tab SVG (monochrome)
 */
function generateSafariPinnedSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <!-- Safari Pinned Tab - Monochrome Three Stones -->
  <circle cx="8" cy="8" r="6" fill="black"/>
  <circle cx="8" cy="8" r="2.5" fill="white"/>
  <circle cx="8" cy="8" r="1.2" fill="black"/>
</svg>`;
}

/**
 * Generate OG image SVG (wide format with logo)
 */
function generateOGImageSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <!-- Open Graph Image - Three Stones -->
  <defs>
    <radialGradient id="stoneGradOG" cx="40%" cy="40%">
      <stop offset="0%" stop-color="#5a8060"/>
      <stop offset="70%" stop-color="#4a6741"/>
      <stop offset="100%" stop-color="#3d5a35"/>
    </radialGradient>
    <filter id="glowFilterOG" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <radialGradient id="catchlightGradOG" cx="30%" cy="30%">
      <stop offset="0%" stop-color="white" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="#F5F1E8"/>

  <!-- Three Stones Logo -->
  <g transform="translate(600, 250)">
    <!-- Outer glow ring -->
    <circle cx="0" cy="0" r="110" fill="none" stroke="#4a6741" stroke-width="2" opacity="0.25"/>
    
    <!-- Outer Stone: Body -->
    <circle cx="0" cy="0" r="100" fill="url(#stoneGradOG)" filter="url(#glowFilterOG)"/>
    
    <!-- Middle Stone: Eye White -->
    <circle cx="0" cy="0" r="41" fill="white"/>
    
    <!-- Iris -->
    <circle cx="0" cy="0" r="27" fill="#5a8060"/>
    
    <!-- Inner Stone: Pupil -->
    <circle cx="0" cy="0" r="13" fill="#2c2520"/>
    
    <!-- Catchlight (life spark) -->
    <circle cx="-8" cy="-8" r="5.5" fill="url(#catchlightGradOG)"/>
    
    <!-- Secondary catchlight -->
    <circle cx="7" cy="5" r="2" fill="white" opacity="0.4"/>
  </g>

  <!-- Text -->
  <text x="600" y="430" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="700" fill="#2c2520" text-anchor="middle">Ferni</text>
  <text x="600" y="490" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="400" fill="#5a5550" text-anchor="middle">Your AI Life Coach</text>
</svg>`;
}

/**
 * Generate animated favicon SVG (breathing effect)
 */
function generateAnimatedFaviconSVG() {
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <!-- Ferni Animated Favicon - Three Stones with Breathing -->
  <defs>
    <style>
      @keyframes breathe {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.03); }
      }
      @keyframes glow {
        0%, 100% { opacity: 0.2; }
        50% { opacity: 0.45; }
      }
      @keyframes catchlightPulse {
        0%, 100% { opacity: 0.9; }
        50% { opacity: 0.7; }
      }
      .stone-body {
        animation: breathe 4s ease-in-out infinite;
        transform-origin: center;
      }
      .glow-ring {
        animation: glow 4s ease-in-out infinite;
      }
      .catchlight {
        animation: catchlightPulse 4s ease-in-out infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .stone-body, .glow-ring, .catchlight { animation: none; }
      }
    </style>
    
    <radialGradient id="stoneGradAnim" cx="40%" cy="40%">
      <stop offset="0%" stop-color="#5a8060"/>
      <stop offset="70%" stop-color="#4a6741"/>
      <stop offset="100%" stop-color="#3d5a35"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="32" height="32" rx="6" fill="#F5F1E8"/>

  <!-- Glow ring -->
  <circle class="glow-ring" cx="16" cy="16" r="12.5" fill="none" stroke="#4a6741" stroke-width="1" opacity="0.3"/>

  <!-- Outer Stone: Body -->
  <circle class="stone-body" cx="16" cy="16" r="11" fill="url(#stoneGradAnim)"/>

  <!-- Middle Stone: Eye White -->
  <circle cx="16" cy="16" r="4.5" fill="white"/>

  <!-- Iris -->
  <circle cx="16" cy="16" r="3" fill="#5a8060"/>

  <!-- Inner Stone: Pupil -->
  <circle cx="16" cy="16" r="1.5" fill="#2c2520"/>

  <!-- Catchlight (life spark) -->
  <circle class="catchlight" cx="14.8" cy="14.8" r="0.6" fill="white" opacity="0.9"/>
</svg>`;
}

// ============================================================================
// FILE GENERATION
// ============================================================================

const SVG_FILES = [
  // Favicons (in public/)
  { path: 'favicon.svg', generator: () => generateThreeStonesSVG(32), dir: PUBLIC_DIR },
  { path: 'favicon-animated.svg', generator: generateAnimatedFaviconSVG, dir: PUBLIC_DIR },
  { path: 'apple-touch-icon.svg', generator: () => generateThreeStonesSVG(192, { cornerRadius: 38 }), dir: PUBLIC_DIR },
  { path: 'logo-icon.svg', generator: () => generateThreeStonesSVG(64), dir: PUBLIC_DIR },
  { path: 'ferni-avatar.svg', generator: () => generateThreeStonesSVG(200, { rounded: false, background: 'transparent' }), dir: PUBLIC_DIR },

  // Favicons (in public/icons/)
  { path: 'favicon-16.svg', generator: () => generateThreeStonesSVG(16, { showGlow: false, showGlowRing: false }), dir: ICONS_DIR },
  { path: 'favicon-32.svg', generator: () => generateThreeStonesSVG(32), dir: ICONS_DIR },

  // App icons
  { path: 'icon-base.svg', generator: () => generateThreeStonesSVG(512), dir: ICONS_DIR },
  { path: 'icon-1024.svg', generator: () => generateThreeStonesSVG(1024), dir: ICONS_DIR },
  { path: 'app-icon-1024.svg', generator: () => generateThreeStonesSVG(1024), dir: ICONS_DIR },
  { path: 'app-icon-orb-1024.svg', generator: () => generateThreeStonesSVG(1024), dir: ICONS_DIR },
  { path: 'app-icon-orb-simple-1024.svg', generator: () => generateThreeStonesSVG(1024, { showGlow: false, showGlowRing: false }), dir: ICONS_DIR },

  // Android icons
  { path: 'android-chrome-192.svg', generator: () => generateThreeStonesSVG(192, { cornerRadius: 36 }), dir: ICONS_DIR },
  { path: 'android-chrome-512.svg', generator: () => generateThreeStonesSVG(512, { cornerRadius: 96 }), dir: ICONS_DIR },
  { path: 'app-icon-android.svg', generator: () => generateThreeStonesSVG(512, { rounded: false }), dir: ICONS_DIR },
  { path: 'app-icon-android-background.svg', generator: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" fill="#F5F1E8"/></svg>`, dir: ICONS_DIR },

  // iOS icons
  { path: 'apple-touch-icon.svg', generator: () => generateThreeStonesSVG(180, { cornerRadius: 0 }), dir: ICONS_DIR },
  { path: 'app-icon-ios-simple.svg', generator: () => generateThreeStonesSVG(1024, { cornerRadius: 0, showGlow: false }), dir: ICONS_DIR },

  // Maskable icons (for PWA)
  { path: 'maskable-icon.svg', generator: () => generateMaskableSVG(512), dir: ICONS_DIR },

  // Special icons
  { path: 'safari-pinned-tab.svg', generator: generateSafariPinnedSVG, dir: ICONS_DIR },
  { path: 'mstile-150.svg', generator: () => generateThreeStonesSVG(150, { cornerRadius: 28 }), dir: ICONS_DIR },
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
  { name: 'icon-72x72.png', size: 72 },
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
  console.log('🪨 Generating Ferni Three Stones icons...\n');

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
      : generateThreeStonesSVG(png.size, {
          cornerRadius: png.cornerRadius,
          showGlow: png.size >= 64,
          showGlowRing: png.size >= 64,
        });

    const pngPath = join(ICONS_DIR, png.name);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(pngPath);

    console.log(`  ✓ ${png.name}`);
  }

  // Generate root apple-touch-icon.png
  const appleTouchSvg = generateThreeStonesSVG(180, { cornerRadius: 0 });
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

  console.log('\n✅ All Three Stones icons generated successfully!');
  console.log('   The zen eye is ready. 🧘');
}

main().catch(console.error);
