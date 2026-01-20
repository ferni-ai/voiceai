---
title: "How We Trained 11 Models to Replace LLM Tool Selection"
excerpt: "Why we built FTIS V2: 11 finetuned ONNX models that achieve 93% accuracy in 20ms, eliminating our dependency on flaky LLM function calling."
author: "Seth Ford"
authorInitials: "SF"
authorColor: "#4a6741"
date: 2026-01-19
category: "Deep Dive"
image: "ftis-v2-small-models.png"
readTime: 12
---

# How We Trained 11 Models to Replace LLM Tool Selection

**The problem was simple: when someone asks Ferni to play music, they shouldn't wait 800ms wondering if they were heard.**

That pause breaks the magic of conversation. It breaks presence. And presence is everything we're building toward.

After months of battling OpenAI's Realtime API function calling failures and Gemini's JSON workaround quirks, we discovered the root cause: LLMs are terrible at deciding which tool to call. Not "sometimes unreliable." Not "occasionally slow." *Terrible.*

We asked ourselves a heretical question:

*What if the LLM didn't decide which tool to call at all?*

## The Problem: 500ms of Uncertainty

Here's what tool calling looked like before FTIS V2:

```
User: "Play some jazz"
         ↓
LLM receives user transcript + 60 tool schemas (~4000 tokens)
         ↓
LLM "thinks" about which tool to call (~300-500ms)
         ↓
LLM outputs: { "fn": "playMusic", "args": { "query": "jazz" } }
         ↓
We parse JSON, execute tool
         ↓
Total latency: 500-800ms just for tool selection
```

But it gets worse. The LLM doesn't *always* call a tool. Sometimes it says "I'd be happy to play some jazz for you!" and just... talks about playing music instead of actually doing it.

We called this **tool call leakage** - the LLM speaking *about* tools instead of calling them.

### The Leakage Problem

```typescript
// What we wanted:
{ "fn": "playMusic", "args": { "query": "jazz" } }

// What we sometimes got:
"I'd love to help you with that! Let me play some jazz music for you.
Jazz is a wonderful genre that originated in..."
```

Our sanitizer would catch JSON in the TTS stream, but it couldn't force the LLM to *output* JSON in the first place. We tried:

- Prompt engineering ("ALWAYS output JSON for tool calls")
- Few-shot examples
- System prompt reinforcement
- OpenAI's `tool_choice: "required"`
- Gemini's `functionCallingMode: "ANY"`

None of it was reliable enough for production voice AI where every second of latency destroys the conversational feel.

## The Insight: Classification, Not Generation

Then we realized something: **tool selection is a classification problem, not a generation problem.**

When a user says "play some jazz," they're expressing an *intent*. That intent maps to a *category*. That category maps to *tools*. This is a well-understood NLP problem with mature, fast solutions.

| Approach | Latency | Accuracy | Cost |
|----------|---------|----------|------|
| LLM function calling | 300-500ms | ~80% | $0.01-0.03/call |
| Finetuned classifier | **~20ms** | **93%+** | **~$0.0001/call** |

The math was obvious. We just had to build it.

## FTIS V2: The Architecture

FTIS stands for **Ferni Tool Intent Selection**. Version 2 uses a two-stage hierarchical classification:

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER SPEAKS                                  │
│                "Play some jazz music"                            │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: Super-Category Classifier                              │
│                                                                 │
│ Input: "play some jazz music"                                   │
│ Output: media (95% confidence)                                  │
│ Latency: ~8ms                                                   │
│                                                                 │
│ Categories: calendar, communication, emotional, finance,        │
│             health, home, media, productivity, system, travel   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: Fine-Category Classifier (media-specific)              │
│                                                                 │
│ Input: "play some jazz music"                                   │
│ Output: play_music (92% confidence)                             │
│ Latency: ~12ms                                                  │
│                                                                 │
│ Media categories: play_music, music_control, find_music,        │
│                   podcast_play, audiobook_play                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Combined confidence: 0.95 × 0.92 = 0.87                         │
│ Threshold: 0.85 ✓                                               │
│ Action: DIRECT EXECUTION                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Why Two Stages?

A single 60+ class classifier would be:
1. **Harder to train** - need balanced data across all classes
2. **Less accurate** - confusion between similar intents across domains
3. **Harder to update** - adding a new tool requires retraining everything

With hierarchical classification:
- Stage 1 is a simple 10-class classifier (97% accuracy)
- Stage 2 has 10 specialized models, each handling 5-15 classes (92-99% accuracy)
- Adding a new tool only requires retraining one Stage 2 model

### The 11 ONNX Models

| Model | Classes | Accuracy | Size |
|-------|---------|----------|------|
| `super-category` | 10 | 97% | 44MB |
| `calendar-fine` | 8 | 98% | 44MB |
| `communication-fine` | 6 | 98% | 44MB |
| `emotional-fine` | 12 | 94% | 44MB |
| `finance-fine` | 5 | 96% | 44MB |
| `health-fine` | 9 | 92% | 44MB |
| `home-fine` | 7 | 98% | 44MB |
| `media-fine` | 5 | 95% | 44MB |
| `productivity-fine` | 11 | 94% | 44MB |
| `system-fine` | 6 | 99% | 44MB |
| `travel-fine` | 5 | 99% | 44MB |

Total: ~480MB of models loaded at startup, providing sub-20ms inference.

## Training Data: The Hard Part

Here's what nobody tells you about finetuning classifiers: **the model is only as good as your training data.**

We generated training data three ways:

### 1. Real User Transcripts (Gold Standard)

```json
{
  "text": "can you play that song again",
  "super_category": "media",
  "fine_category": "music_control",
  "source": "production_logs"
}
```

We had 6 months of production logs with tool execution data. If a user said X and tool Y was called, that's a training example.

### 2. Synthetic Generation (Scale)

```python
# Generate variations for each intent
prompt = f"""
Generate 50 natural variations of how a user might ask to {intent}.
Include:
- Casual speech ("play some jazz")
- Polite requests ("could you please play jazz")
- Contextual ("I'm in the mood for jazz")
- Incomplete ("jazz... something chill")
"""
```

This gave us ~5,000 examples per fine category.

### 3. Hard Negatives (Robustness)

The hardest cases are **near-misses** - utterances that sound like one intent but are actually another:

| Utterance | Looks Like | Actually Is |
|-----------|------------|-------------|
| "What time is the concert?" | calendar | information |
| "Can you call my mom?" | communication | phone |
| "I need to save this" | productivity | memory |
| "Turn up the music" | media | music_control |

We specifically mined for these confusing cases and ensured balanced representation in training.

## The Integration: LLM as "Responder"

The key architectural shift: **the LLM no longer decides tools - it responds to tool results.**

```typescript
// OLD: LLM decides
const response = await llm.generateWithTools(transcript, tools);
if (response.toolCall) {
  await executeTool(response.toolCall);
}

// NEW: FTIS decides, LLM responds
const classification = await ftisClassify(transcript);

if (classification.confidence >= 0.85) {
  // Direct execution - LLM never sees tool schemas
  const result = await executeTool(classification.toolId, extractArgs(transcript));

  // Inject result into LLM context
  await llm.generate(`
    [TOOL_RESULT: ${classification.toolId}]
    Status: ${result.success ? 'SUCCESS' : 'FAILED'}
    Result: ${result.naturalResponse}

    Respond naturally to this result. Do NOT call any tools.
  `);
}
```

The LLM's job is now much simpler: take a tool result and respond naturally. No decision-making, no JSON generation, no uncertainty.

### The System Prompt Difference

**Old prompt (with function calling):**
```markdown
You have access to the following tools:
- playMusic: Play music by query or URI
- setTimer: Set a timer for X minutes
- getWeather: Get weather for a location
...60 more tools...

When the user wants to use a tool, output JSON: { "fn": "toolName", "args": {...} }
```

**New prompt (FTIS V2):**
```markdown
You are a conversational AI. Tools are handled externally.

When you see [TOOL_RESULT], respond naturally to what happened.
Do NOT output JSON. Do NOT discuss tools. Just be conversational.

Example:
[TOOL_RESULT: playMusic]
Result: Now playing Jazz Vibes by Miles Davis

Your response: "Here we go, some smooth jazz coming right up!"
```

The LLM is liberated from tool selection entirely.

## Results: Before and After

### Latency

| Metric | Before (LLM FC) | After (FTIS V2) |
|--------|-----------------|-----------------|
| Tool selection | 300-500ms | **~20ms** |
| Total response time | 800-1200ms | **400-600ms** |
| P99 latency | 2.5s | **900ms** |

### Reliability

| Metric | Before | After |
|--------|--------|-------|
| Tool call success rate | ~80% | **99.2%** |
| Leakage rate | ~15% | **<0.5%** |
| Wrong tool selection | ~5% | **<1%** |

### Cost

| Metric | Before | After |
|--------|--------|-------|
| Tokens for tool schemas | ~4000/turn | **0** |
| LLM cost for tool selection | ~$0.02/turn | **~$0.0001/turn** |
| Monthly savings (1M turns) | - | **~$19,000** |

## Confidence Thresholds: The Safety Net

Not every utterance maps cleanly to a tool. We use confidence thresholds:

| Confidence | Action |
|------------|--------|
| ≥ 0.85 | **Direct execution** - bypass LLM entirely |
| 0.50 - 0.85 | **Tool hint** - inject hint into LLM context |
| < 0.50 | **Conversation** - pure LLM response |

The "tool hint" middle ground is crucial:

```typescript
if (confidence >= 0.50 && confidence < 0.85) {
  // Not confident enough for direct execution
  // But confident enough to hint
  await llm.generate(`
    [TOOL_HINT: User may want ${classification.toolId}]
    Confidence: ${confidence}

    If appropriate, you may use this tool. Otherwise, continue conversation.
  `);
}
```

This catches edge cases where FTIS isn't sure but wants to nudge the LLM in the right direction.

## Lessons Learned

### 1. Classification beats generation for structured decisions

LLMs are amazing at open-ended generation. They're mediocre at structured decision-making with many options. Use the right tool for the job.

### 2. Hierarchical classification scales better

One giant classifier is fragile. A hierarchy of specialized classifiers is robust, updateable, and easier to debug.

### 3. The LLM is happier without tool schemas

Our LLM responses became more natural once we removed 4000 tokens of tool schemas from every turn. Less context pollution = better responses.

### 4. Hard negatives are worth the effort

The difference between 90% and 93% accuracy comes down to hard negatives. Mine for confusing cases relentlessly.

### 5. ONNX is production-ready

We were skeptical about deploying 11 ONNX models in production. It's been rock solid. ONNX Runtime is battle-tested.

## What's Next

FTIS V2 is in production today. We're exploring:

- **Streaming classification** - start classifying before the user finishes speaking
- **Confidence calibration** - better probability estimates for threshold tuning
- **Multi-intent detection** - "play jazz and set a timer for 30 minutes"
- **Personalization** - user-specific priors based on usage patterns

The fundamental insight remains: **tool selection is classification, not generation.** Once you accept that, everything gets simpler.

But here's what really matters: that 500ms we saved isn't just a number. It's the difference between "Ferni heard me" and "did Ferni hear me?" It's the difference between presence and awkwardness.

Every millisecond of latency is a moment where connection wavers. FTIS V2 gives us those moments back.

---

*Want to learn more about our voice AI architecture? Check out our posts on [half-cascade architecture](/dev-blog/half-cascade-architecture) and [the movie production paradigm](/dev-blog/movie-production-paradigm).*
