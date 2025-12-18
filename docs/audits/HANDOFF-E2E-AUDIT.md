# Voice Transfer & UI Handoff - E2E Audit

**Date**: December 14, 2025  
**Scope**: Complete roster-to-voice handoff flow

---

## Executive Summary

The handoff system is well-architected with **warm handoff** support, comprehensive error handling, and good test coverage for individual components. However, there are gaps in **true E2E testing** and some edge cases that could benefit from additional test coverage.

### Key Strengths ✅

- Role-based direction calculation (not hardcoded persona IDs)
- Warm handoff with soft-open banter
- Rate limiting on both frontend and backend
- Team unlock validation before handoff
- Timeout recovery with UI state restoration
- Retry logic for voice switch and data channel messages
- ARIA live region for screen reader announcements

### Gaps Identified ⚠️

- No integration test with actual LiveKit connection
- ~~Soft-open timing sync not tested~~ ✅ Added
- ~~Handoff cancellation flow not tested E2E~~ ✅ Added
- ~~Timeout recovery not tested~~ ✅ Added
- No load testing for rapid handoff scenarios

---

## System Architecture

### 1. User Initiates Handoff (Frontend)

```
team.ui.ts::onTeamMemberClick(personaId)
    │
    ├─ Check: handoffService.isTransitioning → Block if true
    ├─ Check: isTeamMemberUnlocked() → Show locked feedback if false
    ├─ Visual: showSwitchingFeedback(fromId, toId)
    │    └─ Energy transfer animation (Pixar-style)
    │
    └─ sendHandoffRequest(personaId)
         └─ room.localParticipant.publishData({
              type: 'handoff_request',
              target: personaId
            })
```

**Files**: `apps/web/src/ui/team.ui.ts`

### 2. Backend Receives Request

```
data-channel-handler.ts::handleHandoffRequest()
    │
    ├─ Validate persona ID (canonicalize)
    ├─ Send handoff_acknowledged ACK
    │
    └─ executeHandoff(canonicalId, reason, options)
         ├─ Check: isSameAgent() → Reject if true
         ├─ Check: isHandoffAllowed() → Rate limit
         ├─ Check: isTeamMemberUnlocked() → Unlock validation
         │
         ├─ recordHandoff() → History tracking
         ├─ captureHandoffContext() → Preserve conversation
         ├─ setCurrentAgent() → Update state
         │
         └─ handoffEvents.emit('voiceSwitch', eventData)
              └─ Wait for handoffHandlerComplete (15s timeout)
```

**Files**:

- `src/agents/voice-agent/data-channel-handler.ts`
- `src/tools/handoff/executor.ts`

### 3. Handoff Handler Orchestrates Voice Switch

```
handoff-handler.ts::executeHandoff()
    │
    ├─ STEP 1: Send handoff_started to frontend
    │    └─ Includes: softOpenBanter, arrivingBanter
    │
    ├─ WARM HANDOFF: Speak soft-open in CURRENT voice
    │    └─ session.say(softOpenBanter)
    │    └─ Wait 1500ms
    │    └─ Send soft_open_complete
    │
    ├─ STEP 2: Calculate transition delay
    │    └─ getTransitionDelay(style, userInitiated, firstMeeting)
    │
    ├─ STEP 3: Switch voice (with retries)
    │    └─ voiceManager.switchVoice(persona.id)
    │    └─ tts.switchVoice(persona.id, persona.voiceId)
    │
    ├─ STEP 4: Resume music if was playing
    │
    ├─ STEP 5: Send handoff_complete to frontend
    │
    ├─ STEP 6: Update persona & LLM instructions
    │    └─ voiceAgentRef.setPersona(loadedPersona)
    │
    ├─ STEP 7: Speak greeting in NEW voice
    │    └─ session.say(arrivingBanter || fallbackGreeting)
    │
    ├─ STEP 8: Reload bundle runtime
    │    └─ Preserve: relationshipTurns, storiesTold, currentMode
    │
    └─ STEP 9: Validate handoff consistency
         └─ Recovery attempts if mismatch detected
```

**Files**: `src/agents/shared/handoff-handler.ts`

### 4. Frontend Processes Events

```
handoff.service.ts::processDataMessage()
    │
    ├─ handoff_acknowledged → Notify callbacks
    │
    ├─ handoff_started →
    │    ├─ Set _isTransitioning = true
    │    ├─ Start 15s timeout
    │    ├─ Notify startCallbacks (with banter)
    │    ├─ Play handoff sound
    │    └─ Update active persona in state
    │
    ├─ soft_open_complete → (WARM HANDOFF)
    │    └─ Notify softOpenCompleteCallbacks
    │         └─ team.ui.ts → setActiveTeamMember(toPersona)
    │
    ├─ handoff_complete →
    │    ├─ Set _isTransitioning = false
    │    ├─ Clear timeout
    │    └─ Notify completeCallbacks
    │
    ├─ handoff_failed →
    │    ├─ Set _isTransitioning = false
    │    ├─ Play disconnect sound
    │    └─ Notify failedCallbacks
    │
    └─ handoff_cancelled →
         └─ Reset state, notify callbacks
```

**Files**: `apps/web/src/services/handoff.service.ts`

### 5. Visual Updates (Team UI)

```
team.ui.ts event handlers
    │
    ├─ onHandoffStart(toPersona, fromPersona, banter)
    │    ├─ announceToScreenReader('Switching to...')
    │    └─ showBanterText(banter.softOpen)
    │
    ├─ onSoftOpenComplete(toPersona) → (WARM HANDOFF)
    │    └─ setActiveTeamMember(toPersona)
    │         ├─ playStepBack(previousId)
    │         ├─ playStepForward(toPersona)
    │         └─ playTeamCheer(toPersona)
    │
    ├─ onHandoffComplete(toPersona)
    │    ├─ hideBanterText()
    │    └─ setActiveTeamMember(toPersona) // Fallback
    │
    └─ onHandoffFailed(error, target)
         ├─ hideBanterText()
         └─ clearSwitchingFeedback(target)
```

**Files**: `apps/web/src/ui/team.ui.ts`

---

## Existing Test Coverage

### Frontend Tests

| Test File                                     | Coverage                                                                         | Type          |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ------------- |
| `tests/e2e/handoffs.test.ts`                  | Persona normalization, team config, message encoding                             | Unit (Vitest) |
| `tests/e2e/dynamic-roster.spec.ts`            | Roster display, API loading, click handling                                      | Playwright    |
| `tests/unit/services/handoff.service.test.ts` | Service methods, callbacks, **soft-open timing, timeout recovery, cancellation** | Unit (Vitest) |

### Backend Tests

| Test File                                                    | Coverage                                               | Type        |
| ------------------------------------------------------------ | ------------------------------------------------------ | ----------- |
| `src/agents/__tests__/integration/handoff-scenarios.test.ts` | Intent detection, context preservation, error handling | Integration |
| `src/tests/handoff-validation.test.ts`                       | Handoff validation                                     | Unit        |
| `src/tests/handoff-detection.test.ts`                        | Intent detection patterns                              | Unit        |
| `src/tests/handoff-flow.test.ts`                             | Flow state transitions                                 | Unit        |
| `src/tests/handoff-diagnostics.test.ts`                      | Diagnostic logging                                     | Unit        |
| `src/tools/handoff/__tests__/executor.test.ts`               | Executor logic                                         | Unit        |
| `src/tools/domains/handoff/__tests__/handoff.test.ts`        | Domain tool                                            | Unit        |

---

## Tests Added (Dec 14, 2025)

The following tests were added to `apps/web/tests/unit/services/handoff.service.test.ts`:

### 1. Soft-Open Timing Sync (3 tests)

- `should NOT update active persona on handoff_started alone` - Verifies transition state is set
- `should fire softOpenComplete callbacks when soft_open_complete received` - Verifies callback fires correctly
- `should queue soft_open_complete if received before handoff_started` - Handles race condition where backend sends events out of order

### 2. Timeout Recovery (4 tests)

- `should set up timeout on handoff_started` - Verifies transition state
- `should register failed callback for timeout handling` - Verifies callback registration
- `should clear timeout on successful handoff_complete` - Timeout doesn't fire after success
- `should reset state on handoff_failed` - State resets on backend failure message

### 3. Handoff Cancellation (5 tests)

- `should cancel in-progress handoff` - User cancellation works
- `should return false when no handoff in progress` - No-op when nothing to cancel
- `should call cancelled callbacks on cancellation` - Callbacks fire correctly
- `should handle handoff_cancelled message from backend` - Backend cancellation handling
- `should clear timeout timer after cancellation` - Timeout doesn't fire after cancel

---

## Gap Analysis

### 1. True E2E with Voice Agent ❌

**Current state**: Tests mock the voice agent and data channel
**Gap**: No test connects to a real LiveKit room to verify actual voice switching

**Recommendation**: Add an integration test using LiveKit's test mode:

```typescript
// Example: tests/integration/handoff-voice.test.ts
test('should switch voice during handoff', async () => {
  const room = await connectToTestRoom();
  await sendHandoffRequest('peter-john');

  // Verify voice ID changed in TTS
  await waitFor(() => {
    expect(ttsService.currentVoice).toBe('peter-john-voice');
  });
});
```

### 2. Warm Handoff Timing ❌

**Current state**: `soft_open_complete` event exists but no test verifies timing sync
**Gap**: UI roster transition should happen AFTER departing persona finishes speaking

**Recommendation**: Add timing verification test:

```typescript
test('roster visual transition waits for soft_open_complete', async () => {
  let rosterUpdated = false;
  let softOpenReceived = false;

  handoffService.onSoftOpenComplete(() => {
    softOpenReceived = true;
  });

  // Verify roster doesn't update until soft_open_complete
  await sendHandoff('maya-santos');
  expect(rosterUpdated).toBe(false);

  // Receive soft_open_complete
  await receiveSoftOpenComplete();
  expect(softOpenReceived).toBe(true);
  expect(rosterUpdated).toBe(true);
});
```

### 3. Handoff Cancellation ❌

**Current state**: `cancelHandoff()` method exists, `handoff_cancelled` handled
**Gap**: No test for mid-transition cancellation

**Recommendation**:

```typescript
test('should cancel in-progress handoff', async () => {
  // Start handoff
  await clickTeamMember('jordan-taylor');
  expect(handoffService.isTransitioning).toBe(true);

  // Cancel mid-transition
  handoffService.cancelHandoff();

  // Verify state restored
  expect(handoffService.isTransitioning).toBe(false);
  expect(activePersona).toBe('ferni'); // Restored to original
});
```

### 4. Rate Limiting E2E ❌

**Current state**: Rate limit logic in both frontend and backend
**Gap**: No test for rapid click sequence

**Recommendation**:

```typescript
test('should rate limit rapid handoff requests', async () => {
  const rateLimitCallbacks: number[] = [];
  handoffService.onHandoffRateLimited((ms) => rateLimitCallbacks.push(ms));

  // Rapid clicks
  await clickTeamMember('alex-chen');
  await clickTeamMember('peter-john');
  await clickTeamMember('maya-santos');

  // Only first should succeed
  expect(rateLimitCallbacks.length).toBe(2);
});
```

### 5. Timeout Recovery ⚠️

**Current state**: 15s timeout with UI state restoration
**Gap**: No test verifies UI returns to correct state after timeout

**Recommendation**:

```typescript
test('should restore UI after handoff timeout', async () => {
  // Start handoff
  await clickTeamMember('nayan-patel');
  expect(handoffService.isTransitioning).toBe(true);

  // Wait for timeout (15s)
  await vi.advanceTimersByTime(15000);

  // Verify state restored
  expect(handoffService.isTransitioning).toBe(false);
  expect(activePersona).toBe('ferni');
  expect(getToastMessage()).toContain('timeout');
});
```

### 6. Team Unlock + Handoff ⚠️

**Current state**: Unlock check in both frontend and backend
**Gap**: No E2E test for full unlock → handoff flow

**Recommendation**:

```typescript
test('should allow handoff after team member unlocked', async () => {
  // Member initially locked
  expect(isTeamMemberUnlocked('maya-santos')).toBe(false);

  // Click shows locked feedback
  await clickTeamMember('maya-santos');
  expect(getToastMessage()).toContain('locked');

  // Progress conversation to unlock
  await simulateConversations(10);
  teamUnlockService.checkUnlockProgress();

  // Now handoff should work
  expect(isTeamMemberUnlocked('maya-santos')).toBe(true);
  await clickTeamMember('maya-santos');
  expect(handoffService.targetPersona).toBe('maya-santos');
});
```

---

## Recommendations

### ✅ Completed (Dec 14, 2025)

1. ~~**Add soft_open_complete timing test**~~ - ✅ Added 3 tests for warm handoff UX
2. ~~**Add timeout recovery test**~~ - ✅ Added 4 tests for UI recovery
3. ~~**Add handoff cancellation test**~~ - ✅ Added 5 tests for mid-transition cancel

### Priority 2: Edge Case Coverage (Remaining)

4. **Add rate limiting E2E test** - Prevents spam clicks

### Priority 3: Integration Testing

5. **Consider LiveKit test mode for voice verification** - Currently hard to verify actual TTS switching
6. **Add team unlock → handoff integration test** - Full journey test

### Priority 4: Performance & Load

7. **Add stress test for rapid handoffs** - Queue handling under load
8. **Profile handoff latency** - Measure time from click to voice switch

---

## Test Commands

```bash
# Run frontend handoff tests
cd apps/web && pnpm test -- handoff

# Run backend handoff tests
pnpm test -- handoff

# Run Playwright roster tests
cd apps/web && pnpm test:e2e -- dynamic-roster

# Run all handoff-related tests
pnpm test -- --grep "handoff|roster|team"
```

---

## Files Referenced

### Frontend

- `apps/web/src/ui/team.ui.ts` - Roster UI component
- `apps/web/src/services/handoff.service.ts` - Handoff state management
- `apps/web/tests/e2e/handoffs.test.ts` - Handoff unit tests
- `apps/web/tests/e2e/dynamic-roster.spec.ts` - Playwright tests

### Backend

- `src/agents/voice-agent/data-channel-handler.ts` - Message reception
- `src/tools/handoff/executor.ts` - Handoff execution logic
- `src/agents/shared/handoff-handler.ts` - Voice switch orchestration
- `src/agents/__tests__/integration/handoff-scenarios.test.ts` - Integration tests

### Shared

- `src/config/handoff-timing.ts` - Timing constants
- `apps/web/src/config/handoff-timing.ts` - Frontend timing (mirrored)
