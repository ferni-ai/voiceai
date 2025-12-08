# ferni-speaker 🎙️

High-performance speaker embedding extraction using **ECAPA-TDNN** in Rust with Node.js bindings.

Extract 192-dimensional speaker embeddings from audio in **5-15ms** - ideal for real-time voice recognition applications.

## Features

- 🚀 **Fast**: Native Rust performance via NAPI (5-15ms per embedding)
- 🎯 **Accurate**: ECAPA-TDNN achieves ~1% EER on VoxCeleb
- 🔧 **Simple API**: Just `extractEmbedding()` and `compareEmbeddings()`
- 📦 **Zero config**: Model auto-downloads on install
- 🖥️ **Cross-platform**: macOS, Linux, Windows (x64 & ARM64)

## Installation

```bash
npm install ferni-speaker
```

The ECAPA-TDNN model (~30MB) downloads automatically after install.

## Quick Start

```typescript
import * as speaker from 'ferni-speaker';

// Extract embedding from audio (16kHz mono Float32Array)
const embedding = speaker.extractEmbedding(audioSamples);

// Compare two embeddings
const similarity = speaker.compareEmbeddings(emb1, emb2);

if (similarity > 0.7) {
  console.log('Same speaker!');
}
```

## API Reference

### `initialize(modelPath?: string): void`

Initialize the speaker embedding model. Called automatically on first use.

```typescript
// Use custom model path
speaker.initialize('/path/to/custom-model.onnx');
```

### `extractEmbedding(samples: Float32Array): Float32Array`

Extract a 192-dimensional speaker embedding from audio samples.

- **Input**: 16kHz mono audio as Float32Array (min 0.5 seconds)
- **Output**: L2-normalized 192-dimensional embedding

```typescript
const audio = new Float32Array(16000); // 1 second of audio
const embedding = speaker.extractEmbedding(audio);
console.log(embedding.length); // 192
```

### `compareEmbeddings(emb1: Float32Array, emb2: Float32Array): number`

Compare two embeddings using cosine similarity.

- **Returns**: Similarity score between 0 and 1

```typescript
const similarity = speaker.compareEmbeddings(emb1, emb2);
// > 0.7 typically indicates same speaker
// < 0.3 typically indicates different speakers
```

### `extractEmbeddingsBatch(samplesList: Float32Array[]): Float32Array[]`

Extract embeddings from multiple audio samples in parallel.

```typescript
const embeddings = speaker.extractEmbeddingsBatch([audio1, audio2, audio3]);
```

### `findBestMatch(query, candidates, threshold?): MatchResult | null`

Find the best matching embedding from a list of candidates.

```typescript
const match = speaker.findBestMatch(queryEmbedding, storedEmbeddings, 0.6);
if (match) {
  console.log(`Match found at index ${match.index} with ${match.similarity} similarity`);
}
```

### `findAllMatches(query, candidates, threshold): MatchResult[]`

Find all embeddings above a similarity threshold.

```typescript
const matches = speaker.findAllMatches(queryEmbedding, storedEmbeddings, 0.5);
matches.forEach((m) => console.log(`Index ${m.index}: ${m.similarity}`));
```

### `getModelInfo(): ModelInfo`

Get information about the loaded model.

```typescript
const info = speaker.getModelInfo();
// { name: 'ECAPA-TDNN', embeddingDim: 192, sampleRate: 16000, minSamples: 8000 }
```

## Audio Requirements

| Parameter    | Value       |
| ------------ | ----------- |
| Sample Rate  | 16,000 Hz   |
| Channels     | Mono        |
| Format       | Float32     |
| Min Duration | 0.5 seconds |

### Converting Audio

```typescript
// From WebAudio API
const audioContext = new AudioContext({ sampleRate: 16000 });
const buffer = await audioContext.decodeAudioData(arrayBuffer);
const samples = buffer.getChannelData(0); // Float32Array

// Pass directly to extractEmbedding
const embedding = speaker.extractEmbedding(samples);
```

## Performance

| Operation           | Time    |
| ------------------- | ------- |
| Model load          | ~500ms  |
| Extract embedding   | 5-15ms  |
| Compare embeddings  | <0.1ms  |
| Batch (10 samples)  | 50-80ms |

## Accuracy

Tested on VoxCeleb1:

| Metric | Value |
| ------ | ----- |
| EER    | ~1.0% |
| minDCF | ~0.08 |

## Development

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Platform-specific build tools (Xcode on macOS, build-essential on Linux, VS Build Tools on Windows)

### Building

```bash
# Clone
git clone https://github.com/sethdford/ferni-speaker.git
cd ferni-speaker

# Install deps
npm install

# Build native module
npm run build

# Run tests
npm test
```

### Project Structure

```
ferni-speaker/
├── src/
│   ├── lib.rs          # NAPI exports
│   ├── embedding.rs    # ECAPA-TDNN inference
│   ├── mel.rs          # Mel spectrogram
│   ├── audio.rs        # Preprocessing
│   └── similarity.rs   # Comparison functions
├── scripts/
│   └── download-models.js
├── index.js            # JS wrapper
├── index.d.ts          # TypeScript types
├── Cargo.toml
└── package.json
```

## Model

This package uses [ECAPA-TDNN](https://arxiv.org/abs/2005.07143) trained on [VoxCeleb](https://www.robots.ox.ac.uk/~vgg/data/voxceleb/) via [SpeechBrain](https://speechbrain.github.io/).

## License

MIT © [Ferni AI](https://ferni.ai)

## Related

- [SpeechBrain](https://speechbrain.github.io/) - PyTorch speech toolkit
- [tract](https://github.com/sonos/tract) - Rust ONNX runtime
- [napi-rs](https://napi.rs/) - Rust Node.js bindings

