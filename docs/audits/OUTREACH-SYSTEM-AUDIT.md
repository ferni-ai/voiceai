# 🔍 Outreach System Audit

**Date**: December 20, 2024  
**Status**: Comprehensive review of intelligent outreach system

---

## 📋 Executive Summary

We have a powerful intelligent outreach system with "better than human" capabilities, but there's **significant code duplication** and some **integration gaps** that need attention.

### Key Findings

| Category | Issues Found | Priority |
|----------|-------------|----------|
| **Duplication** | 2 competing outreach integrations | 🔴 High |
| **Integration Gaps** | Trust bridge missing feature flag | 🟡 Medium |
| **Test Coverage** | Missing E2E for trust-outreach-bridge | 🟡 Medium |
| **Infrastructure** | Voicemail handling incomplete | 🟢 Low |

---

## 🔴 CRITICAL: Code Duplication

### Two Competing Outreach Integration Systems

We have **two files doing essentially the same thing**:

#### 1. `src/services/trust-systems/outreach-integration.ts` (OLDER)
- Uses **in-memory queue** (`Map<string, OutreachItem[]>`)
- Has its own preferences management
- Direct delivery via `sendMessage()`
- **644 lines**

#### 2. `src/services/outreach/trust-outreach-bridge.ts` (NEWER)
- Uses **Pub/Sub** via `publishOutreachTrigger()`
- Delegates to decision engine and workers
- More scalable architecture
- **664 lines**

#### Impact
- Confusion about which to use
- Duplicated logic for generating celebrations, reflections
- Different behavior depending on entry point
- Tests exist for older system, not newer

#### Recommendation
**Consolidate to Pub/Sub approach** (`trust-outreach-bridge.ts`):
1. Keep: Pub/Sub-based trigger publishing
2. Migrate: Preferences management to Firestore
3. Deprecate: In-memory queue in `outreach-integration.ts`
4. Add: Feature flag check to trust-outreach-bridge

---

## 🟡 Integration Gaps

### 1. Feature Flag Missing in Trust Bridge

**Location**: `src/services/outreach/trust-outreach-bridge.ts`

**Problem**: `evaluateTrustBasedOutreach()` doesn't check `isOutreachTriggerCreationEnabled()` before creating triggers. The session-integration.ts does check, but if someone calls the bridge directly, triggers will be created even when disabled.

**Fix**:
```typescript
// Add at start of evaluateTrustBasedOutreach()
import { isOutreachTriggerCreationEnabled } from '../../config/feature-flags.js';

if (!isOutreachTriggerCreationEnabled()) {
  log.debug({ userId }, 'Outreach trigger creation disabled via feature flag');
  return { triggersCreated: 0, triggerTypes: [], skipped: [] };
}
```

### 2. Per-Turn vs Post-Session Outreach

**Current Flow**:
- `turn-processor.ts` line 2135: Calls `extractOutreachContext()` per turn
- `session-integration.ts`: Calls `evaluateTrustBasedOutreach()` post-session

**Gap**: The trust bridge only runs post-session. Some "better than human" detections (like concern detection mid-conversation) should trigger immediately, not wait for session end.

**Consideration**: This might be intentional (to avoid mid-conversation outreach), but should be documented.

### 3. Outreach Worker → Decision Engine Connection

**Location**: `src/workers/outreach-worker.ts`

**Question**: Does the worker properly:
1. Pull triggers from Firestore?
2. Evaluate through decision engine?
3. Schedule delivery?

**Needs E2E Validation**: Create a trigger via `publishOutreachTrigger()`, verify it appears in worker processing, verify delivery scheduled.

---

## 🧪 Test Coverage Gaps

### Missing Tests

| Component | Existing Tests | Needed |
|-----------|---------------|--------|
| `trust-outreach-bridge.ts` | ❌ None | Unit tests for all processing functions |
| `session-integration.ts` | ✅ Partial | Integration test for full flow |
| `outreach-worker.ts` | ❌ None | E2E test for Pub/Sub → Delivery |
| Concern detection flow | ❌ None | E2E test for detected concern → outreach |

### Existing Test Files
- `src/tests/outreach-integration.test.ts` - Tests OLD in-memory system
- `src/tests/maya-habit-outreach.test.ts` - Tests Maya-specific outreach
- `e2e/outreach.spec.ts` - API endpoint tests (good!)
- `apps/cli/src/commands/test/test-full-outreach-system.ts` - CLI test (uses old system)

---

## 📁 File Inventory

### Outreach Core (`src/services/outreach/`)

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| `decision-engine.ts` | When/how to send | ~400 | ✅ Good |
| `channel-selector.ts` | SMS/Email/Call routing | ~200 | ✅ Good |
| `trust-outreach-bridge.ts` | Trust → Triggers | 664 | 🟡 Needs feature flag |
| `session-integration.ts` | Session → Triggers | 615 | ✅ Good |
| `trigger-publisher.ts` | Pub/Sub publishing | ~150 | ✅ Good |
| `persona-voice-generator.ts` | Persona-specific messages | ~200 | ✅ Good |
| `maya-habit-outreach.ts` | Maya habit triggers | ~300 | ✅ Good |
| `life-rhythm-outreach.ts` | Predictive outreach | ~400 | ✅ Good |
| `superhuman-outreach-integration.ts` | Memory-based triggers | ~300 | ✅ Good |
| `conversational-calls.ts` | LiveKit outbound calls | ~400 | 🟢 Needs SIP setup |

### Delivery (`src/services/outreach/delivery/`)

| File | Purpose | Status |
|------|---------|--------|
| `sms-delivery.ts` | Twilio SMS | ✅ Working |
| `email-delivery.ts` | SendGrid | ✅ Working |
| `push-notifications.ts` | FCM | 🟡 Needs FCM config |
| `voice-call-delivery.ts` | Twilio Voice | 🟡 Needs SIP trunk |

### Trust Systems (`src/services/trust-systems/`)

| File | Purpose | Outreach Integration |
|------|---------|---------------------|
| `thinking-of-you.ts` | Random warmth | ✅ Via trust-bridge |
| `small-wins.ts` | Celebrations | ✅ Via trust-bridge |
| `growth-reflection.ts` | Growth patterns | ✅ Via trust-bridge |
| `reading-between-lines.ts` | Unsaid signals | ✅ Via trust-bridge |
| `boundary-memory.ts` | Topic avoidance | ✅ Via trust-bridge |
| `our-songs.ts` | Musical memories | ✅ Via trust-bridge |
| `outreach-integration.ts` | **DUPLICATE** | 🔴 Should deprecate |

---

## 🎯 Action Items

### Immediate (Before Production)

1. **Add feature flag check to trust-outreach-bridge.ts**
   ```typescript
   if (!isOutreachTriggerCreationEnabled()) {
     return { triggersCreated: 0, triggerTypes: [], skipped: [] };
   }
   ```

2. **Write unit tests for trust-outreach-bridge.ts**
   - Test each processing function
   - Test boundary checking
   - Test concern detection

3. **E2E test: Trigger → Worker → Delivery**
   - Create trigger via API
   - Verify worker picks it up
   - Verify delivery scheduled

### Short-Term (Next Sprint)

4. **Consolidate outreach integrations**
   - Mark `trust-systems/outreach-integration.ts` as deprecated
   - Update tests to use new system
   - Update CLI test commands

5. **Document the intended flow**
   - When trust bridge runs
   - When session integration runs
   - What each component does

### Long-Term

6. **Complete voice call integration**
   - Configure Twilio SIP trunk
   - Wire LiveKit for outbound
   - Add voicemail detection

7. **Push notification completion**
   - Add FCM credentials
   - Test iOS/Android delivery

---

## 📊 Current Outreach Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER CONVERSATION                             │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  turn-processor │  │  session-end    │  │  daily worker   │
│  (per message)  │  │  (post-session) │  │  (scheduled)    │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  extractOutreach│  │  session-       │  │  trust-outreach │
│  Context()      │  │  integration.ts │  │  bridge.ts      │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │  Pub/Sub Topic  │
                    │  outreach-      │
                    │  triggers       │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ outreach-worker │
                    │ (Cloud Run Job) │
                    │ every 5 minutes │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ decision-engine │
                    │ evaluate()      │
                    └────────┬────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │   SMS    │        │  Email   │        │   Call   │
   │ (Twilio) │        │(SendGrid)│        │(Twilio+  │
   │    ✅    │        │    ✅    │        │LiveKit)🟡│
   └──────────┘        └──────────┘        └──────────┘
```

---

## 🔧 Quick Fixes

### Fix 1: Add Feature Flag to Trust Bridge

```bash
# File: src/services/outreach/trust-outreach-bridge.ts
# Add import at top:
import { isOutreachTriggerCreationEnabled } from '../../config/feature-flags.js';

# Add check at start of evaluateTrustBasedOutreach():
if (!isOutreachTriggerCreationEnabled()) {
  log.debug({ userId }, 'Outreach trigger creation disabled');
  return { triggersCreated: 0, triggerTypes: [], skipped: [] };
}
```

### Fix 2: Add Test for Trust Bridge

```bash
# Create: src/tests/trust-outreach-bridge.test.ts
# Test: processThinkingOfYouMoments
# Test: processUncelebratedWins
# Test: shouldAvoidOutreachTopic
# Test: handleConcernDetection
```

### Fix 3: Verify E2E Flow

```bash
# Run CLI test
ferni test outreach-e2e

# Or manually:
# 1. Create trigger
curl -X POST https://app.ferni.ai/api/outreach/trigger \
  -H "X-User-ID: test-user" \
  -d '{"type": "thinking_of_you", "reason": "test"}'

# 2. Check worker logs
ferni logs outreach-worker

# 3. Verify delivery
curl https://app.ferni.ai/api/outreach/history?userId=test-user
```

---

## ✅ What's Working Well

1. **Decision Engine** - Smart channel/tone selection
2. **Session Integration** - Automatic trigger creation post-session
3. **Maya Habit Outreach** - Streak protection, milestones
4. **Life Rhythm Outreach** - Predictive check-ins
5. **Pub/Sub Infrastructure** - Scalable trigger processing
6. **Persona Voice** - Each persona has unique voice
7. **SMS & Email Delivery** - Tested and working

---

*Generated by Outreach System Audit, December 2024*

