---
title: 'The Latency Stack: How We Architect Voice AI for Sub-200ms Response'
excerpt: "Voice AI that feels human requires response times humans don't consciously notice. Here's how we architect for that constraint."
author: 'Seth Ford'
authorInitials: 'SF'
authorColor: '#4a6741'
date: 2026-01-14
category: 'Architecture'
readTime: 10
---

When we started building Ferni, we set an aggressive target: **sub-200ms time to first sound** after the user finishes speaking.

Why 200ms? Because research on conversational turn-taking suggests that's roughly the threshold where humans start consciously perceiving delay. Below it, conversation feels natural. Above it, something feels off.

Most voice AI doesn't hit this target. The typical stack adds latency at every layer—VAD waiting, audio streaming, transcription, LLM inference, TTS synthesis. Each step is optimized in isolation, but combined, they create delays that break conversational flow.

Here's how we're architecting around this constraint.

---

## The Latency Budget

Our architecture allocates a strict budget to each component:

| Component              | Target     | Notes                      |
| ---------------------- | ---------- | -------------------------- |
| Predictive endpointing | -100ms     | Starts before speech ends  |
| Audio streaming        | 30ms       | Regional servers           |
| Speech-to-text         | 50ms       | Streaming ASR              |
| Context retrieval      | 10ms       | Pre-warmed cache           |
| LLM first token        | 80ms       | Optimized inference        |
| TTS first audio        | 40ms       | Streaming synthesis        |
| **Net to first sound** | **~110ms** | After predicted speech end |

The key insight: many components run in parallel, and prediction lets us start work before the user finishes speaking.

---

## Pattern 1: Temporal Decoupling

The biggest architectural pattern we use is **temporal decoupling**—separating fast-path operations from slow-path enrichment.

Our memory system (`src/memory/dynamic/`) demonstrates this:

```
User Speech
    │
    ▼
┌──────────────────────┐
│   Fast Capture       │  < 50ms (inline)
│   • Regex patterns   │
│   • Entity mentions  │
│   • Emotion signals  │
└────────┬─────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────────────────┐
│  STM   │  │  Deep Extraction   │  Background (1-3s)
│ Buffer │  │  Worker            │
│  (L1)  │  │  • LLM analysis    │
└────────┘  │  • Relationship    │
            │    extraction      │
            └────────────────────┘
```

Fast capture runs inline at < 50ms using regex patterns. It extracts entity mentions, emotion signals, topic hints—anything we can detect without LLM inference.

Deep extraction runs asynchronously. It uses Gemini 1.5 Flash to do sophisticated analysis—understanding implicit relationships, detecting subtle emotional states, generating follow-up questions. But it doesn't block the response path.

The user gets a fast response. The context gets richer over time.

---

## Pattern 2: Three-Tier Memory

Memory access is a critical latency path. If the AI needs to remember who "Mom" is before responding, that lookup needs to be instant.

We use a three-tier architecture:

| Layer             | Storage   | Latency   | Purpose                   |
| ----------------- | --------- | --------- | ------------------------- |
| **L1: STM**       | In-memory | < 1ms     | Current session context   |
| **L2: Working**   | Firestore | 50-150ms  | Recent entities and facts |
| **L3: Long-Term** | Spanner   | 100-200ms | Relationship graph        |

The key is **proactive promotion**. When we predict the user will reference something, we pre-load it into L1 before they ask.

The STM buffer (`src/memory/dynamic/stm-buffer.ts`) is a 20-turn FIFO that holds:

- Recent entity mentions with frequency counts
- Emotional trajectory of the conversation
- Topic patterns and transitions
- Relationship signals detected in speech

Session-end promotion (`src/memory/dynamic/stm-promotion.ts`) moves frequently-mentioned entities and emotional arcs to Firestore for future sessions.

---

## Pattern 3: Streaming Everything

Batching is the enemy of perceived latency.

Traditional flow:

```
Collect all audio → Transcribe → Send to LLM →
Collect all tokens → Synthesize → Send audio
```

Our flow:

```
Audio chunks → Partial transcripts → Token stream → Audio chunks
```

With streaming, the user hears the beginning of the response while we're still generating the end. The first sound arrives fast; the complete response takes longer. But the conversation never pauses.

The architecture uses `AsyncEvents.emit` for fire-and-forget operations. When fast capture completes, it emits events that the deep extraction worker consumes without blocking.

---

## Pattern 4: Context Pre-warming

The best latency optimization is doing work before it's needed.

When a user connects:

1. We load their profile from L2/L3 memory
2. We warm up model weights with their typical patterns
3. We establish TTS connections to their preferred voice
4. We pre-load recently-discussed entities into L1

When they start speaking:

1. We run intent classifiers on partial transcripts
2. We retrieve likely-relevant context
3. We prepare response templates for common patterns

By the time the user finishes a sentence, we've often already begun generating the response.

---

## The Memory Pressure System

Fast systems need memory management. Our `SessionDataManager` (`src/services/session-data-manager.ts`) coordinates all session-scoped caches:

| Level | Threshold | Action                       |
| ----- | --------- | ---------------------------- |
| 0     | < 70%     | No action                    |
| 1     | 70-80%    | Evict oldest 10% of sessions |
| 2     | 80-90%    | Evict 25% + force GC         |
| 3     | 90-95%    | Evict 50% + clear caches     |
| 4     | > 95%     | EMERGENCY - Clear everything |

Every service that caches user data registers with SessionDataManager. When sessions end, all caches are cleared coordinately. When memory pressure rises, eviction happens automatically.

This matters for latency because memory pressure causes GC pauses. Keeping memory under control keeps response times consistent.

---

## What We're Still Solving

We don't have all the answers. Some latency challenges remain:

**Predictive endpointing accuracy**: We're using prosodic and syntactic cues to predict when users will finish speaking. But accuracy varies across speaking styles, accents, and contexts. False positives (thinking they're done when they're not) are worse than false negatives.

**LLM inference variance**: Even with optimized serving, LLM response times vary. Sometimes we get first token in 50ms; sometimes it takes 200ms. Managing this variance is an ongoing challenge.

**Context relevance**: Pre-loading context requires predicting what will be relevant. Sometimes we load the wrong things. Sometimes the right context isn't loaded yet when we need it.

These are active areas of work, not solved problems.

---

## Implications for Developers

If you're building on the Ferni platform:

**Memory is automatic**: You don't build caching infrastructure. The three-tier system handles it.

**Streaming is default**: Responses stream to users automatically. You don't need to implement this.

**Pre-warming happens**: When users connect, context is already loading.

What you focus on: defining what your AI knows and how it helps. The latency infrastructure is our problem.

---

## Further Reading

For those building their own voice AI systems:

- `src/memory/dynamic/CLAUDE.md` — Detailed documentation of our memory architecture
- `docs/architecture/MEMORY-MANAGEMENT.md` — Session data management patterns
- `src/services/session-data-manager.ts` — Implementation of coordinated cache management

The code is the best documentation of our actual approach.

---

_Seth Ford is Ferni's AI babysitter. Follow [@ferni_ai](https://twitter.com/ferni_ai) for more on the future of conversational AI._
