# Dynamic Memory Module

> **State-of-the-art LLM-powered memory extraction (January 2026)**

## Overview

This module implements the **temporal decoupling** pattern from PMFR (Prepared Mind, Fast Response), combining fast regex-based capture with async LLM-powered deep extraction.

## Architecture

```
User Speech
    │
    ▼
┌──────────────────────┐
│   Fast Capture       │  < 50ms (inline)
│   (fast-capture.ts)  │
│                      │
│   • Regex patterns   │
│   • Entity mentions  │
│   • Emotion signals  │
│   • Topic hints      │
│   • Date signals     │
└────────┬─────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────────────────┐
│  STM   │  │  AsyncEvents.emit  │
│ Buffer │  │  (fire & forget)   │
│  (L1)  │  └────────┬───────────┘
└────────┘           │
                     ▼
           ┌──────────────────────┐
           │  Deep Extraction     │  Background (1-3s)
           │  Worker              │
           │                      │
           │  • LLM entities      │
           │  • LLM facts         │
           │  • LLM relationships │
           │  • Self-questioning  │
           └──────────┬───────────┘
                      │
                      ▼
           ┌──────────────────────┐
           │  Firestore (L2)      │
           │                      │
           │  • dynamic_entities  │
           │  • dynamic_facts     │
           │  • dynamic_relations │
           └──────────┬───────────┘
                      │
                      ▼ (Background sync, every 6h)
           ┌──────────────────────┐
           │  Spanner Graph (L3)  │
           │                      │
           │  • entities table    │
           │  • facts table       │
           │  • relationships     │
           └──────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `fast-capture.ts` | L2: Real-time regex extraction (< 50ms) |
| `deep-extraction-worker.ts` | L3: Async LLM-powered extraction (Gemini 1.5 Flash) |
| `stm-buffer.ts` | L1: In-memory short-term session context (20-turn FIFO) |
| `stm-promotion.ts` | L1→L2: Session-end promotion to Firestore |
| `firestore-spanner-sync.ts` | L2→L3: Background sync to Spanner Graph |
| `async-events-config.ts` | Configuration for async event emission between capture stages |
| `memory-continuity.ts` | Cross-session memory continuity (reconnect context) |
| `voice-context-capture.ts` | Voice-specific capture (tone, pace, emotion from audio signals) |
| `metrics.ts` | Observability metrics (capture latency, queue depth, extraction timing) |
| `index.ts` | Module exports |

## Three-Layer Memory Architecture

| Layer | Storage | Latency | TTL | Purpose |
|-------|---------|---------|-----|---------|
| **L1: STM** | In-memory | < 1ms | Session | Current conversation context, entity frequency |
| **L2: Working** | Firestore | 50-150ms | 7-30 days | Recent entities, facts, emotional arcs |
| **L3: Long-Term** | Spanner | 100-200ms | Forever | Relationship traversal, cross-session patterns |

## Usage

### Fast Capture (Inline)

```typescript
import { fastCapture } from './memory/dynamic/index.js';

// In turn processor - runs inline, < 50ms
const result = await fastCapture({
  userId,
  sessionId,
  turnNumber,
  transcript: userText,
  voiceEmotion: detectedEmotion,
  personaId: 'ferni',
});

// Result includes:
// - mentionedEntities: EntityMention[]
// - emotionSignals: EmotionSignal[]
// - topicHints: string[]
// - dateSignals: DateSignal[]
// - relationshipSignals: RelationshipSignal[]
// - asyncJobId: string | null (for background processing)
```

### STM Buffer (Session Context)

```typescript
import { recordTurn, wasEntityMentioned, buildSTMContext } from './memory/dynamic/index.js';

// Record turn to STM after fast capture
recordTurn(sessionId, userId, fastCaptureResult, transcript, turnNumber);

// Query STM for context
const entityMentioned = wasEntityMentioned(sessionId, 'mom');
const stmContext = buildSTMContext(sessionId); // For LLM context injection
```

### Deep Extraction (Background Worker)

```typescript
import { startDeepExtractionWorker } from './memory/dynamic/index.js';

// Start worker at server startup (done in gce-voice-worker.ts)
startDeepExtractionWorker();

// Worker automatically processes jobs queued by fastCapture
// Extracts: entities, facts, relationships using Gemini 1.5 Flash
// Persists to Firestore: dynamic_entities, dynamic_facts, dynamic_relationships
```

### STM Promotion (Session End)

```typescript
import { onSessionEnd } from './memory/dynamic/index.js';

// Called automatically from end-session.ts
await onSessionEnd(sessionId, userId);

// Promotes to Firestore:
// - promoted_entities (frequently mentioned)
// - emotional_arcs (emotional trajectory)
// - topic_patterns (topic history)
```

### Firestore-Spanner Sync (Background)

```typescript
import { startSyncService, getSyncStats } from './memory/dynamic/index.js';

// Started at server startup (done in gce-voice-worker.ts)
startSyncService(); // Runs every 6 hours

// Check stats
const stats = getSyncStats();
console.log(stats.totalEntitiesSynced, stats.totalSyncRuns);
```

## Patterns Implemented

### 1. PMFR (Temporal Decoupling)

Fast path handles immediate context needs, async path does deep analysis.

### 2. Mem0 (Entity + Relationship Extraction)

LLM extracts entities, facts, and relationships into a graph structure.

### 3. ProMem (Self-Questioning Refinement)

After initial extraction, the worker asks:
- "What entities might have been missed?"
- "What implicit facts are there?"
- "What relationships are implied?"
- "Does anything contradict known info?"

### 4. HiMem (Hierarchical Memory)

Three-tier storage with automatic promotion:
- L1 (STM) → L2 (Firestore) at session end
- L2 (Firestore) → L3 (Spanner) via background sync

## Firestore Collections

| Collection | Content |
|------------|---------|
| `dynamic_entities` | LLM-extracted entities (from deep extraction) |
| `dynamic_facts` | LLM-extracted facts |
| `dynamic_relationships` | LLM-extracted relationships |
| `extraction_history` | Metadata about extractions |
| `promoted_entities` | Frequently mentioned entities (from STM) |
| `emotional_arcs` | Session emotional trajectories |
| `topic_patterns` | Session topic histories |

## Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Fast capture latency | < 50ms | ~5-15ms |
| STM lookup | < 1ms | ~0ms |
| Deep extraction time | < 5s | ~1-3s |
| Full conversation (10 turns) | < 1s | ~10-20ms |
| Queue depth | < 100 | Varies |

## Test Coverage

| Suite | Tests |
|-------|-------|
| Unit: fast-capture.test.ts | 22 |
| Unit: stm-buffer.test.ts | 13 |
| E2E: dynamic-memory-e2e.test.ts | 76 |
| **Total** | **111** |

## Integration Points

| Component | How It Uses Dynamic Memory |
|-----------|---------------------------|
| `turn-handler.ts` | Calls `fastCapture()` on each turn |
| `transcript-handler.ts` | Calls `fastCapture()` for early extraction |
| `turn-processor.ts` | Calls `fastCapture()` with emotional context |
| `end-session.ts` | Calls `onSessionEnd()` to promote STM |
| `gce-voice-worker.ts` | Starts deep extraction worker and sync service |
| `dynamic-memory-context.ts` | Context builder that retrieves from Firestore |

## Legacy Code Status

The 33 static capture definitions have been **removed** and replaced by this dynamic system:
- Files moved to `_deprecated/` then deleted
- Legacy tests deleted
- Exports deprecated with warnings

## Spanner Graph Notes

Spanner tables are created but full property graph queries require Enterprise Edition:
- Relational queries work fine
- Graph traversal available via GQL (Enterprise only)
- Graceful degradation: falls back to relational queries

See `../spanner-graph/CLAUDE.md` for more details.
