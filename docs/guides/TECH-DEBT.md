# Technical Debt Report

> Generated: 2025-12-07T14:23:19.870Z

## Summary

| Metric | Count |
|--------|-------|
| Total Items | 52 |
| Critical | 0 |
| High | 1 |
| Medium | 51 |
| Low | 0 |

## By Marker

| Marker | Count |
|--------|-------|
| 📝 TODO: | 17 |
| 🚨 XXX: | 1 |
| 📦 @deprecated | 34 |

## High Priority Items

### 🚨 XXX:: [Title]

- **File:** `docs/guides/0000-template.md:1`
- **Priority:** high
- **Age:** 0 days


## All Items

- 🚨 `docs/guides/0000-template.md:1` - [Title]
- 📝 `src/tools/domains/PRODUCTION-READINESS.md:59` - trackFitnessGoal, trackHydration, logSymptom
- 📝 `src/tools/domains/PRODUCTION-READINESS.md:65` - trackLearningPath (if created)
- 📝 `src/tools/domains/PRODUCTION-READINESS.md:70` - trackChildMilestone, celebrateFamilyMoment
- 📝 `src/tools/domains/PRODUCTION-READINESS.md:75` - setLearningGoal, trackLearningProgress, trackBooksRead
- 📝 `src/tools/domains/PRODUCTION-READINESS.md:80` - trackVolunteerHours, trackImpact
- 📝 `src/personas/registry/unified-registry.ts:196` - Support enable/disable from config file
- 📝 `src/api/helpers.ts:87` - Restrict to specific origins in production
- 📝 `src/services/feature-rollout.ts:576` - Integrate with your observability system
- 📝 `src/services/optimization-persistence.js:423` - Calculate from sessions
- 📝 `src/services/optimization-persistence.js:424` - Aggregate from sessions
- 📝 `src/services/session-context.ts:23` - Architecture draft, full implementation pending
- 📝 `src/conversation/adaptive-endpointing.ts:433` - integrate with user service
- 📝 `frontend-typescript/src/ui/dev-panel.ui.ts:1069` - Implement voice mode animations when avatar API supports the
- 📝 `frontend-typescript/src/ui/dev-panel.ui.ts:1074` - Implement greeting animations when avatar API supports them
- 📝 `frontend-typescript/src/ui/dev-panel.ui.ts:1097` - Implement dramatic animations when avatar API supports them
- 📝 `frontend-typescript/src/ui/dev-panel.ui.ts:1103` - Implement ring effects when avatar API supports them
- 📝 `frontend-typescript/src/ui/dev-panel.ui.ts:1132` - Implement ripple effects when avatar API supports them
- 📦 `src/tools/lifecycle.ts:123` - Legacy team handlers have been removed. Use USE_NEW_TEAM_HAN
- 📦 `src/config/voice-presence-flags.ts:21` - Use getFeatureFlags().isEnabled('voice-presence') instead
- 📦 `src/config/voice-presence-flags.ts:26` - Use getFeatureFlags().isEnabled('voice-presence-*') instead
- 📦 `src/utils/logger.ts:14` - Use getLogger() instead
- 📦 `src/speech/audio-prosody.ts:1009` - Use getSessionAudioProsodyAnalyzer(sessionId) for proper ses
- 📦 `src/speech/response-naturalness.ts:473` - Use CatchphraseTracker for session-scoped tracking
- 📦 `src/speech/response-naturalness.ts:516` - Use CatchphraseTracker.reset() for session-scoped tracking
- 📦 `src/speech/speech-context.ts:467` - Use getSessionWPMTracker(sessionId) for proper session isola
- 📦 `src/speech/backchanneling.ts:251` - Use getSessionBackchannelingSystem(sessionId) for proper ses
- 📦 `src/speech/cartesia-context-patch.ts:196` - The WebSocket monkeypatch approach has been removed.
- 📦 `src/speech/cartesia-context-patch.ts:210` - The WebSocket monkeypatch approach has been removed.
- 📦 `src/personas/id-mapping.ts:86` - Use id instead */
- 📦 `src/personas/id-mapping.ts:88` - Use id instead */
- 📦 `src/personas/id-mapping.ts:90` - Use id instead */
- 📦 `src/personas/team/team-config.ts:28` - Prefer using getTeamConfig() which loads from bundles.
- 📦 `src/personas/team/team-config.ts:85` - Prefer using getTeamConfig() which generates from bundles.
- 📦 `src/personas/team/team-config.ts:231` - Prefer using getTeamConfig() which generates from bundles.
- 📦 `src/personas/team/team-config.ts:301` - Prefer using getTeamConfig() which generates from bundles.
- 📦 `src/personas/bundles/runtime.ts:1604` - Prefer session-scoped runtimes via SessionBundleRuntimeManag
- 📦 `src/personas/bundles/runtime.ts:1679` - Use SessionBundleRuntimeManager for session isolation
- 📦 `src/ssml-tagger.ts:1249` - For multi-persona support, use tagTextWithSsmlPersonaAware f
- 📦 `scripts/audit-legacy.ts:63` - ') && lowerLine.includes('file')) {
- 📦 `scripts/audit-legacy.ts:68` - ')) {
- 📦 `scripts/audit-legacy.ts:105` - // Scan for @deprecated
- 📦 `scripts/audit-legacy.ts:106` - ');
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:248` - Use warmthGlow() instead - confetti is not aligned with zen 
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:261` - Use warmthGlow() instead - sparkles replaced with warmth
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:274` - Use connectionWarmth() instead
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:281` - Use connectionWarmth() instead
- 📦 `frontend-typescript/src/ui/celebrations.ui.ts:288` - Use softAcknowledge() instead
- 📦 `docs/migrations/LEGACY-MIGRATION-PLAN.md:13` - ` | 27 |
- 📦 `docs/migrations/LEGACY-MIGRATION-PLAN.md:132` - ` should have a date
- 📦 `docs/migrations/LEGACY-MIGRATION-PLAN.md:138` - " src/ --include="*.ts"
- 📦 `docs/migrations/TOOLS-CONSOLIDATION-PLAN.md:264` - Import from './domains/habits' instead
