# Voice Agent Pipeline Gaps Audit

**Date:** February 7, 2026  
**Scope:** End-to-end pipeline integration gaps in the Ferni voice AI platform

This audit identifies components that are defined, configured, or partially implemented but not fully wired end-to-end.

---

## 1. Voice Agent Entry → Processor Chain

### ✅ WIRED CORRECTLY

- **`warmupResources` is called**: `src/agents/gce-voice-worker.ts:268` calls `warmupResources(log)` during container startup
- **`sendDataMessage` helper is created**: `src/agents/voice-agent-entry.ts:2173-2181` creates helper and passes it to handlers
- **Model provider injection**: `src/agents/voice-agent-entry.ts:155-163` calls `configureModelProvider()` to inject into personas layer
- **Semantic router injection**: `src/agents/voice-agent-entry.ts:149-151` calls `setGenerateReplyFunction(generateReply)` to resolve architecture violation

### ⚠️ GAPS IDENTIFIED

#### Gap 1.1: Ferni TTS Service Not Integrated

**Location:** `src/agents/shared/tts-wrapper.ts:68-71`, `src/speech/tts/ferni-tts-core.ts`

**Issue:** The Ferni TTS Rust service (`services/ferni-tts/`) has a complete TypeScript client (`ferni-tts-core.ts`) with superhuman context support, but it's **never actually instantiated or used** in the TTS pipeline.

**Evidence:**

- `isFerniTTSEnabled()` checks `TTS_PROVIDER === 'ferni-tts'` but this path is never taken
- `createFerniTTS()`, `createFerniTTSFromEnv()` functions exist but are never called
- `bridgeToFerniContext()` exists but is never invoked
- The TTS wrapper only uses Cartesia (via gateway or direct)

**Impact:** The custom Rust TTS service with 8 prosody transforms is completely orphaned. Users cannot benefit from superhuman prosody even if the service is deployed.

**Recommendation:** Wire Ferni TTS into `wrappedTtsNode()` when `TTS_PROVIDER=ferni-tts`:

```typescript
if (isFerniTTSEnabled()) {
  const tts = createFerniTTSFromEnv();
  const superhumanContext = bridgeToFerniContext(sessionContext);
  tts.setSuperhumanContext(superhumanContext);
  // Use tts.stream() instead of Cartesia
}
```

---

#### Gap 1.2: Event Emissions Without Verified Listeners

**Location:** Multiple files emit `sendDataMessage` events

**Issue:** Several event types are emitted via `sendDataMessage()` but frontend listeners may not exist:

**Potentially Orphaned Events:**

- `anticipation_signal` - `src/agents/voice-agent/transcript-handler.ts:467`
- `avatar_cue` - `src/agents/voice-agent/transcript-handler.ts:566`
- `engagement_trigger` - `src/agents/voice-agent/transcript-handler.ts:2107`
- `laughter_detected` - `src/agents/voice-agent/audio-processor.ts:715`
- `emotion` - `src/agents/voice-agent/audio-processor.ts:902`
- `voice_prosody` - `src/agents/voice-agent/audio-processor.ts:912`

**Verification Needed:** Check `apps/web/src/app.ts` and `apps/web/src/services/connection.service.ts` for listeners matching these event types.

**Recommendation:** Audit frontend data channel handlers to ensure all backend events have corresponding UI handlers.

---

## 2. Turn Processing Pipeline

### ✅ WIRED CORRECTLY

- **Context builders are registered**: 80+ builders call `registerContextBuilder()` on module load
- **Turn processor calls builders**: `src/agents/processors/turn-processor.ts` imports and uses `getContextBuilders()`
- **Injection filter is used**: `src/agents/processors/injection-filter.ts` re-exports filter functions used by turn processor

### ⚠️ GAPS IDENTIFIED

#### Gap 2.1: Context Builder Registration Without Execution Verification

**Location:** `src/intelligence/context-builders/index.ts:291-364`, `src/intelligence/context-builders/core/registry.ts`

**Issue:** While 80+ context builders are registered, there's no verification that they're all actually executed during `buildConversationContext()`. Some builders may:

- Return empty injections silently
- Fail silently and be skipped
- Have dependencies that prevent execution

**Evidence:**

- `buildConversationContext()` runs builders in parallel but only logs errors
- No metrics tracking which builders return data vs. empty results
- No validation that registered builders are actually called

**Recommendation:** Add metrics to track:

- Builder execution count
- Builder success/failure rate
- Builder injection yield (empty vs. non-empty)
- Builder execution time

---

#### Gap 2.2: Tool Routing Integration Bypass Paths

**Location:** `src/agents/processors/tool-routing-integration.ts:97-284`

**Issue:** The FTIS routing function `runFTISRouting()` can bypass the LLM and execute tools directly, but there are fallback paths that may not be fully tested:

**Potential Bypass Scenarios:**

- Low confidence FTIS classification → falls back to semantic router → may still bypass LLM
- Tool execution errors → recovery path unclear
- Domain bridge translation failures → tool ID mismatch

**Evidence:**

- `executeDirectFromClassification()` in `tool-executor.ts:801` handles direct execution
- Domain bridge translation exists (`tool-executor.ts:847-870`) but may have gaps
- No clear error recovery if direct execution fails

**Recommendation:** Add integration tests for:

- FTIS → direct execution → domain bridge → tool registry lookup
- Error recovery when direct execution fails
- Fallback to LLM when confidence is below threshold

---

## 3. TTS Pipeline

### ✅ WIRED CORRECTLY

- **TTS Gateway is integrated**: `src/agents/shared/tts-wrapper.ts:1205-1231` uses `createGatewayTTSNode()` when enabled
- **Post-TTS enhancement is wired**: `src/agents/shared/tts-wrapper.ts:1307-1320` applies Rust audio enhancement
- **SSML processing is unified**: Gateway uses `getSSMLProcessor()` as single source of truth

### ⚠️ GAPS IDENTIFIED

#### Gap 3.1: Rust Audio Service (`apps/rust-audio/`) Not Called from TypeScript

**Location:** `src/utils/audio/pre-stt-transform.ts`, `src/agents/shared/performance/post-tts-transform.ts`

**Issue:** The Rust audio module (`apps/rust-audio/`) provides NAPI bindings for:

- Pre-STT audio enhancement (AGC, noise suppression, bandwidth extension)
- Post-TTS audio enhancement (warmth, compression)

**Evidence:**

- `pre-stt-transform.ts:95` has `getRustModule()` that loads `@ferni/audio` but **this is never called**
- `post-tts-transform.ts:273` has `getRustModule()` that IS called (line 966, 1353, 1381)
- Pre-STT transforms are defined but not integrated into the audio pipeline

**Impact:** Pre-STT audio enhancement (noise suppression, AGC) is completely unused, even though the Rust implementation exists.

**Recommendation:** Wire pre-STT transforms into the audio processing pipeline:

1. Check where user audio enters the system (LiveKit audio track)
2. Apply `pre-stt-transform.ts` before Whisper STT
3. Verify Rust module loads correctly (`@ferni/audio` package)

---

#### Gap 3.2: Ferni TTS Service (`services/ferni-tts/`) Orphaned

**Location:** `services/ferni-tts/`, `src/speech/tts/ferni-tts-core.ts`

**Issue:** The Rust TTS service is a complete microservice with:

- SSML parser
- 8 prosody transforms (superhuman context)
- HTTP API endpoint

But it's **never called** from the TypeScript codebase.

**Evidence:**

- `ferni-tts-core.ts` has full client implementation
- `FERNI_TTS_ENDPOINT` env var is read but service is never instantiated
- `bridgeToFerniContext()` exists to convert session state → superhuman context
- No HTTP calls to `FERNI_TTS_ENDPOINT` anywhere in codebase

**Impact:** The entire Rust TTS service is orphaned. Even if deployed, it's never used.

**Recommendation:** Integrate Ferni TTS as alternative provider:

1. Add `TTS_PROVIDER=ferni-tts` check in `wrappedTtsNode()`
2. Instantiate `FerniTTS` client when enabled
3. Bridge session context → superhuman context
4. Call `tts.synthesizeSSML()` instead of Cartesia

---

## 4. Tool Execution Flow

### ✅ WIRED CORRECTLY

- **Tool orchestrator initializes**: `src/tools/orchestrator/tool-orchestrator.ts:334-439` initializes registry, semantic router, FTIS
- **FTIS classifier is used**: `tool-orchestrator.ts:755-816` uses FTIS for fast-path tool selection
- **Domain bridge translates IDs**: `tool-executor.ts:847-870` translates semantic tool IDs → domain tool IDs

### ⚠️ GAPS IDENTIFIED

#### Gap 4.1: Tool Domains Loaded But Never Routable

**Location:** `src/tools/orchestrator/tool-orchestrator.ts:1054-1079`, `src/personas/bundles/ferni/persona.manifest.json:360-411`

**Issue:** The Ferni persona manifest lists 40+ contextual domains that are "available" but may not be routable:

**Potentially Unroutable Domains:**

- `grief`, `meaning`, `vulnerability`, `crisis` - listed as "exclusive" to Ferni
- `envy`, `shame`, `resentment` - listed in contextual domains
- `midlife`, `empty-nest`, `coming-out`, `faith-transition`, `blended-family` - specialized domains

**Evidence:**

- `persona.manifest.json` lists domains but doesn't verify they're registered
- `tool-orchestrator.ts` lazy loads domains but may fail silently
- FTIS domain map (`v7-domain-map.ts`) may not cover all listed domains
- No validation that all manifest domains are actually routable

**Recommendation:** Add validation:

1. On persona load, verify all listed domains exist in tool registry
2. Check FTIS domain map covers all contextual domains
3. Log warnings for domains that can't be loaded

---

#### Gap 4.2: Dynamic Tool Router Deprecated But Still Used

**Location:** `src/tools/dynamic-tool-router.ts:1-328`

**Issue:** The keyword-based `dynamic-tool-router.ts` is marked `@deprecated` but may still be used as fallback:

**Evidence:**

- File is marked deprecated in favor of FTIS
- Still defines `TOOL_TIERS` and `detectToolIntent()`
- May be called when FTIS is unavailable or confidence is low

**Recommendation:**

1. Verify if `dynamic-tool-router.ts` is still called anywhere
2. If not used, remove it
3. If used as fallback, document the fallback conditions clearly

---

## 5. Session Lifecycle

### ✅ WIRED CORRECTLY

- **Warmup is triggered**: `src/agents/gce-voice-worker.ts:268` calls `warmupResources()` on container start
- **Session state handlers are wired**: `src/agents/voice-agent/session-state-handler.ts:126-168` sets up handlers
- **Cleanup functions are registered**: `src/agents/multi-agent/agent-setup.ts:1784-1902` includes comprehensive cleanup

### ⚠️ GAPS IDENTIFIED

#### Gap 5.1: Session Start/End Hooks May Not Fire

**Location:** `src/agents/voice-agent/session-state-handler.ts`, `src/agents/voice-agent-entry.ts`

**Issue:** Session lifecycle hooks (start/end) may not fire in all scenarios:

**Potential Scenarios:**

- Session crashes before `onSessionEnd()` fires
- Handoff transitions may skip end hooks
- Fast disconnects may bypass cleanup

**Evidence:**

- `session-state-handler.ts` has `setupSessionStateHandlers()` but no explicit start hook
- `voice-agent-entry.ts` has cleanup in `finally` block but may not cover all paths
- No verification that session end hooks always fire

**Recommendation:** Add:

1. Explicit session start hook that always fires
2. Session end hook with timeout/retry for cleanup
3. Metrics tracking session lifecycle completion

---

#### Gap 5.2: Warmup Resources Not Verified

**Location:** `src/agents/gce/warmup.ts:44-521`

**Issue:** `warmupResources()` pre-loads many modules but doesn't verify they're actually ready:

**Warmup Items Without Verification:**

- TTS module import (line 89) - just imports, doesn't verify it works
- Persona cache (line 140-167) - loads but doesn't verify cache hit rate
- Tool orchestrator (line 210-217) - initializes but doesn't verify tools are routable
- FTIS classifier (line 275-304) - loads model but doesn't verify inference works

**Recommendation:** Add verification after each warmup step:

```typescript
// After TTS import
const tts = await import('../../speech/tts/cartesia-core.js');
await tts.testConnection(); // Verify it actually works

// After FTIS warmup
const testResult = await classifier.classify('test query');
if (!testResult) throw new Error('FTIS warmup failed');
```

---

## 6. Model Provider Chain

### ✅ WIRED CORRECTLY

- **Model provider factory works**: `src/agents/model-provider/factory.ts:55-82` creates correct provider based on env vars
- **Provider ID sync works**: `factory.ts:89-95` provides quick ID check without instantiation
- **All three providers are implemented**: OpenAI Realtime, Gemini Live, Qwen3 Omni

### ⚠️ GAPS IDENTIFIED

#### Gap 6.1: Model Provider Configuration Options Not Applied

**Location:** `src/agents/model-provider/types.ts:35-66`, `types.ts:75-106`

**Issue:** The `ModelProvider` interface defines many configuration options that may not be fully utilized:

**Potentially Unused Options:**

- `PromptModuleConfig.includeFunctionCallingBase` - may not be checked by all providers
- `PromptModuleConfig.useMinimalInstructions` - OpenAI-specific, may not be applied
- `LLMModelConfig.expectsToolCall` - defined but may not affect temperature adjustment
- `LLMModelConfig.vadConfig` - provider-specific, may not be passed through

**Evidence:**

- `types.ts` defines interfaces but doesn't show where they're used
- `factory.ts` creates providers but doesn't show config application
- No verification that all config options are actually applied

**Recommendation:** Audit each provider implementation:

1. Verify `PromptModuleConfig` options are checked
2. Verify `LLMModelConfig.expectsToolCall` triggers temperature adjustment
3. Verify `vadConfig` is passed to providers that support it

---

#### Gap 6.2: Qwen3 Omni Provider May Not Be Fully Integrated

**Location:** `src/agents/model-provider/factory.ts:60-65`, `src/integrations/qwen3-omni/`

**Issue:** Qwen3 Omni is a third provider option but integration may be incomplete:

**Potential Gaps:**

- `USE_QWEN3_OMNI=true` creates provider but session manager may not be wired
- `sendDataMessage` may not be passed to Qwen3 session manager
- Director mode setup may not support Qwen3

**Evidence:**

- `factory.ts:60-65` creates `Qwen3OmniProvider()` when env var is set
- `voice-agent-entry.ts:1682-1711` has Qwen3-specific `sendDataMessage` setup
- But no verification that all Qwen3 features are wired end-to-end

**Recommendation:** Add integration test for Qwen3 Omni:

1. Test provider creation and model instantiation
2. Test session manager receives `sendDataMessage`
3. Test director mode works with Qwen3
4. Test tool calling works with Qwen3

---

## Summary

### Critical Gaps (Block Features)

1. **Ferni TTS service orphaned** - Complete Rust service never called
2. **Pre-STT Rust audio not integrated** - Noise suppression/AGC unused
3. **Qwen3 Omni integration incomplete** - May not work end-to-end

### Medium Gaps (Reduce Quality)

4. **Context builder execution unverified** - May silently fail
5. **Tool domain routability unverified** - Domains may not be loadable
6. **Session lifecycle hooks may not fire** - Cleanup may be skipped

### Low Gaps (Observability)

7. **Event emissions without verified listeners** - Frontend may miss signals
8. **Warmup resources not verified** - May warm up broken modules
9. **Model provider config options unverified** - May not be applied

---

## Recommendations Priority

### P0 (Fix Immediately)

1. Wire Ferni TTS service into TTS pipeline (Gap 3.2)
2. Integrate pre-STT Rust audio transforms (Gap 3.1)
3. Verify Qwen3 Omni end-to-end integration (Gap 6.2)

### P1 (Fix Soon)

4. Add context builder execution metrics (Gap 2.1)
5. Verify tool domain routability (Gap 4.1)
6. Add session lifecycle verification (Gap 5.1)

### P2 (Improve Observability)

7. Audit frontend event listeners (Gap 1.2)
8. Add warmup verification (Gap 5.2)
9. Audit model provider config application (Gap 6.1)

---

**Next Steps:**

1. Create tickets for each P0 gap
2. Add integration tests for critical paths
3. Add metrics/observability for medium gaps
4. Document expected behavior for low gaps
