# Tool Loading System

> How tools get from definition to the LLM at runtime.

This document explains the complete tool loading pipeline - what files control it, when loading happens, and how to debug issues.

---

## Quick Reference

| File | Purpose | When Read |
|------|---------|-----------|
| `data/model-config.json` | Admin config: `includedTools`, `enabledDomains` | Server startup |
| `src/tools/dynamic-loader.ts` | `essentialDomains` - always loaded at session start | Session creation |
| `src/tools/orchestrator/unified-tool-orchestrator.ts` | Semantic selection, tool limits | Each turn |
| `src/personas/bundles/shared/function-calling-base.md` | JSON workaround prompts | Session creation |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TOOL LOADING PIPELINE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. SERVER STARTUP                                                   │
│     ┌──────────────────────┐                                        │
│     │ data/model-config.json│ ← Admin settings                      │
│     │  - includedTools      │   (guaranteed tools)                  │
│     │  - enabledDomains     │   (available domains)                 │
│     │  - maxTools: 30       │   (limit per session)                 │
│     └──────────────────────┘                                        │
│              ↓                                                       │
│  2. TOOL REGISTRY INIT                                              │
│     ┌──────────────────────┐                                        │
│     │ src/tools/domains/*   │ ← All 585 tools registered            │
│     │  - information/       │                                       │
│     │  - entertainment/     │                                       │
│     │  - memory/            │                                       │
│     │  - handoff/           │                                       │
│     │  - ... (40+ domains)  │                                       │
│     └──────────────────────┘                                        │
│              ↓                                                       │
│  3. SESSION CREATION (user connects)                                │
│     ┌──────────────────────┐                                        │
│     │ dynamic-loader.ts     │ ← Essential domains loaded first      │
│     │  essentialDomains:    │                                       │
│     │  - memory             │                                       │
│     │  - handoff            │                                       │
│     │  - awareness          │                                       │
│     │  - entertainment      │                                       │
│     │  - information        │   ← Added to fix news!                │
│     └──────────────────────┘                                        │
│              ↓                                                       │
│  4. TOOL SELECTION (per turn)                                       │
│     ┌──────────────────────┐                                        │
│     │ unified-tool-         │                                       │
│     │ orchestrator.ts       │                                       │
│     │                       │                                       │
│     │ Selection priority:   │                                       │
│     │ 1. includedTools ────────→ ALWAYS sent (playMusic, getNews)   │
│     │ 2. alwaysDomains ────────→ Domain tools always available      │
│     │ 3. Semantic match ───────→ Based on user intent               │
│     │ 4. maxTools limit ───────→ Cap at 30 tools                    │
│     └──────────────────────┘                                        │
│              ↓                                                       │
│  5. SENT TO GEMINI                                                  │
│     ┌──────────────────────┐                                        │
│     │ Native function calls │ ← Primary path                        │
│     │ + googleSearch: {}    │ ← Built-in Gemini tool                │
│     └──────────────────────┘                                        │
│              ↓                                                       │
│  6. BACKUP: JSON WORKAROUND                                         │
│     ┌──────────────────────┐                                        │
│     │ function-calling-     │ ← If native fails, LLM outputs JSON   │
│     │ base.md               │   {"fn":"getNews","args":{}}          │
│     │                       │                                       │
│     │ tool-call-sanitizer.ts│ ← Intercepts JSON from speech stream  │
│     └──────────────────────┘                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Configuration Files

### 1. `data/model-config.json` (Admin Config)

**When read:** Server startup, cached in memory.

```json
{
  "toolDefaults": {
    "maxTools": 30,
    "enabledDomains": [
      "entertainment",
      "memory",
      "information",
      "handoff",
      ...
    ],
    "includedTools": [
      "playMusic",
      "musicControl",
      "musicInfo",
      "getNews",      // ← Guaranteed to be sent
      "getWeather"    // ← Guaranteed to be sent
    ],
    "excludedTools": [],
    "debugMode": true,
    "logToolSchemas": true,
    "logToolResults": true
  }
}
```

| Field | Purpose |
|-------|---------|
| `includedTools` | **ALWAYS** sent to Gemini, bypasses semantic selection |
| `enabledDomains` | Domains available for semantic selection |
| `excludedTools` | Tools to never include |
| `maxTools` | Maximum tools per session (Gemini limit ~30) |

**To add a guaranteed tool:** Add to `includedTools` array.

---

### 2. `src/tools/dynamic-loader.ts` (Essential Domains)

**When read:** Session creation.

```typescript
// Line 463
essentialDomains: ['memory', 'handoff', 'awareness', 'entertainment', 'information'],
```

| Domain | Why Essential |
|--------|---------------|
| `memory` | Remember/recall user facts |
| `handoff` | Transfer between personas |
| `awareness` | Time, context awareness |
| `entertainment` | Music playback |
| `information` | News, weather, sports |

**To add an essential domain:** Add to `essentialDomains` array.

---

### 3. `src/tools/orchestrator/unified-tool-orchestrator.ts`

**When called:** Every conversation turn.

Selection algorithm:
1. Start with `includedTools` (guaranteed)
2. Add tools from `alwaysDomains`
3. Add semantically matched tools based on user intent
4. Exclude any in `excludedTools`
5. Cap at `maxTools` (30)

```typescript
// Line 411-418: Force-include tools from config
if (this.config.includedTools.length > 0) {
  const configIncludedTools = await this.getToolsByIds(this.config.includedTools, ctx);
  allTools = { ...allTools, ...configIncludedTools };
}
```

---

### 4. `src/personas/bundles/shared/function-calling-base.md`

**When read:** Session creation (becomes part of system prompt).

This is the **JSON workaround** for when Gemini's native function calling fails:

```markdown
# Function Calling

Output RAW JSON only. No speech. No markdown.

Format: {"fn":"name","args":{...}}

## Examples

"Play jazz" → {"fn":"playMusic","args":{"query":"jazz"}}
"News" → {"fn":"getNews","args":{}}
```

**To add a tool to JSON workaround:** Add to the `# USE TOOLS` section.

---

## Two Parallel Systems

Ferni uses TWO function calling systems for reliability:

### 1. Native Gemini Function Calling (Primary)

```typescript
// voice-agent-entry.ts
const agent = new FerniAgent(systemPrompt, {
  tools: orchestratorTools,  // ← Native tools
  geminiTools: { googleSearch: {} },  // ← Built-in Gemini tools
});
```

- Tools defined with `llm.tool()`
- Sent to Gemini as function schemas
- Gemini returns structured `functionCalls` array

### 2. JSON Workaround (Backup)

```typescript
// tool-call-sanitizer.ts
// Intercepts {"fn":"toolName","args":{...}} from text stream
```

- LLM outputs JSON in speech stream
- `tool-call-sanitizer.ts` detects and intercepts
- Routes to `json-function-executor.ts`

**Both systems must stay in sync** - if you add a tool to one, add to both.

---

## Debugging Tool Loading

### Check what tools are loaded

Look for this log at startup:
```
✅ Unified Tool Orchestrator ready
    totalTools: 585
    alwaysDomains: ["memory", "handoff", "entertainment", "information"]
    includedTools: ["playMusic", "musicControl", "musicInfo", "getNews", "getWeather"]
```

### Check what tools are sent to Gemini

Enable debug logging in `model-config.json`:
```json
{
  "toolDefaults": {
    "debugMode": true,
    "logToolSchemas": true
  }
}
```

Look for:
```
🔧 Tools sent to Gemini: ["playMusic", "getNews", "getWeather", ...]
```

### Check if tool was called

```
🎯 TOOL CALL RECEIVED: {"functionCalls":[{"name":"getNews",...}]}
```

or for JSON workaround:
```
🎯 JSON function call detected: {"fn":"getNews","args":{}}
```

---

## Common Issues

### Tool works for music but not news

**Cause:** Tool not in `includedTools`, relying on semantic selection which may not match.

**Fix:** Add to `data/model-config.json`:
```json
"includedTools": ["playMusic", "musicControl", "musicInfo", "getNews", "getWeather"]
```

### Tool in domain but not available

**Cause:** Domain not in `essentialDomains` or `enabledDomains`.

**Fix:** Add to `dynamic-loader.ts`:
```typescript
essentialDomains: ['memory', 'handoff', 'awareness', 'entertainment', 'information'],
```

### LLM speaks tool name instead of calling it

**Cause:** Tool not registered in native Gemini tools, and not in JSON workaround prompt.

**Fix:**
1. Check tool is in `domains/*/index.ts`
2. Check tool is in `function-calling-base.md`
3. Check tool name is in `tool-call-sanitizer.ts` patterns

### Dynamic loading too late

**Cause:** Tool domain loaded after session starts, but Gemini session already created.

**Fix:** Add domain to `essentialDomains` (loaded at session creation).

---

## File Locations Summary

```
voiceai/
├── data/
│   └── model-config.json           # Admin config (includedTools, enabledDomains)
│
├── src/
│   ├── tools/
│   │   ├── dynamic-loader.ts       # essentialDomains (line 463)
│   │   ├── orchestrator/
│   │   │   └── unified-tool-orchestrator.ts  # Selection logic
│   │   └── domains/
│   │       ├── information/        # News, weather, sports tools
│   │       ├── entertainment/      # Music tools
│   │       └── ...                 # 40+ domains
│   │
│   ├── agents/
│   │   ├── voice-agent-entry.ts    # Gemini session creation (line 799)
│   │   └── shared/
│   │       ├── tool-call-sanitizer.ts    # JSON detection
│   │       └── json-function-executor.ts # JSON execution
│   │
│   └── personas/
│       └── bundles/
│           └── shared/
│               └── function-calling-base.md  # JSON workaround prompts
```

---

## Adding a New Guaranteed Tool

1. **Create the tool** in `src/tools/domains/{domain}/`

2. **Add to includedTools** in `data/model-config.json`:
   ```json
   "includedTools": [..., "myNewTool"]
   ```

3. **Add to JSON workaround** in `function-calling-base.md`:
   ```markdown
   myNewTool: {"fn":"myNewTool","args":{"param":"STRING"}}
   ```

4. **Add to sanitizer patterns** in `tool-call-sanitizer.ts`:
   ```typescript
   const TOOL_NAME_PATTERNS = [..., 'myNewTool'];
   ```

5. **Restart voice agent** to pick up changes.

---

*Last updated: December 2024*
