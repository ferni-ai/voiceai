#!/usr/bin/env npx tsx
/**
 * Ferni Smiling GIF Generator
 *
 * Creates an animated GIF of Ferni smiling using sharp for image processing.
 * This is a simpler alternative that doesn't require native canvas.
 *
 * Usage:
 *   pnpm tsx scripts/generate-smile-gif.ts
 */

import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'apps/web/public/icons');
const BRAND_DIR = path.join(process.cwd(), 'brand/favicons');

// Ferni brand colors
const FERNI_GREEN_LIGHT = '#4a6741';
const FERNI_GREEN_DARK = '#3a5731';

/**
 * Generate SVG frame for animation
 */
function generateFrame(
  size: number,
  eyeSquint: number // 0 = normal, 1 = fully squinted smile
): string {
  const scale = size / 32;

  // Interpolate eye shape based on squint value
  const eyeRy = 3.2 * scale * (1 - eyeSquint * 0.65); // Gets flatter as squint increases
  const eyeY = 15 * scale + eyeSquint * 0.5 * scale; // Moves down slightly

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
  <ellipse cx="${11 * scale}" cy="${eyeY}" rx="${2.5 * scale}" ry="${eyeRy}" fill="url(#eyeFill)"/>
  <circle cx="${10 * scale}" cy="${eyeY - 1.5 * scale}" r="${0.6 * scale}" fill="white" opacity="0.9"/>
  <ellipse cx="${21 * scale}" cy="${eyeY}" rx="${2.5 * scale}" ry="${eyeRy}" fill="url(#eyeFill)"/>
  <circle cx="${20 * scale}" cy="${eyeY - 1.5 * scale}" r="${0.6 * scale}" fill="white" opacity="0.9"/>
</svg>`;
}

async function main(): Promise<void> {
  console.log('🎬 Ferni Smiling GIF Generator');
  console.log('═'.repeat(50));

  // Ensure directories exist
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(BRAND_DIR, { recursive: true });

  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('❌ sharp not installed. Run: pnpm add -D sharp');
    process.exit(1);
  }

  const size = 64;

  // Animation keyframes: [squint value, frame count]
  // Creates: neutral (hold) -> transition -> smile (hold) -> transition -> neutral
  const keyframes: Array<[number, number]> = [
    [0, 20], // Neutral - hold for ~2.4s (at 120ms per frame)
    [0.3, 1], // Transition
    [0.6, 1], // Transition
    [0.85, 1], // Almost smile
    [1, 12], // Full smile - hold for ~1.4s
    [0.85, 1], // Transition back
    [0.6, 1],
    [0.3, 1],
    [0, 6], // Brief neutral before loop
  ];

  console.log('\n📷 Generating animation frames...');

  // Generate PNG frames
  const frameBuffers: Buffer[] = [];
  let frameNum = 0;

  for (const [squint, count] of keyframes) {
    const svg = generateFrame(size, squint);
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    for (let i = 0; i < count; i++) {
      frameBuffers.push(pngBuffer);
      frameNum++;
    }
  }

  console.log(`   Generated ${frameNum} frames`);

  // Save frames as individual PNGs for manual GIF creation
  const framesDir = path.join(OUTPUT_DIR, 'gif-frames');
  fs.mkdirSync(framesDir, { recursive: true });

  for (let i = 0; i < frameBuffers.length; i++) {
    fs.writeFileSync(path.join(framesDir, `frame-${String(i).padStart(3, '0')}.png`), frameBuffers[i]);
  }

  console.log(`   ✓ Saved frames to ${framesDir}`);

  // Try to create GIF using gifencoder if available
  let gifGenerated = false;
  try {
    const GIFEncoder = (await import('gifencoder')).default;
    const { createCanvas, loadImage } = await import('canvas');

    console.log('\n🎬 Creating animated GIF...');

    const encoder = new GIFEncoder(size, size);
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    const gifPath = path.join(OUTPUT_DIR, 'ferni-smile.gif');
    const stream = fs.createWriteStream(gifPath);

    encoder.createReadStream().pipe(stream);
    encoder.start();
    encoder.setRepeat(0); // Loop forever
    encoder.setDelay(120); // 120ms between frames
    encoder.setQuality(10);

    for (const frameBuffer of frameBuffers) {
      const img = await loadImage(frameBuffer);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      encoder.addFrame(ctx as unknown as CanvasRenderingContext2D);
    }

    encoder.finish();
    gifGenerated = true;
    console.log('   ✓ ferni-smile.gif (64x64)');

    // Also create large version
    const largeSize = 256;
    const largeEncoder = new GIFEncoder(largeSize, largeSize);
    const largeCanvas = createCanvas(largeSize, largeSize);
    const largeCtx = largeCanvas.getContext('2d');

    const largeGifPath = path.join(OUTPUT_DIR, 'ferni-smile-large.gif');
    const largeStream = fs.createWriteStream(largeGifPath);

    largeEncoder.createReadStream().pipe(largeStream);
    largeEncoder.start();
    largeEncoder.setRepeat(0);
    largeEncoder.setDelay(120);
    largeEncoder.setQuality(10);

    for (const [squint, count] of keyframes) {
      const svg = generateFrame(largeSize, squint);
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
      const img = await loadImage(pngBuffer);

      for (let i = 0; i < count; i++) {
        largeCtx.clearRect(0, 0, largeSize, largeSize);
        largeCtx.drawImage(img, 0, 0, largeSize, largeSize);
        largeEncoder.addFrame(largeCtx as unknown as CanvasRenderingContext2D);
      }
    }

    largeEncoder.finish();
    console.log('   ✓ ferni-smile-large.gif (256x256)');
  } catch (error) {
    console.log('\n⚠️  Could not generate GIF (canvas/gifencoder not available)');
    console.log('   You can create the GIF manually using the frames:');
    console.log(`   ffmpeg -framerate 8 -i ${framesDir}/frame-%03d.png -loop 0 ${OUTPUT_DIR}/ferni-smile.gif`);
    console.log('   Or use: https://ezgif.com/maker');
  }

  // Create APNG (Animated PNG) as an alternative - supported by most browsers
  console.log('\n📷 Creating animated PNG (APNG)...');
  try {
    // sharp can create animated webp, let's use that
    const webpFrames = [];
    for (const [squint, count] of keyframes) {
      const svg = generateFrame(size, squint);
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
      for (let i = 0; i < count; i++) {
        webpFrames.push(pngBuffer);
      }
    }

    // Create animated WebP
    const sharpImages = webpFrames.map((buffer) =>
      sharp(buffer).webp({ quality: 100 })
    );

    // Note: animated WebP requires sharp.composite or special handling
    // For now, just note that frames are available
    console.log(`   ✓ ${webpFrames.length} frames ready for WebP animation`);
    console.log('   Note: Use ffmpeg to create animated WebP:');
    console.log(`   ffmpeg -framerate 8 -i ${framesDir}/frame-%03d.png -c:v libwebp -loop 0 ${OUTPUT_DIR}/ferni-smile.webp`);
  } catch (error) {
    console.log('   ⚠️ Could not process animated formats');
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✨ Generation complete!');
  console.log('');
  console.log('📝 Output files:');
  console.log(`   - ${framesDir}/ (${frameNum} PNG frames)`);
  if (gifGenerated) {
    console.log(`   - ${OUTPUT_DIR}/ferni-smile.gif`);
    console.log(`   - ${OUTPUT_DIR}/ferni-smile-large.gif`);
  }
  console.log('');
  console.log('💡 To create GIF manually from frames:');
  console.log(`   ffmpeg -framerate 8 -i ${framesDir}/frame-%03d.png -loop 0 ferni-smile.gif`);
  console.log('');
}

main().catch(console.error);
