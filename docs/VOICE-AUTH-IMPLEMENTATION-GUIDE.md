# 🔊 Voice Authentication - Complete Implementation Guide

> **Purpose**: Step-by-step guide for implementing all voice authentication features.
> **Created**: December 9, 2025
> **Status**: In Progress

---

## Table of Contents

1. [Phase 0: Core Implementation](#phase-0-core-implementation-complete) ✅
2. [Phase 1: UI Integration](#phase-1-ui-integration)
3. [Phase 2: Security Enhancements](#phase-2-security-enhancements)
4. [Phase 3: Model Improvements](#phase-3-model-improvements)
5. [Phase 4: Advanced Features](#phase-4-advanced-features)
6. [Troubleshooting](#troubleshooting)
7. [API Reference](#api-reference)

---

## Phase 0: Core Implementation (COMPLETE) ✅

### What Was Built

| Component | File | Description |
|-----------|------|-------------|
| Neural Embedding | `src/services/voice-memory-enhanced.ts` | ECAPA-TDNN model via ferni-speaker native module |
| Enrollment Service | `src/services/voice-enrollment.ts` | Multi-sample enrollment with quality checks |
| Profile Store | `src/services/voice-profile-store.ts` | Firestore persistence + in-memory fallback |
| REST API | `src/api/voice-auth-handler.ts` | All /api/voice/* endpoints |
| Frontend Service | `frontend-typescript/src/services/voice-auth.service.ts` | Browser API client + audio recording |
| Enrollment UI | `frontend-typescript/src/ui/voice-enrollment.ui.ts` | Beautiful modal with progress visualization |
| E2E Tests | `scripts/validate-voice-auth.ts` | 13 comprehensive tests |

### Validation

```bash
# Run E2E tests
npx ts-node --esm scripts/validate-voice-auth.ts --url=http://localhost:3002

# Expected: 13/13 PASS
```

---

## Phase 1: UI Integration

### Task 1.1: Add Mic Icon to Settings Menu

**File**: `frontend-typescript/src/ui/settings-menu.ui.ts`

**Location**: Add to `ICONS` object (around line 62-80)

```typescript
// Add this to ICONS object:
mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
```

### Task 1.2: Add Voice Enrollment Callback Type

**File**: `frontend-typescript/src/ui/settings-menu.ui.ts`

**Location**: Add to `SettingsMenuUICallbacks` interface (around line 36-56)

```typescript
// Add to SettingsMenuUICallbacks:
onVoiceEnrollmentClick?: () => void;
```

### Task 1.3: Add Voice Enrollment Menu Item

**File**: `frontend-typescript/src/ui/settings-menu.ui.ts`

**Location**: In `createPanel()` method, add to "Customize" section

Find the section that contains "Link Spotify", "Create a Practice", etc. and add:

```typescript
// Add after "Link Spotify" or in a new "Security" section:
<button class="settings-item" data-action="voice-enrollment">
  <span class="settings-item-icon">${ICONS.mic}</span>
  <span class="settings-item-label">Voice ID</span>
  ${this.getVoiceEnrollmentBadge()}
</button>
```

Add helper method:

```typescript
private getVoiceEnrollmentBadge(): string {
  // Check if enrolled (could be async, simplify for now)
  return '<span class="settings-item-badge">New</span>';
}
```

### Task 1.4: Wire Up Click Handler

**File**: `frontend-typescript/src/ui/settings-menu.ui.ts`

**Location**: In `handleItemClick()` method

```typescript
case 'voice-enrollment':
  this.callbacks.onVoiceEnrollmentClick?.();
  this.hide();
  break;
```

### Task 1.5: Connect in App.ts

**File**: `frontend-typescript/src/app.ts`

**Location**: In `initSettingsMenuUI()` call

```typescript
this.safeInit('SettingsMenuUI', () => {
  initSettingsMenuUI({
    // ... existing callbacks ...
    onVoiceEnrollmentClick: () => void showVoiceEnrollmentModal(),
  });
});
```

### Task 1.6: Add Voice ID Badge to Header

**File**: `frontend-typescript/src/ui/coach.ui.ts` (or new component)

Create a small badge that shows when user is voice-enrolled:

```typescript
// Add near the avatar/header area
function showVoiceIdBadge(enrolled: boolean): void {
  const badge = document.querySelector('.voice-id-badge');
  if (badge) {
    badge.classList.toggle('voice-id-badge--active', enrolled);
  }
}
```

### Task 1.7: Auto Re-enrollment Prompt

**File**: `frontend-typescript/src/services/voice-auth.service.ts`

Add a method to check profile quality and prompt re-enrollment:

```typescript
async checkAndPromptReEnrollment(): Promise<void> {
  const profile = await this.getProfile();
  if (profile.enrolled && profile.needsReEnrollment) {
    // Dispatch event or show toast
    toast.info('Voice quality low - consider re-enrolling');
  }
}
```

### Task 1.8: Mobile Testing Checklist

**iOS Safari**:
- [ ] Microphone permission prompt appears
- [ ] Audio recording works
- [ ] Progress visualization animates
- [ ] Enrollment completes successfully
- [ ] Works in PWA mode

**Android Chrome**:
- [ ] Microphone permission prompt appears
- [ ] Audio recording works  
- [ ] Progress visualization animates
- [ ] Enrollment completes successfully
- [ ] Works when added to home screen

### Task 1.9: Deploy Frontend

```bash
# Deploy to both Firebase Hosting sites
npm run deploy:frontend

# Verify
curl https://app.ferni.ai/api/voice/status
```

---

## Phase 2: Security Enhancements ✅ IMPLEMENTED

### Task 2.1: Liveness Detection ✅

**File**: `src/services/voice-liveness.ts`

**Features implemented**:
- Challenge-Response: Random phrase verification with fuzzy matching
- Audio Artifacts: Dynamic range and silence ratio analysis
- Timing Analysis: Speech segment and pause variance detection
- Background Noise: Ambient noise characteristic analysis
- Breath Detection: Breathing pattern recognition

**Usage**:
```typescript
import { checkLiveness, generateChallenge, verifyChallenge } from './services/voice-liveness.js';

// Generate challenge
const challenge = generateChallenge(userId);
// Tell user to say: challenge.phrase

// Check liveness
const result = await checkLiveness(audio, sampleRate, {
  challengeId: challenge.challengeId,
  spokenText: transcribedText,
  userId,
});

if (!result.isLive) {
  // Reject - possible replay attack
  console.log('Warnings:', result.warnings);
}
```

### Task 2.2: Anti-Spoofing Detection ✅

**File**: `src/services/voice-antispoofing.ts`

**Features implemented**:
- Spectral Naturalness: Frame-to-frame variance analysis
- Pitch Variation (Jitter): Natural pitch perturbation detection
- Micro-Tremor (Shimmer): Amplitude perturbation analysis
- Formant Tracking: Natural formant transition detection
- Harmonic Structure: HNR (Harmonic-to-Noise Ratio) analysis

**Usage**:
```typescript
import { detectSpoofing } from './services/voice-antispoofing.js';

const result = detectSpoofing(audio, sampleRate);

if (!result.isAuthentic) {
  // Possible synthetic voice detected
  console.log('Spoof type:', result.spoofType); // 'tts', 'voice_conversion', 'replay', 'deepfake'
  console.log('Indicators:', result.indicators);
}
```

### Task 2.3: Embedding Encryption

**Status**: Pending - requires GCP KMS setup

**Implementation plan**:
1. Use Google Cloud KMS for key management
2. Encrypt embeddings with AES-256-GCM before storing
3. Store encrypted data with key version metadata
4. Decrypt on-demand during verification

### Task 2.4: Audit Logging ✅

**File**: `src/services/voice-audit-log.ts`

**Features implemented**:
- Event logging: All voice auth events with timestamps
- Firestore persistence: Automatic persistence with in-memory fallback
- Risk scoring: Automatic risk calculation per event
- Query API: Filter by user, action, date range
- Statistics: Success rates, anomaly counts, activity summaries
- Suspicious activity detection: Pattern analysis for security alerts

**Usage**:
```typescript
import { 
  logVerification, 
  logSpoofDetected,
  checkSuspiciousActivity,
  getAuditStats,
} from './services/voice-audit-log.js';

// Log verification
await logVerification(userId, success, confidence, deviceInfo);

// Log spoof detection
await logSpoofDetected(userId, 'tts', 0.3, ['High HNR', 'No jitter'], deviceInfo);

// Check for suspicious patterns
const suspicious = await checkSuspiciousActivity(userId);
if (suspicious.isSuspicious) {
  // Take protective action
}

// Get statistics
const stats = await getAuditStats(startDate, endDate);
```

### Task 2.5: Rate Limiting ✅

**File**: `src/services/voice-rate-limit.ts`

**Features implemented**:
- Per-endpoint limits: Configurable limits for each endpoint type
- User + IP tracking: Dual-layer protection
- Sliding window: Accurate request counting
- Automatic blocking: Temporary blocks after exceeded limits
- DDoS protection: Global IP-level rate limiting
- Headers: Standard rate limit headers (X-RateLimit-*)

**Rate Limits**:
| Endpoint | Requests/min | Block Duration |
|----------|-------------|----------------|
| verify | 10 | 5 minutes |
| identify | 5 | 5 minutes |
| enroll | 20 | 1 minute |
| profile | 5 | 1 minute |
| status | 30 | none |

**Usage**:
```typescript
import { checkRateLimit, createRateLimitMiddleware } from './services/voice-rate-limit.js';

// Check rate limit
const result = checkRateLimit(userId, 'verify', ipAddress);
if (!result.allowed) {
  return { error: 'Too many requests', retryAfterMs: result.retryAfterMs };
}

// Or use as middleware
const rateLimitMiddleware = createRateLimitMiddleware('verify');
if (!rateLimitMiddleware(req, res)) {
  return; // Response already sent
}
```

---

## Phase 3: Model Improvements

### Task 3.1: Export ECAPA-TDNN from SpeechBrain

**Purpose**: Use state-of-the-art speaker embedding model

**Script location**: `scripts/colab_export_ecapa.py`

```python
# Run in Google Colab (requires GPU)
from speechbrain.pretrained import EncoderClassifier

# Load pretrained ECAPA-TDNN
classifier = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb"
)

# Export to ONNX
import torch
dummy_input = torch.randn(1, 16000)  # 1 second at 16kHz
torch.onnx.export(
    classifier.mods.embedding_model,
    dummy_input,
    "ecapa_tdnn_speechbrain.onnx",
    input_names=['audio'],
    output_names=['embedding'],
    dynamic_axes={'audio': {1: 'length'}}
)
```

### Task 3.2: Update ferni-speaker Module

**Repository**: https://github.com/sethdford/ferni-speaker

1. Replace model file in `models/`
2. Update `src/lib.rs` if input/output shapes differ
3. Rebuild: `npm run build`
4. Test: `npm test`

### Task 3.3: Benchmark Models

**Script to create**: `scripts/benchmark-speaker-models.ts`

```typescript
/**
 * Benchmark speaker embedding models
 * 
 * Metrics:
 * - Equal Error Rate (EER)
 * - Processing time
 * - Memory usage
 */

interface BenchmarkResult {
  modelName: string;
  eer: number;           // Lower is better (target: <2%)
  avgProcessingMs: number;
  peakMemoryMb: number;
}
```

---

## Phase 4: Advanced Features

### Task 4.1: Multi-User Household Support

**Purpose**: Identify which family member is speaking

**Implementation**:

1. Allow multiple voice profiles per device
2. Auto-identify speaker at conversation start
3. Load appropriate conversation history

**Files to modify**:
- `voice-profile-store.ts` - Support multiple profiles
- `voice-auth-handler.ts` - Add household management endpoints
- New UI for managing household members

### Task 4.2: Voice-Based Conversation Memory

**Purpose**: "Remember when we talked about X?"

**Integration with existing systems**:
- Link voice verification to conversation tracker
- Tag conversations with verified user ID
- Enable cross-session context retrieval

### Task 4.3: Speaker Change Detection

**Purpose**: Detect when a different person starts speaking mid-conversation

**Implementation**: Use continuous authentication with lower threshold for alerts

```typescript
// In ContinuousAuthenticator
if (similarity < threshold * 0.7) {
  emit('speaker:changed', { previousUser, confidence });
}
```

### Task 4.4: Voice-Emotion Correlation

**Purpose**: Correlate voice characteristics with emotional state

**Integration**:
- Feed voice features to emotion detection
- Adjust Ferni responses based on detected mood
- Track emotional patterns over time

---

## Troubleshooting

### Common Issues

#### "Microphone permission denied"
- **iOS**: Settings → Safari → Microphone
- **Android**: Settings → Apps → Chrome → Permissions
- **Desktop**: Click lock icon in URL bar

#### "Audio too short for embedding"
- Minimum: 1 second of audio
- Ensure user is speaking (not silence)
- Check for audio input issues

#### "Neural embedding not available"
- Check if `ferni-speaker` is installed: `npm ls ferni-speaker`
- Check model path: `SPEAKER_MODEL_PATH` env var
- Falls back to DSP (lower accuracy but works)

#### "Firestore not available"
- Development: Uses in-memory cache (profiles lost on restart)
- Production: Check `GOOGLE_CLOUD_PROJECT` env var
- Verify Firebase Admin SDK initialized

#### "Verification always fails"
- Re-enroll with better audio quality
- Check quality score (should be >0.7)
- Ensure same device/microphone as enrollment

### Debug Commands

```bash
# Check voice auth status
curl http://localhost:3002/api/voice/status | jq .

# Check profile
curl -H "X-User-ID: test-user" http://localhost:3002/api/voice/profile | jq .

# Run validation tests
npx ts-node --esm scripts/validate-voice-auth.ts

# Check server logs
tail -f /path/to/ui-server.log | grep -i voice
```

---

## API Reference

### GET /api/voice/status
Returns system capabilities.

**Response**:
```json
{
  "status": "ok",
  "neuralEmbedding": true,
  "method": "neural",
  "features": {
    "enrollment": true,
    "verification": true,
    "identification": true,
    "continuousAuth": true
  }
}
```

### POST /api/voice/enroll/start
Start enrollment session.

**Headers**: `X-User-ID: <user_id>`

**Body**:
```json
{ "requiredSamples": 5 }
```

**Response**:
```json
{
  "success": true,
  "sessionId": "user-123",
  "requiredSamples": 5,
  "message": "Please provide 5 voice samples."
}
```

### POST /api/voice/enroll/sample
Submit voice sample.

**Headers**: `X-User-ID: <user_id>`

**Body**:
```json
{
  "samples": [0.1, -0.2, ...],  // Float32Array as JSON
  "deviceType": "ios"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Sample 2/5 collected. Good voice quality.",
  "progress": {
    "collected": 2,
    "required": 5,
    "quality": 0.85,
    "status": "collecting"
  }
}
```

### POST /api/voice/enroll/complete
Complete enrollment.

**Headers**: `X-User-ID: <user_id>`

**Body**:
```json
{ "displayName": "John" }
```

**Response**:
```json
{
  "success": true,
  "message": "Voice enrollment complete!",
  "profile": {
    "userId": "user-123",
    "displayName": "John",
    "qualityScore": 0.87,
    "threshold": 0.75,
    "sampleCount": 5
  }
}
```

### POST /api/voice/verify
Verify speaker against their profile.

**Headers**: `X-User-ID: <user_id>`

**Body**:
```json
{ "samples": [0.1, -0.2, ...] }
```

**Response**:
```json
{
  "verified": true,
  "confidence": 0.92,
  "processingTimeMs": 45,
  "details": {
    "threshold": 0.75,
    "similarity": 0.92,
    "method": "neural"
  }
}
```

### POST /api/voice/identify
Identify speaker from all enrolled users.

**Body**:
```json
{ "samples": [0.1, -0.2, ...] }
```

**Response**:
```json
{
  "identified": true,
  "userId": "user-123",
  "confidence": 0.89,
  "candidates": [
    { "userId": "user-123", "similarity": 0.89 },
    { "userId": "user-456", "similarity": 0.45 }
  ],
  "processingTimeMs": 120
}
```

### DELETE /api/voice/profile
Delete voice profile.

**Headers**: `X-User-ID: <user_id>`

**Response**:
```json
{
  "success": true,
  "message": "Profile deleted"
}
```

---

## Files Quick Reference

| Purpose | Path |
|---------|------|
| Neural Embedding | `src/services/voice-memory-enhanced.ts` |
| Enrollment Logic | `src/services/voice-enrollment.ts` |
| Profile Storage | `src/services/voice-profile-store.ts` |
| API Handler | `src/api/voice-auth-handler.ts` |
| Frontend Service | `frontend-typescript/src/services/voice-auth.service.ts` |
| Enrollment UI | `frontend-typescript/src/ui/voice-enrollment.ui.ts` |
| Settings Menu | `frontend-typescript/src/ui/settings-menu.ui.ts` |
| App Entry | `frontend-typescript/src/app.ts` |
| E2E Tests | `scripts/validate-voice-auth.ts` |
| This Guide | `docs/VOICE-AUTH-IMPLEMENTATION-GUIDE.md` |
| Architecture | `docs/VOICE-AUTHENTICATION.md` |

