# Better Than Human: Wrap-Up & Disconnection Testing Checklist

> This checklist covers the complete flow from user goodbye intent through graceful disconnection.

## Quick Start

1. Open the app with dev mode: `http://localhost:3004/?dev`
2. Press `Cmd/Ctrl+Shift+D` to open the dev panel
3. Scroll to **"Conversation Flow"** section for wrap-up buttons

---

## Testing the Full E2E Flow

### 1. Backend: Goodbye Detection

**Test Location:** `src/tests/wrap-up-e2e.test.ts`

```bash
pnpm vitest run src/tests/wrap-up-e2e.test.ts
```

**What's Tested:**
- ✅ GOODBYE_PATTERNS detect explicit goodbye phrases
- ✅ PRE_GOODBYE_PATTERNS detect winding down signals
- ✅ Heavy conversation detection (grief, mental health, etc.)
- ✅ Time-aware farewell suggestions
- ✅ Personalized sign-offs

### 2. Context Builder Integration

**Test Location:** `src/tests/intelligence/goodbye-context-builder.integration.test.ts`

```bash
pnpm vitest run src/tests/intelligence/goodbye-context-builder.integration.test.ts
```

**What's Tested:**
- ✅ Anticipatory goodbye detection (before explicit "goodbye")
- ✅ Emotional echo for heavy conversations
- ✅ Persona-specific goodbye behavior
- ✅ Interruption recovery
- ✅ Silence handling

### 3. Frontend Signal Handling

**Manual Test via Dev Panel:**

| Button | Expected Result |
|--------|-----------------|
| **Warm Goodbye** | 🟢 Happy expression + warmth sparkle + glow |
| **Encouraging** | 🟢 Happy held pose + affirming nod |
| **Thoughtful** | 🟢 Empathetic expression |
| **Caring** | 🟢 Empathy expression + warm glow |
| **Reset** | 🟢 Returns to neutral state |

### 4. Conversation End Flow

**Trigger:** When agent calls `endConversation` tool

| Reason | Expected Sound | Expected Expression | Disconnect Delay |
|--------|---------------|---------------------|-----------------|
| `goodbye_complete` | 🔔 goodbye | 😊 farewell | 2000ms |
| `agent_exit` | 🔔 phoneClick | 😐 settling | 1500ms |
| `natural_end` | 🔔 goodbye | 😊 farewell | 2000ms |

---

## Manual Testing Checklist

### Phase 1: Pre-Goodbye Detection

- [ ] Say "anyway, that's about it..." → Should trigger pre-goodbye context
- [ ] Say "thanks for listening" → Should trigger winding down
- [ ] Say "it's getting late" → Should trigger time pressure detection
- [ ] Short responses after 5+ turns → Should detect disengagement

### Phase 2: Explicit Goodbye Detection

- [ ] Say "goodbye" → Should trigger full goodbye flow
- [ ] Say "gotta go" → Should trigger goodbye
- [ ] Say "take care" → Should trigger goodbye
- [ ] Say "see you later" → Should trigger goodbye
- [ ] Say "catch you later" → Should trigger goodbye

### Phase 3: Emotional Goodbye (Heavy Conversations)

After discussing heavy topics (grief, therapy, illness):
- [ ] Goodbye should include emotional acknowledgment
- [ ] Message should validate the conversation weight
- [ ] Expression should be empathetic, not just happy

### Phase 4: Disconnect Ceremony

- [ ] Warm goodbye sound plays
- [ ] Avatar shows farewell expression
- [ ] "See you next time!" message appears
- [ ] Disconnect happens after ~2 second delay
- [ ] No abrupt cutoff feeling

### Phase 5: Agent-Initiated Exit

- [ ] phoneClick sound plays (not warm goodbye)
- [ ] Settling expression (not warm farewell)
- [ ] Shorter delay (1.5s vs 2s)
- [ ] Different messaging tone

---

## Console Logging to Verify

Open browser DevTools and filter for these logs:

```
[DataMessageHandlers] Wrap-up signal received:
[FerniExpressions] Expression set:
[FerniExpressions] Warmth sparkle triggered
[DevPanel] Triggered wrap-up:
```

---

## Known Issues & Edge Cases

### Edge Cases to Test

| Scenario | Expected Behavior |
|----------|-------------------|
| Goodbye + heavy topic | Emotional echo in farewell |
| Goodbye at 2am | Night-specific farewell suggestion |
| Goodbye after interruption | Handle both interruption + goodbye |
| User silent after goodbye | Don't re-prompt, let disconnect happen |
| Very short conversation goodbye | Less ceremony, simpler farewell |

### Current Limitations

1. **No real goodbye sound in dev mode** - Audio files need actual sound
2. **Haptic vibration blocked** - Browser requires user interaction first
3. **Time-aware test is timezone dependent** - Results vary by local time

---

## Files Reference

| Component | Location |
|-----------|----------|
| Backend goodbye detection | `src/intelligence/context-builders/goodbye.ts` |
| Conversation tools | `src/tools/domains/conversation/conversation-tools.ts` |
| Frontend signal handler | `apps/web/src/app/data-message-handlers.ts` |
| Ferni expressions | `apps/web/src/ui/ferni-expressions.ui.ts` |
| Dev panel | `apps/web/src/ui/dev-panel.ui.ts` |
| E2E tests | `src/tests/wrap-up-e2e.test.ts` |
| Integration tests | `src/tests/intelligence/goodbye-context-builder.integration.test.ts` |

---

## Adding New Test Cases

When adding new goodbye patterns:

1. Add pattern to `GOODBYE_PATTERNS` or `PRE_GOODBYE_PATTERNS` in `goodbye.ts`
2. Add test case to `src/tests/wrap-up-e2e.test.ts`
3. Run `pnpm vitest run src/tests/wrap-up-e2e.test.ts` to verify
4. Test manually via dev panel

When adding new expressions:

1. Add expression type to `FerniExpression` in `ferni-expressions.ui.ts`
2. Add SVG path configuration in the same file
3. Test via dev panel "Ferni Emotion System" section

