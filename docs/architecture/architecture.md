# 🏛️ Ferni AI Architecture

This document provides a comprehensive overview of Ferni's architecture.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             Client Layer                                 │
├─────────────────┬───────────────────────────────┬───────────────────────┤
│   Web App       │      iOS/Android Apps         │    Voice Interface    │
│   (TypeScript)  │      (Swift/Kotlin)           │    (LiveKit)          │
└────────┬────────┴───────────────┬───────────────┴───────────┬───────────┘
         │                        │                           │
         ▼                        ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API Gateway Layer                              │
├─────────────────────────────────────────────────────────────────────────┤
│  ui-server.js                                                           │
│  - Static file serving        - REST API routing                        │
│  - Authentication             - CORS handling                           │
│  - Rate limiting              - Health checks                           │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                                │
├──────────────────────┬─────────────────────┬───────────────────────────┤
│  Voice Agent         │   API Services      │   Background Services      │
│  (voice-agent.ts)    │   (api/*.ts)        │   (Firebase Functions)     │
├──────────────────────┴─────────────────────┴───────────────────────────┤
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │ Context        │  │ Handoff        │  │ Memory         │            │
│  │ Builders       │  │ System         │  │ System         │            │
│  └────────────────┘  └────────────────┘  └────────────────┘            │
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │ Tool           │  │ Persona        │  │ Intelligence   │            │
│  │ Registry       │  │ Registry       │  │ Engine         │            │
│  └────────────────┘  └────────────────┘  └────────────────┘            │
│                                                                         │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       External Services Layer                            │
├───────────────┬───────────────┬───────────────┬─────────────────────────┤
│   LiveKit     │   Gemini Live │   Cartesia    │   Other Services        │
│   (Voice)     │   (STT/LLM)   │   (TTS)       │   (Spotify, Twilio...)  │
└───────────────┴───────────────┴───────────────┴─────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Storage Layer                                   │
├───────────────┬───────────────┬─────────────────────────────────────────┤
│   Firestore   │   Redis       │   Vector Store (planned)                │
│   (Primary)   │   (Cache)     │   (Semantic Search)                     │
└───────────────┴───────────────┴─────────────────────────────────────────┘
```

---

## Voice Processing Pipeline

```
User Speaks
     │
     ▼
┌────────────────┐
│    LiveKit     │  Real-time audio streaming
│    Rooms API   │
└────────┬───────┘
         │
         ▼
┌────────────────┐
│  Gemini Live   │  Speech-to-text + LLM reasoning
│  Realtime API  │
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ Context System │  15+ modular context builders
│ (turn-by-turn) │  inject intelligence per turn
└────────┬───────┘
         │
         ├────────────────────────────────────────┐
         │                                        │
         ▼                                        ▼
┌────────────────┐                      ┌────────────────┐
│ Tool Execution │                      │   Handoff      │
│   (if needed)  │                      │   Detection    │
└────────┬───────┘                      └────────┬───────┘
         │                                        │
         └────────────────────────────────────────┘
                          │
                          ▼
                 ┌────────────────┐
                 │  SSML Tagger   │  Add prosody, pauses, emphasis
                 └────────┬───────┘
                          │
                          ▼
                 ┌────────────────┐
                 │   Cartesia    │  Text-to-speech synthesis
                 │   Sonic 3    │
                 └────────┬───────┘
                          │
                          ▼
                 ┌────────────────┐
                 │    LiveKit     │  Audio stream to client
                 └────────────────┘
```

---

## Context Builder System

The intelligence engine that makes conversations feel human:

```
                         User Turn
                             │
                             ▼
              ┌──────────────────────────┐
              │    Parallel Execution    │
              │                          │
  ┌───────────┴──────────────────────────┴───────────┐
  │                                                   │
  ▼           ▼           ▼           ▼              ▼
┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐        ┌─────┐
│emot-│    │crisi│    │memor│    │engag│   ...  │human│
│ional│    │s    │    │y    │    │ement│        │izing│
└──┬──┘    └──┬──┘    └──┬──┘    └──┬──┘        └──┬──┘
   │          │          │          │              │
   └──────────┴──────────┴──────────┴──────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │    Context Aggregator    │
              │   (priority-weighted)    │
              └──────────┬───────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │    Injected into LLM     │
              │    System Prompt         │
              └──────────────────────────┘
```

### Builder Responsibilities

| Builder | Detection | Injection |
|---------|-----------|-----------|
| `emotional` | Sentiment, distress signals | Empathy instructions, tone guidance |
| `crisis` | Financial panic, life events | Crisis response protocol |
| `celebration` | Achievements, milestones | Celebration phrases, energy boost |
| `memory` | Returning user, key moments | Callback prompts, context |
| `engagement` | Curiosity, depth signals | Follow-up questions |
| `pacing` | Response length patterns | Length/complexity guidance |
| `discovery` | New user, missing info | Onboarding prompts |
| `personal` | Name, personal details | Personalization cues |
| `topics` | Active topics, threads | Topic management |
| `intent` | 27 classified intents | Intent-appropriate response |
| `goodbye` | Exit signals, wrap-up | Closing guidance |
| `humanizing` | Conversation stage | Natural speech patterns |
| `rag` | Knowledge queries | Retrieved knowledge |
| `tasks` | Active tasks | Task progress/prompts |

---

## Persona Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Persona Registry                               │
├─────────────────────────────────────────────────────────────────────────┤
│  Auto-discovers bundles from src/personas/bundles/*/                    │
│  Validates manifests, lazy-loads content                                │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────┬──────────────┬──────────────┐
         │              │              │              │              │
         ▼              ▼              ▼              ▼              ▼
  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
  │   Ferni    │ │    Alex    │ │    Maya    │ │   Peter    │ │   Jordan   │
  │ Coordinator│ │   Comms    │ │   Habits   │ │  Research  │ │  Planning  │
  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘
         │              │              │              │              │
         └──────────────┴──────────────┴──────────────┴──────────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │    PersonaConfig     │
                         │    Interface         │
                         ├──────────────────────┤
                         │ - identity           │
                         │ - voice              │
                         │ - personality        │
                         │ - tools              │
                         │ - handoff            │
                         │ - content            │
                         └──────────────────────┘
```

### Bundle Structure

```
src/personas/bundles/<agent-id>/
├── persona.manifest.json     # Configuration
│   ├── identity              # Name, description, aliases
│   ├── voice                 # Cartesia voice config
│   ├── personality           # Traits, moods, warmth
│   ├── role                  # Domains, capabilities
│   ├── team                  # Handoff triggers, phrases
│   ├── tools                 # Available tool domains
│   ├── emotional             # Empathy settings
│   └── humanization          # Natural speech config
│
├── identity/
│   ├── biography.md          # Background story
│   └── system-prompt.md      # Behavioral instructions
│
└── content/
    ├── behaviors/            # Response patterns
    │   ├── greetings.json
    │   ├── backchannels.json
    │   ├── catchphrases.json
    │   └── ...
    ├── stories/              # Personal anecdotes
    ├── knowledge/            # Domain expertise
    └── voice/                # Expression patterns
```

---

## Handoff System

Seamless agent-to-agent transitions:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Handoff Detection                                │
├────────────────────────────────────────────────────────────────────────┤
│  1. Explicit triggers: "talk to Alex", "get Maya"                      │
│  2. Intent detection: "send email" → Alex, "track habit" → Maya        │
│  3. Domain matching: financial questions → Maya/Peter                   │
│  4. LLM decision: Complex scenarios evaluated by model                 │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Handoff Execution                                │
├────────────────────────────────────────────────────────────────────────┤
│  1. Save current context to memory                                      │
│  2. Coordinator speaks introduction (optional)                          │
│  3. Load target agent's persona config                                  │
│  4. Target agent speaks entrance phrase                                 │
│  5. Context transferred to new agent                                    │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Metrics & Tracing                                │
├────────────────────────────────────────────────────────────────────────┤
│  - Duration tracking                                                    │
│  - Success/failure logging                                              │
│  - Distributed tracing                                                  │
│  - Failure reason categorization                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Tool System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Tool Registry                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  100+ tools organized by domain                                         │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────┬──────────────┬──────────────┐
         │              │              │              │              │
         ▼              ▼              ▼              ▼              ▼
  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
  │  calendar  │ │communication│ │   habits   │ │  finance   │ │  handoff   │
  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘
  │ schedule   │ │ sendEmail  │ │ createHabit│ │ getBudget  │ │ handoffTo* │
  │ getSlots   │ │ sendText   │ │ trackHabit │ │ trackSpend │ │            │
  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘
```

### Tool Domain Assignment

Personas receive tools based on their configured domains:

```json
{
  "tools": {
    "domains": ["memory", "handoff", "calendar", "communication"],
    "required": ["scheduleAppointment"],
    "optional": ["getWeather"],
    "forbidden": ["dayTrade", "analyzeStock"]
  }
}
```

---

## Memory System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Memory Manager                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Coordinates all memory operations with cross-session awareness         │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ├──────────────────────────────┬──────────────────────────────┐
         │                              │                              │
         ▼                              ▼                              ▼
  ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
  │    User Profile    │    │ Conversation State │    │  Semantic Memory   │
  │                    │    │                    │    │                    │
  │ - Name, life stage │    │ - Active topics    │    │ - Vector embeddings│
  │ - Goals, prefs     │    │ - Emotional arc    │    │ - Key moments      │
  │ - Relationship     │    │ - Running jokes    │    │ - RAG retrieval    │
  │   stage            │    │ - Session context  │    │                    │
  └─────────┬──────────┘    └─────────┬──────────┘    └─────────┬──────────┘
            │                         │                         │
            └─────────────────────────┴─────────────────────────┘
                                      │
                                      ▼
                         ┌──────────────────────┐
                         │   Storage Backend    │
                         ├──────────────────────┤
                         │ - Firestore (prod)   │
                         │ - PostgreSQL (local) │
                         │ - In-memory (dev)    │
                         └──────────────────────┘
```

---

## Deployment Architecture

### Development (3 Servers)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Token Server   │    │   UI Server     │    │   Vite Dev      │
│  (port 3001)    │    │   (port 3002)   │    │   (port 3004)   │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ - LiveKit tokens│    │ - REST APIs     │    │ - Frontend HMR  │
│ - Spotify OAuth │    │ - Engagement    │    │ - CSS hot reload│
│ - Subscriptions │    │ - Agent registry│    │ - TypeScript    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Production (Google Cloud)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Cloud Run                                       │
├───────────────────────────────┬─────────────────────────────────────────┤
│       UI Server               │           Voice Agent                    │
│  (cloudbuild-ui.yaml)         │  (cloudbuild.yaml)                      │
│                               │                                          │
│  - Frontend serving           │  - LiveKit agent                         │
│  - All REST APIs              │  - Gemini Live                          │
│  - Token generation           │  - Cartesia TTS                         │
│  - Subscription handling      │  - Voice processing                     │
└───────────────┬───────────────┴─────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                          Google Cloud Services                         │
├─────────────────────┬────────────────────┬────────────────────────────┤
│    Firestore        │   Memorystore      │   Secret Manager           │
│    (Database)       │   (Redis Cache)    │   (API Keys)               │
└─────────────────────┴────────────────────┴────────────────────────────┘
```

---

## Data Flow

### Conversation Flow

```
1. User opens app → Connect to LiveKit room
2. User speaks → Audio streamed to Gemini Live
3. Speech transcribed → Context builders execute (parallel)
4. Context injected → LLM generates response
5. Response processed → SSML tags added
6. SSML to Cartesia → Audio synthesized
7. Audio streamed → User hears response
8. State persisted → Memory updated
```

### Handoff Flow

```
1. Intent detected (explicit or implicit)
2. Current context saved to memory
3. Coordinator announces handoff (optional)
4. Target agent loaded
5. Target speaks entrance phrase
6. Context transferred
7. Conversation continues with new agent
```

### Memory Flow

```
1. Conversation event occurs
2. Memory manager notified
3. Relevant stores updated:
   - User profile (if personal info shared)
   - Conversation state (topics, emotions)
   - Semantic store (key moments)
4. Cross-session thread maintained
5. Next session loads full context
```

---

## Security

### Authentication

- **API Keys**: Server-to-server communication
- **JWT Tokens**: Frontend/mobile apps
- **Admin Keys**: Elevated privileges for diagnostics
- **Dev Mode**: Bypasses auth in development

### Data Protection

- **CORS**: Restricted origins in production
- **Rate Limiting**: Per-IP and per-user limits
- **Input Validation**: Zod schemas for all inputs
- **Encryption**: TLS for all external communication

### Privacy

- **User ID Isolation**: Data scoped to user
- **Data Export**: GDPR-compliant export
- **Data Deletion**: Full user data wipe
- **Minimal Collection**: Only necessary data stored

---

## Performance

### Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Voice response latency | < 200ms | ~150ms |
| Context builder execution | < 50ms | ~30ms |
| Handoff completion | < 500ms | ~300ms |
| Memory retrieval | < 100ms | ~50ms |

### Optimizations

- **Parallel context builders**: Run simultaneously
- **Lazy content loading**: Load stories/knowledge on demand
- **Redis caching**: Frequently accessed data
- **Connection pooling**: Database connections
- **WebSocket reuse**: LiveKit connections

---

## Monitoring

### Dashboards

| Dashboard | Purpose |
|-----------|---------|
| Cognitive Dashboard | AI reasoning, context builder performance |
| Persistence Metrics | Memory system, Firestore operations |
| Tools Dashboard | Tool usage, success rates |
| Handoff Diagnostics | Agent transfer metrics |

### Alerting

- **Latency spikes**: Response time > 500ms
- **Error rates**: > 1% failure rate
- **Handoff failures**: > 5% failure rate
- **Memory operations**: > 1% failure rate

---

## Future Architecture

Planned enhancements:

1. **Vector Store**: Pinecone/Weaviate for semantic search
2. **Multi-model**: Support for Claude, GPT-4 alongside Gemini
3. **Federated Learning**: Cross-user pattern learning
4. **Edge Processing**: Client-side voice detection
5. **Multi-tenant**: Multiple team configurations
