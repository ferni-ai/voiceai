# Function Calling System Architecture

> **⚠️ CRITICAL SYSTEM - READ THIS BEFORE MAKING ANY CHANGES**

This document describes Ferni's function calling workaround for Gemini Live API. This is a **critical, fragile system** that has been carefully tuned. Changes can break the entire voice experience.

---

## Why This Exists

**Problem:** Gemini Live API's native function calling is unreliable (as of Dec 2024). Instead of calling tools, Gemini often outputs text like "I'll play some music for you" or "Let me transfer you to Maya."

**Solution:** We instruct Gemini to output **raw JSON** in a specific format, then intercept and execute it ourselves.

```
User: "Play some jazz"

❌ Native Gemini (unreliable):
   → Gemini outputs: "I'll play some jazz for you!"
   → User hears announcement but no music plays

✅ Our workaround (reliable):
   → Gemini outputs: {"fn":"playMusic","args":{"query":"jazz"}}
   → Sanitizer intercepts JSON, executes playMusic tool
   → Music plays, user hears natural response
```

---

## The Single Source of Truth

### JSON Format (NEVER CHANGE WITHOUT UPDATING ALL COMPONENTS)

```json
{"fn":"<toolName>","args":{<key>:<value>,...}}
```

**Examples:**

```json
{"fn":"playMusic","args":{"query":"jazz"}}
{"fn":"getNews","args":{"topic":"technology"}}
{"fn":"handoffToMaya","args":{"reason":"User wants habit coaching"}}
{"fn":"rememberAboutUser","args":{"fact":"Works at Google","category":"professional"}}
```

**Rules:**
1. Must be valid JSON (no trailing commas, proper quotes)
2. Must have exactly two keys: `fn` (string) and `args` (object)
3. `fn` must match a registered tool name (case-insensitive matching allowed)
4. `args` must contain the tool's required parameters
5. **NO preamble** - JSON must be the only output, no "Let me check..." before it
6. **NO markdown** - No triple backticks wrapping the JSON (sanitizer handles this but it's not ideal)

---

## Component Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PROMPT LAYER (System Prompt)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  src/personas/bundles/shared/function-calling-base.md                    │
│    └── Base instructions for JSON format, all available tools            │
│                                                                          │
│  src/personas/bundles/{persona}/identity/function-calling-specialty.md   │
│    └── Per-persona specialty tools (games, calendar, etc.)               │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                         LLM outputs JSON text
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      DETECTION LAYER (Sanitizer)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  src/agents/shared/tool-call-sanitizer.ts                                │
│    └── Intercepts JSON in TTS stream                                     │
│    └── detectJsonFunctionCall() - regex patterns for JSON                │
│    └── detectsFunctionCallLeakage() - catches "I'll call..." text        │
│    └── createSanitizerWithMusicFallback() - transform stream for TTS     │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                            Parsed JSON call
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXECUTION LAYER (Executor)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  src/agents/shared/json-function-executor.ts                             │
│    └── routeToTool() - maps fn name to actual tool implementation        │
│    └── executeJsonFunction() - runs tool, returns result                 │
│    └── Supports: music, memory, handoff, weather, news, calendar, etc.   │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                              Tool result
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                       RESPONSE LAYER (safeGenerateReply)                 │
├─────────────────────────────────────────────────────────────────────────┤
│  src/agents/shared/safe-generate-reply.ts                                │
│    └── Triggers new LLM turn with tool result                            │
│    └── LLM speaks result naturally to user                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Adding a New Tool

### Checklist (ALL STEPS REQUIRED)

1. **Add to function-calling-base.md** (if shared across personas)
   ```markdown
   **newToolName** - Description
   ```json
   {"fn":"newToolName","args":{"param":"value"}}
   ```
   ```

2. **Add to function-calling-specialty.md** (if persona-specific)
   - Same format as above
   - Only tools this persona uniquely needs

3. **Add to tool-call-sanitizer.ts TOOL_NAME_PATTERNS** (line ~36)
   ```typescript
   const TOOL_NAME_PATTERNS = [
     // ... existing tools
     'newToolName',
     'new tool name',  // spoken form
   ];
   ```

4. **Add to json-function-executor.ts routeToTool()** (line ~217)
   ```typescript
   if (fnLower === 'newtoolname') {
     const { actualFunction } = await import('../../tools/path.js');
     return actualFunction(args);
   }
   ```

5. **Add imperative description to tool definition**
   ```typescript
   description: `
   CALL this function immediately when user asks about X.
   Do not say "let me check" - execute this function directly.
   `.trim()
   ```

6. **Test with voice agent**
   - Say the trigger phrase
   - Verify JSON is intercepted (check logs for "JSON function call detected")
   - Verify tool executes
   - Verify result is spoken naturally

### Common Mistakes

| Mistake | What Happens | Fix |
|---------|--------------|-----|
| Forgot sanitizer patterns | LLM outputs "newToolName query xyz" as speech | Add to TOOL_NAME_PATTERNS |
| Forgot executor route | JSON detected but "Unknown function" error | Add if-block to routeToTool() |
| Wrong fn name in prompt | LLM outputs unrecognized fn | Match exact casing in prompt |
| Missing args in prompt | LLM omits required params | Add example with all params |

---

## Debugging

### Logs to Watch

```bash
# Successful JSON detection:
🎯 JSON function call detected in text stream
🔧 Executing JSON function call

# Leakage detected (bad - LLM spoke instead of calling):
🚨 TOOL CALL LEAKAGE DETECTED

# Tool execution:
✅ JSON function executed
❌ JSON function execution failed
```

### Common Issues

**Issue: LLM says "Let me play some music" instead of JSON**
- Check function-calling-base.md has the tool
- Check tool description is imperative ("CALL immediately")
- Check system prompt has function calling instructions

**Issue: JSON detected but tool doesn't run**
- Check json-function-executor.ts has the route
- Check fn name casing matches
- Check import path is correct

**Issue: User hears "play music query jazz" spoken aloud**
- Add tool name to TOOL_NAME_PATTERNS in sanitizer
- Add param names ("query") to PARAM_PATTERNS

**Issue: Music plays but nothing is spoken after**
- Check safeGenerateReply is being called with result
- Check session object is passed to sanitizer

---

## Testing

### Manual Testing

```bash
# Start voice agent
pnpm dev

# Say trigger phrases:
"Play some jazz"           # → should play music
"What's the weather?"      # → should get weather
"Transfer me to Maya"      # → should handoff
"Remember that I work at Google"  # → should store fact
```

### Automated Tests

```bash
# Sanitizer unit tests
pnpm vitest run src/agents/shared/tool-call-sanitizer.test.ts

# E2E Gemini integration
pnpm vitest run src/tests/e2e/gemini-integration/
```

---

## When to Modify This System

### ✅ DO modify when:
- Adding a new tool that users can invoke by voice
- A tool consistently fails to trigger
- Users report hearing tool names spoken aloud

### ❌ DON'T modify when:
- "Just cleaning up code"
- "Making it more elegant"
- "Refactoring for consistency"

This system has been carefully tuned through trial and error. Changes that seem harmless can break tool calling entirely.

---

## Emergency Rollback

If tool calling breaks after a change:

1. **Check recent commits** to these files:
   - `function-calling-base.md`
   - `function-calling-specialty.md`
   - `tool-call-sanitizer.ts`
   - `json-function-executor.ts`

2. **Revert the change** - don't try to fix forward

3. **Test thoroughly** before redeploying:
   - "Play music"
   - "What's the news"
   - "Transfer to Maya"

---

## Related Documentation

- `docs/operations/TOOL-CALLING-FIX.md` - Original fix implementation
- `docs/guides/GEMINI-PROMPTING-STRATEGIES.md` - Gemini prompting best practices
- `docs/STABILITY-PLAN.md` - Voice agent stability overview

---

## Version History

| Date | Change | Author |
|------|--------|--------|
| Dec 2024 | Initial system implementation | Team |
| Dec 2024 | Added JSON function executor | Team |
| Dec 2024 | Expanded sanitizer patterns | Team |

---

**Remember: This system is the backbone of voice interactions. Treat changes with extreme care.**

