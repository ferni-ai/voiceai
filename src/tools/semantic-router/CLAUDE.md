# Semantic Tool Router

> **State-of-the-art, provider-agnostic tool routing using semantic understanding**

The Semantic Tool Router is the core system that decides which tools to invoke based on user input. Instead of relying on unreliable LLM function calling, it uses semantic understanding to route requests BEFORE the LLM.

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
├── index.ts                    # Main exports, router creation
├── types.ts                    # Type definitions (SemanticToolDefinition, etc.)
├── matcher.ts                  # Core matching algorithm
├── registry.ts                 # Tool registry, registration
├── config.ts                   # Configuration & feature flags
├── compat.ts                   # Backward compatibility layer
│
├── # MATCHING & SCORING ──────────────────────────────────────
├── argument-extractor.ts       # Extract arguments from user input
├── capability-checker.ts       # Check tool capabilities
├── context-enrichment.ts       # Enrich context for better matching
├── domain-bridge.ts            # Bridge between domains
├── emotion-routing-boost.ts    # Emotional context boosting
├── holistic-layer.ts           # Holistic NLU context
├── multi-intent.ts             # Multi-intent detection
├── multi-intent-router.ts      # Route multiple intents
│
├── # EMBEDDINGS ──────────────────────────────────────────────
├── embedding-providers.ts      # Embedding provider abstraction
├── embedding-worker-integration.ts # Worker integration
├── precomputed-embeddings.ts   # Precomputed embeddings for speed
│
├── # SUBDIRECTORIES ──────────────────────────────────────────
│
├── tool-definitions/           # 128 tool semantic definitions
│   ├── index.ts               # Main exports
│   ├── calendar-tools.ts      # Calendar tool definitions
│   ├── career-tools.ts        # Career tool definitions
│   ├── communication-tools.ts # Communication definitions
│   ├── finance-tools.ts       # Finance definitions
│   ├── habits-tools.ts        # Habit tracking definitions
│   ├── information-tools.ts   # Information/search definitions
│   ├── wellness-tools.ts      # Wellness definitions
│   └── ...                    # 128 total definition files
│
├── advanced/                   # Advanced routing features
│   ├── index.ts               # Exports
│   ├── adversarial-defense.ts # Defense against prompt injection
│   ├── cascade-router.ts      # Cascading router for fallback
│   ├── confidence-calibrator.ts # Confidence score calibration
│   ├── dynamic-threshold.ts   # Dynamic threshold adjustment
│   ├── explainable.ts         # Explainable routing decisions
│   ├── hybrid-retrieval.ts    # Hybrid semantic + keyword retrieval
│   ├── latency-optimizer.ts   # Latency optimization
│   ├── realtime-safety.ts     # Real-time safety checks
│   ├── semantic-caching.ts    # Semantic query caching
│   ├── simd-optimization.ts   # SIMD vector operations
│   ├── tool-pruning.ts        # Prune irrelevant tools
│   ├── intelligent/           # Intelligent routing
│   │   ├── tool-intelligence.ts # Tool intelligence system
│   │   └── explanation-generator.ts # Generate explanations
│   └── workers/               # Worker threads
│       └── embedding-worker.ts # Background embedding computation
│
├── learning/                   # Online learning & adaptation
│   ├── index.ts               # Exports
│   ├── community-learning.ts  # Learn from all users
│   ├── correction-store.ts    # Store user corrections
│   ├── dynamic-strategy.ts    # Dynamic strategy selection
│   ├── online-learning-loop.ts # Online learning loop
│   └── user-segmentation.ts   # User segment-based learning
│
├── integration/                # Integration with other systems
│   ├── index.ts               # Exports
│   ├── gemini-integration.ts  # Gemini LLM integration
│   ├── openai-integration.ts  # OpenAI integration
│   ├── unified-tool-format.ts # Unified tool format
│   └── voice-agent-bridge.ts  # Voice agent integration
│
├── persistence/                # State persistence
│   ├── index.ts               # Exports
│   ├── embedding-store.ts     # Store embeddings
│   └── correction-store.ts    # Store corrections
│
├── auto-convert/               # Auto-convert legacy tools
│   └── index.ts               # Convert old tool format
│
├── evaluation/                 # Evaluation & benchmarks
│   ├── index.ts               # Exports
│   └── benchmark.ts           # Performance benchmarks
│
├── analytics/                  # Routing analytics
│   └── index.ts               # Track routing decisions
│
├── i18n/                       # Internationalization
│   ├── index.ts               # Exports
│   └── locales/               # Locale-specific patterns
│
└── __tests__/                  # Tests
    ├── matcher.test.ts
    ├── registry.test.ts
    └── integration.test.ts
```

---

## Core Concepts

### SemanticToolDefinition

```typescript
interface SemanticToolDefinition {
  id: string;
  name: string;
  description: string;

  triggers: {
    phrases?: string[];        // Exact matches
    patterns?: RegExp[];       // Regex patterns
    keywords?: string[];       // Keyword boost
    antiKeywords?: string[];   // Negative signals
  };

  examples?: string[];         // Training examples
  embedding?: number[];        // Precomputed embedding

  arguments?: ToolArgument[];  // Expected arguments
  category?: ToolCategory;     // Category for grouping
  domain?: string;             // Domain (calendar, finance, etc.)
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

### Basic Routing

```typescript
import { createSemanticRouter, routeUserInput } from './semantic-router';

// Create router
const router = createSemanticRouter();

// Route user input
const result = await routeUserInput("play some jazz music");

if (result.action.type === 'execute') {
  await executeToolDirectly(result.action.toolId, result.action.args);
} else if (result.action.type === 'hint') {
  // Pass hint to LLM for better response
  const hint = result.action.hint;
}
```

### Registering Tools

```typescript
import { getToolRegistry } from './semantic-router';

const registry = getToolRegistry();

registry.register({
  id: 'playMusic',
  name: 'Play Music',
  description: 'Play music based on user request',
  triggers: {
    phrases: ['play music', 'put on some'],
    keywords: ['music', 'song', 'play', 'listen'],
    patterns: [/play (some )?(.*) music/i],
  },
  examples: [
    'play some jazz',
    'put on relaxing music',
    'I want to listen to rock',
  ],
});
```

### Multi-Intent Detection

```typescript
import { detectMultipleIntents } from './semantic-router';

// User says: "Play jazz and check my calendar for tomorrow"
const intents = await detectMultipleIntents(userInput);
// Returns: [
//   { toolId: 'playMusic', args: { genre: 'jazz' }, confidence: 0.92 },
//   { toolId: 'getCalendar', args: { date: 'tomorrow' }, confidence: 0.88 }
// ]
```

---

## Learning System

The router improves over time through:

### 1. Online Learning Loop

```typescript
import { recordCorrection } from './learning';

// User corrects a routing decision
recordCorrection({
  input: "I need a therapist",
  routedTo: 'findDoctor',
  correctedTo: 'mentalHealthSupport',
  userId: 'user123',
});
```

### 2. Community Learning

Aggregates corrections across users to improve for everyone (privacy-safe).

### 3. User Segmentation

Different routing strategies for different user segments (power users, new users, etc.).

---

## Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Pattern matching | < 1ms | Regex + exact match |
| Keyword scoring | 1-2ms | TF-IDF weighted |
| Embedding similarity | 10-30ms | Depends on model |
| Full routing | < 50ms | Including all layers |

### SIMD Optimization

For batch operations, SIMD-optimized vector math is available:

```typescript
import { isSimdAvailable, batchCosineSimilarity } from './advanced/simd-optimization';

if (isSimdAvailable()) {
  const similarities = batchCosineSimilarity(queryEmbedding, toolEmbeddings);
}
```

---

## Testing

```bash
# Run semantic router tests
pnpm vitest run src/tools/semantic-router/__tests__/

# Run integration tests
pnpm vitest run src/tools/semantic-router/integration/__tests__/

# Run learning tests
pnpm vitest run src/tools/semantic-router/learning/__tests__/
```

---

## Configuration

```typescript
import { getConfig, setConfig } from './semantic-router';

// Get current config
const config = getConfig();

// Update config
setConfig({
  confidenceThresholds: {
    execute: 0.85,
    confirm: 0.70,
    hint: 0.50,
  },
  enableLearning: true,
  enableAnalytics: true,
  maxEmbeddingCacheSize: 10000,
});
```

---

## Integration Points

| System | Integration File | Purpose |
|--------|-----------------|---------|
| Voice Agent | `integration/voice-agent-bridge.ts` | Real-time routing |
| Gemini | `integration/gemini-integration.ts` | Gemini-specific handling |
| OpenAI | `integration/openai-integration.ts` | OpenAI-specific handling |
| Unified Orchestrator | `../orchestrator/unified-tool-orchestrator.ts` | Main entry point |

---

## Rules

### Do
- Use precomputed embeddings for known tool descriptions
- Provide good examples for each tool (improves matching)
- Handle low-confidence results gracefully
- Log routing decisions for debugging
- Use multi-intent detection for complex requests

### Don't
- Rely solely on pattern matching (use embeddings too)
- Ignore confidence scores
- Skip the learning feedback loop
- Hardcode thresholds (use config)

---

## Related Files

- `../CLAUDE.md` - Tools overview
- `../orchestrator/unified-tool-orchestrator.ts` - Orchestrator that uses router
- `../../agents/shared/json-function-executor.ts` - Fallback JSON execution

---

*Last updated: January 2026*
