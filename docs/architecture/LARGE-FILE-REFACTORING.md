# Large File Refactoring Guide

This document outlines the plan for refactoring large files (>1500 lines) into smaller, more maintainable modules.

## Files to Refactor

| File | Lines | Priority | Status |
|------|-------|----------|--------|
| `src/agents/processors/turn-processor.ts` | 2955 | High | 🟡 Planned |
| `src/agents/voice-agent.ts` | 2768 | High | 🟡 Planned |
| `src/ssml-tagger.ts` | 2394 | Medium | 🟢 In Progress |
| `src/api/engagement-routes.ts` | 1707 | Medium | ✅ Complete |
| `src/services/superhuman/semantic-intelligence/integration.ts` | 1496 | Medium | 🟡 Planned |

---

## 1. engagement-routes.ts (1707 lines) ✅ COMPLETE

### Current Structure
Single file containing all engagement API routes.

### Target Structure
```
src/api/
├── routes/
│   ├── index.ts           # Re-exports all route handlers ✅
│   ├── conversations.ts   # GET /api/conversations ✅
│   ├── analytics.ts       # GET /api/analytics/* ✅
│   ├── predictions.ts     # GET/POST /api/predictions/* ✅
│   ├── memories.ts        # GET/DELETE /api/memories/* ✅
│   ├── rituals.ts         # CRUD /api/rituals/* ✅
│   ├── team.ts            # GET /api/team/* ✅
│   ├── data.ts            # GET/POST/DELETE /api/data/* ✅
│   └── relationship.ts    # GET/POST /api/relationship/* ✅
├── engagement-routes.ts   # Main router (uses modular routes)
├── helpers.ts             # Shared utilities
└── validators.ts          # Request validators
```

### Migration Steps
1. ✅ Create `routes/` directory
2. ✅ Extract `conversations.ts` 
3. ✅ Extract `rituals.ts`
4. ✅ Extract `analytics.ts`
5. ✅ Extract `predictions.ts`
6. ✅ Extract `memories.ts`
7. ✅ Extract `team.ts`
8. ✅ Extract `data.ts`
9. ✅ Extract `relationship.ts`
10. 🔲 Update main router to use modular handlers (optional - backwards compatible)

---

## 2. ssml-tagger.ts (2394 lines) 🟢 IN PROGRESS

### Current Structure
Single file containing SSML tagging logic, pronunciations, patterns, and emotion detection.

### Target Structure
```
src/ssml/
├── index.ts              # Main exports ✅
├── types.ts              # Type definitions ✅
├── constants.ts          # All pattern constants ✅
├── tags.ts               # SSML tag generators ✅
├── detection.ts          # Emotion/pacing detection ✅
└── (ssml-tagger.ts still handles main logic)
```

### Completed Extractions
- ✅ `types.ts` - PronunciationEntry, TaggingContext, DetectedPacing, etc.
- ✅ `constants.ts` - FINANCIAL_PRONUNCIATIONS, EMOTION_KEYWORDS, etc.
- ✅ `tags.ts` - speedTag, volumeTag, breakTag, emotionTag, spellTag
- ✅ `detection.ts` - detectEmotion, detectPacing, detectVolume, detectVocalCues
- ✅ `index.ts` - Re-exports all modules

### Remaining Work
- 🔲 Extract humanization functions (addThinkingSounds, addSelfCorrections, etc.)
- 🔲 Extract text handlers (handleParentheticals, handleNumbers, etc.)
- 🔲 Update ssml-tagger.ts to import from modules
- 🔲 Test backwards compatibility

---

## 3. voice-agent.ts (2768 lines)

### Current Structure
```
voice-agent.ts
├── Imports (215 lines)
├── Persona loading (15 lines)
├── Health server start (5 lines)
├── VoiceAgent class (750 lines)
│   ├── Constructor
│   ├── Bundle runtime management
│   ├── Data messaging
│   └── TTS/Speech pipeline
├── Agent definition (1680 lines)
│   ├── prewarm() - Service initialization
│   └── entry() - Main agent logic
│       ├── Session setup
│       ├── Event handlers (many!)
│       └── Pipeline callbacks
├── Initialization (30 lines)
└── Worker startup (50 lines)
```

### Target Structure
```
src/agents/
├── voice-agent.ts         # Main entry (~500 lines)
│   ├── Imports
│   ├── VoiceAgent class (slimmed)
│   └── Agent definition (entry + prewarm)
├── voice-agent/
│   ├── index.ts           # Re-exports
│   ├── speech-pipeline.ts # TTS/SSML processing
│   ├── session-setup.ts   # Session initialization
│   └── startup.ts         # Initialization code
├── handlers/
│   ├── index.ts           # Handler exports
│   ├── session-events.ts  # AgentSession event handlers
│   ├── user-speech.ts     # User speech processing
│   ├── agent-speech.ts    # Agent speech processing
│   ├── silence-handler.ts # Already exists ✅
│   └── user-identification.ts # Already exists ✅
├── processors/
│   └── turn-processor.ts  # Already exists ✅
└── shared/
    ├── index.ts           # Already exists ✅
    ├── constants.ts       # Already exists ✅
    └── types.ts           # Already exists ✅
```

### Migration Steps
1. 🔲 Extract speech pipeline to `voice-agent/speech-pipeline.ts`
2. 🔲 Extract session setup to `voice-agent/session-setup.ts`
3. 🔲 Extract event handlers to `handlers/session-events.ts`
4. 🔲 Create clean `voice-agent.ts` that orchestrates modules
5. 🔲 Update imports and test

---

## Guidelines

### When to Extract
- Function is >100 lines
- Function has clear single responsibility
- Function is reused or could be tested independently
- Group of related functions >200 lines total

### Naming Conventions
- Files: `kebab-case.ts`
- Exports: Named exports preferred
- Re-export from `index.ts` for clean imports

### Testing Strategy
1. Write tests for extracted modules
2. Verify existing functionality unchanged
3. Use snapshot tests for complex transformations

### Import Patterns
```typescript
// Preferred: Import from index
import { tagTextWithSsml } from '../ssml/index.js';

// Also OK: Direct import for tree-shaking
import { detectEmotion } from '../ssml/detection.js';
```

---

## Progress Tracking

### Completed ✅
- [x] Create VS Code tasks/launch/extensions
- [x] Create `api/routes/` structure
- [x] Extract all engagement routes (8 files)
- [x] Create `ssml/` structure
- [x] Extract SSML types, constants, tags, detection

### In Progress 🟢
- [ ] Complete SSML extraction (humanization, handlers)
- [ ] Update ssml-tagger.ts to use modules

### Planned 🟡
- [ ] Create `voice-agent/` structure
- [ ] Extract speech pipeline
- [ ] Extract event handlers
- [ ] Integration testing
- [ ] Performance validation
- [ ] Documentation updates

---

## 4. turn-processor.ts (2955 lines) 🟡 PLANNED

### Current Structure
The main turn orchestrator that has grown beyond its initial scope.

```
processors/turn-processor.ts
├── Imports (180 lines)
├── Lazy module getters (~50 lines)
├── buildContextInjections() (1254 lines) - THE PROBLEM
│   ├── Safety/crisis checks
│   ├── Emotional state building
│   ├── Trust systems
│   ├── Life coaching
│   ├── Cross-persona insights
│   ├── Semantic intelligence
│   └── Many more context categories
├── processTurn() (1132 lines)
│   ├── Analysis phase
│   ├── Context building
│   ├── Tool routing
│   ├── Response generation
│   └── Post-processing
├── Helper functions (~200 lines)
│   ├── injectTurnContext()
│   ├── getCelebrationEvents()
│   ├── recordTeamHuddleObservation()
│   └── Pattern detection utilities
```

### Target Structure
```
src/agents/processors/
├── turn-processor.ts        # Main orchestrator (~500 lines)
├── context-builder/
│   ├── index.ts             # Entry point
│   ├── safety-context.ts    # Crisis/safety checks
│   ├── emotional-context.ts # Emotional state
│   ├── trust-context.ts     # Trust systems
│   ├── coaching-context.ts  # Life coaching
│   ├── team-context.ts      # Cross-persona
│   └── semantic-context.ts  # Semantic intelligence
├── turn-phases/
│   ├── analysis-phase.ts    # Message analysis
│   ├── routing-phase.ts     # Tool routing
│   └── response-phase.ts    # Response generation
└── helpers/
    ├── celebration-events.ts
    ├── team-huddle.ts
    └── pattern-detection.ts
```

### Migration Steps
1. 🔲 Extract helper functions to `helpers/`
2. 🔲 Create `context-builder/` directory
3. 🔲 Extract context categories one at a time
4. 🔲 Create `turn-phases/` for processTurn() decomposition
5. 🔲 Slim down main orchestrator to ~500 lines
6. 🔲 Test backwards compatibility

---

## 5. semantic-intelligence/integration.ts (1496 lines) 🟡 PLANNED

### Current Structure
```
semantic-intelligence/integration.ts
├── Imports (100 lines)
├── Types (~65 lines)
├── processSemanticIntelligence() (~130 lines)
├── accumulateOutreachSignals() (~210 lines)
├── Individual record* functions (~300 lines)
│   ├── recordRelationshipGraphData()
│   ├── recordCorrelationData()
│   ├── recordEmotionalTrajectoryData()
│   ├── recordRelationalData()
│   ├── recordGrowthData()
│   └── recordThreadingData()
├── Advice tracking functions (~90 lines)
│   ├── recordAgentAdvice()
│   ├── trackFerniCommitments()
│   └── recordAdviceOutcome()
├── detectAdviceOutcome() (~110 lines)
├── Helper functions (~270 lines)
│   ├── extractDomainSignals()
│   ├── detectEmotionalCatalyst()
│   ├── extractLinguisticMarkers()
│   ├── detectCognitivePatterns()
│   └── extractKeyConcepts()
└── warmupSemanticIntelligence() (~40 lines)
```

### Target Structure
```
src/services/superhuman/semantic-intelligence/
├── integration.ts           # Main orchestrator (~400 lines)
├── types.ts                 # Add new types
├── signal-extraction/
│   ├── index.ts
│   ├── domain-signals.ts    # extractDomainSignals()
│   ├── emotional-catalyst.ts # detectEmotionalCatalyst()
│   ├── linguistic-markers.ts # extractLinguisticMarkers()
│   ├── cognitive-patterns.ts # detectCognitivePatterns()
│   └── key-concepts.ts      # extractKeyConcepts()
├── recorders/
│   ├── index.ts
│   ├── relationship-graph.ts
│   ├── correlation.ts
│   ├── emotional-trajectory.ts
│   ├── relational.ts
│   ├── growth.ts
│   └── threading.ts
└── advice-tracking/
    ├── index.ts
    ├── recorder.ts          # recordAgentAdvice, trackFerniCommitments
    ├── outcome-detector.ts  # detectAdviceOutcome
    └── outcome-recorder.ts  # recordAdviceOutcome
```

### Migration Steps
1. 🔲 Extract signal extraction helpers to `signal-extraction/`
2. 🔲 Extract record* functions to `recorders/`
3. 🔲 Extract advice tracking to `advice-tracking/`
4. 🔲 Update integration.ts to import from modules
5. 🔲 Test all exports work correctly
6. 🔲 Update index.ts exports
