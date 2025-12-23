# Unified Intelligence Layer

> **"Better Than Human" Tool Selection and Anticipation**

The Unified Intelligence Layer bridges the SemanticRouter and UnifiedToolOrchestrator to create a tool selection system that transcends human limitations.

## Implementation Status: ✅ COMPLETE

All "Better Than Human" features are now implemented:

| Feature | Status | Description |
|---------|--------|-------------|
| Cross-Device Learning | ✅ | Intelligence profiles persist to Firestore |
| Emotion-Aware Selection | ✅ | Voice prosody triggers wellness tool boosts |
| Cross-Persona Intelligence | ✅ | Tool context carries during handoffs |
| Proactive Outreach | ✅ | Habit reminders at user's optimal times |
| Anticipatory Pre-loading | ✅ | Tool chains predicted before user asks |
| Vocabulary Learning | ✅ | User-specific phrases mapped to tools |

---

## Human Limitations We Transcend

| Human Limitation | Ferni's Superpower |
|------------------|-------------------|
| Friends forget | **Perfect Memory** - We remember every preference across sessions |
| Humans react | **Anticipation** - We predict needs before users express them |
| Humans miss patterns | **Pattern Recognition** - We see patterns humans can't |
| Humans plateau | **Continuous Learning** - Every interaction makes us smarter |
| Humans stick to habits | **Proactive Discovery** - We surface tools users haven't found |
| Humans don't hear stress | **Emotion-Aware** - We sense stress/anxiety and surface wellness tools |
| Advisors don't coordinate | **Cross-Persona** - We carry context when switching team members |
| Friends forget to follow up | **Proactive Outreach** - We remind users at their optimal times |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  UNIFIED INTELLIGENCE LAYER                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐        ┌──────────────────────┐          │
│  │ SemanticRouter   │◄──────►│ UnifiedOrchestrator   │          │
│  │ (per-transcript) │        │ (session tools)       │          │
│  └────────┬─────────┘        └─────────┬────────────┘          │
│           │                            │                        │
│           ▼                            ▼                        │
│  ┌──────────────────────────────────────────────────┐          │
│  │           SHARED INTELLIGENCE                     │          │
│  │  • PersonalizationEngine (user patterns)          │          │
│  │  • ToolChainPredictor (anticipation)              │          │
│  │  • ActiveLearningEngine (corrections)             │          │
│  │  • EmotionAwareSelection (voice prosody)      NEW │          │
│  │  • CrossPersonaIntelligence (handoff context) NEW │          │
│  │  • ProactiveOutreachIntegration (time patterns) NEW │        │
│  └──────────────────────────────────────────────────┘          │
│                         │                                       │
│                         ▼                                       │
│              ┌──────────────────┐                              │
│              │ Firestore Persist │                              │
│              │ (cross-device)    │                              │
│              └──────────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Session Start (Orchestrator)

```typescript
// 1. Orchestrator asks intelligence layer for enhancements
const enhancement = await intelligence.enhanceToolSelection(userId, {
  personaId: 'ferni',
  timeOfDay: new Date(),
  transcript: '', // Initial session
});

// 2. Enhancement includes:
// - prioritizeTools: User's favorites based on history
// - anticipatedTools: Predicted next tools based on patterns
// - proactiveSuggestions: Tools user might benefit from
// - contextHints: Time of day, returning user, preferred domains

// 3. Orchestrator pre-loads anticipated tools
const tools = await orchestrator.getToolsForIntent({
  ...request,
  // Intelligence enhancement automatically applied
});
```

### Per-Transcript (SemanticRouter)

```typescript
// 1. User says something
const result = await routeTranscript("play some jazz");

// 2. If high confidence, execute directly
if (result.bypassLLM) {
  // Tool executed, record success for learning
  await recordToolSuccess(userId, sessionId, query, toolId, confidence);
}

// 3. If user corrects (chooses different tool)
await recordToolCorrection(userId, sessionId, query, predictedTool, actualTool, confidence);

// 4. Correction feeds back to intelligence layer
// → Next session, this user's personalization improves
```

---

## Key Features

### 1. Anticipatory Tool Pre-loading

```typescript
// ToolChainPredictor knows patterns:
// "play some music" often followed by → mood_check → habit_evening_check

// Intelligence layer tells orchestrator to pre-load these
anticipatedTools: ['mood_check', 'habit_evening_check']

// Result: When user naturally says "how am I feeling?",
// the tool is already loaded. Zero delay.
```

### 2. Cross-Session Vocabulary Learning

```typescript
// Sarah says "play my focus music"
// SemanticRouter routes to spotify_play_focus

// After 5 interactions, intelligence layer learns:
vocabulary: { "focus music": "spotify_play_focus" }

// Next session, when Sarah says "focus music",
// confidence is boosted because of vocabulary match
```

### 3. Time-of-Day Personalization

```typescript
// Intelligence layer tracks:
timePatterns: {
  7: ['habit_morning_check', 'weather_current', 'calendar_today'],
  18: ['mood_check', 'finance_summary', 'spotify_play_evening']
}

// At 7am, these tools are prioritized
// At 6pm, different tools are prioritized
```

### 4. Tool Affinity Tracking

```typescript
// Intelligence layer learns which tools user gravitates to:
toolAffinities: {
  'spotify_play': 0.9,      // User loves music
  'weather_current': 0.7,   // Frequently checks weather
  'finance_summary': 0.3    // Rarely uses finance
}

// High-affinity tools get confidence boost
// Low-affinity tools are deprioritized
```

### 5. Proactive Suggestions

```typescript
// Intelligence layer notices patterns:
// "User uses habit_morning_check but not journal_prompt"
// "Users who check habits often benefit from journaling"

proactiveSuggestions: [{
  toolId: 'journal_prompt',
  reason: 'Complete your morning routine - journaling pairs well with habit tracking',
  triggerPhrase: 'Would you like to try journaling?'
}]
```

---

## Learning Loop Closure

The system gets smarter over time through a closed learning loop:

```
User Interaction
      ↓
SemanticRouter predicts tool
      ↓
  ┌─────────────────┐
  │ Was prediction  │
  │    correct?     │
  └─────────────────┘
      ↓         ↓
    Yes        No
      ↓         ↓
  recordToolSuccess()  recordToolCorrection()
      ↓         ↓
      └────┬────┘
           ↓
  UnifiedIntelligenceLayer.recordLearning()
           ↓
  ┌─────────────────────────────────────┐
  │ Updates:                            │
  │ • Tool affinities                   │
  │ • Vocabulary mappings               │
  │ • Time patterns                     │
  │ • Tool chains                       │
  │ • Confidence adjustments            │
  └─────────────────────────────────────┘
           ↓
  Next session is smarter
```

---

## Integration Points

### 1. Orchestrator Integration

```typescript
// src/tools/orchestrator/unified-tool-orchestrator.ts

// During initialization:
await initializeUnifiedIntelligence();

// During tool selection:
const enhancement = await intelligence.enhanceToolSelection(userId, context);
// Enhancement adds anticipated tools, prioritizes user favorites
```

### 2. Semantic Router Integration

```typescript
// src/tools/semantic-router/integration/metrics.ts

// After successful tool execution:
await recordToolSuccess(userId, sessionId, query, toolId, confidence, personaId);

// After user corrects the prediction:
await recordToolCorrection(userId, sessionId, query, predicted, actual, confidence, personaId);
```

### 3. Tool Selection Result

```typescript
// Orchestrator returns intelligence metadata:
const result = await orchestrator.getToolsForIntent(request);

result.meta.intelligenceEnhancement = {
  anticipatedTools: ['mood_check', 'habit_evening_check'],
  prioritizedTools: ['spotify_play', 'weather_current'],
  proactiveSuggestions: 2,
  isReturningUser: true
};

// explainSelection() now shows intelligence contribution:
// 🧠 Better Than Human Intelligence:
//   • Returning user: Yes
//   • Anticipated tools: mood_check, habit_evening_check
//   • Prioritized tools: spotify_play, weather_current
//   • Proactive suggestions ready: 2
```

---

## Metrics & Debugging

### Get Intelligence Stats

```typescript
const intelligence = getUnifiedIntelligence();
const metrics = intelligence.getMetrics();

// Returns:
{
  profileCount: 150,        // Users with personalization profiles
  totalCorrections: 45,     // Learning events recorded
  avgToolAffinities: 0.65   // Average tool preference score
}
```

### Explain Tool Selection

```typescript
const result = await orchestrator.getToolsForIntent(request);
console.log(orchestrator.explainSelection(result));

// Output:
// 🔧 Tool Selection Breakdown
//
// Selected 35 of 150 tools
// Selection time: 45ms
//
// Sources:
//   • Essential (always): 15
//   • Semantic (matched): 8
//   • Contextual (smart): 5
//   • MCP (external): 0
//   • Intelligence (anticipated): 3
//
// 🧠 Better Than Human Intelligence:
//   • Returning user: Yes
//   • Anticipated tools: mood_check, habit_evening_check, spotify_play
//   • Prioritized tools: spotify_play, weather_current, calendar_today
//   • Proactive suggestions ready: 2
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/tools/intelligence/unified-intelligence-layer.ts` | Main intelligence layer |
| `src/tools/intelligence/index.ts` | Exports |
| `src/tools/orchestrator/unified-tool-orchestrator.ts` | Orchestrator integration |
| `src/tools/semantic-router/integration/metrics.ts` | Learning loop closure |
| `src/tools/semantic-router/advanced/personalization.ts` | Per-user learning |
| `src/tools/semantic-router/advanced/tool-chain-predictor.ts` | Anticipation |

---

## Configuration

```typescript
const config: UnifiedIntelligenceConfig = {
  // Minimum interactions before personalization kicks in
  minInteractionsForPersonalization: 5,

  // How many anticipated tools to pre-load
  maxAnticipatedTools: 5,

  // Threshold for proactive suggestions
  proactiveSuggestionThreshold: 0.7,

  // How long to remember user patterns (days)
  patternRetentionDays: 90,

  // Core features
  enableAnticipation: true,
  enableProactiveSuggestions: true,
  enableCrossSessionLearning: true,

  // "Better Than Human" features (NEW)
  enableEmotionAwareness: true,      // Voice prosody → tool boosts
  enableCrossPersonaIntelligence: true,  // Context during handoffs
  enableFirestorePersistence: true,  // Cross-device learning
  enableProactiveOutreach: true,     // Habit reminders

  // Emotion thresholds
  stressThresholdForWellnessBoost: 0.6,  // Boost wellness tools above this stress level
};
```

---

## Implemented Features (Dec 2024)

### 1. Emotion-Aware Tool Selection ✅

When voice prosody detects stress or anxiety, wellness tools are automatically boosted:

```typescript
// src/tools/intelligence/unified-intelligence-layer.ts

// Voice emotion detected from audio prosody:
const emotion: VoiceEmotionState = {
  primary: 'anxious',
  valence: -0.4,
  arousal: 0.8,
  stressLevel: 0.7,    // Above threshold!
  anxietyMarkers: true
};

// Intelligence layer returns boosted domains:
emotionAwareBoosts: {
  boostedDomains: ['wellness', 'presence', 'self-compassion'],
  reason: 'Detected stress/anxiety in your voice - wellness tools ready',
  stressLevel: 0.7
}
```

### 2. Cross-Persona Intelligence ✅

When user switches from Ferni to Maya, tool context is carried forward:

```typescript
// During handoff, recorded in src/tools/handoff/executor.ts:
await intelligence.recordHandoff({
  userId: 'user-123',
  fromPersonaId: 'ferni',
  toPersonaId: 'maya',
  toolsUsed: ['mood_check', 'spotify_play'],
  topicsDiscussed: ['stress', 'work-life-balance'],
  emotionalState: { primary: 'anxious', stressLevel: 0.7 }
});

// On next session with Maya:
enhancement.crossPersonaContext = {
  previousPersonaId: 'ferni',
  toolsToCarryForward: ['mood_check'],
  topicsToRemember: ['stress', 'work-life-balance'],
  emotionalContinuity: "User's emotional journey: anxious"
}
```

### 3. Proactive Outreach Integration ✅

Learns user patterns and suggests optimal outreach times:

```typescript
// Intelligence layer tracks:
outreachPatterns: {
  habitCheckTime: 7,        // Usually checks habits at 7am
  engagementPeaks: [7, 18, 21],  // Most active at these hours
  outreachResponsiveness: 0.8    // 80% respond to outreach
}

// When it's 7am and user hasn't checked in:
proactiveOutreach: {
  shouldTrigger: true,
  type: 'habit_reminder',
  suggestedMessage: "Hey! It's around the time you usually check in on your habits."
}
```

### 4. Firestore Persistence ✅

Intelligence profiles persist across devices and sessions:

```typescript
// On learning events, profiles are debounced and saved:
this.markProfileDirty(userId);
// After 30s debounce:
await this.saveDirtyProfiles();  // Saves to Firestore

// On next session (any device):
const profile = await this.getOrLoadProfile(userId);
// Loads from Firestore with full history!
```

---

## Future Enhancements

1. ✅ ~~Cross-Persona Intelligence~~ (IMPLEMENTED)
2. ✅ ~~Emotion-Aware Tool Selection~~ (IMPLEMENTED)
3. ✅ ~~Proactive Outreach~~ (IMPLEMENTED)
4. **Collaborative Filtering**: "Users like you also benefit from X"
5. **Conversation Flow Prediction**: Not just tool chains, but entire conversation patterns
6. **Multi-Modal Emotion**: Combine voice prosody with text sentiment
7. **Predictive Session Planning**: Pre-load tools before session even starts based on time patterns

