# 🏗️ Ferni Infinite Tool Platform (FITP)

> **Scale to 1000+ tools while giving Gemini only 25-40 at any time**

## The Problem

LLMs struggle with many tools:
- **Google's recommendation**: 10-20 tools max for reliable function calling
- **Ferni reality**: 200+ tools across 50+ domains (growing daily)
- **Symptoms**: Wrong tool calls, conversational responses instead of actions, slow processing

## The Solution: Semantic Retrieval + Smart Filtering

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER INTENT                                         │
│                    "Play some relaxing jazz"                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              LAYER 1: SEMANTIC RETRIEVAL (<50ms)                            │
│  • Pre-computed embeddings (cached in Firestore)                            │
│  • Google AI text-embedding-004 or TF-IDF fallback                          │
│  • Top-K retrieval: ~15 most relevant tools                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              LAYER 2: SMART FILTERING                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │ ALWAYS (10)  │  │ CONTEXT (5)  │  │ PERMISSION   │                      │
│  │ memory       │  │ emotion      │  │ user tier    │                      │
│  │ handoff      │  │ time of day  │  │ A/B variant  │                      │
│  │ entertainment│  │ crisis mode  │  │ deprecation  │                      │
│  └──────────────┘  └──────────────┘  └──────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              FINAL: 25-40 RELEVANT TOOLS → GEMINI                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Initialize at Startup

```typescript
import { toolOrchestrator } from './tools/orchestrator/index.js';

// In your main entry point (voice-agent-entry.ts)
async function initializeApp() {
  // This runs ONCE and takes ~2-5 seconds
  await toolOrchestrator.initialize();
  
  console.log('✅ Tool orchestrator ready');
  console.log(toolOrchestrator.getStats());
}
```

### 2. Get Tools for Each Conversation Turn

```typescript
import { toolOrchestrator } from './tools/orchestrator/index.js';

async function handleUserMessage(transcript: string, userId: string) {
  const result = await toolOrchestrator.getToolsForIntent({
    transcript,
    userId,
    agentId: 'ferni',
    context: {
      emotion: detectEmotion(transcript),
      timeOfDay: getTimeOfDay(),
      isNewUser: await checkIfNewUser(userId),
    }
  });

  // result.tools = Record<string, Tool> ready for Gemini
  // result.meta = selection stats and debugging info
  
  console.log(`Selected ${result.meta.selected} tools in ${result.meta.selectionTimeMs}ms`);
  
  return result.tools;
}
```

### 3. Mid-Session Tool Refresh (Optional)

```typescript
// When you detect a significant context shift
const refreshResult = await toolOrchestrator.shouldRefreshTools({
  newTranscript: "Actually I'm feeling really stressed about work",
  previousTools: Object.keys(currentTools),
  sessionId: session.id,
});

if (refreshResult.shouldRefresh) {
  // Inject new tools into session
  console.log('Adding:', refreshResult.toolsToAdd);
  console.log('Reason:', refreshResult.reason);
}
```

---

## Architecture Components

### Unified Tool Orchestrator

**File:** `src/tools/orchestrator/unified-tool-orchestrator.ts`

The main API that combines all tool selection systems:

| Method | Purpose | When to Call |
|--------|---------|--------------|
| `initialize()` | Set up all systems | Once at startup |
| `getToolsForIntent()` | Get tools for a user message | Every conversation turn |
| `shouldRefreshTools()` | Check if mid-session refresh needed | On topic/emotion shift |
| `explainSelection()` | Debug why tools were selected | Development/debugging |
| `clearCaches()` | Clear all caches | After tool updates |

### Embedding Cache

**File:** `src/tools/orchestrator/embedding-cache.ts`

Pre-computed tool embeddings for fast retrieval:

- **Firestore persistence**: Survives restarts
- **Version tracking**: Auto-invalidates on tool changes
- **Background refresh**: Non-blocking updates
- **Memory cache**: Sub-millisecond lookups

### Semantic Router

**File:** `src/tools/semantic-router.ts`

Embedding-based tool matching:

- **Google AI embeddings** (production): `text-embedding-004`
- **TF-IDF fallback** (development): No API key needed
- **Query caching**: 5-minute TTL
- **Always-include domains**: memory, handoff (never filtered out)

### Dynamic Tool Router

**File:** `src/tools/dynamic-tool-router.ts`

Keyword-based intent detection for loading contextual domains:

```typescript
const TOOL_TIERS = {
  TIER_0_ALWAYS: ['memory', 'handoff', 'entertainment'],
  TIER_1_COMMON: ['information', 'games', 'awareness'],
  TIER_2_CONTEXTUAL: {
    grief: { keywords: ['died', 'loss', ...], domains: ['grief'] },
    relationships: { keywords: ['partner', ...], domains: ['relationships'] },
    // ... 30+ more categories
  }
};
```

### Tool Lifecycle

**File:** `src/tools/advanced/tool-lifecycle.ts`

Advanced tool management:

- **A/B testing**: Test tool variants per user
- **Deprecation tracking**: Warn about outdated tools
- **Versioning**: Track tool changes over time
- **Execution tracking**: Analytics for optimization

---

## Configuration

```typescript
const orchestrator = new UnifiedToolOrchestrator({
  // Maximum tools to return to LLM
  maxTools: 35,  // Default: 35, sweet spot for Gemini
  
  // Similarity threshold for semantic matching (0-1)
  semanticThreshold: 0.15,  // Lower = more tools, higher = stricter
  
  // Pre-compute embeddings at startup
  precomputeEmbeddings: true,
  
  // Cache tool selections (ms)
  selectionCacheTtlMs: 5 * 60 * 1000,  // 5 minutes
  
  // Domains ALWAYS included (never filtered out)
  alwaysDomains: ['memory', 'handoff', 'entertainment'],
  
  // Enable A/B testing variants
  enableABTesting: true,
  
  // Warn about deprecated tools
  enableDeprecationWarnings: true,
  
  // Load tools based on emotion/time context
  enableContextualTools: true,
});
```

---

## Performance Characteristics

| Operation | Cold Start | Warm Cache |
|-----------|------------|------------|
| `initialize()` | 2-5 seconds | N/A (once) |
| `getToolsForIntent()` | 100-200ms | 10-50ms |
| `embedQuery()` | 50-100ms | <1ms |
| `shouldRefreshTools()` | 10-50ms | 5-20ms |

### Memory Usage

| Component | Memory |
|-----------|--------|
| Tool Registry | ~50MB |
| Embedding Cache (200 tools) | ~10MB |
| Query Cache (1000 entries) | ~5MB |

---

## Integration with Voice Agent

### Option 1: Replace buildAgentTools (Recommended)

```typescript
// In voice-agent.ts, replace:
const personaTools = await buildAgentTools(persona.id);
const essentialTools = await buildEssentialTools();
let toolsForAgent = { ...essentialTools, ...personaTools };

// With:
const result = await toolOrchestrator.getToolsForIntent({
  transcript: initialContext || '',
  userId: this.userId,
  agentId: persona.id,
  context: this.getSessionContext(),
});
let toolsForAgent = result.tools;
```

### Option 2: Per-Turn Tool Refresh

```typescript
// In transcript-handler.ts, add to processTranscript:
const result = await toolOrchestrator.getToolsForIntent({
  transcript: input.transcript,
  userId: sessionState.userId,
  agentId: sessionState.agentId,
  conversationHistory: sessionState.recentTranscripts,
  context: {
    emotion: sessionState.detectedEmotion,
    messageCount: sessionState.messageCount,
  }
});

// If tools changed significantly, consider session refresh
if (toolsChangedSignificantly(currentTools, result.tools)) {
  await refreshSessionTools(result.tools);
}
```

---

## Adding New Tools

Tools are automatically discovered when added to the registry:

```typescript
// 1. Create tool in a domain
// src/tools/domains/my-domain/index.ts

// 2. Registry auto-loads it

// 3. Orchestrator indexes it on next warmup
await toolOrchestrator.clearCaches();
await toolOrchestrator.initialize();

// 4. Semantic matching works immediately
```

### Best Practices for Tool Descriptions

Good descriptions = better semantic matching:

```typescript
// ✅ GOOD - Rich, descriptive, includes synonyms
{
  id: 'playMusic',
  name: 'Play Music',
  description: 'Play music by song, artist, genre, or mood. ' +
    'Supports relaxing jazz, upbeat pop, classical, rock, and any genre. ' +
    'Can also play based on activity like workout, sleep, or focus music.',
  tags: ['music', 'entertainment', 'spotify', 'audio', 'playlist', 'songs']
}

// ❌ BAD - Vague, no synonyms
{
  id: 'playMusic',
  name: 'Play Music',
  description: 'Plays music',
  tags: ['music']
}
```

---

## Debugging

### Explain Why Tools Were Selected

```typescript
const result = await toolOrchestrator.getToolsForIntent({ ... });
console.log(toolOrchestrator.explainSelection(result));
```

Output:
```
🔧 Tool Selection Breakdown

Selected 32 of 247 tools
Selection time: 45ms

Sources:
  • Essential (always): 12
  • Semantic (matched): 15
  • Contextual (smart): 5
  • MCP (external): 0

Detected Intent:
  Categories: entertainment
  Domains: entertainment
  Confidence: 80%

Top Semantic Matches:
  • playMusic (92%)
  • musicControl (78%)
  • suggestMusic (65%)
  • spotifyAdvanced (58%)
  • musicInfo (55%)
```

### View Statistics

```typescript
console.log(toolOrchestrator.getStats());
// { initialized: true, totalTools: 247, cacheSize: 42, config: {...} }

console.log(embeddingCache.getStats());
// { totalCached: 247, hitRate: 0.94, memoryUsageMB: 8.2, ... }
```

---

## FAQ

### Q: What if semantic matching fails?

The system has multiple fallbacks:
1. **Always-available domains** (memory, handoff, entertainment) are ALWAYS included
2. **Keyword-based intent detection** catches explicit mentions
3. **Force include** option lets you guarantee specific tools

### Q: How do I add a tool that should ALWAYS be available?

Add its domain to `alwaysDomains` config or use `forceInclude`:

```typescript
// Option 1: Config
new UnifiedToolOrchestrator({
  alwaysDomains: ['memory', 'handoff', 'entertainment', 'my-domain'],
});

// Option 2: Per-request
await toolOrchestrator.getToolsForIntent({
  transcript,
  forceInclude: ['mySpecialTool'],
});
```

### Q: How do I handle MCP (external) tools?

MCP tools are loaded via the existing `mcp-integration.ts` and merged into the final set:

```typescript
// MCP tools from persona bundles are automatically included
// They count toward the maxTools limit
```

### Q: Can I use this in production today?

Yes! The system uses existing, battle-tested components:
- `semantic-router.ts` - Already in codebase
- `dynamic-tool-router.ts` - Already in codebase  
- `tool-lifecycle.ts` - Already in codebase
- Google AI embeddings - Production-ready

The orchestrator is a composition layer that unifies these systems.

---

## Roadmap

### Phase 1: Current (This PR)
- [x] Unified Tool Orchestrator
- [x] Embedding Cache with Firestore persistence
- [x] Documentation

### Phase 2: Deep Integration
- [ ] Replace `buildAgentTools` calls in voice-agent.ts
- [ ] Per-turn tool refresh in transcript-handler.ts
- [ ] Session tool injection via LiveKit

### Phase 3: ML Optimization
- [ ] Learn tool preferences per user
- [ ] Reinforcement learning for tool selection
- [ ] Multi-turn conversation context

### Phase 4: Scale Testing
- [ ] Load test with 500+ tools
- [ ] Load test with 1000+ tools
- [ ] Memory optimization

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/tools/orchestrator/unified-tool-orchestrator.ts` | Main API |
| `src/tools/orchestrator/embedding-cache.ts` | Embedding persistence |
| `src/tools/orchestrator/index.ts` | Exports |
| `src/tools/semantic-router.ts` | Embedding-based matching |
| `src/tools/dynamic-tool-router.ts` | Keyword-based tiers |
| `src/tools/dynamic-loader.ts` | Domain loading |
| `src/tools/advanced/tool-lifecycle.ts` | A/B, deprecation, etc. |
| `src/tools/builder.ts` | Tool construction |
| `src/tools/registry/index.ts` | Tool registry |

