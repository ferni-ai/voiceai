# Better Than Human Memory - Action Plan

> **Quick wins vs. larger refactors for superhuman memory integration**

---

## Current State Summary

✅ **What's Working:**

- Memory tools exist and are voice-callable (9 tools in `domains/memory/`)
- Vector store with semantic search operational
- 19 superhuman services available
- Context builders inject memory into LLM prompts
- Semantic router handles pre-LLM tool selection

🟡 **What Needs Integration:**

- Memory context doesn't inform tool selection
- LLM doesn't proactively call memory tools
- Cross-session threading is weak
- Memory consolidation is incomplete
- No feedback loop for memory quality

---

## Quick Wins (1-3 Days Each)

### Win 1: Memory Hints in Tool Selection ⭐ HIGH IMPACT

**Problem:** Semantic router doesn't know user's memory when selecting tools.

**Solution:** Add memory context to semantic routing.

**File:** `src/tools/semantic-router/voice-integration.ts`

```typescript
// BEFORE: Route without memory context
const routingResult = activeRouter.route(inputText, { userId, sessionId, personaId });

// AFTER: Route with memory context
const memoryHints = await getMemoryHintsForRouting(userId, inputText);
const routingResult = activeRouter.route(inputText, {
  userId,
  sessionId,
  personaId,
  memoryContext: memoryHints, // NEW: Pass memory context
});
```

**Implementation (~2 hours):**

1. Add `getMemoryHintsForRouting()` that does quick semantic search
2. Pass hints to router
3. Boost tool confidence when memory supports it

---

### Win 2: Always-Include Memory Tools ⭐ HIGH IMPACT

**Problem:** Memory tools only available when LLM decides to call them.

**Solution:** Add memory tools to `includedTools` in config.

**File:** `data/model-config.json`

```json
{
  "toolDefaults": {
    "includedTools": [
      "playMusic",
      "musicControl",
      "getNews",
      "getWeather",
      "setReminder",
      "recallFromMemory", // NEW: Always include recall
      "surfaceRelevantMemory", // NEW: Always include proactive surfacing
      "recallPreviousConversation" // NEW: Always include semantic recall
    ]
  }
}
```

**Impact:** Memory tools always available to LLM, not just when semantically matched.

---

### Win 3: Proactive Memory Trigger on Topic Match ⭐ MEDIUM IMPACT

**Problem:** Context builders inject memory passively; no active triggering.

**Solution:** When turn analysis detects topics that match memories, inject a proactive prompt.

**File:** `src/agents/processors/turn-processor.ts`

```typescript
// In buildContextInjections():
const proactiveMemory = await checkProactiveMemoryTrigger(
  analysis.topics.detected,
  services.userId
);

if (proactiveMemory) {
  injections.push({
    category: 'proactive_memory',
    content: `[MEMORY CONNECTION] You remember: "${proactiveMemory.memory}". 
              This connects to what they're discussing. Consider naturally weaving it in.`,
    priority: 75,
  });
}
```

**Implementation (~3 hours):**

1. Add `checkProactiveMemoryTrigger()` to search memories by detected topics
2. Format result for natural LLM injection
3. Track what's been surfaced to avoid repetition

---

### Win 4: Memory Quality Tracking

**Problem:** No feedback on whether memory recalls are accurate/helpful.

**Solution:** Track user responses to memory recalls.

**File:** `src/services/superhuman/semantic-intelligence/memory-quality-tracker.ts` (new)

```typescript
interface MemoryQualitySignal {
  memoryId: string;
  surfacedAt: Date;
  userResponse: 'confirmed' | 'corrected' | 'ignored' | 'expanded';
  responseLatency: number;
}

// After surfacing a memory, analyze user's response
function analyzeUserResponseToMemory(
  memoryId: string,
  userText: string,
  priorContext: string
): MemoryQualitySignal['userResponse'] {
  // Detect: "Yes, exactly!" vs "No, actually..." vs topic change
}
```

**Impact:** Learn which memories are valuable to surface.

---

### Win 5: Commitment Follow-up Automation

**Problem:** Commitment follow-ups are context-injected but not proactively triggered.

**Solution:** Add commitment tool to `includedTools` and enhance context injection.

**File:** `data/model-config.json`

```json
"includedTools": [
  // ... existing ...
  "checkCommitment",     // NEW: Check on promises
  "predictUserNeed"      // NEW: Anticipate needs
]
```

**Plus:** Enhance commitment context builder to be more explicit:

```typescript
// In src/services/superhuman/commitment-keeper.ts
const followUpContext = `
[COMMITMENT FOLLOW-UP AVAILABLE]
Use checkCommitment("${commitment.content}") to naturally ask how it's going.
Last discussed: ${daysSince} days ago
`;
```

---

## Medium Efforts (1-2 Weeks)

### Effort 1: Cross-Session Thread Continuity

**Problem:** Sessions are isolated; dots aren't connected.

**Solution:** Thread continuity service that tracks open questions.

**Files:**

- `src/services/cross-session-threads.ts` (new)
- `src/intelligence/context-builders/thread-context.ts` (enhance)

**Features:**

- Detect when topics are left unresolved
- Track "open questions" across sessions
- Inject relevant threads at session start
- Update thread state after resolution

---

### Effort 2: Memory Consolidation Background Job

**Problem:** Many overlapping memories, no cleanup.

**Solution:** Background job to consolidate and decay memories.

**Files:**

- `src/memory/memory-consolidator.ts` (enhance existing)
- `src/services/scheduled-jobs/memory-maintenance.ts` (new)

**Features:**

- Cluster semantically similar memories
- Merge duplicates with preservation of key details
- Apply temporal decay with emotional boosting
- Run nightly via Cloud Scheduler

---

### Effort 3: Memory-Aware Semantic Router

**Problem:** Semantic router doesn't consider user history.

**Solution:** Router layer that incorporates memory embeddings.

**File:** `src/tools/semantic-router/memory-enhanced-matcher.ts` (new)

```typescript
function enhanceMatchWithMemory(match: ToolMatch, userMemories: MemoryVector[]): ToolMatch {
  // If tool relates to a memory topic, boost confidence
  const memoryRelevance = calculateMemoryRelevance(match.toolId, userMemories);
  return {
    ...match,
    confidence: match.confidence + memoryRelevance * 0.1, // Up to 10% boost
  };
}
```

---

## Large Efforts (Month+)

### Effort 1: ML-Based Memory Surfacing

**Problem:** Rule-based surfacing isn't optimal.

**Solution:** Train model on memory surfacing success/failure signals.

**Approach:**

1. Collect data: memory surfaced, user response, engagement metrics
2. Train classifier: "Is this a good moment to surface this memory?"
3. Deploy as scoring function in context builders

---

### Effort 2: Memory Explanation UI

**Problem:** Users can't see what Ferni remembers.

**Solution:** "What Ferni Knows" feature in app.

**Features:**

- View memories organized by topic
- Correct/delete memories
- See "how Ferni connects dots"
- Privacy controls

---

### Effort 3: A/B Testing Memory Strategies

**Problem:** Don't know which surfacing strategies work best.

**Solution:** A/B test framework for memory behaviors.

**Variants:**

- Proactive vs. reactive surfacing
- High vs. low surfacing frequency
- Topic-triggered vs. time-triggered

---

## Implementation Priority

| Priority | Item                                  | Impact | Effort  | Dependency |
| -------- | ------------------------------------- | ------ | ------- | ---------- |
| 1        | Win 2: Always-Include Memory Tools    | High   | Trivial | None       |
| 2        | Win 1: Memory Hints in Tool Selection | High   | Low     | None       |
| 3        | Win 5: Commitment Follow-up           | High   | Low     | None       |
| 4        | Win 3: Proactive Memory Trigger       | Medium | Low     | Wins 1-2   |
| 5        | Win 4: Memory Quality Tracking        | Medium | Medium  | Win 3      |
| 6        | Effort 1: Cross-Session Threads       | High   | Medium  | Wins 1-4   |
| 7        | Effort 2: Memory Consolidation        | Medium | Medium  | None       |
| 8        | Effort 3: Memory-Aware Router         | High   | High    | Effort 1   |

---

## Immediate Next Steps

### Today (30 minutes):

1. ✅ Update `model-config.json` to include memory tools
2. ✅ Test that memory tools are now always available

### This Week:

1. Implement Win 1: Memory hints in routing
2. Implement Win 3: Proactive memory triggers
3. Add commitment tools to included list

### Next Week:

1. Design cross-session thread data model
2. Start memory quality tracking
3. Plan consolidation background job

---

## Measuring Success

| Metric                          | Current | Target         | How to Measure         |
| ------------------------------- | ------- | -------------- | ---------------------- |
| Memory tool calls/session       | ~0.1    | ~1.5           | Analytics              |
| User confirms memory            | N/A     | >90%           | Quality tracker        |
| Cross-session callbacks         | ~0.3    | ~2.0           | Context injection logs |
| "How did you remember?" moments | N/A     | 5/100 sessions | Sentiment analysis     |

---

_Created: December 31, 2024_
