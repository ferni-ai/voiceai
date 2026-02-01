# Tool Gateway Design

> **The Problem**: Tools load AFTER the LLM responds because we have scattered loading paths, multiple "essential" lists, and reactive (not proactive) loading.

> **The Solution**: A centralized **Tool Gateway** that is the ONLY interface for tool access, with tiered loading, predictive prefetching, and single source of truth.

---

## Current Pain Points

### 1. Multiple "Essential" Domain Lists

| Location | Domains | Used By |
|----------|---------|---------|
| `registry/loader.ts` → `ESSENTIAL_DOMAINS` | 15 | `initializeToolRegistry()` |
| `dynamic-loader/topic-mappings.ts` → `DEFAULT_ESSENTIAL_DOMAINS` | 13 | `DynamicToolLoader` |
| `builder.ts` → `buildEssentialTools()` | 3 | `getEssentialToolsCached()` |

**Result**: Tools get loaded at different times depending on which path is used.

### 2. Reactive vs Proactive Loading

Current flow:
```
User: "Play music"
  → LLM responds: "Yeah! Hold on—" (no tool available!)
  → Dynamic loader detects "music" topic
  → Loads "play" domain (wrong domain!)
  → Tools update (too late - LLM already responded)
```

### 3. Multiple Orchestration Layers

- `tool-orchestrator.ts` 
- `unified-tool-orchestrator.ts`
- `voice-agent-integration.ts`
- `dynamic-loader.ts`
- `builder.ts`

Each has its own logic for which tools to load and when.

---

## Proposed Architecture: Tool Gateway

```
                    ┌──────────────────────────────────────────┐
                    │             TOOL GATEWAY                  │
                    │  (Single interface for all tool access)   │
                    └──────────────────────────────────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            │                           │                           │
            ▼                           ▼                           ▼
    ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
    │   TIER 0      │           │   TIER 1      │           │   TIER 2      │
    │   (Instant)   │           │  (Preloaded)  │           │ (Predictive)  │
    │               │           │               │           │               │
    │ Core tools    │           │ Session tools │           │ Context tools │
    │ Always in RAM │           │ Loaded at     │           │ Prefetched    │
    │               │           │ session start │           │ proactively   │
    └───────────────┘           └───────────────┘           └───────────────┘
            │                           │                           │
            │ 0ms                       │ <100ms                    │ <500ms
            └───────────────────────────┴───────────────────────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │    Tool Registry      │
                            │  (Actual tool code)   │
                            └───────────────────────┘
```

### Tier Definitions

| Tier | Name | Load Time | When Loaded | Examples |
|------|------|-----------|-------------|----------|
| **0** | Instant | 0ms | Process start | memory, handoff, music (playMusic) |
| **1** | Preloaded | <100ms | Session start | calendar, habits, productivity, telephony |
| **2** | Predictive | <500ms | Context-based prefetch | grief, career, finance (based on user history) |
| **3** | On-Demand | <2000ms | When explicitly needed | Rare tools, experimental features |

### Single Source of Truth: `tool-tiers.json`

```json
{
  "$schema": "./tool-tiers.schema.json",
  "version": "1.0.0",
  "tiers": {
    "instant": {
      "description": "Always in memory, zero latency",
      "domains": ["memory", "handoff", "entertainment", "awareness"],
      "tools": ["playMusic", "musicControl", "transferAgent", "rememberFact"]
    },
    "preloaded": {
      "description": "Loaded at session start",
      "domains": ["calendar", "telephony", "communication", "habits", "productivity", "information"],
      "predicates": {
        "userHasCalendar": ["scheduling", "smart-calendar"],
        "userHasSpotify": ["spotify-enhanced"]
      }
    },
    "predictive": {
      "description": "Prefetched based on user context",
      "rules": [
        { "if": "user.recentTopics.includes('grief')", "load": ["grief", "meaning", "presence"] },
        { "if": "user.recentTopics.includes('career')", "load": ["career", "decisions", "learning"] },
        { "if": "time.hour >= 22 || time.hour <= 5", "load": ["presence", "sleep-support"] },
        { "if": "user.mood === 'anxious'", "load": ["presence", "breathing", "crisis"] }
      ]
    },
    "onDemand": {
      "description": "Load only when explicitly requested",
      "domains": ["legal-admin", "estate-planning", "advanced-finance"]
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Consolidate Essential Lists (Quick Win)

1. Create single `tool-tiers.json` config file
2. Delete `DEFAULT_ESSENTIAL_DOMAINS` from `topic-mappings.ts`
3. Update `buildEssentialTools()` to read from config
4. Update `ESSENTIAL_DOMAINS` to read from config

### Phase 2: Tool Gateway Class

```typescript
// src/tools/gateway/tool-gateway.ts

export class ToolGateway {
  private static instance: ToolGateway;
  
  // Tier caches
  private instantTools: Map<string, Tool> = new Map();
  private preloadedTools: Map<string, Tool> = new Map();
  private predictiveTools: Map<string, Tool> = new Map();
  
  // Session state
  private sessionId: string | null = null;
  private userId: string | null = null;
  
  /** Get singleton instance */
  static getInstance(): ToolGateway {
    if (!ToolGateway.instance) {
      ToolGateway.instance = new ToolGateway();
    }
    return ToolGateway.instance;
  }
  
  /** Initialize at process start - loads Tier 0 */
  async warmup(): Promise<void> {
    const config = await loadToolTiersConfig();
    await this.loadTier0(config.tiers.instant);
  }
  
  /** Start a session - loads Tier 1 based on user */
  async startSession(userId: string, sessionId: string, userProfile?: UserProfile): Promise<void> {
    this.sessionId = sessionId;
    this.userId = userId;
    
    const config = await loadToolTiersConfig();
    await this.loadTier1(config.tiers.preloaded, userProfile);
    
    // Start predictive prefetching in background
    this.prefetchPredictive(config.tiers.predictive, userProfile);
  }
  
  /** Get all tools for current session */
  getSessionTools(): Record<string, Tool> {
    return {
      ...Object.fromEntries(this.instantTools),
      ...Object.fromEntries(this.preloadedTools),
      ...Object.fromEntries(this.predictiveTools),
    };
  }
  
  /** Proactively update tools based on turn context */
  async onTurnStart(transcript: string): Promise<ToolUpdateResult> {
    // Predict what tools might be needed BEFORE LLM responds
    const predictions = await this.predictToolsNeeded(transcript);
    
    // Load any missing tools synchronously if critical
    if (predictions.critical.length > 0) {
      await this.loadToolsSync(predictions.critical);
    }
    
    // Prefetch optional tools in background
    this.prefetchAsync(predictions.optional);
    
    return {
      toolsReady: this.getSessionTools(),
      newlyLoaded: predictions.critical,
      prefetching: predictions.optional,
    };
  }
  
  /** Get tool by ID - checks all tiers */
  getTool(toolId: string): Tool | undefined {
    return (
      this.instantTools.get(toolId) ||
      this.preloadedTools.get(toolId) ||
      this.predictiveTools.get(toolId)
    );
  }
  
  /** Check if a tool is available NOW (not loading) */
  isToolReady(toolId: string): boolean {
    return this.getTool(toolId) !== undefined;
  }
  
  /** Get metrics for observability */
  getMetrics(): ToolGatewayMetrics {
    return {
      tier0Count: this.instantTools.size,
      tier1Count: this.preloadedTools.size,
      tier2Count: this.predictiveTools.size,
      totalTools: this.instantTools.size + this.preloadedTools.size + this.predictiveTools.size,
      sessionId: this.sessionId,
      userId: this.userId,
    };
  }
}
```

### Phase 3: Predictive Loading

```typescript
// Predict tools needed based on transcript
async predictToolsNeeded(transcript: string): Promise<ToolPrediction> {
  const predictions: ToolPrediction = {
    critical: [],  // Must load before LLM responds
    optional: [],  // Nice to have, prefetch async
  };
  
  // Fast keyword matching (< 1ms)
  const keywords = this.extractKeywords(transcript);
  
  // Music detection - ALWAYS critical
  if (keywords.has('music') || keywords.has('play') || keywords.has('song')) {
    if (!this.isToolReady('playMusic')) {
      predictions.critical.push('entertainment');
    }
  }
  
  // Calendar detection
  if (keywords.has('schedule') || keywords.has('meeting') || keywords.has('calendar')) {
    if (!this.isToolReady('scheduleEvent')) {
      predictions.critical.push('calendar');
    }
  }
  
  // Grief/emotional (prefetch, don't block)
  if (keywords.has('sad') || keywords.has('loss') || keywords.has('died')) {
    predictions.optional.push('grief', 'presence');
  }
  
  return predictions;
}
```

### Phase 4: Integration with Voice Agent

```typescript
// voice-agent-entry.ts - simplified
const gateway = ToolGateway.getInstance();

// At process start (once)
await gateway.warmup();

// At session start
await gateway.startSession(userId, sessionId, userProfile);

// Get tools for agent
const agent = new FerniAgent(systemPrompt, {
  tools: gateway.getSessionTools(),
});

// On each turn (called from transcript handler)
const turnUpdate = await gateway.onTurnStart(transcript);
if (turnUpdate.newlyLoaded.length > 0) {
  await updateAgentTools(agent, turnUpdate.toolsReady);
}
```

---

## Benefits

| Before | After |
|--------|-------|
| Tools load AFTER LLM responds | Tools ready BEFORE LLM responds |
| 3 different "essential" lists | Single `tool-tiers.json` |
| Reactive loading | Predictive prefetching |
| No observability | Full metrics on tool readiness |
| 5+ loading paths | 1 gateway interface |
| ~500ms tool loading latency | ~0ms for Tier 0, <100ms for Tier 1 |

## Migration Path

1. **Week 1**: Create `tool-tiers.json` and `ToolGateway` class
2. **Week 2**: Migrate `voice-agent-entry.ts` to use gateway
3. **Week 3**: Add predictive loading rules
4. **Week 4**: Remove old loading paths, add observability dashboard

---

## Open Questions

1. Should Tier 0 tools be compiled/bundled separately for faster startup?
2. How do we handle tools that require authentication (Spotify, Calendar)?
3. Should predictive rules be ML-based or rule-based?
4. How do we A/B test different tier configurations?
