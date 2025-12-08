/**
 * ferni-speaker - High-performance speaker embedding extraction
 *
 * This module provides native Node.js bindings for speaker embedding
 * extraction using ECAPA-TDNN model via Rust/NAPI.
 */

const { existsSync } = require('fs');
const { join } = require('path');

// Platform-specific binary loading
const PLATFORMS = {
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
  'linux-x64': 'linux-x64-gnu',
  'linux-arm64': 'linux-arm64-gnu',
  'win32-x64': 'win32-x64-msvc',
};

function loadNativeModule() {
  const platformKey = `${process.platform}-${process.arch}`;
  const platformDir = PLATFORMS[platformKey];

  if (!platformDir) {
    throw new Error(`Unsupported platform: ${platformKey}`);
  }

  // Try loading from various locations
  const locations = [
    // Local development build
    join(__dirname, `speaker.${platformKey}.node`),
    // npm package structure
    join(__dirname, `@ferni-speaker/speaker.${platformDir}.node`),
    // Fallback to generic
    join(__dirname, 'speaker.node'),
  ];

  for (const location of locations) {
    if (existsSync(location)) {
      return require(location);
    }
  }

  // Try loading as if installed via npm (napi-rs style)
  try {
    return require(`@ferni-speaker/speaker-${platformDir}`);
  } catch (e) {
    // Fallback to direct require
    return require('./speaker.node');
  }
}

let native;

try {
  native = loadNativeModule();
} catch (e) {
  console.error('Failed to load ferni-speaker native module:', e.message);
  console.error('Make sure you have built the native module: npm run build');
  throw e;
}

// Default model path
const DEFAULT_MODEL_PATH = join(__dirname, 'models', 'ecapa_tdnn.onnx');

/**
 * Initialize the speaker embedding model.
 * @param {string} [modelPath] - Path to ONNX model (uses default if not provided)
 */
function initialize(modelPath) {
  const path = modelPath || DEFAULT_MODEL_PATH;
  if (!existsSync(path)) {
    throw new Error(`Model not found at ${path}. Run 'npm run postinstall' to download.`);
  }
  return native.initialize(path);
}

/**
 * Auto-initialize with default model if not already initialized.
 */
function ensureInitialized() {
  if (!native.isInitialized()) {
    initialize();
  }
}

/**
 * Extract speaker embedding from audio.
 * @param {Float32Array} samples - Audio samples (16kHz mono)
 * @returns {Float32Array} - 192-dimensional embedding
 */
function extractEmbedding(samples) {
  ensureInitialized();
  return native.extractEmbedding(samples);
}

/**
 * Compare two embeddings.
 * @param {Float32Array} emb1
 * @param {Float32Array} emb2
 * @returns {number} - Similarity score (0-1)
 */
function compareEmbeddings(emb1, emb2) {
  return native.compareEmbeddings(emb1, emb2);
}

/**
 * Extract embeddings from multiple audio samples.
 * @param {Float32Array[]} samplesList
 * @returns {Float32Array[]}
 */
function extractEmbeddingsBatch(samplesList) {
  ensureInitialized();
  return native.extractEmbeddingsBatch(samplesList);
}

/**
 * Find best match from candidates.
 * @param {Float32Array} query
 * @param {Float32Array[]} candidates
 * @param {number} [threshold=0.5]
 * @returns {{index: number, similarity: number} | null}
 */
function findBestMatch(query, candidates, threshold = 0.5) {
  return native.findBestMatch(query, candidates, threshold);
}

/**
 * Find all matches above threshold.
 * @param {Float32Array} query
 * @param {Float32Array[]} candidates
 * @param {number} threshold
 * @returns {{index: number, similarity: number}[]}
 */
function findAllMatches(query, candidates, threshold) {
  return native.findAllMatches(query, candidates, threshold);
}

/**
 * Get model info.
 * @returns {{name: string, embeddingDim: number, sampleRate: number, minSamples: number}}
 */
function getModelInfo() {
  ensureInitialized();
  return native.getModelInfo();
}

/**
 * Compute similarity matrix.
 * @param {Float32Array[]} embeddings1
 * @param {Float32Array[]} embeddings2
 * @returns {Float32Array}
 */
function computeSimilarityMatrix(embeddings1, embeddings2) {
  return native.computeSimilarityMatrix(embeddings1, embeddings2);
}

/**
 * Check if model is initialized.
 * @returns {boolean}
 */
function isInitialized() {
  return native.isInitialized();
}

module.exports = {
  initialize,
  isInitialized,
  extractEmbedding,
  compareEmbeddings,
  extractEmbeddingsBatch,
  findBestMatch,
  findAllMatches,
  getModelInfo,
  computeSimilarityMatrix,
  DEFAULT_MODEL_PATH,
};

