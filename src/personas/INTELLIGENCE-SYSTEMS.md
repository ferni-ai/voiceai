# Persona Intelligence Systems

> "We believe in making AI human, and the decisions we make will reflect that."

This document describes the four advanced persona systems that make Ferni "Better than Human."

---

## Quick Start

```typescript
import {
  // Unified engine (recommended)
  getPersonaIntelligence,

  // Individual systems (if needed)
  getRelationshipEngine,
  getCognitiveDifferentiation,
  getTeamReference,
  checkTeamInsideJoke,
} from '../personas/index.js';

// Create unified intelligence engine for a user-persona pair
const intelligence = getPersonaIntelligence('ferni', userId);

// Start session
intelligence.startSession();

// Get prompt injection for LLM
const injection = intelligence.buildPromptInjection(currentTopic);
// Use injection.combined in your system prompt

// Record significant moments
intelligence.recordMoment('breakthrough', 'User realized why they were avoiding the conversation');

// Get persona-appropriate question
const question = intelligence.getQuestion('deep_dive');

// End session
intelligence.endSession('positive', 'high', ['career', 'relationships']);
```

---

## System 1: Relationship Memory Engine

**Location:** `src/personas/relationship-memory/`

Tracks the evolving relationship between each persona and user.

### Key Concepts

| Concept                  | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| **Relationship Stage**   | stranger → acquaintance → friend → trusted_advisor → inner_circle |
| **Shared Moments**       | Significant events (breakthroughs, first vulnerability, laughter) |
| **Inside Jokes**         | Phrases that become "our things" over time                        |
| **Milestones**           | Session counts, anniversaries, trust level achievements           |
| **Emotional Trajectory** | Improving / stable / declining / variable                         |

### Usage

```typescript
import { getRelationshipEngine } from '../personas/index.js';

// Get engine for user-persona pair
const engine = getRelationshipEngine(userId, 'ferni');

// Start session
engine.startSession();

// Record moments
engine.recordMoment('breakthrough', 'User had insight about career fears', {
  topic: 'career',
  userPhrase: 'I never realized I was scared of success',
  significance: 0.9,
});

// Record inside joke seed
engine.recordInsideJokeSeed(
  'inbox bankruptcy',
  'User coined this term for their email situation',
  'high'
);

// Get relationship context for prompts
const context = engine.getRelationshipContext();
// context.stage, context.trustScore, context.recentMoments, etc.

// Build prompt injection
const injection = engine.buildPromptInjection();
// injection.relationshipPreamble, injection.callbackSuggestions, etc.

// End session
engine.endSession('positive', 'high', ['email', 'productivity']);
```

### Relationship Stages

| Stage             | Sessions | Trust | Unlocks                                              |
| ----------------- | -------- | ----- | ---------------------------------------------------- |
| `stranger`        | 0+       | 0%    | Surface stories only                                 |
| `acquaintance`    | 3+       | 20%   | Basic callbacks                                      |
| `friend`          | 10+      | 50%   | Personal stories, inside jokes, protective responses |
| `trusted_advisor` | 25+      | 75%   | Vulnerable stories, meta-relationship comments       |
| `inner_circle`    | 50+      | 90%   | Deep secrets, full directness                        |

---

## System 2: Cognitive Differentiation

**Location:** `src/personas/cognitive-differentiation.ts`

Makes each persona think and respond distinctly differently.

### Dimensions

| Dimension                 | What It Controls                                     |
| ------------------------- | ---------------------------------------------------- |
| **Questioning Style**     | Open/closed, feeling/data, why/how focus             |
| **Silence Handling**      | How they interpret silence, comfort level, responses |
| **Disagreement Approach** | Gentle/curious/direct/philosophical style            |
| **Insight Framing**       | Story/data/metaphor/question/principle               |
| **Response Pacing**       | Thinking time, processing signals                    |

### Usage

```typescript
import {
  getCognitiveDifferentiation,
  getPersonaQuestion,
  getDisagreementPhrase,
  getInsightLeadIn,
} from '../personas/index.js';

// Get full profile
const profile = getCognitiveDifferentiation('ferni');
// profile.questioning.questionStarters
// profile.silence.primaryInterpretation
// profile.disagreement.primaryStyle
// etc.

// Get a question
const question = getPersonaQuestion('ferni', 'deep_dive');
// "What are you really afraid of here?"

// Get disagreement phrase
const pushback = getDisagreementPhrase('ferni', 'moderate');
// "I'm going to push back on that a little..."

// Get insight lead-in
const intro = getInsightLeadIn('peter-john');
// "Here's what the numbers show..."
```

### Per-Persona Styles

| Persona    | Questions               | Silence                  | Disagreement            | Insights          |
| ---------- | ----------------------- | ------------------------ | ----------------------- | ----------------- |
| **Ferni**  | Why-focused, feeling    | Reflection (5s comfort)  | Curious → Supportive    | Question framing  |
| **Peter**  | Data-seeking, pattern   | Processing (2s comfort)  | Data-driven → Direct    | Data framing      |
| **Alex**   | How-focused, process    | Confusion (2.5s comfort) | Direct → Supportive     | Example framing   |
| **Maya**   | Feeling-focused, gentle | Emotional (4s comfort)   | Gentle → Curious        | Story framing     |
| **Jordan** | Vision-focused, action  | Processing (2s comfort)  | Supportive → Direct     | Example framing   |
| **Nayan**  | Why-focused, depth      | Invitation (8s comfort)  | Philosophical → Curious | Principle framing |

---

## System 3: Team Chemistry

**Location:** `src/personas/shared/team-chemistry.ts` + `team-chemistry.json`

Natural team dynamics - how personas reference and work with each other.

### Features

- **Pair Dynamics:** Each persona pair has defined relationship and tension
- **Team References:** Admiration and playful teasing phrases
- **Inside Team Jokes:** Shared triggers ("spreadsheet" → "Peak Peter energy")
- **Handoff Context:** Share emotional state and topic during handoffs
- **Team Compliments:** "The team talks about you. Good things."

### Usage

```typescript
import {
  getTeamReference,
  checkTeamInsideJoke,
  getTeamCompliment,
  generateHandoffNote,
  shouldIncludeTeamReference,
} from '../personas/index.js';

// Get admiration reference
const ref = getTeamReference('ferni', 'peter-john', 'admiration');
// "Peter would have a field day with this data."

// Get playful teasing
const tease = getTeamReference('ferni', 'alex-chen', 'playful_teasing');
// "Alex probably has a system for having systems."

// Check for team inside joke
const joke = checkTeamInsideJoke('spreadsheet', 'ferni');
// { reference: "That's peak Peter energy." }

// Get team compliment for user
const compliment = getTeamCompliment('growth');
// "We've all seen the change in you."

// Generate handoff note
const note = generateHandoffNote(
  'ferni', // from
  'maya-santos', // to
  'habits', // topic
  'struggling', // emotional state
  'friend' // trust level
);
// "Ferni passed me a note about your habits conversation."

// Should include team reference?
if (shouldIncludeTeamReference(sessionNumber, lastTeamReferenceSession)) {
  // Add natural team reference to response
}
```

---

## System 4: Predictive Intelligence

**Location:** `src/personas/bundles/{persona}/content/behaviors/predictive-intelligence.json`

Anticipates user needs based on patterns.

### Pattern Types

| Type           | Examples                                                     |
| -------------- | ------------------------------------------------------------ |
| **Temporal**   | Sunday anxiety, Friday reflection, late night processing     |
| **Emotional**  | Deflection with humor, minimizing success, comparison spiral |
| **Behavioral** | Avoidance loops, decision delay, progress plateau            |

### Per-Persona Focus

| Persona    | Predictive Focus                                              |
| ---------- | ------------------------------------------------------------- |
| **Ferni**  | Emotional patterns, temporal rhythms, concern detection       |
| **Peter**  | Market behavior patterns, knowledge gaps, volatility warnings |
| **Alex**   | Communication avoidance, boundary erosion, calendar chaos     |
| **Maya**   | Habit patterns, motivation cycles, guilt detection            |
| **Jordan** | Uncelebrated wins, milestone anxiety, event anticipation      |
| **Nayan**  | Existential cycles, wisdom patterns, spiritual readiness      |

### Accessing Predictive Data

```typescript
// Predictive intelligence is loaded from bundle JSON
// Access via the unified intelligence engine:

const intelligence = getPersonaIntelligence('ferni', userId);
const context = intelligence.getContext();

// Check trajectory
if (context.predictive.concerns.length > 0) {
  // User may be struggling - lead with presence
}

// Or access directly from bundle behaviors
import { loadBundleById } from '../personas/bundles/loader.js';
const bundle = await loadBundleById('ferni');
const predictive = bundle.behaviors?.['predictive-intelligence'];
```

---

## Unified Integration

The `PersonaIntelligenceEngine` combines all four systems:

```typescript
import { getPersonaIntelligence } from '../personas/index.js';

// Create unified engine
const intelligence = getPersonaIntelligence('ferni', userId);

// Session lifecycle
intelligence.startSession();

// Get full context
const context = intelligence.getContext();
// - context.relationship (stage, trust, moments)
// - context.cognitive (profile, differentiation)
// - context.predictive (patterns, concerns)
// - context.team (references available)

// Build LLM prompt injection
const injection = intelligence.buildPromptInjection(currentTopic);
// - injection.relationshipSection
// - injection.cognitiveSection
// - injection.predictiveSection
// - injection.teamSection
// - injection.combined (all together)

// Record events
intelligence.recordMoment('breakthrough', 'User had insight');
intelligence.recordCallbackAttempt('goal', 'topic', 'positive', true, 'context');
intelligence.recordInsideJokeSeed('phrase', 'context', 'high');

// Get persona-appropriate content
const question = intelligence.getQuestion('deep_dive');
const disagreement = intelligence.getDisagreement('mild');
const silenceResponse = intelligence.getSilenceResponse(5000);
const teamRef = intelligence.getTeamRef('peter-john');
const handoff = intelligence.generateHandoff('maya-santos', 'habits', 'struggling');

// End session
intelligence.endSession('positive', 'high', ['career', 'relationships']);
```

---

## File Structure

```
src/personas/
├── relationship-memory/
│   ├── types.ts          # All relationship types
│   ├── engine.ts         # RelationshipMemoryEngine
│   └── index.ts          # Exports
├── cognitive-differentiation.ts  # All 6 persona profiles
├── shared/
│   ├── team-chemistry.json       # Team dynamics data
│   └── team-chemistry.ts         # Team chemistry functions
├── bundles/{persona}/content/behaviors/
│   └── predictive-intelligence.json  # Per-persona patterns
├── persona-intelligence.ts       # Unified integration
└── index.ts                      # Main exports
```

---

## Best Practices

1. **Use the unified engine** (`getPersonaIntelligence`) for most cases
2. **Start/end sessions** to track relationship progression
3. **Record moments** when something significant happens
4. **Use prompt injection** to give LLM relationship context
5. **Check trajectory** before responding (declining = lead with presence)
6. **Team references** should be occasional (15% frequency)
7. **Inside jokes** only after friend stage is reached

---

## Questions?

See the type definitions in each module for full API documentation.
