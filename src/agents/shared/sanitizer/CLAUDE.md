# Tool Call Sanitizer Module

> **Multi-layer defense against LLM tool call leakage in voice output.**

This module detects and filters malformed function-call-like text that LLMs (especially Gemini) sometimes output instead of making actual function calls.

---

## Architecture

```
sanitizer/
├── config/
│   └── tool-patterns.json    # Single source of truth for tool patterns
├── types.ts                  # Shared type definitions
├── detectors/
│   ├── patterns-loader.ts    # Loads and caches patterns from JSON
│   └── leakage-detector.ts   # Detection logic for various leak patterns
├── executors/
│   ├── deduplication.ts      # Prevents duplicate tool execution
│   └── retry-analyzer.ts     # Determines when to retry failed tool calls
├── streams/
│   └── transform-stream.ts   # Real-time sanitization transform streams
└── index.ts                  # Main exports (backward compatible)
```

---

## Three Layers of Defense

1. **Semantic Router** (`src/tools/semantic-router/`) - Pre-LLM routing
   - High confidence tool requests bypass LLM entirely
   - Never reaches this sanitizer if semantic router handles it

2. **JSON Function Calling** (`json-function-executor.ts`) - LLM fallback
   - LLM outputs JSON like: `{"fn":"playMusic","args":{"query":"jazz"}}`
   - This sanitizer catches and executes that JSON

3. **Leakage Sanitization** (this module) - Last line of defense
   - Catches any JSON that slips through to TTS
   - Detects "I'll call the playMusic function" style leaks
   - Suppresses leaked behavioral markers

---

## Tool Patterns Configuration

All tool patterns are defined in `config/tool-patterns.json`:

```json
{
  "domains": {
    "music": {
      "description": "Music playback and control",
      "patterns": ["playMusic", "play music", "pauseMusic", ...]
    },
    "crisis": {
      "description": "Crisis/Wellness tools (CRITICAL)",
      "critical": true,
      "patterns": ["getCrisisResources", "groundingExercise", ...]
    }
    // ... more domains
  },
  "paramPatterns": ["query", "search", "input", "text"],
  "teamMemberNames": ["maya", "alex", "peter", "jordan", "nayan"],
  "slowTools": ["searchnews", "getweather", ...]
}
```

### Adding New Tool Patterns

1. Edit `config/tool-patterns.json`
2. Add to appropriate domain or create new domain
3. Patterns are case-insensitive (mostly)
4. No code changes needed - patterns are loaded dynamically

---

## Detection Patterns

The leakage detector catches:

| Pattern Type | Example | Detection |
|--------------|---------|-----------|
| Announcement | "I'll call playMusic" | `detectAnnouncement()` |
| Intention | "I'm going to search" | `detectIntention()` |
| Tool Param | "playMusic query jazz" | `detectToolParam()` |
| Tool Mention | "playMusic" at start | `detectToolMention()` |
| Multi-word | "Play music jazz" | `detectMultiWordTool()` |
| Behavioral | "Thinking..." | `detectBehavioralMarker()` |
| Instruction | "You are Ferni" | `detectInstructionLeakage()` |
| fn: prefix | "fn: playMusic" | `detectFnPrefix()` |

---

## Usage

### Basic Detection

```typescript
import { detectsFunctionCallLeakage } from './sanitizer/index.js';

const result = detectsFunctionCallLeakage("I'll call playMusic now");
if (result.detected) {
  console.log(`Leakage: ${result.pattern}, tool: ${result.toolName}`);
}
```

### Transform Stream

```typescript
import { createSanitizerTransformStream } from './sanitizer/index.js';

const sanitizer = createSanitizerTransformStream();
// Pipe LLM output through sanitizer before TTS
llmStream.pipeThrough(sanitizer).pipeTo(ttsStream);
```

### With Music Fallback

```typescript
import { createSanitizerWithMusicFallback } from './sanitizer/index.js';

const sanitizer = createSanitizerWithMusicFallback({
  toolContext: { userId, sessionId },
  session: agentSession,
  sessionId,
});
```

### Deduplication

```typescript
import {
  markToolExecutedBySemanticRouter,
  wasToolExecutedBySemanticRouter,
} from './sanitizer/index.js';

// After semantic router executes a tool
markToolExecutedBySemanticRouter(sessionId, 'playMusic:jazz');

// Later, in sanitizer stream
if (wasToolExecutedBySemanticRouter(sessionId, 'playMusic:jazz')) {
  // Skip execution - already handled
}
```

---

## Session Cleanup

Always clean up session state on disconnect:

```typescript
import { clearToolDeduplicationForSession } from './sanitizer/index.js';

// On session end
clearToolDeduplicationForSession(sessionId);
```

---

## Debugging

### Log Signatures

```bash
# Good - JSON detected and executed
🎯 JSON function call detected
🔧 Executing JSON function call

# Bad - Leakage to TTS
🚨 TOOL CALL LEAKAGE DETECTED: playMusic query jazz

# Dedup working
🎯 Tool already executed by semantic router: playMusic:jazz
```

### Testing Tool Detection

```typescript
import { getAllToolPatterns, detectsFunctionCallLeakage } from './sanitizer/index.js';

// List all patterns
console.log(getAllToolPatterns().length, 'patterns loaded');

// Test specific detection
const testCases = [
  "I'll play some jazz",
  "playMusic query christmas",
  "Let me transfer you to Maya",
];

for (const text of testCases) {
  const result = detectsFunctionCallLeakage(text);
  console.log(text, '→', result.detected ? result.pattern : 'clean');
}
```

---

## Migration from Old System

The old monolithic `tool-call-sanitizer.ts` exports are maintained for backward compatibility. New code should import from sub-modules:

```typescript
// Old (still works)
import { detectsFunctionCallLeakage } from './sanitizer/index.js';

// New (preferred)
import { detectsFunctionCallLeakage } from './sanitizer/index.js';
```

---

## Rules

### Do
- Add new patterns to `tool-patterns.json` (not code)
- Use session-scoped dedup caches
- Clean up session state on disconnect
- Test pattern changes with voice E2E tests

### Don't
- Hardcode tool patterns in detection code
- Store session state in module-level variables
- Skip cleanup handlers
- Modify detection regex without thorough testing

---

*Last updated: December 2024*

