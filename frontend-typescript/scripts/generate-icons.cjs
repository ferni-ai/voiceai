#!/usr/bin/env node
/**
 * Generate PNG icons from SVG sources
 * Run: node scripts/generate-icons.js
 *
 * Requires: npm install sharp
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.log('Installing sharp...');
    const { execSync } = require('child_process');
    execSync('npm install sharp', { stdio: 'inherit' });
    sharp = require('sharp');
  }

  const iconsDir = path.join(__dirname, '../public/icons');
  const outputDir = iconsDir;

  const iconConfigs = [
    // Favicons
    { src: 'favicon-16.svg', output: 'favicon-16x16.png', size: 16 },
    { src: 'favicon-32.svg', output: 'favicon-32x32.png', size: 32 },

    // Apple Touch Icons
    { src: 'apple-touch-icon.svg', output: 'apple-touch-icon.png', size: 180 },
    { src: 'apple-touch-icon.svg', output: 'apple-touch-icon-120x120.png', size: 120 },
    { src: 'apple-touch-icon.svg', output: 'apple-touch-icon-152x152.png', size: 152 },
    { src: 'apple-touch-icon.svg', output: 'apple-touch-icon-167x167.png', size: 167 },
    { src: 'apple-touch-icon.svg', output: 'apple-touch-icon-180x180.png', size: 180 },

    // Android Chrome
    { src: 'android-chrome-192.svg', output: 'android-chrome-192x192.png', size: 192 },
    { src: 'android-chrome-512.svg', output: 'android-chrome-512x512.png', size: 512 },

    // PWA Maskable
    { src: 'maskable-icon.svg', output: 'maskable-icon-512x512.png', size: 512 },
    { src: 'maskable-icon.svg', output: 'maskable-icon-192x192.png', size: 192 },

    // Microsoft
    { src: 'mstile-150.svg', output: 'mstile-150x150.png', size: 150 },

    // Marketing
    { src: 'icon-1024.svg', output: 'icon-1024x1024.png', size: 1024 },
    { src: 'icon-base.svg', output: 'icon-512x512.png', size: 512 },
    { src: 'icon-base.svg', output: 'icon-256x256.png', size: 256 },

    // OG Image (special size)
    { src: 'og-image.svg', output: 'og-image.png', width: 1200, height: 630 },
  ];

  console.log('🎨 Generating PNG icons from SVG sources...\n');

  for (const config of iconConfigs) {
    const srcPath = path.join(iconsDir, config.src);
    const outputPath = path.join(outputDir, config.output);

    if (!fs.existsSync(srcPath)) {
      console.log(`⚠️  Skipping ${config.src} (not found)`);
      continue;
    }

    try {
      const svgBuffer = fs.readFileSync(srcPath);

      let sharpInstance = sharp(svgBuffer);

      if (config.width && config.height) {
        sharpInstance = sharpInstance.resize(config.width, config.height);
      } else {
        sharpInstance = sharpInstance.resize(config.size, config.size);
      }

      await sharpInstance.png().toFile(outputPath);

      const size = config.width ? `${config.width}x${config.height}` : `${config.size}x${config.size}`;
      console.log(`✅ ${config.output} (${size})`);
    } catch (err) {
      console.error(`❌ Failed to generate ${config.output}:`, err.message);
    }
  }

  console.log('\n🎉 Icon generation complete!');
  console.log('\nGenerated files:');
  console.log('  /public/icons/*.png');
}

generateIcons().catch(console.error);
