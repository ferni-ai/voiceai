# Technical Debt Report

> Generated: 2025-12-09  
> Last Reviewed: December 13, 2024

## Summary

| Metric | Count |
|--------|-------|
| Total Items | 43 |
| Critical | 0 |
| High | 0 |
| Medium | 43 |
| Low | 0 |

## By Marker

| Marker | Count |
|--------|-------|
| 📝 TODO: | 11 |
| 📦 @deprecated | 32 |

## December 2024 Review Notes

Most deprecated items are related to:
1. **Speech modules** (6 items) - Need migration to session-scoped versions
2. **Theatrical configs** (5 items) - Should use persona bundles instead
3. **Team configs** (4 items) - Should use `getTeamConfig()` from bundles
4. **Celebrations** (5 items) - Use warmth-based alternatives

**Key TODOs:**
- `voice-agent.ts:633` - Re-enable EvalOps when production-ready
- `conversation.ts:269` - Move getFrontendPublisher to services layer

Run `npm run debt` to regenerate this report.

## High Priority Items


## All Items

- 📝 `src/tools/conversation.ts:269` - Move getFrontendPublisher to services layer to fix architect
- 📝 `src/agents/voice-agent.ts:633` - Re-enable when evalops is production-ready
- 📝 `src/agents/shared/utilities-integration.ts:182` - Play sound effect if specified
- 📝 `src/personas/registry/unified-registry.ts:196` - Support enable/disable from config file
- 📝 `src/api/helpers.ts:90` - Restrict to specific origins in production
- 📝 `src/services/therapeutic-frameworks/act-values.ts:372` - Use semantic similarity
- 📝 `src/services/trust-systems/rollout.ts:118` - Get real metrics from monitoring
- 📝 `src/services/feature-rollout.ts:575` - Integrate with your observability system
- 📝 `src/services/outreach/decision-engine.ts:795` - Get from profile
- 📝 `frontend-typescript/src/narrative/story-tracker.ts:492` - Implement Firestore sync
- 📝 `frontend-typescript/src/services/ritual-engine.service.ts:426` - Add persona-specific haptic signatures
- 📦 `src/tools/lifecycle.ts:123` - Legacy team handlers have been removed. Use USE_NEW_TEAM_HAN
- 📦 `src/utils/logger.ts:14` - Use getLogger() instead
- 📦 `src/speech/audio-prosody.ts:1013` - Use getSessionAudioProsodyAnalyzer(sessionId) for proper ses
- 📦 `src/speech/response-naturalness.ts:479` - Use CatchphraseTracker for session-scoped tracking
- 📦 `src/speech/response-naturalness.ts:522` - Use CatchphraseTracker.reset() for session-scoped tracking
- 📦 `src/speech/speech-context.ts:467` - Use getSessionWPMTracker(sessionId) for proper session isola
- 📦 `src/speech/backchanneling.ts:251` - Use getSessionBackchannelingSystem(sessionId) for proper ses
- 📦 `src/speech/cartesia-context-patch.ts:196` - The WebSocket monkeypatch approach has been removed.
- 📦 `src/speech/cartesia-context-patch.ts:210` - The WebSocket monkeypatch approach has been removed.
- 📦 `src/speech/ssml-tagger.ts:1249` - For multi-persona support, use tagTextWithSsmlPersonaAware f
- 📦 `src/personas/theatrical.ts:51` - These hardcoded entrances are DEPRECATED.
- 📦 `src/personas/theatrical.ts:142` - These hardcoded celebrations are DEPRECATED.
- 📦 `src/personas/theatrical.ts:309` - These hardcoded goodbyes are DEPRECATED.
- 📦 `src/personas/theatrical.ts:376` - These hardcoded storytelling configs are DEPRECATED.
- 📦 `src/personas/theatrical.ts:490` - These hardcoded backchannels are DEPRECATED.
- 📦 `src/personas/team/team-config.ts:28` - Prefer using getTeamConfig() which loads from bundles.
- 📦 `src/personas/team/team-config.ts:85` - Prefer using getTeamConfig() which generates from bundles.
- 📦 `src/personas/team/team-config.ts:231` - Prefer using getTeamConfig() which generates from bundles.
- 📦 `src/personas/team/team-config.ts:301` - Prefer using getTeamConfig() which generates from bundles.
- 📦 `src/personas/bundles/runtime.ts:1604` - Prefer session-scoped runtimes via SessionBundleRuntimeManag
- 📦 `src/personas/bundles/runtime.ts:1679` - Use SessionBundleRuntimeManager for session isolation
- 📦 `src/services/voice-call.ts:104` - Use generatePersonaVoice(text, 'alex-chen') instead
- 📦 `src/services/voice-call.ts:348` - Use callWithPersonaVoice(phone, message, 'alex-chen', option
- 📦 `apps/cli/src/commands/quality/audit-legacy.ts:63` - ') && lowerLine.includes('file')) {
- 📦 `apps/cli/src/commands/quality/audit-legacy.ts:68` - ')) {
- 📦 `apps/cli/src/commands/quality/audit-legacy.ts:105` - // Scan for @deprecated
- 📦 `apps/cli/src/commands/quality/audit-legacy.ts:106` - ');
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:248` - Use warmthGlow() instead - confetti is not aligned with zen 
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:261` - Use warmthGlow() instead - sparkles replaced with warmth
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:274` - Use connectionWarmth() instead
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:281` - Use connectionWarmth() instead
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:288` - Use softAcknowledge() instead
