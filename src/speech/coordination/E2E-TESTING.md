# Speech Coordination E2E Testing Guide

> Manual testing guide to validate the coordinated speech system

## Prerequisites

1. **Stop cloud agent** (prevents job stealing):
```bash
gcloud compute ssh voiceai-agent-gce --zone=us-central1-a --command="docker stop \$(docker ps -q)"
```

2. **Start local servers**:
```bash
# Terminal 1: Token Server
node token-server.js

# Terminal 2: UI Server  
PORT=3002 node ui-server.js

# Terminal 3: Frontend
cd apps/web && pnpm dev
```

3. **Start voice agent**:
```bash
# Terminal 4: Voice agent with debug logging
DEBUG_SPEECH_COORDINATION=true pnpm dev
```

4. **Open app**:
```
http://localhost:3004/?dev
```

---

## Test Cases

### Test 1: Greeting Doesn't Overlap with Backchannels

**Goal:** Verify greeting speech uses priority queue and doesn't get interrupted by early backchannels.

**Steps:**
1. Click "Connect"
2. Observe Ferni's greeting
3. Start speaking immediately after greeting begins

**Expected:**
- Greeting completes fully before any backchannel
- No audio overlap or choppy speech
- Look for log: `🎤 Speech coordination initialized`

**Logs to check:**
```
[speech-coordinator] Speech request accepted { priority: 'response', source: 'greeting' }
```

---

### Test 2: Tool Results Don't Overlap with Response

**Goal:** Verify tool results wait for proper turn in queue.

**Steps:**
1. Say "Play some jazz music"
2. Observe the response flow

**Expected:**
- Acknowledgment: "Let me find some jazz..."
- Tool executes (music starts)
- Response about the music (if any) comes after acknowledgment finishes
- No "speaking over itself"

**Logs to check:**
```
[speech-coordinator] Speech request accepted { priority: 'tool_result' }
[stream-state-machine] State transition { from: 'normal', to: 'executing_tool' }
```

---

### Test 3: Handoff Banter Uses Coordination

**Goal:** Verify handoff goodbye/greeting don't overlap.

**Steps:**
1. Say "I'd like to talk to Peter about investing"
2. Observe the handoff flow

**Expected:**
- Ferni's goodbye completes
- Brief pause
- Peter's greeting starts
- No overlap between goodbye and greeting

**Logs to check:**
```
[speech-coordinator] Speech request accepted { source: 'handoff-goodbye' }
[speech-coordinator] Speech request accepted { source: 'handoff-greeting' }
```

---

### Test 4: Multiple Quick Requests Queue Properly

**Goal:** Verify rapid speech requests queue and don't pile up.

**Steps:**
1. Start speaking
2. Pause briefly (trigger backchannel check)
3. Continue speaking
4. Pause again
5. Ask a question

**Expected:**
- At most one backchannel per pause
- No backchannels during user speech
- Response waits for appropriate turn

**Logs to check:**
```
[speech-coordinator] Request queued { queueLength: N }
[speech-coordinator] Processing queue { pending: N }
```

---

### Test 5: Error Recovery Speech Works

**Goal:** Verify error messages use coordinated speech.

**Steps:**
1. Disconnect network briefly while speaking
2. Reconnect
3. Observe error handling

**Expected:**
- If error occurs, Ferni acknowledges gracefully
- Error message doesn't overlap with recovery attempts

---

### Test 6: Music Handler Integration

**Goal:** Verify music-related speech (DJ comments, transitions) uses coordination.

**Steps:**
1. Say "Play some relaxing piano"
2. Wait for music to play for 30+ seconds
3. Observe any DJ comments or transitions

**Expected:**
- Music appreciation comments (if any) don't overlap with user speech
- Track transitions handled smoothly

**Logs to check:**
```
[music-handler] DJ appreciation comment via coordinated speech
```

---

## Debug Panel

Enable debug panel with `Cmd/Ctrl+Shift+D` to see:
- Active speech queue
- Current coordinator state
- Recent speech requests

---

## Common Issues & Solutions

### Issue: "coordinatedSay: No session attached"

**Cause:** Speech coordination not initialized for this session.

**Solution:** Check voice-agent-entry.ts has:
```typescript
initializeSpeechCoordination(sessionId, session);
```

### Issue: Speech queue grows unbounded

**Cause:** Requests being added but not processed.

**Solution:** Check session is attached and not in error state.

### Issue: Still hearing overlap

**Cause:** Some code path bypassing coordinator.

**Solution:** Search for remaining `session.say(` calls not migrated.

---

## Metrics to Track

After testing, check:

```bash
curl http://localhost:3002/api/observability | jq '.speechCoordination'
```

Should show:
- `requestsProcessed` - Total speech requests
- `queueOverflows` - Should be 0
- `averageQueueTime` - Should be < 500ms
- `echoDetections` - Adaptive timing adjustments

---

## Success Criteria

✅ No audio overlap during normal conversation
✅ Handoffs sound natural (goodbye → greeting)
✅ Tool results don't interrupt responses
✅ Backchannels respect speaking state
✅ Error messages don't pile up
✅ Queue stays bounded (< 5 items typically)

---

*Last updated: December 2024*

