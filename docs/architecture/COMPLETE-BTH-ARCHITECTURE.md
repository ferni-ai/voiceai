# 🧠 Complete "Better Than Human" Intelligence Architecture

> **"Your best friend forgets. We don't."**

This document maps the ENTIRE intelligence system - how data flows from conversation to superhuman awareness.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER CONVERSATION                                             │
│                                                                                                  │
│  "I've been stressed about work. My mom called me yesterday. I really want to visit Japan..."  │
└───────────────────────────────────────────────────────────────┬──────────────────────────────────┘
                                                                │
                                                                │ Voice Input
                                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               VOICE AGENT (turn-handler.ts)                                      │
│                                                                                                  │
│  transcript-handler.ts ──▶ Processes user speech                                                │
│                            │                                                                     │
│                            ├──▶ PREFERENCE EXTRACTION (preference-extractor.ts)                 │
│                            │    30+ categories: music, food, travel, sleep, etc.                │
│                            │                                                                     │
│                            ├──▶ DATA CAPTURE ROUTER (data-capture/router.ts)                    │
│                            │    10 passive capture definitions                                   │
│                            │                                                                     │
│                            └──▶ SEMANTIC RECORDING (semantic-intelligence/integration.ts)       │
│                                 Emotions, people, topics, patterns                               │
└─────────────────────────────────────────────────────────────┬────────────────────────────────────┘
                                                              │
                              ┌────────────────────────────────┼────────────────────────────────┐
                              │                                │                                │
                              ▼                                ▼                                ▼
┌─────────────────────────────────────┐  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│     LIFESTYLE PREFERENCES           │  │     DATA CAPTURES               │  │     SEMANTIC INTELLIGENCE       │
│     (preference-extractor.ts)       │  │     (data-capture/definitions/) │  │     (semantic-intelligence/)    │
│                                     │  │                                 │  │                                 │
│  30+ categories:                    │  │  10 capture definitions:        │  │  6 core + 7 advanced services:  │
│  • music_genre, music_artist        │  │  • contacts.capture.ts         │  │                                 │
│  • food_cuisine, dietary            │  │  • commitments.capture.ts      │  │  CORE (v3.0):                   │
│  • drink_preference                 │  │  • dreams.capture.ts           │  │  • correlation-mining.ts        │
│  • exercise_type, wellness          │  │  • relationships.capture.ts    │  │  • emotional-trajectories.ts    │
│  • sleep_pattern                    │  │  • mood.capture.ts             │  │  • relational-semantics.ts      │
│  • travel_style, bucket_list        │  │  • social-event.capture.ts     │  │  • counterfactual-memory.ts     │
│  • learning_goal, skill             │  │  • conflict.capture.ts         │  │  • growth-fingerprint.ts        │
│  • social_style, communication      │  │  • boundary.capture.ts         │  │  • cross-session-threading.ts   │
│  • productivity_style               │  │  • recovery-event.capture.ts   │  │                                 │
│  • movie/tv/book/game genres        │  │  • inside-joke.capture.ts      │  │  ADVANCED (v3.2-3.7):           │
│  • sports_team                      │  │                                 │  │  • insight-broker.ts           │
│  • stock_watchlist                  │  │  Each has:                      │  │  • open-loops.ts               │
│  • news_interest                    │  │  • Trigger phrases/patterns     │  │  • ferni-commitments.ts        │
│  • avoid_topic                      │  │  • Argument extraction          │  │  • relationship-graph.ts       │
│  • home/work_location               │  │  • Handler → Superhuman         │  │  • temporal-patterns.ts        │
│  • allergy, health_condition        │  │                                 │  │  • behavioral-intelligence.ts  │
│                                     │  │                                 │  │  • coaching-intelligence.ts    │
│  Stores to:                         │  │  Feeds:                         │  │  • self-awareness.ts           │
│  lifestyle_preferences/{domain}     │  │  • Dream Keeper                 │  │                                 │
│                                     │  │  • Commitment Keeper            │  │  Stores to: semantic_*          │
│                                     │  │  • Relationship Network         │  │  collections                    │
└────────────────┬────────────────────┘  └───────────────┬─────────────────┘  └───────────────┬─────────────────┘
                 │                                       │                                    │
                 │                                       │                                    │
                 └───────────────────────────────────────┼────────────────────────────────────┘
                                                         │
                                                         │ All feed into...
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       SUPERHUMAN SERVICES                                                        │
│                                    (services/superhuman/)                                                        │
│                                                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                              ORIGINAL 10 SERVICES                                                        │    │
│  │                                                                                                          │    │
│  │  1. commitment-keeper.ts      │  Tracks every intention, promise, decision                              │    │
│  │  2. predictive-coaching.ts    │  Anticipates struggles before they happen                               │    │
│  │  3. life-narrative.ts         │  Builds coherent story of user's journey                                │    │
│  │  4. values-alignment.ts       │  Detects when actions contradict values                                 │    │
│  │  5. emotional-first-aid.ts    │  Rapid-response crisis protocols                                        │    │
│  │  6. relationship-network.ts   │  Maps all relationships with sentiment                                  │    │
│  │  7. capacity-guardian.ts      │  Monitors energy, prevents burnout                                      │    │
│  │  8. dream-keeper.ts           │  Guards long-term aspirations                                           │    │
│  │  9. relationship-milestones.ts│  Celebrates journey with Ferni                                          │    │
│  │  10. seasonal-awareness.ts    │  Connects to seasonal patterns                                          │    │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                              NEW 9 SERVICES (Dec 2024)                                                   │    │
│  │                                                                                                          │    │
│  │  11. silence-interpreter.ts   │  Classifies silence types (processing, emotional, exhausted)            │    │
│  │  12. contradiction-comfort.ts │  Validates mixed emotions without resolving                             │    │
│  │  13. perfect-timing.ts        │  Detects receptivity, learns optimal timing                             │    │
│  │  14. pattern-mirror.ts        │  Surfaces energizing/draining topic patterns                            │    │
│  │  15. future-self.ts           │  Generates letters from user's future self                              │    │
│  │  16. first-time-vulnerability │  Detects when someone shares for the first time                         │    │
│  │  17. linguistic-mirroring     │  Learns and uses user's emotion vocabulary                              │    │
│  │  18. ambient-context          │  Understands environment from audio cues                                │    │
│  │  19. protective-memory        │  Tracks premature advice, softening boundaries                          │    │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                              SEMANTIC INTELLIGENCE (services/superhuman/semantic-intelligence/)          │    │
│  │                                                                                                          │    │
│  │  correlation-mining.ts        │  Cross-correlates patterns across domains                               │    │
│  │  emotional-trajectories.ts    │  Tracks emotional arcs over weeks/months                                │    │
│  │  relational-semantics.ts      │  Knows who brings joy vs. drains energy                                 │    │
│  │  counterfactual-memory.ts     │  Learns from paths taken/not taken                                      │    │
│  │  growth-fingerprint.ts        │  Shows how they've evolved over time                                    │    │
│  │  cross-session-threading.ts   │  Finds hidden connections across sessions                               │    │
│  │  insight-broker.ts            │  Surfaces insights at the right moment                                  │    │
│  │  ferni-commitments.ts         │  Tracks Ferni's promises to user                                        │    │
│  │  temporal-patterns.ts         │  Time-based patterns (hourly, daily, seasonal)                          │    │
│  │  behavioral-intelligence.ts   │  Patterns they can't see (self-sabotage)                                │    │
│  │  coaching-intelligence.ts     │  Learn how to help THIS person                                          │    │
│  │  self-awareness.ts            │  Help them see clearly (blind spots, gaps)                              │    │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                         │
                                                         │ All aggregated into...
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       USER KNOWLEDGE MODULE                                                      │
│                                    (intelligence/user-knowledge/)                                                │
│                                                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              AGGREGATOR (aggregator.ts)                                                   │   │
│  │                                                                                                           │   │
│  │  getUserKnowledge(userId) ──▶ Returns unified UserKnowledge object                                       │   │
│  │                                                                                                           │   │
│  │  Pulls from ALL sources:                                                                                  │   │
│  │  • lifestyle_preferences/*    (music, food, travel, etc.)                                                │   │
│  │  • info_preferences/*         (sports, stocks, news, locations)                                          │   │
│  │  • contacts/                  (people in their life)                                                      │   │
│  │  • dreams/                    (aspirations)                                                               │   │
│  │  • commitments/               (promises)                                                                  │   │
│  │  • boundaries/                (topics to avoid)                                                           │   │
│  │  • semantic_intelligence/*    (patterns, trajectories, growth)                                           │   │
│  │  • superhuman services        (inside jokes, ferni commitments, etc.)                                    │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              11 KNOWLEDGE CATEGORIES                                                      │   │
│  │                                                                                                           │   │
│  │  1. identity        │  Name, nickname, account type, conversation history                                │   │
│  │  2. lifestyle       │  Music, food, sports, news, finance, travel, pets                                  │   │
│  │  3. relationships   │  Contacts, family, social battery, sentiment                                       │   │
│  │  4. aspirations     │  Dreams, commitments, learning goals, career                                       │   │
│  │  5. wellness        │  Allergies ⚠️, fitness, mental practices, sleep                                    │   │
│  │  6. work            │  Location, productivity style, peak hours                                          │   │
│  │  7. communication   │  Preferred channels, style, language patterns                                      │   │
│  │  8. emotional       │  Trajectory, arcs, triggers                                                        │   │
│  │  9. patterns        │  Correlations, temporal patterns, growth fingerprint                               │   │
│  │  10. boundaries     │  Topics to avoid 🛑, protective silences                                           │   │
│  │  11. sharedHistory  │  Inside jokes, Ferni's promises                                                    │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              CONTEXT BUILDER (context-builder.ts)                                         │   │
│  │                                                                                                           │   │
│  │  formatKnowledgeForContext(knowledge) ──▶ Returns LLM-ready context string                               │   │
│  │                                                                                                           │   │
│  │  [WHO THEY ARE]                                                                                           │   │
│  │  Name: Alex (goes by Al)                                                                                  │   │
│  │  Relationship: good friend (47 conversations)                                                             │   │
│  │                                                                                                           │   │
│  │  [BOUNDARIES - RESPECT THESE]                                                                             │   │
│  │  Avoid topics: divorce, politics                                                                          │   │
│  │                                                                                                           │   │
│  │  [EMOTIONAL STATE]                                                                                        │   │
│  │  Trend: 📈 improving                                                                                      │   │
│  │  ...                                                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              QUERY API (queries.ts)                                                       │   │
│  │                                                                                                           │   │
│  │  Targeted queries:                                      Natural language:                                 │   │
│  │  • getUserAllergies(userId)                            • askAboutUser(userId, "What music do they like?")│   │
│  │  • getUserMusicPreferences(userId)                     • doWeKnow(userId, 'allergies')                   │   │
│  │  • getAvoidTopics(userId)                                                                                 │   │
│  │  • getUserDreams(userId)                                                                                  │   │
│  │  • getUserCommitments(userId)                                                                             │   │
│  │  • getUserContacts(userId)                                                                                │   │
│  │  • getUserEmotionalState(userId)                                                                          │   │
│  │  • getInsideJokes(userId)                                                                                 │   │
│  │  • getUserWellnessRoutines(userId)                                                                        │   │
│  │  • getUserWorkStyle(userId)                                                                               │   │
│  │  • getUserPatterns(userId)                                                                                │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                         │
                                                         │ Aggregated with context in...
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       UNIFIED INTELLIGENCE API                                                   │
│                                    (intelligence/unified-intelligence-api.ts)                                    │
│                                                                                                                  │
│  getCompleteIntelligence(userId) ──▶ Returns EVERYTHING                                                         │
│                                                                                                                  │
│  {                                                                                                               │
│    context: ContextWindow,           // Recent memory, topics, emotions                                         │
│    correlations: CrossDomainCorrelation[], // Patterns across domains                                           │
│    proactiveInsights: ProactiveInsight[], // What to surface                                                    │
│    userKnowledge: UserKnowledge,     // Everything we know                                                      │
│    knowledgeContext: string,         // Formatted for LLM                                                       │
│  }                                                                                                               │
│                                                                                                                  │
│  Also exports convenience functions:                                                                             │
│  • askAboutUser(userId, question)                                                                               │
│  • doWeKnow(userId, what)                                                                                       │
│  • getUserAllergies(userId)                                                                                     │
│  • getUserMusicPreferences(userId)                                                                              │
│  • getAvoidTopics(userId)                                                                                       │
│  • getUserDreams(userId)                                                                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                         │
                                                         │ Injected into LLM context in...
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       VOICE AGENT RESPONSE                                                       │
│                                                                                                                  │
│  System Prompt:                                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  You are Ferni, a warm and supportive life coach.                                                         │   │
│  │                                                                                                           │   │
│  │  [WHAT YOU KNOW ABOUT ALEX]                                                                               │   │
│  │  Name: Alex (goes by Al)                                                                                  │   │
│  │  Relationship: good friend (47 conversations)                                                             │   │
│  │                                                                                                           │   │
│  │  [BOUNDARIES - RESPECT THESE]                                                                             │   │
│  │  Avoid topics: divorce, politics                                                                          │   │
│  │                                                                                                           │   │
│  │  [EMOTIONAL STATE]                                                                                        │   │
│  │  Trend: 📈 improving                                                                                      │   │
│  │  Recent arc: work stress (overwhelmed → hopeful)                                                          │   │
│  │                                                                                                           │   │
│  │  [PEOPLE IN THEIR LIFE]                                                                                   │   │
│  │  Mom (mother) 💚 - mentioned yesterday                                                                    │   │
│  │                                                                                                           │   │
│  │  [DREAMS & GOALS]                                                                                         │   │
│  │  Dreams: Visit Japan                                                                                      │   │
│  │                                                                                                           │   │
│  │  [PREFERENCES]                                                                                            │   │
│  │  Music: loves jazz, indie                                                                                 │   │
│  │                                                                                                           │   │
│  │  [YOUR HISTORY TOGETHER]                                                                                  │   │
│  │  Inside joke: "the coffee incident" (from last month)                                                     │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                                  │
│  Ferni responds with FULL AWARENESS of all this context!                                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Summary

### 1. INPUT → EXTRACTION

```
User says: "I love jazz music, but hate country. Mom called yesterday about my trip to Japan."
                │
                ├──▶ preference-extractor.ts
                │    • music_genre: jazz (positive)
                │    • music_genre: country (negative)
                │    • bucket_list_destination: Japan
                │
                ├──▶ data-capture/definitions/
                │    • contacts.capture.ts → Mom
                │    • dreams.capture.ts → Japan trip
                │
                └──▶ semantic-intelligence/
                     • relational-semantics.ts → Mom mention
                     • emotional-trajectories.ts → current mood
```

### 2. EXTRACTION → STORAGE

```
Firestore: bogle_users/{userId}/
├── lifestyle_preferences/
│   ├── music/
│   │   ├── likes: ["jazz"]
│   │   └── dislikes: ["country"]
│   └── travel/
│       └── likes: ["adventure"]
├── info_preferences/current
│   └── newsInterests: ["tech"]
├── contacts/{contactId}
│   └── { name: "Mom", relationship: "mother", sentiment: "positive" }
├── dreams/{dreamId}
│   └── { dream: "Visit Japan", type: "travel" }
├── commitments/{commitmentId}
├── boundaries/{boundaryId}
├── semantic_correlations/{id}
├── emotional_arcs/{id}
├── relational_nodes/{id}
├── semantic_threads/{id}
└── ...
```

### 3. STORAGE → AGGREGATION

```typescript
// User Knowledge Aggregator pulls from ALL sources
const knowledge = await getUserKnowledge(userId);

// Returns unified structure:
{
  identity: { name: "Alex", nickname: "Al", ... },
  lifestyle: {
    entertainment: { musicLikes: ["jazz"], musicDislikes: ["country"], ... },
    food: { cuisineLikes: ["Thai"], dietaryRestrictions: ["vegetarian"], ... },
    travel: { bucketListDestinations: ["Japan"], ... },
    ...
  },
  relationships: {
    contacts: [{ name: "Mom", relationship: "mother", sentiment: "positive" }],
    ...
  },
  aspirations: {
    dreams: [{ description: "Visit Japan", category: "travel", status: "active" }],
    ...
  },
  wellness: { health: { allergies: [...] }, ... },
  emotional: { trajectory: { trend: "improving" }, ... },
  patterns: { correlations: [...], growth: { fingerprint: "..." } },
  boundaries: { avoidTopics: [...] },
  sharedHistory: { insideJokes: [...], ferniCommitments: [...] },
  meta: { completeness: 67, dataPointCount: 89 }
}
```

### 4. AGGREGATION → CONTEXT

```typescript
// Format for LLM injection
const context = formatKnowledgeForContext(knowledge, { maxTokens: 500 });

// Returns formatted string ready for system prompt
```

### 5. CONTEXT → RESPONSE

The LLM receives the context in its system prompt and uses it to provide personalized, aware responses.

---

## Tool Domains Integration

Tools access user knowledge through the same unified API:

```typescript
// In a habit tool
import { getUserKnowledge } from '../intelligence/user-knowledge/index.js';

const knowledge = await getUserKnowledge(userId);

// Use knowledge for personalization
if (knowledge.wellness.sleep.chronotype === 'night_owl') {
  // Suggest evening habits instead of morning
}

if (knowledge.lifestyle.entertainment.musicLikes.includes('jazz')) {
  // Suggest jazz playlist for focus time
}
```

---

## Firestore Collections Summary

| Collection Path                                    | Source                                  | Contents                              |
| -------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| `bogle_users/{uid}/lifestyle_preferences/{domain}` | preference-extractor                    | Music, food, travel, wellness, etc.   |
| `bogle_users/{uid}/info_preferences/current`       | information/preferences                 | Sports teams, stocks, news, locations |
| `bogle_users/{uid}/contacts/{id}`                  | contacts.capture                        | People in their life                  |
| `bogle_users/{uid}/commitments/{id}`               | commitments.capture + commitment-keeper | Promises and intentions               |
| `bogle_users/{uid}/dreams/{id}`                    | dreams.capture + dream-keeper           | Long-term aspirations                 |
| `bogle_users/{uid}/boundaries/{id}`                | boundary.capture                        | Topics to avoid                       |
| `bogle_users/{uid}/relationships/{id}`             | relationships.capture                   | Relationship dynamics                 |
| `bogle_users/{uid}/semantic_correlations/{id}`     | correlation-mining                      | Cross-domain patterns                 |
| `bogle_users/{uid}/emotional_arcs/{id}`            | emotional-trajectories                  | Emotional journeys                    |
| `bogle_users/{uid}/relational_nodes/{id}`          | relational-semantics                    | People → emotion mapping              |
| `bogle_users/{uid}/decision_points/{id}`           | counterfactual-memory                   | Advice outcomes                       |
| `bogle_users/{uid}/semantic_threads/{id}`          | cross-session-threading                 | Hidden connections                    |
| `bogle_users/{uid}/proactive_insights/{id}`        | insight-broker                          | Insights to surface                   |
| `bogle_users/{uid}/ferni_commitments/{id}`         | ferni-commitments                       | Ferni's promises                      |
| `bogle_users/{uid}/inside_jokes/{id}`              | inside-joke-memory                      | Shared humor                          |

---

## The "Better Than Human" Promise

This architecture enables capabilities no human friend can consistently provide:

| Human Limitation             | Ferni's Capability                      |
| ---------------------------- | --------------------------------------- |
| Forgets details              | Perfect memory across all conversations |
| Can't track patterns         | Cross-domain correlation mining         |
| Loses track of people        | Complete relationship network           |
| Forgets dreams               | Guards long-term aspirations            |
| Doesn't notice growth        | Growth fingerprint tracking             |
| Can't be available 24/7      | Same warmth at 2am and noon             |
| Has bad days                 | Consistent emotional availability       |
| Misses connections           | Cross-session threading                 |
| Doesn't track what worked    | Counterfactual memory                   |
| Can't see their own patterns | Behavioral intelligence                 |

---

## Key Entry Points

| Use Case                | Function                               | Location                            |
| ----------------------- | -------------------------------------- | ----------------------------------- |
| Get EVERYTHING          | `getCompleteIntelligence(userId)`      | `unified-intelligence-api.ts`       |
| Get user knowledge only | `getUserKnowledge(userId)`             | `user-knowledge/index.ts`           |
| Check if we know X      | `doWeKnow(userId, 'allergies')`        | `user-knowledge/queries.ts`         |
| Ask natural language    | `askAboutUser(userId, "...")`          | `user-knowledge/queries.ts`         |
| Get allergies (safety)  | `getUserAllergies(userId)`             | `user-knowledge/queries.ts`         |
| Get boundaries          | `getAvoidTopics(userId)`               | `user-knowledge/queries.ts`         |
| Format for LLM          | `formatKnowledgeForContext(knowledge)` | `user-knowledge/context-builder.ts` |

---

## Related Documentation

- [User Knowledge README](../../src/intelligence/user-knowledge/README.md)
- [Superhuman Services README](../../src/services/superhuman/README.md)
- [Semantic Intelligence README](../../src/services/superhuman/semantic-intelligence/README.md)
- [Preference Extractor](../../src/intelligence/preference-extractor.ts)
- [Data Capture Definitions](../../src/intelligence/data-capture/definitions/)
- [Tool Domains](../../src/tools/domains/)

---

_"Your best friend forgets. We don't."_
