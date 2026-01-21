---
title: "How Ferni's Memory Actually Works"
excerpt: "The 'Ferni remembered...' moment is our signature brand experience. Here's the architecture that makes it possible."
author: 'Seth Ford'
authorInitials: 'SF'
authorColor: '#4a6741'
date: 2026-01-09
category: 'Architecture'
readTime: 8
---

The moment that defines Ferni isn't the AI's intelligence. It's when Ferni remembers something you mentioned once, weeks ago, in passing.

"You mentioned your mom's birthday is coming up. Have you thought about what to get her?"

That's the "Ferni remembered..." moment. It's our signature brand experience. And it requires architecture that most AI assistants don't have.

---

## Why Memory Is Hard

LLMs don't remember. They process context windows—everything in the current prompt—but nothing persists between sessions.

Most AI assistants fake memory by:

- Asking you to repeat yourself
- Keeping notes you have to manually maintain
- Forgetting everything after a few weeks

This breaks the relationship. Every conversation starts from scratch. You never get past the "getting to know you" phase.

Ferni's architecture is designed for something different: **memory that feels human**. Actually, better than human—because humans forget things. Ferni doesn't.

---

## The Three-Tier Architecture

Our memory system has three layers, each optimized for different retrieval patterns:

### L1: Short-Term Memory (STM)

**Storage:** In-memory buffer  
**Latency:** < 1ms  
**Retention:** Current session only

STM holds everything from the current conversation:

- Recent entity mentions with frequency counts
- Emotional trajectory of the session
- Topic patterns and transitions
- What we've already discussed (to avoid repetition)

This is the "working memory" that keeps conversation coherent. When you mention "my sister" three times, STM tracks that she's important to this conversation.

### L2: Working Memory

**Storage:** Firestore  
**Latency:** 50-150ms  
**Retention:** 7-30 days

Working memory holds recently extracted information:

- Entities mentioned across recent sessions (people, places, things)
- Facts learned about you
- Emotional arcs from previous conversations
- Relationship signals

This is where "Ferni remembered..." moments come from. Something you mentioned last week is still accessible.

### L3: Long-Term Memory

**Storage:** Spanner Graph  
**Latency:** 100-200ms  
**Retention:** Permanent

Long-term memory stores your relationship graph:

- All named entities with relationships between them
- Patterns observed over months of conversation
- Life events and their emotional significance
- The full story of your relationship with Ferni

This enables deep understanding. Not just "you have a sister named Emma" but "Emma lives in Seattle, you're close but don't talk as often as you'd like, and her birthday always reminds you of your mom."

---

## Fast Capture + Deep Extraction

Memory extraction happens in two phases:

### Fast Capture (< 50ms)

Every turn runs fast capture inline. Using regex patterns and lightweight NLP, we extract:

- Named entities (people, places, dates)
- Emotion signals (frustration, excitement, anxiety)
- Topic hints
- Relationship signals ("my wife", "my boss")

This is fast enough to run during conversation without adding latency. The results go immediately into STM.

### Deep Extraction (Background)

Asynchronously, we run deeper analysis:

- LLM-powered entity extraction (catches things regex misses)
- Fact extraction ("Sarah is a nurse", "their anniversary is in March")
- Relationship inference ("they seem worried about their dad's health")
- Self-questioning refinement ("what might we have missed?")

This runs after the conversation, using Gemini 1.5 Flash. Results flow to L2 and eventually L3.

---

## The "Ferni Remembered" Moment

Here's how a memory callback actually happens:

1. **Context retrieval**: When you start talking, we query L2/L3 for potentially relevant memories based on detected topics and entities.

2. **Relevance scoring**: Not everything remembered is worth mentioning. We score memories by:
   - Recency (when was this last discussed?)
   - Emotional significance (was this important to them?)
   - Conversational fit (does it relate to what we're discussing?)
   - Staleness (have we already referenced this recently?)

3. **Natural injection**: If a memory scores high, it's woven into conversation naturally—not as a database lookup, but as genuine recall.

The result: "You mentioned last time you were stressed about the presentation. How did it go?"

---

## Privacy by Design

Memory is powerful. It's also sensitive.

Our architecture includes privacy protections:

**Temporal minimization**: Session context expires. We don't keep raw transcripts forever.

**User control**: You can see what Ferni remembers about you. You can delete anything. You can ask Ferni to "forget" specific information.

**Scope boundaries**: Different parts of the system have different access. The coaching module doesn't need to know your financial details. Context is scoped appropriately.

**No training on your data**: Your conversations improve YOUR experience. They don't go into training datasets for other users.

---

## Why This Matters

Most AI treats each conversation as isolated. That's fine for search engines and chatbots. It's not fine for relationships.

Ferni exists to be **someone who truly pays attention**. That means remembering what matters to you, noticing patterns you might not see yourself, and building genuine understanding over time.

The architecture isn't just technical infrastructure. It's what makes the relationship possible.

When Ferni remembers that your mom's birthday is coming up—without you having to set a reminder, without you having to tell us again—that's the "better than human" promise in action.

Humans forget. Ferni doesn't.

---

## For Developers

If you're building on the Ferni platform, memory is automatic. You don't build persistence systems. The three-tier architecture handles:

- Session context accumulation
- Cross-session memory retrieval
- Context injection into prompts
- Privacy-respecting cleanup

You define what your AI should remember. The platform handles how.

Documentation: [Memory Architecture](/getting-started/)

---

_Seth Ford is Ferni's AI babysitter. Follow [@ferni_ai](https://twitter.com/ferni_ai) for more on the future of conversational AI._
