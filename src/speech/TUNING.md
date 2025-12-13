# Speech Module Tuning Guide

> "We believe in making AI human, and the decisions we make will reflect that."

This guide covers configuration and tuning of the speech module for production environments.

## Table of Contents

- [Backchanneling Timing](#backchanneling-timing)
- [Emotion Detection](#emotion-detection)
- [Turn Prediction](#turn-prediction)
- [Voice Humanization](#voice-humanization)
- [FFT Analysis](#fft-analysis)
- [Performance Tuning](#performance-tuning)
- [Environment-Specific Settings](#environment-specific-settings)

---

## Backchanneling Timing

The backchanneling system has three modes with different timing profiles.

### Mode Selection

| Mode | Trigger Timing | Use Case |
|------|----------------|----------|
| `standard` | 5-8s silence | Conservative, general purpose |
| `enhanced` | 3-5s silence | More responsive, context-aware |
| `live` | Breath-pause based | Real-time during speech |
| `adaptive` | Auto-switches | Production recommended |

### Timing Constants

From `backchanneling/timing-config.ts`:

```typescript
// Standard mode
STANDARD_TIMING = {
  minSilenceMs: 5000,
  maxSilenceMs: 8000,
  cooldownMs: 10000,
}

// Enhanced mode
ENHANCED_TIMING = {
  minSilenceMs: 3000,
  maxSilenceMs: 5000,
  cooldownMs: 6000,
}

// Live mode
LIVE_TIMING = {
  minSilenceMs: 300,  // Breath pause detection
  maxSilenceMs: 1000,
  cooldownMs: 2000,
}
```

### Tuning Recommendations

- **High-latency networks**: Increase `minSilenceMs` by 500-1000ms
- **Fast talkers**: Decrease `minSilenceMs` by 500ms
- **Emotional conversations**: Use `enhanced` or `live` mode
- **Reduce interruptions**: Increase `cooldownMs`

---

## Emotion Detection

### Confidence Thresholds

From `audio-prosody/`:

| Threshold | Default | Description |
|-----------|---------|-------------|
| Minimum confidence | 0.5 | Report emotion if above |
| High confidence | 0.7 | Strong emotion signal |
| Stress threshold | 0.6 | Detect distress |

### Tuning Recommendations

- **Reduce false positives**: Increase minimum confidence to 0.6-0.7
- **Catch subtle emotions**: Decrease to 0.4 (higher false positive rate)
- **Noisy environments**: Increase thresholds by 0.1

### Prosody Feature Weights

```typescript
// VAD emotion mapping weights
WEIGHT_PITCH_VARIANCE = 0.3
WEIGHT_ENERGY_VARIANCE = 0.25
WEIGHT_SPEECH_RATE = 0.2
WEIGHT_PAUSE_PATTERNS = 0.25
```

---

## Turn Prediction

### Syntactic Completeness

From `enhanced-turn-prediction.ts`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `completionThreshold` | 0.7 | Probability to declare turn complete |
| `waitThreshold` | 0.3 | Probability to keep waiting |
| `minUtteranceMs` | 500 | Minimum utterance duration |

### Evidence Weights

```typescript
// Turn prediction evidence weights
WEIGHT_SYNTACTIC = 0.25    // Grammatical completeness
WEIGHT_PROSODIC = 0.30     // Pitch fall, pause
WEIGHT_SEMANTIC = 0.20     // Meaning completeness
WEIGHT_PRAGMATIC = 0.25    // Conversational cues
```

### Tuning Recommendations

- **Reduce interruptions**: Increase `completionThreshold` to 0.8
- **Faster responses**: Decrease to 0.6 (may interrupt more)
- **Deep conversations**: Increase `WEIGHT_PRAGMATIC`

---

## Voice Humanization

### Natural Filler Injection

From `advanced-humanization/fillers.ts`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `probability` | 0.12 | Chance of filler at injection point |
| `maxPerResponse` | 2 | Maximum fillers per response |

### Breath Group Pauses

From `advanced-humanization/breath-groups.ts`:

| Pause Type | Duration | Context |
|------------|----------|---------|
| Short | 120ms | Minor boundaries |
| Medium | 220ms | Clause boundaries |
| Long | 350ms | Sentence boundaries |

### Rhythm Variation

Speed ratios for natural delivery:

| Content Type | Speed Ratio |
|--------------|-------------|
| Normal | 1.0 |
| Important | 0.92 |
| Questions | 0.95 |
| Emotional | 0.90 |
| Lists/Examples | 1.05 |
| Conclusions | 0.93 |

---

## FFT Analysis

### Buffer Configuration

From `fft-analyzer/`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| Buffer size | 1024 | FFT window (power of 2) |
| Sample rate | 16000 | LiveKit default |
| Flux history | 10 | Frames for activity detection |

### Frequency Bands

| Band | Range (Hz) | Use |
|------|------------|-----|
| Sub-bass | 20-60 | Background rumble |
| Bass | 60-250 | Low vocals |
| Low-mid | 250-500 | Vocal fundamentals |
| Mid | 500-2000 | **Speech primary** |
| High-mid | 2000-4000 | **Speech harmonics** |
| Presence | 4000-6000 | Clarity |
| Brilliance | 6000-20000 | Air/sibilance |

### Environment Classification Thresholds

```typescript
SPEECH_THRESHOLD = 0.5    // Mid + high-mid energy
MUSIC_THRESHOLD = 0.4     // Bass + brilliance
QUIET_THRESHOLD = 0.3     // Inverse of all features
```

---

## Performance Tuning

### Latency Targets

| Operation | Target | Critical |
|-----------|--------|----------|
| Human listening (full) | < 100ms | ✓ |
| Human listening (quick) | < 10ms | ✓ |
| Dynamic speed calc | < 1ms | |
| Phrase boundary | < 0.5ms | |
| FFT analysis | < 5ms | ✓ |
| Session cleanup | < 50ms | |

### Memory Management

- **FFT caches**: Clear with `clearFFTCaches()` in long-running processes
- **Session cleanup**: Always call `cleanupSpeechSession()` on disconnect
- **Max prosody buffer**: 5 seconds of audio (O(n²) autocorrelation)

### CPU Optimization

```typescript
// Use quick analysis for real-time decisions
pipeline.quickAnalyze(context)  // < 10ms

// Use full analysis only at turn boundaries
pipeline.analyze(context)        // < 100ms
```

---

## Environment-Specific Settings

### Development

```typescript
// Enable verbose logging
const log = createLogger({ level: 'debug' });

// Use standard backchanneling (conservative)
const engine = getBackchannelEngine(sessionId, 'standard');
```

### Production

```typescript
// Use adaptive backchanneling
const engine = getBackchannelEngine(sessionId, 'adaptive');

// Higher emotion confidence threshold
const EMOTION_CONFIDENCE_MIN = 0.6;

// Enable metrics collection
recordLatency('operation', durationMs);
```

### High-Latency Networks (> 200ms RTT)

```typescript
// Increase silence thresholds
const adjustedTiming = {
  ...STANDARD_TIMING,
  minSilenceMs: STANDARD_TIMING.minSilenceMs + 500,
  maxSilenceMs: STANDARD_TIMING.maxSilenceMs + 500,
};

// Use standard mode instead of live
const engine = getBackchannelEngine(sessionId, 'standard');
```

### Mobile/Low-Power Devices

```typescript
// Skip FFT analysis
const skipFFT = true;

// Use quick analysis only
const result = await pipeline.quickAnalyze(context);

// Disable rhythm variation (saves CPU)
const humanized = humanizeText(text, { rhythmVariation: false });
```

---

## Monitoring & Debugging

### Key Metrics to Watch

```typescript
import { getSpeechMetricsSnapshot } from './metrics/index.js';

const snapshot = getSpeechMetricsSnapshot();
// {
//   latency: { avgAnalysisLatencyMs, p99LatencyMs },
//   quality: { avgEmotionConfidence, highConfidenceRate },
//   usage: { activeSessionCount, totalSessionsCreated },
// }
```

### Memory Leak Detection

```typescript
import { checkForLeaks, logModuleState } from './session-debug.js';

// Log current state
logModuleState();

// Check for orphaned services
const { hasIssues, issues } = checkForLeaks();
if (hasIssues) {
  console.warn('Potential leaks:', issues);
}
```

### Performance Benchmarks

Run the benchmark tests:

```bash
npm test -- --run src/speech/__tests__/performance-benchmarks.test.ts
```

---

## Quick Reference

### Session Lifecycle

```typescript
// Start
registerSpeechSession(sessionId);
trackSessionStart(sessionId);

// During conversation
const pipeline = getHumanListeningPipeline(sessionId);
const result = await pipeline.analyze(context);

// End
cleanupSpeechSession(sessionId, { reason: 'normal' });
cleanupSessionTracking(sessionId);
```

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Too many interruptions | Increase `completionThreshold` |
| Slow responses | Use `quickAnalyze()`, skip FFT |
| Memory growth | Check `cleanupSpeechSession` called |
| Wrong emotions | Increase confidence threshold |
| Robotic voice | Enable breath groups + fillers |
| Noisy environment false positives | Increase emotion thresholds |

