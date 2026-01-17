# Model Provider Module

Centralized abstraction for LLM provider differences, eliminating scattered environment variable checks throughout the codebase.

## Purpose

Previously, 38+ environment variable checks across 12 files created fragile, hard-to-maintain code. Adding a new provider or feature flag required touching every file. This module:

- **Single source of truth**: All model differences in one place
- **Easy to add providers**: Just implement the interface
- **Testable**: Mock providers in tests
- **Type-safe**: Compiler catches missing implementations
- **Discoverable**: `getModelProvider().` shows all available behaviors

## Quick Start

```typescript
import { getModelProvider, isUsingOpenAI } from './model-provider/index.js';

// Get the current provider (singleton)
const provider = getModelProvider();

// Check capabilities
if (provider.hasNativeFunctionCalling()) {
  // Skip JSON workaround
}

// Get prompt configuration
const modules = provider.getPromptModules();
if (modules.includeFunctionCallingBase) {
  // Load JSON function-calling prompts
}

// Create LLM model
const llm = await provider.createLLMModel({
  instructions: systemPrompt,
  temperature: 0.7,
});

// Quick checks without loading provider
if (isUsingOpenAI()) {
  // OpenAI-specific initialization
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Factory Layer                            │
│                   getModelProvider() [singleton]                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Provider Interface                          │
│                       ModelProvider                             │
│  - hasNativeFunctionCalling()                                   │
│  - needsJsonWorkaround()                                        │
│  - getPromptModules()                                           │
│  - createLLMModel()                                             │
│  - getSessionTurnDetection()                                    │
│  - needsPrewarm()                                               │
└─────────────────────────────────────────────────────────────────┘
                    ▲                           ▲
                    │                           │
        ┌───────────┴─────────┐     ┌──────────┴──────────┐
        │ OpenAIRealtimeProvider │   │ GeminiLiveProvider  │
        │ - Native function call │   │ - JSON workaround   │
        │ - No prewarm needed    │   │ - Needs prewarm     │
        │ - undefined turn det.  │   │ - realtime_llm      │
        └────────────────────────┘   └─────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `types.ts` | `ModelProvider` interface and related types |
| `openai-realtime.ts` | OpenAI Realtime API implementation |
| `gemini-live.ts` | Gemini Live API implementation |
| `factory.ts` | Factory with singleton pattern |
| `index.ts` | Public exports |

## Provider Comparison

| Feature | OpenAI Realtime | Gemini Live |
|---------|-----------------|-------------|
| Native function calling | ✅ Yes | ❌ No (JSON workaround) |
| JSON workaround needed | ❌ No | ✅ Yes |
| Turn detection | `undefined` (internal) | `'realtime_llm'` |
| Needs prewarm | ❌ No | ✅ Yes |
| Token limit | 14,000 | 30,000 |
| Log prefix | 🔮 | 🤖 |

## Testing

```typescript
import { setModelProvider, clearModelProvider } from './model-provider/index.js';

beforeEach(() => {
  // Inject mock provider
  setModelProvider(mockProvider);
});

afterEach(() => {
  // Reset to real provider
  clearModelProvider();
});
```

Run tests:
```bash
pnpm vitest run src/agents/model-provider/__tests__/factory.test.ts
```

## Adding a New Provider

1. Create `new-provider.ts` implementing `ModelProvider`:
```typescript
export class NewProvider implements ModelProvider {
  readonly id = 'new-provider';
  readonly displayName = 'New Provider API';
  
  hasNativeFunctionCalling() { return true; }
  // ... implement all methods
}
```

2. Update `factory.ts`:
```typescript
export function getModelProvider(): ModelProvider {
  if (process.env.USE_NEW_PROVIDER === 'true') {
    return new NewProvider();
  }
  // ... existing logic
}
```

3. Add to exports in `index.ts`

4. Add tests

## Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| `USE_OPENAI_REALTIME` | `false` | Use OpenAI Realtime API |

## Migration Notes

When migrating from direct env var checks:

**Before:**
```typescript
if (process.env.USE_OPENAI_REALTIME === 'true') {
  return null; // skip JSON prompts
}
```

**After:**
```typescript
const provider = getModelProvider();
if (!provider.getPromptModules().includeFunctionCallingBase) {
  return null;
}
```

## Common Patterns

### Skip JSON workaround
```typescript
const provider = getModelProvider();
if (!provider.needsJsonWorkaround()) {
  // Skip sanitizer
}
```

### Get turn detection for AgentSession
```typescript
const session = new voice.AgentSession({
  turnDetection: provider.getSessionTurnDetection(),
});
```

### Check if prewarm needed
```typescript
if (provider.needsPrewarm()) {
  await prewarmSession(session, sessionId);
}
```

## Related Documentation

- `docs/architecture/CLEAN-ARCHITECTURE.md` - Overall architecture
- `src/agents/multi-agent/CLAUDE.md` - Multi-agent system
- `src/agents/CLAUDE.md` - Voice agent development
