# Journaling Storage Architecture

> **Last Updated:** December 2024  
> **Status:** Implemented with minor debt

## Overview

Ferni's journaling system currently uses **three different storage approaches** depending on the context:

| Context | Storage | Location |
|---------|---------|----------|
| Digital Twin Journal | Custom Agent Memory API | `/api/custom-agents/:id/memories` (Firestore) |
| Productivity Notes | ProductivityStore | In-memory + Firestore (`productivity_data`) |
| Trust Systems | Growth Reflection | Firestore (`trust_profiles`) |

## Current Architecture

### 1. Digital Twin Journal (Primary)

Used by the Voice Journal UI for Digital Twin agents.

```
Frontend (voice-journal/*)
    ↓
API: POST /api/custom-agents/:agentId/memories
    ↓
Firestore: custom_agents/:id/memories/:memoryId
```

**Schema:**
```typescript
interface JournalEntryMemory {
  id: string;
  type: 'journalEntry';
  content: string;           // Full entry text (includes prompt + response)
  mood?: string;             // 'happy' | 'calm' | 'anxious' | etc.
  transcript?: string;       // Raw transcription (for voice entries)
  audioUrl?: string;         // URL to audio file (if stored)
  durationSeconds?: number;  // Recording duration
  createdAt: timestamp;
}
```

**Pros:**
- Agent-specific storage (each Twin has its own journal)
- Leverages existing memory system
- Searchable via embeddings (potential)

**Cons:**
- No cross-agent querying
- Limited metadata structure

### 2. ProductivityStore Notes

Used by Maya (Habits coach) for quick notes and productivity journal.

```
LLM Tool: saveNote / startJournal
    ↓
ProductivityStore (in-memory cache)
    ↓
Firestore: productivity_data/:userId
```

**Schema:**
```typescript
interface JournalEntry {
  id: string;
  userId: string;
  date: Date;
  gratitudes?: string[];
  highlight?: string;
  challenge?: string;
  learnings?: string;
  tomorrowIntention?: string;
  mood: number;              // 1-10 scale
  notes?: string;
  createdAt: Date;
}
```

**Pros:**
- Structured fields for habits/gratitude tracking
- Streak calculation built-in
- Good for productivity-focused journaling

**Cons:**
- User-scoped only (not agent-aware)
- Different schema from Twin journals
- No voice recording support

### 3. Trust Systems Growth Reflection

Used by the trust-building system to track journaling patterns.

```
recordJournalResponse()
    ↓
trackEvent() → Firestore: trust_analytics
recordEmotionalSnapshot() → Firestore: trust_profiles/:userId/emotional_snapshots
```

**Schema:**
```typescript
interface JournalResponseData {
  userId: string;
  promptId: string;
  response: string;
  emotionBeforeWriting?: string;
  emotionAfterWriting?: string;
}
```

**Pros:**
- Tracks emotional shifts
- Integrates with trust-building analytics
- Enables A/B testing of prompts

**Cons:**
- Doesn't store full entry content
- Separate from main storage

## Technical Debt

### Current Issues

1. **Fragmented Storage** - Three different places store journal-related data
2. **Schema Mismatch** - Digital Twin uses mood strings, ProductivityStore uses mood numbers
3. **Auto-Capture Disconnect** - `journal-capture.service.ts` saves to Twin memory, but ProductivityStore doesn't see it
4. **No Unified Query** - Can't get "all journal entries" across systems

### Recommended Consolidation (Future)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Journal Service                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ Voice Journal│   │ Productivity │   │  Auto-Capture    │    │
│  │     UI       │   │    Notes     │   │    Service       │    │
│  └──────┬───────┘   └──────┬───────┘   └────────┬─────────┘    │
│         │                  │                     │              │
│         └──────────────────┼─────────────────────┘              │
│                            ▼                                     │
│                ┌───────────────────────┐                        │
│                │   Journal Service     │                        │
│                │   (unified schema)    │                        │
│                └───────────┬───────────┘                        │
│                            ▼                                     │
│                ┌───────────────────────┐                        │
│                │      Firestore        │                        │
│                │  users/:id/journals   │                        │
│                └───────────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Unified Schema (Proposed):**
```typescript
interface UnifiedJournalEntry {
  id: string;
  userId: string;
  agentId?: string;          // Optional: which Twin/persona
  
  // Content
  content: string;
  transcript?: string;
  audioUrl?: string;
  durationSeconds?: number;
  
  // Context
  promptId?: string;
  promptText?: string;
  source: 'voice' | 'text' | 'auto-capture' | 'quick-note';
  momentType?: MomentType;   // For auto-capture
  
  // Emotions
  mood: string;              // Unified to string IDs
  moodScore?: number;        // 1-10 for analytics
  emotionBefore?: string;
  emotionAfter?: string;
  
  // Metadata
  createdAt: timestamp;
  updatedAt: timestamp;
  tags?: string[];
}
```

## Current File Locations

| File | Purpose |
|------|---------|
| `apps/web/src/ui/voice-journal/` | Frontend UI (modular) |
| `src/api/journal-routes.ts` | API endpoints |
| `src/services/trust-systems/journaling-prompts.ts` | Prompt generation |
| `src/services/journal-capture.service.ts` | Auto-capture |
| `src/tools/domains/productivity/notes.ts` | Maya's notes/journal tools |
| `src/services/stores/productivity-store.ts` | ProductivityStore |

## Decision Matrix

When adding new journal-related features, use this guide:

| Feature | Use Storage |
|---------|-------------|
| Digital Twin voice diary | Custom Agent Memory API |
| Quick notes from conversation | ProductivityStore |
| Automatic moment capture | Custom Agent Memory API (saves to twin) |
| Productivity/gratitude journal | ProductivityStore |
| Emotional tracking analytics | Trust Systems |

## Migration Path

1. **Phase 1 (Current):** Document existing architecture ✅
2. **Phase 2:** Create unified `JournalService` abstraction
3. **Phase 3:** Migrate ProductivityStore entries to unified schema
4. **Phase 4:** Add cross-storage query capabilities
5. **Phase 5:** Deprecate direct storage access, route all through service

---

*This document captures the current state of journaling storage as technical debt. The fragmentation is manageable but should be addressed as the feature grows.*

