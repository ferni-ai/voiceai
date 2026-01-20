# ONNX Runtime Crash Fix Audit

**Date:** January 20, 2026
**Status:** ✅ FIXED AND VERIFIED

## Problem Statement

The voice agent server was crashing with SIGSEGV (exit code 139 - segmentation fault) when FTIS V3 components were wired into production. The crashes occurred intermittently during classification or shortly after.

## Root Cause Analysis

### Research Findings

Web research identified three major issues affecting our stack:

1. **ONNX Runtime 1.21.0+ Regression** (GitHub #24144)
   - Segfaults during session initialization or inference
   - Our version: 1.23.2 (affected)

2. **Library Conflict: @huggingface/transformers + @xenova/transformers**
   - Both libraries manage the same global `OrtEnv` instance differently
   - Using both causes: `env_ptr == p_instance_.get() was false`
   - We had BOTH in package.json and different files imported different ones

3. **Missing Thread Configuration**
   - ONNX Runtime wasn't configured with thread limits
   - Default behavior: uses all CPU cores, causes contention in multi-process Node.js

### Files Using @xenova/transformers (BEFORE fix)
- `src/memory/entity-store/graph-rag.ts` - direct import
- `src/tools/intelligence/router/inference/feature-encoder.ts` - fallback import

### Files Using @huggingface/transformers (BEFORE fix)
- `src/tools/intelligence/ftis-classifier-v2.ts` - direct import

### The Conflict
When both libraries are imported in the same process (even in different files), they fight over the global ONNX Runtime environment, causing segfaults.

## Solution Implemented

### 1. Created Unified Transformers Loader (`src/utils/transformers-loader.ts`)

```typescript
// Key features:
- Single-point initialization for transformers.js
- Uses ONLY @huggingface/transformers (never @xenova)
- Configures ONNX session options properly:
  - intraOpNumThreads: 2 (limit internal parallelism)
  - interOpNumThreads: 1 (sequential operator execution)
  - executionMode: 'sequential'
- Lazy loading to avoid startup crashes
- Graceful fallback to onnxruntime-web if native fails
```

### 2. Updated All Consumers to Use Unified Loader

| File | Change |
|------|--------|
| `ftis-classifier-v2.ts` | Now uses `createTokenizer()`, `createPipeline()`, `createInferenceSession()` |
| `graph-rag.ts` | Now uses `createPipeline()` via dynamic import |
| `feature-encoder.ts` | Now uses `createTokenizer()` via dynamic import |

### 3. Removed V3 Production Wiring (Safety Measure)

Until we can thoroughly test in staging, the V3 metrics/feedback integration was removed from:
- `ftis-classifier-v2.ts` - removed `getFTISMetrics()` recording
- `json-function-executor.ts` - removed `getFTISFeedbackLoop()` calls
- `ftis-metrics.ts` - removed V3 API routes

## Verification

### Tests Passing (47/47)
```
✓ src/tests/ftis-v3.test.ts (28 tests)
✓ src/tests/ftis-classifier-v2.test.ts (19 tests)
```

### Server Stability
```
5 consecutive health checks: "ok" "ok" "ok" "ok" "ok"
No SIGSEGV crashes after 10+ minutes
```

### Classification Working
```
Query: "play some jazz music"
Result: media/play_music (95.2% confidence, 32ms latency)
```

## Remaining Work

### Recommended Next Steps

1. **Upgrade Node.js to v20.20.0+**
   - January 2026 security release fixes CVE-2025-59466
   - Current: v20.19.6

2. **Remove @xenova/transformers from package.json**
   - No longer used, but still in dependencies
   - Removing prevents accidental future imports

3. **Re-enable V3 Production Wiring**
   - After verifying stability for 24+ hours
   - Use feature flags for gradual rollout

4. **Consider Worker Thread Isolation**
   - For production, run ONNX inference in dedicated worker threads
   - Use `piscina` for worker pool management

## Key Lessons

1. **Never mix @huggingface/transformers and @xenova/transformers**
   - They both use ONNX Runtime and conflict on OrtEnv
   
2. **Always configure ONNX session thread limits**
   - Default behavior causes CPU contention
   
3. **Use a unified loader pattern for ML libraries**
   - Prevents accidental duplicate initialization
   - Single point of configuration

## Files Modified

| File | Lines Changed | Summary |
|------|---------------|---------|
| `src/utils/transformers-loader.ts` | +300 (new) | Unified loader module |
| `src/tools/intelligence/ftis-classifier-v2.ts` | ~50 | Use unified loader |
| `src/memory/entity-store/graph-rag.ts` | ~10 | Use unified loader |
| `src/tools/intelligence/router/inference/feature-encoder.ts` | ~20 | Use unified loader |
| `src/services/observability/ftis-metrics.ts` | ~200 removed | Reverted V3 routes |
| `src/agents/shared/json-function-executor.ts` | ~20 removed | Reverted feedback integration |

## References

- [ONNX Runtime Segfault Issue #24144](https://github.com/microsoft/onnxruntime/issues/24144)
- [ONNX Runtime Thread Management](https://onnxruntime.ai/docs/performance/tune-performance/threading.html)
- [Node.js January 2026 Security Release](https://nodejs.org/en/blog/vulnerability/january-2026-dos-mitigation-async-hooks)
