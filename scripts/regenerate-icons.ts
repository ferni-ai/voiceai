#!/usr/bin/env npx tsx
/**
 * Regenerate PNG icons from SVG sources
 * 
 * This script converts all SVG icons to PNG format at various sizes
 * for use in web manifests, favicons, and app stores.
 * 
 * Usage: npx tsx scripts/regenerate-icons.ts
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Icon configurations
const ICON_CONFIGS = [
  // Web app icons (apps/web/public/icons/)
  { 
    source: 'apps/web/public/icons/android-chrome-192.svg',
    outputs: [
      { path: 'apps/web/public/icons/android-chrome-192x192.png', size: 192 },
    ]
  },
  { 
    source: 'apps/web/public/icons/android-chrome-512.svg',
    outputs: [
      { path: 'apps/web/public/icons/android-chrome-512x512.png', size: 512 },
      { path: 'apps/web/public/icons/android-chrome-256x256.png', size: 256 },
      { path: 'apps/web/public/icons/android-chrome-144x144.png', size: 144 },
      { path: 'apps/web/public/icons/android-chrome-96x96.png', size: 96 },
      { path: 'apps/web/public/icons/android-chrome-48x48.png', size: 48 },
      { path: 'apps/web/public/icons/android-chrome-32x32.png', size: 32 },
      { path: 'apps/web/public/icons/android-chrome-16x16.png', size: 16 },
    ]
  },
  {
    source: 'apps/web/public/icons/favicon-16.svg',
    outputs: [
      { path: 'apps/web/public/icons/favicon-16x16.png', size: 16 },
    ]
  },
  {
    source: 'apps/web/public/icons/favicon-32.svg',
    outputs: [
      { path: 'apps/web/public/icons/favicon-32x32.png', size: 32 },
    ]
  },
  {
    source: 'apps/web/public/icons/maskable-icon.svg',
    outputs: [
      { path: 'apps/web/public/icons/maskable-icon-512x512.png', size: 512 },
      { path: 'apps/web/public/icons/maskable-icon-192x192.png', size: 192 },
    ]
  },
  // Brand icons (brand/icons/png/)
  {
    source: 'brand/icons/app-icon-1024.svg',
    outputs: [
      { path: 'brand/icons/png/ios-1024.png', size: 1024 },
      { path: 'brand/icons/png/ios-180.png', size: 180 },
      { path: 'brand/icons/png/ios-167.png', size: 167 },
      { path: 'brand/icons/png/ios-152.png', size: 152 },
      { path: 'brand/icons/png/ios-120.png', size: 120 },
      { path: 'brand/icons/png/ios-87.png', size: 87 },
      { path: 'brand/icons/png/ios-80.png', size: 80 },
      { path: 'brand/icons/png/ios-76.png', size: 76 },
      { path: 'brand/icons/png/ios-60.png', size: 60 },
      { path: 'brand/icons/png/ios-58.png', size: 58 },
      { path: 'brand/icons/png/ios-40.png', size: 40 },
      { path: 'brand/icons/png/ios-29.png', size: 29 },
      { path: 'brand/icons/png/ios-20.png', size: 20 },
      { path: 'brand/icons/png/android-512.png', size: 512 },
      { path: 'brand/icons/png/android-192.png', size: 192 },
      { path: 'brand/icons/png/android-144.png', size: 144 },
      { path: 'brand/icons/png/android-96.png', size: 96 },
      { path: 'brand/icons/png/android-72.png', size: 72 },
      { path: 'brand/icons/png/android-48.png', size: 48 },
      { path: 'brand/icons/png/android-36.png', size: 36 },
    ]
  },
  {
    source: 'brand/icons/app-icon-orb-1024.svg',
    outputs: [
      { path: 'brand/icons/png/orb-ios-1024.png', size: 1024 },
      { path: 'brand/icons/png/orb-ios-180.png', size: 180 },
      { path: 'brand/icons/png/orb-ios-167.png', size: 167 },
      { path: 'brand/icons/png/orb-ios-152.png', size: 152 },
      { path: 'brand/icons/png/orb-ios-120.png', size: 120 },
      { path: 'brand/icons/png/orb-ios-87.png', size: 87 },
      { path: 'brand/icons/png/orb-ios-80.png', size: 80 },
      { path: 'brand/icons/png/orb-ios-76.png', size: 76 },
      { path: 'brand/icons/png/orb-ios-60.png', size: 60 },
      { path: 'brand/icons/png/orb-ios-58.png', size: 58 },
      { path: 'brand/icons/png/orb-ios-40.png', size: 40 },
      { path: 'brand/icons/png/orb-ios-29.png', size: 29 },
      { path: 'brand/icons/png/orb-ios-20.png', size: 20 },
      { path: 'brand/icons/png/orb-android-512.png', size: 512 },
      { path: 'brand/icons/png/orb-android-192.png', size: 192 },
      { path: 'brand/icons/png/orb-android-144.png', size: 144 },
      { path: 'brand/icons/png/orb-android-96.png', size: 96 },
      { path: 'brand/icons/png/orb-android-72.png', size: 72 },
      { path: 'brand/icons/png/orb-android-48.png', size: 48 },
      { path: 'brand/icons/png/orb-android-36.png', size: 36 },
    ]
  },
];

async function convertSvgToPng(svgPath: string, pngPath: string, size: number): Promise<void> {
  const fullSvgPath = join(ROOT, svgPath);
  const fullPngPath = join(ROOT, pngPath);
  
  if (!existsSync(fullSvgPath)) {
    console.warn(`⚠️  Source SVG not found: ${svgPath}`);
    return;
  }
  
  // Ensure output directory exists
  const outputDir = dirname(fullPngPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const svgContent = readFileSync(fullSvgPath, 'utf-8');
  
  try {
    await sharp(Buffer.from(svgContent))
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(fullPngPath);
    
    console.log(`✅ ${pngPath} (${size}x${size})`);
  } catch (error) {
    console.error(`❌ Failed to convert ${svgPath} to ${pngPath}:`, error);
  }
}

async function main(): Promise<void> {
  console.log('🎨 Regenerating PNG icons from SVG sources...\n');
  
  let totalGenerated = 0;
  let totalFailed = 0;
  
  for (const config of ICON_CONFIGS) {
    console.log(`\n📁 Source: ${config.source}`);
    
    for (const output of config.outputs) {
      try {
        await convertSvgToPng(config.source, output.path, output.size);
        totalGenerated++;
      } catch (error) {
        totalFailed++;
      }
    }
  }
  
  console.log(`\n✨ Done! Generated ${totalGenerated} icons, ${totalFailed} failed.\n`);
  
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
