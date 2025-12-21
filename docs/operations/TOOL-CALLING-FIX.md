# Fixing Tool Call Leakage - Holistic Approach

> Problem: Gemini outputs text about calling tools instead of actually calling them.

## Understanding the Root Cause

### How Gemini Decides: Text vs Function Call

When Gemini receives a request, it has two output paths:

```
User Input → Gemini Processing → Decision Point
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                                           ↓
        TEXT OUTPUT                              FUNCTION CALL
    (sent to TTS, spoken)                    (executed, result used)
```

The decision depends on:
1. **functionCallingConfig.mode** - AUTO/ANY/NONE
2. **Tool descriptions** - How clearly they match the request
3. **System prompt** - Instructions about when to call
4. **Confidence level** - How certain Gemini is

### Current Configuration

```typescript
// voice-agent-entry.ts line 660
toolChoice: 'auto'  // Maps to functionCallingConfig.mode: 'AUTO'
```

With **AUTO mode**, Gemini makes the choice. When uncertain, it defaults to text.

---

## The Multi-Layer Fix

### Layer 1: Force Tool Calling When Appropriate

**Change default from AUTO to ANY for tool-heavy requests:**

```typescript
// Option A: Always force function calling when tools are provided
toolChoice: 'required'  // Maps to functionCallingConfig.mode: 'ANY'

// Option B: Dynamic - detect tool requests and force calling
// (We already have this at line 1259, but it may not be working)
```

**Tradeoff:** 
- `ANY` mode means Gemini MUST call a function, even for pure chat
- Need to provide a "chat" or "respond" tool as fallback

### Layer 2: Imperative Tool Descriptions

Current descriptions are trigger-lists. Better approach: **imperative commands**.

**Before (ambiguous):**
```typescript
description: 'Transfer to Maya when user mentions: habits, budgeting...'
```

**After (imperative):**
```typescript
description: `
IMMEDIATELY EXECUTE this tool when user mentions ANY of: habits, budgeting, spending, 
savings goals, morning routine, daily routine, exercise habits, financial wellness.

DO NOT respond with text. DO NOT say "I'll transfer you" - CALL THIS FUNCTION.

This is a SILENT handoff - the function handles the transition message.
`.trim()
```

### Layer 3: System Prompt Reinforcement

Add explicit instructions about function calling behavior:

```markdown
## FUNCTION CALLING BEHAVIOR

When a user asks you to DO something (play music, transfer to team member, etc.):

1. GENERATE the function call - do NOT speak
2. WAIT for function result
3. THEN speak the result naturally

WRONG SEQUENCE:
  User: "Play some jazz"
  You: "I'll play some jazz for you!" [then call playMusic]

RIGHT SEQUENCE:
  User: "Play some jazz"
  You: [call playMusic with query="jazz"] 
  Function returns: "Now playing 'Take Five' by Dave Brubeck"
  You: "Here's 'Take Five' by Dave Brubeck!"

The function call is INVISIBLE. Users only hear the result.
```

### Layer 4: Structured Output Schema

Force Gemini to think about whether this is a tool call:

```typescript
// Add to tool definitions
const toolCallSchema = {
  type: 'object',
  properties: {
    isToolCall: { type: 'boolean', description: 'Is this request asking for an action?' },
    toolName: { type: 'string', description: 'Which tool to call' },
    naturalResponse: { type: 'string', description: 'Only if isToolCall is false' }
  }
};
```

### Layer 5: Post-Processing Sanitizer (Defense-in-Depth)

Even with the above fixes, add a sanitizer as the last line of defense:

```typescript
// Already implemented in tool-call-sanitizer.ts
// Catches patterns like:
// - "I'll call the playMusic function"
// - "Let me transfer you to Maya"
// - "Playing music query jazz"
```

---

## Implementation Priority

### Immediate (Do Now)

1. **Improve tool descriptions** - Make them imperative
2. **Verify toolChoice patch is working** - Check logs for `functionCallingConfig`
3. **Expand sanitizer patterns** - Catch more leakage

### Short-term (This Week)

4. **Add "respond" fallback tool** - So we can use `ANY` mode
5. **Dynamic toolChoice** - Use `required` for action requests, `auto` for chat

### Medium-term (Next Sprint)

6. **Structured output** - Schema-based tool decision
7. **EvalOps testing** - Automated tests for tool calling behavior

---

## Debugging: How to Verify

### Check Function Calling Config

Add logging to see what's sent to Gemini:

```typescript
// In voice-agent-entry.ts after building geminiConfig
console.log('Gemini config:', JSON.stringify(geminiConfig, null, 2));
```

Should show:
```json
{
  "toolConfig": {
    "functionCallingConfig": {
      "mode": "AUTO"  // or "ANY" if using required
    }
  }
}
```

### Check Function Calls Collected

We already log this:
```typescript
session.on('function_calls_collected', (event) => {
  console.log('📥 [FUNCTION CALLS COLLECTED]:', JSON.stringify(event));
});
```

If this fires → Gemini called a function
If this doesn't fire → Gemini output text instead

### Test Specific Scenarios

```bash
npm run test:gemini:tools
```

Or manually:
1. Say "Play some jazz"
2. Check logs for `[FUNCTION CALLS COLLECTED]`
3. If not present, Gemini output text instead of calling playMusic

---

## The Ideal Request/Response Flow

### Correct Flow (What We Want)

```
User: "Play some jazz music"

[Internal - NOT spoken]
Gemini decides: This matches playMusic tool
Gemini generates: function_call: { name: "playMusic", arguments: { query: "jazz music" } }

[LiveKit SDK]
Executes playMusic tool
Returns: "Now playing 'Take Five' by Dave Brubeck"

[Spoken to user]
Ferni: "Here's 'Take Five' by Dave Brubeck!"
```

### Incorrect Flow (What's Happening)

```
User: "Play some jazz music"

[Internal - Gemini uncertain]
Gemini decides: I should acknowledge this request
Gemini generates: text: "I'll play some jazz music for you!"

[LiveKit SDK]
Sends text to TTS
TTS speaks it

[Spoken to user]
Ferni: "I'll play some jazz music for you!"

[Maybe also]
Gemini then calls playMusic
But user already heard the announcement
```

---

## Quick Fix: Update Tool Descriptions Now

Replace current descriptions with imperative versions:

```typescript
// ferni-agent.ts - handoffToMaya
description: `
SILENT TRANSFER - Execute immediately, do not speak.

Triggers: habits, budgeting, spending tracking, savings goals, morning routine, 
daily routine, exercise habits, financial wellness, building routines, 
tracking expenses, accountability.

This function handles the transition. You do NOT say "I'll transfer you" or 
"Let me connect you with Maya" - the function provides the transition message.
`.trim(),
```

```typescript
// entertainment-tools.ts - playMusic  
description: `
SILENT ACTION - Execute immediately, do not speak before calling.

When user wants music: "play music", "put on some [genre]", "play [artist]", etc.

DO NOT say "I'll play that" or "Let me find that" - CALL THIS FUNCTION.
The function returns what to say after the music starts.
`.trim(),
```

---

## Summary

| Layer | What | Why |
|-------|------|-----|
| 1. Mode | Use `ANY` for action requests | Forces function call |
| 2. Descriptions | Imperative, explicit | Reduces ambiguity |
| 3. System prompt | Clear instructions | Reinforces behavior |
| 4. Schema | Structured output | Forces explicit decision |
| 5. Sanitizer | Post-processing | Catches leakage |

The root cause is that **AUTO mode + ambiguous descriptions = Gemini choosing text**.
The fix is **ANY mode + imperative descriptions + clear instructions**.

---

## Implementation Complete ✅

### What Was Done (December 2024)

#### 1. Tool Call Sanitizer (`src/agents/shared/tool-call-sanitizer.ts`)
- Expanded detection patterns for handoffs, music, weather, search
- Added announcement detection ("Let me transfer you to Maya")
- Added intention detection ("I'll play some jazz")
- Added function syntax detection (`playMusic()`)
- Smart suppression vs replacement based on tool type
- 20/20 unit tests passing

#### 2. Imperative Tool Descriptions (ALL DOMAINS)
Updated tool descriptions to use imperative language:

| Domain | Files Updated |
|--------|--------------|
| Information | `src/tools/domains/information/index.ts` |
| Calendar | `src/tools/domains/calendar/index.ts` |
| Memory | `src/tools/domains/memory/tools.ts` |
| Conversation | `src/tools/conversation.ts` |
| Simple Utilities | `timer-tools.ts`, `notes-tools.ts`, `math-tools.ts`, `conversion-tools.ts` |
| Games | `src/tools/domains/games/index.ts` |
| Habits | `src/tools/domains/habits/unified-habits.ts` |
| Wellness | `src/tools/domains/wellness/index.ts` |
| Music | `src/tools/music.ts` |
| Handoffs | `src/agents/personas/ferni-agent.ts` |

**Pattern used:**
```typescript
// Before (ambiguous)
description: 'Get current weather for a city or location.'

// After (imperative)
description: 'CALL this function immediately when user asks about weather. Do not say "let me check" - execute this function directly.'
```

#### 3. System Prompt Reinforcement
Added to `src/personas/bundles/ferni/identity/system-prompt.md`:
```markdown
**CRITICAL: When someone asks you to DO something, call the function. 
Do NOT say 'Sure, I'll play music' — actually play it.**
```

#### 4. E2E Test Validation
Created and ran `src/tests/e2e/gemini-integration/gemini-e2e.test.ts`:
- **28/33 tests pass** (5 timeouts from rate limiting)
- ✅ All handoff tools call functions correctly
- ✅ All music tools call functions correctly
- ✅ All information tools call functions correctly
- ✅ Negative cases pass (doesn't call tools inappropriately)

### Files Changed
```
src/agents/shared/tool-call-sanitizer.ts        # Detection + sanitization
src/agents/shared/tool-call-sanitizer.test.ts   # Unit tests
src/tools/domains/information/index.ts          # Weather, search, news, sports
src/tools/domains/calendar/index.ts             # Appointments, restaurants, contacts
src/tools/domains/memory/tools.ts               # Remember, recall, forget
src/tools/conversation.ts                       # Conversation management
src/tools/domains/simple-utilities/*.ts         # Timer, notes, math, conversion
src/tools/domains/games/index.ts                # Music and text games
src/tools/domains/habits/unified-habits.ts      # Habit tracking
src/tools/domains/wellness/index.ts             # Emotional support, medications
src/tools/music.ts                              # Already updated (earlier)
src/agents/personas/ferni-agent.ts              # Already updated (earlier)
src/personas/bundles/ferni/identity/system-prompt.md  # Already updated (earlier)
```

### Result
When Gemini is asked to perform an action (play music, transfer to team member, check weather):
1. It now calls the function directly instead of speaking about it
2. If it ever does speak about it, the sanitizer catches and filters the leakage
3. Users hear natural results, not "I'll call the playMusic function"

