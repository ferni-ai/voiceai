# Semantic Tool Router

> State-of-the-art, provider-agnostic tool routing using semantic understanding.

The Semantic Tool Router decides which tools to invoke based on user input. It uses semantic understanding to pre-filter tools BEFORE the LLM, combining pattern matching, embedding similarity, and an ONNX ML classifier.

---

## Why Semantic Routing?

| LLM Function Calling | Semantic Router |
|---------------------|-----------------|
| Probabilistic output | Deterministic routing |
| Waits for LLM response | Pattern match + embedding (<30ms) |
| Provider-specific | Works with OpenAI, Gemini, Claude, local |
| Prompt bloat at 100+ tools | Scales to 200+ tools efficiently |
| Hard to debug | Clear confidence scores |

---

## Architecture

```
User Input
     |
     v
+---------------------------------------------+
|           SEMANTIC TOOL ROUTER              |
|---------------------------------------------|
| Layer 0: ONNX ML Model (99.5% acc, ~60ms)  | ← Qwen3-1.7B based
| Layer 1: Fast Pattern Matching (<1ms)       |
| Layer 2: Embedding Similarity (~10-30ms)    |
| Layer 3: Context-Aware Refinement           |
| Layer 4: Argument Extraction                |
+---------------------------------------------+
     |
     v
+---------------------------------------------+
|              DECISION ENGINE                |
|---------------------------------------------|
| High confidence (>0.85) -> Execute directly |
| Medium (0.5-0.85)       -> Hint to LLM      |
| Low (<0.5)              -> Conversation     |
+---------------------------------------------+
```

---

## Directory Structure

```
semantic-router/
├── # CORE ROUTING ────────────────────────────────────────────
├── index.ts                       # Main exports, router creation
├── types.ts                       # Type definitions (SemanticToolDefinition, etc.)
├── matcher.ts                     # Core matching algorithm
├── registry.ts                    # Tool registry, registration
├── router.ts                      # Router implementation
├── config.ts                      # Configuration & feature flags
├── compat.ts                      # Backward compatibility layer
│
├── # MATCHING & SCORING ──────────────────────────────────────
├── argument-extractor.ts          # Extract arguments from user input
├── capability-checker.ts          # Check tool capabilities
├── context-enrichment.ts          # Enrich context for better matching
├── domain-bridge.ts               # Bridge between domains
├── emotion-routing-boost.ts       # Emotional context boosting
├── trajectory-routing-boost.ts    # Trajectory-based boosting
├── holistic-layer.ts              # Holistic NLU context
├── multi-intent.ts                # Multi-intent detection
├── multi-intent-router.ts         # Route multiple intents
├── shared-vocabulary.ts           # Shared vocabulary for matching
├── voice-integration.ts           # Voice agent integration
│
├── # EMBEDDINGS ──────────────────────────────────────────────
├── embedding-providers.ts         # Embedding provider abstraction
├── embedding-worker-integration.ts # Worker thread integration
├── precomputed-embeddings.ts      # Precomputed embeddings for speed
│
├── # SUBDIRECTORIES ──────────────────────────────────────────
│
├── tool-definitions/              # Semantic tool definitions (by domain)
│   ├── index.ts
│   ├── calendar-tools.ts
│   ├── career-tools.ts
│   ├── communication-tools.ts
│   └── ...                        # One file per domain
│
├── advanced/                      # Advanced routing features
│   ├── index.ts
│   ├── active-learning.ts         # Active learning from user feedback
│   ├── audio-prosody-extractor.ts # Extract prosody for emotion routing
│   ├── better-than-human.ts       # Superhuman routing capabilities
│   ├── datasets.ts                # Training/evaluation datasets
│   ├── deep-context.ts            # Deep context analysis
│   ├── feedback-store.ts          # Routing feedback persistence
│   ├── learned-retriever.ts       # ML-enhanced retrieval
│   ├── learning-loop.ts           # Active learning loop
│   ├── ner-engine.ts              # Named entity recognition
│   ├── personalization.ts         # User-specific routing
│   ├── proactive-suggestions.ts   # Suggest tools proactively
│   ├── prosody-routing-integration.ts # Prosody → routing pipeline
│   ├── streaming-router.ts        # Streaming intent detection
│   ├── tool-chain-predictor.ts    # Predict tool chains
│   ├── tool-chains.ts             # Tool chain definitions
│   ├── uncertainty.ts             # Uncertainty estimation
│   ├── intelligent/               # ML-based intelligent routing
│   │   ├── onnx-classifier.ts     # ONNX classifier wrapper
│   │   ├── tool-intelligence.ts   # Tool intelligence system
│   │   └── explanation-generator.ts # Explainable routing
│   └── workers/                   # Worker threads
│       └── embedding-worker.ts    # Background embedding computation
│
├── defense/                       # Security & robustness
│   ├── index.ts
│   ├── anomaly-detector.ts        # Detect anomalous routing patterns
│   └── input-sanitizer.ts         # Sanitize inputs before routing
│
├── multi-intent/                  # Multi-intent processing
│   ├── index.ts
│   ├── intent-ranker.ts           # Rank competing intents
│   └── semantic-splitter.ts       # Split multi-intent utterances
│
├── learning/                      # Online learning & adaptation
│   ├── index.ts
│   ├── community-learning.ts      # Learn from all users (privacy-safe)
│   ├── correction-store.ts        # Store user corrections
│   ├── dynamic-strategy.ts        # Dynamic strategy selection
│   ├── implicit-correction-capture.ts # Capture implicit corrections
│   ├── online-learning-loop.ts    # Online learning loop
│   ├── retraining-pipeline.ts     # Model retraining pipeline
│   └── user-segmentation.ts       # User segment-based learning
│
├── integration/                   # Integration with other systems
│   ├── index.ts
│   ├── active-learning-integration.ts # Active learning hooks
│   ├── benchmarks.ts              # Integration benchmarks
│   ├── config.ts                  # Integration configuration
│   ├── init.ts                    # Initialization sequence
│   ├── intelligent-router-integration.ts # ML router integration
│   ├── metrics.ts                 # Routing metrics
│   ├── redis-cache.ts             # Redis caching layer
│   ├── routing-observability.ts   # Observability/tracing
│   ├── sota-integration.ts        # State-of-the-art model integration
│   ├── transcript-integration.ts  # Transcript processing
│   └── turn-processor-integration.ts # Turn processor hooks
│
├── persistence/                   # State persistence
│   ├── index.ts
│   ├── firestore-persistence.ts   # Firestore-backed persistence
│   └── tool-embedding-index.ts    # Embedding index storage
│
├── evaluation/                    # Evaluation & benchmarks
│   ├── index.ts
│   ├── benchmark-runner.ts        # Run benchmark suites
│   ├── metrics-calculator.ts      # Calculate routing metrics
│   ├── regression-detector.ts     # Detect routing regressions
│   ├── adversarial-runner.ts      # Adversarial test runner
│   ├── benchmark.json             # Benchmark dataset
│   ├── benchmark.schema.json      # Benchmark schema
│   ├── golden-dataset.json        # Golden test dataset
│   └── adversarial-dataset.json   # Adversarial test cases
│
├── analytics/                     # Routing analytics
│   ├── index.ts
│   └── routing-analytics.ts       # Track routing decisions
│
├── auto-convert/                  # Auto-convert legacy tools
│   ├── index.ts
│   └── tool-scanner.ts            # Scan and convert old tool formats
│
├── i18n/                          # Internationalization
│   ├── index.ts
│   ├── loader.ts                  # Locale loading
│   ├── multilingual.ts            # Multilingual routing
│   └── locales/                   # Locale-specific patterns
│
└── __tests__/                     # Tests
```

---

## ONNX ML Classifier (Layer 0)

The ONNX classifier uses a fine-tuned Qwen3-1.7B model:

| Metric | Value |
|--------|-------|
| Top-1 Accuracy | 98.0% |
| Top-3 Accuracy | 99.7% |
| Top-5 Accuracy | 99.9% |
| F1 Weighted | 0.980 |
| Latency | ~60-70ms |
| Labels | 861 (860 tools + __no_tool__) |
| Model | V5-860 (Qwen3-1.7B + LoRA) |

**Key Files:**
- `advanced/intelligent/onnx-classifier.ts` - ONNX classifier wrapper
- `apps/ml-training/router/` - Training pipeline
- `apps/rust-perf/src/onnx_router.rs` - Rust ONNX Runtime bindings

---

## Core Concepts

### SemanticToolDefinition

```typescript
interface SemanticToolDefinition {
  id: string;
  name: string;
  description: string;
  triggers: {
    phrases?: string[];       // Exact matches
    patterns?: RegExp[];      // Regex patterns
    keywords?: string[];      // Keyword boost
    antiKeywords?: string[];  // Negative signals
  };
  examples?: string[];        // Training examples
  embedding?: number[];       // Precomputed embedding
  arguments?: ToolArgument[];
  domain?: string;
}
```

### RouterAction Types

| Type | Confidence | Action |
|------|------------|--------|
| `execute` | > 0.85 | Execute tool directly |
| `confirm` | 0.7 - 0.85 | Ask user to confirm |
| `hint` | 0.5 - 0.7 | Pass hint to LLM |
| `conversation` | < 0.5 | Let LLM handle naturally |

---

## Usage

```typescript
import { createSemanticRouter, routeUserInput } from './semantic-router/index.js';

const router = createSemanticRouter();

const result = await routeUserInput("play some jazz music");

if (result.action.type === 'execute') {
  await executeToolDirectly(result.action.toolId, result.action.args);
} else if (result.action.type === 'hint') {
  const hint = result.action.hint; // Pass to LLM
}
```

---

## Performance

| Operation | Latency |
|-----------|---------|
| Pattern matching | < 1ms |
| Keyword scoring | 1-2ms |
| Embedding similarity | 10-30ms |
| ONNX classification | ~60-70ms |
| Full routing | < 50ms (without ONNX) |

---

## Testing

```bash
pnpm vitest run src/tools/semantic-router/__tests__/

# Evaluation benchmarks
pnpm vitest run src/tools/semantic-router/evaluation/
```

---

## Related Files

- `../CLAUDE.md` - Tools overview
- `../orchestrator/unified-tool-orchestrator.ts` - Orchestrator that uses router
- `../../agents/shared/json-function-executor.ts` - Fallback JSON execution
- `../gateway/` - Tool gateway (tiered loading)

---

*Last updated: January 2026*
