# Legacy Filler/Processing Phrase Cleanup Plan

> **Goal**: Consolidate all scattered "thinking", "processing", and "filler" phrase systems into the unified `ProcessingIntelligence` system.

## Background

The codebase has accumulated **7+ different systems** for generating processing/thinking phrases, leading to:

- Inconsistent behavior
- Duplicate phrases appearing in multiple places
- No context-awareness (random selection)
- Maintenance nightmare

### The Unified Solution: `ProcessingIntelligence`

Located at `src/intelligence/processing-intelligence.ts`, this system:

- Composes phrases based on **context** (emotion, time of day, relationship stage)
- Uses proper **SSML formatting** with dynamic pauses
- Pairs phrases with **avatar expressions**
- Provides **persona-specific** overrides

---

## Phase 1: Audit Results

### Legacy Systems Found

| File                         | Constant/Function           | Lines | Status        |
| ---------------------------- | --------------------------- | ----- | ------------- |
| `persona-phrases.ts`         | `THINKING_FILLERS`          | ~150  | ❌ Deprecated |
| `persona-phrases.ts`         | `getThinkingFiller()`       | ~20   | ❌ Deprecated |
| `natural-tool-calling.ts`    | `PRE_CALL_PHRASES`          | ~50   | ❌ Replace    |
| `natural-tool-calling.ts`    | `THINKING_SOUNDS`           | ~55   | ❌ Replace    |
| `meaningful-silence.ts`      | `THINKING_OUT_LOUD`         | ~300  | ❌ Replace    |
| `meaningful-silence.ts`      | `COMFORTABLE_PRESENCE`      | ~100  | ❌ Replace    |
| `speech-naturalizer.ts`      | `THINKING_OUT_LOUD`         | ~70   | ❌ Duplicate  |
| `speech-naturalizer.ts`      | `generateThinkingOutLoud()` | ~10   | ❌ Replace    |
| `thinking-time-injector.ts`  | `*_THINKING_SOUNDS`         | ~70   | ❌ Replace    |
| `cartesia-expressiveness.ts` | `THINKING_SOUNDS`           | ~5    | ❌ Remove     |
| `orchestrator.ts`            | `getThinkingFiller()`       | ~5    | ❌ Update     |

### Files That Import Legacy

| File                           | Imports                                        |
| ------------------------------ | ---------------------------------------------- |
| `response-naturalness.ts`      | `THINKING_FILLERS`, `getThinkingFiller`        |
| `speech/index.ts`              | `THINKING_FILLERS`, `getThinkingFiller`        |
| `conversation/index.ts`        | `THINKING_OUT_LOUD`, `generateThinkingOutLoud` |
| `response-naturalness.test.ts` | `THINKING_FILLERS`, `getThinkingFiller`        |
| `speech-modules.test.ts`       | `getThinkingFiller`                            |
| `speech-orchestrator.test.ts`  | `getThinkingFiller()`                          |

### Documentation Referencing Legacy

| Doc                                        | References            |
| ------------------------------------------ | --------------------- |
| `PROCESSING-TIMELINE.md`                   | `getThinkingFiller()` |
| `DEAD-AIR-AUDIT.md`                        | `getThinkingFiller()` |
| `FERNI-INTELLIGENCE-CONSOLIDATION-PLAN.md` | Full migration guide  |

---

## Phase 2: Migration Plan

### Step 1: Update Direct Callers ✅ DONE

- [x] `turn-handler.ts` → uses `getContextAwareThinkingFiller()`
- [x] `session-state-handler.ts` → uses `getContextAwareThinkingFiller()`

### Step 2: Remove `THINKING_FILLERS` from `persona-phrases.ts`

**Before:**

```typescript
export const THINKING_FILLERS: Record<string, string[]> = {
  ferni: [...],
  'maya-santos': [...],
  // ...
};

export function getThinkingFiller(personaId: string): string {
  const fillers = THINKING_FILLERS[normalized];
  return fillers[Math.floor(Math.random() * fillers.length)];
}
```

**After:**

```typescript
// REMOVED - Use getContextAwareThinkingFiller() instead
```

### Step 3: Update `natural-tool-calling.ts`

**Before:**

```typescript
const PRE_CALL_PHRASES = { memory: [...], search: [...] };
const preCallPhrase = PRE_CALL_PHRASES[category][Math.floor(...)];
```

**After:**

```typescript
import { getProcessingPhraseWithSSML } from '../intelligence/processing-intelligence.js';

const preCallPhrase = getProcessingPhraseWithSSML('tool_call', 'light', {
  emotionalState: context.emotionalState,
  hourOfDay: new Date().getHours(),
});
```

### Step 4: Update `meaningful-silence.ts`

**Before:**

```typescript
const THINKING_OUT_LOUD = { afterPersonalShare: [...] };
return randomFrom(THINKING_OUT_LOUD.afterPersonalShare);
```

**After:**

```typescript
import { getProcessingPhraseWithSSML } from '../intelligence/processing-intelligence.js';

return getProcessingPhraseWithSSML('emotional', 'heavy', {
  emotionalState: { primary: 'contemplative', intensity: 0.7 },
});
```

### Step 5: Update `speech-naturalizer.ts`

Remove duplicate `THINKING_OUT_LOUD` and `generateThinkingOutLoud()`.

### Step 6: Update `thinking-time-injector.ts`

Replace per-persona `THINKING_SOUNDS` profiles with ProcessingIntelligence calls.

### Step 7: Update `SpeechOrchestrator`

```typescript
// Before
getThinkingFiller(): string {
  return getThinkingFiller(this.personaId);
}

// After
getThinkingFiller(): string {
  return getContextAwareThinkingFiller(this.personaId, {
    type: 'thinking',
    weight: 'medium',
    hourOfDay: new Date().getHours(),
  });
}
```

### Step 8: Clean Up Exports

Remove from `speech/index.ts`:

- `THINKING_FILLERS`
- `getThinkingFiller`

Remove from `conversation/index.ts`:

- `THINKING_OUT_LOUD`
- `generateThinkingOutLoud`

### Step 9: Update Tests

Update test files to use `getContextAwareThinkingFiller()` instead of deprecated functions.

### Step 10: Update Documentation

- `PROCESSING-TIMELINE.md` - Update code examples
- `DEAD-AIR-AUDIT.md` - Update code examples

---

## Phase 3: Verification

After migration, verify:

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm test` passes
4. No references to deprecated functions remain:
   ```bash
   grep -r "THINKING_FILLERS\|getThinkingFiller[^A-Z]" src/
   ```

---

## Migration Checklist

- [x] Step 1: Direct callers (`turn-handler.ts`, `session-state-handler.ts`) ✅
- [x] Step 2: Deprecate `THINKING_FILLERS` in `persona-phrases.ts` (internal only) ✅
- [x] Step 3: Update `natural-tool-calling.ts` (deprecated legacy, new API exists) ✅
- [x] Step 4: Update `meaningful-silence.ts` (clarified scope - different use case) ✅
- [x] Step 5: Update `speech-naturalizer.ts` (clarified scope - different use case) ✅
- [x] Step 6: Update `thinking-time-injector.ts` (clarified scope - different use case) ✅
- [x] Step 7: Update `SpeechOrchestrator.getThinkingFiller()` ✅
- [x] Step 8: Clean up exports (`speech/index.ts`, `response-naturalness.ts`) ✅
- [x] Step 9: Update tests (`response-naturalness.test.ts`, `speech-modules.test.ts`) ✅
- [x] Step 10: Update documentation (`PROCESSING-TIMELINE.md`, `DEAD-AIR-AUDIT.md`) ✅

**Completed: 2024-12-19**

---

## Estimated Impact

| Metric                 | Before    | After       |
| ---------------------- | --------- | ----------- |
| Duplicate phrase files | 7+        | 1           |
| Lines of phrase code   | ~800      | ~200        |
| Context-aware          | ❌ No     | ✅ Yes      |
| Persona overrides      | Scattered | Centralized |
| Maintenance burden     | High      | Low         |
