# Human-Level Interaction Architecture Plan

## Executive Summary

This document outlines the comprehensive plan to achieve human-level voice AI interactions by fixing integration gaps, adding missing persistence, and enhancing key modules.

**Goal**: Make conversations feel indistinguishable from talking to a wise, empathetic human who truly knows you.

---

## Current State Assessment

### What's Working Well ✅
- **User profile persistence** - Profiles save/load correctly
- **Learning engine captures data** - Key moments, insights, preferences detected
- **Session cleanup applies learning** - `applyLearningToProfile()` is called in `endSession()`
- **Context builders exist** - 27+ builders registered
- **Bundle runtime** - Rich persona content at runtime

### Critical Gaps 🔴
1. **Community insights not persisted** - Resets every server restart
2. **Cross-session threads not surfaced** - Detected but not used at startup
3. **Humanizer bypassed** - Responses go direct to LLM without humanization
4. **Emotion detection is keyword-only** - No LLM inference
5. **Summarization is extraction-only** - No LLM understanding

---

## Architecture Principles

### 1. Single Source of Truth
Every piece of session state lives in ONE place with clear ownership.

### 2. Closed Learning Loops
```
Capture → Process → Persist → Retrieve → Apply → Measure → Improve
```

### 3. Fail-Safe Defaults
If any enhancement fails, conversation continues with sensible fallback.

### 4. Observable State
Every module reports what it's doing for debugging.

---

## Phase 0: Foundation (SessionContext)

### Problem
20+ singletons with fragmented state, manual reset required, easy to miss.

### Solution: Unified SessionContext

```typescript
// src/services/session-context.ts

interface SessionContext {
  // Identity
  sessionId: string;
  userId: string | undefined;
  personaId: string;
  
  // Core State
  profile: UserProfile | null;
  historyTracker: ConversationHistoryTracker;
  learningEngine: UserLearningEngine;
  
  // Intelligence Engines (all session-scoped)
  emotionDetector: EmotionDetector;
  intentClassifier: IntentClassifier;
  topicTracker: TopicTracker;  // UNIFIED - replaces 3 trackers
  stateMachine: ConversationStateMachine;
  
  // Conversation Engines
  humanizer: ConversationHumanizer;
  conversationalMemory: ConversationalMemoryEngine;
  emotionalArc: EmotionalArcTracker;
  responseDynamics: ResponseDynamicsEngine;
  
  // Advanced Intelligence
  responseQualityTracker: ResponseQualityTracker;
  patternAnalyzer: ConversationPatternAnalyzer;
  proactiveEngine: ProactiveInsightEngine;
  crossSessionThreader: CrossSessionThreader;
  voicePaceAdapter: VoicePaceAdapter;
  
  // Methods
  analyze(message: string): ConversationAnalysis;
  humanizeResponse(response: string): HumanizedResponse;
  addTurn(role: 'user' | 'assistant', content: string): void;
  endSession(): Promise<void>;
}
```

### Benefits
- One object to pass around
- One place to reset
- Clear lifecycle ownership
- Testable in isolation

---

## Phase 1: Critical Fixes

### P1.1: Persist Community Insights & Evolution State

**Location**: `src/intelligence/community-insights.ts`, `agent-evolution.ts`

**Changes**:
1. Add Firestore persistence for `CommunityInsightsEngine`
2. Add Firestore persistence for `AgentEvolutionEngine`
3. Load on startup, save on contribution

```typescript
// Add to community-insights.ts
async function persistToFirestore(): Promise<void> {
  const store = await getFirestoreStore();
  await store.collection('community_insights').doc('global').set({
    responsePatterns: Array.from(this.responsePatterns),
    questionEffectiveness: Array.from(this.questionEffectiveness),
    storyUsage: Array.from(this.storyUsage),
    updatedAt: new Date()
  });
}

async function loadFromFirestore(): Promise<void> {
  const store = await getFirestoreStore();
  const doc = await store.collection('community_insights').doc('global').get();
  if (doc.exists) {
    // Hydrate state from persisted data
  }
}
```

### P1.2: Surface Cross-Session Threads on Startup

**Location**: `src/services/session-manager.ts`

**Changes**:
1. Load open threads when creating session for returning user
2. Include thread context in greeting generation
3. Provide thread conversation starter

```typescript
// In createSessionServices, after profile load:
if (userProfile && isReturningUser) {
  const existingThreads = userProfile.customData?.openThreads as OpenThread[] | undefined;
  const existingFollowUps = userProfile.customData?.promisedFollowUps as PromisedFollowUp[] | undefined;
  
  crossSessionThreader = getCrossSessionThreader(
    userId,
    existingThreads,
    existingFollowUps
  );
  
  // Get conversation starter for greeting context
  const threadStarter = crossSessionThreader.getConversationStarter();
  if (threadStarter) {
    // Feed to greeting generation
  }
}
```

### P1.3: Integrate Humanizer into Response Pipeline

**Location**: `src/agents/voice-agent.ts`

**Problem**: LLM responses bypass humanization entirely.

**Solution**: Wrap response processing:

```typescript
// In VoiceAgent class, add response processing:

private humanizeAgentResponse(
  rawResponse: string,
  context: HumanizationContext
): HumanizedResponse {
  const humanizer = getConversationHumanizer(this.persona.id);
  return humanizer.humanizeResponse(rawResponse, context);
}

// In onAssistantMessage or response handler:
const humanized = this.humanizeAgentResponse(agentResponse, {
  personaId: this.persona.id,
  turnNumber: userData.turnCount,
  userMessage: lastUserMessage,
  userEmotion: analysis.emotion.primary,
  topic: analysis.topics.detected[0],
  isSeriousContext: analysis.emotion.distressLevel > 0.5,
  wasPersonalSharing: analysis.state.userNeedsSupport,
});

// Use humanized.text for output
// Use humanized.ssml for TTS
// Use humanized.appliedFeatures for logging
```

### P1.4: LLM-Based Emotion Inference

**Location**: `src/intelligence/emotion-detector.ts`

**Problem**: Pure keyword matching misses nuanced emotions.

**Solution**: Add LLM fallback for ambiguous cases:

```typescript
// Add to EmotionDetector class:

async detectWithLLM(text: string, keywordResult: EmotionResult): Promise<EmotionResult> {
  // Only use LLM if keyword detection is uncertain
  if (keywordResult.confidence > 0.7) {
    return keywordResult;
  }
  
  const prompt = `Analyze the emotional content of this message. Return JSON with:
- primary: main emotion (joy, sadness, anger, fear, anxiety, trust, anticipation, neutral)
- intensity: 0-1 how strong
- valence: positive, negative, or neutral
- distressLevel: 0-1 how urgent is emotional support

Message: "${text}"`;

  try {
    const llmResult = await callLLM(prompt);
    // Parse and merge with keyword result
    return mergeEmotionResults(keywordResult, llmResult);
  } catch {
    return keywordResult; // Fail-safe to keyword result
  }
}
```

---

## Phase 2: Integration Fixes

### P2.1: Ensure Conversation Embeddings Always Generated

**Location**: `src/memory/summarizer.ts`, `src/services/session-manager.ts`

**Changes**:
1. Always generate embeddings in summarization
2. Verify embedding before indexing
3. Log warning if embedding fails

```typescript
// In summarizeConversation:
const summary = await summarizeConversation(sessionId, turns, {
  generateEmbedding: true  // Always true now
});

// Verify before indexing:
if (summary.embedding && summary.embedding.length > 0) {
  await indexConversationSummary(userId, {
    id: summary.id,
    text: summaryText,
    topics: summary.mainTopics,
    timestamp: summary.timestamp,
    embedding: summary.embedding
  });
} else {
  getLogger().warn('Embedding generation failed, conversation not indexed');
}
```

### P2.2: Unify Topic Tracking

**Location**: `src/intelligence/topic-tracker.ts`

**Problem**: Three separate topic trackers with duplicate logic.

**Solution**: Single `TopicTracker` with all functionality:
- `extractTopics()` - from TopicTracker
- `analyzeTopicChange()` - from ConversationalMemoryEngine  
- `detectTopicShift()` - from TopicChangeDetector

```typescript
// Consolidated TopicTracker
class TopicTracker {
  // Combines all topic tracking functionality
  extract(text: string): TopicExtractionResult;
  analyzeChange(text: string): TopicChangeResult;
  getHistory(): string[];
  getCurrentTopic(): string | null;
  circleBackSuggestion(): string | null;
}
```

### P2.3: Connect Story Selection to Evolution

**Location**: `src/personas/bundles/runtime.ts`

**Changes**:
1. Query evolution engine for recommended stories
2. Filter against already-told stories
3. Track usage back to evolution engine

```typescript
// In BundleRuntimeEngine.getStoryForContext():
const evolutionRecommendations = getAgentEvolution().getRecommendedStories(
  this.personaId,
  context,
  3
);

const alreadyTold = this.state.storiesToldThisSession;
const recommended = evolutionRecommendations
  .filter(r => !alreadyTold.includes(r.storyId));

// After telling story:
getAgentEvolution().recordStoryUsage(storyId, context, userReaction);
```

---

## Phase 3: Enhancement

### P3.1: LLM-Based Summarization

**Location**: `src/memory/summarizer.ts`

**Changes**: Replace extraction with LLM call:

```typescript
async function summarizeWithLLM(turns: ConversationTurn[]): Promise<{
  mainTopics: string[];
  keyPoints: string[];
  emotionalArc: string;
  openThreads: string[];
  followUps: string[];
}> {
  const transcript = turns.map(t => `${t.role}: ${t.content}`).join('\n');
  
  const prompt = `Summarize this conversation for future reference:

${transcript}

Return JSON with:
- mainTopics: array of main discussion topics
- keyPoints: array of key things to remember
- emotionalArc: description of emotional journey
- openThreads: topics that weren't fully resolved
- followUps: things to check on next time`;

  return await callLLM(prompt);
}
```

### P3.2: Voice Emotion Integration

**Location**: `src/speech/audio-prosody.ts`

**Changes**: If VAD provides prosody features, feed to behavior system:

```typescript
// When audio frame processed:
const prosody = audioProsodyAnalyzer.analyze(audioFrame);

if (prosody) {
  const voiceGuidance = getVoiceProsodyResponse({
    primary: prosody.detectedEmotion,
    stressLevel: prosody.stressLevel,
    arousal: prosody.arousal,
    valence: prosody.valence
  });
  
  if (voiceGuidance.shouldAdjust) {
    // Feed to context builders
    contextUserData.voiceEmotion = prosody;
  }
}
```

### P3.3: Real-Time Backchanneling

**Location**: `src/agents/voice-agent.ts`

**Challenge**: Injecting audio mid-stream without interrupting user.

**Approach**:
1. Use LiveKit's data channel for backchannel triggers
2. Frontend plays pre-recorded backchannel audio
3. Agent continues listening

```typescript
// When extended pause detected:
const backchannel = activeListening.getSilenceBackchannel(
  this.persona.id,
  { silenceDurationMs: pauseMs, userEmotion: lastEmotion }
);

if (backchannel) {
  await this.room.localParticipant.publishData(
    new TextEncoder().encode(JSON.stringify({
      type: 'backchannel',
      audio: backchannel.verbal,
      ssml: backchannel.ssml
    })),
    { reliable: false } // Low latency
  );
}
```

---

## Implementation Order

### Week 1: Foundation
- [ ] Create SessionContext class
- [ ] Migrate session-manager to use SessionContext
- [ ] Add tests for SessionContext lifecycle

### Week 2: Critical Fixes
- [ ] P1.1: Community insights persistence
- [ ] P1.2: Cross-session thread surfacing
- [ ] P1.3: Humanizer integration

### Week 3: Integration
- [ ] P1.4: LLM emotion inference
- [ ] P2.1: Embedding verification
- [ ] P2.2: Topic tracker unification

### Week 4: Enhancement
- [ ] P2.3: Story-evolution connection
- [ ] P3.1: LLM summarization
- [ ] Testing & refinement

---

## Success Metrics

### Quantitative
- **Memory recall rate**: % of past conversations correctly referenced
- **Thread resumption rate**: % of open threads surfaced on return
- **Humanization coverage**: % of responses going through humanizer
- **Embedding coverage**: % of conversations with valid embeddings

### Qualitative
- Conversations feel continuous across sessions
- Agent remembers small details ("How's Sarah doing?")
- Emotional moments handled with appropriate care
- Stories aren't repeated, callbacks are natural

---

## Risk Mitigation

### Performance
- LLM calls are optional fallbacks, not blocking
- Caching for frequently accessed data
- Async persistence (don't block response)

### Data Loss
- Fail-safe to in-memory if persistence fails
- Periodic backup of community insights
- Session end always attempts save

### Breaking Changes
- Feature flags for new behaviors
- Gradual rollout with monitoring
- Rollback capability for each change

---

## Files to Modify

### High Priority
1. `src/services/session-context.ts` (NEW)
2. `src/services/session-manager.ts`
3. `src/agents/voice-agent.ts`
4. `src/intelligence/community-insights.ts`
5. `src/intelligence/emotion-detector.ts`

### Medium Priority
6. `src/memory/summarizer.ts`
7. `src/intelligence/topic-tracker.ts`
8. `src/conversation/humanizer.ts`
9. `src/personas/bundles/runtime.ts`

### Lower Priority
10. `src/speech/audio-prosody.ts`
11. `src/conversation/active-listening.ts`
12. `src/intelligence/agent-evolution.ts`

---

## Implementation Status

### Completed ✅

| Item | Description | Location |
|------|-------------|----------|
| **SessionContext Architecture** | Unified session state interface defined | `src/services/session-context.ts` |
| **Cross-Session Thread Loading** | Threads load from profile on session start | `src/services/session-manager.ts` |
| **Cross-Session Thread Persistence** | Threads persist to profile on session end | `src/services/session-manager.ts` |
| **Humanizer Integration** | Already integrated at prompt and response levels | `src/agents/voice-agent.ts` |
| **Learning Persistence Loop** | Working correctly in endSession | `src/services/session-manager.ts` |
| **LLM Emotion Inference** | Optional `detectWithLLM()` method added | `src/intelligence/emotion-detector.ts` |
| **Community Insights Persistence** | Firestore load/save on startup/shutdown | `src/intelligence/community-insights.ts`, `src/startup.ts` |
| **Embedding Verification** | Better logging, always-on embeddings | `src/memory/summarizer.ts` |
| **Topic Tracker Unification** | Compatibility methods added, deprecation notices | `src/intelligence/topic-tracker.ts` |
| **LLM Summarization** | `summarizeWithLLM()` function added | `src/memory/summarizer.ts` |
| **Story-Evolution Connection** | Bundle runtime queries evolution engine | `src/personas/bundles/runtime.ts` |

### Round 2 Completed ✅

| Item | Description | Location |
|------|-------------|----------|
| **Agent Evolution Persistence** | Firestore load/save on startup/shutdown | `src/intelligence/agent-evolution.ts`, `src/startup.ts` |
| **LLM Utilities** | Unified LLM call with Google AI + OpenAI fallback | `src/services/llm-utils.ts` |
| **LLM Emotion Enhancement** | Low-confidence emotions enhanced async | `src/services/session-manager.ts` |
| **LLM Summarization** | Session end uses LLM summarization first | `src/services/session-manager.ts` |
| **Voice-Emotion-Learning Loop** | Voice emotion feeds to learning engine | `src/agents/voice-agent.ts` |
| **Cross-Session Thread Greetings** | Open threads surface in greetings | `src/agents/voice-agent.ts` |
| **Profile Contradiction Detection** | Enhanced detection against stored profile | `src/conversation/conversational-memory.ts` |
| **Voice Pace Adaptation** | Response pacing matches user rhythm | `src/agents/voice-agent.ts` |
| **Unified Analysis Pipeline** | Single entry point for complete analysis | `src/intelligence/analysis-pipeline.ts` |

### Round 3 Completed ✅

| Item | Description | Location |
|------|-------------|----------|
| **Topic Tracker Consolidation** | topic-change-detector now delegates to canonical tracker | `src/conversation/topic-change-detector.ts` |
| **Conversational Memory Topic** | detectTopic() delegates to TopicTracker | `src/conversation/conversational-memory.ts` |
| **Response Quality Full Tracking** | recordResponseSignal() captures complete quality signals | `src/services/session-manager.ts`, `src/agents/voice-agent.ts` |
| **Community Engagement Signals** | Response quality feeds into community insights | `src/intelligence/community-insights.ts` |
| **Dynamic Backchannel Frequency** | Backchannels tune to user preference | `src/conversation/active-listening.ts` |
| **Backchannel Reaction Tracking** | User reactions adjust frequency | `src/agents/voice-agent.ts` |
| **Memory Callback Tuning** | Callback frequency adapts to engagement | `src/conversation/conversational-memory.ts` |
| **Humanizer Callback Tracking** | Tracks callback usage for reactions | `src/conversation/humanizer.ts` |
| **Proactive Insight Generation** | Insights generated at session start | `src/services/session-manager.ts` |
| **Proactive Check-In Greetings** | High-priority insights surface in greetings | `src/agents/voice-agent.ts` |

### Round 4 Completed ✅ (Integration Fixes)

| Item | Description | Location |
|------|-------------|----------|
| **Humanizer processUserMessage** | Now called on every user turn for memory/dynamics | `src/agents/voice-agent.ts` |
| **Topic Change Integration** | Humanizer's topic detection feeds into context | `src/agents/voice-agent.ts` |
| **Memory Callback Reactions** | User engagement tracked after callbacks | `src/agents/voice-agent.ts` |
| **Proactive Insight Delivery** | Insights marked delivered when used | `src/services/session-manager.ts`, `src/agents/voice-agent.ts` |
| **markInsightDelivered Method** | Added to session services | `src/services/types.ts` |

### Remaining Work 🔨 (Future Enhancements)

1. **A/B Testing Infrastructure**: Test different response strategies systematically
2. **Voice-Only Emotion Models**: Dedicated ML model for voice emotion (current: prosody heuristics)
3. **Cross-Persona Memory Sharing**: Share appropriate learnings across personas
4. **Real-Time Voice Calibration**: Adjust emotion weights based on validation accuracy

### Round 5 Completed ✅ (Build Fixes & Voice Learning)

| Item | Description | Location |
|------|-------------|----------|
| **Voice Emotion Validation** | Track accuracy of voice emotion predictions | `src/intelligence/user-learning-engine.ts` |
| **Voice Emotion Recording** | Record voice emotions for validation | `src/agents/voice-agent.ts` |
| **ToolDomain Type** | Added 'proactive' domain type | `src/tools/registry/types.ts` |
| **Proactive Tools Fix** | Fixed method name mismatches | `src/tools/domains/proactive/index.ts` |
| **Build Clean** | All compilation errors resolved | ✅ |

### Files Created/Modified (Round 4)

| File | Action | Description |
|------|--------|-------------|
| `src/agents/voice-agent.ts` | Modified | Humanizer integration, callback reactions, insight delivery |
| `src/services/session-manager.ts` | Modified | markInsightDelivered, suggestedInsightId |
| `src/services/types.ts` | Modified | markInsightDelivered interface |

### Files Created/Modified (Round 3)

| File | Action | Description |
|------|--------|-------------|
| `src/conversation/topic-change-detector.ts` | Modified | Delegates to canonical TopicTracker |
| `src/conversation/conversational-memory.ts` | Modified | Uses TopicTracker, callback tuning |
| `src/conversation/active-listening.ts` | Modified | Dynamic backchannel frequency |
| `src/conversation/humanizer.ts` | Modified | Callback reaction tracking |
| `src/services/session-manager.ts` | Modified | Response signals, proactive generation |
| `src/services/types.ts` | Modified | recordResponseSignal interface |
| `src/agents/shared/types.ts` | Modified | lastAgentResponse tracking |
| `src/agents/voice-agent.ts` | Modified | Response tracking, backchannel reactions, proactive insights |
| `src/intelligence/community-insights.ts` | Modified | recordEngagementSignal method |

### Files Modified (Round 2)

| File | Action | Description |
|------|--------|-------------|
| `src/services/llm-utils.ts` | Created | Unified LLM call utility |
| `src/intelligence/agent-evolution.ts` | Modified | Firestore persistence |
| `src/intelligence/analysis-pipeline.ts` | Created | Unified analysis entry point |
| `src/intelligence/index.ts` | Modified | Export analysis pipeline |
| `src/conversation/conversational-memory.ts` | Modified | Profile contradiction detection |
| `src/services/session-manager.ts` | Modified | LLM emotion/summarization |
| `src/agents/voice-agent.ts` | Modified | Pace adaptation, thread greetings, voice-learning |
| `src/startup.ts` | Modified | Agent evolution load/save |

---

*Document Version: 1.5*
*Updated: December 4, 2024*
*Author: Architecture Audit - Round 5 (Complete)*

