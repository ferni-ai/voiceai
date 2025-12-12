# User Memory Vectorization Strategy

> "Better than human" memory means finding the right memory at the right moment through meaning, not just keywords.

## Philosophy

Every piece of user data that could be relevant in conversation should be searchable by meaning. When a user says "remember that thing about my daughter?", we should find it through semantic similarity, not keyword matching.

**What makes someone feel truly known?**
- A great friend remembers not just what you said, but how you felt
- They notice when something's off before you say it
- They remember the small things that matter
- They know what comforts you and what stresses you
- They track your growth and celebrate it

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           VECTOR STORE                                   │
│  ┌─────────────┐  ┌──────────────────────┐  ┌─────────────┐            │
│  │   PERSONA   │  │     USER MEMORY      │  │ CONVERSATION│            │
│  │  KNOWLEDGE  │  │                      │  │   HISTORY   │            │
│  │             │  │  PROFILE DATA:       │  │             │            │
│  │ • Stories   │  │  • Moments, People   │  │ • Summaries │            │
│  │ • Wisdom    │  │  • Goals, Events     │  │ • Key Points│            │
│  │ • Principles│  │  • Threads, Prefs    │  │ • Decisions │            │
│  │ • Coaching  │  │                      │  │             │            │
│  │             │  │  HUMAN MEMORY:       │  │             │            │
│  │             │  │  • Important Dates   │  │             │            │
│  │             │  │  • Emotional Signs   │  │             │            │
│  │             │  │  • Inside Jokes      │  │             │            │
│  │             │  │  • Values & Dreams   │  │             │            │
│  │             │  │  • Growth Arc        │  │             │            │
│  │             │  │  • The Unspoken      │  │             │            │
│  └─────────────┘  └──────────────────────┘  └─────────────┘            │
│                                                                          │
│  source: persona      source: user_memory       source: conversation    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Domains to Vectorize

### Domain 1: Key Moments (P0)
**What:** Breakthroughs, vulnerabilities, celebrations, milestones
**Why:** Core relationship memory - "Remember when you had that breakthrough about..."
**When to index:** After conversation ends, when moment is recorded
**Metadata:**
- `source: 'user_memory'`
- `category: 'key_moment'`
- `momentType: 'breakthrough' | 'vulnerability' | 'celebration' | ...`
- `emotionalWeight: 'light' | 'medium' | 'heavy'`
- `userId: string`
- `timestamp: Date`
- `topics: string[]`

### Domain 2: People & Relationships (P0)
**What:** Family members, friends, colleagues mentioned
**Why:** Personal connection - "How's Sarah doing with college?"
**When to index:** When family member is first mentioned or updated
**Metadata:**
- `source: 'user_memory'`
- `category: 'person'`
- `personType: 'family' | 'friend' | 'colleague' | 'other'`
- `relationship: string` (e.g., 'daughter', 'spouse')
- `personName: string | null`
- `userId: string`
- `lastMentioned: Date`

### Domain 3: Open Threads & Follow-ups (P0)
**What:** Topics to resume, commitments made
**Why:** Cross-session continuity - "Last time you mentioned wanting to talk about..."
**When to index:** At conversation end, when thread is opened
**Metadata:**
- `source: 'user_memory'`
- `category: 'thread' | 'followup'`
- `priority: 'high' | 'medium' | 'low'`
- `status: 'open' | 'resumed' | 'closed'`
- `userId: string`
- `targetDate: Date | null`

### Domain 4: Life Events (P1)
**What:** Weddings, babies, career changes, losses, celebrations
**Why:** Major life context - contextualizes all other memories
**When to index:** When event is recorded or updated
**Metadata:**
- `source: 'user_memory'`
- `category: 'life_event'`
- `eventType: 'wedding' | 'baby' | 'career_change' | ...`
- `emotionalSignificance: 'routine' | 'meaningful' | 'major' | 'life_changing'`
- `status: 'planning' | 'upcoming' | 'completed' | ...`
- `userId: string`
- `eventDate: Date | null`

### Domain 5: Goals & Aspirations (P1)
**What:** Financial goals, life goals, with progress and notes
**Why:** Coaching context - "You mentioned wanting to save for a house..."
**When to index:** When goal is created or significantly updated
**Metadata:**
- `source: 'user_memory'`
- `category: 'goal'`
- `goalType: 'retirement' | 'education' | 'home' | ...`
- `status: 'planning' | 'active' | 'achieved' | ...`
- `priority: 'high' | 'medium' | 'low'`
- `userId: string`
- `targetDate: Date | null`

### Domain 6: Per-Persona Memories (P1)
**What:** What each team member has learned about the user
**Why:** Specialized knowledge per persona
**When to index:** When persona learns something new
**Metadata:**
- `source: 'user_memory'`
- `category: 'persona_learning'`
- `personaId: 'ferni' | 'jack' | 'peter' | 'maya' | 'jordan' | 'alex' | 'nayan'`
- `memoryType: string` (persona-specific)
- `userId: string`
- `timestamp: Date`

### Domain 7: Shared Content (P2)
**What:** Stories told, insights shared, wisdom imparted
**Why:** Avoid repetition, enable callbacks
**When to index:** When content is shared
**Metadata:**
- `source: 'user_memory'`
- `category: 'shared_content'`
- `contentType: 'story' | 'insight' | 'wisdom' | 'hot_take'`
- `personaId: string`
- `userReaction: string | null`
- `userId: string`
- `sharedAt: Date`

### Domain 8: Emotional Patterns (P2)
**What:** Historical mood data, triggers, patterns
**Why:** Emotional intelligence - detect patterns over time
**When to index:** Periodically (not every emotion, but patterns)
**Metadata:**
- `source: 'user_memory'`
- `category: 'emotional_pattern'`
- `patternType: 'trigger' | 'trend' | 'concern'`
- `emotion: string`
- `userId: string`
- `timestamp: Date`

### Domain 9: Preferences & Style (P2)
**What:** Communication preferences, topics to avoid, humor appreciation
**Why:** Personalization - adapt to user's style
**When to index:** When preferences are learned/updated
**Metadata:**
- `source: 'user_memory'`
- `category: 'preference'`
- `preferenceType: 'communication' | 'topic' | 'style'`
- `userId: string`
- `updatedAt: Date`

### Domain 10: Music & Entertainment (P3)
**What:** Favorite artists, shared musical moments, game achievements
**Why:** Delight and connection
**When to index:** When significant moment occurs
**Metadata:**
- `source: 'user_memory'`
- `category: 'entertainment'`
- `entertainmentType: 'music' | 'game'`
- `subType: string` (e.g., 'artist', 'milestone', 'shared_moment')
- `userId: string`
- `timestamp: Date`

---

## 🌟 HUMAN-CENTRIC MEMORY DOMAINS

> These capture what makes someone feel truly known - beyond data points.

### Domain 11: Important Dates (P0)
**What:** Birthdays, anniversaries, loss anniversaries, milestones
**Why:** "Happy anniversary!" makes it personal
**When to index:** When date is mentioned
**Metadata:**
- `source: 'user_memory'`
- `category: 'important_date'`
- `dateType: 'birthday' | 'anniversary' | 'loss_anniversary' | 'milestone' | ...`
- `month, day, year`
- `relatedPerson?: string`
- `significance: 'routine' | 'meaningful' | 'major' | 'life_changing'`
- `wantsAcknowledgment: boolean`

### Domain 12: Emotional Signature (P0)
**What:** What comforts them, their tells, stress triggers
**Why:** Know how to help without asking

**12a: Comfort Patterns**
- `category: 'comfort_pattern'`
- `comfortType: 'validation' | 'problem_solving' | 'distraction' | ...`
- `effectiveFor: string` (e.g., "work stress")

**12b: Stress Triggers**
- `category: 'stress_trigger'`
- `triggerCategory: 'work' | 'financial' | 'health' | ...`
- `intensity: 'mild' | 'moderate' | 'significant' | 'severe'`

**12c: Emotional Tells**
- `category: 'emotional_tell'`
- `signal: string` (e.g., "short responses")
- `interpretation: string` (e.g., "stressed about work")
- `confidence: number`

### Domain 13: Inside Jokes & Running Themes (P1)
**What:** Shared humor, recurring topics, callbacks
**Why:** Relationship texture

**13a: Inside Jokes**
- `category: 'inside_joke'`
- `reference: string`
- `origin: string`
- `status: 'fresh' | 'beloved' | 'retired'`

**13b: Running Themes**
- `category: 'running_theme'`
- `theme: string` (e.g., "learning Spanish")
- `frequency: 'every_session' | 'often' | 'occasionally'`
- `sentiment: 'positive' | 'mixed' | 'challenging'`

### Domain 14: Identity & Values (P1)
**What:** Core values, dreams, fears, formative experiences
**Why:** Understand who they really are

**14a: Core Values**
- `category: 'value'`
- `value: string` (e.g., "family first")
- `strength: 'mentioned' | 'evident' | 'core_identity'`

**14b: Dreams**
- `category: 'dream'`
- `dreamCategory: 'career' | 'family' | 'creative' | ...`
- `status: 'active_pursuit' | 'someday' | 'back_burner'`

**14c: Fears**
- `category: 'fear'`
- `frequency: 'constant' | 'recurring' | 'occasional'`
- `sensitivity: 'can_discuss' | 'tread_carefully' | 'avoid_unless_they_raise'`

### Domain 15: Growth Arc (P1)
**What:** How they've grown, challenges they're working through
**Why:** "Look how far you've come"

**15a: Growth Markers**
- `category: 'growth_marker'`
- `before: string`
- `after: string`
- `acknowledged: boolean`

**15b: Challenges**
- `category: 'challenge'`
- `status: 'struggling' | 'working_on_it' | 'making_progress' | 'breakthrough'`

### Domain 16: The Unspoken (P2)
**What:** Topics they avoid, patterns in when they reach out
**Why:** Respect boundaries, notice when something's wrong

**16a: Recurring Avoidances**
- `category: 'avoidance'`
- `topic: string`
- `avoidanceStyle: 'deflects' | 'changes_subject' | 'visible_discomfort'`
- `approach: 'never_raise' | 'only_if_they_do' | 'gentle_check_in_ok'`

### Domain 17: Temporal Patterns (P2)
**What:** Seasonal patterns, time-of-day patterns
**Why:** "You always seem stressed in April"
- `category: 'temporal_pattern'`
- `timing: 'spring' | 'tax_season' | 'holidays' | ...`
- `emotionalTone: 'positive' | 'challenging' | 'mixed'`

## Indexing Strategy

### When to Index

| Trigger | What Gets Indexed |
|---------|-------------------|
| **Conversation End** | New summaries, moments, threads, follow-ups |
| **Profile Update** | Changed goals, events, preferences |
| **Real-time** | Person mentions (debounced), emotional signals |
| **Periodic (daily)** | Emotional patterns, preference refinements |
| **On Demand** | Full reindex for user migration/repair |

### Deduplication Strategy

```typescript
// Document IDs follow pattern: {domain}_{userId}_{uniqueId}
// Examples:
// - key_moment_user123_moment456
// - person_user123_daughter_sarah
// - goal_user123_retirement_fund
// - thread_user123_college_discussion

// This allows:
// 1. Easy lookup for updates (upsert by ID)
// 2. User-scoped deletion (delete where userId = X)
// 3. Domain-scoped queries (where category = 'key_moment')
```

### Update vs Replace

- **Immutable:** Key moments, shared content, conversation summaries
- **Mutable (upsert):** Goals, threads, preferences, people
- **Append-only:** Emotional patterns (capped at N per user)

## Query Patterns

### Standard User Memory Search
```typescript
await semanticSearch(query, {
  sources: ['user_memory'],
  userId: currentUserId,
  topK: 10,
  minScore: 0.35,
});
```

### Category-Specific Search
```typescript
// Find relevant people
await semanticSearch("How's the family?", {
  sources: ['user_memory'],
  categories: ['person'],
  userId: currentUserId,
});

// Find relevant goals
await semanticSearch("saving for something big", {
  sources: ['user_memory'],
  categories: ['goal'],
  userId: currentUserId,
});
```

### Cross-Domain Search (Session Priming)
```typescript
// Get all relevant context for session start
await semanticSearch(userGreeting, {
  sources: ['user_memory', 'conversation'],
  userId: currentUserId,
  topK: 20, // Broader search for priming
});
```

### Persona-Specific Search
```typescript
// What does Peter know about this user?
await semanticSearch(topic, {
  sources: ['user_memory'],
  categories: ['persona_learning'],
  filter: { personaId: 'peter' },
  userId: currentUserId,
});
```

## Performance Considerations

### Chunking Strategy
- **Short content (<500 chars):** Index as single document
- **Medium content (500-1500 chars):** Index as single document
- **Long content (>1500 chars):** Chunk with 100-char overlap

### Index Size Management
| User Profile Size | Est. Documents | Strategy |
|-------------------|----------------|----------|
| New user | 5-20 | Index all |
| Active user (1mo) | 50-100 | Index all |
| Long-term (1yr) | 200-500 | Decay old, consolidate |
| Power user | 500+ | Aggressive consolidation |

### Memory Decay Integration
- Documents older than 6 months get lower retrieval priority
- Emotionally significant documents resist decay
- Consolidate similar old memories into summary documents

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create `indexUserMemory()` function
- [ ] Add metadata schema validation
- [ ] Implement document ID generation
- [ ] Add user-scoped filtering to search

### Phase 2: High Priority Domains (Week 2)
- [ ] Key Moments indexing
- [ ] People/Family indexing
- [ ] Open Threads indexing
- [ ] Integration with conversation end flow

### Phase 3: Full Coverage (Week 3)
- [ ] Life Events indexing
- [ ] Goals indexing
- [ ] Per-Persona Memories indexing
- [ ] Shared Content tracking

### Phase 4: Advanced Features (Week 4)
- [ ] Emotional Patterns indexing
- [ ] Preferences indexing
- [ ] Entertainment memories
- [ ] Memory consolidation for old data

### Phase 5: Optimization (Week 5)
- [ ] Query performance tuning
- [ ] Index size monitoring
- [ ] Decay/consolidation automation
- [ ] Analytics on retrieval quality

## Success Metrics

| Metric | Target |
|--------|--------|
| Retrieval latency (p95) | < 200ms |
| Relevant memory found | > 80% of queries |
| User memory index size | < 1MB per user |
| False positive rate | < 10% |
| Cross-session continuity | Users feel "remembered" |

## Security Considerations

- All user memory documents are scoped by `userId`
- Search MUST include `userId` filter (enforced in code)
- No cross-user memory leakage possible
- PII is encrypted at rest (Firestore encryption)
- Memory deletion cascades to vector store

## Migration Plan

For existing users:
1. Run batch job to index existing profile data
2. Index incrementally as users interact
3. Monitor for gaps in coverage
4. Full reindex available via admin API

