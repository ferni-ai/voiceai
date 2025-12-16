#!/usr/bin/env node
/**
 * Icon Generation Script
 *
 * Generates all PWA icons from the master orb design.
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
// SVG TEMPLATES - The Ferni orb design with voice waveform
// ============================================================================

/**
 * Generate the Ferni orb logo SVG at any size
 * The orb that embodies the human spirit with voice waveform bars
 * @param {number} size - Icon size in pixels
 * @param {object} options - Customization options
 */
function generateOrbLogoSVG(size, options = {}) {
  const {
    background = '#F5F1E8',  // Paper cream
    orbColor = '#4a6741',    // Sage green
    rounded = true,
    cornerRadius = size >= 32 ? Math.round(size * 0.1875) : Math.round(size * 0.15),
    showGlow = size >= 64,
    showRings = size >= 128,
  } = options;

  const center = size / 2;
  const orbRadius = size * 0.333; // Orb takes up 2/3 of the icon

  // Waveform bar dimensions scaled to size
  const barWidth = Math.max(2, Math.round(size * 0.012));
  const barGap = Math.max(3, Math.round(size * 0.03));
  const barHeights = [0.375, 0.5625, 0.75, 0.875, 1, 0.875, 0.75, 0.5625, 0.375];
  const maxBarHeight = orbRadius * 0.4;

  const bgShape = rounded
    ? `<rect width="${size}" height="${size}" rx="${cornerRadius}" fill="${background}"/>`
    : `<rect width="${size}" height="${size}" fill="${background}"/>`;

  const glowFilter = showGlow ? `
    <filter id="orbGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${size * 0.04}" result="blur"/>
      <feFlood flood-color="${orbColor}" flood-opacity="0.35"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>` : '';

  const rings = showRings ? `
    <circle cx="${center}" cy="${center}" r="${orbRadius * 1.24}" fill="none" stroke="${orbColor}" stroke-width="1" opacity="0.15"/>
    <circle cx="${center}" cy="${center}" r="${orbRadius * 1.12}" fill="none" stroke="${orbColor}" stroke-width="1" opacity="0.1"/>` : '';

  // Generate waveform bars
  const totalBarsWidth = (barHeights.length - 1) * barGap + barHeights.length * barWidth;
  const startX = center - totalBarsWidth / 2;

  const waveformBars = barHeights.map((heightRatio, i) => {
    const barHeight = maxBarHeight * heightRatio;
    const x = startX + i * (barWidth + barGap);
    const y = center - barHeight / 2;
    const rx = barWidth / 2;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="${rx}" fill="rgba(255,255,255,0.95)"/>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <!-- Ferni Orb Logo - ${size}x${size} -->
  <defs>
    <linearGradient id="orbGradient" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#3d5a35"/>
      <stop offset="40%" stop-color="#4a6741"/>
      <stop offset="100%" stop-color="#5a7a4d"/>
    </linearGradient>
    <radialGradient id="orbHighlight" cx="35%" cy="25%" r="40%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.4)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    ${glowFilter}
  </defs>

  ${bgShape}
  ${rings}

  <!-- Main orb -->
  <circle cx="${center}" cy="${center}" r="${orbRadius}" fill="url(#orbGradient)"${showGlow ? ' filter="url(#orbGlow)"' : ''}/>

  <!-- Top highlight -->
  <circle cx="${center}" cy="${center}" r="${orbRadius}" fill="url(#orbHighlight)"/>

  <!-- Waveform bars -->
  <g>
    ${waveformBars}
  </g>
</svg>`;
}

/**
 * Generate maskable icon (more padding, fills safe zone)
 */
function generateMaskableSVG(size) {
  return generateOrbLogoSVG(size, {
    rounded: false,
    showGlow: false,
    showRings: false,
  });
}

/**
 * Generate Safari pinned tab SVG (monochrome)
 */
function generateSafariPinnedSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <!-- Safari Pinned Tab - Monochrome Orb -->
  <circle cx="8" cy="8" r="6" fill="black"/>
  <rect x="4" y="6.5" width="1" height="3" rx="0.5" fill="white"/>
  <rect x="5.5" y="5.5" width="1" height="5" rx="0.5" fill="white"/>
  <rect x="7" y="4.5" width="1" height="7" rx="0.5" fill="white"/>
  <rect x="8.5" y="5.5" width="1" height="5" rx="0.5" fill="white"/>
  <rect x="10" y="6.5" width="1" height="3" rx="0.5" fill="white"/>
</svg>`;
}

/**
 * Generate OG image SVG (wide format with logo)
 */
function generateOGImageSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <!-- Open Graph Image -->
  <defs>
    <linearGradient id="ogOrbGradient" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#3d5a35"/>
      <stop offset="40%" stop-color="#4a6741"/>
      <stop offset="100%" stop-color="#5a7a4d"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="#F5F1E8"/>

  <!-- Orb Logo -->
  <g transform="translate(600, 250)">
    <circle cx="0" cy="0" r="100" fill="url(#ogOrbGradient)"/>
    <!-- Waveform bars -->
    <rect x="-36" y="-12" width="4" height="24" rx="2" fill="rgba(255,255,255,0.95)"/>
    <rect x="-27" y="-18" width="4" height="36" rx="2" fill="rgba(255,255,255,0.95)"/>
    <rect x="-18" y="-24" width="4" height="48" rx="2" fill="rgba(255,255,255,0.95)"/>
    <rect x="-9" y="-28" width="4" height="56" rx="2" fill="rgba(255,255,255,0.95)"/>
    <rect x="0" y="-32" width="4" height="64" rx="2" fill="rgba(255,255,255,0.95)"/>
    <rect x="9" y="-28" width="4" height="56" rx="2" fill="rgba(255,255,255,0.95)"/>
    <rect x="18" y="-24" width="4" height="48" rx="2" fill="rgba(255,255,255,0.95)"/>
    <rect x="27" y="-18" width="4" height="36" rx="2" fill="rgba(255,255,255,0.95)"/>
    <rect x="36" y="-12" width="4" height="24" rx="2" fill="rgba(255,255,255,0.95)"/>
  </g>

  <!-- Text -->
  <text x="600" y="430" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="700" fill="#2c2520" text-anchor="middle">Ferni</text>
  <text x="600" y="490" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="400" fill="#5a5550" text-anchor="middle">Your AI Life Coach</text>
</svg>`;
}

// ============================================================================
// FILE GENERATION
// ============================================================================

const SVG_FILES = [
  // Favicons (in public/)
  { path: 'favicon.svg', generator: () => generateOrbLogoSVG(32, { showGlow: false }), dir: PUBLIC_DIR },
  { path: 'apple-touch-icon.svg', generator: () => generateOrbLogoSVG(180, { cornerRadius: 0 }), dir: PUBLIC_DIR },
  { path: 'logo-icon.svg', generator: () => generateOrbLogoSVG(64), dir: PUBLIC_DIR },
  { path: 'ferni-avatar.svg', generator: () => generateOrbLogoSVG(200, { rounded: false, background: 'transparent' }), dir: PUBLIC_DIR },

  // Favicons (in public/icons/)
  { path: 'favicon-16.svg', generator: () => generateOrbLogoSVG(16, { showGlow: false, showRings: false }), dir: ICONS_DIR },
  { path: 'favicon-32.svg', generator: () => generateOrbLogoSVG(32, { showGlow: false }), dir: ICONS_DIR },

  // App icons
  { path: 'icon-base.svg', generator: () => generateOrbLogoSVG(512), dir: ICONS_DIR },
  { path: 'icon-1024.svg', generator: () => generateOrbLogoSVG(1024), dir: ICONS_DIR },
  { path: 'app-icon-1024.svg', generator: () => generateOrbLogoSVG(1024), dir: ICONS_DIR },
  { path: 'app-icon-orb-1024.svg', generator: () => generateOrbLogoSVG(1024), dir: ICONS_DIR },
  { path: 'app-icon-orb-simple-1024.svg', generator: () => generateOrbLogoSVG(1024, { showGlow: false, showRings: false }), dir: ICONS_DIR },

  // Android icons
  { path: 'android-chrome-192.svg', generator: () => generateOrbLogoSVG(192), dir: ICONS_DIR },
  { path: 'android-chrome-512.svg', generator: () => generateOrbLogoSVG(512), dir: ICONS_DIR },
  { path: 'app-icon-android.svg', generator: () => generateOrbLogoSVG(512, { rounded: false }), dir: ICONS_DIR },
  { path: 'app-icon-android-background.svg', generator: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" fill="#F5F1E8"/></svg>`, dir: ICONS_DIR },

  // iOS icons
  { path: 'apple-touch-icon.svg', generator: () => generateOrbLogoSVG(180, { cornerRadius: 0 }), dir: ICONS_DIR },
  { path: 'app-icon-ios-simple.svg', generator: () => generateOrbLogoSVG(1024, { cornerRadius: 0, showGlow: false }), dir: ICONS_DIR },

  // Maskable icons (for PWA)
  { path: 'maskable-icon.svg', generator: () => generateMaskableSVG(512), dir: ICONS_DIR },

  // Special icons
  { path: 'safari-pinned-tab.svg', generator: generateSafariPinnedSVG, dir: ICONS_DIR },
  { path: 'mstile-150.svg', generator: () => generateOrbLogoSVG(150), dir: ICONS_DIR },
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
  console.log('🔮 Generating Ferni orb icons...\n');

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
      : generateOrbLogoSVG(png.size, {
          cornerRadius: png.cornerRadius,
          showGlow: png.size >= 64,
          showRings: png.size >= 128,
        });

    const pngPath = join(ICONS_DIR, png.name);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(pngPath);

    console.log(`  ✓ ${png.name}`);
  }

  // Generate root apple-touch-icon.png
  const appleTouchSvg = generateOrbLogoSVG(180, { cornerRadius: 0 });
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

  console.log('\n✅ All orb icons generated successfully!');
  console.log('   Don\'t forget to commit the changes.');
}

main().catch(console.error);
