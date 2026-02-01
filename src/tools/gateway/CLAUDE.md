# Tool Gateway Module

> **The single source of truth for tool loading in Ferni.**

## Enable the Gateway

```bash
# Enable via environment variable
USE_TOOL_GATEWAY=true pnpm dev
```

## Why This Exists

Previously, tools loaded AFTER the LLM responded because we had:
- 3 different "essential" domain lists
- 5+ different loading paths
- Reactive loading (detect topic → load tools → too late!)

The Tool Gateway fixes this by:
1. **Single source of truth**: `tool-tiers.json` defines all loading behavior
2. **Zero-latency config**: Compiled TypeScript (no JSON parsing at runtime!)
3. **Tiered loading**: Instant → Preloaded → Predictive → On-Demand
4. **Predictive prefetching**: Tools load BEFORE the LLM needs them
5. **Pre-computed embeddings**: Microsecond semantic matching
6. **One interface**: All tool access goes through `getToolGateway()`

## Quick Reference

| File | Purpose |
|------|---------|
| `tool-gateway.ts` | Main gateway class |
| `tool-tiers.json` | Configuration (EDIT THIS to change tool loading) |
| `tool-tiers.generated.ts` | Auto-generated TypeScript from `tool-tiers.json` (do NOT edit) |
| `index.ts` | Re-exports |
| `codegen/generate-tiers.ts` | Script that generates `tool-tiers.generated.ts` |

### Codegen Process

`tool-tiers.generated.ts` is auto-generated from `tool-tiers.json` for zero-latency config at runtime (no JSON parsing). After editing `tool-tiers.json`, regenerate:

```bash
npx tsx src/tools/gateway/codegen/generate-tiers.ts
```

## Tiered Loading

| Tier | Name | Load Time | When | Examples |
|------|------|-----------|------|----------|
| **0** | Instant | 0ms | Process start | playMusic, transferAgent, rememberFact |
| **1** | Preloaded | <100ms | Session start | calendar, telephony, habits, productivity |
| **2** | Predictive | <500ms | Context-based | grief (when sad), career (when job mentioned) |
| **3** | On-Demand | <2000ms | Explicit need | legal-admin, estate-planning |

## Usage

```typescript
import { getToolGateway } from '../tools/gateway/index.js';

// At application startup (ONCE)
const gateway = getToolGateway();
await gateway.warmup(); // Loads Tier 0

// When user connects
await gateway.startSession(userId, sessionId, {
  hasCalendarLinked: true,
  hasSpotifyLinked: false,
});

// Get tools for LLM
const tools = gateway.getSessionTools(); // Returns Tier 0 + 1 + 2

// On each turn (BEFORE LLM responds)
const update = await gateway.onTurnStart(transcript);
// update.newlyLoaded = domains loaded sync for this turn
// update.prefetching = domains being loaded async

// Check if specific tool is ready
if (gateway.isToolReady('playMusic')) {
  // Safe to expect playMusic to work
}

// Get metrics
const metrics = gateway.getMetrics();
// { tier0Count, tier1Count, tier2Count, loadTimes, predictions }
```

## Adding a Tool to a Tier

Edit `tool-tiers.json`:

```json
{
  "tiers": {
    "instant": {
      "domains": ["memory", "handoff", "entertainment"],
      "criticalTools": ["playMusic", "musicControl"]  // Add here for instant loading
    },
    "preloaded": {
      "domains": ["calendar", "telephony"],  // Add domain here for session-start loading
    },
    "predictive": {
      "rules": [
        {
          "id": "my-rule",
          "triggers": ["keyword1", "keyword2"],  // Add trigger words
          "domains": ["my-domain"],               // Domains to prefetch
          "priority": "high"                      // "high" = sync, "medium"/"low" = async
        }
      ]
    }
  }
}
```

## Predictive Rules

Rules in `tool-tiers.json` that trigger tool prefetching:

| Rule ID | Triggers | Domains | Priority |
|---------|----------|---------|----------|
| `grief-support` | sad, loss, died, death | grief, meaning, presence | high |
| `career-help` | job, career, interview | career, decisions, learning | medium |
| `anxiety-support` | anxious, panic, stressed | presence, breathing, crisis | high |
| `late-night` | (hours 22-5) | presence, sleep-support | low |

## Migration from Old System

The old system had:
- `ESSENTIAL_DOMAINS` in `registry/loader.ts`
- `DEFAULT_ESSENTIAL_DOMAINS` in `dynamic-loader/topic-mappings.ts`
- `buildEssentialTools()` in `builder.ts`

These are now DEPRECATED. Use:
```typescript
// OLD (don't use)
import { ESSENTIAL_DOMAINS } from '../registry/loader.js';

// NEW (use this)
import { getToolGateway } from '../gateway/index.js';
const tools = getToolGateway().getSessionTools();
```

## Observability

```typescript
const metrics = gateway.getMetrics();

// metrics = {
//   tier0Count: 15,        // Always-loaded tools
//   tier1Count: 42,        // Session tools
//   tier2Count: 8,         // Predictive tools
//   totalTools: 65,
//   loadTimes: {
//     tier0Ms: 120,        // How long warmup took
//     tier1Ms: 85,         // How long session start took
//     tier2Ms: 45,         // How long predictive loads took
//   },
//   predictions: {
//     totalPredictions: 23,     // Times we tried to predict
//     successfulPredictions: 21, // Times we loaded right tools
//     missedPredictions: 2,      // Times user needed tool we didn't have
//   }
// }
```

## Testing

```bash
# Run gateway tests
pnpm vitest run src/tools/gateway/__tests__/
```

## Architecture Diagram

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
    │ playMusic     │           │ calendar      │           │ grief tools   │
    │ transferAgent │           │ telephony     │           │ career tools  │
    │ rememberFact  │           │ habits        │           │ crisis tools  │
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
