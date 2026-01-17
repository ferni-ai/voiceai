# Ferni Awareness Audit - December 2024

> Why doesn't Ferni remember me?

## Executive Summary

Ferni has **126+ registered context builders** designed to inject user awareness, but several failure modes can prevent this context from reaching the LLM. This audit identifies the chain of custody for user context and common failure points.

---

## Context Flow (Chain of Custody)

```
1. User joins call
   └─> JobContext.metadata contains userId
       └─> identifyUser() extracts userId
           └─> validateUserId() validates format
               └─> loadOrCreateProfile() loads from Firestore
                   └─> userProfile populated (or null if fails)
                       └─> createSessionServices() creates services.userProfile
                           └─> processTurn() builds contextInput
                               └─> buildConversationContext() runs ALL builders
                                   └─> Each builder receives { userProfile, services.userId }
                                       └─> Builder produces injections (or returns [])
                                           └─> injectTurnContext() adds to LLM messages
```

**Any break in this chain = Ferni doesn't "remember" you.**

---

## Critical Checkpoints

### 1. User Identification (`identifyUser()`)

**File:** `src/agents/voice-agent/user-identification-handler.ts`

**Failure modes:**
- No `jobMetadata` in request
- Metadata JSON parse failure
- Invalid userId format rejected by `validateUserId()`

**Debug:**
```bash
# Check logs for user identification
grep -i "User identified" ~/.cursor/projects/*/terminals/*.txt
```

### 2. User ID Validation (`validateUserId()`)

**File:** `src/services/session-manager/validation.ts`

**Constraints:**
| Rule | Value |
|------|-------|
| Min length | 4 characters |
| Max length | 128 characters |
| Pattern | `/^[a-zA-Z0-9_\-.@:]+$/` |

**Failure modes:**
- userId too short/long
- Invalid characters in userId
- Returns `undefined` → profile never loaded!

### 3. Profile Loading (`loadOrCreateProfile()`)

**File:** `src/services/session-manager/profile-loader.ts`

**Failure modes:**
- Firestore not initialized
- Network timeout loading profile
- New user → empty profile (no memories yet)

**Debug:**
```bash
# Check if profile was loaded
grep -i "Loaded intelligence state" ~/.cursor/projects/*/terminals/*.txt
grep -i "REALTIME: Enriched profile" ~/.cursor/projects/*/terminals/*.txt
```

### 4. Context Builder Execution

**File:** `src/intelligence/context-builders/index.ts`

**Failure modes:**
- `userProfile` is null → most memory builders skip
- `services.userId` undefined → unified memory orchestrator skips
- Builder throws error → caught but produces no injection
- Conditional loading disabled builder

---

## Key Memory-Related Context Builders

These builders inject user awareness. If they return `[]`, Ferni won't "remember":

| Builder | What it injects | Skips if... |
|---------|----------------|-------------|
| `unified-memory-orchestrator` | Cross-session memories | `!userId` or `!userProfile` |
| `advanced-memory` | Semantic memory search | `!userId` or `!userProfile` |
| `persona-memory` | Per-persona memories | `!userProfile.id` |
| `human-memory` | Dates, temporal context | `!userProfile?.humanMemory` |
| `proactive-memory` | Memory callbacks | `!userId` |
| `personal` | Name, family, goals | `!userProfile` |
| `personal-journey` | Life journey context | `!userId` |
| `cross-session-threading` | Topic threads | `!userData.isReturningUser` |
| `conversation-recap` | Last conversation | `!services?.userProfile?.lastConversationSummary` |
| `twin-profile-context` | Digital twin profile | `!userId` |
| `better-than-human-direct` | Superhuman capabilities | `!userId` |

---

## Debugging Commands

### Enable Debug Injection Logging

Set environment variable to see ALL injections:

```bash
# In .env or before running agent
DEBUG_INJECTIONS=true      # Logs to stderr (original)
LOG_CONTEXT_BUILDS=true    # Logs to structured logger (new)
```

This logs:
- Number of injections per turn
- Categories and char counts
- Truncated preview of each injection
- Warnings about missing context

---

## Real-Time Context Inspection API

### NEW: Debug Endpoints

The following endpoints are available in dev mode (or with `X-Dev-Mode: true` header):

#### Get All Active Sessions
```bash
curl http://localhost:3002/api/debug/context
```

Returns:
- All active sessions with their latest context
- Injection counts and warnings
- User profile status per session
- Summary statistics

#### Get Specific Session History
```bash
curl http://localhost:3002/api/debug/context/{sessionId}
```

Returns:
- Last 5 turns of context for that session
- Full injection details per turn
- Builder execution results
- Warnings for each turn

#### Get Aggregated Summary
```bash
curl http://localhost:3002/api/debug/context/summary
```

Returns:
- Total turns recorded across all sessions
- Average injections per turn
- Average characters per turn
- Average build time
- Most common warnings
- Category breakdown (which types of context are being injected)

#### Clear All History
```bash
curl -X DELETE http://localhost:3002/api/debug/context
```

### Example Response (GET /api/debug/context)

```json
{
  "activeSessions": 2,
  "sessions": [
    {
      "sessionId": "session-abc",
      "userId": "user-123",
      "personaId": "ferni",
      "lastTurn": 5,
      "lastTimestamp": "2024-12-28T15:30:00.000Z",
      "injectionCount": 12,
      "characterCount": 3456,
      "warningCount": 0,
      "warnings": [],
      "userProfileStatus": {
        "exists": true,
        "hasName": true,
        "hasHumanMemory": true,
        "totalConversations": 47
      }
    }
  ],
  "summary": {
    "activeSessions": 2,
    "totalTurnsRecorded": 15,
    "avgInjections": 11,
    "avgCharacters": 3200,
    "avgBuildTime": 145,
    "commonWarnings": [],
    "categoryBreakdown": [
      { "category": "persona_memories", "count": 15, "avgChars": 450 },
      { "category": "emotional", "count": 15, "avgChars": 120 }
    ]
  }
}
```

### Warnings to Watch For

| Warning | What It Means |
|---------|--------------|
| `No userId - user will appear anonymous` | Frontend not sending user ID |
| `No userProfile - memory builders will skip` | Profile failed to load |
| `New user (0 conversations) - no memories yet` | First time user |
| `No humanMemory on profile` | Profile exists but empty |
| `ZERO injections produced` | **CRITICAL** - LLM has no context |
| `Returning user but NO memory injections` | Memory system may be broken |

### Check Context Builder Metrics

```typescript
// In browser console or Node REPL
import { getMetricsSummary } from './src/intelligence/context-builders/metrics.js';
const summary = getMetricsSummary();
console.log('Most active builders:', summary.mostActiveBuilders);
console.log('Slowest builders:', summary.slowestBuilders);
console.log('High skip rate:', summary.highestSkipRate);
```

### Check User Profile in Firestore

```bash
# Using Firebase CLI
firebase firestore:get bogle_users/YOUR_USER_ID

# Or check the full profile path
firebase firestore:get bogle_users/YOUR_USER_ID/memories
firebase firestore:get bogle_users/YOUR_USER_ID/human_memory
```

### Manual Profile Check (Node REPL)

```typescript
import { getProfile } from './src/memory/profile-store.js';
const profile = await getProfile('YOUR_USER_ID');
console.log('Profile:', profile);
console.log('Name:', profile?.name);
console.log('Total conversations:', profile?.totalConversations);
console.log('Human memory:', profile?.humanMemory);
```

---

## Common Root Causes

### 1. **Anonymous/Invalid User ID**

**Symptoms:** 
- Ferni treats you as new every time
- No memory callbacks
- No personal details

**Cause:** 
- Frontend not passing userId in metadata
- userId format rejected by validation

**Fix:**
Check frontend LiveKit connection:
```typescript
// Frontend should pass:
const metadata = JSON.stringify({
  user_id: 'valid-user-id',  // Must match pattern
  user_name: 'Real Name'
});
```

### 2. **Firestore Profile Empty/Missing**

**Symptoms:**
- Profile loads but no memories
- `humanMemory` is undefined
- `totalConversations = 0`

**Cause:**
- New user (no history yet)
- Profile creation failed silently
- Different userId between sessions

**Fix:**
- Have at least 1 conversation first
- Check userId consistency

### 3. **Context Builders Not Running**

**Symptoms:**
- Low injection count in DEBUG_INJECTIONS
- Memory builders in "high skip rate"

**Cause:**
- Conditional loading disabled category
- Builder failed to register
- Builder crashed (check error logs)

**Fix:**
```bash
# Check for builder errors
grep -i "Context builder failed" logs
grep -i "Slow context builder" logs
```

### 4. **Injections Not Reaching LLM**

**Symptoms:**
- DEBUG_INJECTIONS shows injections
- But LLM still doesn't use them

**Cause:**
- Token budget exceeded
- Injections too verbose/buried
- Filtering removing injections

**Fix:**
Check `injection-filter.ts` for filtering rules

---

## Quick Diagnosis Checklist

Run through this checklist when Ferni doesn't remember:

- [ ] **userId passed in metadata?** Check frontend connection
- [ ] **userId validates?** Min 4 chars, no special chars
- [ ] **Profile exists in Firestore?** Check bogle_users/{userId}
- [ ] **Profile has data?** totalConversations > 0, humanMemory exists
- [ ] **isReturningUser = true?** Check session init logs
- [ ] **Builders running?** Check DEBUG_INJECTIONS output
- [ ] **Memory injections produced?** Look for `persona_memories`, `advanced_memory`

---

## Recommended Improvements

### Short-term
1. Add explicit logging when `userProfile` is null
2. Add metric for "profile found vs not found" ratio
3. Create `/api/debug/context` endpoint to inspect current session context

### Medium-term
1. Dashboard showing context builder health
2. Alert when memory builders consistently skip
3. Session replay showing what context was injected

### Long-term
1. "Awareness score" metric per conversation
2. A/B test different memory injection strategies
3. User-facing "What Ferni knows about you" view

---

## Files to Review

| File | Purpose |
|------|---------|
| `src/agents/voice-agent/user-identification-handler.ts` | User ID extraction |
| `src/services/session-manager/validation.ts` | User ID validation |
| `src/services/session-manager/profile-loader.ts` | Profile loading |
| `src/intelligence/context-builders/index.ts` | Builder orchestration |
| `src/intelligence/context-builders/memory/*.ts` | Memory builders |
| `src/agents/processors/turn-processor.ts` | Turn processing |

---

*Created: December 28, 2024*
*Status: Initial Audit*
