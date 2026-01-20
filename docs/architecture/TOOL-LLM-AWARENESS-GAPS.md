# Tool Routing & LLM Awareness Gaps

> **Audit Date:** January 2026
> **Goal:** Achieve "Better than Human" - LLM never hallucinates tool calls, always knows tool status

---

## Executive Summary

The current architecture has **significant blind spots** where the LLM operates without full context about tools. These gaps cause:

1. **Hallucinated tool calls** - LLM tries to call tools that don't exist or are unavailable
2. **Lost tool results** - LLM can't reference what it just did
3. **Race conditions** - LLM speaks while tools are still executing
4. **Silent failures** - Tools fail without LLM or user knowing

**Impact Score:** These gaps collectively affect ~25-30% of tool interactions.

---

## Architecture Overview: The Blind Spots

```
                      WHAT LLM KNOWS          WHAT LLM DOESN'T KNOW
                      ─────────────────       ──────────────────────
User Speech           ✅ Full transcript
      │
      ▼
Tool Selection        ✅ Selected tools        ❌ Why tools were filtered
(Orchestrator)                                 ❌ Service availability
      │                                        ❌ Domain loading failures
      ▼
Tool Execution        ✅ Tool was called       ❌ Tool is IN-FLIGHT (blocking)
(Executor)            ✅ Final result          ❌ Intermediate failures
      │                                        ❌ Parallel attempt status
      ▼                                        ❌ Timeout status
Result Processing     ✅ Current turn result   ❌ Previous tool results (HISTORY)
(generateReply)                                ❌ Learning loop status
      │                                        ❌ Session health state
      ▼
Response              ✅ What to say           ❌ That it just leaked a tool call
                                               ❌ That context was filtered
```

---

## Critical Gaps (P0 - Breaking "Better than Human")

### Gap #1: Tool Results NOT Stored in Chat History

**Location:** `src/agents/processors/ftis-v2-integration.ts`

**Problem:** Tool results are passed as ephemeral `instructions` parameter, NOT stored in chat history.

```typescript
// Current flow
generateReply(instructions: "You just played jazz music...", context)
// instructions are EPHEMERAL - not stored

// What happens next turn:
User: "What did you just do?"
LLM: ??? (no history of the tool call)
```

**Impact:**
- User asks "what did you just do?" - LLM can't answer
- Handoff to another persona - new persona doesn't know what happened
- Multi-turn flows break - each turn forgets previous tool results

**Fix Required:**
```typescript
// Store in conversation history
turnCtx.messages.push({
  role: 'tool_result',
  content: `[Tool: ${toolId}] Result: ${result}`,
  timestamp: Date.now(),
});
```

---

### Gap #2: LLM Doesn't Know Tool is In-Flight

**Location:** `src/tools/execution/semantic-tool-presence.ts`

**Problem:** When a tool starts executing, the LLM continues generating responses. No blocking mechanism.

```
Timeline:
  0ms: LLM calls playMusic()
 10ms: Tool starts executing
 50ms: LLM starts generating "I'm playing..."  ← RACE CONDITION
100ms: Tool still executing
200ms: LLM finishes speaking
500ms: Tool completes
        ↳ Result arrives but LLM already moved on
```

**Impact:**
- LLM might say "I'm playing jazz" before music actually plays
- If tool fails at 400ms, LLM already said it succeeded
- No way to say "just a moment while I..." and WAIT

**Fix Required:**
- Add `toolInFlight` state to LLM context
- Block `generateReply` until tool completes (or timeout)
- Or inject "I'm working on that..." placeholder

---

### Gap #3: Service Availability Not Propagated

**Location:** `src/tools/orchestrator/unified-tool-orchestrator.ts` lines 363-414

**Problem:** If Spotify/Twilio/Plaid isn't configured, tool is silently skipped. LLM doesn't know.

```typescript
// Current code
if (missingServices.length > 0) {
  skipped.push({ toolId: def.id, reason: `Missing services: ${missingServices.join(', ')}` });
  return false;  // Silent skip - LLM never knows
}
```

**Impact:**
- LLM shows `playMusic` in available tools
- User says "play jazz"
- Tool execution fails with "service not available"
- LLM has to recover mid-conversation

**Fix Required:**
```typescript
// Inject into system prompt or tool descriptions
const unavailableServices = ['Spotify', 'Plaid'];
systemPrompt += `\n\nUNAVAILABLE SERVICES: ${unavailableServices.join(', ')}. Do not offer features requiring these.`;
```

---

### Gap #4: Tool Timeout NOT Communicated

**Location:** `src/tools/execution/semantic-tool-presence.ts`

**Problem:** No timeout mechanism. If tool hangs, system hangs. LLM never gets "tool timed out" message.

```typescript
// Current code - NO TIMEOUT
const execution: ActiveToolExecution = {
  context,
  progressTimer: undefined,  // Only fires progress events
  progressCount: 0,
};
// If tool never completes, activeExecutions leaks memory
// LLM waits forever
```

**Impact:**
- External API call hangs for 30 seconds
- User sits in silence
- No fallback, no error message
- Session appears frozen

**Fix Required:**
```typescript
// Add timeout parameter
function startToolPresence(context, options: { timeoutMs: 10000 }) {
  setTimeout(() => {
    emit('timeout', { toolId, elapsed: 10000 });
    // Notify LLM: "Tool timed out, apologize and offer alternative"
  }, options.timeoutMs);
}
```

---

## High Priority Gaps (P1 - Degraded Experience)

### Gap #5: Silent Domain Loading Failures

**Location:** `src/tools/orchestrator/unified-tool-orchestrator.ts` lines 1177-1205

**Problem:** If a domain fails to load, tool is silently skipped with only debug log.

```typescript
try {
  const entry = await getToolEntry(match.toolId);
  if (entry?.domain) {
    domainsToLoad.add(entry.domain);
  }
} catch {
  // SILENT FAIL - tool just disappears from set
}
```

**Impact:**
- Semantic router matches `processGrief` at 95% confidence
- Domain fails to load (transient error)
- User gets conversation instead of grief support tool
- Opportunity lost

---

### Gap #6: Leakage Detection - LLM Unaware of Current Turn

**Location:** `src/agents/shared/session-health-monitor.ts` lines 145-170

**Problem:** When LLM speaks instead of calling tool (leakage), detection happens AFTER the fact.

```typescript
recordToolCallLeakage(sessionId, toolName);
// Logs: "🚨 TOOL CALL LEAKAGE DETECTED"
// Triggers refresh... for NEXT turn
// Current turn already ruined
```

**Impact:**
- LLM says "Here's the weather: {fn: getWeather}" (spoken literally)
- Leakage detected, context refreshed for next turn
- But THIS turn - user heard garbage

---

### Gap #7: Context Injection Filter Silently Discards

**Location:** `src/agents/processors/injection-filter.ts`

**Problem:** Important context (crisis detection, memory, cross-persona insights) gets filtered without LLM knowing.

```
20 injections generated:
  - Crisis detected: user mentioned "ending it all"  ← FILTERED (context limit)
  - Memory: user's mom is named Sarah              ← KEPT
  - Insight: user stressed about job              ← FILTERED (priority)

LLM receives 10 injections, never knows about crisis signal
```

**Impact:** Critical safety context could be silently dropped.

---

### Gap #8: FTIS V2 Fallback Loses Context

**Location:** `src/tools/intelligence/ftis-v2-executor.ts` lines 456-463

**Problem:** When FTIS V2 fails and falls back to LLM, it loses critical context.

```typescript
return {
  success: false,
  bypassLLM: false,  // Fall back to LLM
  // But LLM doesn't know:
  // - That FTIS classified at 93% confidence
  // - What tool ID was matched
  // - WHY execution failed (tool not found? args wrong?)
};
```

**Impact:** LLM might try a completely different tool instead of retrying the same one.

---

### Gap #9: Parallel Execution Status Hidden

**Location:** `src/agents/shared/parallel-tool-executor.ts`

**Problem:** When running parallel fallback attempts, intermediate failures are discarded.

```typescript
// Runs 2 attempts with 50ms stagger
// Discards first failure if second succeeds
// Or returns ONLY last failure if both fail
```

**Impact:**
- First attempt: auth error
- Second attempt: timeout
- Result: "timeout" (auth error lost)
- Can't diagnose flaky tools

---

## Medium Priority Gaps (P2 - Suboptimal Experience)

### Gap #10: Tool Timing Context Arrives Too Late

**Location:** `src/agents/voice-agent/tool-tracking-handler.ts` lines 394-410

**Problem:** Tool timing recorded AFTER LLM already processed result.

**Impact:** LLM can't say "that took longer than usual" or adjust expectations.

---

### Gap #11: Learning Loop is Fire-and-Forget

**Location:** `src/agents/shared/json-function-executor.ts` lines 65-99

**Problem:** Semantic learning recording happens async, failures silently caught.

**Impact:** Future tool selection uses incomplete data.

---

### Gap #12: Tool Deduplication is Silent

**Location:** `src/tools/utils/tool-call-sanitizer.ts`

**Problem:** If tool called twice rapidly, second is deduplicated silently.

**Impact:** LLM might be waiting for second result that will never arrive.

---

### Gap #13: EnabledDomains Filter Not Consistently Applied

**Location:** `src/tools/orchestrator/unified-tool-orchestrator.ts`

**Problem:** Admin sets `enabledDomains: ['music', 'calendar']` but semantic router can still return grief tools.

**Impact:** Admin restrictions bypassed.

---

## Recommendations Summary

| Priority | Gap | Fix | Effort |
|----------|-----|-----|--------|
| **P0** | Tool results not in history | Add `tool_result` role to messages | 4-8 hours |
| **P0** | No in-flight blocking | Add `toolInFlight` state machine | 1-2 days |
| **P0** | Service availability hidden | Inject unavailable services into prompt | 2-4 hours |
| **P0** | No tool timeout | Add `timeoutMs` to presence tracker | 4-8 hours |
| **P1** | Silent domain failures | Log as WARNING, add to unavailable list | 2-4 hours |
| **P1** | Leakage detection delayed | Inject leakage warning BEFORE next generateReply | 4-8 hours |
| **P1** | Context filter silent | Add summary of filtered injections | 4-8 hours |
| **P1** | FTIS fallback loses context | Include classification details in fallback | 2-4 hours |
| **P1** | Parallel status hidden | Preserve all attempt results | 2-4 hours |
| **P2** | Tool timing late | Record timing before generateReply | 1-2 hours |
| **P2** | Learning fire-and-forget | Make blocking for critical tools | 4-8 hours |
| **P2** | Deduplication silent | Emit dedupe event | 1-2 hours |
| **P2** | EnabledDomains inconsistent | Wrap query() with filter | 2-4 hours |

---

## Proposed Architecture: Full Tool Awareness

```
                     ┌─────────────────────────────┐
                     │    LLM AWARENESS LAYER      │
                     │  (Single Source of Truth)   │
                     └─────────────────────────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
       ▼                           ▼                           ▼
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│ AVAILABLE   │           │ IN-FLIGHT   │           │ COMPLETED   │
│ TOOLS       │           │ TOOLS       │           │ HISTORY     │
├─────────────┤           ├─────────────┤           ├─────────────┤
│ • Tool list │           │ • Currently │           │ • Past N    │
│ • Services  │           │   executing │           │   results   │
│   status    │           │ • Timeout   │           │ • Errors    │
│ • Domain    │           │   countdown │           │ • Timing    │
│   health    │           │ • Progress  │           │ • Outcomes  │
└─────────────┘           └─────────────┘           └─────────────┘
       │                           │                           │
       └───────────────────────────┼───────────────────────────┘
                                   │
                     ┌─────────────────────────────┐
                     │       INJECT TO LLM         │
                     │  (System prompt + context)  │
                     └─────────────────────────────┘
```

---

## Verification Checklist

After implementing fixes:

- [ ] User asks "what did you just do?" → LLM can explain
- [ ] Tool takes 10+ seconds → User gets progress feedback
- [ ] Service unavailable → LLM doesn't offer that tool
- [ ] Tool times out → User gets apology + alternative
- [ ] Domain fails to load → Logged as warning, LLM informed
- [ ] Tool call leaks → Current turn gets warning injection
- [ ] Admin restricts domains → Restriction enforced everywhere
- [ ] FTIS falls back → LLM knows what was tried

---

## Files to Modify

| File | Change |
|------|--------|
| `src/agents/processors/ftis-v2-integration.ts` | Store tool results in history |
| `src/agents/voice-agent/turn-handler.ts` | Add tool-in-flight blocking |
| `src/tools/orchestrator/unified-tool-orchestrator.ts` | Propagate service status |
| `src/tools/execution/semantic-tool-presence.ts` | Add timeout mechanism |
| `src/agents/shared/session-health-monitor.ts` | Inject leakage warnings immediately |
| `src/agents/processors/injection-filter.ts` | Log filtered context summary |
| `src/tools/intelligence/ftis-v2-executor.ts` | Include classification in fallback |
| `src/agents/shared/parallel-tool-executor.ts` | Preserve all attempt results |

---

*Last Updated: January 2026*
