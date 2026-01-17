# Ferni Tool Intelligence System (FTIS)

A self-improving, multi-layer tool selection and execution system for the Ferni voice AI platform.

## Overview

FTIS transforms tool selection from basic keyword matching to an intelligent, learning system that:

- **Learns from usage patterns** - Builds transition matrices from real user sessions
- **Predicts tool sequences** - Suggests multi-tool workflows based on context
- **Plans complex tasks** - Uses MCTS for sophisticated multi-tool planning
- **Executes efficiently** - Parallel dispatch with intelligent retry logic
- **Improves continuously** - A/B testing and automated retraining

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 5: Learning                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Outcome     │  │ A/B Testing │  │ Continuous Learning     │ │
│  │ Tracker     │  │ Manager     │  │ Pipeline                │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    Layer 4: Execution                           │
│  ┌─────────────────────────┐  ┌────────────────────────────┐   │
│  │ Intelligent Executor    │  │ Parallel Dispatcher        │   │
│  │ - Sequence execution    │  │ - Dependency management    │   │
│  │ - Result aggregation    │  │ - Retry with backoff       │   │
│  └─────────────────────────┘  └────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Layer 3: Planning                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Complexity  │  │ Sequence    │  │ MCTS Planner            │ │
│  │ Classifier  │  │ Predictor   │  │ + Value Estimator       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    Layer 2: Fast Routing                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Ferni Router Model (ONNX)                               │   │
│  │ - Feature Encoder                                        │   │
│  │ - Model Loader (local/GCS)                               │   │
│  │ - ~50ms inference                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Layer 1: Knowledge Base                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Tool Merger │  │ Transition  │  │ User Preferences        │ │
│  │             │  │ Matrix      │  │ (Enhanced Profile)      │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import {
  classifyComplexity,
  predictSequence,
  planTools,
  getIntelligentExecutor,
} from './tools/intelligence';

// 1. Classify the task complexity
const complexity = classifyComplexity('help me plan my week');

// 2. Based on complexity, choose approach
if (complexity.suggestedApproach === 'direct') {
  // Simple: execute single tool
  const result = await executor.executeTool(toolId);
} else if (complexity.suggestedApproach === 'sequence') {
  // Medium: use sequence predictor
  const sequence = predictSequence(routerOutput, context);
  const result = await executor.executeSequence(sequence);
} else {
  // Complex: use MCTS planner
  const plan = planTools(query, availableTools);
  const result = await executor.executeMCTSPlan(plan);
}
```

## Modules

### Layer 1: Knowledge Base

#### Tool Merger (`merger/`)
Deduplicates 500+ tools to ~60-100 canonical tools using embedding similarity and LLM classification.

```typescript
import { ToolMerger, getMergeRegistry } from './merger';

const merger = new ToolMerger(embedProvider, llm);
const { clusters, stats } = await merger.merge(tools);
console.log(`Reduced ${stats.originalCount} tools to ${stats.clusterCount}`);
```

#### Transition Matrix (`transitions/`)
Tracks tool usage sequences with context-conditioning (persona, time, emotion).

```typescript
import { getTransitionMatrix } from './transitions';

const matrix = getTransitionMatrix();
matrix.recordTransition('weather', 'calendar', { personaId: 'ferni' });

const predictions = matrix.getPredictions('weather', { personaId: 'ferni' });
// → [{ toolId: 'calendar', probability: 0.7 }, ...]
```

### Layer 2: Fast Routing

#### Router Model (`router/`)
Fine-tuned Qwen 2.5 1.5B model for multi-label tool classification (~50ms inference).

```typescript
import { initializeRouterModel, predictTools } from './router';

await initializeRouterModel({ modelPath: 'path/to/model.onnx' });
const predictions = await predictTools(query, context);
```

### Layer 3: Planning

#### Complexity Classifier (`planning/complexity-classifier.ts`)
Classifies queries into simple/medium/complex to route to appropriate handler.

```typescript
const result = classifyComplexity('what is the weather');
// → { complexity: 'simple', suggestedApproach: 'direct', ... }
```

#### Sequence Predictor (`planning/sequence-predictor.ts`)
Predicts multi-tool sequences using transition matrix.

```typescript
const sequence = predictSequence(routerOutput, { personaId: 'ferni', timeOfDay: 'morning' });
// → { steps: [...], executionStrategy: 'sequential', ... }
```

#### MCTS Planner (`planning/mcts/`)
Monte Carlo Tree Search for complex multi-tool planning.

```typescript
const plan = planTools('plan my week', ['calendar', 'tasks', 'goals'], {
  maxSimulations: 100,
  timeoutMs: 500,
});
// → { tools: ['calendar', 'goals', 'tasks'], value: 0.85, ... }
```

### Layer 4: Execution

#### Intelligent Executor (`execution/`)
Executes tool plans with parallel dispatch, retry logic, and result aggregation.

```typescript
const executor = getIntelligentExecutor(toolExecutor);

// Execute sequence
const result = await executor.executeSequence(sequence);

// Execute with parallelism
const result = await executor.executeTools(['a', 'b', 'c'], { parallel: true });

// Aggregate results
const summary = executor.aggregateResults(result.results);
```

### Layer 5: Learning

#### Outcome Tracker (`learning/outcome-tracker.ts`)
Tracks tool selection and execution outcomes for analysis.

```typescript
const tracker = getOutcomeTracker();
tracker.track({
  toolId: 'weather',
  query: 'check weather',
  selectedBy: 'router',
  confidence: 0.9,
  executionSuccess: true,
  ...
});
```

#### A/B Testing (`learning/ab-testing.ts`)
Manages experiments for tool selection strategies.

```typescript
const manager = getABTestingManager();
manager.createExperiment({
  id: 'router-v2',
  variants: [...],
  ...
});

const variant = manager.getVariant(userId, 'router-v2');
```

#### Learning Pipeline (`learning/learning-pipeline.ts`)
Orchestrates continuous improvement cycle.

```typescript
const pipeline = getLearningPipeline();

if (pipeline.shouldRetrain().should) {
  await pipeline.triggerRetrain();
}

const decision = pipeline.checkPromotion();
if (decision?.promote) {
  await pipeline.promoteModel();
}
```

## Configuration

### Model Config (`data/model-config.json`)

```json
{
  "toolDefaults": {
    "enabledDomains": [],
    "maxTools": 60,
    "includedTools": ["weather_current", "calendar_list", ...]
  }
}
```

### Router Config

```typescript
{
  modelPath: 'path/to/model.onnx',
  confidenceThreshold: 0.7,
  topK: 10,
  maxLength: 512,
  useGPU: false,
}
```

### MCTS Config

```typescript
{
  maxSimulations: 100,
  maxDepth: 5,
  explorationConstant: 1.41,
  timeoutMs: 500,
  discountFactor: 0.95,
}
```

## Performance Targets

| Component | Target | Measured |
|-----------|--------|----------|
| Complexity Classification | <5ms | ~1ms |
| Sequence Prediction | <10ms | ~5ms |
| MCTS Planning (50 sims) | <100ms | ~80ms |
| Transition Lookup | <1ms | ~0.2ms |
| Router Inference | <50ms | ~45ms |
| Parallel Execution (5 tools) | <50ms | ~40ms |

## Testing

```bash
# Unit tests
pnpm vitest run src/tools/intelligence

# Integration tests
pnpm vitest run src/tools/intelligence/__tests__/integration

# Benchmarks
pnpm ts-node src/tools/intelligence/__tests__/benchmark/ftis-benchmark.ts

# E2E validation
pnpm ts-node scripts/validate-ftis.ts
```

## Training the Router Model

```bash
# Build training data
cd apps/ml-training/router
python -m scripts.collect_training_data

# Train model
python train.py --config config.yaml

# Export to ONNX
python export_onnx.py --model-dir output/model --output router.onnx

# Deploy
gcloud storage cp router.onnx gs://ferni-models/router/
```

## Files

```
src/tools/intelligence/
├── index.ts                 # Main exports
├── README.md               # This file
├── merger/                 # Tool deduplication
│   ├── types.ts
│   ├── equivalence-classifier.ts
│   ├── merge-registry.ts
│   ├── tool-merger.ts
│   └── __tests__/
├── transitions/            # Sequence learning
│   ├── types.ts
│   ├── transition-matrix.ts
│   ├── transition-learner.ts
│   ├── firestore-sync.ts
│   └── __tests__/
├── router/                 # ML routing
│   ├── training/          # Data collection & augmentation
│   └── inference/         # ONNX runtime
├── planning/              # Task planning
│   ├── complexity-classifier.ts
│   ├── sequence-predictor.ts
│   ├── mcts/              # Monte Carlo Tree Search
│   └── __tests__/
├── execution/             # Tool execution
│   ├── types.ts
│   ├── intelligent-executor.ts
│   ├── parallel-dispatcher.ts
│   ├── result-aggregator.ts
│   └── __tests__/
├── learning/              # Continuous improvement
│   ├── outcome-tracker.ts
│   ├── ab-testing.ts
│   ├── learning-pipeline.ts
│   └── __tests__/
└── __tests__/
    ├── integration/
    └── benchmark/

apps/ml-training/router/   # Python training code
├── config.yaml
├── train.py
├── evaluate.py
├── export_onnx.py
├── Dockerfile
└── requirements.txt
```

## Audit Checklist

- [x] All modules have unit tests
- [x] Integration tests cover full flow
- [x] Benchmark suite validates performance targets
- [x] E2E validation script passes
- [x] TypeScript types are complete
- [x] No `any` types
- [x] Proper error handling throughout
- [x] Logging via structured logger
- [x] Firestore operations use cleanForFirestore
- [x] Singletons have reset functions for testing
- [x] Documentation complete

## Version History

- **v1.0.0** - Initial FTIS implementation
  - Tool merger with LLM classification
  - Transition matrix with context conditioning
  - Complexity classifier (simple/medium/complex)
  - Sequence predictor with transition integration
  - MCTS planner with value estimator
  - Intelligent executor with parallel dispatch
  - Outcome tracking and A/B testing
  - Continuous learning pipeline
