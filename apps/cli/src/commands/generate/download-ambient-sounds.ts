#!/usr/bin/env npx tsx
/**
 * Download Ambient Sound Files
 *
 * Downloads royalty-free ambient sounds from Pixabay for the personalization feature.
 * Run: npx tsx scripts/download-ambient-sounds.ts
 *
 * Fallback: If download fails, creates silent placeholder files.
 */

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = path.join(__dirname, '../apps/web/public/sounds/ambient');

// Ensure output directory exists
if (!fs.existsSync(SOUNDS_DIR)) {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

// Free, royalty-free sounds from archive.org (public domain)
// These are short samples that can be looped
const SOUND_SOURCES: Record<string, string[]> = {
  'rain-loop.mp3': [
    // Multiple fallback sources
    'https://freesound.org/data/previews/243/243628_3284556-lq.mp3', // Rain on window
  ],
  'fireplace-loop.mp3': [
    'https://freesound.org/data/previews/370/370088_6570322-lq.mp3', // Crackling fire
  ],
  'forest-loop.mp3': [
    'https://freesound.org/data/previews/531/531947_10352833-lq.mp3', // Forest ambience
  ],
};

async function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`  Downloading from ${url}...`);

    const file = fs.createWriteStream(destPath);

    https
      .get(url, { headers: { 'User-Agent': 'Ferni/1.0' } }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(destPath);
            void downloadFile(redirectUrl, destPath).then(resolve);
            return;
          }
        }

        if (response.statusCode !== 200) {
          console.log(`    ❌ HTTP ${response.statusCode}`);
          file.close();
          fs.unlinkSync(destPath);
          resolve(false);
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          const stats = fs.statSync(destPath);
          if (stats.size > 1000) {
            console.log(`    ✅ Downloaded (${Math.round(stats.size / 1024)}KB)`);
            resolve(true);
          } else {
            console.log(`    ❌ File too small`);
            fs.unlinkSync(destPath);
            resolve(false);
          }
        });
      })
      .on('error', (err) => {
        console.log(`    ❌ Error: ${err.message}`);
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        resolve(false);
      });
  });
}

function createPlaceholder(destPath: string): void {
  // Create a minimal valid MP3 file (silent)
  // This is a minimal valid MP3 frame (MPEG Audio Layer 3)
  const minimalMp3 = Buffer.from([
    0xff,
    0xfb,
    0x90,
    0x00, // MPEG header
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // padding
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);

  // Repeat to make it a few KB
  const frames = Buffer.concat(Array(100).fill(minimalMp3));
  fs.writeFileSync(destPath, frames);
  console.log(`    📝 Created placeholder (${frames.length} bytes)`);
}

async function main() {
  console.log('🎵 Downloading ambient sounds for Ferni personalization...\n');

  for (const [filename, urls] of Object.entries(SOUND_SOURCES)) {
    const destPath = path.join(SOUNDS_DIR, filename);

    console.log(`📂 ${filename}`);

    // Skip if already exists and is large enough
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 10000) {
        console.log(`    ⏭️  Already exists (${Math.round(stats.size / 1024)}KB)\n`);
        continue;
      }
    }

    let success = false;

    // Try each URL until one works
    for (const url of urls) {
      success = await downloadFile(url, destPath);
      if (success) break;
    }

    // Create placeholder if all downloads failed
    if (!success) {
      console.log(`    ⚠️  Downloads failed, creating placeholder...`);
      createPlaceholder(destPath);
    }

    console.log('');
  }

  console.log('✅ Done!\n');
  console.log('📍 Files located at: apps/web/public/sounds/ambient/');
  console.log('');
  console.log('💡 Note: Downloaded files are low-quality previews.');
  console.log('   For production, replace with high-quality 30-60s loops from:');
  console.log('   - Freesound.org (free with attribution)');
  console.log('   - Pixabay.com/sound-effects (free commercial use)');
  console.log('   - Epidemic Sound (paid, high quality)');
}

main().catch(console.error);
