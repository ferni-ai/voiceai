# Ferni AI

<p align="center">
  <img src="brand/logos/ferni-logo.svg" alt="Ferni AI" width="120" />
</p>

<p align="center">
  <strong>Your AI life coaching team that listens, remembers, and grows with you.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#meet-the-team">Meet the Team</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#documentation">Docs</a>
</p>

---

## Our Mission

> **We believe in making AI human, and the decisions we make will reflect that.**

Ferni isn't trying to pass the Turing test. We're trying to pass the *"would I want to talk to this AI again?"* test.

Every feature we build, every line of code we write is guided by a simple question: **Does this make the AI feel more human?**

| Principle | What It Means |
|-----------|---------------|
| **Human connection over technical perfection** | Warmth matters more than speed |
| **Relationship over transaction** | Every interaction builds on the last |
| **Growth through gentleness** | Sustainable change, not pressure |
| **Authentic personality** | Real character, not corporate neutrality |
| **Presence over performance** | Truly listening, not just responding |

See [`CORE-PRINCIPLES.md`](./CORE-PRINCIPLES.md) for our complete philosophy.

---

## What is Ferni?

Ferni is a voice-first AI life coaching platform. Using real-time speech recognition (Gemini Live) and natural text-to-speech (Cartesia Sonic), Ferni creates emotionally intelligent conversations with persistent memory and adaptive behaviors.

**The Experience**: Start with Ferni, your life coach. As your relationship deepens, meet the rest of the team - each specialist brings unique expertise while sharing context about you.

---

## Quick Start

```bash
# Clone and install
git clone <repo-url> && cd voiceai && npm install

# Configure environment
cp .env.example .env  # Add your API keys

# Start development (3 servers)
npm run dev
```

**Development URLs:**
| Server | URL | Purpose |
|--------|-----|---------|
| Frontend | http://localhost:3004 | Vite with HMR |
| UI Server | http://localhost:3002 | APIs |
| Token Server | http://localhost:3001 | Auth |

**Dev Shortcuts:** `Cmd+Shift+D` (dev panel) &bull; `Cmd+Shift+U` (unlock team)

---

## Meet the Team

| Agent | Role | Specialty |
|-------|------|-----------|
| **Ferni** | Life Coach | Team orchestration, purpose, relationships, resilience |
| **Maya Santos** | Habits Coach | Routines, wellness, behavior science |
| **Peter John** | Research Analyst | Pattern analysis, data insights |
| **Alex Chen** | Communications | Emails, calendar, difficult conversations |
| **Jordan Taylor** | Life Planner | Milestones, events, celebrations |
| **Nayan** | Wisdom Sage | Philosophy, meditation, long-term thinking |

Team members unlock naturally through conversation or instantly with subscription.

---

## Architecture

```
User Speech → LiveKit → Gemini (STT) → Context Builders → LLM → SSML → Cartesia (TTS) → Audio
                                              ↑
                                      PersonaConfig + Tools + Memory
```

### What Makes Ferni Human

| System | Purpose |
|--------|---------|
| **Context Builders** | 15+ modules that inject emotional awareness, memory, pacing |
| **Persona Bundles** | Rich character files: biography, behaviors, stories, voice |
| **Persistent Memory** | Cross-session recall, relationship tracking, key moments |
| **Natural Speech** | Backchannels, thinking sounds, adaptive prosody |
| **Meaningful Silence** | Comfortable pauses, not awkward gaps |

### Project Structure

```
src/
├── agents/          # Voice agent core
├── personas/        # AI personalities (bundles/)
├── intelligence/    # Context builders, emotion, intent
├── tools/           # 100+ LLM tools by domain
├── services/        # Business logic
├── memory/          # Firestore, Postgres, vectors
├── speech/          # SSML, prosody, naturalness
└── api/             # REST endpoints

frontend-typescript/ # TypeScript UI
docs/               # Architecture, guides, features
brand/              # Design assets
```

---

## Configuration

### Required API Keys

| Variable | Source |
|----------|--------|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | [LiveKit Cloud](https://cloud.livekit.io) |
| `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com) |
| `CARTESIA_API_KEY` | [Cartesia](https://play.cartesia.ai) |

### Optional Integrations

Spotify, Plaid, Stripe, Twilio, Google Calendar - see `.env.example`

---

## Deployment

```bash
# Production (Google Cloud Run)
./scripts/deploy-gcp.sh   # Voice agent
./scripts/deploy-ui.sh    # UI + APIs
```

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for details.

---

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run quality       # Typecheck + lint + test
```

---

## Documentation

### Getting Started
| Doc | Purpose |
|-----|---------|
| [`ONBOARDING.md`](./ONBOARDING.md) | New developer guide |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to contribute |
| [`CLAUDE.md`](./CLAUDE.md) | Quick coding reference |

### Architecture
| Doc | Purpose |
|-----|---------|
| [`CORE-PRINCIPLES.md`](./CORE-PRINCIPLES.md) | Our mission and philosophy |
| [`docs/architecture/CLEAN-ARCHITECTURE.md`](./docs/architecture/CLEAN-ARCHITECTURE.md) | System design |
| [`docs/architecture/AGENT-AGNOSTIC-ARCHITECTURE.md`](./docs/architecture/AGENT-AGNOSTIC-ARCHITECTURE.md) | Tool/persona patterns |

### Features
| Doc | Purpose |
|-----|---------|
| [`docs/guides/FERNI-COMPLETE-GUIDE.md`](./docs/guides/FERNI-COMPLETE-GUIDE.md) | Full Ferni implementation |
| [`docs/guides/creating-personas.md`](./docs/guides/creating-personas.md) | Building personas |
| [`docs/architecture/MONETIZATION-SYSTEM.md`](./docs/architecture/MONETIZATION-SYSTEM.md) | Subscriptions & unlocks |

---

## Brand & Design

Ferni uses a warm, earthy design language:

| Color | Hex | Use |
|-------|-----|-----|
| **Ferni Sage** | `#4a6741` | Primary, life coach |
| **Cedar Brown** | `#9a7b5a` | Secondary, grounded |
| **Ocean Teal** | `#3a6b73` | Research |
| **Slate Blue** | `#5a6b8a` | Communications |
| **Rose** | `#a67a6a` | Wellness |

See [`brand/FERNI-BRAND-GUIDELINES.md`](./brand/FERNI-BRAND-GUIDELINES.md) for the full design system.

---

## CLI

```bash
npm run ferni              # Interactive CLI
npm run ferni deploy ui    # Deploy
npm run ferni test quick   # Quick tests
npm run ferni health       # Health check
```

See [`SCRIPTS.md`](./SCRIPTS.md) for all commands.

---

## Contributing

1. Read [`CORE-PRINCIPLES.md`](./CORE-PRINCIPLES.md) first
2. Follow standards in [`.cursorrules`](./.cursorrules)
3. Run `npm run quality` before committing
4. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for PR process

---

<p align="center">
  <strong>Built with care by the Ferni AI team</strong>
</p>

<p align="center">
  <em>"Your net worth is not your self-worth."</em> — Ferni
</p>
