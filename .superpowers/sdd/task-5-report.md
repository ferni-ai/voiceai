# Task 5 Report: Wire delegating TTS cache on GCE worker hot path

## Status

Complete.

## Changes

- Added `src/agents/gce/tts-cache-install.ts` to install a delegating TTS cache into the gateway singleton used by `gateway-tts-node`.
- Wired `warmupResources()` to call `installProductionTTSCache()` after warmup tasks complete.
- Added a unit smoke test proving `setTTSCache()` is called once and the installed cache checks conversational prewarm audio before greeting audio.

## Verification

- `pnpm vitest run src/agents/gce/__tests__/tts-cache-install.test.ts`
- `pnpm typecheck`
- `ReadLints` on touched files: no linter errors.

## Notes

- No deploy performed.

## Review Fixes - 2026-07-11

- Aligned the GCE TTS cache legacy lookup order with DI intent: greeting cache, GCE prewarmed greeting cache, then conversational cache.
- Added `getPrewarmedGreetingAudio` from `src/agents/shared/performance/greeting-audio-prewarm.ts` so greetings populated by GCE warmup are reachable from the gateway hot path.
- Normalized legacy cache audio into `ArrayBuffer` before returning entries to the delegating TTS cache.
- Updated unit coverage to assert `setTTSCache()` is called once, greeting sources are checked before conversational audio, and conversational audio is only used after both greeting caches miss.
- Verification: `pnpm vitest run src/agents/gce/__tests__/tts-cache-install.test.ts` passed with 4 tests.
