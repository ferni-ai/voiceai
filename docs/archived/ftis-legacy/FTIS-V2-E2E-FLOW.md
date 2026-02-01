# FTIS V2 End-to-End Architecture

## The Core Innovation

**We trained 11 ONNX models to replace LLM tool selection entirely.**

Instead of asking Gemini/OpenAI to decide which tool to call, we:
1. Classify intent ourselves with 93%+ accuracy
2. Execute tools directly
3. Tell the LLM "here's what happened, respond naturally"

This removes the JSON workaround AND native function calling dependency.

---

## Data Flow: User Speech → Tool Execution → Response

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER SPEAKS                                        │
│                    "Play some jazz music"                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. FTIS V2 CLASSIFICATION (ftis-classifier-v2.ts)                           │
│    ├─ Stage 1 ONNX: media (95% confidence)                                  │
│    └─ Stage 2 ONNX: play_music (92% confidence)                             │
│    └─ Combined: 87% confidence → ABOVE THRESHOLD (0.85)                     │
│    └─ Tool IDs: ["playMusic", "spotifyPlay", ...]                           │
│    └─ Latency: ~20ms                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. ARGUMENT EXTRACTION (ftis-v2-executor.ts)                                │
│    ├─ Query: "play some jazz music"                                         │
│    ├─ Category: play_music                                                  │
│    └─ Extracted args: { query: "jazz" }                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. DIRECT TOOL EXECUTION (domain-bridge.ts)                                 │
│    ├─ Tool: playMusic                                                       │
│    ├─ Args: { query: "jazz" }                                               │
│    └─ Result: { success: true, naturalResponse: "Now playing Jazz Vibes" }  │
│                                                                             │
│    ⚠️ NO LLM INVOLVED IN TOOL SELECTION OR EXECUTION!                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. RESULT INJECTION TO LLM (ftis-v2-integration.ts)                         │
│    ├─ Format:                                                               │
│    │   [TOOL_RESULT: playMusic]                                             │
│    │   Status: SUCCESS                                                      │
│    │   Result: Now playing Jazz Vibes by Miles Davis                        │
│    │   [RESPOND NATURALLY to this result]                                   │
│    │                                                                        │
│    └─ LLM ONLY responds to the result - doesn't call tools!                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. LLM NATURAL RESPONSE                                                     │
│    └─ "Here we go, some jazz coming up!"                                    │
│                                                                             │
│    LLM uses: ftis-v2-instructions.md (NOT function-calling-base.md!)        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. USER HEARS                                                               │
│    "Here we go, some jazz coming up!" + 🎵 Music starts playing             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/tools/intelligence/ftis-classifier-v2.ts` | ONNX inference (11 models) |
| `src/tools/intelligence/ftis-v2-executor.ts` | Argument extraction + direct execution |
| `src/agents/processors/ftis-v2-integration.ts` | Turn processor integration |
| `src/personas/bundles/shared/ftis-v2-instructions.md` | LLM instructions for FTIS V2 mode |
| `models/ftis-merged/` | 11 trained ONNX models |
| `models/ftis-merged/category_to_tools.json` | Category → Tool ID mapping |

---

## Environment Configuration

```bash
# Enable FTIS V2 Only Mode
FTIS_V2_ONLY_MODE=true

# This disables:
# - Native function calling (OpenAI/Gemini)
# - JSON workaround
# - function-calling-base.md instructions

# This enables:
# - FTIS V2 classification for ALL tool requests
# - Direct tool execution
# - ftis-v2-instructions.md for LLM
```

---

## Confidence Thresholds

| Confidence | Action |
|------------|--------|
| ≥ 0.85 | **Direct execution** - Bypass LLM entirely |
| 0.50 - 0.85 | **Tool hint** - Add hint to LLM context |
| < 0.50 | **Conversation** - Pure LLM response |

---

## The 11 ONNX Models

### Stage 1: Super-Category Classifier
- Input: User query
- Output: 1 of 10 super-categories
- Accuracy: 97%

### Stage 2: Fine-Category Classifiers (10 models)
| Super-Category | Fine Categories | Accuracy |
|----------------|-----------------|----------|
| calendar | alarm_set, timer_set, reminder_set, calendar_* | 98% |
| communication | call_make, message_send, email_* | 98% |
| emotional | crisis_support, calm_support, coaching_*, grief_* | 94% |
| finance | budget, bills, ... | 96% |
| health | activity_log, habit_*, routine_*, sleep | 92% |
| home | lights, thermostat, locks, garage | 98% |
| media | play_music, music_control, find_music | 95% |
| productivity | item_add, todo_*, save_info, memory_* | 94% |
| system | time, date, capabilities, handoff_* | 99% |
| travel | weather, directions, travel_plan, flights | 99% |

**Combined accuracy: 93%+**

---

## What This Replaces

### OLD: JSON Workaround (Gemini)
```
User: "Play jazz"
LLM outputs: {"fn":"playMusic","args":{"query":"jazz"}}
Sanitizer intercepts → executes → tells LLM
LLM responds
```

### OLD: Native Function Calling (OpenAI)
```
User: "Play jazz"
OpenAI calls playMusic natively
Tool executes
We call generateReply to tell LLM about result
LLM responds
```

### NEW: FTIS V2 Direct Execution
```
User: "Play jazz"
FTIS V2 classifies: media/play_music (93%)
We execute playMusic directly
Result injected into LLM context
LLM responds naturally
```

**No JSON. No native FC. Just classification + direct execution.**

---

## Testing

### Run Synthetic Tests
```bash
# Full FTIS V2 E2E test suite
pnpm vitest run src/tests/synthetic/ftis-v2-direct-execution.test.ts

# With verbose output
pnpm vitest run src/tests/synthetic/ftis-v2-direct-execution.test.ts --reporter=verbose

# Run all FTIS tests
pnpm vitest run --grep "FTIS"
```

### Test Cases Covered
- Argument extraction for 8 categories
- Direct execution success/failure
- Result formatting for LLM
- Turn processor integration
- Full E2E flow

### Expected Log Output
```
🧠 FTIS V2: play_music (93%)
🎯 FTIS V2 Direct Execution: playMusic
✅ FTIS V2 Direct Execution: playMusic succeeded
```

---

## LLM Instructions Comparison

### OLD: function-calling-base.md
- Teaches LLM to output JSON
- 500+ lines of tool examples
- LLM decides when to call tools

### NEW: ftis-v2-instructions.md
- Tools execute automatically
- LLM just responds to results
- ~100 lines, much simpler

---

## Migration Path

1. **Enable FTIS V2 Only Mode**: `FTIS_V2_ONLY_MODE=true`
2. **Prompt Loader** will automatically:
   - Skip `function-calling-base.md`
   - Skip `function-calling-specialty.md`
   - Include `ftis-v2-instructions.md`
3. **Turn Processor** will:
   - Run FTIS V2 classification
   - Execute tools directly for high confidence
   - Inject results into LLM context

---

## Observability

### Metrics to Watch
```bash
# Check FTIS V2 classification stats
curl -s http://localhost:3002/api/observability | jq '.ftisV2'
```

Expected output:
```json
{
  "totalClassifications": 1234,
  "directExecutions": 1056,
  "directExecutionRate": 0.856,
  "avgLatencyMs": 23,
  "fallbackUsageRate": 0.08,
  "confidenceDistribution": {
    "high": 0.72,
    "medium": 0.21,
    "low": 0.07
  }
}
```

### Log Traces
| Trace | Meaning |
|-------|---------|
| `FTIS_V2_CLASSIFY` | Classification completed |
| `FTIS_V2_DIRECT_EXEC` | Direct execution started |
| `FTIS_V2_EXEC_SUCCESS` | Tool executed successfully |
| `FTIS_V2_EXEC_FAIL` | Execution failed, falling back |

---

## Summary

| Aspect | Old (Workaround) | New (FTIS V2) |
|--------|------------------|---------------|
| Tool Selection | LLM decides | ONNX classifies |
| Tool Execution | After LLM output | Before LLM |
| LLM Role | Call tools + respond | Just respond |
| Instructions | 500+ lines | ~100 lines |
| Latency | 200-500ms (LLM) | ~20ms (ONNX) |
| Accuracy | Varies | 93%+ |
| Dependencies | Gemini/OpenAI FC | None |
