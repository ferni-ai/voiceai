# 🎬 Agent Transfer System - Exhaustive E2E Workflow Audit

**Date:** December 14, 2025  
**Scope:** Full handoffs, cameos, audio transfers, app transfers

## Executive Summary

The Ferni voice AI platform has a sophisticated **agent transfer system** with two main paradigms:

1. **Full Handoff** - Permanent transfer from one persona to another (e.g., Ferni → Peter)
2. **Cameo** - Temporary "pop-in" where a team member interjects briefly, then returns to host (Ferni)

Both support audio transfers (voice conversation) and app transfers (UI clicks). This audit covers every component from button click to voice switch to animation completion.

---

## 📊 Architecture Overview

### File Structure (31 handoff files, 18 cameo files)

**Frontend Services:**

- `frontend-typescript/src/services/handoff.service.ts` - Main handoff state machine
- `frontend-typescript/src/services/cameo.service.ts` - Cameo state management
- `frontend-typescript/src/config/handoff-timing.ts` - Timing constants (synced with backend)
- `frontend-typescript/src/config/cameo-config.ts` - Cameo timing, colors, sounds

**Frontend UI Components:**

- `frontend-typescript/src/ui/team.ui.ts` - Team roster click handlers + animations
- `frontend-typescript/src/ui/cameo-roster.ui.ts` - Cameo pop-in/pop-out animations
- `frontend-typescript/src/ui/persona-transition.ui.ts` - Color morph transition overlay
- `frontend-typescript/src/ui/persona-magic.ui.ts` - Avatar scale/expression animations
- `frontend-typescript/src/ui/marketplace.ui.ts` - App transfer triggers from marketplace

**Backend Handlers:**

- `src/agents/shared/handoff-handler.ts` - Voice switch orchestration
- `src/agents/shared/cameo-handler.ts` - Cameo lifecycle events
- `src/tools/handoff/executor.ts` - Handoff execution + state management
- `src/config/handoff-timing.ts` - Timing constants (source of truth)

**Event Types:**

- `frontend-typescript/src/types/events.ts` - Type definitions for all transfer events

---

## 1️⃣ HANDOFF WORKFLOW (Full Transfer)

### A. Button Click Flow

```
User clicks team member in roster
         ↓
team.ui.ts: onTeamMemberClick(personaId)
         ↓
┌────────────────────────────────────────┐
│ Validation Checks:                      │
│ • Is user already with this persona?    │
│ • Is a transition already in progress?  │
│ • Is this persona locked?               │
│ • Rate limit check (800ms debounce)     │
└────────────────────────────────────────┘
         ↓
showSwitchingFeedback() - Immediate visual feedback
         ↓
sendHandoffRequest() → Data channel message
         ↓
Backend receives 'handoff_request'
```

### B. Backend Processing

```
handoff-handler.ts: createHandoffHandler()
         ↓
executeHandoff() in executor.ts
         ↓
┌────────────────────────────────────────┐
│ Steps:                                  │
│ 1. Normalize persona ID                 │
│ 2. Check rate limiting                  │
│ 3. Validate team unlock status          │
│ 4. Get agent from registry              │
│ 5. Capture conversation context         │
│ 6. Update current agent state           │
│ 7. Generate greeting                    │
│ 8. Emit voiceSwitch event               │
└────────────────────────────────────────┘
         ↓
Handler processes voiceSwitch event
```

### C. Voice Switch & Data Channel Events

The backend sends these events in sequence:

| Order | Event Type                   | Purpose                             | Timing    |
| ----- | ---------------------------- | ----------------------------------- | --------- |
| 1     | `handoff_acknowledged`       | Request received confirmation       | Immediate |
| 2     | `handoff_started`            | Begin visual transition             | +0ms      |
| 3     | `soft_open_complete`         | Departing persona finished speaking | +~1500ms  |
| 4     | `handoff_complete`           | New persona ready to speak          | +~2000ms  |
| 5     | `handoff_failed`/`cancelled` | Error/cancellation (optional)       | Variable  |

### D. Frontend Event Processing

```typescript
// handoff.service.ts processDataMessage()

handoff_started →
  - Set _isTransitioning = true
  - Start timeout (15s)
  - Fire startCallbacks with banter text
  - Play handoff sound

soft_open_complete →
  - Fire softOpenCompleteCallbacks
  - UI begins visual transition (roster move)

handoff_complete →
  - Set _isTransitioning = false
  - Clear timeout
  - Fire completeCallbacks
  - Update activePersona state
```

### E. Animation Sequence

**Team Roster Animations (`team.ui.ts`):**

```
1. showSwitchingFeedback():
   - Add 'switching-from' class to departing persona
   - Add 'switching-to' class to arriving persona
   - Create energy transfer orb animation (curved path)

2. setActiveTeamMember():
   - playStepBack() on previous persona
   - playStepForward() on new persona (150ms delay)
   - playTeamCheer() on other team members (staggered)
```

**Energy Transfer Animation Details:**

```typescript
// Creates glowing orb that travels between team members
createEnergyTransfer(fromEl, toEl, toPersonaId):
  - Quadratic bezier path (curved upward arc)
  - Duration: 450ms
  - Easing: SPRING
  - Trail particles: 8 particles, 40ms interval
```

**Persona Transition Overlay (`persona-transition.ui.ts`):**

```typescript
// Full-screen color morph
.persona-transition {
  - Gradient from departing to arriving colors
  - Animation: persona-morph (800ms)
  - Banter text card with spring animation
}
```

**Avatar Expression Changes (`persona-magic.ui.ts`):**

```typescript
performMagicalHandoff():
  Phase 1: Expression → 'empathetic' (passing baton)
  Phase 2: Scale 1.0 → 0.96, opacity 1.0 → 0.8
  Phase 3: Play handoff sound
  Phase 4: Show banter toast (if provided)
  Phase 5: Expression → 'curious' (new persona arriving)
  Phase 6: Scale 0.96 → 1.02 → 1.0 (spring bounce)
  Phase 7: Expression → 'happy' (welcome)
```

### F. Sound Effects

```typescript
// Sound selection logic (handoff.service.ts)
if (persona.handoffSound) → persona-specific sound
else if (isFirstMeeting && coach-to-team) → 'dramatic-entrance'
else switch(direction):
  'jack-to-peter' → 'handoff-to-peter'
  'peter-to-jack' → 'handoff-to-jack'
  'coach-to-team' → 'dramatic-entrance'
  'team-to-coach' → 'connect'
```

**Post-Sound Timing:**

| Context          | Base Pause | Bonus  | Total |
| ---------------- | ---------- | ------ | ----- |
| Standard         | 250ms      | 0      | 250ms |
| First Meeting    | 250ms      | +150ms | 400ms |
| Dramatic Style   | 250ms      | +100ms | 350ms |
| First + Dramatic | 250ms      | +250ms | 500ms |

---

## 2️⃣ CAMEO WORKFLOW (Temporary Pop-In)

### A. Cameo Lifecycle

```
Backend decides team member should interject
         ↓
cameo_starting → Frontend prepares visual (sound plays)
         ↓
cameo_start → Voice switch, LLM instructions change
         ↓
Persona speaks their insight
         ↓
cameo_ending → About to return (sound plays)
         ↓
cameo_complete → Voice returns to Ferni, LLM restored
```

### B. Cameo State Machine (`cameo.service.ts`)

```typescript
interface CameoState {
  isActive: boolean;
  currentPersonaId: string | null;
  currentPersonaName: string | null;
  startTime: number | null;
  cameoId: string | null;
  isFirstCameo: boolean;
  personasWhoCameoed: Set<string>;
}
```

**Safety Features:**

- Auto-cleanup timeout: 30 seconds max duration
- Sound debounce: 500ms to prevent double-play

### C. Cameo Roster Animation (`cameo-roster.ui.ts`)

**Pop-In Sequence:**

```typescript
handleCameoStart():
  1. findRosterElementsWithRetry() - max 5 retries, exponential backoff
  2. animateFerniShift('left') - Ferni moves -8px
  3. Insert cameo element after divider
  4. animateCameoPopIn():
     - scale(0) → scale(1.2) → scale(0.95) → scale(1)
     - translateY(20px) → translateY(-8px) → translateY(0)
     - Duration: 500ms (first cameo) or 300ms (returning)
  5. Add 'cameo-speaking' class (glowing ring)
  6. createWelcomeSparkles() for first-time cameos
```

**Pop-Out Sequence:**

```typescript
handleCameoEnd():
  1. animateCameoPopOut():
     - Slide toward "More" button
     - Shrink scale(1) → scale(0.2)
     - Duration: 400ms
  2. pulseMarketplaceButton()
  3. animateFerniShift('back')
  4. Remove cameo element
```

### D. Cameo Sound Effects

```typescript
CAMEO_SOUNDS = {
  ARRIVAL: 'cameo-arrive',
  RETURN: 'cameo-return',
  ARRIVAL_FALLBACK: 'dramatic-entrance',
  RETURN_FALLBACK: 'connect',
};
```

### E. LLM Instruction Handling

**Critical Bug Fix:** Cameo handler now updates LLM instructions during cameo to prevent identity confusion.

```typescript
// cameo-handler.ts
handleCameoStarted():
  - Store original instructions
  - Load cameo persona
  - voiceAgentRef.setPersona(cameoPersona)

handleCameoComplete():
  - Restore original persona
  - voiceAgentRef.setPersona(hostPersona)
```

---

## 3️⃣ API CHANGES & DATA FLOW

### A. Data Channel Messages

**Handoff Request (Frontend → Backend):**

```json
{
  "type": "handoff_request",
  "target": "peter-john",
  "timestamp": 1702502400000,
  "attempt": 1
}
```

**Handoff Started (Backend → Frontend):**

```json
{
  "type": "handoff_started",
  "newAgent": "peter-john",
  "previousAgent": "ferni",
  "direction": "coach-to-team",
  "softOpenBanter": "Let me introduce you to Peter...",
  "arrivingBanter": "Hey! Peter here, heard you wanted...",
  "timestamp": 1702502400100
}
```

**Handoff Complete (Backend → Frontend):**

```json
{
  "type": "handoff_complete",
  "newAgent": "peter-john",
  "previousAgent": "ferni",
  "greeting": "Hey! What's going on?",
  "timestamp": 1702502402000
}
```

### B. Voice Manager Session Scoping

```typescript
// session-scoped voice manager (not global)
getSessionVoiceManager(sessionId)
  → voiceManager.switchVoice(personaId)
  → TTS switches to persona's voice ID
```

### C. Bundle Runtime Preservation

During handoff, the system preserves:

- `relationshipTurns` - turn count
- `storiesToldThisSession` - avoid repetition
- `currentMode` - conversation mode

---

## 4️⃣ PERSONA CHANGE LOGIC

### A. Identity Validation (handoff-handler.ts)

After handoff completes, the handler validates consistency:

```typescript
validation = {
  expectedAgent: persona.id,
  currentAgentTracker: getCurrentAgent(),
  voiceAgentPersona: voiceAgentRef?.getPersona()?.id,
  llmInstructionsSet: !!voiceAgentRef?.instructions,
  bundlePersona: voiceAgentRef?.getBundleRuntime()?.getState().personaId,
}

// Recovery if mismatch
if (!isConsistent) {
  - Re-apply setPersona()
  - Reload bundle runtime
  - Log recovery attempt
}
```

### B. Agent ID Normalization

```typescript
// personas.ts normalizeAgentId()
// Handles all legacy ID formats:
'generic-advisor' → 'alex-chen'
'debt-counselor' → 'maya-santos'
'jack-b' → 'ferni'
'peter' → 'peter-john'
```

### C. Team Unlock Validation

```typescript
// executor.ts
if (!isCoach(targetId) && !bypassUnlocks) {
  if (isCoreTeamMember(targetId)) {
    → Check individual unlock status
  } else {
    → Require full team unlock for marketplace agents
  }
}
```

---

## 5️⃣ E2E TEST COVERAGE

### A. Existing Tests

| Test File                                        | Coverage                                          |
| ------------------------------------------------ | ------------------------------------------------- |
| `e2e/persona-handoff.spec.ts`                    | API validation, marketplace UI, team unlock       |
| `frontend-typescript/tests/e2e/handoffs.test.ts` | Persona normalization, transitions, sound effects |
| `src/tests/cameo-e2e.test.ts`                    | Cameo lifecycle                                   |
| `src/tests/handoff-flow.test.ts`                 | Backend handoff flow                              |
| `src/tests/handoff-detection.test.ts`            | Event type detection                              |
| `src/tests/handoff-diagnostics.test.ts`          | Error scenarios                                   |

### B. Test Scenarios Covered

✅ All team member personas have required fields  
✅ Persona normalization (legacy → canonical IDs)  
✅ Team unlock state respects BYPASS mode  
✅ Marketplace UI opens and shows team members  
✅ Click handlers work on team member cards  
✅ Handoff message encoding/decoding  
✅ Direction determination (coach-to-team, team-to-coach)  
✅ Entrance phrases are unique per persona  
✅ Handoff sound naming convention

### C. Gaps in Test Coverage

❌ **No E2E test for full visual animation sequence**  
❌ **No test for cameo roster pop-in/pop-out animations**  
❌ **No test for energy transfer particle effects**  
❌ **No test for sound timing synchronization**  
❌ **No test for warm handoff banter display**  
❌ **No test for LLM instruction recovery on failure**

---

## 6️⃣ TIMING CONFIGURATION

### Shared Timing Constants (HANDOFF_TIMING)

| Constant             | Value    | Purpose                        |
| -------------------- | -------- | ------------------------------ |
| `USER_INITIATED`     | 200ms    | User tap response delay        |
| `FIRST_MEETING`      | 400ms    | First meeting theatrical pause |
| `RETURNING_TO_COACH` | 300ms    | Warm return to Ferni           |
| `STANDARD`           | 350ms    | Agent-suggested handoff        |
| `DEBOUNCE_MS`        | 800ms    | Rate limiting between handoffs |
| `HANDOFF_TIMEOUT_MS` | 15,000ms | Max wait for completion        |
| `MAX_FEEDBACK_DELAY` | 500ms    | Visual feedback cleanup        |

### Transition Style Multipliers

| Style    | Multiplier | Use Case             |
| -------- | ---------- | -------------------- |
| standard | 1.0        | Default              |
| dramatic | 1.3        | Peter, Nayan         |
| subtle   | 0.8        | Quick transitions    |
| warm     | 1.0        | Relationship-focused |

### Cameo Timing (CAMEO_TIMING)

| Constant                | Value |
| ----------------------- | ----- |
| ARRIVAL_SOUND_WAIT      | 150ms |
| ARRIVAL_VISUAL_DURATION | 350ms |
| POST_ARRIVAL_PAUSE      | 100ms |
| RETURN_SOUND_WAIT       | 100ms |
| RETURN_VISUAL_DURATION  | 300ms |

---

## 7️⃣ FINDINGS & RECOMMENDATIONS

### A. Strengths ✅

1. **Robust state machine** - handoffService handles all edge cases (rate limiting, timeout, cancellation)
2. **Warm handoff support** - Banter text for smooth persona introductions
3. **LLM instruction recovery** - Auto-recovery if identity mismatch detected
4. **Session-scoped voice manager** - Prevents cross-session contamination
5. **Cameo safety timeout** - 30s max prevents orphaned cameo states
6. **Sound debouncing** - Prevents double-play on rapid events

### B. Potential Issues ⚠️

1. **Race Condition:** `soft_open_complete` can arrive before `handoff_started` - handled by queueing callback
2. **Animation Timing:** Energy transfer animation (450ms) may not sync perfectly with sound
3. **Mobile Performance:** Multiple simultaneous animations may cause jank on low-end devices
4. **Test Coverage:** No visual regression tests for animations

### C. Recommendations 📋

1. **Add visual regression tests** using Playwright screenshots for:
   - Team roster transition states
   - Cameo pop-in/pop-out
   - Energy transfer effect
2. **Add audio-visual sync test** to verify sound plays at correct animation phase

3. **Consider reducing animation complexity** on mobile (detect via `navigator.hardwareConcurrency`)

4. **Add telemetry** for handoff duration tracking to identify production issues

5. **Document warm handoff flow** - The banter system is powerful but underdocumented

---

## 8️⃣ FLOW DIAGRAMS

### Full Handoff Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER CLICKS TEAM MEMBER                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  VALIDATION                                                          │
│  • Check if already with persona                                     │
│  • Check transition in progress                                      │
│  • Check persona unlock status                                       │
│  • Check rate limit (800ms debounce)                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  IMMEDIATE VISUAL FEEDBACK (showSwitchingFeedback)                   │
│  • Add 'switching-from' class to current persona                    │
│  • Add 'switching-to' class to target persona                       │
│  • Start energy transfer animation                                   │
│  • Preview persona theme colors                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SEND HANDOFF REQUEST (Data Channel)                                 │
│  { type: 'handoff_request', target: 'peter-john', timestamp }       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND: handoff_acknowledged                                       │
│  → Request received                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND: handoff_started (with banter text)                         │
│  → _isTransitioning = true                                          │
│  → Start 15s timeout                                                 │
│  → Play handoff sound                                                │
│  → Show banter text                                                  │
│  → Departing persona speaks soft open                               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND: soft_open_complete                                         │
│  → Departing persona finished speaking                              │
│  → Begin visual roster transition (setActiveTeamMember)             │
│  → playStepBack(fromPersona)                                        │
│  → playStepForward(toPersona)                                       │
│  → playTeamCheer(allOthers)                                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND VOICE SWITCH                                                │
│  • VoiceManager.switchVoice(personaId)                              │
│  • TTS.switchVoice(name, voiceId)                                   │
│  • voiceAgentRef.setPersona(newPersona)                             │
│  • Reload bundle runtime                                             │
│  • Speak greeting in new voice                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND: handoff_complete                                           │
│  → _isTransitioning = false                                         │
│  → Clear timeout                                                     │
│  → Hide banter text                                                  │
│  → setActivePersona(newPersona)                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Cameo Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND DECIDES TO TRIGGER CAMEO                                    │
│  (Team member has relevant insight)                                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  cameo_starting                                                      │
│  → Play arrival sound (debounced)                                   │
│  → Set CSS variables for persona colors                             │
│  → Frontend prepares for visual                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  cameo_start                                                         │
│  → Voice switch to cameo persona                                    │
│  → Update LLM instructions to cameo persona                         │
│  → animateFerniShift('left')                                        │
│  → Insert cameo element in roster                                   │
│  → animateCameoPopIn() (bounce animation)                           │
│  → Add 'cameo-speaking' class (glow ring)                           │
│  → createWelcomeSparkles() if first cameo                           │
│  → Speak greeting                                                    │
│  → Start 30s safety timeout                                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAMEO PERSONA SPEAKS INSIGHT                                        │
│  (User may respond)                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  cameo_ending                                                        │
│  → Cameo persona says handback phrase                               │
│  → Play return sound (debounced)                                    │
│  → Prepare exit animation                                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  cameo_complete                                                      │
│  → Voice switch back to Ferni                                       │
│  → Restore LLM instructions to Ferni                                │
│  → animateCameoPopOut() (slide toward "More" button)                │
│  → pulseMarketplaceButton()                                         │
│  → animateFerniShift('back')                                        │
│  → Remove cameo element                                              │
│  → Clear safety timeout                                              │
│  → Clear CSS persona variables                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

_This audit was generated on December 14, 2025_
