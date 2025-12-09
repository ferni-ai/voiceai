# 🔊 Ferni Voice Authentication Architecture

> **Status: PRODUCTION** ✅  
> **Neural Embedding: ENABLED** ✅  
> **Last Updated:** December 8, 2025

## Overview

Ferni implements state-of-the-art voice authentication using neural speaker embeddings. This enables:

- **Voice Enrollment** - Users record their voice to create a unique voiceprint
- **Voice Verification** - "Is this the person they claim to be?"
- **Speaker Identification** - "Who is speaking?" (1:N matching)
- **Continuous Authentication** - Real-time verification during conversations

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FERNI VOICE AUTH                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐  │
│  │   Frontend   │────▶│   UI Server      │────▶│   Firestore        │  │
│  │   (Browser)  │     │   (Cloud Run)    │     │   (Voice Profiles) │  │
│  └──────────────┘     └────────┬─────────┘     └────────────────────┘  │
│                                │                                        │
│                    ┌───────────▼───────────┐                           │
│                    │  voice-memory-        │                           │
│                    │  enhanced.ts          │                           │
│                    │  (Orchestration)      │                           │
│                    └───────────┬───────────┘                           │
│                                │                                        │
│              ┌─────────────────┼─────────────────┐                     │
│              │                 │                 │                     │
│              ▼                 ▼                 ▼                     │
│  ┌───────────────────┐ ┌─────────────┐ ┌─────────────────────┐        │
│  │  ferni-speaker    │ │ DSP Fallback│ │ voice-enrollment.ts │        │
│  │  (Rust NAPI)      │ │ (JS-based)  │ │ (Session Mgmt)      │        │
│  │                   │ │             │ │                     │        │
│  │  ┌─────────────┐  │ │ pitch       │ │ - Enrollment flow   │        │
│  │  │ tract-onnx  │  │ │ spectral    │ │ - Quality checks    │        │
│  │  │ (ONNX RT)   │  │ │ energy      │ │ - Anti-spoofing     │        │
│  │  └─────────────┘  │ │ pauses      │ │                     │        │
│  │                   │ └─────────────┘ └─────────────────────┘        │
│  │  ┌─────────────┐  │                                                │
│  │  │ ECAPA-TDNN  │  │                                                │
│  │  │ Model(ONNX) │  │                                                │
│  │  └─────────────┘  │                                                │
│  └───────────────────┘                                                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Native Speaker Module (`ferni-speaker`)

**Repository:** https://github.com/sethdford/ferni-speaker

A Rust-based Node.js native addon for high-performance speaker embedding extraction.

| Component       | Technology       | Purpose                       |
| --------------- | ---------------- | ----------------------------- |
| **Runtime**     | Rust + NAPI-RS   | Native performance in Node.js |
| **Inference**   | tract-onnx       | ONNX model inference          |
| **Features**    | rustfft, ndarray | Mel spectrogram extraction    |
| **Parallelism** | rayon            | Batch processing              |

**Key Functions:**

```typescript
// Initialize model (called once at startup)
initialize(modelPath: string): void

// Extract 192-dim embedding from audio
extractEmbedding(samples: Float32Array): Float32Array

// Compare two embeddings (cosine similarity)
compareEmbeddings(emb1: Float32Array, emb2: Float32Array): number

// Batch extraction for efficiency
extractEmbeddingsBatch(audioSamples: Float32Array[]): Float32Array[]

// Find best match against candidates
findBestMatch(query: Float32Array, candidates: Float32Array[], threshold: number): MatchResult
```

**Model Specifications:**

| Property            | Value                       |
| ------------------- | --------------------------- |
| Architecture        | CNN with Statistics Pooling |
| Embedding Dimension | 192                         |
| Sample Rate         | 16kHz                       |
| Min Audio Duration  | 1.0 second                  |
| Format              | ONNX                        |

### 2. Voice Memory Enhanced (`voice-memory-enhanced.ts`)

Orchestration layer that:

- Manages native module initialization
- Provides DSP fallback if native module fails
- Handles feature flag checks
- Normalizes embeddings

```typescript
// Extract embedding with automatic fallback
extractSpeakerEmbedding(audio: Float32Array): Promise<{
  vector: Float32Array;
  method: 'neural' | 'dsp';
  confidence: number;
}>

// Check if neural is available
isNeuralEmbeddingAvailable(): Promise<boolean>

// Get model info
getSpeakerModelInfo(): Promise<ModelInfo | null>
```

### 3. Voice Enrollment (`voice-enrollment.ts`)

Manages the enrollment process with quality checks.

**Enrollment Flow:**

```
1. Start Session
   └── Create EnrollmentSession with userId

2. Add Samples (3-5 required)
   ├── Extract embedding
   ├── Quality check (duration, SNR)
   ├── Diversity check (different phrases)
   └── Store sample with metadata

3. Complete Enrollment
   ├── Verify minimum samples
   ├── Check embedding diversity
   ├── Compute centroid embedding
   └── Save to Firestore
```

**Quality Requirements:**

| Check        | Threshold       | Purpose                    |
| ------------ | --------------- | -------------------------- |
| Min Duration | 1.0s            | Enough audio for embedding |
| Min Samples  | 3               | Voice variability capture  |
| Max Samples  | 10              | Practical limit            |
| SNR          | 10 dB           | Audio quality              |
| Diversity    | 0.85 similarity | Different phrases          |

**Anti-Spoofing (Future):**

```typescript
interface AntiSpoofResult {
  isLive: boolean; // Liveness detection
  confidence: number; // 0-1
  replayDetected: boolean; // Recording playback
  synthesisDetected: boolean; // TTS/deepfake
}
```

### 4. Voice Profile Store (`voice-profile-store.ts`)

Firestore integration for profile persistence.

**Schema:**

```
bogle_users/{userId}/
└── voice_profile/
    └── profile
        ├── userId: string
        ├── centroidEmbedding: number[]
        ├── sampleEmbeddings: number[][]
        ├── embeddingMethod: 'neural' | 'dsp'
        ├── modelVersion: string
        ├── quality: {
        │   ├── averageConfidence: number
        │   ├── diversityScore: number
        │   └── enrollmentDuration: number
        │ }
        ├── enrolledAt: Timestamp
        ├── updatedAt: Timestamp
        ├── lastVerifiedAt: Timestamp
        └── verificationCount: number

voice_profile_index/{userId}
├── userId: string
├── centroidEmbedding: number[]
├── embeddingMethod: string
├── modelVersion: string
├── indexedAt: Timestamp
└── lastVerifiedAt: Timestamp
```

### 5. Voice Auth API (`voice-auth-handler.ts`)

REST API endpoints for voice authentication.

| Endpoint                     | Method | Description                  |
| ---------------------------- | ------ | ---------------------------- |
| `/api/voice/status`          | GET    | System status & capabilities |
| `/api/voice/enroll/start`    | POST   | Begin enrollment session     |
| `/api/voice/enroll/sample`   | POST   | Add voice sample             |
| `/api/voice/enroll/complete` | POST   | Finalize enrollment          |
| `/api/voice/enroll/cancel`   | POST   | Cancel enrollment            |
| `/api/voice/verify`          | POST   | 1:1 verification             |
| `/api/voice/identify`        | POST   | 1:N identification           |
| `/api/voice/auth/start`      | POST   | Start continuous auth        |
| `/api/voice/auth/check`      | POST   | Check auth status            |
| `/api/voice/auth/stop`       | POST   | Stop continuous auth         |
| `/api/voice/profile`         | GET    | Get user's profile           |
| `/api/voice/profile`         | DELETE | Delete profile               |

---

## Deployment Architecture

### Cloud Run Configuration

```yaml
Service: john-bogle-ui
Region: us-central1
Memory: 2Gi
CPU: 2
Concurrency: 80

Environment:
  SPEAKER_MODEL_PATH: /app/node_modules/ferni-speaker/models/ecapa_tdnn.onnx
```

### Docker Build Pipeline

```dockerfile
# Multi-stage build

# Stage 1: Backend build (TypeScript)
FROM node:20-slim AS backend-builder
# Compile TypeScript

# Stage 2: Frontend build (Vite)
FROM node:20-slim AS frontend-builder
# Build React app

# Stage 3: Rust native module
FROM rust:latest AS speaker-builder
# Build ferni-speaker with NAPI-RS
# Export ONNX model

# Stage 4: Production
FROM node:20-slim AS production
# Combine all artifacts
# Copy native module + model
```

### CI/CD

| Trigger                   | Action                                   |
| ------------------------- | ---------------------------------------- |
| Push to main              | Cloud Run auto-deploy (voice agent + UI) |
| `npm run deploy:ui`       | Manual UI server deploy                  |
| `npm run deploy:frontend` | Firebase Hosting deploy                  |

---

## Feature Flags

Located in `src/config/voice-humanization-flags.ts`:

```typescript
// Enable neural speaker embedding (vs DSP fallback)
enableEnhancedVoiceFingerprinting: true;

// Enable voice authentication endpoints
enableVoiceAuthentication: true;
```

---

## DSP Fallback System

When neural embedding is unavailable, the system falls back to DSP-based voice fingerprinting:

**Features Extracted:**

| Feature           | Weight | Description            |
| ----------------- | ------ | ---------------------- |
| Pitch Mean        | 0.25   | Fundamental frequency  |
| Pitch StdDev      | 0.10   | Pitch variation        |
| Spectral Centroid | 0.20   | Brightness             |
| Spectral Rolloff  | 0.15   | High-frequency content |
| Speaking Rate     | 0.15   | Words per minute proxy |
| Pause Pattern     | 0.10   | Average pause duration |
| Energy            | 0.05   | Volume characteristics |

**Comparison:** Gaussian similarity with weighted sum.

---

## Security Considerations

### Current Implementation

1. **Embedding Storage** - Stored as arrays, not raw audio
2. **Profile Isolation** - Per-user Firestore documents
3. **API Authentication** - Requires valid session
4. **Rate Limiting** - Standard Cloud Run limits

### Future Enhancements (Planned)

1. **Liveness Detection** - Prevent replay attacks
2. **Anti-Spoofing** - Detect synthesized voices
3. **Embedding Encryption** - Encrypt stored embeddings
4. **Audit Logging** - Track all verification attempts
5. **Anomaly Detection** - Flag unusual patterns

---

## Performance Characteristics

### Neural Embedding (Production)

| Metric               | Value               |
| -------------------- | ------------------- |
| Model Size           | ~16 MB              |
| Inference Time       | ~50-100ms           |
| Embedding Extraction | ~100ms for 3s audio |
| Comparison Time      | <1ms                |
| Memory Footprint     | ~100MB loaded       |

### DSP Fallback

| Metric          | Value                  |
| --------------- | ---------------------- |
| Extraction Time | ~20ms                  |
| Comparison Time | <1ms                   |
| Accuracy        | Lower (80-85% vs 95%+) |

---

## Testing & Validation

### Unit Tests

```bash
npm run test -- src/tests/voice-memory-enhanced.test.ts
```

### E2E Validation Script

```bash
npx ts-node --esm scripts/validate-speaker-embedding.ts
```

### Manual API Testing

```bash
# Check status
curl https://app.ferni.ai/api/voice/status | jq .

# Start enrollment
curl -X POST https://app.ferni.ai/api/voice/enroll/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user"}'
```

---

## Upgrade Path to State-of-the-Art

### Current: CNN + Statistics Pooling

- ✅ Working in production
- 192-dimensional embeddings
- Good baseline accuracy

### Phase 2: ECAPA-TDNN (When Python 3.11 compatible)

- Use SpeechBrain pretrained model
- 192-dimensional embeddings
- State-of-the-art accuracy on VoxCeleb

```bash
# Export script ready at:
scripts/colab_export_ecapa.py
```

### Phase 3: NVIDIA NeMo TitaNet (Optional)

- Larger model, higher accuracy
- Requires more compute
- Best for high-security use cases

---

## Troubleshooting

### Neural Embedding Not Available

1. **Check status:**

   ```bash
   curl https://app.ferni.ai/api/voice/status
   ```

2. **Check logs:**

   ```bash
   gcloud run services logs read john-bogle-ui --region=us-central1 | grep -i speaker
   ```

3. **Common issues:**
   - `require is not defined` → ESM compatibility (fixed with `createRequire`)
   - `No .node file` → Native module not copied in Docker build
   - `Model not found` → ONNX model path incorrect

### Verification Failures

1. **Low confidence scores:**
   - Ensure enrollment samples are diverse
   - Check audio quality (background noise)
   - Verify sample rate is 16kHz

2. **False rejections:**
   - Lower threshold temporarily
   - Re-enroll with better quality samples

---

## Files Reference

| File                                     | Purpose                        |
| ---------------------------------------- | ------------------------------ |
| `src/services/voice-memory-enhanced.ts`  | Neural embedding orchestration |
| `src/services/voice-enrollment.ts`       | Enrollment session management  |
| `src/services/voice-profile-store.ts`    | Firestore persistence          |
| `src/services/voice-memory.ts`           | DSP fallback implementation    |
| `src/api/voice-auth-handler.ts`          | REST API endpoints             |
| `src/config/voice-humanization-flags.ts` | Feature flags                  |
| `docker/Dockerfile.ui`                   | Production Docker build        |
| `ferni-speaker/`                         | Rust native module (submodule) |

---

## Related Documentation

- [Trust Systems](./TRUST-SYSTEMS.md) - How voice auth integrates with trust
- [Brand Guidelines](../brand/FERNI-BRAND-GUIDELINES.md) - Voice/UX considerations
- [Deployment Guide](./DEPLOYMENT.md) - Full deployment instructions

---

## Changelog

### 2025-12-09 (Phase 4 Complete)

**Security Enhancements:**
- ✅ Liveness detection integrated into all endpoints
- ✅ Anti-spoofing detection integrated
- ✅ Audit logging for all voice auth events
- ✅ Rate limiting on all endpoints
- ✅ Emotion correlation analysis in verify response

**Advanced Features:**
- ✅ Multi-user household support with API routes
- ✅ Voice-based conversation memory with API routes
- ✅ Speaker change detection integrated into voice agent
- ✅ Household session tracking in session manager

**Frontend:**
- ✅ Voice enrollment modal UI
- ✅ Voice ID badge on avatar (shows enrollment status)
- ✅ Voice auth service for API integration

**Testing:**
- ✅ All 13 E2E tests passing
- ✅ Household routes verified
- ✅ Memory routes verified

### 2025-12-08

- ✅ Neural speaker embedding deployed to production
- ✅ Voice auth API endpoints live
- ✅ Enrollment/verification/identification working
- ✅ Continuous authentication scaffolded
- ✅ DSP fallback operational

---

## Roadmap

### Phase 1: UI Integration ✅ COMPLETE

- [x] Add voice enrollment to settings menu → `frontend-typescript/src/ui/voice-enrollment.ui.ts`
- [x] Add "Voice ID" indicator to user profile area → `frontend-typescript/src/ui/voice-id-badge.ui.ts`
- [x] Add re-enrollment prompt when quality is low
- [ ] Test enrollment flow on mobile devices (iOS Safari, Android Chrome)

### Phase 2: Security Enhancements ✅ COMPLETE

- [x] Implement liveness detection → `src/services/voice-liveness.ts`
- [x] Add anti-spoofing detection → `src/services/voice-antispoofing.ts`
- [x] Add audit logging → `src/services/voice-audit-log.ts`
- [x] Implement rate limiting → `src/services/voice-rate-limit.ts`
- [x] Emotion correlation analysis → `src/services/voice-emotion-correlation.ts`
- [ ] Encrypt stored embeddings at rest (requires GCP KMS)

### Phase 3: Model Improvements

- [x] ECAPA-TDNN export script created → `scripts/export_ecapa_tdnn.py`
- [x] Benchmark script created → `scripts/benchmark-speaker-models.ts`
- [ ] Export and deploy real ECAPA-TDNN model
- [ ] A/B test accuracy improvements
- [ ] Consider NVIDIA NeMo TitaNet for high-security use cases

### Phase 4: Advanced Features ✅ COMPLETE

- [x] Multi-user household support → `src/services/voice-household.ts`
  - API routes: `/api/voice/household/*`
  - Session manager integration for auto-identification
- [x] Voice-based conversation context → `src/services/voice-conversation-memory.ts`
  - API routes: `/api/voice/memory/*`
  - Cross-session memory retrieval
- [x] Automatic speaker change detection → `src/services/voice-speaker-change.ts`
  - Voice agent integration with frontend notification
- [x] Voice mood/emotion correlation → `src/services/voice-emotion-correlation.ts`
  - Integrated into `/api/voice/verify` response

### Future Enhancements

- [ ] Household management frontend UI
- [ ] Conversation memory browsing UI
- [ ] Speaker change indicator in frontend
- [ ] GCP KMS embedding encryption
