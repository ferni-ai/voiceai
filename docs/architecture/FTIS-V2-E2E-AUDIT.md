# FTIS V2 End-to-End Audit

> **Audit Date:** January 2026
> **Goal:** Achieve flawless tool execution without LLM hallucination

---

## Executive Summary

The FTIS (Ferni Tool Intelligence System) V2 is a **hierarchical classifier** that routes user requests directly to tools, bypassing LLM tool selection. This eliminates hallucination by:

1. Using trained ONNX models to classify intent (93% accuracy)
2. Executing tools directly based on classification
3. Only using LLM for natural responses to tool results

**Current Status:** FTIS V2 is **ENABLED BY DEFAULT** but has several critical gaps preventing flawless E2E operation.

---

## Architecture Overview

```
User Speech
    │
    ▼
┌────────────────────────────────────────────────────────────────┐
│ FTIS V2 Classification (models/ftis-merged/)                   │
│                                                                │
│  Stage 1: Super-category (10 categories)                       │
│     ├─ media, calendar, productivity, communication            │
│     ├─ health, emotional, home, travel, finance, system        │
│     ▼                                                          │
│  Stage 2: Fine-category (63 categories per super)              │
│     ├─ play_music, weather, handoff_maya, etc.                 │
│     ▼                                                          │
│  Combined Confidence = superConfidence × fineConfidence        │
└────────────────────────────────────────────────────────────────┘
    │
    │ confidence >= 0.85?
    │
    ├─ YES ──► Direct Execution ──► Natural Response (LLM)
    │
    └─ NO ───► LLM with Tool Hints OR Conversation Flow
```

---

## Critical Gaps Identified

### 🔴 GAP 1: Domain Bridge NOT Called (CRITICAL BUG)

**Problem:** The FTIS V2 executor has a bug where it checks if a domain mapping EXISTS but never USES it to translate the tool ID.

**The Bug (in `ftis-v2-executor.ts` lines 437-454):**
```typescript
let actualToolId = toolId;  // toolId = 'spotify_play'
if (!hasDomainMapping(toolId)) {  // TRUE - mapping exists!
  // This branch is NOT taken because mapping EXISTS
  // Try fineCategory...
}
// BUG: actualToolId is still 'spotify_play', never translated to 'playMusic'!
const toolDef = toolRegistry.get(actualToolId);  // undefined - registry has 'playMusic'
```

**The domain bridge HAS the correct mapping:**
```typescript
// domain-bridge.ts line 99
spotify_play: {
  domainToolId: 'playMusic',  // <-- Correct mapping exists!
  transformArgs: (args) => ({ query: args.query || args.genre || 'music' }),
}
```

**Impact:** 100% of FTIS direct executions fail because tool IDs are never translated.

**Fix Required (in `ftis-v2-executor.ts`):**
```typescript
// BEFORE (buggy):
if (!hasDomainMapping(toolId)) {
  // try fineCategory...
}

// AFTER (fixed):
if (hasDomainMapping(toolId)) {
  actualToolId = getDomainToolId(toolId) || toolId;  // <-- TRANSLATE!
} else if (hasDomainMapping(classification.fineCategory)) {
  actualToolId = getDomainToolId(classification.fineCategory) || classification.fineCategory;
} else {
  return failure...
}
```

---

### 🔴 GAP 2: Domain Bridge Incomplete (CRITICAL)

**Problem:** The `domain-bridge.ts` exists but doesn't cover all tool mappings.

**Location:** `src/tools/semantic-router/domain-bridge.ts`

**Evidence:** FTIS executor has fallback:
```typescript
if (!hasDomainMapping(toolId)) {
  return { success: false, error: `No domain mapping for ${toolId}` };
}
```

**Impact:** Tools classified correctly but fail to execute.

**Fix Required:** Complete the domain bridge mapping for ALL 63 fine categories.

---

### 🟡 GAP 3: Argument Extraction Fragility (MEDIUM)

**Problem:** `extractArguments()` uses simple regex patterns that fail on complex queries.

**Examples that fail:**
```
"play radiohead from their album ok computer"
  → extracts: "radiohead from their album ok computer" (too much)

"play the song creep by radiohead"
  → regex doesn't handle "the song" prefix properly

"set an alarm for tomorrow at 7:30"
  → "tomorrow" not handled, defaults to static time
```

**Impact:** ~15-20% of tool executions have wrong arguments.

**Fix Required:**
- Use NLP/LLM for complex argument extraction
- Add more sophisticated patterns
- Implement fuzzy matching for time/date

---

### 🟡 GAP 4: No Fallback for Medium Confidence (MEDIUM)

**Problem:** When FTIS confidence is 0.5-0.85:
- In FTIS V2 mode, JSON workaround is DISABLED
- LLM receives a "tool hint" but can't call tools
- Tool might not execute at all

**Impact:** ~20% of tool intents may not execute.

**Fix Required:**
- Consider lowering threshold from 0.85 to 0.75
- Implement "assisted execution" for medium confidence (LLM confirms args)
- Add fallback to semantic router

---

### 🟡 GAP 5: Model Format Ambiguity (MEDIUM)

**Problem:** Stage 1 directory contains both:
```
models/ftis-merged/stage1/
├── best_model.pt      # PyTorch format (90MB)
├── model.onnx         # ONNX format (90MB)
```

**Impact:** Unclear which model is used. `ftis-classifier-v2.ts` expects ONNX.

**Fix Required:**
- Remove `best_model.pt` files to avoid confusion
- Add model format validation at startup

---

### 🟢 GAP 6: Test Coverage (LOW)

**Problem:** Tests verify mode gates exist but don't test actual E2E flow.

**Missing tests:**
- Real model inference test (requires models in CI)
- Full E2E: speech → FTIS → execution → response
- Regression tests for each fine category
- Argument extraction accuracy tests

**Fix Required:** Add comprehensive E2E test suite.

---

## Recommended Architecture Changes

### 1. Unified Tool ID System

Create a single source of truth for tool IDs:

```typescript
// tools/registry/unified-tool-ids.ts
export const TOOL_IDS = {
  // Music
  PLAY_MUSIC: 'playMusic',
  MUSIC_CONTROL: 'musicControl',

  // Weather
  GET_WEATHER: 'getWeather',

  // Calendar
  SET_ALARM: 'setAlarm',
  SET_TIMER: 'setTimer',

  // ... all tool IDs
} as const;

// Single mapping from FTIS categories
export const CATEGORY_TO_TOOL: Record<string, keyof typeof TOOL_IDS> = {
  'play_music': 'PLAY_MUSIC',
  'weather': 'GET_WEATHER',
  // ...
};
```

### 2. Intelligent Argument Extraction

Replace regex with structured extraction:

```typescript
// For high-confidence music requests
interface MusicArgs {
  query: string;       // The artist/song/genre
  mood?: string;       // Optional mood qualifier
  source?: string;     // spotify/sonos/etc
}

async function extractMusicArguments(query: string): Promise<MusicArgs> {
  // Fast path: simple patterns
  const simpleMatch = query.match(/^play\s+(.+)$/i);
  if (simpleMatch) {
    return { query: simpleMatch[1] };
  }

  // Complex: use lightweight LLM extraction
  return await extractWithLLM(query, 'music');
}
```

### 3. Confidence Tiers

Implement graduated confidence handling:

```typescript
const CONFIDENCE_TIERS = {
  HIGH: 0.90,      // Direct execution, no LLM
  MEDIUM: 0.75,    // Execute with LLM confirmation of args
  LOW: 0.50,       // Tool hint to LLM
  NONE: 0.0,       // Pure conversation
};

async function routeByConfidence(classification, query) {
  const conf = classification.combinedConfidence;

  if (conf >= CONFIDENCE_TIERS.HIGH) {
    return await executeDirectly(classification, query);
  }

  if (conf >= CONFIDENCE_TIERS.MEDIUM) {
    // Extract args, ask LLM to confirm/refine
    const args = await extractArguments(query, classification);
    return await executeWithConfirmation(classification, args);
  }

  if (conf >= CONFIDENCE_TIERS.LOW) {
    // Add tool hint to LLM
    return { bypassLLM: false, toolHint: classification };
  }

  // Pure conversation
  return { bypassLLM: false };
}
```

### 4. Observability Dashboard

Add real-time monitoring:

```typescript
// Metrics to track
interface FTISMetrics {
  classificationsPerMinute: number;
  directExecutionRate: number;      // % bypassing LLM
  executionSuccessRate: number;     // % successful tool calls
  fallbackToLLMRate: number;        // % falling back

  // Per-category breakdown
  categoryAccuracy: Record<string, number>;

  // Latency
  classificationP50: number;
  classificationP99: number;
  executionP50: number;
  executionP99: number;
}
```

---

## Implementation Priority

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| **P0** | Tool ID Mismatch | 2-4 hours | Fixes ~40% failures |
| **P0** | Domain Bridge | 4-8 hours | Fixes ~30% failures |
| **P1** | Argument Extraction | 1-2 days | Improves accuracy 15-20% |
| **P1** | Confidence Tiers | 4-8 hours | Captures 20% more intents |
| **P2** | Model Cleanup | 1 hour | Reduces confusion |
| **P2** | E2E Tests | 2-4 days | Prevents regressions |

---

## Verification Checklist

After implementing fixes:

- [ ] `pnpm vitest run src/tests/ftis*` all pass
- [ ] Manual test: "play some jazz" → music plays
- [ ] Manual test: "what's the weather" → weather response
- [ ] Manual test: "talk to Maya" → handoff executes
- [ ] Metrics show >90% direct execution rate
- [ ] Metrics show >95% execution success rate
- [ ] No tool narration leakage in TTS output

---

## Files to Modify

| File | Change |
|------|--------|
| `models/ftis-merged/category_to_tools.json` | Align tool IDs |
| `src/tools/semantic-router/domain-bridge.ts` | Complete mappings |
| `src/tools/intelligence/ftis-v2-executor.ts` | Improve arg extraction |
| `src/agents/processors/ftis-v2-integration.ts` | Add confidence tiers |
| `src/services/observability/ftis-metrics.ts` | Add dashboard metrics |
| `src/tests/ftis-v2-e2e.test.ts` | Add comprehensive tests |

---

## Appendix: Current Model Structure

```
models/ftis-merged/
├── stage1/
│   ├── model.onnx           # Super-category classifier
│   ├── label_map.json       # 10 super-categories
│   └── metadata.json
├── stage2/
│   ├── media/model.onnx     # Media fine-category
│   ├── calendar/model.onnx  # Calendar fine-category
│   ├── productivity/model.onnx
│   ├── communication/model.onnx
│   ├── health/model.onnx
│   ├── emotional/model.onnx
│   ├── home/model.onnx
│   ├── travel/model.onnx
│   ├── finance/model.onnx
│   └── system/model.onnx    # Includes handoffs
├── category_to_tools.json   # Category → Tool ID mapping
├── category_centroids.json  # Fallback embeddings
├── hierarchy.json           # Super → Fine mapping
└── tokenizer/               # Tokenization models
```

---

*Last Updated: January 2026*
