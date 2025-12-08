#!/usr/bin/env node

/**
 * Download ECAPA-TDNN speaker embedding model.
 *
 * This script runs automatically after npm install.
 * The model is ~30MB and trained on VoxCeleb for speaker verification.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

// Model source - using SpeechBrain's pretrained ECAPA-TDNN
// Converted to ONNX format
const MODEL_URL =
  process.env.FERNI_SPEAKER_MODEL_URL ||
  'https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/resolve/main/embedding_model.onnx';

const MODEL_DIR = path.join(__dirname, '..', 'models');
const MODEL_PATH = path.join(MODEL_DIR, 'ecapa_tdnn.onnx');

// Expected SHA256 hash (update when model changes)
const EXPECTED_HASH = process.env.FERNI_SPEAKER_MODEL_HASH || null;

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        console.log(`Following redirect to: ${redirectUrl}`);
        file.close();
        fs.unlinkSync(dest);
        downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      let lastPercent = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = Math.floor((downloadedSize / totalSize) * 100);
        if (percent !== lastPercent && percent % 10 === 0) {
          console.log(`  Progress: ${percent}%`);
          lastPercent = percent;
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });

    request.setTimeout(60000, () => {
      request.abort();
      reject(new Error('Download timed out'));
    });
  });
}

function computeHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function main() {
  // Skip in CI if model URL not set
  if (process.env.CI && !process.env.FERNI_SPEAKER_MODEL_URL) {
    console.log('Skipping model download in CI (no FERNI_SPEAKER_MODEL_URL set)');
    return;
  }

  // Check if model already exists
  if (fs.existsSync(MODEL_PATH)) {
    const stats = fs.statSync(MODEL_PATH);
    if (stats.size > 10 * 1024 * 1024) {
      // > 10MB seems valid
      console.log('Model already exists at', MODEL_PATH);

      // Verify hash if expected hash is set
      if (EXPECTED_HASH) {
        const actualHash = await computeHash(MODEL_PATH);
        if (actualHash === EXPECTED_HASH) {
          console.log('Model hash verified');
          return;
        } else {
          console.log('Model hash mismatch, re-downloading...');
          fs.unlinkSync(MODEL_PATH);
        }
      } else {
        return;
      }
    } else {
      console.log('Existing model file is too small, re-downloading...');
      fs.unlinkSync(MODEL_PATH);
    }
  }

  // Create models directory
  fs.mkdirSync(MODEL_DIR, { recursive: true });

  console.log('Downloading ECAPA-TDNN speaker embedding model...');
  console.log(`  From: ${MODEL_URL}`);
  console.log(`  To: ${MODEL_PATH}`);

  try {
    await downloadFile(MODEL_URL, MODEL_PATH);
    console.log('Download complete!');

    // Verify download
    const stats = fs.statSync(MODEL_PATH);
    console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Verify hash if set
    if (EXPECTED_HASH) {
      const actualHash = await computeHash(MODEL_PATH);
      if (actualHash !== EXPECTED_HASH) {
        throw new Error(`Hash mismatch! Expected ${EXPECTED_HASH}, got ${actualHash}`);
      }
      console.log('  Hash: verified');
    }

    console.log('Model ready for use');
  } catch (error) {
    console.error('Failed to download model:', error.message);
    console.error('');
    console.error('You can manually download the model:');
    console.error(`  curl -L "${MODEL_URL}" -o "${MODEL_PATH}"`);
    console.error('');
    console.error('Or set FERNI_SPEAKER_MODEL_URL to a custom model location.');
    process.exit(1);
  }
}

main().catch(console.error);

