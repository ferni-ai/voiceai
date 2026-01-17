# Ferni AI

<p align="center">
  <img src="design-system/assets/logos/ferni-logo.svg" alt="Ferni AI" width="120" />
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

# Install global CLI
npm link

# Configure environment
cp .env.example .env  # Add your API keys

# Start development
ferni dev              # Or: npm run dev
```

**Development URLs:**
| Server | URL | Purpose |
|--------|-----|---------|
| Frontend | http://localhost:3004 | Vite with HMR |
| UI Server | http://localhost:3002 | APIs |
| Token Server | http://localhost:3001 | Auth |

**Dev Shortcuts:** `Cmd+Shift+D` (dev panel) &bull; `Cmd+Shift+U` (unlock team)

**Useful Commands:**
```bash
ferni status           # Check all services
ferni doctor           # System diagnostics
ferni agents new       # Create new AI agent
```

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

apps/web/ # TypeScript UI
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
# Production (Blue-Green with health checks)
ferni deploy agent      # Voice agent → Cloud Run
ferni deploy ui         # UI server → Cloud Run
ferni deploy frontend   # App → Firebase Hosting
ferni deploy landing    # Landing → Firebase Hosting
ferni deploy all        # Deploy everything
```

All deploys use **blue-green deployment**:
1. Deploy new version with no traffic
2. Health check the new revision
3. If healthy → shift 100% traffic
4. If unhealthy → keep traffic on old version

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for details.

---

## Automation & Quality Gates

| Gate | When | What |
|------|------|------|
| **Pre-commit** | Every commit | Typecheck, lint, tests, design tokens |
| **Conventional Commits** | Commit msg | Format enforced via commitlint |
| **CI Pipeline** | Every PR | Full test suite, build verification |
| **Blue-Green Deploy** | Production | Safe rollouts with health checks |
| **Auto-Release** | Successful deploy | Semver tags + GitHub releases |
| **Dependabot** | Weekly | Dependency updates |
| **Slack Alerts** | Deploy events | Success/failure notifications |

```bash
ferni test quick      # Quick validation
ferni test all        # Full test suite
npm run quality       # Run all checks locally
npm run quality:full  # Full audit including UI
```

See [docs/BRANCH-PROTECTION.md](./docs/BRANCH-PROTECTION.md) for branch rules.

---

## Testing

```bash
ferni test quick      # Quick validation
ferni test all        # Full test suite
npm test              # Run unit tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
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
| [`docs/VOICE-CODING.md`](./docs/VOICE-CODING.md) | Voice-driven coding with Claude Code |
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

See [`design-system/docs/brand/FERNI-BRAND-GUIDELINES.md`](./design-system/docs/brand/FERNI-BRAND-GUIDELINES.md) for the full design system.

---

## Ferni CLI

The Ferni CLI provides a unified interface for development, deployment, platform oversight, and the entire SDLC.

### Install

```bash
# Option 1: Global binary (standalone, no dependencies)
sudo cp dist/ferni /usr/local/bin/

# Option 2: npm link (development)
npm link
```

### Quick Reference

```bash
ferni                      # Interactive mode - explore all commands
ferni --help               # Full command list
```

### Development

| Command | Description |
|---------|-------------|
| `ferni dev start` | Start all development servers |
| `ferni deploy ui` | Deploy UI server (blue-green) |
| `ferni deploy agent` | Deploy voice agent (blue-green) |
| `ferni deploy gce` | Deploy voice agent to GCE |
| `ferni test quick` | Quick validation tests |
| `ferni quality all` | Run all quality checks |
| `ferni pr create` | Create a pull request |
| `ferni release create` | Create a new release |

### Operations

| Command | Description |
|---------|-------------|
| `ferni status` | Check all service health |
| `ferni logs agent --tail` | Stream agent logs |
| `ferni doctor` | Run system diagnostics |
| `ferni db status` | Check database health |
| `ferni env check` | Validate environment |
| `ferni secrets check` | Audit secret rotation |
| `ferni costs summary` | View cloud costs |

### Platform Oversight

| Command | Description |
|---------|-------------|
| `ferni rollback agent` | Rollback to previous version |
| `ferni metrics agent` | View real-time metrics |
| `ferni sessions active` | List active user sessions |
| `ferni sla report` | Check SLA compliance |
| `ferni traffic canary 10` | Canary 10% traffic to new version |
| `ferni alerts active` | Show active alerts |
| `ferni oncall who` | Who's on call right now? |
| `ferni runbook list` | List available runbooks |
| `ferni backup create` | Create database backup |

### Chaos & Testing

| Command | Description |
|---------|-------------|
| `ferni chaos latency 500` | Inject 500ms latency |
| `ferni chaos error 10` | Inject 10% error rate |
| `ferni experiments list` | List A/B experiments |
| `ferni experiments results` | View experiment results |

### Developer Experience

| Command | Description |
|---------|-------------|
| `ferni init full` | Initialize dev environment |
| `ferni context prod` | Switch to production context |
| `ferni tunnel gce` | SSH tunnel to GCE instance |
| `ferni replay list` | List session replays |
| `ferni cache clear` | Clear CDN/Redis cache |
| `ferni notify slack` | Send Slack notification |

### Self-Healing

| Command | Description |
|---------|-------------|
| `ferni self-heal health` | System health overview |
| `ferni circuits status` | Circuit breaker states |
| `ferni restart agent` | Restart voice agent |
| `ferni diagnose` | AI-powered error diagnosis |
| `ferni anomalies recent` | View detected anomalies |

### AI Automation

| Command | Description |
|---------|-------------|
| `ferni ai` | Start AI coding session |
| `ferni review` | AI code review |
| `ferni test-gen` | Generate tests with AI |
| `ferni docs generate` | AI-powered documentation |
| `ferni security audit` | Security vulnerability scan |

### Agent Management

| Command | Description |
|---------|-------------|
| `ferni agents new` | Create new AI agent (wizard) |
| `ferni personas list` | List all personas |
| `ferni tools list` | List all LLM tools |
| `ferni voices preview` | Preview available voices |
| `ferni tokens sync` | Sync design tokens |

### Live Voice Conversation

**Talk to Ferni from your terminal** - uses the full platform with all 70+ context builders, memory, and real-time voice.

```bash
# Start a voice conversation
ferni voice                    # Talk to Ferni
ferni voice --persona maya     # Talk to Maya
ferni voice --debug            # Show debug info
```

**Prerequisites:**
1. Token server running: `node token-server.js`
2. Agent running: `pnpm agent:dev`

**How it works:**
- Connects to the REAL platform via LiveKit
- Your mic → Gemini Live STT → Context Builders → LLM → Cartesia TTS → Your speakers
- Full persistent memory and all persona capabilities

### Voice-Driven Coding

**Talk to Ferni, code with Claude** - use your voice to drive Claude Code with Ferni as your narrator. Services auto-start!

```bash
# Just run this - services start automatically
ferni code

# Options
ferni code --dir ./myproject  # Work in a specific directory
ferni code --debug            # Show MCP events and transcriptions
ferni code --cloud            # Use production services
```

**Prerequisites:**
1. Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. API keys configured in `.env`

**How it works:**
1. You speak → Ferni transcribes → Claude Code executes
2. Claude uses MCP tools to narrate: `mcp__ferni__narrate`, `mcp__ferni__report_progress`
3. Ferni speaks progress via TTS

**Full documentation:** [`docs/VOICE-CODING.md`](./docs/VOICE-CODING.md)

**Architecture:**

```
You speak → Ferni (STT) → Claude Code → MCP Tools → Ferni (TTS) → You hear
                              │              │
                              │              ├── mcp__ferni__narrate
                              │              ├── mcp__ferni__report_progress
                              │              └── mcp__ferni__task_complete
                              │
                              └── Edit, Bash, Read, Write (normal tools)
```

**Example conversation:**
```
You: "Create a function that validates emails"

Ferni: "I'll create an email validation function for you"
       [Claude editing utils/validation.ts...]
Ferni: "Progress update: Created the validation function"
Ferni: "All done! I created isValidEmail in utils/validation.ts"

You: "Add tests for it"
...
```

### Voice Pipeline Debugging

Debug the pipeline step-by-step: Question → Context → Gemini → SSML → Cartesia → Audio

```bash
# See full pipeline
ferni debug voice "How are you feeling today?"

# With audio playback
ferni debug voice --play "Tell me about habits"

# Different persona
ferni debug voice --persona maya --play "What's one small habit?"

# Interactive mode
ferni debug voice --interactive
```

**What you'll see:**
1. **User Input** - Your question
2. **Context Injections** - What we add (time, emotion, persona guidance)
3. **Gemini Response** - Raw LLM output with token counts
4. **SSML Transformation** - Emotion detection + tags added
5. **Cartesia TTS** - Audio generation (with `--play`)

### Build Binary

```bash
# Build standalone macOS binary (67MB)
npx tsx apps/cli/src/commands/build/build-cli-binary.ts --release

# Install globally
sudo cp dist/ferni /usr/local/bin/
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
