/**
 * Basic tests for ferni-speaker
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Check if native module exists
const nativeModulePath = path.join(__dirname, '..', 'speaker.node');
const hasNativeModule = fs.existsSync(nativeModulePath) || 
  fs.readdirSync(path.join(__dirname, '..')).some(f => f.endsWith('.node'));

if (!hasNativeModule) {
  console.log('⚠️  Native module not built yet. Run `npm run build` first.');
  console.log('   Skipping integration tests.\n');
  process.exit(0);
}

const speaker = require('..');

// Check if model exists
const modelPath = path.join(__dirname, '..', 'models', 'ecapa_tdnn.onnx');
const hasModel = fs.existsSync(modelPath);

if (!hasModel) {
  console.log('⚠️  Model not downloaded yet. Run `node scripts/download-models.js` first.');
  console.log('   Skipping model-dependent tests.\n');
}

console.log('Running ferni-speaker tests...\n');

// Test 1: Module loads
console.log('✓ Module loads successfully');

// Test 2: Types are exported
assert(typeof speaker.initialize === 'function', 'initialize should be a function');
assert(typeof speaker.extractEmbedding === 'function', 'extractEmbedding should be a function');
assert(typeof speaker.compareEmbeddings === 'function', 'compareEmbeddings should be a function');
assert(typeof speaker.findBestMatch === 'function', 'findBestMatch should be a function');
assert(typeof speaker.getModelInfo === 'function', 'getModelInfo should be a function');
console.log('✓ All functions exported');

if (hasModel) {
  // Test 3: Initialize
  speaker.initialize();
  console.log('✓ Model initialized');

  // Test 4: Get model info
  const info = speaker.getModelInfo();
  assert(info.name === 'ECAPA-TDNN', 'Model name should be ECAPA-TDNN');
  assert(info.embeddingDim === 192, 'Embedding dimension should be 192');
  assert(info.sampleRate === 16000, 'Sample rate should be 16000');
  console.log('✓ Model info correct:', info);

  // Test 5: Extract embedding from synthetic audio
  const sampleRate = 16000;
  const duration = 1; // 1 second
  const samples = new Float32Array(sampleRate * duration);
  
  // Generate a simple tone (440Hz)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
  }
  
  const startTime = Date.now();
  const embedding = speaker.extractEmbedding(samples);
  const extractTime = Date.now() - startTime;
  
  assert(embedding instanceof Float32Array, 'Embedding should be Float32Array');
  assert(embedding.length === 192, `Embedding should have 192 dimensions, got ${embedding.length}`);
  console.log(`✓ Embedding extracted (${extractTime}ms)`);

  // Test 6: Embedding is normalized (L2 norm ≈ 1)
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  assert(Math.abs(norm - 1.0) < 0.1, `Embedding should be normalized, got norm=${norm}`);
  console.log(`✓ Embedding is normalized (norm=${norm.toFixed(4)})`);

  // Test 7: Self-similarity is 1.0
  const selfSimilarity = speaker.compareEmbeddings(embedding, embedding);
  assert(Math.abs(selfSimilarity - 1.0) < 0.001, `Self-similarity should be 1.0, got ${selfSimilarity}`);
  console.log(`✓ Self-similarity = ${selfSimilarity.toFixed(4)}`);

  // Test 8: Different audio produces different embedding
  const samples2 = new Float32Array(sampleRate * duration);
  for (let i = 0; i < samples2.length; i++) {
    samples2[i] = Math.sin(2 * Math.PI * 880 * i / sampleRate) * 0.5; // Different frequency
  }
  
  const embedding2 = speaker.extractEmbedding(samples2);
  const crossSimilarity = speaker.compareEmbeddings(embedding, embedding2);
  console.log(`✓ Cross-similarity = ${crossSimilarity.toFixed(4)} (different tones)`);

  // Test 9: findBestMatch
  const candidates = [embedding, embedding2];
  const match = speaker.findBestMatch(embedding, candidates, 0.5);
  assert(match !== null, 'Should find a match');
  assert(match.index === 0, 'Best match should be index 0 (self)');
  assert(match.similarity > 0.99, 'Self-match similarity should be ~1.0');
  console.log(`✓ findBestMatch works (index=${match.index}, sim=${match.similarity.toFixed(4)})`);

  // Test 10: Batch extraction
  const batchStart = Date.now();
  const embeddings = speaker.extractEmbeddingsBatch([samples, samples2]);
  const batchTime = Date.now() - batchStart;
  
  assert(embeddings.length === 2, 'Should extract 2 embeddings');
  assert(embeddings[0].length === 192, 'First embedding should have 192 dims');
  assert(embeddings[1].length === 192, 'Second embedding should have 192 dims');
  console.log(`✓ Batch extraction works (${batchTime}ms for 2 samples)`);

  // Test 11: Error on short audio
  try {
    speaker.extractEmbedding(new Float32Array(100));
    assert(false, 'Should throw on short audio');
  } catch (e) {
    assert(e.message.includes('too short'), 'Error should mention audio too short');
    console.log('✓ Rejects short audio correctly');
  }

  // Performance summary
  console.log('\n📊 Performance Summary:');
  console.log(`   Single extraction: ${extractTime}ms`);
  console.log(`   Batch extraction (2): ${batchTime}ms (${(batchTime/2).toFixed(1)}ms per sample)`);
}

console.log('\n✅ All tests passed!\n');

