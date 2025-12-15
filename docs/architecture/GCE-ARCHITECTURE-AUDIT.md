# GCE Architecture Audit - Integration Gaps

## Summary

The new orchestrator (`src/agents/orchestrator/`) provides clean architecture but is **missing many integrations** from `voice-agent-entry.ts`. This document tracks what's missing and what needs to be done.

## Status: ✅ Near Complete

### ✅ Implemented in New Architecture

| Feature                       | Old File             | New Location                | Status      |
| ----------------------------- | -------------------- | --------------------------- | ----------- |
| Session context building      | voice-agent-entry.ts | orchestrator/context.ts     | ✅ Complete |
| User identification           | voice-agent-entry.ts | steps/identify-user.ts      | ✅ Complete |
| Persona loading               | voice-agent-entry.ts | steps/load-persona.ts       | ✅ Complete |
| Room connection               | voice-agent-entry.ts | steps/connect-room.ts       | ✅ Complete |
| Services initialization       | voice-agent-entry.ts | steps/load-services.ts      | ✅ Complete |
| Agent creation                | voice-agent-entry.ts | steps/create-agent.ts       | ✅ Complete |
| Greeting                      | voice-agent-entry.ts | steps/speak-greeting.ts     | ✅ Complete |
| Music handler                 | voice-agent-entry.ts | session-orchestrator.ts     | ✅ Complete |
| Data channel handler          | voice-agent-entry.ts | session-orchestrator.ts     | ✅ Complete |
| Transcript handler            | voice-agent-entry.ts | session-orchestrator.ts     | ✅ Complete |
| Session state handlers        | voice-agent-entry.ts | session-orchestrator.ts     | ✅ Complete |
| Handoff handler               | voice-agent-entry.ts | session-orchestrator.ts     | ✅ Complete |
| **Voice Humanization**        | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |
| **Tool Tracking Handler**     | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |
| **Cameo Handlers**            | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |
| **Frontend Publisher**        | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |
| **Bundle Runtime**            | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |
| **Phone Detection**           | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |
| **Prosody Bridge**            | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |
| **Conversation Humanization** | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |
| **Async Events**              | voice-agent-entry.ts | steps/setup-integrations.ts | ✅ Complete |

### ⚠️ Minor Gaps (Non-Critical)

| Feature                     | Importance | Notes                           |
| --------------------------- | ---------- | ------------------------------- |
| **Silence Context**         | Medium     | Can be added if needed          |
| **Dynamic Tool Loader**     | Low        | Used for on-demand tool loading |
| **Auto Optimizer**          | Low        | Performance optimization        |
| **Game Engine**             | Low        | Session games                   |
| **Cognitive Session Hooks** | Low        | Analytics                       |
| **Engagement Data Sender**  | Low        | Analytics                       |

### ❌ Missing Non-Critical Services

| Feature                           | Importance | Lines in Entry |
| --------------------------------- | ---------- | -------------- |
| Humanization Signal Emitter       | Medium     | 766-778        |
| Trust Signal Emitter              | Medium     | 783-802        |
| Async Events                      | Low        | 812-823        |
| Prosody Bridge                    | Low        | 828-834        |
| Unified Conversation Humanization | Medium     | 866-894        |
| Voice Humanization Init           | Low        | 900-911        |
| Engagement Data Sender            | Low        | 918-933        |
| Cognitive Session Hooks           | Low        | 935-948        |
| Game Engine                       | Low        | 950-960        |
| Extensibility Hook                | Medium     | 573-589        |

## Recommended Fix Priority

### Phase 1: Critical (Required for Production)

1. **Voice Humanization Integration**
   - Add `SetupVoiceHumanizationStep` pipeline step
   - Integrate micro-interruption detection
   - Integrate laughter detection

2. **Tool Tracking Handler**
   - Add tool tracking to session orchestrator
   - Wire up to transcript handler

3. **Frontend Publisher**
   - Add `SetupFrontendPublisherStep`
   - Initialize humanization signal emitter
   - Initialize trust signal emitter

4. **Cleanup Handler**
   - Create proper cleanup pipeline
   - Wire all cleanup handlers

5. **Fix Transcript Handler Nulls**
   - Pass real silenceContext
   - Pass real dynamicToolLoader
   - Pass real autoOptimizer

### Phase 2: High Priority

6. **Bundle Runtime**
   - Add `SetupBundleRuntimeStep`
   - Wire to greeting handler
   - Sync relationship state

7. **Phone Call Detection**
   - Add phone detection to CreateAgentStep
   - Enable noise cancellation when detected

8. **Cameo Handlers**
   - Add `SetupCameoStep`
   - Wire to handoff system

### Phase 3: Medium Priority

9. Extensibility Hook (marketplace agents)
10. Unified Conversation Humanization
11. Async Events

### Phase 4: Low Priority (Nice to Have)

12. Prosody Bridge
13. Engagement Data Sender
14. Cognitive Session Hooks
15. Game Engine

## Testing Gaps

The new architecture needs tests:

```
src/agents/__tests__/
├── orchestrator/
│   ├── session-orchestrator.test.ts    ❌ Missing
│   ├── context.test.ts                  ❌ Missing
│   └── steps/
│       ├── identify-user.test.ts        ❌ Missing
│       ├── load-persona.test.ts         ❌ Missing
│       ├── connect-room.test.ts         ❌ Missing
│       ├── load-services.test.ts        ❌ Missing
│       ├── create-agent.test.ts         ❌ Missing
│       └── speak-greeting.test.ts       ❌ Missing
├── core/
│   ├── result.test.ts                   ❌ Missing
│   ├── pipeline.test.ts                 ❌ Missing
│   └── errors.test.ts                   ❌ Missing
└── adapters/
    ├── livekit.test.ts                  ❌ Missing
    └── cartesia.test.ts                 ❌ Missing
```

**Existing tests that may break:**

- `voice-agent-entry.test.ts` - Tests old entry file
- `voice-agent-e2e.test.ts` - E2E tests
- `voice-agent-integration.test.ts` - Integration tests

## Type Safety Issues

Current `as never` casts that should be fixed:

1. `session-orchestrator.ts:142` - agentSession type
2. `session-orchestrator.ts:170` - room type
3. `session-orchestrator.ts:191` - session type
4. `speak-greeting.ts:56` - room type
5. `create-agent.ts:79` - tools type

## Recommendations

### Option A: Incremental Migration (Recommended)

1. Keep `voice-agent-entry.ts` as fallback
2. Add missing integrations to orchestrator one-by-one
3. Test each integration thoroughly
4. Switch production traffic gradually

### Option B: Feature Flag Migration

1. Add `USE_NEW_ORCHESTRATOR=true` flag
2. Run both paths in parallel
3. Compare metrics
4. Switch when parity achieved

### Option C: Complete Rewrite

1. Port all integrations at once
2. Delete old files
3. Risk: Higher chance of production issues

## Current Environment Variable Behavior

```bash
# NEW DEFAULT (GCE Optimized)
node dist/agent.js dev

# Legacy modes for fallback
USE_LEGACY_MULTIPROCESS=true node dist/agent.js dev
USE_LEGACY_SINGLE=true node dist/agent.js dev
```

## Next Steps

1. [ ] Add missing critical integrations (Phase 1)
2. [ ] Write tests for new architecture
3. [ ] Run existing E2E tests against new architecture
4. [ ] Performance comparison
5. [ ] Production deploy with monitoring

---

_Last updated: December 2024_
