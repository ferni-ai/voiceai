# Semantic Tool Router

> **State-of-the-art, provider-agnostic tool routing that's better than LLM function calling.**
> 
> 📊 **Critical Audit:** See `CRITICAL-AUDIT.md` for state-of-the-art analysis and gaps.

## Why This Exists

LLM function calling (both Gemini and OpenAI) is unreliable:
- Gemini Live API frequently fails to output function calls
- OpenAI's function calling adds latency
- Both struggle with many tools (prompt bloat)
- No confidence scores or fallback handling

The Semantic Tool Router solves this by routing **before** the LLM:

```
User Input: "play some jazz"
     │
     ▼
┌─────────────────────────────────────────────┐
│         SEMANTIC TOOL ROUTER                │
│                                             │
│  Layer 1: Pattern Match    ✓ "play" → music │
│  Layer 2: Keyword Score    ✓ "jazz" → genre │
│  Layer 3: Embedding Sim    ✓ 0.94 similarity│
│  Layer 4: Context Boost    + recent music   │
│                                             │
│  Result: spotify_play (confidence: 0.96)    │
│  Args: { genre: "jazz" }                    │
└─────────────────────────────────────────────┘
     │
     ▼ High confidence (>0.92)
     │
   Execute directly, bypass LLM
     │
     ▼
🎵 Jazz starts playing
```

## Key Features

### 🎯 Multi-Layer Matching

1. **Pattern Matching** (<1ms): Fast regex/phrase matching for exact triggers
2. **Keyword Scoring** (~1ms): Weighted keyword matching with anti-keywords
3. **Embedding Similarity** (~10-30ms): Semantic understanding via embeddings
4. **Context Awareness** (~1ms): Boosts based on conversation history

### 🔧 Smart Argument Extraction

- Named entity recognition (locations, dates, times, people)
- Category-specific extractors (music, calendar, etc.)
- Slot filling for missing required arguments
- Context inference from conversation history

### 📊 Confidence-Based Actions

| Confidence | Action |
|------------|--------|
| ≥0.92 | Execute directly, bypass LLM |
| 0.80-0.92 | Ask for confirmation via LLM |
| 0.55-0.80 | Pass hint to LLM |
| <0.55 | Pure conversation |

### ⚡ Provider Agnostic

Works with ANY LLM:
- Gemini (Live API, standard)
- OpenAI (GPT-4, Realtime)
- Claude
- Local models
- Custom providers

## Quick Start

```typescript
import {
  createSemanticRouter,
  getToolRegistry,
  routeUserInput,
} from './semantic-router';
import { musicTools } from './tool-definitions/music.semantic';

// 1. Register tools
const registry = getToolRegistry();
registry.registerMany(musicTools);

// 2. Create router
const router = createSemanticRouter();
await router.initialize();

// 3. Route user input
const result = await routeUserInput("play some chill jazz");

// 4. Handle result
switch (result.action.type) {
  case 'execute':
    // High confidence - execute directly
    const outcome = await router.execute(
      result.action.toolId,
      result.action.args,
      context
    );
    console.log(outcome.naturalResponse); // "Playing chill jazz"
    break;

  case 'hint':
    // Medium confidence - pass hint to LLM
    const prompt = `${userInput}\n\n${generateHint(result)}`;
    // Send to LLM...
    break;

  case 'conversation':
    // No tool match - pure conversation
    // Send to LLM normally...
    break;
}
```

## Voice Agent Integration

```typescript
import {
  initializeVoiceRouter,
  routeVoiceInput,
} from './semantic-router/voice-integration';

// Initialize once at startup
await initializeVoiceRouter();

// In your turn handler:
async function handleUserTurn(userInput: string, context: VoiceRouterContext) {
  // Route BEFORE sending to LLM
  const routeResult = await routeVoiceInput(userInput, context);

  if (routeResult.bypassLLM && routeResult.toolResult) {
    // Tool executed directly - speak the result
    await speakResponse(routeResult.toolResult.naturalResponse);
    return;
  }

  // Otherwise, send to LLM with optional hint
  const llmInput = routeResult.llmHint
    ? `${userInput}\n\n${routeResult.llmHint}`
    : userInput;

  const llmResponse = await generateLLMResponse(llmInput);
  await speakResponse(llmResponse);
}
```

## Defining Tools

Tools are defined with rich semantic information:

```typescript
const playMusicTool: SemanticToolDefinition = {
  id: 'spotify_play',
  name: 'Play Music',
  description: 'Plays music on Spotify...',
  shortDescription: 'play music on Spotify',
  category: 'music',

  // Fast pattern matching
  triggers: {
    phrases: ['play music', 'play some music', 'put on music'],
    patterns: [/^play\s+(?:me\s+)?(?:some\s+)?(.+)/i],
    keywords: [
      { word: 'play', weight: 1.0 },
      { word: 'music', weight: 0.8 },
      { word: 'spotify', weight: 0.9 },
      { word: 'jazz', weight: 0.8 },
    ],
    antiKeywords: ['stop', 'pause'], // Reduces score if present
  },

  // For embedding similarity
  examples: [
    'play some jazz',
    'play chill music for focus',
    'play Bohemian Rhapsody by Queen',
  ],

  // Argument extraction
  arguments: [
    {
      name: 'genre',
      type: 'string',
      description: 'Music genre',
      required: false,
      entityType: 'genre', // Uses built-in extractor
    },
    {
      name: 'artist',
      type: 'string',
      required: false,
      extractionPatterns: [/by\s+(.+?)(?:\s+(?:and|on)|$)/i],
    },
  ],

  // Execution
  execute: async (args, context) => {
    // Call your actual tool implementation
    return {
      success: true,
      naturalResponse: `Playing ${args.genre || 'music'}`,
    };
  },
};
```

## Configuration

```typescript
const router = createSemanticRouter({
  // Confidence thresholds
  thresholds: {
    autoExecute: 0.92, // Execute directly
    confirm: 0.80,     // Ask for confirmation
    hint: 0.55,        // Pass hint to LLM
    minimum: 0.35,     // Minimum to consider
  },

  // Layer weights for combining scores
  layerWeights: {
    pattern: 1.0,    // Exact patterns are highly trusted
    keyword: 0.7,    // Keywords are good signals
    embedding: 0.85, // Embeddings are very reliable
    context: 0.6,    // Context is helpful
    history: 0.4,    // History is a weak signal
  },

  // Embedding model
  embeddingModel: 'openai', // 'openai' | 'google' | 'local'

  // Debug mode
  debug: true,
});
```

## Embedding Providers

| Provider | Model | Dimensions | Latency | Quality | Cost |
|----------|-------|------------|---------|---------|------|
| OpenAI | text-embedding-3-small | 1536 | ~50ms | High | $$ |
| Google | text-embedding-004 | 768 | ~30ms | Good | $ |
| Local | Hash-based | 384 | <1ms | Low | Free |

```typescript
import { createEmbeddingProvider } from './embedding-providers';

// For production
const provider = createEmbeddingProvider('openai');

// For testing/development
const provider = createEmbeddingProvider('local');
```

## Architecture

```
src/tools/semantic-router/
├── types.ts               # Core type definitions
├── registry.ts            # Tool registry with embedding cache
├── matcher.ts             # Multi-layer matching engine
├── argument-extractor.ts  # Entity extraction & slot filling
├── router.ts              # Main router class
├── embedding-providers.ts # OpenAI, Google, Local embeddings
├── voice-integration.ts   # Voice agent integration
├── index.ts               # Public exports
│
├── learning/              # Active Learning System
│   ├── correction-store.ts # Stores & learns from corrections
│   └── index.ts
│
├── analytics/             # Routing Analytics Dashboard
│   ├── routing-analytics.ts # Stats, performance, alerts
│   └── index.ts
│
├── integration/           # Turn Processor Integration
│   ├── turn-processor-integration.ts # Pre/Post LLM hooks
│   └── index.ts
│
├── auto-convert/          # Legacy Tool Converter
│   ├── tool-scanner.ts    # Scans & converts existing tools
│   └── index.ts
│
├── tool-definitions/      # Semantic Tool Definitions
│   ├── music.semantic.ts
│   ├── handoff.semantic.ts
│   └── index.ts
│
├── CRITICAL-AUDIT.md      # State of the art analysis
└── README.md
```

## Performance

Typical routing latency:

| Operation | Time |
|-----------|------|
| Pattern matching | <1ms |
| Keyword scoring | <1ms |
| Embedding (cached) | <1ms |
| Embedding (API) | 30-100ms |
| Argument extraction | <5ms |
| **Total (cached)** | **<10ms** |
| **Total (with API)** | **~50-150ms** |

## Why "Better Than Human"?

1. **Consistency**: Same input always gets same routing (unlike LLM)
2. **Speed**: Pattern matching is instant vs waiting for LLM
3. **Transparency**: Clear confidence scores and match reasons
4. **Scalability**: 100+ tools without prompt bloat
5. **Reliability**: Deterministic routing + LLM fallback
6. **Debuggability**: Full routing metadata for analytics

## Active Learning System

The router improves over time by learning from corrections:

```typescript
import {
  recordCorrection,
  getToolBoostForUser,
  getCorrectionAnalytics,
} from './semantic-router';

// When user corrects a routing decision:
recordCorrection({
  userId: 'user123',
  sessionId: 'sess456',
  originalQuery: 'play something relaxing',
  predictedTool: 'spotify_play',
  actualTool: 'meditation_start',  // User wanted meditation, not music
  feedbackType: 'wrong_tool',
});

// Router automatically adjusts for this user:
const boost = getToolBoostForUser('user123', 'meditation_start');
// boost: 0.05 (increased confidence for meditation)

// View correction analytics:
const analytics = getCorrectionAnalytics({ since: new Date('2024-01-01') });
// analytics.topMistakes: [{ predicted: 'spotify_play', actual: 'meditation_start', count: 5 }]
```

## Analytics Dashboard

Track routing performance:

```typescript
import { getDashboardData, getRoutingStats } from './semantic-router';

// Get full dashboard
const dashboard = getDashboardData();
// dashboard.overview: { totalRoutes, autoExecuteRate, accuracyEstimate, ... }
// dashboard.toolPerformance: [{ toolId, avgConfidence, correctionRate, ... }]
// dashboard.alerts: [{ type: 'warning', message: 'P95 latency above 100ms' }]

// Get stats for a specific period
const stats = getRoutingStats({
  userId: 'user123',
  since: new Date('2024-12-01'),
});
```

## Turn Processor Integration

Replace/augment JSON function calling:

```typescript
import {
  initializeSemanticRouter,
  preLLMRouting,
  postLLMVerification,
} from './semantic-router';

// Initialize once at startup
await initializeSemanticRouter();

// In your turn processor:
async function processTurn(userText: string, context: TurnProcessorContext) {
  // STEP 1: Pre-LLM routing
  const preResult = await preLLMRouting(userText, context);

  if (preResult.bypassLLM && preResult.toolExecutionResult) {
    // High confidence - tool executed directly, skip LLM!
    return preResult.speechResponse;
  }

  // STEP 2: Send to LLM (with optional hint)
  const llmPrompt = preResult.llmHint
    ? `${userText}\n\n${preResult.llmHint}`
    : userText;

  const llmResponse = await generateLLMResponse(llmPrompt);

  // STEP 3: Post-LLM verification
  const toolCallFromLLM = extractToolCall(llmResponse);
  postLLMVerification(
    toolCallFromLLM,
    preResult.routingEventId,
    preResult.routingResult,
    context
  );

  return llmResponse;
}
```

## Auto-Converting Existing Tools

Automatically convert your 60+ domain tools:

```typescript
import { autoRegisterDomainTools, getToolRegistry } from './semantic-router';

// Auto-register all domain tools at startup
const { registered, failed } = await autoRegisterDomainTools(
  getToolRegistry(),
  mockToolContext
);

console.log(`Registered ${registered} tools, ${failed.length} failed`);
```

## Future Enhancements

### Implemented ✅
- [x] Multi-layer semantic matching
- [x] Active learning from corrections
- [x] User preference personalization
- [x] Analytics dashboard
- [x] Turn processor integration
- [x] Auto-conversion for legacy tools

### Planned
- [ ] Fine-tuned dense retriever (train on our data)
- [ ] Tool chain prediction (multi-step planning)
- [ ] Uncertainty quantification (calibrated probabilities)
- [ ] Goal decomposition planner
- [ ] Cross-user learning (aggregate patterns)
- [ ] Proactive tool suggestions

## Related Files

- `docs/architecture/TOOL-LOADING-SYSTEM.md` - How tools are configured
- `src/agents/shared/json-function-executor.ts` - Current JSON tool executor
- `src/agents/shared/tool-call-sanitizer.ts` - Tool call sanitization

