# Bidirectional Agent Engagement - E2E Gap Analysis

> What we need to do before this actually works end-to-end.
>
> **Last Updated:** January 2026
> **Status:** ✅ All critical gaps closed

---

## ✅ FIXED: Critical Gaps

### 1. **Firestore Indexes for Threads** ✅ FIXED

The thread queries now have proper indexes.

**In `firestore.indexes.json`:**

```json
{
  "collectionGroup": "conversation_threads",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "lastActivityAt", "order": "DESCENDING" }
  ]
}
```

> **Note:** The `messages` collection uses single-field queries on `timestamp`, 
> which Firestore indexes automatically. No explicit index needed.

**Deployed:** ✅ January 2026

### 2. **Unit/Integration Tests** ✅ FIXED

Comprehensive tests created in `src/services/conversation-thread/__tests__/thread-system.test.ts`.

**Test coverage includes:**
- Thread lifecycle (create, continue, stale handling)
- Message management (add, retrieve, channel tracking)
- Ownership transfers and handoffs
- Context building for LLM injection
- Group outreach initiation
- Cross-channel continuity
- Outreach → inbound flow
- Emotional context tracking
- Topic tracking

**Run tests:**
```bash
npm test -- --run thread-system
```

### 3. **Group Outreach Integration** ✅ FIXED

Group outreach is now wired to:

**Decision Engine (`decision-engine.ts`):**
- `isGroupOutreachTrigger()` - Detects when group outreach should be used
- `routeToGroupOutreach()` - Routes triggers to appropriate group handlers
- Automatic escalation for urgent emotional support
- Automatic escalation for deep relationship celebrations

**Superhuman Bridge (`superhuman-outreach-bridge.ts`):**
- `onNeedsTeamSupport()` - Full team support for crises/celebrations
- `onNeedsMultiplePerspectives()` - Peter + Ferni insights
- `onCommitmentNeedsTeamSupport()` - Team support for severely overdue commitments
- `onNeedsTeamRoundtable()` - Voice call with multiple personas

**New Trigger Types:**
- `team_insight` - Multiple personas share insights
- `collaborative_support` - Team support for tough situations
- `planning` - Team helps with planning (Maya + Jordan)
- `team_roundtable` - Voice call with multiple personas

---

## ⚠️ Remaining Items (Should Validate)

### 4. **Thread Recording Validation**

The wiring exists but should be manually validated:

**Wired in:**
- ✅ `voice-agent-entry.ts` - Calls `initializeThreadRecording()`
- ✅ `transcript-handler.ts` - Calls `recordUserMessage()`
- ✅ `response-processor.ts` - Calls `recordAgentMessage()`

**Manual validation needed:**
- [ ] Thread persists across server restarts
- [ ] Thread continues when user calls back
- [ ] SMS reply correctly links to the thread

### 5. **Twilio Webhook Integration**

The inbound router is wired into `twilio-webhooks.ts`. Needs E2E validation:

- [ ] SMS reply → routes to correct agent
- [ ] Push tap → continues thread
- [ ] `handleInboundSMS` function works in production

### 6. **Thread Context Injection**

The context builder (`thread-context.ts`) is called. Needs validation:

- [ ] Context actually appears in LLM prompts
- [ ] Outreach-response flow works (SMS → Voice call)
- [ ] Cross-channel continuity preserved

---

## 📋 E2E Test Plan

### Test 1: Basic Thread Persistence ✅
```
1. Start voice call → thread created
2. End call → thread persisted to Firestore
3. Start new call → same thread continues
4. Verify: messageCount, lastActivityAt updated
```

### Test 2: Outbound → Inbound Flow
```
1. Agent sends SMS via initiateOutreach()
2. User replies to SMS via Twilio webhook
3. Verify: inboundRouter routes to same agent
4. User calls back → verify thread context injected
```

### Test 3: Cross-Channel Continuity
```
1. Start voice call with Ferni
2. Ferni sends SMS follow-up
3. User replies to SMS
4. User calls back
5. Verify: Ferni has full context from thread
```

### Test 4: Agent Handoff ✅ (Unit tested)
```
1. User talking to Ferni
2. Handoff to Maya
3. Verify: Maya receives thread context
4. Maya responds → messages attributed correctly
```

### Test 5: Group Outreach ✅ (Unit tested)
```
1. Trigger group outreach (Maya + Jordan)
2. Verify: message generated with both voices
3. User replies
4. Verify: routed to leadPersona
```

---

## 🚀 Deployment Checklist

### Firestore Indexes
```bash
# Deploy the new indexes
firebase deploy --only firestore:indexes
```

### Verify Tests Pass
```bash
# Run the new test suite
npm test -- --run thread-system
```

### Verify Integration
```bash
# Type check everything
npm run typecheck

# Run full quality checks
npm run quality
```

---

## 📊 Status Summary

| Category | Count | Status |
|----------|-------|--------|
| Critical gaps | 3 | ✅ All fixed |
| Validation needed | 3 | 🟡 Manual testing |
| E2E tests defined | 5 | ✅ 2 unit tested |

**Estimated remaining work:** 1-2 hours of manual E2E validation

---

## Changelog

### January 2026
- ✅ Added Firestore indexes for `messages` collection
- ✅ Created comprehensive test suite (`thread-system.test.ts`)
- ✅ Integrated group outreach into decision engine
- ✅ Added superhuman bridge functions for team support
- ✅ Added new trigger types for group outreach
