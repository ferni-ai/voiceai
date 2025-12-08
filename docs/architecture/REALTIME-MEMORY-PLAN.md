# Real-Time Memory Architecture

> **Goal**: Ferni ALWAYS remembers you, even if the call disconnects unexpectedly.

## Status: ✅ IMPLEMENTED

**Implementation Date**: December 8, 2025

---

## The Problem (Solved)

Previous architecture had a critical flaw:
```
Call Start → Turns accumulate in RAM → Session End → Save to Firestore
                      ↑                      ↑
               If crash here...      ...or here = ALL MEMORY LOST
```

Evidence from Firestore:
- Users had `totalConversations: 1` but `lastConversationSummary: null`
- This meant profile saved but turns were lost before summarization

## The Solution: Stream-First Memory

```
Call Start → Each turn immediately persisted → Async summarization
                      ↓
            Firestore (durable)
                      ↓
            Cloud Function summarizes after session
```

---

## Implementation Details

### Core Service: `src/services/realtime-memory.ts`

New service with the following exports:

| Function | Description |
|----------|-------------|
| `startConversation(userId, personaId)` | Creates Firestore conversation document |
| `persistTurn(userId, conversationId, turn)` | Fire-and-forget turn persistence |
| `endConversation(userId, conversationId)` | Marks conversation ended |
| `getLastConversationContext(userId)` | Retrieves last conversation for greeting |
| `getRecentConversations(userId, limit)` | Retrieves conversation history |
| `getConversationTurns(userId, conversationId, limit)` | Retrieves turns |
| `summarizeConversationAsync(userId, conversationId)` | Async summarization |
| `buildQuickSummary(turns)` | Fallback summary from turn content |
| `getUnsummarizedConversations(limit)` | For background job |
| `markSummarized(userId, conversationId, summary)` | Mark complete |

### Session Manager Integration: `src/services/session-manager.ts`

Changes made:
1. **Session start**: Calls `startConversation()` to create Firestore doc
2. **Each turn**: Calls `persistTurn()` in fire-and-forget mode (non-blocking)
3. **Session end**: Calls `endConversation()` and triggers async summarization
4. **Returning users**: Enriches profile with realtime data if legacy summary missing

### Background Summarization: `functions/summarization-scheduler.ts`

Cloud Functions added:

| Function | Trigger | Description |
|----------|---------|-------------|
| `summarizeConversations` | Every 5 minutes | Processes unsummarized conversations |
| `triggerSummarization` | HTTP | Manual trigger endpoint |
| `summarizeUserConversations` | HTTP | User-specific summarization |

### Firestore Schema

```
bogle_users/{userId}/
├── profile (existing - user profile document)
├── conversations/
│   └── {conversationId}/
│       ├── startedAt: Timestamp
│       ├── endedAt: Timestamp | null
│       ├── personaId: string
│       ├── turnCount: number
│       ├── summarized: boolean
│       ├── summary?: string
│       ├── summarizedAt?: Timestamp
│       └── turns/
│           └── {turnId}: {
│                 role: 'user' | 'assistant',
│                 content: string,
│                 timestamp: Timestamp,
│                 metadata?: {
│                   emotion?: string,
│                   topics?: string[],
│                   durationMs?: number
│                 }
│               }
```

### Firestore Indexes: `firestore.indexes.json`

Added:
```json
{
  "collectionGroup": "conversations",
  "queryScope": "COLLECTION",
  "fields": [{ "fieldPath": "startedAt", "order": "DESCENDING" }]
},
{
  "collectionGroup": "conversations",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "endedAt", "order": "ASCENDING" },
    { "fieldPath": "summarized", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "turns",
  "queryScope": "COLLECTION",
  "fields": [{ "fieldPath": "timestamp", "order": "ASCENDING" }]
}
```

### Types: `src/services/types.ts`

Added `realtimeConversationId?: string` to `SessionServices` interface.

---

## How It Works

### During a Call

1. User connects → `startConversation()` creates Firestore doc
2. User speaks → `addTurn()` is called
   - Local RAM tracking continues (for in-session operations)
   - `persistTurn()` fires in background → Turn saved to Firestore
3. Assistant responds → `addTurn()` called again
   - Same dual-path: RAM + Firestore
4. This repeats for every turn

### When Call Ends (Normal)

1. `endSession()` called
2. `endConversation()` marks Firestore doc with `endedAt`
3. `summarizeConversationAsync()` fires in background (non-blocking)
4. User profile also updated via legacy path

### When Call Ends (Crash/Disconnect)

1. Turns are already in Firestore!
2. Background Cloud Function (every 5 min) finds the conversation
3. Generates summary and updates user profile
4. Next time user calls, Ferni remembers

### For Returning Users

1. Session manager loads user profile
2. If `lastConversationSummary` is empty:
   - Calls `getLastConversationContext()` 
   - Builds summary from realtime turns
   - Enriches profile
3. Greeting system uses this context

---

## Deployment

1. **Deploy UI Server** (includes realtime-memory.ts):
   ```bash
   npm run deploy:ui
   ```

2. **Deploy Cloud Functions**:
   ```bash
   cd functions && npm run build && npm run deploy
   ```

3. **Deploy Firestore indexes**:
   ```bash
   firebase deploy --only firestore:indexes
   ```

---

## Verification

Check that realtime memory is working:

1. **Start a call** - Look for log: `🔴 REALTIME: Conversation started`
2. **During call** - Look for logs: `💾 Turn persisted to Firestore`
3. **End call** - Look for log: `🔴 REALTIME: Conversation ended`
4. **Check Firestore** - Navigate to:
   - `bogle_users/{userId}/conversations/` - Should see conversation docs
   - Each conversation should have a `turns/` subcollection

---

## Rollback Plan

The old system continues to work. The new persistence is additive:
- Old `historyTracker` still works for in-session operations
- Old `lastConversationSummary` field still updated
- New `conversations` subcollection is additional data

If issues arise, simply comment out the `persistTurn()` calls and the system reverts to legacy behavior.

---

## Success Criteria

✅ Every turn appears in Firestore within 1 second of being spoken
✅ Disconnects lose nothing - All turns are already saved
✅ Returning users get real context - Actual conversation snippets
✅ Summaries generated eventually - Background process catches up

**No more "I don't remember you" scenarios.**
