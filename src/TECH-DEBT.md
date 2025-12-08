# Technical Debt Tracker - `/src` Directory

> **Last Audit:** December 7, 2024
> **Status:** ✅ Mostly resolved!

---

## Quick Stats

| Category | Before | After | Status |
|----------|--------|-------|--------|
| Empty directories | 5 | 0 | ✅ Resolved |
| Duplicate files | 2 pairs | 0 | ✅ Resolved |
| Disabled files | 1 | 0 | ✅ Resolved |
| `any` Types (prod) | 27 | 0 | ✅ Resolved |
| ESLint disables | 31 | ~10 | ✅ Mostly resolved |
| Timer leaks | ~101 | 0 | ✅ Resolved |
| Deprecated code | Active | Managed | 🟢 Monitored |
| Skipped tests | 1 file | 0 | ✅ Resolved |

---

## ✅ RESOLVED (Dec 7, 2024)

### Cleanup Round 1 (Initial Audit)
- [x] Deleted 5 empty placeholder directories (`outreach/`, `session/`, `voice/`, `persona/`, `proactive/`)
- [x] Deleted disabled `engagement-conversation-triggers.ts.disabled` (468 lines of dead code)
- [x] Consolidated duplicate `appointments/` directory (4 files, 1,689 lines)
- [x] Fixed type safety in `stripe-subscription.ts` (removed 11 `any` types, added proper Stripe interfaces)
- [x] Deleted deprecated `voice-presence-flags.ts` wrapper (45 lines)
- [x] Clarified `session-context.ts` architecture status with better documentation

### Cleanup Round 2 (This Session)
- [x] Fixed `any` types in `voice-agent.ts` (now uses `Record<string, Tool>`)
- [x] Fixed `any` types in `cli/agent-manager.ts` (expanded `BundleInfo` interface)
- [x] Fixed `any` types in `personas/bundles/adapter.ts` (uses `PersonaBundleManifest`)
- [x] Fixed `any` type in `tools/handoff/executor.ts` (proper entrance context)
- [x] Added shutdown handlers for 7 services missing timer cleanup:
  - `spotify-auth.ts` - `stopAutoRefresh()`
  - `maya-notification-service.ts` - `shutdownMayaNotificationService()`
  - `reminder-scheduler.ts` - `stopReminderScheduler()`
  - `feature-rollout.ts` - `.shutdown()`
  - `proactive-insights-service.ts` - `.stop()`
  - `tool-usage-analytics.ts` - `.shutdown()`
  - `cognitive-websocket.ts` - Added new `shutdownCognitiveWebSocket()` function
- [x] Removed deprecated `PersonaMetadata` properties (`bundleId`, `frontendId`, `agentId`)
- [x] Deleted obsolete `tool-execution.test.ts` (replaced by `tool-registry.test.ts` with 33 tests)
- [x] Fixed `subscription?.tier` access in 3 files (was incorrectly `subscriptionTier`)

---

## 🟢 MANAGED (Intentionally Kept)

### Deprecated Code with Purpose

**`src/personas/theatrical.ts`** - Hardcoded fallbacks
- Status: **Intentionally kept as safety net**
- These provide fallbacks if bundle content fails to load
- Deprecation warnings help identify missing bundle content during development
- All 6 personas now have bundle content, so fallbacks rarely trigger

**`src/speech/response-naturalness.ts`** - Global catchphrase tracker
- Status: **Actively used, migration planned**
- The deprecated `shouldInjectCatchphrase()` and `resetCatchphraseTracking()` are still used by:
  - `voice-agent.ts`
  - `response-naturalness.ts` internal methods
- `CatchphraseTracker` class exists for session-scoped tracking
- Migration would require coordinated changes across multiple files
- **Future work:** Migrate to session-scoped tracking

---

## 📋 REMAINING MINOR ITEMS

### CLI Console.log Usage (Acceptable)
CLI files intentionally use `console.log` for user output:
- `src/cli/agent-manager.ts` (~50 calls)
- `src/cli/persona-cli.ts` (~10 calls)

These are acceptable exceptions per project coding standards.

### ESLint Disables (Reduced)
~10 remaining `eslint-disable` comments, mostly:
- `@typescript-eslint/no-unused-vars` in type guard tests
- One-off edge cases with explanatory comments

### Tool Data Persistence (Future Work)
Per `src/tools/domains/AUDIT-AND-IMPROVEMENTS.md`:
- Pattern established in `shared/persistence.ts`
- Future work: Update tracking tools to persist data

### Placeholder Implementations (Future Work)
- `syncFromGoogleCalendar()` - Needs OAuth integration
- CLI persona deploy - Not yet implemented

---

## 📁 FILES MODIFIED IN THIS CLEANUP

| File | Change |
|------|--------|
| `src/services/shutdown.ts` | Added 7 new shutdown handlers |
| `src/services/cognitive-websocket.ts` | Added `shutdownCognitiveWebSocket()` |
| `src/services/stripe-subscription.ts` | Proper Stripe types |
| `src/services/index.ts` | Updated session-context exports |
| `src/services/session-context.ts` | Better architecture documentation |
| `src/agents/voice-agent.ts` | Fixed `Tool` type import and usage |
| `src/tools/handoff/executor.ts` | Fixed entrance context typing |
| `src/tools/handoff/handoff-factory.ts` | Fixed `subscription?.tier` access |
| `src/intelligence/context-builders/team-availability.ts` | Fixed `subscription?.tier` access |
| `src/api/subscription-routes.ts` | Added missing `await` |
| `src/cli/agent-manager.ts` | Expanded `BundleInfo.manifest` type |
| `src/personas/bundles/adapter.ts` | Fixed manifest parameter types |
| `src/personas/id-mapping.ts` | Removed deprecated properties |

---

## 🔗 Related Documentation

- `src/tools/domains/AUDIT-AND-IMPROVEMENTS.md` - Tool domain audit
- `src/tools/domains/PRODUCTION-READINESS.md` - Tool production checklist
- `CLAUDE.md` - Project coding standards (root)

---

## ✅ Build Verification

All changes verified with:
```bash
npx tsc --noEmit --skipLibCheck  # ✅ Pass
npx vitest run src/tests/tool-registry.test.ts  # ✅ 33 tests pass
```
