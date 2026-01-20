# Unified Tool Orchestrator (UTO) E2E Verification Guide

## Overview

This guide explains how to verify the UTO routing system is working end-to-end.

## Test Environment Setup

```bash
# Start with full logging enabled
LOG_FULL_RESPONSES=true pnpm dev

# In separate terminals:
pnpm token-server  # Port 3001
pnpm ui-server     # Port 3002
cd apps/web && pnpm dev  # Port 3004
```

## Log Signatures to Watch

### 1. Successful Fast-Path Routing (Music)

```bash
# Say: "play some jazz"

# Expected logs:
[ROUTE:abc123] START transcript="play some jazz" (14 chars)
[ROUTE:abc123] FAST-PATH MATCH music confidence=0.95 query="jazz"
[ROUTE:abc123] EXECUTE playMusic args={ query: "jazz" }
[ROUTE:abc123] EXECUTE SUCCESS 120ms
[ROUTE:abc123] COMPLETE handled=true routedBy=fast-path total=145ms
🎯 UTO routed and executed tool { routedBy: 'fast-path', toolId: 'playMusic' }
```

### 2. Medium-Confidence Tool Hint (FTIS V2)

```bash
# Say: "maybe some music?"

# Expected logs:
[ROUTE:def456] START transcript="maybe some music?" (17 chars)
[ROUTE:def456] FAST-PATH no match
[ROUTE:def456] FTIS-V2 classifying...
[ROUTE:def456] FTIS-V2 RESULT super=media fine=play_music
[ROUTE:def456] FTIS-V2 TOOL_HINT conf 0.72 → playMusic
[ROUTE:def456] COMPLETE handled=false routedBy=ftis-v2 (hint) total=45ms
🎯 UTO: no tool executed, passing to Gemini { hasToolHint: true }
🔮 UTO: tool hint for LLM { toolId: 'playMusic', confidence: 0.72 }
```

### 3. System State Injection

```bash
# After music is playing, say: "how's everything going?"

# Expected context injection (visible in LLM logs):
[CURRENT SYSTEM STATE]
🎵 Music is playing: "Jazz Vibes" by Miles Davis (playing for 45 seconds)

[GUIDANCE: Music is already playing. If asked about music: acknowledge it's on, ask if they want to change it, skip, or adjust volume.]
```

### 4. Timer Fast-Path

```bash
# Say: "set a timer for 5 minutes"

# Expected logs:
[ROUTE:ghi789] START transcript="set a timer for 5 minutes" (25 chars)
[ROUTE:ghi789] FAST-PATH MATCH timer confidence=0.95 duration={5, 0}
[ROUTE:ghi789] EXECUTE setTimer args={ minutes: 5, seconds: 0 }
[ROUTE:ghi789] EXECUTE SUCCESS
[ROUTE:ghi789] COMPLETE handled=true routedBy=fast-path total=50ms
```

### 5. Stop Music Fast-Path

```bash
# Say: "stop the music"

# Expected logs:
[ROUTE:jkl012] START transcript="stop the music" (14 chars)
[ROUTE:jkl012] FAST-PATH MATCH stopMusic confidence=0.95
[ROUTE:jkl012] EXECUTE pauseMusic
[ROUTE:jkl012] EXECUTE SUCCESS
```

## Verifying Context Builder Injection

### Check System State Awareness

The `system-state-awareness` context builder should inject on every turn when:
- Music is playing
- Timers are active
- A tool was recently executed

Look for this in the LLM context injection logs:

```
[context:system-state-awareness] System state awareness injected { hasMusic: true }
```

### Check Tool Hint Injection

When UTO detects medium-confidence intent:

```
[context:system-state-awareness] Tool hint injected { toolId: 'playMusic' }
```

## Common Issues

### Issue: "Tool executed but LLM also tried to call it"

**Cause**: Deduplication not working
**Check**: Look for `markToolExecutedBySemanticRouter` in logs
**Fix**: Verify `routingResult.toolId` is being passed to dedup

### Issue: "Music playing but LLM said 'I'll play some music'"

**Cause**: System state not injected
**Check**: Look for `[CURRENT SYSTEM STATE]` in LLM context
**Fix**: Verify `userData.systemState` is being set

### Issue: "FTIS V2 not classifying"

**Cause**: FTIS V2 not initialized
**Check**: Look for `🧠 FTIS V2 Hierarchical Classifier initialized`
**Fix**: Check ONNX model files exist

## Performance Targets

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Fast-path detection | < 5ms | < 10ms |
| FTIS V2 classification | < 30ms | < 50ms |
| Tool execution | < 200ms | < 500ms |
| Total routing | < 250ms | < 500ms |

## Test Cases

### Music Flow
1. ✅ "play some jazz" → Fast-path → playMusic
2. ✅ "put on something relaxing" → Fast-path → playMusic  
3. ✅ "stop the music" → Fast-path → pauseMusic
4. ✅ [music playing] "more volume" → Should NOT re-play

### Weather Flow
1. ✅ "what's the weather" → Fast-path → getWeather
2. ✅ "is it going to rain" → Fast-path → getWeather

### Timer Flow
1. ✅ "set a timer for 5 minutes" → Fast-path → setTimer
2. ✅ "cancel the timer" → Fast-path → cancelTimer

### Handoff Flow
1. ✅ "talk to Maya" → Fast-path → handoffToMaya
2. ✅ "switch to Peter" → Fast-path → handoffToPeter

### Edge Cases
1. ✅ "I love jazz music" → Conversation (not a command)
2. ✅ "maybe play something?" → FTIS V2 → Tool hint
3. ✅ [music playing] "how's everything?" → State injection

## Debugging Commands

```bash
# Watch routing logs only
LOG_FULL_RESPONSES=true pnpm dev 2>&1 | grep -E "\[ROUTE|🎯 UTO"

# Watch context injections
LOG_FULL_RESPONSES=true pnpm dev 2>&1 | grep -E "context:|SYSTEM STATE|TOOL HINT"

# Watch tool executions
LOG_FULL_RESPONSES=true pnpm dev 2>&1 | grep -E "EXECUTE|tool.*executed"
```

## Architecture Summary

```
User says "play some jazz"
         │
         ▼
┌─────────────────────────────────────────┐
│  transcript-handler.ts                  │
│  ├── Receives transcript                │
│  ├── Calls toolOrchestrator.routeAndExecute()
│  └── Stores result in userData          │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  unified-tool-orchestrator.ts           │
│  ├── Phase 1: Fast-path regex (~1ms)    │
│  │   └── MATCH: music, confidence=0.95  │
│  ├── Execute: playMusic({ query: jazz })│
│  ├── Build systemState                  │
│  └── Return: { handled: true, ... }     │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  If handled=true: EARLY RETURN          │
│  (Skip LLM, music is playing)           │
└─────────────────────────────────────────┘

         OR (if confidence < 0.85)

┌─────────────────────────────────────────┐
│  If handled=false with toolHint:        │
│  ├── Store userData.toolHint            │
│  ├── Continue to LLM                    │
│  └── Context builder injects hint       │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  system-state-awareness.ts              │
│  (Runs on EVERY turn)                   │
│  ├── Inject [CURRENT SYSTEM STATE]      │
│  ├── Inject [TOOL HINT] if present      │
│  └── Provide guidance to LLM            │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  LLM (Gemini/OpenAI)                    │
│  ├── Knows music is playing             │
│  ├── Knows what tools are available     │
│  ├── Guided to call tools, not fake it  │
│  └── Responds naturally                 │
└─────────────────────────────────────────┘
```
