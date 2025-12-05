# Persistence Architecture

This document describes how Ferni AI persists user data and intelligence state across sessions.

## Overview

The persistence system ensures that everything the AI learns about a user is saved and restored when they return. This includes:

- **Emotional memories** - What emotions the user has shared and their context
- **Conversation patterns** - When they prefer to talk, how long, their style
- **Response preferences** - What types of responses they engage with
- **Open threads** - Unfinished conversations to resume
- **Promised follow-ups** - Commitments made to check in later
- **Voice pace preferences** - How fast/slow they speak
- **Humor calibration** - What types of humor work for them
- **Story preferences** - What types of stories they engage with

## Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────────┐
│                    Intelligence Engines                      │
│  (In-Memory during session - fast real-time processing)      │
│                                                              │
│  • HumorCalibration    • StoryPreference                    │
│  • EmotionalMemory     • VoicePaceAdapter                   │
│  • ResponseQualityTracker  • ConversationPatternAnalyzer    │
│  • CommunicationMirroring  • CrossSessionThreader           │
└─────────────────────────────────────────────────────────────┘
                              │
                    Intelligence Persistence
                    (Export/Import/Auto-save)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      User Profile                            │
│     (Persistent storage - survives restarts)                 │
│                                                              │
│  • profile.customData.intelligenceState                     │
│  • profile.voicePace                                         │
│  • profile.responseQuality                                   │
│  • profile.conversationPatterns                              │
│  • profile.openThreads                                       │
│  • profile.promisedFollowUps                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                    Memory Store
                   (Firestore/Postgres/Memory)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Google Cloud Firestore                    │
│              (Production persistent storage)                 │
│                                                              │
│  • /users/{userId} - User profiles                          │
│  • /users/{userId}/summaries - Conversation summaries       │
│  • /users/{userId}/key_moments - Notable moments            │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Intelligence Persistence (`src/services/intelligence-persistence.ts`)

This module handles the export/import of all intelligence engine state:

```typescript
// Export all intelligence state for a user
exportIntelligenceState(userId: string): IntelligenceState

// Import intelligence state from stored data
importIntelligenceState(userId: string, state: IntelligenceState): void

// Apply intelligence to profile before saving
applyIntelligenceToProfile(profile: UserProfile, userId: string): UserProfile

// Load intelligence from profile on session start
loadIntelligenceFromProfile(userId: string, profile: UserProfile): void
```

#### 2. Auto-Save System

Prevents data loss if a session crashes:

```typescript
// Start auto-save (30 second interval by default)
startAutoSave(userId, saveCallback, { autoSaveIntervalMs: 30000 })

// Stop auto-save when session ends
stopAutoSave(userId)
```

#### 3. Startup Validation (`src/services/startup-validation.ts`)

Validates configuration at startup to prevent silent data loss:

```typescript
// Validate and get capabilities
const capabilities = validateAndLog({
  requirePersistentMemory: process.env.NODE_ENV === 'production',
  requireSemanticSearch: process.env.NODE_ENV === 'production',
})

// Capabilities returned:
{
  persistentMemory: boolean,   // true if using Firestore/Postgres
  semanticSearch: boolean,     // true if embeddings API available
  storeType: 'firestore' | 'postgres' | 'memory',
  embeddingProvider: 'google' | 'openai' | 'local'
}
```

## Session Lifecycle

### 1. Session Start

```typescript
// In session-manager.ts
if (isReturningUser) {
  loadIntelligenceFromProfile(userId, userProfile);
  // Emotional memories, open threads, etc. are restored
}

// Start auto-save
startAutoSave(userId, autoSaveCallback, { autoSaveIntervalMs: 30000 });
```

### 2. During Session

Intelligence engines collect data in memory:
- User emotions are tracked
- Response quality is measured
- Voice pace is calibrated
- Threads and follow-ups are updated

Every 30 seconds, auto-save persists current state to prevent data loss.

### 3. Session End

```typescript
// Apply all intelligence to profile
updatedProfile = applyIntelligenceToProfile(profile, userId);

// Save to persistent store
await store.saveProfile(updatedProfile);

// Stop auto-save
stopAutoSave(userId);

// Cleanup in-memory engines
cleanupIntelligenceEngines(userId);
```

## Environment Configuration

### Required for Production

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLOUD_PROJECT` | Firestore project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account key |
| `GOOGLE_API_KEY` or `OPENAI_API_KEY` | Embeddings for semantic search |
| `LIVEKIT_URL` | Voice connection URL |
| `LIVEKIT_API_KEY` | LiveKit authentication |
| `LIVEKIT_API_SECRET` | LiveKit authentication |

### Auto-Detection

The system auto-detects the appropriate store:

1. If `GOOGLE_CLOUD_PROJECT` is set → Firestore
2. If `DATABASE_URL` is set → PostgreSQL
3. Otherwise → In-Memory (⚠️ data lost on restart)

You can override with `MEMORY_STORE_TYPE=firestore|postgres|memory`.

## Warnings

### ⚠️ In-Memory Store Warning

If using in-memory storage, you'll see:

```
⚠️ WARNING: MEMORY IS NOT PERSISTENT!
⚠️ User data will be LOST on restart.
```

This is acceptable for development but **never for production**.

### ⚠️ Semantic Search Disabled Warning

If no embedding API key is configured:

```
⚠️ WARNING: SEMANTIC SEARCH DISABLED!
⚠️ RAG and memory retrieval will not work.
```

The AI will still work but won't be able to recall past conversations semantically.

## Firestore Transaction Safety

For production reliability, use atomic profile updates:

```typescript
// In firestore-store.ts
await store.atomicProfileUpdate(userId, (profile) => {
  // Modify profile
  return updatedProfile;
}, { createIfMissing: true, maxRetries: 3 });
```

This prevents race conditions when multiple processes update the same profile.

## Debugging Persistence

### Check Current Capabilities

```typescript
import { getCapabilitySummary } from './services/startup-validation.js';
console.log(getCapabilitySummary());
```

### Check Auto-Save Status

```typescript
import { getAutoSaveStatus } from './services/intelligence-persistence.js';
const status = getAutoSaveStatus();
for (const [userId, { lastSave }] of status) {
  console.log(`User ${userId}: last saved at ${lastSave}`);
}
```

### Verify Intelligence State

```typescript
import { exportIntelligenceState } from './services/intelligence-persistence.js';
const state = exportIntelligenceState(userId);
console.log(JSON.stringify(state, null, 2));
```

## Testing

The persistence system has comprehensive tests:

```bash
# Run persistence tests
npm test -- --run src/tests/intelligence-persistence.test.ts
npm test -- --run src/tests/startup-validation.test.ts
npm test -- --run src/tests/memory-persistence-e2e.test.ts
```

These tests cover:
- Export/import round-trips
- Auto-save functionality
- Profile integration
- Startup validation
- E2E persistence lifecycle

