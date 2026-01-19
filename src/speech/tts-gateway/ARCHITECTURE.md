# TTS Gateway Architecture

## Overview (January 2026)

The TTS Gateway provides centralized text-to-speech processing with proper SSML handling, unified caching, and clean architecture.

## ✅ All Limitations Resolved

### Previously Identified Limitations

| Limitation | Status | Solution |
|------------|--------|----------|
| `session.say()` only accepts text | ✅ **Resolved** | `ttsNode()` returns AudioFrames directly |
| `CartesiaTTSProvider.synthesize()` never called | ✅ **Resolved** | Gateway TTS node calls provider directly |
| `LiveKitTrackSink` unused | ✅ **Documented** | Not needed - ttsNode handles frames |
| No cache hit latency savings | ✅ **Resolved** | Cache hits skip synthesis entirely |

### Key Insight

The `ttsNode()` method returns `ReadableStream<AudioFrame>`, not text. This means:
- We can return cached audio directly as frames (no TTS needed)
- Our gateway can fully replace LiveKit's internal Cartesia
- Full control over synthesis, caching, and latency

## Current Integration (Full Pipeline)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEXT FROM LLM                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │    Gateway TTS Node          │
                    │    (USE_TTS_GATEWAY=true)    │
                    └──────────────────┬───────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  │                  ▼
           ┌───────────────┐          │         ┌───────────────┐
           │ SSML Processor │          │         │ Collect Text  │
           │ Parse & Strip  │          │         │ from Stream   │
           └───────┬───────┘          │         └───────────────┘
                   │                   │
                   ▼                   │
           ┌───────────────┐          │
           │ Check Unified │          │
           │    Cache      │          │
           └───────┬───────┘          │
                   │                   │
           ┌───────┴───────┐          │
           │               │          │
     Cache HIT      Cache MISS        │
           │               │          │
           ▼               ▼          │
    ┌─────────────┐  ┌─────────────┐  │
    │ Return      │  │ Cartesia    │  │
    │ Cached      │  │ Provider    │  │
    │ Audio       │  │ synthesize()│  │
    └──────┬──────┘  └──────┬──────┘  │
           │                │         │
           │         ┌──────┴──────┐  │
           │         │  Store in   │  │
           │         │   Cache     │  │
           │         └──────┬──────┘  │
           │                │         │
           └────────┬───────┘         │
                    │                 │
                    ▼                 │
           ┌───────────────┐          │
           │ Split Audio   │          │
           │ into Frames   │          │
           └───────┬───────┘          │
                   │                  │
                   ▼                  │
           ┌───────────────┐          │
           │ AudioFrame    │◄─────────┘
           │ Stream        │
           └───────────────┘
                   │
                   ▼
              LiveKit Room
```

## Components

### Gateway TTS Node (`gateway-tts-node.ts`)

The full TTS replacement that:
1. Collects text from the input stream
2. Parses and strips SSML via `SSMLProcessor`
3. Checks unified cache (with legacy delegation)
4. On miss: Calls `CartesiaTTSProvider.synthesize()`
5. Caches the result
6. Converts audio to `AudioFrame` stream
7. Returns frames for LiveKit playback

```typescript
// When USE_TTS_GATEWAY=true, tts-wrapper.ts uses this:
const gatewayTTS = createGatewayTTSNode({
  voiceId: actualVoiceId,
  sessionId,
  personaId,
  emotion,
});
audioStream = await gatewayTTS(textStream);
```

### SSML Processor (Single Source of Truth)

All SSML processing goes through `SSMLProcessor`:

```typescript
// Used by ALL paths (no duplicates!)
const processor = getSSMLProcessor();
const result = processor.parse(textWithSSML);
// result.cleanText - SSML stripped
// result.prosody - {speed, volume, emotion}
// result.hadSSML - boolean
```

### Unified Cache Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                   Cache Check Order                      │
├─────────────────────────────────────────────────────────┤
│ 1. Unified TTSCache (gateway)      ← Prosody-aware      │
│ 2. Conversational Audio Cache      ← Pre-warmed phrases │
│ 3. Greeting Audio Cache            ← Pre-warmed greets  │
│ 4. Speculative TTS Cache           ← Predicted phrases  │
└─────────────────────────────────────────────────────────┘
```

### Cartesia Provider

Direct API calls with prosody support:

```typescript
const provider = getCartesiaProvider();
const audio = await provider.synthesize(cleanText, voiceId, {
  speed: 0.9,
  emotion: 'happy',
});
// Returns ArrayBuffer of PCM audio
```

## Observability

### API Endpoint

```bash
GET /api/observability/tts-gateway

# Response:
{
  "enabled": true,
  "gateway": {
    "totalRequests": 150,
    "cacheHits": 45,
    "cacheMisses": 105,
    "gatewaySyntheses": 105,
    "avgCacheHitLatencyMs": 12,
    "avgSynthesisLatencyMs": 287,
    "totalSavedLatencyMs": 12150,
    "errors": 2
  },
  "cache": {
    "lookups": 150,
    "hits": 45,
    "misses": 105,
    "hitRate": 0.30,
    "memoryBytes": 2458624
  },
  "summary": {
    "cacheHitRate": "30.0%",
    "avgLatencyMs": { "cacheHit": "12", "synthesis": "287" },
    "totalSavedLatencyMs": 12150,
    "errorRate": "1.3%"
  }
}
```

### Metrics Tracked

| Metric | Description |
|--------|-------------|
| `totalRequests` | Total TTS requests processed |
| `cacheHits` | Requests served from cache |
| `cacheMisses` | Requests requiring synthesis |
| `avgCacheHitLatencyMs` | Average cache hit latency |
| `avgSynthesisLatencyMs` | Average Cartesia synthesis time |
| `totalSavedLatencyMs` | Estimated latency saved by cache |
| `errors` | Failed synthesis attempts |

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `USE_TTS_GATEWAY` | **true** | Full gateway enabled by default. Set to `false` to disable. |
| `CACHE_AWARE_TTS_ENABLED` | true | Enable cache checking (fallback path) |

## Performance

| Scenario | Latency | Notes |
|----------|---------|-------|
| Cache hit | ~10-20ms | Direct frame conversion |
| Cache miss | ~250-350ms | Cartesia API + cache store |
| First request | ~300-400ms | Cold start + synthesis |

### Latency Savings

With 30% cache hit rate and 300ms avg synthesis time:
- **Per cache hit**: ~280ms saved
- **Per 100 requests**: ~8.4 seconds saved
- **Estimated monthly**: Hours of cumulative latency saved

## Files

```
src/speech/tts-gateway/
├── gateway-tts-node.ts    # FULL TTS replacement (new!)
├── gateway.ts             # TTSGateway class
├── index.ts               # Public API
├── types.ts               # Interfaces
├── ssml/processor.ts      # SSML (single source of truth)
├── providers/cartesia.ts  # Cartesia bytes API
├── sinks/                 # Audio output (documented, not primary)
└── __tests__/
    ├── gateway-tts-node.test.ts  # 12 tests (new!)
    ├── ssml-processor.test.ts    # 46 tests
    ├── tts-cache.test.ts         # 22 tests
    ├── gateway.test.ts           # 30 tests
    └── e2e-validation.test.ts    # 23 tests

src/services/tts/
└── tts-cache.ts           # Unified LRU cache

src/api/
└── observability-routes.ts  # /api/observability/tts-gateway
```

## Test Coverage

```
Total: 156 tests
├── gateway-tts-node.test.ts: 12 tests
├── ssml-processor.test.ts: 46 tests (1 skipped)
├── tts-cache.test.ts: 22 tests
├── gateway.test.ts: 30 tests
├── e2e-validation.test.ts: 23 tests
└── cartesia-ssml-buffering.test.ts: 23 tests
```

## Usage

### Enable Full Gateway

```bash
# .env
USE_TTS_GATEWAY=true
```

### In Voice Agent

```typescript
// tts-wrapper.ts automatically uses gateway when enabled:
if (isTTSGatewayEnabled()) {
  const gatewayTTS = createGatewayTTSNode({
    voiceId: actualVoiceId,
    sessionId,
    personaId,
    emotion,
  });
  audioStream = await gatewayTTS(trackedTextStream);
}
```

### Check Status

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://app.ferni.ai/api/observability/tts-gateway | jq
```

## Summary

The TTS Gateway is now a **complete solution** that:

1. ✅ **Prevents SSML from being spoken** - Single source processor
2. ✅ **Uses unified cache** - LRU with prosody-aware keys + legacy delegation  
3. ✅ **Calls Cartesia directly** - Bypasses LiveKit's internal TTS
4. ✅ **Returns audio frames** - Direct to LiveKit playback
5. ✅ **Has full observability** - API endpoint with metrics
6. ✅ **Is fully tested** - 156 tests covering all paths

Enable with `USE_TTS_GATEWAY=true` for full integration.
