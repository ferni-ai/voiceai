# John Bogle Voice AI - Architecture Documentation

## Overview

The John Bogle Voice AI Agent is a deeply human, emotionally intelligent voice assistant that builds genuine relationships through:

- **Emotion Detection**: Real-time analysis of user emotional state
- **Intent Classification**: Understanding what users really need
- **Topic Tracking**: Maintaining conversation threads
- **Adaptive Speech**: Voice that responds to user pace and mood
- **Persistent Memory**: Cross-session relationship building
- **Semantic RAG**: Intelligent knowledge retrieval

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VOICE PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│  User Audio → STT → Intelligence → LLM → SSML Tagger → TTS     │
│                        ↓                      ↓                 │
│              Context Injection        Adaptive Speech           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     INTELLIGENCE LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐ │
│  │   Emotion    │ │   Intent    │ │   Topic     │ │  State   │ │
│  │  Detector    │ │ Classifier  │ │  Tracker    │ │ Machine  │ │
│  └──────────────┘ └─────────────┘ └─────────────┘ └──────────┘ │
│         ↓               ↓               ↓             ↓        │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                  Context Manager                            ││
│  │    (Rolling summaries, relationship context, topics)        ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       MEMORY LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────────────────┐  │
│  │ User Profile │ │ Conversation│ │      Vector Store       │  │
│  │    Store     │ │   History   │ │    (Semantic RAG)       │  │
│  └──────────────┘ └─────────────┘ └─────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Embeddings Utility                     │   │
│  │        (Google/OpenAI/Local for semantic search)         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Module Directory Structure

```
src/
├── bogle-agent.ts          # Main agent with all integrations
├── ssml-tagger.ts          # Rule-based SSML tagging
│
├── intelligence/           # Conversational intelligence
│   ├── emotion-detector.ts # Emotion analysis
│   ├── intent-classifier.ts# Intent classification
│   ├── topic-tracker.ts    # Topic extraction & tracking
│   ├── conversation-state.ts# Phase state machine
│   └── index.ts           # Combined analysis
│
├── memory/                 # Persistent memory system
│   ├── embeddings.ts       # Embedding providers
│   ├── vector-store.ts     # Semantic search
│   ├── store.ts           # Abstract memory store
│   ├── in-memory-store.ts  # Development store
│   ├── history.ts         # Conversation history
│   ├── summarizer.ts      # Conversation summaries
│   └── index.ts           # Memory initialization
│
├── context/               # Context management
│   └── context-manager.ts  # Prompt context builder
│
├── speech/                # Adaptive speech
│   ├── speech-context.ts   # WPM tracking, energy detection
│   ├── adaptive-ssml.ts    # Context-aware SSML
│   └── index.ts
│
├── services/              # Service orchestration
│   └── index.ts           # Bootstrap all services
│
├── tools/                 # LLM tools (35 total)
│   ├── financial.ts       # Market data, calculations
│   ├── conversation.ts    # Story, check-in, wrap-up
│   ├── memory-tools.ts    # Remember, recall
│   ├── proactive.ts       # Goals, follow-ups
│   ├── awareness.ts       # Context awareness
│   └── index.ts
│
├── types/                 # Type definitions
│   └── user-profile.ts    # Comprehensive user profile
│
├── persona/               # Jack Bogle character
│   ├── core-identity.ts   # Who Jack is
│   ├── conversational-style.ts
│   ├── memory-awareness.ts # Memory usage instructions
│   └── ... (15 more modules)
│
└── tests/                 # Test suite
    ├── memory.test.ts
    ├── intelligence.test.ts
    ├── speech.test.ts
    └── continuity.test.ts
```

## Data Flow

### 1. User Message Processing

```
User speaks
    ↓
STT transcribes
    ↓
onUserTurnCompleted hook
    ↓
┌──────────────────────────────────────┐
│ Intelligence Analysis                 │
│ • Emotion detection                   │
│ • Intent classification               │
│ • Topic extraction                    │
│ • State machine update                │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│ Context Building                      │
│ • Emotional awareness injection       │
│ • Intent-based guidance               │
│ • Topic threading context             │
│ • Relationship context                │
│ • Semantic RAG lookup                 │
└──────────────────────────────────────┘
    ↓
Context injected into LLM chat
    ↓
LLM generates response
    ↓
transcriptionNode hook
    ↓
┌──────────────────────────────────────┐
│ Adaptive SSML Tagging                 │
│ • Build speech context from state     │
│ • Adjust speed to user WPM            │
│ • Gate laughter for heavy topics      │
│ • Match energy level                  │
│ • Apply emotion tags                  │
└──────────────────────────────────────┘
    ↓
TTS speaks with natural prosody
```

### 2. Session Lifecycle

```
prewarm
    ↓
    • Load VAD
    • Initialize services
    • Index persona into vector store
    ↓
entry
    ↓
    • Parse metadata for user ID
    • Create session services
    • Load user profile (if returning)
    • Set up event listeners
    • Generate context-aware greeting
    ↓
conversation loop
    ↓
    • onUserTurnCompleted: analyze + inject context
    • transcriptionNode: apply adaptive SSML
    • Track conversation in history
    ↓
disconnect
    ↓
    • Save user profile
    • Generate conversation summary
    • Cleanup session resources
```

## Key Components

### EmotionDetector
Analyzes text for emotional content:
- Primary emotion (joy, sadness, anxiety, etc.)
- Intensity (0-1)
- Distress level (0-1) - triggers support mode when high
- Valence (positive/negative/neutral)
- Suggested tone for response

### IntentClassifier
Classifies user intent(s):
- 27 intent types (seeking_advice, venting, greeting, etc.)
- Multi-label support
- Urgency assessment
- Empathy/action requirements
- Suggested approach

### TopicTracker
Tracks conversation topics:
- Extracts topics from messages
- Maintains topic stack
- Detects topic shifts
- Identifies topics to circle back to

### ConversationStateMachine
Manages conversation phases:
- greeting → warming_up → exploring → advising → wrapping_up
- supporting (triggered by high distress)
- follow_up (for returning users)
- Phase-specific guidance and voice modes

### ContextManager
Builds prompt context:
- Rolling summaries (every 10 turns)
- Relationship context from profile
- Emotional context
- Topic threading
- Cross-session continuity

### Adaptive SSML
Context-aware speech synthesis:
- Base speed adapted to user WPM
- Pause multiplier for distressed users
- Laughter gating for heavy topics
- Energy mirroring
- Specialized taggers for different content types

## Configuration

### Feature Flags
```typescript
const config = {
  enableSemanticRag: true,
  enableEmotionDetection: true,
  enableIntentClassification: true,
  enableAdaptiveSsml: true,
  enablePersistentMemory: true,
  enableCrossSessionContinuity: true,
};
```

### Memory Store Selection
- Development: `InMemoryStore` (no persistence)
- Production: PostgreSQL + Redis + Pinecone/Weaviate

### Embedding Providers
- Google: `gemini-embedding-001` (default)
- OpenAI: `text-embedding-3-small`
- Local: Placeholder for testing

## Testing

Run the test suite:
```bash
npx vitest run
```

Test categories:
- Memory System (15 tests)
- Intelligence System (25 tests)
- Speech System (20 tests)
- Cross-Session Continuity (15 tests)

## Performance Considerations

### Latency
- Intelligence analysis: ~5-10ms (rule-based)
- Semantic RAG: ~50-100ms (embedding + search)
- SSML tagging: ~1-2ms
- Total overhead: ~60-120ms

### Memory
- Session state: ~1-5KB per session
- User profile: ~10-50KB per user
- Vector store: ~100MB for persona knowledge

### Scaling
- Session services are per-session (no shared state issues)
- Memory stores can be backed by distributed databases
- Vector store can use cloud-hosted solutions (Pinecone, etc.)

## Future Enhancements

1. **Voice Emotion Detection**: Analyze user's voice tone, not just text
2. **Proactive Outreach**: Schedule follow-up calls based on user needs
3. **Multi-Modal**: Add screen sharing for financial visualizations
4. **Advanced RAG**: Query external knowledge bases, market data
5. **A/B Testing**: Test different persona variations
6. **Analytics Dashboard**: Track relationship quality metrics

