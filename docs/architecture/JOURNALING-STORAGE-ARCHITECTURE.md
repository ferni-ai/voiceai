# Journaling Storage Architecture

> **Last Updated:** December 2024  
> **Status:** Unified architecture implemented ✅

## Overview

Ferni's journaling system now has a **unified abstraction layer** that provides consistent access across multiple storage backends:

| Context | Storage | Abstraction |
|---------|---------|-------------|
| Digital Twin Journal | Firestore (`custom_agents/:id/memories`) | `JournalService.getAllEntries()` |
| Productivity Notes | ProductivityStore | `JournalService.getAllEntries()` |
| Auto-Captured Moments | Firestore (via JournalService) | `JournalService.createEntry()` |
| Trust Systems | Growth Reflection | Trust analytics integration |

## New: Unified Journal Service

**Location:** `src/services/journal/index.ts`

The JournalService provides:
- Cross-source querying (all entries from all storage systems)
- Consistent mood format conversion
- Unified schema for all entry types
- Export functionality (JSON, Markdown)
- Statistics and analytics

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/journal/entries` | GET | Get all entries (with filtering) |
| `/api/journal/capture` | POST | Save auto-captured moment |
| `/api/journal/stats` | GET | Get journal statistics |
| `/api/journal/search` | GET | Search entries by content |
| `/api/journal/aggregated` | GET | Get entries from all Digital Twins |
| `/api/journal/export` | GET | Export to JSON or Markdown |
| `/api/journal/prompt` | POST | Get personalized prompt |
| `/api/journal/prompts` | POST | Get multiple prompts |
| `/api/journal/transcribe` | POST | Transcribe audio |

### Mood Conversion

**Location:** `src/services/journal/mood-conversion.ts`

Handles conversion between storage formats:
- Digital Twin: string IDs (`'happy'`, `'anxious'`)
- ProductivityStore: numeric scores (`1-10`)
- Unified output: both ID and score

```typescript
import { normalizeMood, moodIdToScore, scoreToMoodId } from '@/services/journal';

normalizeMood('happy')     // { id: 'happy', score: 8 }
normalizeMood(8)           // { id: 'happy', score: 8 }
normalizeMood({ mood: 'anxious', moodScore: 3 }) // { id: 'anxious', score: 3 }
```

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

## Migration Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Document architecture | ✅ Done | This document |
| Phase 2: Create JournalService | ✅ Done | `src/services/journal/index.ts` |
| Phase 3: Mood conversion utilities | ✅ Done | `src/services/journal/mood-conversion.ts` |
| Phase 4: Cross-storage queries | ✅ Done | `getAllEntries()`, `/api/journal/aggregated` |
| Phase 5: Export functionality | ✅ Done | `/api/journal/export` (JSON, Markdown) |
| Phase 6: Auto-capture integration | ✅ Done | `/api/journal/capture` endpoint |

### Remaining Work

- [ ] Migrate direct ProductivityStore calls to JournalService
- [ ] Add real-time sync via WebSocket
- [ ] Implement journal entry deletion
- [ ] Add embedding-based semantic search

## Testing

```bash
# Journal capture service tests
pnpm vitest run apps/web/tests/services/journal-capture.service.test.ts

# Mood conversion tests  
pnpm vitest run src/tests/mood-conversion.test.ts

# Journaling prompts tests
pnpm vitest run src/tests/journaling.test.ts
```

## File Locations (Updated)

| File | Purpose |
|------|---------|
| **`src/services/journal/index.ts`** | **Unified JournalService (new)** |
| **`src/services/journal/mood-conversion.ts`** | **Mood format conversion (new)** |
| `apps/web/src/ui/voice-journal/` | Frontend UI (modular) |
| `apps/web/src/services/journal-capture.service.ts` | Frontend auto-capture |
| `src/api/journal-routes.ts` | API endpoints (expanded) |
| `src/services/trust-systems/journaling-prompts.ts` | Prompt generation |
| `src/tools/domains/productivity/notes.ts` | Maya's notes/journal tools |
| `src/services/stores/productivity-store.ts` | ProductivityStore |

---

*Updated December 2024 with unified JournalService implementation.*

