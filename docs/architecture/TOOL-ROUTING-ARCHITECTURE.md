# Tool Routing Architecture

> **Last Updated:** January 2026
>
> **Status:** Production-ready, all systems wired E2E

This document explains Ferni's tool routing architecture - how user requests get matched to the right tools.

---

## Architecture Overview

```
                              ┌─────────────────────────────────────┐
                              │         User Transcript             │
                              └─────────────────┬───────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           ▼                           │
                    │  ┌─────────────────────────────────────────────────┐  │
                    │  │           Unified Tool Orchestrator             │  │
                    │  │              (unified-tool-orchestrator.ts)     │  │
                    │  └─────────────────────────────────────────────────┘  │
                    │              │                        │               │
                    │              ▼                        ▼               │
                    │  ┌───────────────────┐    ┌──────────────────────┐   │
                    │  │ SOTA Pre-Routing  │    │ Unified Intelligence │   │
                    │  │ - Strategy select │    │ - Emotion-aware      │   │
                    │  │ - Prosody signals │    │ - Cross-persona      │   │
                    │  │ - Cold-start      │    │ - Proactive outreach │   │
                    │  └─────────┬─────────┘    └──────────┬───────────┘   │
                    │            │                         │               │
                    │            └────────────┬────────────┘               │
                    │                         ▼                            │
                    │  ┌─────────────────────────────────────────────────┐  │
                    │  │              FTIS Hybrid Router                 │  │
                    │  │         (tool-router.ts + tool-classifier.ts)  │  │
                    │  │                                                 │  │
                    │  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │  │
                    │  │  │ Pattern  │→ │ ML Model │→ │ Semantic Match│  │  │
                    │  │  │  <1ms    │  │  ~50ms   │  │    ~30ms      │  │  │
                    │  │  └──────────┘  └──────────┘  └───────────────┘  │  │
                    │  │                                                 │  │
                    │  │            Confidence Threshold                 │  │
                    │  │  ┌──────────────────────────────────────────┐   │  │
                    │  │  │ >0.85 = Execute  │ 0.5-0.85 = Verify     │   │  │
                    │  │  │ Fast Path (~50ms) │ LLM Path (~200-500ms) │   │  │
                    │  │  └──────────────────────────────────────────┘   │  │
                    │  └─────────────────────────────────────────────────┘  │
                    │                         │                            │
                    │                         ▼                            │
                    │  ┌─────────────────────────────────────────────────┐  │
                    │  │              Tool Registry (118 domains)       │  │
                    │  │         Dynamic loading, permission filtering   │  │
                    │  └─────────────────────────────────────────────────┘  │
                    │                         │                            │
                    └─────────────────────────┼────────────────────────────┘
                                              ▼
                              ┌─────────────────────────────────────┐
                              │         Tool Execution              │
                              │   (json-function-executor.ts)       │
                              └─────────────────────────────────────┘
```

---

## System Inventory

### Production Systems (Active)

| System | Location | Purpose | Latency |
|--------|----------|---------|---------|
| **Unified Tool Orchestrator** | `src/tools/orchestrator/unified-tool-orchestrator.ts` | Main entry point, combines all routing systems | <100ms total |
| **FTIS Hybrid Router** | `src/tools/intelligence/tool-router.ts` | Tiered routing (pattern → ML → semantic) | 50-200ms |
| **FTIS Classifier V2** | `src/tools/intelligence/tool-classifier.ts` | Qwen2.5-based tool classification | ~50ms |
| **Semantic Router** | `src/tools/semantic-router/` | Embedding-based matching + pattern rules | <30ms |
| **Unified Intelligence Layer** | `src/tools/intelligence/unified-intelligence-layer.ts` | "Better Than Human" enhancements | async |
| **SOTA Integration** | `src/tools/semantic-router/integration/sota-integration.ts` | Dynamic strategy, prosody, learning | async |
| **Memory-Aware Router** | `src/tools/memory-aware-router.ts` | User preference personalization | ~20ms |
| **Tool Registry** | `src/tools/registry/` | Central tool registration, lazy loading | <1ms |

### Deprecated/Removed Systems

| System | Status | Reason | Replacement |
|--------|--------|--------|-------------|
| **Pattern Router** | Removed Jan 2026 | Superseded by FTIS Hybrid | `tool-router.ts` |
| **Transcript Router** | Removed Jan 2026 | Merged into orchestrator | `unified-tool-orchestrator.ts` |
| **ONNX Router** | Removed Jan 2026 | Not needed, <50ms achieved without | Semantic Router |
| **Candle Router** | Removed Jan 2026 | Rust ML complexity not worth it | Semantic Router |
| **Unified ML Router** | Removed Jan 2026 | Abstraction over ONNX/Candle | Semantic Router |
| **FTIS Hierarchical V2** | Removed Jan 2026 | Python subprocess approach abandoned | `tool-classifier.ts` |

---

## Routing Tiers (FTIS Hybrid Router)

The FTIS Hybrid Router uses a tiered approach for optimal latency/accuracy:

### Tier 1: Pattern Matching (~1ms)

Pre-ML defense for common patterns:

```typescript
// Weather patterns
/do I need (a |an )?(jacket|umbrella|coat)/i  → weather tools

// News patterns
/give (me )?(the )?headlines/i  → news tools

// Open intent (conversational, no tool)
/what'?s? your favorite/i  → no tool execution
```

### Tier 2: ML Classification (~50ms)

Qwen2.5-based classifier for semantic understanding:

```typescript
const result = await classifier.classify(query);
// Returns: { toolId, confidence, category }
```

### Tier 3: Semantic Matching (~30ms)

Embedding similarity + keyword scoring:

```typescript
const matches = await semanticRouter.findMatches(query, {
  threshold: 0.5,
  maxResults: 10,
});
```

### Decision Logic

```typescript
if (confidence > 0.85) {
  // Fast Path: Execute directly
  return { tier: 'fast', execute: true };
} else if (confidence > 0.50) {
  // Verify Path: Add hint to LLM
  return { tier: 'verify', hint: toolId };
} else {
  // LLM Path: Let LLM decide
  return { tier: 'llm', tools: filteredSet };
}
```

---

## Integration Points

### 1. Unified Intelligence Layer

"Better Than Human" features that enhance routing:

```typescript
const enhancement = await intelligence.enhanceToolSelection(userId, {
  personaId: 'ferni',
  transcript: 'I am feeling really stressed',
  voiceEmotion: {
    primary: 'stress',
    valence: -0.6,
    arousal: 0.8,
    stressLevel: 0.9,
    anxietyMarkers: true,
  },
  previousPersonaId: 'maya',  // For cross-persona context
});

// Enhancement includes:
// - prioritizeTools: string[]     // Tools to prioritize
// - anticipatedTools: string[]    // Predicted next tools
// - emotionAwareBoosts: {...}     // Emotion-based adjustments
// - proactiveOutreach: {...}      // Outreach triggers
// - crossPersonaContext: {...}    // Handoff context
```

### 2. SOTA Pre-Routing

State-of-the-art features applied before routing:

```typescript
const sotaResult = await applySOTAPreRouting({
  userId,
  sessionId,
  personaId: 'ferni',
  inputText: query,
});

// Result includes:
// - strategy: { strategy: 'fast'|'balanced'|'accurate', confidence: 0.85 }
// - prosodyAdjustment: { ... }   // Voice-based adjustments
// - cohortPriors: { ... }        // For cold-start users
// - isColdStart: boolean
```

### 3. Cross-Persona Handoff Context

Records context when switching personas:

```typescript
await intelligence.recordHandoff({
  userId,
  sessionId,
  fromPersonaId: 'ferni',
  toPersonaId: 'maya',
  toolsUsed: ['mood_check'],
  topicsDiscussed: ['stress', 'wellness'],
  timestamp: new Date(),
});
```

### 4. Proactive Outreach Triggering

Automatically triggered based on patterns:

```typescript
if (enhancement.proactiveOutreach?.shouldTrigger) {
  await intelligence.triggerProactiveOutreach(userId, {
    type: 'habit_reminder' | 'check_in' | 'pattern_based',
    ...
  });
}
```

---

## Configuration

### Feature Flags

Located in `data/model-config.json`:

```json
{
  "toolDefaults": {
    "enabledDomains": [],        // Empty = all domains available
    "maxTools": 60,              // Max tools sent to LLM
    "includedTools": [...]       // Always-include tools
  }
}
```

### Confidence Thresholds

Configurable via FTIS calibration:

| Threshold | Value | Action |
|-----------|-------|--------|
| High confidence | > 0.85 | Direct execution |
| Medium confidence | 0.50 - 0.85 | LLM verification |
| Low confidence | < 0.50 | Full LLM routing |

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `FTIS_ENABLED` | Enable FTIS routing | `true` |
| `FTIS_V3_SERVER_URL` | External ML server (if used) | `localhost:8765` |
| `SEMANTIC_ROUTER_CACHE_TTL` | Cache duration | `300000` (5min) |

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Tool selection latency | < 100ms | ~80ms |
| High-confidence accuracy | > 95% | 98.5% |
| Pattern match latency | < 5ms | ~1ms |
| ML inference latency | < 100ms | ~50ms |
| Memory per 1000 tools | < 50MB | ~30MB |

---

## Testing

### E2E Tests

```bash
# Run tool routing E2E tests
pnpm vitest run src/tests/e2e/tool-routing-e2e.test.ts
```

### Test Coverage

| Area | Tests | Status |
|------|-------|--------|
| Unified Intelligence enhancement | 3 | ✅ |
| SOTA pre-routing | 3 | ✅ |
| Cross-persona handoff | 3 | ✅ |
| Proactive outreach | 1 | ✅ |
| Pattern matching edge cases | 2 | ✅ |
| Integration robustness | 3 | ✅ |

---

## Decision Log

### January 2026: ML Router Removal

**Decision:** Remove ONNX, Candle, and Unified ML routers.

**Rationale:**
- Current semantic router achieves <50ms latency without ML models
- GPU-accelerated routing adds deployment complexity
- FTIS Hybrid Router with Qwen2.5 provides sufficient accuracy (98.5%)

**Impact:** Simplified deployment, reduced dependencies.

### January 2026: Pattern Router Deprecation

**Decision:** Merge pattern routing into FTIS Hybrid Router.

**Rationale:**
- Pattern rules now live in `tool-router.ts`
- Single file for all tier-1 (fast path) routing
- Cleaner separation of concerns

### January 2026: Unified Intelligence Wiring

**Decision:** Wire all "Better Than Human" features into production.

**Features wired:**
- Emotion-aware tool boosting
- Cross-persona handoff context
- Proactive outreach triggering
- SOTA dynamic strategy selection

---

## Key Files

| File | Purpose |
|------|---------|
| `src/tools/orchestrator/unified-tool-orchestrator.ts` | Main orchestrator |
| `src/tools/intelligence/tool-router.ts` | FTIS Hybrid Router |
| `src/tools/intelligence/tool-classifier.ts` | ML classifier |
| `src/tools/intelligence/unified-intelligence-layer.ts` | "Better Than Human" |
| `src/tools/semantic-router/integration/sota-integration.ts` | SOTA features |
| `src/tools/semantic-router/integration/index.ts` | Integration exports |
| `src/agents/shared/handoff/event-handler.ts` | Handoff context recording |
| `src/tests/e2e/tool-routing-e2e.test.ts` | E2E test suite |

---

## Related Documentation

- `src/tools/CLAUDE.md` - Tool development guide
- `src/tools/semantic-router/CLAUDE.md` - Semantic router details
- `docs/architecture/AGENT-AGNOSTIC-ARCHITECTURE.md` - Agent architecture
- `docs/architecture/FUNCTION-CALLING-SYSTEM.md` - Function calling (Gemini workaround)
- `docs/architecture/TOOL-LOADING-SYSTEM.md` - How tools load into LLM

---

*This document was created during the January 2026 E2E audit to capture the complete tool routing architecture.*
