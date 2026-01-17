#!/usr/bin/env npx tsx
/**
 * Generate Marketing Assets
 *
 * Generates all marketing assets with the Three Stones logo for various platforms.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/generate/generate-marketing-assets.ts
 *   ferni generate marketing
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..', '..', '..');

const LOGO_SVG = join(ROOT, 'design-system/assets/logos/ferni-logo.svg');
const MARKETING_DIR = join(ROOT, 'apps/marketing/assets');

// Colors from brand
const COLORS = {
  sage: '#4a6741',
  cream: '#F5F1E8',
  ink: '#2c2520',
  white: '#ffffff',
};

async function generatePNG(svgPath: string, outputPath: string, size: number): Promise<void> {
  try {
    const svg = readFileSync(svgPath);
    await sharp(svg).resize(size, size).png().toFile(outputPath);
    console.log(`  ✓ ${outputPath} (${size}x${size})`);
  } catch (err) {
    const error = err as Error;
    console.error(`  ✗ Failed: ${outputPath} - ${error.message}`);
  }
}

async function generateLogoOnBackground(
  outputPath: string,
  width: number,
  height: number,
  bgColor: string,
  logoSize: number
): Promise<void> {
  try {
    const svg = readFileSync(LOGO_SVG);
    const logoBuffer = await sharp(svg).resize(logoSize, logoSize).png().toBuffer();

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: bgColor,
      },
    })
      .composite([
        {
          input: logoBuffer,
          gravity: 'center',
        },
      ])
      .png()
      .toFile(outputPath);

    console.log(`  ✓ ${outputPath} (${width}x${height})`);
  } catch (err) {
    const error = err as Error;
    console.error(`  ✗ Failed: ${outputPath} - ${error.message}`);
  }
}

async function generateSocialProfiles(): Promise<void> {
  console.log('\n📱 Generating Social Media Profile Pictures...');

  const profiles = [
    { path: 'social/facebook/profile-180.png', size: 180 },
    { path: 'social/instagram/profile-320.png', size: 320 },
    { path: 'social/linkedin/profile-300.png', size: 300 },
    { path: 'social/twitter/profile-400.png', size: 400 },
  ];

  for (const profile of profiles) {
    const outputPath = join(MARKETING_DIR, profile.path);
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await generateLogoOnBackground(outputPath, profile.size, profile.size, COLORS.cream, Math.floor(profile.size * 0.7));
  }
}

async function generateAppStoreIcons(): Promise<void> {
  console.log('\n🍎 Generating App Store Icons...');

  const appleDir = join(MARKETING_DIR, 'app-stores/apple');
  const googleDir = join(MARKETING_DIR, 'app-stores/google');
  mkdirSync(appleDir, { recursive: true });
  mkdirSync(googleDir, { recursive: true });

  // Apple App Store (1024x1024)
  await generatePNG(LOGO_SVG, join(appleDir, 'icon-1024.png'), 1024);

  // Google Play Store (512x512)
  await generatePNG(LOGO_SVG, join(googleDir, 'icon-512.png'), 512);
}

async function generateWebAssets(): Promise<void> {
  console.log('\n🌐 Generating Web Assets...');

  const webDir = join(MARKETING_DIR, 'web');
  mkdirSync(webDir, { recursive: true });

  // Favicon
  await generatePNG(LOGO_SVG, join(webDir, 'favicon-512.png'), 512);

  // OG Image (logo centered on brand background)
  await generateLogoOnBackground(join(webDir, 'og-image-1200x630.png'), 1200, 630, COLORS.cream, 300);

  // Twitter Card
  await generateLogoOnBackground(join(webDir, 'twitter-card-1200x600.png'), 1200, 600, COLORS.cream, 280);
}

async function generateSocialBanners(): Promise<void> {
  console.log('\n🎨 Generating Social Media Banners...');

  // LinkedIn banner (1128x191) - wide format, smaller logo
  const linkedinDir = join(MARKETING_DIR, 'social/linkedin');
  mkdirSync(linkedinDir, { recursive: true });
  await generateLogoOnBackground(join(linkedinDir, 'banner-1128x191.png'), 1128, 191, COLORS.cream, 140);

  // Twitter header (1500x500)
  const twitterDir = join(MARKETING_DIR, 'social/twitter');
  mkdirSync(twitterDir, { recursive: true });
  await generateLogoOnBackground(join(twitterDir, 'header-1500x500.png'), 1500, 500, COLORS.cream, 280);
}

async function generatePressKit(): Promise<void> {
  console.log('\n📰 Generating Press Kit Assets...');

  const pressKitDir = join(ROOT, 'apps/marketing/graphics/press-kit');
  mkdirSync(pressKitDir, { recursive: true });

  // High-res logo on transparent
  await generatePNG(LOGO_SVG, join(pressKitDir, 'logo-1024.png'), 1024);
  await generatePNG(LOGO_SVG, join(pressKitDir, 'logo-512.png'), 512);

  // Logo on light background
  await generateLogoOnBackground(join(pressKitDir, 'logo-on-cream-1024.png'), 1024, 1024, COLORS.cream, 700);

  // Logo on dark background
  await generateLogoOnBackground(join(pressKitDir, 'logo-on-dark-1024.png'), 1024, 1024, COLORS.ink, 700);

  // App icon (rounded for app stores)
  await generatePNG(LOGO_SVG, join(pressKitDir, 'app-icon-1024.png'), 1024);
}

async function generateWindowsAssets(): Promise<void> {
  console.log('\n🪟 Generating Windows Store Assets...');

  const windowsDir = join(ROOT, 'apps/marketing/graphics/windows');
  if (!existsSync(windowsDir)) {
    mkdirSync(windowsDir, { recursive: true });
  }

  // Windows Store logo sizes
  await generatePNG(LOGO_SVG, join(windowsDir, 'store-logo-300.png'), 300);
  await generatePNG(LOGO_SVG, join(windowsDir, 'store-logo-150.png'), 150);
  await generatePNG(LOGO_SVG, join(windowsDir, 'store-logo-71.png'), 71);
  await generatePNG(LOGO_SVG, join(windowsDir, 'store-logo-50.png'), 50);
  await generatePNG(LOGO_SVG, join(windowsDir, 'store-logo-44.png'), 44);
}

export async function generateMarketingAssets(): Promise<boolean> {
  console.log('🪨 Ferni Marketing Assets Generator');
  console.log('====================================');
  console.log('Generating all marketing assets with Three Stones logo...\n');

  // Check if logo exists
  if (!existsSync(LOGO_SVG)) {
    console.error(`❌ Logo not found at: ${LOGO_SVG}`);
    console.error('Please ensure brand assets are in place.');
    return false;
  }

  try {
    await generateSocialProfiles();
    await generateAppStoreIcons();
    await generateWebAssets();
    await generateSocialBanners();
    await generatePressKit();
    await generateWindowsAssets();

    console.log('\n✅ All marketing assets generated successfully!');
    console.log('\nGenerated assets:');
    console.log('  • Social media profile pictures (Facebook, Instagram, LinkedIn, Twitter)');
    console.log('  • App store icons (Apple, Google)');
    console.log('  • Web assets (OG images, Twitter cards)');
    console.log('  • Social banners (LinkedIn, Twitter)');
    console.log('  • Press kit assets');
    console.log('  • Windows store assets');

    return true;
  } catch (err) {
    const error = err as Error;
    console.error('\n❌ Error:', error.message);
    return false;
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  generateMarketingAssets()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
