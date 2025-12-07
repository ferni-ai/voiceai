# 🏔️ Ferni AI - Voice-First Life Coaching Platform

<p align="center">
  <img src="brand/logo.png" alt="Ferni AI" width="120" />
</p>

<p align="center">
  <strong>Your AI life coaching team that listens, remembers, and grows with you.</strong>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-meet-the-team">Meet the Team</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-features">Features</a> •
  <a href="#-deployment">Deployment</a>
</p>

---

## 🌟 What is Ferni?

Ferni is a sophisticated multi-persona voice AI platform built with TypeScript. Using Google's Gemini Live API for real-time speech recognition and Cartesia Sonic 3 for natural text-to-speech, Ferni creates deeply human, emotionally intelligent conversations with persistent memory and adaptive behaviors.

**Philosophy**: "Get to Know Ferni First" — Team members unlock naturally as your relationship deepens, or instantly with a subscription.

## 🚀 Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd voiceai
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Run in development (3 servers)
npm run dev              # Starts all servers
```

**Development URLs:**
- **UI**: http://localhost:3004 (Vite HMR)
- **Token Server**: http://localhost:3001
- **UI Server**: http://localhost:3002

**Keyboard Shortcuts:**
- `Cmd/Ctrl+Shift+D` — Toggle dev panel
- `Cmd/Ctrl+Shift+U` — Quick unlock all team members
- `Cmd/Ctrl+Shift+R` — Reset to free tier

## 👥 Meet the Team

Ferni's team is a group of AI specialists, each with unique expertise, personalities, and stories. They hand off to each other seamlessly based on your needs.

| Agent | Role | Specialty | Icon |
|-------|------|-----------|------|
| **Ferni** | Life Coach & Coordinator | Team orchestration, powerful questions, purpose, relationships, resilience | 🏔️ |
| **Alex Chen** | Communication Coach & Chief of Staff | Emails, calendar, scheduling, difficult conversations, assertiveness | 💬 |
| **Maya Santos** | Life Habits Coach | Habits, routines, wellness, budgeting, behavior science (Atomic Habits, Tiny Habits) | 🌱 |
| **Peter John** | The Quant & Research Specialist | Pattern analysis, stock research, cross-domain insights, data storytelling | 🔬 |
| **Jordan Taylor** | Lifetime Planner | Life milestones, events, vacations, goal planning, celebrations | 🌟 |
| **Nayan** | Lifetime Advisor (Premium) | Wisdom, philosophy, meditation, long-term thinking, spiritual guidance | 🕉️ |

### Team Unlocking

| Relationship Stage | Unlocks | Requires |
|-------------------|---------|----------|
| **First Meeting** | Ferni only | New user |
| **Getting Started** | + Maya Santos | 2 conversations |
| **Building Trust** | + Peter John | 7 conversations, 3 days |
| **Established** | + Alex Chen, Jordan Taylor | 20 conversations, 7 days |
| **Deep Partnership** | + Nayan (Premium) | Partner tier subscription |

## 🏗️ Architecture

### High-Level Flow

```
User Speech → LiveKit → Gemini Live (STT) → Context Builders → LLM → SSML Tagger → Cartesia (TTS) → Audio
                                                   ↑
                                           PersonaConfig + Tools
```

### The Context Builder System

The intelligence engine that makes conversations feel human. 15+ modular builders analyze each turn and inject contextual guidance:

| Builder | Purpose |
|---------|---------|
| `emotional` | Detects distress, validates feelings, mirrors emotion |
| `crisis` | Market panic, grief, job loss, divorce detection |
| `celebration` | Financial milestones, achievements, good news |
| `memory` | Cross-session callbacks, key moments, time awareness |
| `engagement` | Curiosity moments, depth tracking, running jokes |
| `pacing` | Response length matching, fatigue detection |
| `discovery` | New user onboarding (name, life stage, goals) |
| `personal` | Name usage, small details, personal callbacks |
| `topics` | Topic threading, circle-back, goal connection |
| `intent` | 27 intent types, empathy-first responses |
| `goodbye` | Warm wrap-ups, interruption recovery |
| `humanizing` | Self-corrections, humor, catchphrases |
| `rag` | Semantic knowledge retrieval |
| `tasks` | Task manager integration |

### Persona Bundle Architecture

Each persona is a self-contained bundle with rich content:

```
src/personas/bundles/ferni/
├── persona.manifest.json       # Configuration, tools, handoffs
├── identity/
│   ├── biography.md           # Background story
│   └── system-prompt.md       # Behavioral instructions
└── content/
    ├── behaviors/             # 40+ behavior files
    │   ├── greetings.json
    │   ├── backchannels.json
    │   ├── catchphrases.json
    │   ├── vulnerability.json
    │   └── ...
    ├── stories/               # Personal anecdotes
    │   ├── tsunami-story.json
    │   └── ...
    ├── knowledge/             # Domain expertise
    │   ├── powerful-questions.md
    │   └── ...
    └── voice/                 # Expression patterns
        └── expressions.json
```

## ✨ Features

### Voice & Conversation
- **Real-time Voice AI** — Sub-200ms response latency
- **Emotion Detection** — Detects distress, joy, fear, confusion
- **Adaptive Speech** — WPM tracking, SSML tagging, energy mirroring
- **Natural Humanization** — Disfluencies, backchannels, thinking sounds
- **Meaningful Silence** — Comfortable pauses, not just dead air

### Memory & Intelligence
- **Persistent Memory** — Cross-session memory with Firestore/PostgreSQL
- **Semantic RAG** — Vector-based knowledge retrieval
- **User Profiles** — Life stage, goals, preferences, history
- **Relationship Stages** — Deepening connection over time

### Team Capabilities

| Domain | Tools | Example |
|--------|-------|---------|
| **Communication** | Email, calendar, SMS, calls | "Send an email to my boss about Thursday" |
| **Habits** | Create, track, streaks, challenges | "Help me build a morning routine" |
| **Research** | Stock analysis, pattern discovery | "Analyze Apple's fundamentals" |
| **Life Planning** | Milestones, goals, events | "Help me plan my wedding" |
| **Wisdom** | Philosophy, meditation guidance | "What should I focus on in life?" |
| **Memory** | Remember facts, recall history | "What do you know about me?" |

### Integrations
- **Spotify** — Voice-controlled music playback
- **Plaid** — Bank account linking for financial insights
- **Google Calendar** — Scheduling and reminders
- **Twilio** — SMS and voice calls

## 📁 Project Structure

```
voiceai/
├── src/
│   ├── agents/                 # Voice agent core
│   │   ├── voice-agent.ts      # Main agent implementation
│   │   ├── handlers/           # Event handlers
│   │   ├── processors/         # Turn processing
│   │   └── shared/             # Shared utilities
│   │
│   ├── personas/               # AI personalities
│   │   ├── bundles/            # Auto-discovered persona bundles
│   │   │   ├── ferni/          # Life coach (coordinator)
│   │   │   ├── alex-chen/      # Communications specialist
│   │   │   ├── maya-santos/    # Habits coach
│   │   │   ├── peter-john/     # Research analyst
│   │   │   ├── jordan-taylor/  # Life planner
│   │   │   └── nayan-patel/    # Wisdom sage
│   │   ├── registry/           # Unified agent registry
│   │   └── types.ts            # PersonaConfig interface
│   │
│   ├── intelligence/           # Conversational intelligence
│   │   ├── context-builders/   # 15+ context builders
│   │   ├── emotion-detector.ts
│   │   ├── intent-classifier.ts
│   │   └── topic-tracker.ts
│   │
│   ├── tools/                  # 100+ LLM tools
│   │   ├── domains/            # Domain-organized tools
│   │   │   ├── calendar/
│   │   │   ├── communication/
│   │   │   ├── finance/
│   │   │   ├── habits/
│   │   │   ├── handoff/
│   │   │   └── ...
│   │   ├── habit-coaching/     # Habit system
│   │   └── handoff/            # Handoff system
│   │
│   ├── services/               # Backend services
│   │   ├── engagement/         # User engagement tracking
│   │   ├── conversation/       # Conversation management
│   │   ├── team-handler-registry/
│   │   └── stripe-subscription.ts
│   │
│   ├── api/                    # REST API routes
│   │   ├── auth-middleware.ts  # JWT/API key auth
│   │   ├── engagement-routes.ts
│   │   ├── subscription-routes.ts
│   │   └── ...
│   │
│   ├── memory/                 # Persistence layer
│   │   ├── firestore-store.ts
│   │   ├── postgres-store.ts
│   │   ├── vector-store.ts
│   │   └── semantic-rag.ts
│   │
│   └── speech/                 # Speech processing
│       ├── speech-context.ts
│       └── adaptive-ssml.ts
│
├── frontend-typescript/        # TypeScript frontend
│   ├── src/
│   │   ├── ui/                 # UI components
│   │   ├── services/           # Frontend services
│   │   └── config/             # Design system
│   └── public/
│
├── docs/                       # Documentation
│   ├── architecture/
│   ├── deployment/
│   ├── features/
│   └── guides/
│
├── brand/                      # Brand assets
├── scripts/                    # Build & deploy scripts
├── token-server.js             # LiveKit token server
├── ui-server.js                # Production UI server
└── package.json
```

## 🔧 Configuration

### Required Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `LIVEKIT_URL` | [LiveKit Cloud](https://cloud.livekit.io) | Real-time voice streaming |
| `LIVEKIT_API_KEY` | LiveKit Cloud | Authentication |
| `LIVEKIT_API_SECRET` | LiveKit Cloud | Authentication |
| `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com) | Gemini Live STT/LLM |
| `CARTESIA_API_KEY` | [Cartesia](https://play.cartesia.ai) | Text-to-speech |

### Optional Services

| Variable | Purpose |
|----------|---------|
| `SPOTIFY_CLIENT_ID/SECRET` | Music playback |
| `PLAID_CLIENT_ID/SECRET` | Bank account linking |
| `STRIPE_SECRET_KEY` | Subscription payments |
| `TWILIO_*` | SMS and voice calls |
| `GOOGLE_CALENDAR_*` | Calendar integration |

### Storage Options

| Environment | Storage | Cache | Setup |
|-------------|---------|-------|-------|
| **Local (default)** | In-memory | None | Just run `npm run dev` |
| **Local (persistent)** | PostgreSQL | Redis | `npm run services:up` |
| **Google Cloud** | Firestore | Memorystore | Automatic |

## 🚀 Deployment

### Development (3 Servers)

```bash
# Terminal 1: Token Server
node token-server.js

# Terminal 2: UI Server
PORT=3002 node ui-server.js

# Terminal 3: Frontend (Vite)
cd frontend-typescript && npm run dev
```

### Production (Google Cloud)

```bash
# Deploy voice agent
./scripts/deploy-gcp.sh

# Deploy UI server (serves everything)
./scripts/deploy-ui.sh
```

**Production architecture:**
- **UI Server** — Cloud Run, handles frontend + APIs
- **Voice Agent** — Cloud Run, LiveKit agent only
- **Database** — Firestore
- **Cache** — Memorystore (Redis)

See [docs/deployment/](docs/deployment/) for detailed guides.

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Specific file
npx vitest run src/tests/context-builders.test.ts

# Coverage
npm run test:coverage
```

### Test Categories
- **Context Builders** — Crisis detection, emotional responses
- **Memory** — User profiles, conversation history
- **Intelligence** — Emotion, intent, topic tracking
- **Handoffs** — Agent transitions
- **Tools** — Tool execution and validation

## 📊 Monitoring Dashboards

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| **Cognitive Intelligence** | `/cognitive-dashboard.html` | AI reasoning, adaptation |
| **Persistence Metrics** | `/metrics-dashboard.html` | Memory system, sessions |
| **Tools Analytics** | `/tools-dashboard.html` | Tool usage, optimization |
| **Handoff Diagnostics** | `/api/diagnostics/handoffs` | Agent transfer metrics |

## 🛠️ Agent Management CLI

```bash
# List all agents
npm run agents list

# Create new agent
npm run agents create my-advisor --template sage

# Validate agent bundle
npm run agents validate my-advisor

# Test specific agent
PERSONA_ID=my-advisor npm run dev
```

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [FERNI-COMPLETE-GUIDE.md](docs/FERNI-COMPLETE-GUIDE.md) | Full Ferni implementation |
| [AGENT-MANAGEMENT.md](docs/AGENT-MANAGEMENT.md) | Creating and managing agents |
| [COGNITIVE-INTELLIGENCE-ARCHITECTURE.md](docs/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md) | How personas think differently |
| [HANDOFF_ARCHITECTURE.md](docs/HANDOFF_ARCHITECTURE.md) | Agent handoff system |
| [creating-personas.md](docs/creating-personas.md) | Building custom personas |
| [local-setup.md](docs/local-setup.md) | Development environment |
| [google-cloud-deployment.md](docs/google-cloud-deployment.md) | Production deployment |

## 🎨 Brand & Design

Ferni uses a warm, earthy design system:

| Element | Color | Use |
|---------|-------|-----|
| **Ferni Sage** | `#4a6741` | Primary, life coach |
| **Cedar Brown** | `#9a7b5a` | Secondary, grounded |
| **Ocean Teal** | `#3a6b73` | Peter, research |
| **Slate Blue** | `#5a6b8a` | Alex, communications |
| **Rose** | `#a67a6a` | Maya, wellness |
| **Coral** | `#c4856a` | Jordan, celebrations |
| **Warm Gray** | `#8a7a6a` | Nayan, wisdom |

See [brand/FERNI-BRAND-GUIDELINES.md](brand/FERNI-BRAND-GUIDELINES.md) for full design system.

## 🔐 API Authentication

All API routes support multiple authentication methods:

1. **API Key** — `X-API-Key` header
2. **JWT Bearer** — `Authorization: Bearer <token>`
3. **Dev Mode** — `?admin_key=dev-mode` (development only)

```bash
# Set in production
API_KEYS=key1,key2,key3
ADMIN_API_KEYS=admin_key1
JWT_SECRET=your-256-bit-secret
ALLOWED_ORIGINS=https://ferni.ai
```

## 📱 Mobile Apps

Native iOS and Android apps are available:

- **iOS**: `apps/ios/` — Swift/SwiftUI
- **Android**: `apps/android/` — Kotlin

See [apps/README.md](apps/README.md) for build instructions.

## 🤝 Contributing

**New to the codebase?** Start with [ONBOARDING.md](ONBOARDING.md) for a guided week-1 experience.

| Document | Purpose |
|----------|---------|
| [ONBOARDING.md](ONBOARDING.md) | New developer guide (day-by-day) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, PR process |
| [BACKLOG.md](BACKLOG.md) | Product backlog and roadmap |
| [CLAUDE.md](CLAUDE.md) | Quick coding reference |
| [.cursorrules](.cursorrules) | Complete coding standards |

### Key Rules

1. Use `createLogger()` for all logging (never `console.log`)
2. Add explicit types for all function parameters (no `any`)
3. Files should be < 500 lines
4. Run `npm run quality` before committing
5. Include tests for new features

## 📄 License

MIT

---

<p align="center">
  <strong>Built with ❤️ by the Ferni AI Team</strong>
</p>

<p align="center">
  <em>"Your net worth is not your self-worth."</em> — Ferni
</p>
