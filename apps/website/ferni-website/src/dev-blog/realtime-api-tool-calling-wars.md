---
title: "The Realtime API Tool Calling Wars (And Why We Built Around Them)"
excerpt: "Our journey through OpenAI Realtime and Gemini Live API tool calling - the bugs, the workarounds, and why we eventually stopped relying on native function calling entirely."
author: "Seth Ford"
authorInitials: "SF"
authorColor: "#4a6741"
date: 2026-01-19
category: "Deep Dive"
image: "realtime-api-wars.png"
readTime: 10
---

# The Realtime API Tool Calling Wars

**When OpenAI announced native function calling in the Realtime API, we thought our problems were solved.**

No more JSON workarounds. No more parsing tool calls from text streams. Just clean, protocol-level function calling that "just works." Finally, we could focus on what actually matters: making Ferni feel present, attentive, and helpful.

*We were so naive.*

This is the story of 8 months battling realtime API tool calling across OpenAI and Gemini, the bugs we hit, the workarounds we built, and why we eventually said "forget it" and built our own tool selection system.

## Chapter 1: The Promise of Native Function Calling

### OpenAI Realtime API (October 2024)

OpenAI's pitch was compelling:

```javascript
// Define tools at session creation
const session = await openai.realtime.sessions.create({
  model: "gpt-4o-realtime-preview",
  tools: [{
    type: "function",
    name: "playMusic",
    description: "Play music by query",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" }
      }
    }
  }]
});

// Tool calls arrive as structured events
session.on("response.function_call_arguments.done", (event) => {
  // Clean, structured data - no parsing needed!
  const { name, arguments } = event;
  await executeTool(name, JSON.parse(arguments));
});
```

This was *supposed* to be the future. Protocol-level function calling, typed events, no ambiguity.

### What Actually Happened

**Issue #1: Events stop firing (August 2025)**

From the [OpenAI Developer Forum](https://community.openai.com/t/openai-realtime-model-functional-calling-event-not-triggered/1353914):

> "The function-calling event no longer gets triggered when asking a query that should invoke the retriever function. The pipeline was working fine before but started running into this issue."

We saw this too. Tool calls would work for 2-3 turns, then silently stop. No errors, no events - the model would just... respond conversationally instead of calling tools.

**Issue #2: Inconsistent behavior (December 2025)**

From another [forum thread](https://community.openai.com/t/realtime-api-function-calling/1369687):

> "The API calls the tool correctly the first two times, but the third time it does not call the tool. It just uses the past two times history to respond."

We confirmed this pattern. Something about conversation history length seemed to affect function calling reliability.

**Issue #3: No response with tools included**

From [this report](https://community.openai.com/t/realtime-api-tool-calling-problems-no-response-when-a-tool-is-included-in-the-session/966495):

> "When trying to add a tool to the realtime session via the Twilio integration, it connects but does not respond."

Adding tools to the session sometimes caused the entire response pipeline to break.

### Our Workarounds

```typescript
// Workaround 1: Retry with exponential backoff
async function executeWithRetry(fn: () => Promise<void>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fn();
      return;
    } catch (e) {
      await sleep(Math.pow(2, i) * 100);
    }
  }
}

// Workaround 2: Force tool_choice on every turn
session.response.create({
  tool_choice: "required", // Force a tool call
  tools: relevantTools     // Only include tools likely to be called
});

// Workaround 3: Limit active tool count
// "Enabling many tools can add ~20-60ms routing overhead"
const MAX_TOOLS_PER_TURN = 15;
const relevantTools = selectMostRelevantTools(transcript, MAX_TOOLS_PER_TURN);
```

These helped but didn't solve the fundamental reliability problem.

## Chapter 2: The Gemini Alternative

Maybe OpenAI was just buggy. Google had Gemini Live API - surely their function calling was better?

### Gemini's Approach: Native Audio Models

Gemini offered something different: native audio models that process speech directly.

```typescript
// Gemini native audio model
const model = genai.getGenerativeModel({
  model: "gemini-2.5-flash-native-audio-preview",
  tools: [{ functionDeclarations: tools }]
});
```

The promise: end-to-end audio processing with built-in function calling.

### What Actually Happened

**Issue #1: TEXT modality doesn't work with native-audio models**

We wanted to use Gemini for audio understanding but Cartesia for TTS (better persona voices). This means TEXT modality:

```typescript
// What we wanted
const session = await gemini.live.connect({
  model: "gemini-2.5-flash-native-audio-preview",
  config: {
    responseModalities: ["TEXT"], // Use Cartesia for speech
    tools: [{ functionDeclarations: tools }]
  }
});
```

**Error:**
```
"Cannot extract voices from a non-audio request"
```

Native-audio models *require* AUDIO modality. You can't use them with external TTS.

This is [a known bug](https://github.com/livekit/agents/issues/4423) that's been open for months.

**Issue #2: Function calling unreliable in TEXT mode**

Switching to standard Gemini models:

```typescript
// Fallback to standard model
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash-exp';
```

Function calling worked... sometimes. But Gemini had its own quirks:

- Sometimes returned tool calls as JSON in the text stream
- Sometimes spoke about calling tools instead of calling them
- Inconsistent behavior between turns

### The JSON Workaround

We built a JSON-based workaround for Gemini:

```markdown
# System Prompt Addition

When you need to use a tool, output ONLY this JSON format:
{ "fn": "toolName", "args": { "key": "value" } }

Do NOT speak about the tool. Do NOT explain what you're doing.
Just output the JSON and stop.
```

Then we intercepted the TTS stream to catch JSON:

```typescript
// tool-call-sanitizer.ts
const TOOL_JSON_PATTERN = /\{\s*"fn"\s*:\s*"(\w+)"\s*,\s*"args"\s*:/;

function sanitizeTTSStream(text: string): { clean: string; toolCall?: ToolCall } {
  const match = text.match(TOOL_JSON_PATTERN);
  if (match) {
    // Extract and parse the JSON
    const toolCall = extractToolCall(text);
    // Remove JSON from TTS stream
    const clean = text.replace(toolCall.raw, '');
    return { clean, toolCall };
  }
  return { clean: text };
}
```

This worked better than native function calling, but it was fragile:

- Depended on exact JSON formatting
- Required regex maintenance as we added tools
- Still had ~10% leakage rate (LLM talking about tools instead of outputting JSON)

## Chapter 3: The Leakage Problem

Both APIs shared a common failure mode: **leakage**.

| User Says | Expected | What We Got |
|-----------|----------|-------------|
| "Play some jazz" | `{ "fn": "playMusic", "args": { "query": "jazz" } }` | "I'd be happy to play some jazz for you! Let me find something nice..." |
| "What's the weather?" | `{ "fn": "getWeather", "args": { "location": "current" } }` | "I can check the weather for you! What location would you like?" |
| "Set a timer for 5 minutes" | `{ "fn": "setTimer", "args": { "minutes": 5 } }` | "Sure, I'll set a 5 minute timer. Is there anything else?" |

The LLM would *describe* the tool call instead of *making* the tool call. In a text chat, this might be acceptable. In voice AI, it's a disaster—you hear meaningless filler instead of your music playing.

Imagine asking a friend to put on some jazz, and instead of music, they say "I'd be happy to play some jazz for you! Jazz is a wonderful genre..." That's not presence. That's performance.

### Why Leakage Happens

LLMs are trained to be helpful and conversational. When they see "play some jazz," their natural instinct is to:

1. Acknowledge the request ("I'd be happy to...")
2. Show understanding ("jazz is a great choice...")
3. Indicate action ("let me find something...")

This is *great* for conversation. It's *terrible* for tool execution where we need decisive, immediate action.

### Leakage Detection

We built a leakage detector to catch these cases:

```typescript
// leakage-detector.ts
const LEAKAGE_PATTERNS = [
  /I('d| would) (be happy|love) to (play|set|check|find)/i,
  /Let me (find|get|check|play|set)/i,
  /I('ll| will) (play|set|check|find)/i,
  /(Sure|Of course|Absolutely),? (I('ll| will)|let me)/i,
];

function detectLeakage(response: string, expectedTool: string): boolean {
  return LEAKAGE_PATTERNS.some(p => p.test(response));
}
```

When we detected leakage, we'd retry with stronger prompting:

```typescript
if (detectLeakage(response, expectedTool)) {
  log.warn({ response, expectedTool }, 'Tool call leakage detected');

  // Retry with explicit instruction
  await session.send({
    type: "response.create",
    response: {
      instructions: `CRITICAL: Output ONLY the JSON tool call for ${expectedTool}. Do NOT speak.`
    }
  });
}
```

This helped but added latency and wasn't reliable enough for production.

## Chapter 4: 2026 Updates - Is It Getting Better?

### OpenAI Improvements

The GA Responses API added some improvements:

> "Placeholder responses ensure the model performs gracefully while awaiting a function response. If you ask for results of a function call, it'll say 'I'm still waiting on that.'"

And:

> "Setting `strict` to true will ensure function calls reliably adhere to the function schema."

These help but don't solve the fundamental "should I call a tool?" decision problem.

### Gemini 2.5 Flash Native Audio

Google made significant progress. From their [January 2026 announcement](https://blog.google/products/gemini/gemini-audio-model-updates/):

> "Gemini 2.5 Flash Native Audio achieved 71.5% on ComplexFuncBench, leading the industry in multi-step function calling reliability."

71.5% sounds impressive until you realize that means **28.5% failure rate** on complex function calls. For voice AI where every failure is audible, that's not good enough.

### The Reality Check

| Metric | OpenAI Realtime | Gemini 2.5 Native Audio | Our FTIS V2 |
|--------|-----------------|-------------------------|-------------|
| Simple tool calls | ~90% | ~85% | **99%+** |
| Complex/multi-step | ~75% | ~71.5% | **93%** |
| Leakage rate | ~12% | ~15% | **<0.5%** |
| Latency | 300-500ms | 250-400ms | **~20ms** |

Native function calling is improving, but it's still not reliable enough for production voice AI.

## Chapter 5: Why We Built Around It

After 8 months of battles, we made a strategic decision: **stop relying on LLM function calling entirely.**

### The FTIS V2 Approach

Instead of asking the LLM "which tool should I call?", we:

1. **Classify intent ourselves** with finetuned ONNX models (93% accuracy, 20ms)
2. **Execute tools directly** without LLM involvement
3. **Tell the LLM what happened** and let it respond naturally

```typescript
// Before: LLM decides
const response = await llm.generateWithTools(transcript, tools);

// After: We decide, LLM just responds
const intent = await ftisClassify(transcript);
if (intent.confidence >= 0.85) {
  const result = await executeTool(intent.toolId);
  await llm.generate(`[TOOL_RESULT: ${intent.toolId}]\n${result}\n\nRespond naturally.`);
}
```

### The System Prompt Revolution

Our Gemini system prompt went from this:

```markdown
You have access to 60 tools. When the user wants to use a tool,
output JSON: { "fn": "toolName", "args": {...} }

Tools:
- playMusic: Play music by query or URI
- setTimer: Set a timer
- getWeather: Get weather
... (4000 more tokens of tool schemas)
```

To this:

```markdown
You are a conversational AI. Tools are handled externally.

When you see [TOOL_RESULT], respond naturally to what happened.
Do NOT output JSON. Do NOT discuss tools.
```

The LLM is now **liberated from tool selection**. It just needs to be conversational.

### Results

| Before (Native FC) | After (FTIS V2) |
|--------------------|-----------------|
| 80% tool call success | **99%+ success** |
| 15% leakage rate | **<0.5% leakage** |
| 500ms tool selection | **20ms classification** |
| Unpredictable failures | **Predictable behavior** |

## Lessons Learned

### 1. Native function calling is a leaky abstraction

It *looks* clean in the docs. In production, it's unpredictable. The LLM is still making a generative decision about whether and which tool to call.

### 2. Classification beats generation for structured decisions

Tool selection is fundamentally a classification problem. Using a generative model for classification is using the wrong tool for the job.

### 3. Separate concerns ruthlessly

- **FTIS V2**: Decides which tool (classification)
- **Tool executor**: Runs the tool (execution)
- **LLM**: Responds naturally (generation)

Each component does what it's best at.

### 4. Don't fight the model

Instead of adding more prompting to force tool calls, we removed the decision from the LLM entirely. Work *with* the model's strengths, not against its weaknesses.

### 5. The industry will catch up... eventually

Function calling *is* improving. Gemini 2.5's 71.5% on ComplexFuncBench is real progress. But for production voice AI today, we needed 99%+ reliability. So we built it ourselves.

## What We Use Now

Our current architecture:

```
                    ┌─────────────────┐
                    │    User Speech  │
                    └────────┬────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        FTIS V2                                  │
│            (11 ONNX models, 93% accuracy, 20ms)                │
└────────────────────────────────────────────────────────────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
     ≥0.85 conf       0.5-0.85 conf      <0.5 conf
            │                │                │
    Direct Execute      Tool Hint       Pure Conversation
            │                │                │
            └────────────────┼────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                      Gemini Live API                            │
│               (TEXT mode, Cartesia TTS)                        │
│             NO tool schemas, just responds                      │
└────────────────────────────────────────────────────────────────┘
```

We still use Gemini Live API—it's excellent for conversational generation. We just don't use it for tool selection anymore.

And that's the lesson: **use each component for what it's best at.** LLMs are amazing at being present, warm, and conversational. They're mediocre at structured decision-making. So we let them do what they do best, and handle the rest ourselves.

The result? When you ask Ferni to play music, music plays. No filler. No performance. Just presence.

---

*Read more about [FTIS V2 and how we trained 11 models](/dev-blog/ftis-v2-small-models-tool-selection) or our [half-cascade architecture](/dev-blog/half-cascade-architecture).*
