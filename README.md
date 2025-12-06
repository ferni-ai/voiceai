# Voice AI - Your AI Financial Coach

A sophisticated multi-persona voice AI agent built with TypeScript that uses Google's Gemini Live API for speech recognition and Cartesia Sonic 3 for text-to-speech synthesis. Features deeply human, emotionally intelligent conversations with persistent memory and adaptive behaviors.

## 🚀 Quick Start

```bash
# 1. Clone and install
npm install

# 2. Create .env with your API keys
cp .env.example .env  # Then edit with your keys

# 3. Run locally (in-memory storage)
npm run dev

# OR with persistence (PostgreSQL + Redis)
npm run services:up   # Start Docker services
npm run dev
```

## 🌐 Deploy to Google Cloud

```bash
# One command deploys to Cloud Run with Firestore
./scripts/deploy-gcp.sh
```

See [docs/google-cloud-deployment.md](docs/google-cloud-deployment.md) for details.

## ✨ Key Features

- **🎭 Multi-Persona System**: Multiple AI personalities (Jack Bogle, Jack B, Peter Lynch, and more)
- **🧠 Intelligent Context Injection**: 15 modular context builders for human-like responses
- **💬 Real-time Emotion Detection**: Detects distress, joy, fear, and adapts responses
- **🎯 Intent Classification**: 27 intent types for understanding user needs
- **📚 Persistent Memory**: Cross-session memory with user profiles (Firestore/PostgreSQL)
- **🔊 Adaptive Speech**: WPM tracking, SSML tagging, energy mirroring
- **🛠️ 35+ Intelligent Tools**: Financial calculations, storytelling, memory, awareness

## Architecture Overview

```
User Speech → Gemini Live (STT) → Context Builders → LLM → SSML Tagger → Cartesia (TTS) → Audio
                                       ↑
                                 PersonaConfig
```

### The Context Builder System

The heart of the agent's intelligence. Each turn, 15 modular builders analyze the conversation and inject guidance:

| Builder | What It Does |
|---------|-------------|
| `emotional` | Detects distress, validates feelings, mirrors emotion |
| `crisis` | Market panic, grief, life events (job loss, divorce, etc.) |
| `celebration` | Financial milestones, achievements, good news |
| `memory` | Cross-session callbacks, key moments, time awareness |
| `engagement` | Curiosity moments, depth, running jokes |
| `pacing` | Response length matching, fatigue detection |
| `discovery` | New user onboarding (name, life stage, goals) |
| `personal` | Name usage, small details, personal callbacks |
| `topics` | Topic threading, circle-back, goal connection |
| `intent` | Empathy-first responses, acknowledgment before advice |
| `goodbye` | Warm wrap-ups, interruption recovery, silence handling |
| `music` | Music state awareness |
| `humanizing` | Self-corrections, humor, catchphrases, pet peeves |
| `rag` | Semantic knowledge retrieval |
| `tasks` | Task manager integration for guided flows |

### Agent Management (NEW!)

Agents are now defined as **bundles** that are auto-discovered. No hardcoding needed!

```bash
# List all agents
npm run agents list

# Create a new agent
npm run agents create my-advisor --template sage

# Validate an agent
npm run agents validate my-advisor

# Test an agent
PERSONA_ID=my-advisor npm run dev
```

Each agent lives in `src/personas/bundles/<agent-id>/` with:
- `persona.manifest.json` - Configuration
- `identity/` - Background and instructions
- `content/` - Stories, knowledge, behaviors

See [docs/AGENT-MANAGEMENT.md](docs/AGENT-MANAGEMENT.md) for full guide.

### Bundle Structure

```
src/personas/bundles/my-advisor/
├── persona.manifest.json    # Agent configuration
├── identity/
│   ├── biography.md        # Background story
│   └── system-prompt.md    # Behavioral instructions
└── content/
    ├── behaviors/          # Greetings, backchannels
    ├── stories/            # Personal anecdotes
    └── knowledge/          # Domain expertise
```

### Quick Example: persona.manifest.json

```json
{
  "version": "1.0.0",
  "manifest_version": 2,
  "identity": {
    "id": "my-advisor",
    "name": "Alex",
    "description": "Friendly financial advisor"
  },
  "voice": {
    "provider": "cartesia",
    "voice_id": "${env:MY_ADVISOR_VOICE_ID|default-uuid}"
  },
  "personality": {
    "warmth": 0.8,
    "humor_level": 0.4,
    "traits": ["helpful", "knowledgeable"]
  },
  "team": {
    "role_id": "advisor",
    "handoff_triggers": ["financial advice", "money help"]
  }
}
```

## Environment Setup

### Required API Keys

| Key | Get From | Purpose |
|-----|----------|---------|
| `LIVEKIT_URL` | [LiveKit Cloud](https://cloud.livekit.io) | Real-time voice streaming |
| `LIVEKIT_API_KEY` | LiveKit Cloud | Authentication |
| `LIVEKIT_API_SECRET` | LiveKit Cloud | Authentication |
| `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com) | Gemini Live STT/LLM |
| `CARTESIA_API_KEY` | [Cartesia](https://play.cartesia.ai) | Text-to-speech |

### Storage Options

| Environment | Storage | Cache | Setup |
|-------------|---------|-------|-------|
| **Local (default)** | In-memory | None | Just run `npm run dev` |
| **Local (persistent)** | PostgreSQL | Redis | `npm run services:up` |
| **Google Cloud** | Firestore | Memorystore | Automatic |

### Dispatch with Persona Selection

When dispatching via LiveKit, specify the persona:

```python
# Python SDK example
await room.local_participant.dispatch(
    agent="multi-persona-voice-agent",
    metadata=json.dumps({"persona_id": "jack-b"})
)
```

## Available Personas

| ID | Name | Style |
|----|------|-------|
| `jack-bogle` | John Bogle | Wise, warm, index investing pioneer |
| `jack-b` | Jack B | Casual, friendly financial advisor |
| `peter-lynch` | Peter Lynch | Practical, research-focused investor |
| `generic-advisor` | Generic Advisor | Template for new personas |

## Project Structure

```
voiceai/
├── src/
│   ├── agent.ts                 # Entry point (re-exports voice-agent)
│   ├── agents/
│   │   ├── voice-agent.ts       # Core multi-persona agent
│   │   ├── index.ts             # Agent exports
│   │   ├── shared/              # Shared utilities
│   │   │   ├── types.ts         # Common types
│   │   │   ├── health-server.ts # Health checks
│   │   │   └── external-apis.ts # Stock quotes, weather
│   │   └── handlers/            # Event handlers (handoff, silence)
│   │
│   ├── personas/                # Persona definitions
│   │   ├── types.ts             # PersonaConfig interface
│   │   ├── index.ts             # Persona registry
│   │   ├── jack-bogle/          # Jack Bogle persona
│   │   ├── jack-b/              # Jack B persona
│   │   ├── peter-lynch/         # Peter Lynch persona
│   │   └── generic-advisor/     # Template persona
│   │
│   ├── intelligence/            # Conversational intelligence
│   │   ├── context-builders/    # 15 modular context builders
│   │   │   ├── index.ts         # Orchestration
│   │   │   ├── emotional.ts     # Emotion handling
│   │   │   ├── crisis.ts        # Crisis detection
│   │   │   ├── celebration.ts   # Milestone celebration
│   │   │   ├── memory.ts        # Memory callbacks
│   │   │   ├── engagement.ts    # Engagement tracking
│   │   │   ├── pacing.ts        # Response pacing
│   │   │   ├── discovery.ts     # New user onboarding
│   │   │   ├── personal.ts      # Personal details
│   │   │   ├── topics.ts        # Topic management
│   │   │   ├── intent.ts        # Intent responses
│   │   │   ├── goodbye.ts       # Conversation endings
│   │   │   ├── music.ts         # Music state
│   │   │   ├── humanizing.ts    # Human-like behaviors
│   │   │   ├── rag.ts           # Knowledge retrieval
│   │   │   └── tasks.ts         # Task integration
│   │   ├── emotion-detector.ts
│   │   ├── intent-classifier.ts
│   │   ├── topic-tracker.ts
│   │   └── conversation-state.ts
│   │
│   ├── memory/                  # Persistent memory
│   │   ├── vector-store.ts      # Semantic search
│   │   ├── semantic-rag.ts      # RAG system
│   │   └── user-profile.ts      # User profiles
│   │
│   ├── speech/                  # Adaptive speech
│   │   ├── speech-context.ts    # WPM, energy tracking
│   │   ├── audio-prosody.ts     # Voice emotion detection
│   │   └── adaptive-ssml.ts     # Context-aware SSML
│   │
│   ├── services/                # Service orchestration
│   │   ├── index.ts             # Session services
│   │   └── conversation-manager.ts
│   │
│   ├── tools/                   # 35+ LLM tools
│   │   ├── financial.ts
│   │   ├── conversation.ts
│   │   ├── memory-tools.ts
│   │   └── index.ts
│   │
│   ├── tasks/                   # Intelligent task system
│   │   ├── task-manager.ts
│   │   └── ...tasks
│   │
│   ├── ssml-tagger.ts           # SSML processing
│   │
│   └── tests/                   # Test suite (662+ tests)
│       ├── context-builders.test.ts
│       ├── context-builders-detailed.test.ts
│       ├── memory.test.ts
│       ├── intelligence.test.ts
│       └── ...
│
├── docs/
│   ├── architecture.md
│   └── creating-personas.md     # Guide to creating personas
│
├── frontend-orb/                # React orb visualization
├── frontend-typescript/         # TypeScript frontend
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Testing

```bash
# Run all tests (662+ tests)
npm test

# Watch mode
npm run test:watch

# Specific test file
npx vitest run src/tests/context-builders.test.ts
```

### Test Categories

- **Context Builder Tests**: Crisis detection, emotional responses, discovery flows
- **Memory Tests**: User profiles, conversation history, semantic search
- **Intelligence Tests**: Emotion detection, intent classification, topic tracking
- **Speech Tests**: SSML tagging, WPM tracking, adaptive speech
- **Continuity Tests**: Cross-session memory, returning user recognition

## Configuration

### Environment Variables

```bash
# Required
LIVEKIT_URL=wss://your-server.livekit.cloud
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
GOOGLE_API_KEY=your_google_key
CARTESIA_API_KEY=your_cartesia_key

# Optional
PERSONA_ID=jack-bogle                    # Default persona
JACK_BOGLE_VOICE_ID=your_voice_id        # Persona-specific voice
LOG_LEVEL=info                           # Logging level
```

### Cartesia Voice Configuration

Each persona can have its own Cartesia voice ID:

```bash
JACK_BOGLE_VOICE_ID=a720200e-...
PETER_LYNCH_VOICE_ID=b830311f-...
```

## Creating Custom Personas

See [docs/creating-personas.md](docs/creating-personas.md) for a complete guide.

Quick overview:

1. Create `src/personas/my-persona/index.ts`
2. Define your `PersonaConfig` object
3. Register in `src/personas/index.ts`
4. Run with `PERSONA_ID=my-persona npm start`

## Performance

- **Response Latency**: < 200ms (context builder execution)
- **Memory**: Efficient singleton services
- **Tests**: 662+ tests, ~2.5s total runtime

## Troubleshooting

### Agent doesn't respond
- Check persona ID is valid: `getPersonaConfig('your-id')`
- Verify all API keys are set
- Check logs for context builder errors

### Emotional responses seem off
- Check emotion detector tests: `npx vitest run src/tests/intelligence.test.ts`
- Review crisis detection thresholds in `crisis.ts`

### Memory not persisting
- Ensure user IDs are consistent across sessions
- Check memory service initialization in logs

## Development

```bash
# Development mode with hot reload
npm run dev

# Type checking
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## Monitoring Dashboards

Internal dashboards for developers/operators (not end users):

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| **Cognitive Intelligence** | `/cognitive-dashboard.html` | AI reasoning, adaptation, performance |
| **Persistence Metrics** | `/metrics-dashboard.html` | Memory system, Firestore, sessions |
| **Tools Analytics** | `/tools-dashboard.html` | Tool usage, optimization |

```bash
# Start backend + frontend
npm run dev:agent &
cd frontend-typescript && npm run dev

# Access dashboards
open http://localhost:5173/cognitive-dashboard.html
```

See [docs/DASHBOARDS.md](docs/DASHBOARDS.md) for full guide.

## Documentation

| Doc | Description |
|-----|-------------|
| [DASHBOARDS.md](docs/DASHBOARDS.md) | Monitoring dashboards guide |
| [COGNITIVE-INTELLIGENCE-ARCHITECTURE.md](docs/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md) | How personas think differently |
| [AGENT-MANAGEMENT.md](docs/AGENT-MANAGEMENT.md) | Creating and managing agents |
| [FERNI-COMPLETE-GUIDE.md](docs/FERNI-COMPLETE-GUIDE.md) | Full Ferni implementation guide |

## References

- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [Gemini Realtime API](https://docs.livekit.io/agents/models/realtime/plugins/gemini/)
- [Cartesia Documentation](https://cartesia.ai/docs)

## License

MIT
