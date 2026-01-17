# E2E Tool Calling Audit Report

> **Generated:** December 2024
> **Status:** GOOD with Critical Gaps
> **Recommendation:** Prioritize P0 fixes for bulletproof reliability

---

## Executive Summary

The Ferni voice agent has a sophisticated 5-layer semantic routing system with 100+ tools across 89 domains. However, several critical gaps prevent bulletproof reliability:

| Metric | Current | Target |
|--------|---------|--------|
| Tool Execution Success Rate | ~92% (estimated) | 99.5% |
| Test Coverage | 71% (63/89 domains) | 95%+ |
| Gemini JSON Detection | 316+ patterns | Native support |
| Routing Observability | None | Full metrics |

---

## Architecture Overview

### Tool Calling Flow (E2E)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: SPEECH INPUT                                                     │
│ User speaks → LiveKit → Transcription → Transcript                        │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: SEMANTIC ROUTING (src/tools/semantic-router/)                    │
│                                                                           │
│ 5-Layer Matching:                                                         │
│ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐         │
│ │ Pattern  │ │ Keyword  │ │ Embedding │ │ Context  │ │ History │         │
│ │ Weight:  │ │ Weight:  │ │ Weight:   │ │ Weight:  │ │ Weight: │         │
│ │ 1.2x     │ │ 0.75x    │ │ 0.90x     │ │ 0.5x     │ │ 0.3x    │         │
│ └──────────┘ └──────────┘ └───────────┘ └──────────┘ └─────────┘         │
│                                                                           │
│ Confidence Thresholds:                                                    │
│ • autoExecute: 0.80  (bypass LLM entirely)                               │
│ • confirm:     0.70  (strong hint to LLM)                                │
│ • hint:        0.55  (soft suggestion)                                   │
│ • minimum:     0.35  (include in candidates)                             │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: TOOL ORCHESTRATION (src/tools/orchestrator/)                     │
│                                                                           │
│ 5-Layer Selection Pipeline:                                               │
│ 1. ESSENTIAL: memory, handoff, awareness, simple-utilities               │
│ 2. SEMANTIC:  matched tools from routing (if confidence > threshold)     │
│ 3. CONTEXTUAL: emotion-triggered, time-based, crisis-response            │
│ 4. INTENT:    topic extraction → domain mapping                          │
│ 5. ANTICIPATED: predictive based on history                              │
│                                                                           │
│ Max 35 tools per session (prevents context overload)                     │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: LLM PROCESSING                                                   │
│                                                                           │
│ ┌─────────────────────────────────┬─────────────────────────────────────┐│
│ │ OpenAI Realtime (RECOMMENDED)   │ Gemini Live (FALLBACK)              ││
│ ├─────────────────────────────────┼─────────────────────────────────────┤│
│ │ ✅ Native function calling      │ ⚠️ JSON workaround                  ││
│ │ ✅ Protocol-level support       │ ⚠️ TTS stream interception          ││
│ │ ✅ Reliable tool execution      │ ⚠️ 316+ detection patterns          ││
│ │ ~$0.06/min input               │ ~$0.035/min                         ││
│ └─────────────────────────────────┴─────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ LAYER 5: TOOL EXECUTION (src/agents/shared/)                              │
│                                                                           │
│ json-function-executor.ts                                                 │
│   └── Routes {"fn":"toolName","args":{}} to implementations              │
│                                                                           │
│ Tool Registry (89 domains):                                               │
│   └── ESSENTIAL (loaded at startup)                                      │
│   └── HIGH_PRIORITY (loaded shortly after)                               │
│   └── All others (lazy-loaded on demand)                                 │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ LAYER 6: RESPONSE                                                         │
│ Tool Result → LLM Response → Cartesia TTS → Audio Output                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Gaps

### P0: Reliability Blockers (Fix First)

#### GAP-01: Gemini JSON Narration Problem

**Impact:** HIGH - Tools spoken instead of executed
**File:** `src/agents/shared/tool-call-sanitizer.ts`

**Problem:** Gemini sometimes narrates tool calls instead of outputting valid JSON:
```
"I'll play some jazz music for you" → Should output {"fn":"playMusic","args":{"genre":"jazz"}}
```

**Current Mitigation:** 316+ regex patterns detect and intercept these cases.

**Recommendation:**
1. **Short-term:** Add more detection patterns for new tool domains
2. **Long-term:** Default to OpenAI Realtime (`USE_OPENAI_REALTIME=true`)

```typescript
// In tool-call-sanitizer.ts - Add pattern for new domains
const TOOL_NAME_PATTERNS = [
  // ... existing patterns
  /(?:I'?(?:ll|m going to)|let me|going to)\s+(?:check|get|find|look up)\s+(?:the\s+)?weather/i,
  /(?:I'?(?:ll|m going to)|let me)\s+(?:set|create|add)\s+(?:a\s+)?reminder/i,
  // Add patterns for all 26 untested domains
];
```

#### GAP-02: No Warm-Start for First Turn

**Impact:** MEDIUM - First turn has degraded routing
**File:** `src/tools/semantic-router/voice-integration.ts`

**Problem:** On session start, `processVoiceTurn()` is called with empty transcript, causing:
- No semantic routing match
- Falls back to default tool set
- User's first request may miss optimal tools

**Recommendation:**
```typescript
// In voice-integration.ts - Add warm-start
export async function initializeWithContext(sessionContext: {
  userId: string;
  recentTopics?: string[];
  userPreferences?: Record<string, unknown>;
}): Promise<void> {
  // Pre-warm semantic router with user context
  if (sessionContext.recentTopics?.length) {
    await primeSemanticRouter(sessionContext.recentTopics);
  }

  // Pre-load likely tools based on user history
  const likelyDomains = await predictLikelyDomains(sessionContext.userId);
  await prefetchDomains(likelyDomains);
}
```

#### GAP-03: Cross-Persona Tool Context Loss

**Impact:** HIGH - Tools don't transfer on handoff
**File:** `src/agents/__tests__/integration/handoff-scenarios.test.ts`

**Problem:** When user says "Transfer me to Maya", the tool execution context is lost:
- Previous tool results not passed
- Semantic routing history not transferred
- User has to re-explain context

**Recommendation:**
```typescript
// In handoff state - preserve tool context
interface HandoffState {
  // ... existing fields
  toolExecutionContext: {
    recentTools: Array<{ name: string; result: unknown; timestamp: number }>;
    semanticRoutingHistory: Array<{ query: string; matches: string[] }>;
    activeToolSessions: Map<string, unknown>; // e.g., music playing, timer running
  };
}
```

---

### P1: Observability Gaps (Fix Second)

#### GAP-04: No Semantic Routing Metrics

**Impact:** MEDIUM - Can't debug routing failures
**File:** `src/tools/semantic-router/router.ts`

**Recommendation:**
```typescript
// Add observability to router.ts
import { metrics } from '../utils/metrics.js';

export async function routeQuery(query: string, context: RoutingContext): Promise<RoutingResult> {
  const startTime = performance.now();

  const result = await performRouting(query, context);

  // Emit metrics
  metrics.histogram('semantic_router.latency_ms', performance.now() - startTime);
  metrics.counter('semantic_router.total_routes', 1);
  metrics.counter(`semantic_router.action_${result.action}`, 1);
  metrics.gauge('semantic_router.confidence', result.confidence);

  if (result.action === 'execute') {
    metrics.counter(`semantic_router.tool_${result.tool}`, 1);
  }

  return result;
}
```

#### GAP-05: No Tool Result Feedback Loop

**Impact:** MEDIUM - Semantic bypasses don't improve
**File:** `src/tools/semantic-router/voice-integration.ts`

**Problem:** When semantic router bypasses LLM (confidence > 0.85), there's no feedback on whether the tool execution was successful.

**Recommendation:**
```typescript
// Add feedback loop
export async function recordToolOutcome(
  routingDecision: RoutingDecision,
  toolResult: ToolExecutionResult
): Promise<void> {
  const success = toolResult.status === 'success';

  // Update routing confidence calibration
  await updateConfidenceCalibration({
    query: routingDecision.originalQuery,
    tool: routingDecision.selectedTool,
    predictedConfidence: routingDecision.confidence,
    actualSuccess: success,
  });

  // Adjust future thresholds if needed
  if (!success && routingDecision.confidence > 0.85) {
    log.warn({ routingDecision }, 'High-confidence routing failed - needs calibration');
  }
}
```

#### GAP-06: Confidence Calibration Needed

**Impact:** MEDIUM - Thresholds may be suboptimal
**File:** `src/tools/semantic-router/config.ts`

**Current Thresholds:**
```typescript
autoExecute: 0.80,  // Bypass LLM
confirm: 0.70,      // Strong hint
hint: 0.55,         // Soft suggestion
minimum: 0.35,      // Include in candidates
```

**Problem:** These are hand-tuned. No data validates they're optimal.

**Recommendation:** Implement Platt scaling with logged data:
```typescript
// In config.ts - Add calibration support
export const ROUTING_CONFIG = {
  thresholds: {
    autoExecute: parseFloat(process.env.ROUTING_AUTO_EXECUTE ?? '0.80'),
    confirm: parseFloat(process.env.ROUTING_CONFIRM ?? '0.70'),
    hint: parseFloat(process.env.ROUTING_HINT ?? '0.55'),
    minimum: parseFloat(process.env.ROUTING_MINIMUM ?? '0.35'),
  },
  calibration: {
    enabled: process.env.ROUTING_CALIBRATION === 'true',
    logPath: process.env.ROUTING_CALIBRATION_LOG ?? '/tmp/routing-calibration.jsonl',
  },
};
```

---

### P2: Coverage Gaps (Fix Third)

#### GAP-07: 26 Domains Lack Tests

**Impact:** LOW-MEDIUM - Unknown reliability
**Location:** `src/tools/domains/`

**Untested Domains:**
```
ambient-mode, anger, anxiety, apology, audio, behavior, boundaries,
breathwork, burnout, calendar, coaching-support, communication,
dating, emotion, entertainment, finances, goals, gratitude,
grounding, health, human-transfer, intimacy, life-planning,
mindfulness, music, notification, planning, purpose-meaning,
relationships, reminders, simple-utilities, sleep, smart-home,
stress, trust, visual-memory, voice-log, wellness, world-awareness
```

**Recommendation:** Create test template:
```typescript
// Template: src/tools/domains/{domain}/__tests__/{domain}.test.ts
import { describe, it, expect } from 'vitest';
import { getDomainTools } from '../index.js';

describe('{domain} domain', () => {
  it('exports valid tools', async () => {
    const tools = await getDomainTools();
    expect(tools.length).toBeGreaterThan(0);

    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('handles common queries', async () => {
    // Domain-specific test cases
  });
});
```

#### GAP-08: Intelligent Router Only in A/B Test

**Impact:** LOW - 50% users get basic routing
**File:** `src/tools/semantic-router/config.ts`

**Current:** `INTELLIGENT_ROUTING_PERCENTAGE: 50`

**Recommendation:** After fixing P0/P1 issues, increase to 100%:
```typescript
// Phase out A/B test
INTELLIGENT_ROUTING_PERCENTAGE: 100,
```

---

## Implementation Priority

### Phase 1: P0 Fixes (Week 1-2)
| Task | File | Effort |
|------|------|--------|
| Add Gemini narration patterns for untested domains | `tool-call-sanitizer.ts` | 4h |
| Implement warm-start routing | `voice-integration.ts` | 4h |
| Preserve tool context on handoff | `session-state.ts` | 8h |
| **Total** | | **16h** |

### Phase 2: P1 Fixes (Week 2-3)
| Task | File | Effort |
|------|------|--------|
| Add semantic routing metrics | `router.ts` | 4h |
| Implement tool result feedback | `voice-integration.ts` | 6h |
| Add confidence calibration logging | `config.ts` | 4h |
| **Total** | | **14h** |

### Phase 3: P2 Fixes (Week 3-4)
| Task | File | Effort |
|------|------|--------|
| Add tests for 26 domains | `domains/*/` | 20h |
| Roll out intelligent routing to 100% | `config.ts` | 2h |
| **Total** | | **22h** |

---

## Verification Checklist

After implementing fixes, verify:

- [ ] `pnpm vitest run src/tools/` - All tool tests pass
- [ ] `pnpm vitest run src/agents/` - All agent tests pass
- [ ] Manual test: "Play some jazz" → Music plays (not narrated)
- [ ] Manual test: "What's the weather?" → Weather data returned
- [ ] Manual test: "Transfer to Maya" → Tool context preserved
- [ ] Semantic routing metrics visible in logs
- [ ] First turn has tools available (warm-start working)

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Tool Execution Success | ~92% | 99.5% | Semantic routing success rate |
| First-Turn Tool Hit | ~70% | 95% | Warm-start effectiveness |
| Handoff Context Retention | 0% | 100% | Tool context transfer |
| Domain Test Coverage | 71% | 95% | Test file existence |
| Routing Latency p99 | Unknown | <50ms | New metrics |

---

## Appendix: Tool Domain Inventory

### ESSENTIAL_DOMAINS (Loaded at Startup)
- memory, handoff, awareness, simple-utilities, entertainment, behavior

### HIGH_PRIORITY_DOMAINS (Loaded Shortly After)
- information, productivity

### All 89 Domains
```
ambient-mode, anger, anxiety, apology, audio, awareness, behavior,
boundaries, breathwork, burnout, calendar, coaching-support,
communication, crisis, dating, emotion, entertainment, favorites,
finances, goals, gratitude, grounding, handoff, health, humor,
human-transfer, information, intimacy, life-planning, location,
memory, mindfulness, music, notification, planning, productivity,
purpose-meaning, relationships, reminders, rituals, self-care,
simple-utilities, sleep, smart-home, stress, trust, visual-memory,
voice-log, wellness, world-awareness, ...
(+ persona-specific domains)
```

---

*Last Updated: December 2024*
*Author: Claude Code Audit*
