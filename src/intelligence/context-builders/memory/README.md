# Memory Context Builders

> **"We believe in making AI human, and the decisions we make will reflect that."**

Memory is what makes Ferni feel like a real friend who knows you. This directory contains 6 memory context builders that work together to create the feeling of being truly understood.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Unified Memory Orchestrator (coordinator)             │
│    Coordinates all subsystems for coherent, deduplicated context         │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
     ▼                   ▼                   ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  memory.ts  │   │  advanced-  │   │  proactive- │
│  (classic)  │   │  memory.ts  │   │  memory.ts  │
│  Priority:50│   │ Priority:85 │   │ Priority:75 │
└─────────────┘   └─────────────┘   └─────────────┘
       │                 │                   │
       ▼                 ▼                   ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   rag.ts    │   │human-memory │   │(voice recog)│
│ Priority:40 │   │  Priority:80│   │             │
└─────────────┘   └─────────────┘   └─────────────┘
```

---

## Builder Responsibilities

| Builder | Priority | Primary Responsibility | When Active |
|---------|----------|----------------------|-------------|
| **unified-memory-orchestrator.ts** | 90 | Coordinates all subsystems | Every turn |
| **advanced-memory.ts** | 85 | Semantic retrieval with temporal decay | Session priming, every 3 turns |
| **human-memory.ts** | 80 | Dates, comfort patterns, growth, jokes | First 5 turns + when relevant |
| **proactive-memory.ts** | 75 | Spontaneous "I was thinking about you" | Periodic (not every turn) |
| **memory.ts** (classic) | 50 | Time-since, emotional continuity, callbacks | Turn-by-turn |
| **rag.ts** | 40 | Semantic search for persona knowledge | Every 2nd turn (skip first) |

---

## Detailed Descriptions

### `unified-memory-orchestrator.ts` (Priority 90)
**The Coordinator** - This is the central brain that coordinates ALL memory subsystems.

**What it does:**
- Semantic memory retrieval (RAG-style)
- Associative memory triggers (human-like recall)
- Emotional threading across sessions
- Behavioral pattern awareness
- Communication preferences
- Natural reference generation

**Philosophy:** Instead of multiple builders each injecting their own context, this single builder coordinates all memory for coherent, deduplicated output.

---

### `advanced-memory.ts` (Priority 85)
**The "Better Than Human" Memory** - Uses AI to remember what matters.

**Features:**
- Semantic similarity (meaning, not just keywords)
- Temporal decay (recent = more relevant, unless emotionally significant)
- Emotional salience (heavy moments persist longer)
- Commitment tracking (promises made are remembered)
- Natural memory callbacks ("Remember when you mentioned...")

**Philosophy:** A great friend remembers what matters - not everything, but the things that shaped you.

---

### `human-memory.ts` (Priority 80)
**The Personal Touch** - Human-centric memory that makes users feel known.

**Features:**
- Important dates (birthdays, anniversaries) - alerts when approaching
- Comfort patterns (what helps vs. stresses them)
- Topics to avoid (respecting boundaries)
- Growth acknowledgment (celebrating progress)
- Inside jokes (building rapport)
- Values and identity tracking
- Seasonal patterns (holiday stress, etc.)

**Philosophy:** This is what makes someone feel truly known - remembering the human details.

---

### `proactive-memory.ts` (Priority 75)
**The Spontaneous Friend** - Creates that "I was just thinking about you" feeling.

**Features:**
- Follow-up on previous conversations
- Goal progress check-ins
- Key moment callbacks
- Relationship anniversaries
- Emotional pattern awareness
- Voice recognition callbacks (when matched)

**Philosophy:** Makes conversations feel continuous and deeply personal, like a friend who genuinely cares.

---

### `memory.ts` (Classic) (Priority 50)
**The Foundation** - Traditional memory callbacks and cross-session continuity.

**Features:**
- Memory callbacks (reference earlier in conversation)
- Cross-session memory (reference previous conversations)
- Past conversation retrieval (semantic search)
- Time since last conversation
- Emotional continuity (check on previous feelings)
- Key moment retrieval
- Enhanced learning context

**Philosophy:** Makes conversations feel continuous and personalized - the backbone of memory.

---

### `rag.ts` (Priority 40)
**The Knowledge Retriever** - RAG (Retrieval Augmented Generation) for semantic search.

**Features:**
- Persona knowledge lookup (principles, philosophy)
- User profile semantic search
- Historical conversation retrieval

**Philosophy:** Gives the LLM access to relevant knowledge at the right time.

---

## When Each Builder Runs

```
Turn 1 (Greeting):
  ✅ unified-memory-orchestrator (session priming)
  ✅ advanced-memory (priming memories)
  ✅ human-memory (date awareness, comfort patterns)
  ✅ memory.ts (time-since, returning user check)
  ❌ rag.ts (skip first turn)
  ❌ proactive-memory (not on first turn)

Turn 2-5 (Warming Up):
  ✅ All builders active
  ✅ human-memory checking for growth, jokes
  ✅ proactive-memory may surface relevant memory

Turn 6+ (Ongoing):
  ✅ unified-memory-orchestrator (always)
  ✅ advanced-memory (every 3 turns)
  ✅ human-memory (when topics match)
  ✅ memory.ts (callback opportunities)
  ✅ rag.ts (every 2nd turn)
  🔄 proactive-memory (periodic, rate-limited)
```

---

## How They Work Together

### Deduplication
The unified orchestrator prevents duplicate memories:
- Each builder tracks what it has surfaced
- Cross-builder deduplication via session state
- Natural rate limiting (not every turn)

### Priority Resolution
When multiple builders want to inject similar content:
1. Higher priority wins (advanced > human > classic)
2. Critical priority overrides everything (emotional support)
3. Hints are dropped first if context is too long

### Example Context Flow

**User says:** "I've been thinking about my dad a lot lately"

```
1. memory.ts detects: "Oh, last time you mentioned him you seemed troubled"
2. human-memory checks: Is "dad" in avoided_topics? No → proceed
3. human-memory finds: Comfort pattern = "validation helps with family stress"
4. advanced-memory retrieves: Related memory about family gathering 2 weeks ago
5. proactive-memory skips: Already surfaced family-related memory this session
6. unified-orchestrator outputs:
   - [high] "Last time you mentioned your dad, you seemed to be carrying something heavy"
   - [hint] "Validation works well for them when discussing family"
   - [standard] "Two weeks ago you shared about the family dinner"
```

---

## Adding New Memory Types

1. Create a new builder following the pattern in existing files
2. Choose appropriate priority based on importance
3. Register with the builder registry
4. Document how it complements existing builders
5. Add deduplication logic if needed

---

## Testing

```bash
# Run memory builder tests
pnpm vitest run src/intelligence/context-builders/__tests__/human-memory.test.ts
pnpm vitest run src/intelligence/__tests__/superhuman-memory.test.ts
```

---

## Related Documentation

- `docs/architecture/MEMORY-MANAGEMENT.md` - Memory storage and cleanup
- `src/memory/README.md` - Low-level memory storage
- `src/types/human-memory.ts` - Type definitions

