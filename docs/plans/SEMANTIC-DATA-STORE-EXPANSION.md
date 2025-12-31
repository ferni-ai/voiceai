# Semantic Data Store Expansion Plan

> **Status: ✅ FULLY IMPLEMENTED, TESTED & AUDITED** - December 30, 2024

> **"The brain doesn't separate facts from memories - it integrates everything into coherent understanding."**

This document outlines a comprehensive plan to extend Ferni's semantic memory infrastructure across all services, tools, and domains - creating a unified semantic data layer that enables natural language retrieval over the entire user data graph.

### Implementation Summary

✅ **98 Entity Types** defined in `types.ts`
✅ **9 Domain Hooks** implemented in `hooks/`
✅ **153 Unit Tests** passing
✅ **Semantic Context Builder** operational
✅ **Service Integrations** for trust & superhuman
✅ **Migration Scripts** ready

**See:** `docs/audits/SEMANTIC-DATA-STORE-AUDIT.md` for full audit report.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State](#current-state)
3. [Target Architecture](#target-architecture)
4. [Domain Inventory](#domain-inventory)
5. [Implementation Phases](#implementation-phases)
6. [New Entity Types](#new-entity-types)
7. [Store Hooks Architecture](#store-hooks-architecture)
8. [Context Builder Integration](#context-builder-integration)
9. [Performance & Scaling](#performance--scaling)
10. [Migration Strategy](#migration-strategy)
11. [Testing Plan](#testing-plan)
12. [Rollout Checklist](#rollout-checklist)

---

## Executive Summary

### Goal
Transform Ferni's semantic memory from a conversation-focused system into a comprehensive **Semantic Data Store** that indexes all user data for natural language retrieval.

### Why This Matters
- **Natural Queries**: "What commitments have I made this month?" retrieves from commitments, calendar, tasks, and trust systems
- **Cross-Domain Intelligence**: Connect financial goals to calendar events to emotional patterns
- **"Better Than Human" Memory**: Ferni remembers connections humans would miss

### Scope
- **67 service directories** with indexable data
- **85+ tool domains** generating user data
- **16 existing entity types** → expanding to **50+ entity types**
- **Estimated 5-6 week implementation** in 4 phases

---

## Current State

### What's Already Indexed

```
┌─────────────────────────────────────────────────────────────┐
│                CURRENTLY INDEXED (16 Types)                 │
├─────────────────────────────────────────────────────────────┤
│ Productivity: habit, task, routine, medication, package     │
│ Financial:    budget, savings_goal, subscription, bill      │
│               spending_trigger                              │
│ Life Data:    milestone, life_goal, retirement_plan, trip   │
│ Content:      journal, note (disabled)                      │
└─────────────────────────────────────────────────────────────┘
```

### Current Architecture

```
Domain Store (CRUD) ─────┐
                         │  onStoreChange()
                         ▼
              ┌─────────────────────┐
              │   store-hooks.ts    │ ◄── Debounce 2s
              │  (auto-indexing)    │
              └─────────┬───────────┘
                        │
                        ▼ embed() + addDocument()
              ┌─────────────────────┐
              │ FirestoreVectorStore │
              │   (semantic memory) │
              └─────────────────────┘
```

### Files Involved
- `src/services/data-layer/store-hooks.ts` - Auto-indexing hooks
- `src/services/data-layer/indexing-policy.ts` - What gets indexed
- `src/services/data-layer/types.ts` - Entity type definitions
- `src/memory/firestore-vector-store/core.ts` - Vector storage

---

## Target Architecture

### Expanded Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SEMANTIC DATA STORE                                 │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ Productivity│  │  Financial  │  │    Life     │  │   Social    │       │
│  │   Store     │  │    Store    │  │    Store    │  │   Store     │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                │                │               │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐       │
│  │ Trust       │  │ Calendar    │  │ Superhuman  │  │ Contacts    │       │
│  │ Systems     │  │ Service     │  │ Services    │  │ Service     │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                                   │                                         │
│                                   ▼                                         │
│                    ┌───────────────────────────┐                            │
│                    │    UNIFIED STORE HOOKS    │                            │
│                    │   (domain-specific hooks) │                            │
│                    └─────────────┬─────────────┘                            │
│                                  │                                          │
│                    ┌─────────────┴─────────────┐                            │
│                    │    INDEXING ORCHESTRATOR  │                            │
│                    │  • Policy enforcement     │                            │
│                    │  • Batch processing       │                            │
│                    │  • TTL management         │                            │
│                    │  • Deduplication          │                            │
│                    └─────────────┬─────────────┘                            │
│                                  │                                          │
│                    ┌─────────────┴─────────────┐                            │
│                    │   FIRESTORE VECTOR STORE  │                            │
│                    │  • 768-dim embeddings     │                            │
│                    │  • Native KNN search      │                            │
│                    │  • Rich metadata          │                            │
│                    └───────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Domain Inventory

### Priority Tier 1: High-Value, Existing Data (Week 1-2)

| Domain | Service Location | Entity Types | Priority |
|--------|-----------------|--------------|----------|
| **Trust Systems** | `services/trust-systems/` | commitment, boundary, growth_reflection, inside_joke, small_win, thinking_of_you_moment | 🔴 Critical |
| **Superhuman** | `services/superhuman/` | dream, life_chapter, values_alignment, relationship_milestone, capacity_state, seasonal_pattern | 🔴 Critical |
| **Calendar** | `services/calendar/` | calendar_event, meeting_memory, recurring_commitment, calendar_conflict | 🔴 Critical |
| **Contacts** | `services/contacts/` | contact, relationship_note, gift_idea, important_date | 🟠 High |

### Priority Tier 2: Rich Context Data (Week 2-3)

| Domain | Service Location | Entity Types | Priority |
|--------|-----------------|--------------|----------|
| **Coaching** | `services/coaching/` | coaching_insight, reframe_suggestion, breakthrough_moment, stuck_pattern | 🟠 High |
| **Health/Wellness** | `services/health/`, `services/wellbeing-tracking/` | health_goal, sleep_pattern, energy_level, workout, wellness_checkin | 🟠 High |
| **Communication** | `services/communication/` | communication_preference, conversation_topic, voice_pattern | 🟠 High |
| **Music** | `services/music/`, `services/music-intelligence/` | music_preference, emotional_song, playlist_memory, listening_pattern | 🟡 Medium |
| **Books/Podcasts** | `services/books/`, `services/podcasts/` | book_highlight, reading_goal, podcast_insight, quote_saved | 🟡 Medium |

### Priority Tier 3: Behavioral & Pattern Data (Week 3-4)

| Domain | Service Location | Entity Types | Priority |
|--------|-----------------|--------------|----------|
| **Behavioral Economics** | `services/behavioral-economics/` | behavioral_trigger, decision_pattern, nudge_response | 🟡 Medium |
| **Emotion Analysis** | `services/emotion-analysis/` | emotional_pattern, mood_trigger, sentiment_shift | 🟡 Medium |
| **Life Thesis** | `services/life-thesis/` | life_thesis_component, value_statement, purpose_exploration | 🟡 Medium |
| **Wisdom Synthesis** | `services/wisdom-synthesis/` | wisdom_insight, life_lesson, perspective_shift | 🟡 Medium |
| **Therapeutic** | `services/therapeutic-frameworks/` | therapeutic_insight, coping_strategy, growth_edge | 🟡 Medium |

### Priority Tier 4: Tool-Generated Data (Week 4-5)

| Tool Domain | Location | Entity Types |
|-------------|----------|--------------|
| **Career** | `tools/domains/career/` | career_goal, job_search, skill_development |
| **Relationships** | `tools/domains/relationships/` | relationship_insight, conflict_resolution, boundary_setting |
| **Family** | `tools/domains/family/` | family_member, family_event, parenting_note |
| **Dating** | `tools/domains/dating/` | dating_preference, date_reflection, relationship_goal |
| **Dreams** | `tools/domains/dreams/` | dream_record, dream_interpretation, recurring_theme |
| **Grief** | `tools/domains/grief/` | grief_milestone, memorial_note, healing_moment |
| **Learning** | `tools/domains/learning/` | learning_goal, skill_progress, resource_bookmark |
| **Decisions** | `tools/domains/decisions/` | decision_record, pros_cons_analysis, decision_outcome |
| **Life Transitions** | `tools/domains/life-transitions/` | transition_milestone, adaptation_strategy, identity_shift |

### Priority Tier 5: Extended Domains (Week 5-6)

| Domain | Entity Types |
|--------|--------------|
| **Travel** | travel_preference, trip_memory, bucket_list_destination |
| **Home** | home_project, household_inventory, maintenance_schedule |
| **Smart Home** | automation_rule, device_preference, routine_automation |
| **Games** | game_preference, gaming_session, game_memory |
| **Creativity** | creative_project, inspiration_capture, creative_block |
| **Social** | social_event, community_involvement, networking_note |
| **Legal/Admin** | document_reminder, deadline_tracking, admin_task |

---

## Implementation Phases

### Phase 1: Foundation & Trust Systems (Week 1)

#### Goals
- Extend type system for new entity types
- Implement trust systems indexing (highest value)
- Create domain-specific hook generators

#### Tasks

```typescript
// 1. Extend EntityType in types.ts
export type EntityType =
  // Existing...
  | 'habit' | 'task' | 'routine' | 'bill' | 'budget'
  // NEW: Trust Systems
  | 'commitment' | 'boundary' | 'growth_reflection' 
  | 'inside_joke' | 'small_win' | 'thinking_of_you'
  // NEW: Superhuman
  | 'dream' | 'life_chapter' | 'values_alignment'
  | 'relationship_milestone' | 'capacity_state' | 'seasonal_pattern'
  // NEW: Calendar
  | 'calendar_event' | 'meeting_memory' | 'recurring_commitment';
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/services/data-layer/types.ts` | Modify | Add 30+ new entity types |
| `src/services/data-layer/indexing-policy.ts` | Modify | Add policies for new types |
| `src/services/data-layer/trust-hooks.ts` | Create | Trust system auto-indexing |
| `src/services/data-layer/superhuman-hooks.ts` | Create | Superhuman service indexing |
| `src/services/data-layer/calendar-hooks.ts` | Create | Calendar event indexing |

#### Deliverables
- [ ] Extended type system
- [ ] Trust systems fully indexed
- [ ] Superhuman services indexed
- [ ] Calendar events indexed
- [ ] Unit tests for new hooks

---

### Phase 2: Social & Communication (Week 2)

#### Goals
- Index contacts and relationship data
- Index communication patterns
- Enable cross-domain queries

#### Tasks

```typescript
// New policies
const contactPolicy: EntityIndexingPolicy = {
  entityType: 'contact',
  priority: 'always',
  conditions: { maxPerUser: 100 },
  contentFields: ['name', 'relationship', 'notes', 'importantDates'],
  ttlDays: 0,
};

const relationshipNotePolicy: EntityIndexingPolicy = {
  entityType: 'relationship_note',
  priority: 'always',
  conditions: { maxPerUser: 200 },
  contentFields: ['contactName', 'note', 'context', 'date'],
  ttlDays: 365,
};
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/services/data-layer/contacts-hooks.ts` | Create | Contact auto-indexing |
| `src/services/data-layer/communication-hooks.ts` | Create | Communication patterns |
| `src/services/contacts/index.ts` | Modify | Add hook calls |

---

### Phase 3: Rich Context Domains (Week 3-4)

#### Goals
- Index coaching insights and breakthroughs
- Index health/wellness data
- Index media preferences and memories

#### New Entity Policies

```typescript
// Coaching
const coachingInsightPolicy: EntityIndexingPolicy = {
  entityType: 'coaching_insight',
  priority: 'always',
  conditions: { maxPerUser: 100 },
  contentFields: ['insight', 'context', 'personaId', 'category'],
  ttlDays: 0, // Insights are permanent
};

// Health
const healthGoalPolicy: EntityIndexingPolicy = {
  entityType: 'health_goal',
  priority: 'active_only',
  conditions: { activeOnly: true, maxPerUser: 10 },
  contentFields: ['goal', 'category', 'progress', 'milestones'],
  ttlDays: 0,
};

// Music
const musicPreferencePolicy: EntityIndexingPolicy = {
  entityType: 'music_preference',
  priority: 'always',
  conditions: { maxPerUser: 50 },
  contentFields: ['artist', 'genre', 'mood', 'context', 'emotionalAssociation'],
  ttlDays: 180,
};
```

---

### Phase 4: Tool Domain Integration (Week 5-6)

#### Goals
- Create generic tool output indexing
- Index all tool-generated insights
- Enable semantic tool routing

#### Architecture

```typescript
// Generic tool output hook
interface ToolOutput {
  toolId: string;
  domain: string;
  userId: string;
  output: unknown;
  metadata: {
    personaId: string;
    sessionId: string;
    timestamp: Date;
  };
}

export function onToolOutput(output: ToolOutput): void {
  const policy = getToolIndexingPolicy(output.toolId);
  if (!policy) return;
  
  const content = policy.contentExtractor(output.output);
  const entityType = policy.entityType;
  
  onStoreChange({
    storeType: 'tool_output',
    changeType: 'create',
    userId: output.userId,
    entityType,
    entityId: `${output.toolId}_${Date.now()}`,
    content,
    metadata: output.metadata,
  });
}
```

---

## New Entity Types

### Complete Entity Type Registry

```typescript
// src/services/data-layer/types.ts

export type EntityType =
  // ═══════════════════════════════════════════════════════════════
  // EXISTING (16 types)
  // ═══════════════════════════════════════════════════════════════
  | 'habit'
  | 'task'
  | 'routine'
  | 'bill'
  | 'budget'
  | 'savings_goal'
  | 'subscription'
  | 'spending_trigger'
  | 'milestone'
  | 'life_goal'
  | 'retirement_plan'
  | 'note'
  | 'journal'
  | 'medication'
  | 'package'
  | 'trip'

  // ═══════════════════════════════════════════════════════════════
  // TRUST SYSTEMS (8 types)
  // ═══════════════════════════════════════════════════════════════
  | 'commitment'           // Promises made to user or by user
  | 'boundary'             // Things NOT to bring up
  | 'growth_reflection'    // Noticed evolution in user
  | 'inside_joke'          // Shared humor moments
  | 'small_win'            // Celebrated efforts
  | 'thinking_of_you'      // Proactive outreach moments
  | 'reading_between_lines'// What user didn't say
  | 'tonal_memory'         // Voice/communication patterns

  // ═══════════════════════════════════════════════════════════════
  // SUPERHUMAN SERVICES (12 types)
  // ═══════════════════════════════════════════════════════════════
  | 'dream'                // Dream keeper entries
  | 'life_chapter'         // Life narrative segments
  | 'values_alignment'     // Values tracking
  | 'relationship_milestone' // Relationship tracker
  | 'capacity_state'       // Burnout/energy tracking
  | 'seasonal_pattern'     // Seasonal awareness
  | 'emotional_first_aid'  // Crisis support moments
  | 'predictive_insight'   // Predictive coaching
  | 'commitment_keeper'    // Commitment tracking
  | 'relationship_network' // Social network mapping
  | 'conflict_resolution'  // Conflict memory
  | 'recovery_milestone'   // Recovery tracking

  // ═══════════════════════════════════════════════════════════════
  // CALENDAR & SCHEDULING (6 types)
  // ═══════════════════════════════════════════════════════════════
  | 'calendar_event'       // Synced calendar events
  | 'meeting_memory'       // Post-meeting notes
  | 'recurring_commitment' // Regular commitments
  | 'calendar_conflict'    // Scheduling conflicts
  | 'meeting_prep'         // Pre-meeting briefs
  | 'availability_pattern' // When user is available

  // ═══════════════════════════════════════════════════════════════
  // CONTACTS & RELATIONSHIPS (8 types)
  // ═══════════════════════════════════════════════════════════════
  | 'contact'              // Contact entries
  | 'relationship_note'    // Notes about relationships
  | 'gift_idea'            // Gift suggestions
  | 'important_date'       // Birthdays, anniversaries
  | 'contact_interaction'  // Recent interactions
  | 'relationship_health'  // Relationship quality
  | 'family_member'        // Family-specific data
  | 'friend_memory'        // Shared memories with friends

  // ═══════════════════════════════════════════════════════════════
  // COACHING & GROWTH (8 types)
  // ═══════════════════════════════════════════════════════════════
  | 'coaching_insight'     // AI coaching observations
  | 'breakthrough_moment'  // Aha moments
  | 'stuck_pattern'        // Recurring blockers
  | 'reframe_suggestion'   // Perspective shifts offered
  | 'growth_edge'          // Current growth areas
  | 'strength_identified'  // User strengths
  | 'blind_spot'           // Identified blind spots
  | 'accountability_item'  // Accountability tracking

  // ═══════════════════════════════════════════════════════════════
  // HEALTH & WELLNESS (8 types)
  // ═══════════════════════════════════════════════════════════════
  | 'health_goal'          // Health objectives
  | 'sleep_pattern'        // Sleep tracking
  | 'energy_level'         // Energy throughout day
  | 'workout'              // Exercise sessions
  | 'wellness_checkin'     // Regular checkins
  | 'mental_health_note'   // Mental health tracking
  | 'nutrition_goal'       // Diet/nutrition
  | 'body_awareness'       // Physical sensations/signals

  // ═══════════════════════════════════════════════════════════════
  // EMOTIONAL & BEHAVIORAL (6 types)
  // ═══════════════════════════════════════════════════════════════
  | 'emotional_pattern'    // Recurring emotional states
  | 'mood_trigger'         // What triggers moods
  | 'coping_strategy'      // How user copes
  | 'behavioral_trigger'   // Behavioral patterns
  | 'decision_pattern'     // How user decides
  | 'procrastination_pattern' // Procrastination triggers

  // ═══════════════════════════════════════════════════════════════
  // MEDIA & ENTERTAINMENT (8 types)
  // ═══════════════════════════════════════════════════════════════
  | 'music_preference'     // Music tastes
  | 'emotional_song'       // Songs tied to emotions
  | 'playlist_memory'      // Playlist associations
  | 'book_highlight'       // Book highlights/notes
  | 'reading_goal'         // Reading objectives
  | 'podcast_insight'      // Podcast takeaways
  | 'movie_preference'     // Movie/TV preferences
  | 'game_preference'      // Gaming preferences

  // ═══════════════════════════════════════════════════════════════
  // CAREER & PROFESSIONAL (6 types)
  // ═══════════════════════════════════════════════════════════════
  | 'career_goal'          // Career objectives
  | 'job_search'           // Job search tracking
  | 'skill_development'    // Skills being developed
  | 'professional_network' // Professional contacts
  | 'work_achievement'     // Work accomplishments
  | 'career_reflection'    // Career reflections

  // ═══════════════════════════════════════════════════════════════
  // LIFE PHILOSOPHY (6 types)
  // ═══════════════════════════════════════════════════════════════
  | 'life_thesis_component'// Life thesis elements
  | 'value_statement'      // Articulated values
  | 'purpose_exploration'  // Purpose discovery
  | 'wisdom_insight'       // Wisdom captured
  | 'life_lesson'          // Lessons learned
  | 'perspective_shift'    // Paradigm shifts

  // ═══════════════════════════════════════════════════════════════
  // MISCELLANEOUS (6 types)
  // ═══════════════════════════════════════════════════════════════
  | 'travel_preference'    // Travel style
  | 'bucket_list_item'     // Bucket list
  | 'home_project'         // Home improvement
  | 'creative_project'     // Creative endeavors
  | 'learning_resource'    // Learning materials
  | 'decision_record';     // Major decisions made
```

**Total: 98 entity types** (up from 16)

---

## Store Hooks Architecture

### Hook Generator Pattern

```typescript
// src/services/data-layer/hook-generator.ts

import { onStoreChange, type StoreChangeEvent } from './store-hooks.js';
import type { EntityType, StoreType, ChangeType } from './types.js';

/**
 * Creates a typed hook function for a specific domain
 */
export function createDomainHook<T extends Record<string, unknown>>(
  storeType: StoreType,
  entityType: EntityType,
  contentBuilder: (entity: T) => string
) {
  return function hook(
    userId: string,
    entityId: string,
    entity: T,
    changeType: ChangeType = 'create'
  ): void {
    const content = contentBuilder(entity);
    
    onStoreChange({
      storeType,
      changeType,
      userId,
      entityType,
      entityId,
      content,
      metadata: entity,
    });
  };
}
```

### Domain-Specific Hooks

#### Trust Systems Hooks

```typescript
// src/services/data-layer/hooks/trust-hooks.ts

import { createDomainHook } from '../hook-generator.js';

// Commitment tracking
export const onCommitmentChange = createDomainHook<{
  description: string;
  madeBy: 'user' | 'ferni';
  deadline?: string;
  status: 'active' | 'completed' | 'broken';
}>('trust', 'commitment', (c) => 
  `Commitment: ${c.description}. Made by: ${c.madeBy}. Status: ${c.status}.${c.deadline ? ` Due: ${c.deadline}` : ''}`
);

// Boundary memory
export const onBoundaryChange = createDomainHook<{
  topic: string;
  reason?: string;
  severity: 'soft' | 'hard';
}>('trust', 'boundary', (b) =>
  `Boundary: Do not bring up "${b.topic}". Severity: ${b.severity}.${b.reason ? ` Reason: ${b.reason}` : ''}`
);

// Inside jokes
export const onInsideJokeChange = createDomainHook<{
  joke: string;
  context: string;
  sharedMoment: string;
}>('trust', 'inside_joke', (j) =>
  `Inside joke: "${j.joke}". Context: ${j.context}. Shared moment: ${j.sharedMoment}`
);

// Growth reflection
export const onGrowthReflectionChange = createDomainHook<{
  observation: string;
  area: string;
  evidence: string;
}>('trust', 'growth_reflection', (g) =>
  `Growth noticed: ${g.observation}. Area: ${g.area}. Evidence: ${g.evidence}`
);

// Small wins
export const onSmallWinChange = createDomainHook<{
  win: string;
  effort: string;
  celebration: string;
}>('trust', 'small_win', (w) =>
  `Small win celebrated: ${w.win}. Effort acknowledged: ${w.effort}`
);
```

#### Superhuman Hooks

```typescript
// src/services/data-layer/hooks/superhuman-hooks.ts

import { createDomainHook } from '../hook-generator.js';

// Dream keeper
export const onDreamChange = createDomainHook<{
  dream: string;
  category: string;
  timeframe?: string;
  steps?: string[];
}>('superhuman', 'dream', (d) =>
  `Dream: ${d.dream}. Category: ${d.category}.${d.timeframe ? ` Timeframe: ${d.timeframe}` : ''}`
);

// Life narrative chapters
export const onLifeChapterChange = createDomainHook<{
  title: string;
  summary: string;
  period: { start: string; end?: string };
  themes: string[];
}>('superhuman', 'life_chapter', (c) =>
  `Life chapter: ${c.title}. ${c.summary}. Themes: ${c.themes.join(', ')}`
);

// Values alignment
export const onValuesAlignmentChange = createDomainHook<{
  value: string;
  alignment: 'aligned' | 'conflicted' | 'exploring';
  evidence: string;
}>('superhuman', 'values_alignment', (v) =>
  `Value: ${v.value}. Alignment: ${v.alignment}. Evidence: ${v.evidence}`
);

// Capacity guardian
export const onCapacityStateChange = createDomainHook<{
  level: 'depleted' | 'low' | 'moderate' | 'good' | 'thriving';
  factors: string[];
  recommendation: string;
}>('superhuman', 'capacity_state', (c) =>
  `Capacity: ${c.level}. Factors: ${c.factors.join(', ')}. Recommendation: ${c.recommendation}`
);
```

#### Calendar Hooks

```typescript
// src/services/data-layer/hooks/calendar-hooks.ts

import { createDomainHook } from '../hook-generator.js';

// Calendar events
export const onCalendarEventChange = createDomainHook<{
  title: string;
  date: string;
  time?: string;
  attendees?: string[];
  notes?: string;
}>('calendar', 'calendar_event', (e) =>
  `Event: ${e.title} on ${e.date}${e.time ? ` at ${e.time}` : ''}.${e.attendees?.length ? ` With: ${e.attendees.join(', ')}` : ''}`
);

// Meeting memories
export const onMeetingMemoryChange = createDomainHook<{
  meetingTitle: string;
  date: string;
  keyPoints: string[];
  actionItems: string[];
  mood?: string;
}>('calendar', 'meeting_memory', (m) =>
  `Meeting: ${m.meetingTitle} (${m.date}). Key points: ${m.keyPoints.join('; ')}. Actions: ${m.actionItems.join('; ')}`
);
```

#### Contacts Hooks

```typescript
// src/services/data-layer/hooks/contacts-hooks.ts

import { createDomainHook } from '../hook-generator.js';

// Contact entries
export const onContactChange = createDomainHook<{
  name: string;
  relationship: string;
  notes?: string;
  importantDates?: Array<{ label: string; date: string }>;
}>('contacts', 'contact', (c) =>
  `Contact: ${c.name}. Relationship: ${c.relationship}.${c.notes ? ` Notes: ${c.notes}` : ''}`
);

// Relationship notes
export const onRelationshipNoteChange = createDomainHook<{
  contactName: string;
  note: string;
  context?: string;
}>('contacts', 'relationship_note', (r) =>
  `Note about ${r.contactName}: ${r.note}${r.context ? `. Context: ${r.context}` : ''}`
);

// Gift ideas
export const onGiftIdeaChange = createDomainHook<{
  forContact: string;
  idea: string;
  occasion?: string;
  priceRange?: string;
}>('contacts', 'gift_idea', (g) =>
  `Gift idea for ${g.forContact}: ${g.idea}${g.occasion ? ` for ${g.occasion}` : ''}`
);
```

### Hook Index Export

```typescript
// src/services/data-layer/hooks/index.ts

// Trust systems
export * from './trust-hooks.js';

// Superhuman services
export * from './superhuman-hooks.js';

// Calendar
export * from './calendar-hooks.js';

// Contacts
export * from './contacts-hooks.js';

// Coaching (to be implemented)
export * from './coaching-hooks.js';

// Health (to be implemented)
export * from './health-hooks.js';

// Media (to be implemented)
export * from './media-hooks.js';
```

---

## Context Builder Integration

### Unified Data Context Builder

```typescript
// src/intelligence/context-builders/memory/unified-semantic-context.ts

import { semanticSearch } from '../../../memory/semantic-rag.js';
import type { ContextBuilder, ContextBuilderInput, BuilderCategory } from '../types.js';

export const unifiedSemanticContextBuilder: ContextBuilder = {
  id: 'unified_semantic_context',
  category: 'MEMORY' as BuilderCategory,
  priority: 70, // High priority - runs early
  
  async build(input: ContextBuilderInput): Promise<string | null> {
    const { userId, userMessage, personaId } = input;
    
    if (!userMessage || userMessage.length < 10) return null;
    
    // Search across ALL indexed data
    const results = await semanticSearch(userMessage, {
      topK: 15,
      userId,
      minScore: 0.5,
    });
    
    if (results.length === 0) return null;
    
    // Group by source for organized context
    const grouped = groupBySource(results);
    
    // Build context sections
    const sections: string[] = [];
    
    // Trust-related context (highest priority for relationship)
    if (grouped.trust?.length) {
      sections.push(formatSection('RELATIONSHIP CONTEXT', grouped.trust));
    }
    
    // Commitments and follow-ups
    if (grouped.superhuman?.length) {
      sections.push(formatSection('COMMITMENTS & INSIGHTS', grouped.superhuman));
    }
    
    // Calendar context
    if (grouped.calendar?.length) {
      sections.push(formatSection('SCHEDULE CONTEXT', grouped.calendar));
    }
    
    // People context
    if (grouped.contacts?.length) {
      sections.push(formatSection('PEOPLE CONTEXT', grouped.contacts));
    }
    
    // Domain-specific context based on persona
    const personaContext = getPersonaSpecificContext(personaId, grouped);
    if (personaContext) {
      sections.push(personaContext);
    }
    
    return sections.join('\n\n');
  }
};

function groupBySource(results: Array<{ source: string; content: string; score: number }>) {
  return results.reduce((acc, r) => {
    const source = r.source.split('_')[0]; // e.g., 'trust_commitment' → 'trust'
    if (!acc[source]) acc[source] = [];
    acc[source].push(r);
    return acc;
  }, {} as Record<string, typeof results>);
}

function formatSection(title: string, items: Array<{ content: string; score: number }>): string {
  const content = items
    .slice(0, 5) // Max 5 per section
    .map(i => `• ${i.content.slice(0, 200)}`)
    .join('\n');
  return `[${title}]\n${content}`;
}
```

### Persona-Specific Context Injection

```typescript
// src/intelligence/context-builders/memory/persona-semantic-context.ts

const PERSONA_PRIORITIES: Record<string, string[]> = {
  ferni: ['trust', 'superhuman', 'contacts', 'calendar'],
  maya: ['productivity', 'health', 'habit', 'routine'],
  peter: ['financial', 'career', 'learning', 'research'],
  alex: ['calendar', 'communication', 'contacts', 'scheduling'],
  jordan: ['milestone', 'life_goal', 'calendar', 'celebration'],
  nayan: ['wisdom', 'life_thesis', 'values', 'perspective'],
};

export function getPersonaSpecificContext(
  personaId: string,
  grouped: Record<string, Array<{ content: string }>>
): string | null {
  const priorities = PERSONA_PRIORITIES[personaId] || PERSONA_PRIORITIES.ferni;
  
  const relevantSources = priorities
    .filter(p => grouped[p]?.length)
    .slice(0, 2);
  
  if (relevantSources.length === 0) return null;
  
  const content = relevantSources
    .flatMap(source => grouped[source].slice(0, 3).map(r => `• ${r.content.slice(0, 150)}`))
    .join('\n');
  
  return `[${personaId.toUpperCase()} RELEVANT]\n${content}`;
}
```

---

## Performance & Scaling

### Indexing Limits

| Metric | Limit | Rationale |
|--------|-------|-----------|
| Max docs per user | 500 | ~$0.02/month embedding cost |
| Max per entity type | Varies | See policy |
| Debounce time | 2 seconds | Batch rapid changes |
| Batch size | 50 | Firestore limits |
| Embedding dimension | 768 | text-embedding-3-small |

### Caching Strategy

```typescript
// Tiered caching for semantic queries
const CACHE_CONFIG = {
  // L1: In-memory (fastest)
  memory: {
    maxSize: 1000,
    ttlSeconds: 60,
  },
  
  // L2: Redis (shared)
  redis: {
    ttlSeconds: 300,
    keyPrefix: 'semantic:',
  },
  
  // L3: Semantic cache (query similarity)
  semantic: {
    similarityThreshold: 0.85,
    maxEntriesPerUser: 100,
  },
};
```

### Cost Estimation

| Operation | Cost | Volume/Month | Total |
|-----------|------|--------------|-------|
| Embedding generation | $0.00002/1K tokens | 500K tokens | $10 |
| Firestore reads | $0.06/100K | 2M reads | $12 |
| Firestore writes | $0.18/100K | 200K writes | $36 |
| **Total** | | | **~$58/1000 users** |

---

## Migration Strategy

### Phase 1: New Data Only
```typescript
// Week 1-2: All new data gets indexed
// No backfill of existing data
```

### Phase 2: Background Backfill
```typescript
// src/scripts/backfill-semantic-index.ts

async function backfillUserData(userId: string): Promise<void> {
  // Load all existing data
  const stores = [
    getProductivityStore(),
    getFinancialStore(),
    getLifeDataStore(),
  ];
  
  for (const store of stores) {
    const data = await store.getAllUserData(userId);
    
    // Process in batches
    const batches = chunkArray(data.entries, 50);
    
    for (const batch of batches) {
      await Promise.all(batch.map(entry => 
        indexEntry(userId, entry)
      ));
      
      // Rate limit
      await sleep(1000);
    }
  }
}
```

### Phase 3: Trust System Backfill
```typescript
// Most valuable - backfill trust data first
async function backfillTrustSystems(userId: string): Promise<void> {
  const trustData = await loadTrustProfile(userId);
  
  // Index commitments
  for (const c of trustData.commitments) {
    onCommitmentChange(userId, c.id, c, 'create');
  }
  
  // Index boundaries
  for (const b of trustData.boundaries) {
    onBoundaryChange(userId, b.id, b, 'create');
  }
  
  // etc...
}
```

---

## Testing Plan

### Unit Tests

```typescript
// src/services/data-layer/__tests__/hooks.test.ts

describe('Domain Hooks', () => {
  describe('Trust Hooks', () => {
    it('indexes commitments correctly', async () => {
      const userId = 'test-user';
      const commitment = {
        description: 'Call mom every Sunday',
        madeBy: 'user' as const,
        status: 'active' as const,
      };
      
      onCommitmentChange(userId, 'c1', commitment);
      
      // Wait for debounce
      await sleep(2500);
      
      // Verify indexed
      const results = await semanticSearch('call mom', { userId });
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('Call mom every Sunday');
    });
  });
});
```

### Integration Tests

```typescript
// src/services/data-layer/__tests__/semantic-integration.test.ts

describe('Semantic Data Store Integration', () => {
  it('enables cross-domain queries', async () => {
    const userId = 'test-user';
    
    // Index diverse data
    onCommitmentChange(userId, 'c1', { 
      description: 'Finish project by Friday', 
      madeBy: 'user', 
      status: 'active' 
    });
    
    onCalendarEventChange(userId, 'e1', {
      title: 'Project deadline review',
      date: 'Friday',
    });
    
    onCapacityStateChange(userId, 's1', {
      level: 'low',
      factors: ['work pressure', 'deadline stress'],
      recommendation: 'Take breaks',
    });
    
    await flushPendingChanges();
    
    // Cross-domain query
    const results = await semanticSearch('project deadline stress', { userId });
    
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.map(r => r.source)).toContain('trust');
    expect(results.map(r => r.source)).toContain('calendar');
  });
});
```

### E2E Tests

```typescript
// e2e/semantic-data-store.test.ts

test('Ferni remembers commitments across sessions', async () => {
  // Session 1: Make commitment
  await connectToFerni();
  await speak('I promise to exercise every morning');
  await waitForResponse();
  await disconnect();
  
  // Session 2: Reference commitment
  await connectToFerni();
  await speak('What did I promise to do?');
  
  const response = await waitForResponse();
  expect(response.transcript).toContain('exercise');
  expect(response.transcript).toContain('morning');
});
```

---

## Rollout Checklist

### Pre-Launch

- [ ] Extend `EntityType` in `types.ts` (50+ new types)
- [ ] Create indexing policies for all new types
- [ ] Implement hook generator pattern
- [ ] Create domain-specific hooks
- [ ] Update context builders
- [ ] Add feature flag: `SEMANTIC_STORE_EXPANDED`
- [ ] Write unit tests (80% coverage)
- [ ] Write integration tests
- [ ] Performance benchmark

### Phase 1 Launch (Week 1)

- [ ] Deploy trust system hooks
- [ ] Deploy superhuman hooks
- [ ] Deploy calendar hooks
- [ ] Monitor indexing volume
- [ ] Monitor embedding costs
- [ ] Verify search quality

### Phase 2 Launch (Week 2)

- [ ] Deploy contacts hooks
- [ ] Deploy communication hooks
- [ ] Start background backfill
- [ ] Monitor Firestore costs

### Phase 3 Launch (Week 3-4)

- [ ] Deploy coaching hooks
- [ ] Deploy health hooks
- [ ] Deploy media hooks
- [ ] Full context builder integration

### Phase 4 Launch (Week 5-6)

- [ ] Deploy tool output hooks
- [ ] Deploy remaining domain hooks
- [ ] Complete backfill
- [ ] Performance optimization

### Post-Launch

- [ ] A/B test context quality
- [ ] User feedback collection
- [ ] Cost optimization
- [ ] Documentation update

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Semantic search latency | < 200ms p95 | Performance monitoring |
| Cache hit rate | > 60% | Cache metrics |
| Cross-domain query success | > 80% | Manual evaluation |
| Embedding cost per user | < $0.10/month | Cloud billing |
| Context relevance score | > 4.0/5.0 | User feedback |

---

## Appendix: File Structure

```
src/services/data-layer/
├── index.ts                    # Main facade
├── types.ts                    # Entity types (extended)
├── store-hooks.ts              # Base hook infrastructure
├── indexing-policy.ts          # Indexing policies
├── query-router.ts             # Semantic vs structured routing
├── hook-generator.ts           # NEW: Hook factory
├── indexing-orchestrator.ts    # NEW: Batch processing
├── hooks/                      # NEW: Domain-specific hooks
│   ├── index.ts
│   ├── trust-hooks.ts
│   ├── superhuman-hooks.ts
│   ├── calendar-hooks.ts
│   ├── contacts-hooks.ts
│   ├── coaching-hooks.ts
│   ├── health-hooks.ts
│   ├── media-hooks.ts
│   ├── career-hooks.ts
│   └── tool-output-hooks.ts
├── policies/                   # NEW: Domain-specific policies
│   ├── trust-policies.ts
│   ├── superhuman-policies.ts
│   └── ...
└── __tests__/
    ├── hooks.test.ts
    ├── semantic-integration.test.ts
    └── performance.test.ts
```

---

*Last updated: December 2024*
*Author: Ferni Engineering Team*
