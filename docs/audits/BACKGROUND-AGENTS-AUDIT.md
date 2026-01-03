# Background Agents Architecture - E2E Audit & Validation

## Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| **Unified Result Types** | ✅ Complete | `src/services/background-agents/result-types.ts` |
| **Unified Result Capture** | ✅ Complete | `src/services/background-agents/unified-result-capture.ts` |
| **Research Executor** | ✅ Complete | `src/services/background-agents/executors/research-executor.ts` |
| **Reservation Executor** | ✅ Complete | `src/services/background-agents/executors/reservation-executor.ts` |
| **Context Injection (Turn Processor)** | ✅ Complete | `src/agents/processors/turn-processor.ts` |
| **Call Result → Unified Capture** | ✅ Complete | `src/services/outreach/call-result-capture.ts` |
| **Frontend Handler** | ✅ Complete | `apps/web/src/app/data-message-handlers.ts` |
| **While You Were Away UI** | ✅ Complete | `apps/web/src/ui/while-you-were-away.ui.ts` |
| **UI Initialization** | ✅ Complete | `apps/web/src/app.ts` |
| **Firestore Indexes** | ✅ Complete | `firestore.indexes.json` |
| **Persona Prompt Updates** | ✅ Complete | All `function-calling-specialty.md` files |
| **E2E Tests** | ✅ Complete | `src/services/background-agents/__tests__/` |

---

## Integration Gaps Identified

### 1. 🔴 Tool Integration (HIGH PRIORITY)

**Gap:** Research and Reservation executors are not wired to tools yet.

**Current State:** Executors exist but tools don't call them.

**Files to Update:**
- `src/tools/domains/research/index.ts` - Add background research capability
- `src/tools/domains/events/index.ts` - Add background reservation capability

**Integration Pattern:**
```typescript
// In research tool
import { queueResearchTask } from '../../../services/background-agents/index.js';

// When user says "research this while I'm away"
await queueResearchTask({
  userId,
  query: researchTopic,
  type: 'deep_dive',
  depth: 'comprehensive',
  initiatedBy: 'peter',
  sessionId: currentSessionId,
});
```

### 2. 🟡 Firestore Index Deployment (MEDIUM PRIORITY)

**Gap:** New indexes in `firestore.indexes.json` need to be deployed.

**Command:**
```bash
firebase deploy --only firestore:indexes
```

**Indexes Added:**
- `on_behalf_calls`: capturedAt DESC
- `on_behalf_calls`: delivered ASC + capturedAt DESC
- `background_results`: delivered ASC + capturedAt DESC
- `background_results`: type ASC + capturedAt DESC
- `background_results`: priority DESC + capturedAt DESC
- `messages`: timestamp DESC

### 3. 🟡 API Route for Fetching Pending Results (MEDIUM PRIORITY)

**Gap:** No REST endpoint to fetch pending results (for app reload scenarios).

**Proposed Endpoint:**
```
GET /api/background-results/pending?userId={userId}&limit={n}
```

**File to Create:** `src/servers/api/routes/background-results.ts`

### 4. 🟢 Scheduled Task System (LOW PRIORITY)

**Gap:** `queueResearchTask` and `queueReservationTask` currently use `setImmediate()` instead of a proper job queue.

**Future Enhancement:** Integrate with:
- Google Cloud Tasks
- Firebase Cloud Functions scheduled
- Bull/BullMQ job queue

---

## E2E Validation Checklist

### Phase 1: Unit Test Validation ✅

```bash
pnpm vitest run src/services/background-agents/__tests__/background-agents-e2e.test.ts
```

- [x] Result types creation
- [x] Result sorting by priority
- [x] Unified result capture
- [x] Research executor (stock, fact-check, deep dive)
- [x] Reservation executor (restaurant, hotel, venue)
- [x] Error handling

### Phase 2: Call Flow Validation

**Test: On-Behalf Call → Result Capture → Frontend Notification**

1. Trigger a call:
   ```
   "Call my mom and wish her happy birthday"
   ```

2. Verify backend logs:
   ```bash
   pnpm ops:logs | grep "Call result captured"
   ```

3. Verify Firestore storage:
   ```bash
   firebase firestore:database:get /bogle_users/{userId}/on_behalf_calls --project ferni-prod
   ```

4. Verify frontend receives notification (check browser console for `ferni:call-complete` event)

### Phase 3: "While You Were Away" Validation

**Test: Disconnect → Background Task → Reconnect**

1. Start a session, ask agent to make a call
2. Disconnect before call completes
3. Wait for call to complete (check logs)
4. Reconnect to a new session
5. Verify agent mentions the call result in greeting

**What to Check:**
- Turn processor injects `pending_background_results` context
- Agent's greeting references the completed task
- Result is marked as `delivered: true` in Firestore

### Phase 4: Frontend UI Validation

**Test: While You Were Away Card Display**

1. Open browser dev tools
2. Dispatch a test event:
   ```javascript
   window.dispatchEvent(new CustomEvent('ferni:background-complete', {
     detail: {
       resultId: 'test-123',
       resultType: 'research_complete',
       summary: 'Found 3 insights about NVDA',
       status: 'success',
       priority: 'normal',
       contactName: null,
       requiresCallback: false,
       actionItems: []
     }
   }));
   ```
3. Verify UI card appears with correct styling

---

## Manual Testing Scripts

### Test Research Background Task

```bash
# In a test session, say:
"Hey Peter, can you research NVDA and let me know what you find?"

# Verify:
# 1. Research executor runs (check logs)
# 2. Result captured to Firestore
# 3. If connected, LiveKit data message sent
# 4. Frontend shows result notification
```

### Test Reservation Background Task

```bash
# In a test session, say:
"Jordan, book a table at Nobu for Friday at 7pm for 4 people"

# Verify:
# 1. Reservation executor runs
# 2. Result captured with confirmation number
# 3. Notification delivered
```

### Test Context Injection on Reconnect

```bash
# 1. Start session, request a call
# 2. Disconnect mid-call
# 3. Wait 30 seconds
# 4. Start new session
# 5. Verify greeting includes call result
```

---

## Key Files Reference

### Backend
| File | Purpose |
|------|---------|
| `src/services/background-agents/index.ts` | Module exports |
| `src/services/background-agents/unified-result-capture.ts` | Central storage & notification |
| `src/services/background-agents/executors/*.ts` | Task executors |
| `src/agents/processors/turn-processor.ts` | Context injection (line ~470) |
| `src/intelligence/context-builders/pending-call-results.ts` | "While You Were Away" builder |
| `src/services/outreach/call-result-capture.ts` | Call → unified result bridge |

### Frontend
| File | Purpose |
|------|---------|
| `apps/web/src/app/data-message-handlers.ts` | LiveKit message handling |
| `apps/web/src/ui/while-you-were-away.ui.ts` | Visual results card |
| `apps/web/src/app.ts` | UI initialization |

### Config
| File | Purpose |
|------|---------|
| `firestore.indexes.json` | Database indexes |
| `src/personas/bundles/*/identity/function-calling-specialty.md` | Persona awareness |

---

## Deployment Checklist

1. **Deploy Firestore Indexes**
   ```bash
   firebase deploy --only firestore:indexes
   ```

2. **Deploy Backend**
   ```bash
   ferni deploy gce    # Voice agent
   ferni deploy ui     # UI server
   ```

3. **Deploy Frontend**
   ```bash
   ferni deploy frontend
   ```

4. **Verify Health**
   ```bash
   curl https://app.ferni.ai/health
   curl http://34.134.186.63:8080/health
   ```

---

## Next Steps (Recommended Order)

1. **🔴 Deploy Firestore Indexes** - Required for queries to work
2. **🔴 Wire Tools to Executors** - Enable "research in background" flow
3. **🟡 Add API Endpoint** - For fetching pending results on app load
4. **🟡 Manual E2E Validation** - Run through test scenarios
5. **🟢 Production Monitoring** - Add metrics for background task completion rates

---

## Metrics to Track (Future)

| Metric | Description |
|--------|-------------|
| `background_tasks_initiated` | Count of background tasks started |
| `background_tasks_completed` | Count of tasks that finished |
| `background_tasks_failed` | Count of task failures |
| `result_delivery_latency_ms` | Time from task complete to user notification |
| `while_you_were_away_shown` | Count of reconnect greetings with pending results |

---

*Last Updated: January 3, 2026*
*Author: Background Agents Architecture Implementation*
