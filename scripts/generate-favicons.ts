#!/usr/bin/env npx tsx
/**
 * Ferni Favicon Generator
 *
 * Generates all favicon formats from SVG sources:
 * - favicon.ico (multi-resolution: 16x16, 32x32, 48x48)
 * - PNG files at various sizes (16, 32, 48, 64, 96, 128, 192, 256, 512)
 * - Animated GIF with Ferni smiling
 * - Apple touch icons
 * - Android chrome icons
 * - MS tile icons
 *
 * Requirements:
 * - sharp (for PNG conversion): pnpm add -D sharp
 * - png-to-ico (for ICO generation): pnpm add -D png-to-ico
 * - gifencoder (for GIF animation): pnpm add -D gifencoder canvas
 *
 * Usage:
 *   pnpm tsx scripts/generate-favicons.ts
 *   pnpm tsx scripts/generate-favicons.ts --gif-only
 *   pnpm tsx scripts/generate-favicons.ts --output apps/web/public/icons
 */

import fs from 'fs';
import path from 'path';

// Source SVG files
const BRAND_DIR = path.join(process.cwd(), 'brand/favicons');
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'apps/web/public/icons');

// Size configurations
const FAVICON_SIZES = [16, 32, 48];
const PNG_SIZES = [16, 32, 48, 64, 96, 128, 192, 256, 512, 1024];
const APPLE_TOUCH_SIZES = [120, 152, 167, 180];
const ANDROID_CHROME_SIZES = [192, 512];
const MS_TILE_SIZE = 150;

interface GeneratorOptions {
  outputDir: string;
  gifOnly: boolean;
  verbose: boolean;
}

// Colors from Ferni brand
const FERNI_GREEN_LIGHT = '#4a6741';
const FERNI_GREEN_DARK = '#3a5731';
const PAPER_CREAM = '#F5F1E8';

/**
 * Generate an SVG string for Ferni at a given size and expression
 */
function generateFerniSVG(
  size: number,
  expression: 'neutral' | 'smile' | 'squint' = 'neutral'
): string {
  const scale = size / 32;

  // Eye parameters based on expression
  let eyeRx = 2.5 * scale;
  let eyeRy = 3.2 * scale;
  let eyeY = 15 * scale;

  if (expression === 'smile' || expression === 'squint') {
    eyeRy = 1.2 * scale; // Squinted eyes for smile
    eyeY = 15.5 * scale; // Slightly lower
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="orbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${FERNI_GREEN_LIGHT}"/>
      <stop offset="100%" stop-color="${FERNI_GREEN_DARK}"/>
    </linearGradient>
    <linearGradient id="eyeFill" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f0f0f0"/>
    </linearGradient>
  </defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${14 * scale}" fill="url(#orbGrad)"/>
  <ellipse cx="${11 * scale}" cy="${eyeY}" rx="${eyeRx}" ry="${eyeRy}" fill="url(#eyeFill)"/>
  <circle cx="${10 * scale}" cy="${(eyeY - 1.5 * scale)}" r="${0.6 * scale}" fill="white" opacity="0.9"/>
  <ellipse cx="${21 * scale}" cy="${eyeY}" rx="${eyeRx}" ry="${eyeRy}" fill="url(#eyeFill)"/>
  <circle cx="${20 * scale}" cy="${(eyeY - 1.5 * scale)}" r="${0.6 * scale}" fill="white" opacity="0.9"/>
</svg>`;
}

/**
 * Generate the maskable icon (with safe zone padding)
 */
function generateMaskableSVG(size: number): string {
  // Maskable icons need 10% padding on each side (20% total)
  // So the content should be 80% of the icon size, centered
  const contentSize = size * 0.8;
  const padding = size * 0.1;
  const scale = contentSize / 32;
  const center = size / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="orbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${FERNI_GREEN_LIGHT}"/>
      <stop offset="100%" stop-color="${FERNI_GREEN_DARK}"/>
    </linearGradient>
    <linearGradient id="eyeFill" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f0f0f0"/>
    </linearGradient>
  </defs>
  
  <!-- Background fill for maskable (required for full-bleed) -->
  <rect width="${size}" height="${size}" fill="${FERNI_GREEN_LIGHT}"/>
  
  <!-- Centered orb -->
  <circle cx="${center}" cy="${center}" r="${14 * scale}" fill="url(#orbGrad)"/>
  
  <!-- Eyes offset to center -->
  <ellipse cx="${center - 5 * scale}" cy="${center - 1 * scale}" rx="${2.5 * scale}" ry="${3.2 * scale}" fill="url(#eyeFill)"/>
  <circle cx="${center - 6 * scale}" cy="${center - 2.5 * scale}" r="${0.6 * scale}" fill="white" opacity="0.9"/>
  <ellipse cx="${center + 5 * scale}" cy="${center - 1 * scale}" rx="${2.5 * scale}" ry="${3.2 * scale}" fill="url(#eyeFill)"/>
  <circle cx="${center + 4 * scale}" cy="${center - 2.5 * scale}" r="${0.6 * scale}" fill="white" opacity="0.9"/>
</svg>`;
}

/**
 * Generate Apple touch icon (rounded corners handled by OS)
 */
function generateAppleTouchSVG(size: number): string {
  return generateFerniSVG(size, 'neutral');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: GeneratorOptions = {
    outputDir: DEFAULT_OUTPUT_DIR,
    gifOnly: args.includes('--gif-only'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  // Parse --output flag
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    options.outputDir = path.resolve(process.cwd(), args[outputIdx + 1]);
  }

  console.log('🎨 Ferni Favicon Generator');
  console.log('═'.repeat(50));
  console.log(`📁 Output directory: ${options.outputDir}`);
  console.log('');

  // Ensure output directories exist
  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.mkdirSync(BRAND_DIR, { recursive: true });

  // Check for required dependencies
  let hasSharp = false;
  let hasPngToIco = false;
  let hasCanvas = false;

  try {
    await import('sharp');
    hasSharp = true;
  } catch {
    console.warn('⚠️  sharp not installed. PNG generation will be skipped.');
    console.warn('   Install with: pnpm add -D sharp');
  }

  try {
    await import('png-to-ico');
    hasPngToIco = true;
  } catch {
    console.warn('⚠️  png-to-ico not installed. ICO generation will be skipped.');
    console.warn('   Install with: pnpm add -D png-to-ico');
  }

  try {
    await import('canvas');
    hasCanvas = true;
  } catch {
    console.warn('⚠️  canvas not installed. GIF generation will be skipped.');
    console.warn('   Install with: pnpm add -D canvas');
  }

  console.log('');

  // 1. Generate SVG source files
  if (!options.gifOnly) {
    console.log('📐 Generating SVG sources...');

    // Save the expression variants
    const expressions: Array<'neutral' | 'smile' | 'squint'> = ['neutral', 'smile', 'squint'];
    for (const expr of expressions) {
      const svg = generateFerniSVG(32, expr);
      const filename = path.join(BRAND_DIR, `ferni-favicon-${expr}.svg`);
      fs.writeFileSync(filename, svg);
      console.log(`   ✓ ${path.basename(filename)}`);
    }

    // Save maskable icon SVG
    const maskableSvg = generateMaskableSVG(512);
    fs.writeFileSync(path.join(options.outputDir, 'maskable-icon.svg'), maskableSvg);
    console.log('   ✓ maskable-icon.svg');
  }

  // 2. Generate PNG files
  if (hasSharp && !options.gifOnly) {
    console.log('\n🖼️  Generating PNG favicons...');

    const sharp = (await import('sharp')).default;

    // Generate standard favicon PNGs
    for (const size of PNG_SIZES) {
      const svg = generateFerniSVG(size, 'neutral');
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

      // Favicon naming
      if (size <= 48) {
        fs.writeFileSync(path.join(options.outputDir, `favicon-${size}x${size}.png`), pngBuffer);
        console.log(`   ✓ favicon-${size}x${size}.png`);
      }

      // Android chrome
      if (ANDROID_CHROME_SIZES.includes(size)) {
        fs.writeFileSync(
          path.join(options.outputDir, `android-chrome-${size}x${size}.png`),
          pngBuffer
        );
        console.log(`   ✓ android-chrome-${size}x${size}.png`);
      }

      // General sizes
      if (size >= 64) {
        fs.writeFileSync(
          path.join(options.outputDir, `icon-${size}.png`),
          pngBuffer
        );
        if (options.verbose) {
          console.log(`   ✓ icon-${size}.png`);
        }
      }
    }

    // Apple touch icons
    console.log('\n🍎 Generating Apple touch icons...');
    for (const size of APPLE_TOUCH_SIZES) {
      const svg = generateAppleTouchSVG(size);
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
      fs.writeFileSync(
        path.join(options.outputDir, `apple-touch-icon-${size}x${size}.png`),
        pngBuffer
      );
      console.log(`   ✓ apple-touch-icon-${size}x${size}.png`);
    }

    // Default apple touch icon (180x180)
    const defaultAppleSvg = generateAppleTouchSVG(180);
    const defaultApplePng = await sharp(Buffer.from(defaultAppleSvg)).png().toBuffer();
    fs.writeFileSync(path.join(options.outputDir, 'apple-touch-icon.png'), defaultApplePng);
    console.log('   ✓ apple-touch-icon.png (180x180)');

    // MS tile
    console.log('\n🪟 Generating MS tile...');
    const msTileSvg = generateFerniSVG(MS_TILE_SIZE, 'neutral');
    const msTilePng = await sharp(Buffer.from(msTileSvg)).png().toBuffer();
    fs.writeFileSync(path.join(options.outputDir, `mstile-${MS_TILE_SIZE}x${MS_TILE_SIZE}.png`), msTilePng);
    console.log(`   ✓ mstile-${MS_TILE_SIZE}x${MS_TILE_SIZE}.png`);

    // Maskable icons
    console.log('\n📱 Generating maskable icons...');
    for (const size of [192, 512]) {
      const svg = generateMaskableSVG(size);
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
      fs.writeFileSync(path.join(options.outputDir, `maskable-icon-${size}x${size}.png`), pngBuffer);
      console.log(`   ✓ maskable-icon-${size}x${size}.png`);
    }
  }

  // 3. Generate ICO file
  if (hasSharp && hasPngToIco && !options.gifOnly) {
    console.log('\n📦 Generating favicon.ico...');

    const sharp = (await import('sharp')).default;
    const pngToIco = (await import('png-to-ico')).default;

    // Generate PNGs for ICO (16, 32, 48)
    const icoSources: Buffer[] = [];
    for (const size of FAVICON_SIZES) {
      const svg = generateFerniSVG(size, 'neutral');
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
      icoSources.push(pngBuffer);
    }

    try {
      const icoBuffer = await pngToIco(icoSources);
      fs.writeFileSync(path.join(options.outputDir, 'favicon.ico'), icoBuffer);
      console.log('   ✓ favicon.ico (16x16, 32x32, 48x48)');

      // Also copy to web root for maximum compatibility
      fs.writeFileSync(path.join(options.outputDir, '..', 'favicon.ico'), icoBuffer);
      console.log('   ✓ ../favicon.ico (root copy)');
    } catch (error) {
      console.error('   ✗ Failed to generate ICO:', error);
    }
  }

  // 4. Generate animated GIF
  if (hasCanvas && hasSharp) {
    console.log('\n🎬 Generating animated GIF with Ferni smiling...');

    try {
      const { createCanvas } = await import('canvas');
      const GIFEncoder = (await import('gifencoder')).default;
      const sharp = (await import('sharp')).default;

      const size = 64; // Good size for GIF
      const encoder = new GIFEncoder(size, size);
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');

      // Create write stream
      const gifPath = path.join(options.outputDir, 'ferni-smile.gif');
      const stream = fs.createWriteStream(gifPath);

      encoder.createReadStream().pipe(stream);

      encoder.start();
      encoder.setRepeat(0); // Loop forever
      encoder.setDelay(120); // 120ms between frames
      encoder.setQuality(10); // Best quality

      // Animation frames: neutral -> squint -> smile -> squint -> neutral
      const frames: Array<{ expression: 'neutral' | 'smile' | 'squint'; count: number }> = [
        { expression: 'neutral', count: 15 }, // Hold neutral (~1.8s)
        { expression: 'squint', count: 2 },   // Quick transition
        { expression: 'smile', count: 8 },    // Hold smile (~1s)
        { expression: 'squint', count: 2 },   // Quick transition
        { expression: 'neutral', count: 5 },  // Brief neutral before loop
      ];

      for (const frame of frames) {
        const svg = generateFerniSVG(size, frame.expression);
        const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

        // Load PNG into canvas
        const { Image } = await import('canvas');
        const img = new Image();
        img.src = pngBuffer;

        for (let i = 0; i < frame.count; i++) {
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          encoder.addFrame(ctx as unknown as CanvasRenderingContext2D);
        }
      }

      encoder.finish();
      console.log('   ✓ ferni-smile.gif (64x64, animated)');

      // Also generate a larger version for marketing
      const largeEncoder = new GIFEncoder(256, 256);
      const largeCanvas = createCanvas(256, 256);
      const largeCtx = largeCanvas.getContext('2d');

      const largeGifPath = path.join(options.outputDir, 'ferni-smile-large.gif');
      const largeStream = fs.createWriteStream(largeGifPath);

      largeEncoder.createReadStream().pipe(largeStream);
      largeEncoder.start();
      largeEncoder.setRepeat(0);
      largeEncoder.setDelay(120);
      largeEncoder.setQuality(10);

      for (const frame of frames) {
        const svg = generateFerniSVG(256, frame.expression);
        const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

        const { Image } = await import('canvas');
        const img = new Image();
        img.src = pngBuffer;

        for (let i = 0; i < frame.count; i++) {
          largeCtx.clearRect(0, 0, 256, 256);
          largeCtx.drawImage(img, 0, 0, 256, 256);
          largeEncoder.addFrame(largeCtx as unknown as CanvasRenderingContext2D);
        }
      }

      largeEncoder.finish();
      console.log('   ✓ ferni-smile-large.gif (256x256, animated)');
    } catch (error) {
      console.error('   ✗ Failed to generate GIF:', error);
    }
  }

  // 5. Copy animated SVG favicon
  if (!options.gifOnly) {
    console.log('\n📋 Copying animated SVG favicon...');

    const animatedSvgSource = path.join(BRAND_DIR, 'ferni-favicon-animated-smile.svg');
    if (fs.existsSync(animatedSvgSource)) {
      fs.copyFileSync(animatedSvgSource, path.join(options.outputDir, '..', 'favicon-animated.svg'));
      console.log('   ✓ favicon-animated.svg');
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✨ Favicon generation complete!');
  console.log('');
  console.log('📝 Next steps:');
  console.log('   1. Verify the generated files in:', options.outputDir);
  console.log('   2. Test favicon.ico in multiple browsers');
  console.log('   3. Update HTML <link> tags if needed');
  console.log('');
}

main().catch(console.error);
