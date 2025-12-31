# Bidirectional Agent Engagement - E2E Gap Analysis

> What we need to do before this actually works end-to-end.

---

## 🚨 Critical Gaps (Must Fix)

### 1. **No Firestore Indexes for Threads**

The thread queries will FAIL in production without indexes.

**Required indexes** (add to `firestore.indexes.json`):

```json
{
  "collectionGroup": "conversation_threads",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "lastActivityAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "messages",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
}
```

**Fix command:**
```bash
firebase deploy --only firestore:indexes
```

### 2. **No Unit/Integration Tests**

Zero tests exist for the conversation-thread module.

**Files to test:**
- `thread-manager.ts` - Core thread operations
- `thread-persistence.ts` - Firestore save/load
- `inbound-router.ts` - SMS/push routing logic
- `outbound-initiator.ts` - Outreach initiation
- `group-outreach.ts` - Team outreach

**Test file to create:** `src/services/conversation-thread/__tests__/thread-system.test.ts`

### 3. **Group Outreach Not Triggered**

The `group-outreach.ts` module is implemented but **never called** from anywhere.

**Missing triggers:**
- No superhuman service calls `initiateGroupOutreach()`
- No decision engine knows about group outreach
- No scheduled job triggers team roundtables

**Needs integration in:**
- `src/services/superhuman/commitment-keeper.ts` - Team support outreach
- `src/services/outreach/decision-engine.ts` - Group outreach rules
- `src/services/outreach/proactive-scheduler.ts` - Scheduled team outreach

---

## ⚠️ Important Gaps (Should Fix)

### 4. **Thread Recording Not Fully Tested**

The wiring exists but hasn't been validated:

**Wired in:**
- ✅ `voice-agent-entry.ts` - Calls `initializeThreadRecording()`
- ✅ `transcript-handler.ts` - Calls `recordUserMessage()`
- ✅ `response-processor.ts` - Calls `recordAgentMessage()`

**Not validated:**
- Does the thread persist across server restarts?
- Does the thread continue when user calls back?
- Does the SMS reply correctly link to the thread?

### 5. **Twilio Webhook Integration Untested**

The inbound router is wired into `twilio-webhooks.ts` but:
- No E2E test that SMS reply → routes to correct agent
- No test that push tap → continues thread
- `handleInboundSMS` function needs validation

### 6. **Thread Context Injection Not Validated**

The context builder (`thread-context.ts`) is called but:
- No validation that context actually appears in LLM prompts
- No test for outreach-response flow (SMS → Voice call)
- No test for cross-channel continuity

---

## 📋 E2E Test Plan

### Test 1: Basic Thread Persistence
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

### Test 4: Agent Handoff
```
1. User talking to Ferni
2. Handoff to Maya
3. Verify: Maya receives thread context
4. Maya responds → messages attributed correctly
```

### Test 5: Group Outreach
```
1. Trigger group outreach (Maya + Jordan)
2. Verify: message generated with both voices
3. User replies
4. Verify: routed to leadPersona
```

---

## 🛠️ Quick Fixes Needed

### Fix 1: Add Firestore Indexes

```bash
# In firestore.indexes.json, add conversation_threads indexes
# Then deploy:
firebase deploy --only firestore:indexes
```

### Fix 2: Create Test File

```typescript
// src/services/conversation-thread/__tests__/thread-system.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOrCreateThread,
  addMessage,
  getActiveThread,
  buildAgentContext,
} from '../thread-manager.js';

describe('Thread Manager', () => {
  // Tests here
});
```

### Fix 3: Wire Group Outreach to Decision Engine

```typescript
// src/services/outreach/decision-engine.ts
import { initiateGroupOutreach } from '../conversation-thread/group-outreach.js';

// In decision logic:
if (shouldUseTeamOutreach(trigger)) {
  await initiateGroupOutreach({
    userId,
    personas: selectTeamForTrigger(trigger),
    leadPersona: 'ferni',
    // ...
  });
}
```

---

## 📊 E2E Validation Checklist

| Check | Status | How to Validate |
|-------|--------|-----------------|
| Thread creates on voice call | ⏳ | Check Firestore after call |
| Thread persists after call ends | ⏳ | Query Firestore |
| Thread loads on next call | ⏳ | Log `🧵 THREAD CONTEXT` |
| SMS reply routes correctly | ⏳ | Send test SMS, check logs |
| Push tap continues thread | ⏳ | Tap notification, check thread |
| Context injected to LLM | ⏳ | Check `modelBaseInstructions` |
| Group message generates | ⏳ | Call `generateGroupMessage()` |
| Firestore indexes work | ⏳ | `loadActiveThread()` succeeds |

---

## 🚀 Steps to Test E2E

### 1. Deploy Firestore Indexes
```bash
# Add indexes to firestore.indexes.json
firebase deploy --only firestore:indexes
```

### 2. Start Dev Environment
```bash
# Terminal 1: Token server
node token-server.js

# Terminal 2: UI server
PORT=3002 node ui-server.js

# Terminal 3: Voice agent (dev)
npm run dev

# Terminal 4: Frontend
cd apps/web && npm run dev
```

### 3. Manual E2E Test
1. Open app at `localhost:3004`
2. Start voice call
3. Say something, end call
4. Check Firestore: `bogle_users/{userId}/conversation_threads/`
5. Start new call - should see `🧵 THREAD CONTEXT` log
6. Send yourself an SMS via outreach (need admin endpoint)
7. Reply to SMS - check webhook logs
8. Call back - verify context continues

### 4. Check Logs
```bash
# Look for these logs:
🧵 New conversation thread created
🧵 THREAD CONTEXT - Cross-channel continuity enabled
📞 Voice call is response to outreach
Thread saved to Firestore
Loaded active thread from Firestore
```

---

## Summary

| Category | Count | Priority |
|----------|-------|----------|
| Critical gaps | 3 | 🔴 Fix now |
| Important gaps | 3 | 🟡 Fix soon |
| Tests needed | 5 | 🟢 For confidence |

**Time estimate to production-ready:** 2-3 days of focused work

**Immediate actions:**
1. Add Firestore indexes (10 min)
2. Write basic tests (2-4 hours)
3. Wire group outreach to triggers (1-2 hours)
4. Manual E2E validation (2-3 hours)
