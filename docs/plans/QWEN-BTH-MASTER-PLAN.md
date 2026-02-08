# Qwen Better Than Human – Master Plan

**Goal:** Make the Qwen3-Omni path "Better Than Human" and **better than** the Gemini + Cartesia path by default: full stack by default, frontend consuming BTH events, non-Director Qwen using the session manager, observability, and docs.

---

## Phase 1: Default Full Stack When Qwen Is On

**Intent:** When `USE_QWEN3_OMNI=true`, treat full stack as the default so every Qwen path (Director and non-Director) uses the session manager and BTH unless explicitly disabled.

| Task                                                                                     | File(s)                                          | Status |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| Treat FULL_STACK as true when USE_QWEN3_OMNI=true unless USE_QWEN3_OMNI_FULL_STACK=false | `voice-agent-entry.ts`, `director-mode-setup.ts` | ✅     |
| Document override in .env.example                                                        | `.env.example`                                   | ✅     |

**Logic:** `useFullStack = process.env.USE_QWEN3_OMNI === 'true' && process.env.USE_QWEN3_OMNI_FULL_STACK !== 'false'`

---

## Phase 2: Frontend Consumes BTH Events (Qwen Path)

**Intent:** Session manager sends `qualityMetrics`, `personalitySignals`, and `textChunk` via sendDataMessage. The frontend must handle these so the avatar and EQ respond the same as on the Gemini path.

| Task                                                                             | File(s)                                     | Status |
| -------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| Add `qualityMetrics` handler in data-message-handlers.ts                         | `apps/web/src/app/data-message-handlers.ts` | ✅     |
| Add `personalitySignals` handler (e.g. map to humanization_signal or expression) | Same                                        | ✅     |
| Ensure handlers drive avatar/expression or dispatch to EQ bridge                 | Same                                        | ✅     |
| Add event types to frontend types if needed                                      | Inline interfaces in data-message-handlers  | ✅     |

**Payloads (from session manager):**

- `qualityMetrics`: `{ qualityMetrics: { averageDepth?, engagement?, ... } }`
- `personalitySignals`: `{ personalityContext: unknown }`

**Behavior:** Map to micro-expression or humanization_signal so EQ/avatar reacts (e.g. depth/engagement → subtle expression).

---

## Phase 3: Non-Director Qwen Uses Session Manager

**Intent:** When `USE_QWEN3_OMNI=true` and **not** Director Mode, use `SessionManagerRealtimeModel` with a single persona so every Qwen call gets the full BTH stack (no Director cast UI).

| Task                                                                                                   | File(s)                           | Status |
| ------------------------------------------------------------------------------------------------------ | --------------------------------- | ------ |
| In voice-agent-entry, when USE_QWEN3_OMNI=true and !isDirectorMode, create SessionManagerRealtimeModel | `src/agents/voice-agent-entry.ts` | ✅     |
| Pass sendDataMessage and services (same as Director FULL_STACK config)                                 | Same                              | ✅     |
| Use SessionManagerRealtimeModel as `llm` for AgentSession (single persona)                             | Same                              | ✅     |
| Ensure TTS remains Qwen3-TTS; no DirectorEngine/AudioRouter                                            | Same                              | ✅     |

**Flow:** Same as Director FULL_STACK: pushAudio → commitAudio → transcribeAudio → processTurn → text/audio to streams, events via sendDataMessage. No cast/scene UI.

---

## Phase 4: Observability – Path Logging

**Intent:** Log or metric which path is active (qwen_full_stack, qwen_director, gemini_cartesia, openai_cartesia) so we can compare latency and quality.

| Task                                                                       | File(s)                | Status |
| -------------------------------------------------------------------------- | ---------------------- | ------ |
| Log path at session creation (e.g. "qwen_full_stack" \| "gemini_cartesia") | `voice-agent-entry.ts` | ✅     |
| Optionally log in session-manager adapter when processTurn runs            | Deferred               | ⬜     |

---

## Phase 5: Docs and .env

**Intent:** Document default full stack, non-Director session manager, and BTH event handling so future work and ops are clear.

| Task                                                                     | File(s)                                                | Status |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | ------ |
| Update .env.example: FULL_STACK default when QWEN3_OMNI=true             | `.env.example`                                         | ✅     |
| Update Director Mode guide: when session manager is used, BTH events     | `docs/guides/DIRECTOR-MODE-LOCAL-DEV.md` or Qwen guide | ⬜     |
| Update Qwen3-Omni CLAUDE or guide: full stack default, non-Director path | `src/integrations/qwen3-omni/CLAUDE.md` or docs/plans  | ⬜     |
| Mark completed items in QWEN-BETTER-THAN-HUMAN-LEVERS.md                 | `docs/plans/QWEN-BETTER-THAN-HUMAN-LEVERS.md`          | ✅     |

---

## Out of Scope (Follow-ups)

- **Latency:** processAudioTurn + BTH-on-response (one Thinker round-trip) – separate change.
- **Prompt parity:** Audit session-manager prompt vs Gemini prompt – audit only.
- **Product copy:** Voice cloning, native FC, self-host messaging – product/marketing.

---

## Execution Order

1. Phase 1 – Default full stack
2. Phase 2 – Frontend BTH handlers
3. Phase 3 – Non-Director session manager
4. Phase 4 – Observability
5. Phase 5 – Docs and .env

---

## Files Summary

| Phase | Files                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `src/agents/voice-agent-entry.ts`, `src/agents/voice-agent/director-mode-setup.ts`                                                               |
| 2     | `apps/web/src/app/data-message-handlers.ts`, `apps/web/src/types/events.ts` (if needed)                                                          |
| 3     | `src/agents/voice-agent-entry.ts`                                                                                                                |
| 4     | `src/agents/voice-agent-entry.ts`, `src/integrations/qwen3-omni/adapters/livekit-session-manager-adapter.ts`                                     |
| 5     | `.env.example`, `docs/guides/DIRECTOR-MODE-LOCAL-DEV.md`, `src/integrations/qwen3-omni/CLAUDE.md`, `docs/plans/QWEN-BETTER-THAN-HUMAN-LEVERS.md` |
