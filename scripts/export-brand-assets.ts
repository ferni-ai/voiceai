#!/usr/bin/env npx ts-node
/**
 * Export Ferni FE+AI brand assets to PNG in various social media sizes
 *
 * Usage: npx ts-node scripts/export-brand-assets.ts
 *
 * Requires: sharp (npm install sharp @types/sharp)
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const BRAND_DIR = path.join(process.cwd(), 'brand');
const OUTPUT_DIR = path.join(BRAND_DIR, 'exports');

// Source SVG files
const SVG_VARIANTS = [
  // FE+AI logos
  'ferni-fe-ai-logo.svg',
  'ferni-fe-ai-gradient.svg',
  'ferni-fe-ai-aurora.svg',
  'ferni-fe-ai-sunset.svg',
  'ferni-fe-ai-ocean.svg',
  'ferni-fe-ai-gradient-dark.svg',
  'ferni-fe-ai-neon.svg',
  'ferni-fe-ai-logo-minimal.svg',
  // Robot mascots (humanoid)
  'ferni-robot-mascot.svg',
  'ferni-robot-thinking.svg',
  'ferni-robot-celebrating.svg',
  'ferni-robot-listening.svg',
  'ferni-robot-hugging.svg',
  'ferni-robot-icon.svg',
  // WALL-E style bots
  'ferni-walle-bot.svg',
  'ferni-walle-curious.svg',
  'ferni-walle-happy.svg',
  'ferni-walle-sage.svg',
  'ferni-walle-icon.svg',
  'ferni-walle-sticker.svg',
];

// Social media and app sizes
const EXPORT_SIZES = {
  // App Icons
  'app-icon': [
    { name: 'icon-16', width: 16, height: 16 },
    { name: 'icon-32', width: 32, height: 32 },
    { name: 'icon-48', width: 48, height: 48 },
    { name: 'icon-64', width: 64, height: 64 },
    { name: 'icon-128', width: 128, height: 128 },
    { name: 'icon-256', width: 256, height: 256 },
    { name: 'icon-512', width: 512, height: 512 },
    { name: 'icon-1024', width: 1024, height: 1024 },
  ],

  // Favicons
  favicon: [
    { name: 'favicon-16', width: 16, height: 16 },
    { name: 'favicon-32', width: 32, height: 32 },
    { name: 'favicon-48', width: 48, height: 48 },
    { name: 'apple-touch-icon', width: 180, height: 180 },
  ],

  // Twitter/X
  twitter: [
    { name: 'twitter-profile', width: 400, height: 400 },
    { name: 'twitter-header', width: 1500, height: 500 },
    { name: 'twitter-post', width: 1200, height: 675 },
  ],

  // Instagram
  instagram: [
    { name: 'instagram-profile', width: 320, height: 320 },
    { name: 'instagram-post', width: 1080, height: 1080 },
    { name: 'instagram-story', width: 1080, height: 1920 },
  ],

  // Facebook
  facebook: [
    { name: 'facebook-profile', width: 180, height: 180 },
    { name: 'facebook-cover', width: 820, height: 312 },
    { name: 'facebook-post', width: 1200, height: 630 },
  ],

  // LinkedIn
  linkedin: [
    { name: 'linkedin-profile', width: 400, height: 400 },
    { name: 'linkedin-banner', width: 1584, height: 396 },
    { name: 'linkedin-post', width: 1200, height: 627 },
  ],

  // YouTube
  youtube: [
    { name: 'youtube-thumbnail', width: 1280, height: 720 },
    { name: 'youtube-channel-icon', width: 800, height: 800 },
  ],

  // Open Graph / General
  og: [
    { name: 'og-image', width: 1200, height: 630 },
    { name: 'og-square', width: 1200, height: 1200 },
  ],
};

interface ExportSize {
  name: string;
  width: number;
  height: number;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory exists
  }
}

async function createSquareVersion(
  svgPath: string,
  size: number,
  outputPath: string
): Promise<void> {
  const svgBuffer = await fs.readFile(svgPath);

  // Create a square canvas with the logo centered
  await sharp(svgBuffer)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 255, g: 253, b: 251, alpha: 1 }, // Paper cream background
    })
    .png()
    .toFile(outputPath);
}

async function createRectangleVersion(
  svgPath: string,
  width: number,
  height: number,
  outputPath: string
): Promise<void> {
  const svgBuffer = await fs.readFile(svgPath);

  // For wide formats, center the logo
  await sharp(svgBuffer)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 255, g: 253, b: 251, alpha: 1 },
    })
    .png()
    .toFile(outputPath);
}

async function createTransparentVersion(
  svgPath: string,
  size: number,
  outputPath: string
): Promise<void> {
  const svgBuffer = await fs.readFile(svgPath);

  await sharp(svgBuffer)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);
}

async function exportSvgToPng(
  svgPath: string,
  size: ExportSize,
  outputDir: string,
  variantName: string
): Promise<void> {
  const outputPath = path.join(outputDir, `${variantName}-${size.name}.png`);

  if (size.width === size.height) {
    // Square format
    await createSquareVersion(svgPath, size.width, outputPath);
  } else {
    // Rectangle format
    await createRectangleVersion(svgPath, size.width, size.height, outputPath);
  }

  console.log(`  ✓ ${size.name} (${size.width}x${size.height})`);
}

async function exportAllSizes(): Promise<void> {
  console.log('🎨 Exporting Ferni FE+AI brand assets...\n');

  // Ensure output directories exist
  await ensureDir(OUTPUT_DIR);

  for (const category of Object.keys(EXPORT_SIZES)) {
    await ensureDir(path.join(OUTPUT_DIR, category));
  }
  await ensureDir(path.join(OUTPUT_DIR, 'transparent'));

  for (const svgFile of SVG_VARIANTS) {
    const svgPath = path.join(BRAND_DIR, svgFile);
    const variantName = svgFile.replace('.svg', '');

    // Check if SVG exists
    try {
      await fs.access(svgPath);
    } catch {
      console.log(`⚠️  Skipping ${svgFile} (not found)`);
      continue;
    }

    console.log(`\n📁 ${svgFile}`);

    // Export to each category
    for (const [category, sizes] of Object.entries(EXPORT_SIZES)) {
      const categoryDir = path.join(OUTPUT_DIR, category);

      for (const size of sizes) {
        try {
          await exportSvgToPng(svgPath, size, categoryDir, variantName);
        } catch (error) {
          console.error(`  ✗ ${size.name}: ${error}`);
        }
      }
    }

    // Also create transparent versions for icons
    const transparentDir = path.join(OUTPUT_DIR, 'transparent');
    for (const iconSize of [64, 128, 256, 512, 1024]) {
      try {
        const outputPath = path.join(transparentDir, `${variantName}-${iconSize}-transparent.png`);
        await createTransparentVersion(svgPath, iconSize, outputPath);
        console.log(`  ✓ transparent-${iconSize}`);
      } catch (error) {
        console.error(`  ✗ transparent-${iconSize}: ${error}`);
      }
    }
  }

  console.log('\n✅ Export complete! Check brand/exports/');
}

// Quick export for just the gradient version
async function quickExport(): Promise<void> {
  console.log('🚀 Quick export of gradient variant...\n');

  const svgPath = path.join(BRAND_DIR, 'ferni-fe-ai-gradient.svg');
  const quickDir = path.join(OUTPUT_DIR, 'quick');
  await ensureDir(quickDir);

  const quickSizes = [
    { name: 'profile-400', width: 400, height: 400 },
    { name: 'post-1200', width: 1200, height: 630 },
    { name: 'story-1080', width: 1080, height: 1920 },
    { name: 'icon-512', width: 512, height: 512 },
  ];

  for (const size of quickSizes) {
    await exportSvgToPng(svgPath, size, quickDir, 'ferni-gradient');
  }

  console.log('\n✅ Quick export complete! Check brand/exports/quick/');
}

// Main
const args = process.argv.slice(2);
if (args.includes('--quick')) {
  quickExport().catch(console.error);
} else {
  exportAllSizes().catch(console.error);
}
