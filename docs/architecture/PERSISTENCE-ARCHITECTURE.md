# Ferni AI - Persistence Architecture

This document describes how Ferni AI persists user learning, intelligence state, and session data to enable human-level conversational continuity across sessions.

## Overview

The persistence system ensures that everything Ferni learns about a user is saved and restored across sessions:

- **User Profile** - Core user data, preferences, and identified traits
- **Intelligence State** - Learned patterns from 8+ specialized intelligence engines
- **Conversation History** - Summaries, key moments, and emotional memories
- **Cross-Session Threads** - Open topics and promised follow-ups

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     Session Manager                              │
│         (creates sessions, orchestrates save/load)               │
├─────────────────────────────────────────────────────────────────┤
│                Intelligence Persistence                          │
│    (unified export/import for all intelligence engines)          │
├─────────────────────────────────────────────────────────────────┤
│                   Memory Store                                   │
│    (MemoryStore interface: InMemory, Firestore, PostgreSQL)      │
├─────────────────────────────────────────────────────────────────┤
│              Persistence Metrics                                 │
│    (observability: timing, success rates, active sessions)       │
└─────────────────────────────────────────────────────────────────┘
```

## Intelligence Engines

The following engines learn from user interactions and persist their state:

| Engine | What It Learns | Persistence Key |
|--------|---------------|-----------------|
| **Humor Calibration** | What makes the user laugh, humor style preferences | `intelligenceState.humor` |
| **Story Preference** | Preferred story types, length, themes | `intelligenceState.stories` |
| **Communication Mirroring** | Formality, energy level, vocabulary | `intelligenceState.communication` |
| **Emotional Memory** | Key emotional moments, unresolved issues | `intelligenceState.emotional` |
| **Voice Pace Adapter** | Speaking speed preferences | `intelligenceState.voicePace` |
| **Response Quality Tracker** | What response styles work best | `intelligenceState.responseQuality` |
| **Conversation Pattern Analyzer** | Session patterns, topic sequences | `intelligenceState.patterns` |
| **Cross-Session Threader** | Open threads, promised follow-ups | `intelligenceState.threads` |

## Key Files

| File | Purpose |
|------|---------|
| `src/services/intelligence-persistence.ts` | Unified export/import for all intelligence engines |
| `src/services/session-manager.ts` | Session lifecycle, auto-save orchestration |
| `src/services/startup-validation.ts` | Validates persistence configuration at startup |
| `src/services/persistence-metrics.ts` | Observability and monitoring |
| `src/memory/firestore-store.ts` | Google Firestore implementation |
| `src/memory/in-memory-store.ts` | Development/testing store |

## Session Lifecycle

### 1. Session Start

```typescript
// In session-manager.ts
const services = await createSessionServices({
  sessionId: 'session-123',
  userId: 'user-abc',
  personaId: 'ferni',
});
```

What happens:
1. Load user profile from store
2. Import intelligence state from profile via `loadIntelligenceFromProfile()`
3. Initialize all intelligence engines with persisted data
4. Start auto-save timer (30-second interval)
5. Record session start in metrics

### 2. During Session

- Intelligence engines observe user behavior
- Auto-save fires every 30 seconds, exporting current intelligence state
- Metrics track auto-save success/failure

### 3. Session End

```typescript
await services.endSession();
```

What happens:
1. Generate conversation summary
2. Finalize learning engine data
3. Export ALL intelligence state via `applyIntelligenceToProfile()`
4. Save emotional moments, cross-session threads
5. Stop auto-save timer
6. Cleanup engine instances
7. Record session end in metrics

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | For Firestore | GCP project ID for persistent storage |
| `DATABASE_URL` | For PostgreSQL | Connection string for PostgreSQL storage |
| `GOOGLE_API_KEY` | Yes | For embeddings (semantic search) |
| `LIVEKIT_*` | Yes | LiveKit connection (voice) |

### Store Types

```
GOOGLE_CLOUD_PROJECT set  →  Firestore (production)
DATABASE_URL set          →  PostgreSQL (self-hosted)
Neither set               →  In-Memory (development/testing)
```

### Startup Validation

The system validates configuration at startup:

```typescript
import { validateAndLog } from './services/startup-validation.js';

// In global-services.ts initialization
const capabilities = await validateAndLog({
  store,
  vectorStore,
  isProduction: process.env.NODE_ENV === 'production',
});
```

Warnings are logged for:
- In-memory store in production (data won't persist)
- Missing embedding provider (no semantic search)
- Missing LLM API keys

## Auto-Save Mechanism

Auto-save prevents data loss from crashes or unexpected disconnections:

```typescript
// Starts automatically when session is created
startAutoSave(userId, async (uid) => {
  const updatedProfile = applyIntelligenceToProfile(userProfile, uid);
  await store.saveProfile(updatedProfile);
}, { autoSaveIntervalMs: 30000 });

// Stops when session ends
stopAutoSave(userId);
```

## Metrics & Monitoring

The `persistence-metrics.ts` module tracks:

### Profile Operations
- Load/save counts and durations
- Error rates

### Intelligence Operations
- Export/import counts per user
- Engine counts per operation

### Session Operations
- Active sessions
- Auto-save frequency and success rate

### Handoff Operations
- Cross-agent handoffs
- Context transfer timing

### Get Metrics Snapshot

```typescript
import { persistenceMetrics } from './services/persistence-metrics.js';

// Get full snapshot
const snapshot = persistenceMetrics.getSnapshot();

// Get summary for logging
const summary = persistenceMetrics.getSummaryReport();
persistenceMetrics.logSummary();
```

## Data Flow Example

```
User says: "I hate long explanations"
         ↓
CommunicationMirroring engine observes this
         ↓
Records preference for brevity
         ↓
[30 seconds later]
         ↓
Auto-save triggers
         ↓
exportIntelligenceState() collects all engine data
         ↓
applyIntelligenceToProfile() merges into profile
         ↓
store.saveProfile() persists to Firestore
         ↓
[Next session]
         ↓
loadIntelligenceFromProfile() restores state
         ↓
importIntelligenceState() initializes engines
         ↓
Ferni remembers user prefers brief responses
```

## Troubleshooting

### Data Not Persisting

1. Check startup logs for warnings:
   ```
   ⚠️ WARNING: MEMORY IS NOT PERSISTENT!
   ```

2. Verify environment variables:
   ```bash
   echo $GOOGLE_CLOUD_PROJECT
   ```

3. Check metrics for errors:
   ```typescript
   const snapshot = persistenceMetrics.getSnapshot();
   console.log('Save errors:', snapshot.profileSaves.errors);
   console.log('Last error:', snapshot.profileSaves.lastError);
   ```

### Intelligence Not Loading

1. Check profile has intelligence state:
   ```typescript
   const profile = await store.getProfile(userId);
   console.log('Has intelligence:', !!profile?.intelligenceState);
   ```

2. Check import logs for errors

### Auto-Save Not Running

1. Verify session was created with valid userId:
   ```typescript
   const status = getAutoSaveStatus();
   console.log('Active auto-saves:', status);
   ```

## Testing

Run persistence tests:
```bash
# Unit tests
npm run test src/tests/intelligence-persistence.test.ts
npm run test src/tests/persistence-metrics.test.ts

# E2E tests
npm run test src/tests/memory-persistence-e2e.test.ts
```

## Best Practices

1. **Always use validated userIds** - The session manager validates format before persistence operations

2. **Don't skip endSession()** - Ensures final intelligence state is persisted

3. **Monitor metrics in production** - Set up alerts for high error rates

4. **Use atomic operations for critical updates** - Firestore store provides `atomicProfileUpdate()`

5. **Test with realistic data** - E2E tests simulate real conversation patterns

## Future Enhancements

- [ ] Redis caching layer for frequently accessed profiles
- [ ] Batch profile updates for high-traffic scenarios
- [ ] Cross-device sync for user profile
- [ ] Data export/import for GDPR compliance
- [ ] Automatic profile migration for schema changes
