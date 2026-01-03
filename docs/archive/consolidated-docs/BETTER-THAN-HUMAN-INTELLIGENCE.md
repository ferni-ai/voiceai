# 🧠 "Better Than Human" Intelligence Architecture

> **"Your best friend forgets. We don't."**

This document describes Ferni's unified intelligence system that enables superhuman awareness of users.

## Core Philosophy

| Human Limitation | Ferni's Capability |
|------------------|-------------------|
| Friends forget details | We remember **everything** |
| Therapists have other patients | We're **always fully present** |
| Mentors don't track patterns | We see **correlations across time** |
| Support networks get tired | 2am gets the **same warmth as noon** |

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FERNI INTELLIGENCE SYSTEM                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    UNIFIED INTELLIGENCE API                          │   │
│  │                 src/intelligence/unified-intelligence-api.ts         │   │
│  │                                                                       │   │
│  │  getCompleteIntelligence()     ─── "Better Than Human" mode         │   │
│  │  getIntelligenceForTurn()      ─── Per-turn context                  │   │
│  │  askAboutUser()                ─── Natural language queries          │   │
│  │  doWeKnow()                    ─── Existence checks                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│           ┌────────────────────────┼────────────────────────┐              │
│           │                        │                        │              │
│           ▼                        ▼                        ▼              │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐  │
│  │ Context Assembly │   │ User Knowledge  │   │ Proactive Intelligence │  │
│  │                  │   │                 │   │                         │  │
│  │ • Recent memory  │   │ • Identity      │   │ • Surface triggers      │  │
│  │ • Topic tracking │   │ • Preferences   │   │ • Cross-domain links    │  │
│  │ • Emotion state  │   │ • Relationships │   │ • Pattern surfacing     │  │
│  │ • Session context│   │ • Aspirations   │   │ • Growth moments        │  │
│  └─────────────────┘   │ • Wellness      │   └─────────────────────────┘  │
│                        │ • Work style    │                                 │
│                        │ • Boundaries    │                                 │
│                        │ • Shared history│                                 │
│                        └─────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                           DATA SOURCES                                       │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │ PASSIVE LEARNING  │  │  DATA CAPTURES    │  │ SUPERHUMAN SVCS   │        │
│  │                   │  │                   │  │                   │        │
│  │ preference-       │  │ definitions/      │  │ semantic-intel/   │        │
│  │ extractor.ts      │  │ • contacts        │  │ • correlations    │        │
│  │                   │  │ • commitments     │  │ • trajectories    │        │
│  │ 30+ categories:   │  │ • dreams          │  │ • growth print    │        │
│  │ • Music genres    │  │ • mood            │  │                   │        │
│  │ • Food cuisines   │  │ • relationships   │  │ Other superhuman: │        │
│  │ • Exercise types  │  │ • boundaries      │  │ • Inside jokes    │        │
│  │ • Sleep patterns  │  │                   │  │ • Ferni promises  │        │
│  │ • Travel styles   │  │                   │  │ • Protected topics│        │
│  │ • Learning goals  │  │                   │  │                   │        │
│  │ • Social styles   │  │                   │  │                   │        │
│  │ • And more...     │  │                   │  │                   │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐                               │
│  │   USER PROFILE    │  │  INFO PREFERENCES │                               │
│  │                   │  │                   │                               │
│  │ • Identity        │  │ • Sports teams    │                               │
│  │ • Account type    │  │ • Stock watchlist │                               │
│  │ • Voice profiles  │  │ • News interests  │                               │
│  │ • Conv history    │  │ • Locations       │                               │
│  │                   │  │ • Allergies       │                               │
│  └───────────────────┘  └───────────────────┘                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Persisted in
                                    ▼
                    ┌─────────────────────────────────┐
                    │         FIRESTORE               │
                    │                                 │
                    │ bogle_users/{userId}/           │
                    │ ├── lifestyle_preferences/      │
                    │ │   ├── music                   │
                    │ │   ├── food                    │
                    │ │   ├── entertainment           │
                    │ │   ├── wellness                │
                    │ │   ├── travel                  │
                    │ │   ├── learning                │
                    │ │   └── social                  │
                    │ ├── contacts/                   │
                    │ ├── commitments/                │
                    │ ├── dreams/                     │
                    │ ├── boundaries/                 │
                    │ └── preferences/                │
                    └─────────────────────────────────┘
```

## Key Components

### 1. Unified Intelligence API
**Location**: `src/intelligence/unified-intelligence-api.ts`

The single entry point for all intelligence:

```typescript
// Get complete intelligence (Better Than Human mode)
const intel = await getCompleteIntelligence(userId, {
  forceRefresh: true,
  knowledgeMaxTokens: 600,
});

// Use in conversation
console.log(intel.knowledgeContext); // Formatted for LLM injection
console.log(intel.userKnowledge.meta.dataPointCount); // How much we know
```

### 2. User Knowledge Module
**Location**: `src/intelligence/user-knowledge/`

| File | Purpose |
|------|---------|
| `types.ts` | 11 knowledge categories with detailed types |
| `aggregator.ts` | Pulls from all sources, caches results |
| `context-builder.ts` | Formats for LLM context injection |
| `queries.ts` | Targeted queries and natural language interface |

### 3. Preference Extractor
**Location**: `src/intelligence/preference-extractor.ts`

Passive learning from conversation - 30+ preference categories:

| Category | Examples |
|----------|----------|
| Music | Genres, artists, dislikes |
| Food | Cuisines, dietary restrictions, drinks |
| Exercise | Types, frequency, wellness practices |
| Sleep | Night owl, early bird, patterns |
| Travel | Adventure, luxury, bucket list |
| Learning | Languages, skills, current goals |
| Social | Introvert/extrovert, communication style |
| Entertainment | Movies, TV, books, games |
| Productivity | Morning person, work preferences |

### 4. Data Capture Definitions
**Location**: `src/intelligence/data-capture/definitions/`

Structured extraction of specific data:
- Contacts and relationships
- Commitments and promises
- Dreams and aspirations
- Mood and emotional state
- Boundaries and sensitivities

### 5. Superhuman Services
**Location**: `src/services/superhuman/`

Advanced intelligence that goes beyond human capability:

| Service | Capability |
|---------|------------|
| Correlation Mining | Finds patterns across domains |
| Emotional Trajectories | Tracks emotional arcs over time |
| Growth Fingerprint | Documents personal evolution |
| Inside Jokes | Builds shared history |
| Ferni Commitments | Tracks our promises to users |
| Protective Silence | Knows what not to bring up |

## Usage in Voice Agent

### At Conversation Start

```typescript
// transcript-handler.ts or turn-handler.ts

// Get complete intelligence for this user
const intelligence = await getCompleteIntelligence(userId, {
  forceRefresh: true,
});

// Inject into system prompt
const contextSection = `
[WHAT YOU KNOW ABOUT ${intelligence.userKnowledge.identity.name || 'THIS USER'}]
${intelligence.knowledgeContext}

[RECENT CONTEXT]
${intelligence.context.summary}
`;
```

### During Conversation

```typescript
// Check boundaries before responding
const avoid = await getAvoidTopics(userId);
if (avoid.data.includes(topic)) {
  // Steer conversation away
}

// Safety-critical checks
const allergies = await getUserAllergies(userId);
if (allergies.data.length > 0 && mentioningFood) {
  // Include allergy warning
}
```

### After Each Turn

```typescript
// Preference extraction runs automatically in transcript-handler
const prefs = extractPreferences(userTranscript);
for (const pref of prefs) {
  await saveExtractedPreference(userId, pref);
}
```

## Knowledge Categories

### 1. Identity
```typescript
{
  name: "Alex",
  nickname: "Al",
  pronouns: "they/them",
  accountType: "friend",
  totalConversations: 47,
  firstConversation: Date
}
```

### 2. Lifestyle Preferences
```typescript
{
  entertainment: {
    musicLikes: ["jazz", "indie"],
    musicDislikes: ["country"],
    movieGenres: ["sci-fi", "documentaries"],
    tvShows: ["The Office"],
    podcasts: ["Serial"],
    books: ["science fiction"],
    games: ["strategy"]
  },
  food: {
    cuisineLikes: ["Thai", "Italian"],
    cuisineDislikes: ["spicy food"],
    dietaryRestrictions: ["vegetarian"],
    drinkPreferences: ["oat milk lattes"],
    favoriteRestaurants: []
  },
  // ... sports, news, finance, travel, pets
}
```

### 3. Relationships
```typescript
{
  contacts: [
    { name: "Mom", relationship: "mother", sentiment: "positive" },
    { name: "Jake", relationship: "boss", sentiment: "complicated" },
  ],
  socialBattery: {
    type: "introvert",
    rechargeActivities: ["reading", "hiking"]
  }
}
```

### 4. Aspirations
```typescript
{
  dreams: [
    { description: "Write a novel", status: "active" },
    { description: "Learn piano", status: "paused" }
  ],
  commitments: [
    { description: "Call mom weekly", toWhom: "Mom", status: "pending" }
  ],
  learning: {
    languages: ["Spanish"],
    skills: ["photography", "cooking"]
  }
}
```

### 5. Wellness
```typescript
{
  health: {
    allergies: ["peanuts", "shellfish"], // ⚠️ CRITICAL
    conditions: ["anxiety"]
  },
  fitness: {
    routines: ["yoga", "running"]
  },
  mental: {
    practices: ["meditation", "journaling"]
  },
  sleep: {
    chronotype: "night_owl"
  }
}
```

### 6. Boundaries
```typescript
{
  avoidTopics: ["divorce", "politics"],
  protectiveSilences: [
    { topic: "recent breakup", reason: "still healing" }
  ]
}
```

### 7. Shared History
```typescript
{
  insideJokes: [
    { reference: "the sock incident", context: "Funny story from Feb" }
  ],
  ferniCommitments: [
    { description: "Check on their job interview next week", status: "pending" }
  ]
}
```

## Context Injection Example

The `formatKnowledgeForContext()` function produces:

```
[WHO THEY ARE]
Name: Alex (goes by Al)
Relationship: good friend (47 conversations)

[BOUNDARIES - RESPECT THESE]
Avoid topics: divorce, politics
Don't bring up: recent breakup (still healing)

[EMOTIONAL STATE]
Trend: 📈 improving
Recent arc: work stress (overwhelmed → hopeful)

[PEOPLE IN THEIR LIFE]
Mom (mother) 💚
Jake (boss) 💛
Sarah (friend) 💚

[DREAMS & GOALS]
Dreams: Write a novel; Learn piano
Learning: Spanish, photography

[PREFERENCES]
Music: loves jazz, indie
Music: dislikes country
Food: Thai, Italian
Diet: vegetarian
Sports: Lakers fan

[YOUR HISTORY TOGETHER]
Inside joke: "the sock incident" (Funny story from Feb)
You promised: Check on their job interview next week
```

## Performance

### Caching Strategy

| Cache Level | TTL | Use Case |
|-------------|-----|----------|
| Knowledge Cache | 5 min | Default aggregation |
| Force Refresh | 0 | Conversation start |
| Section-specific | 5 min | Targeted queries |

### Completeness Scoring

| Data Points | Completeness |
|-------------|--------------|
| 0-10 | 0-10% |
| 10-25 | 10-25% |
| 25-50 | 25-50% |
| 50-100 | 50-75% |
| 100+ | 75-100% |

## Related Documentation

- [Preference Extractor Categories](../../src/intelligence/preference-extractor.ts)
- [User Knowledge README](../../src/intelligence/user-knowledge/README.md)
- [Superhuman Services README](../../src/services/superhuman/README.md)
- [Data Capture Definitions](../../src/intelligence/data-capture/definitions/)
- [Core Principles](../../CORE-PRINCIPLES.md)

---

*"Better than human" isn't arrogance—it's a promise. We offer what humans can't: perfect memory, constant presence, zero judgment, and unwavering warmth.*
