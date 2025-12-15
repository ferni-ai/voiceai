# Ferni AI - The One Agent CEO

> **One Agent to Lead Them All**

Ferni is a personal AI CEO who runs your life like a company. He leads a team of specialized agents, delegates tasks to the right experts, and ensures everything works together seamlessly.

---

## The Vision

Traditional AI assistants are generalists - they try to do everything mediocrely. Ferni takes a different approach:

**Ferni is the CEO.** He:
- Understands the big picture of your life
- Knows when to bring in specialists
- Ensures continuity and context across all interactions
- Makes strategic recommendations
- Delegates execution to experts

---

## The Leadership Team

### Current Team (v1.0)

| Agent | Role | Title | Specialty |
|-------|------|-------|-----------|
| **Ferni** | CEO & Life Coach | Chief Executive Officer | Leadership, life direction, bringing in the right expert |
| **Maya** | Habits Coach | Chief Habits Officer | Building habits, breaking bad ones, behavior change |
| **Alex** | Communications Coach | Chief Communications Officer | Difficult conversations, relationships, conflict resolution |
| **Jordan** | Life Planner | Chief Planning Officer | Goals, planning, productivity, time management |
| **Peter** | Research Analyst | Chief Research Officer | Deep research, analysis, finding answers |
| **Nayan** | Wisdom Sage | Chief Wisdom Officer | Philosophy, mindfulness, deeper meaning |

### Team Capabilities

#### Ferni (CEO)
- **Emotional Intelligence**: Superhuman EQ with micro-expressions, active listening, breath sync
- **Handoff Orchestration**: Seamlessly transfers you to the right specialist
- **Memory Synthesis**: Remembers everything across all conversations
- **Big Picture Thinking**: Connects dots across all domains
- **Trust Building**: Builds genuine relationships over time

#### Maya (Habits)
- **Tiny Habits**: 2-minute versions of any habit
- **Habit Stacking**: Chain habits for maximum effect
- **Glidepath Levels**: 5-level progression from tiny to full lifestyle
- **Keystone Habits**: Identify high-ripple habits
- **Four Tendencies**: Personalized strategies (Upholder/Questioner/Obliger/Rebel)

#### Alex (Communications)
- **Difficult Conversations**: Navigate conflict with grace
- **Relationship Coaching**: Build stronger connections
- **Script Writing**: Word-for-word scripts for hard talks
- **Conflict Resolution**: Find win-win solutions
- **Social Skills**: Improve interpersonal effectiveness

#### Jordan (Planning)
- **Goal Setting**: SMART goals that actually work
- **Time Blocking**: Optimize your schedule
- **Project Planning**: Break down big projects
- **Priority Matrix**: Focus on what matters
- **Review Cycles**: Weekly, monthly, quarterly reviews

#### Peter (Research)
- **Deep Dives**: Thorough research on any topic
- **Fact Checking**: Verify claims and sources
- **Comparison Analysis**: Compare options objectively
- **Decision Support**: Data-driven recommendations
- **Learning Paths**: Curated resources for learning

#### Nayan (Wisdom)
- **Philosophy**: Apply ancient wisdom to modern problems
- **Mindfulness**: Present-moment awareness
- **Life Questions**: Explore meaning and purpose
- **Perspective Shifts**: See things differently
- **Inner Peace**: Navigate uncertainty with calm

---

## Future Hires (Roadmap)

### Q1 2025 - Core Expansion

| Agent | Role | Specialty |
|-------|------|-----------|
| **Riley** | Fitness Coach | Exercise, nutrition, sleep, recovery |
| **Morgan** | Finance Coach | Budgeting, investing, financial planning |
| **Casey** | Career Coach | Job search, interviews, career growth |

### Q2 2025 - Specialized Experts

| Agent | Role | Specialty |
|-------|------|-----------|
| **Drew** | Creative Director | Writing, design, creative projects |
| **Taylor** | Tech Advisor | Technology decisions, tool recommendations |
| **Jamie** | Health Navigator | Medical questions, health decisions |

### Q3 2025 - Life Operations

| Agent | Role | Specialty |
|-------|------|-----------|
| **Sage** | Home Manager | Home maintenance, organization, decluttering |
| **River** | Travel Planner | Trip planning, recommendations, logistics |
| **Quinn** | Social Secretary | Event planning, invitations, social calendar |

### Future Vision

| Agent | Role | Specialty |
|-------|------|-----------|
| **Atlas** | Memory Keeper | Photo organization, journaling, life documentation |
| **Phoenix** | Crisis Manager | Emergency response, stress situations |
| **Luna** | Sleep Coach | Sleep optimization, dream journaling |

---

## CLI Commands

### Voice Commands

```bash
# Start talking to Ferni (CEO)
ferni voice

# Start with a specific team member
ferni voice --persona maya
ferni voice --persona alex
ferni voice --persona jordan
ferni voice --persona peter
ferni voice --persona nayan

# Show the team roster
ferni voice --team

# Enable debug mode
ferni voice --debug

# Show help
ferni voice --help
```

### During a Voice Session

| Command | Action |
|---------|--------|
| `team` | Show the team roster |
| `who` | Show who you're currently speaking with |
| `status` | Show session stats (duration, turns, handoffs) |
| `help` | Show all commands |
| `exit` | End the conversation |
| `Ctrl+C` | Force disconnect |

### Quick Persona Switch (@ Commands)

Type `@` followed by the persona name to instantly request a switch:

| Command | Switches To |
|---------|-------------|
| `@ferni` | Ferni (CEO & Life Coach) |
| `@maya` | Maya (Habits Coach) |
| `@alex` | Alex (Communications Coach) |
| `@jordan` | Jordan (Life Planner) |
| `@peter` | Peter (Research Analyst) |
| `@nayan` | Nayan (Wisdom Sage) |

The CLI shows a nice spinner animation and sends a `handoff_request` data message to the agent.

### Voice Requests (Say These)

| Request | What Happens |
|---------|--------------|
| "Let me talk to Maya" | Handoff to Maya (Habits Coach) |
| "I need help with a difficult conversation" | Ferni brings in Alex |
| "Can you research X for me?" | Ferni brings in Peter |
| "I need to plan my week" | Ferni brings in Jordan |
| "I have a philosophical question" | Ferni brings in Nayan |
| "Take me back to Ferni" | Return to the CEO |

---

## Technical Architecture

### Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FERNI AI PLATFORM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    FERNI (CEO)                          │   │
│  │  • 70+ Context Builders                                 │   │
│  │  • Persistent Memory (Firestore + Postgres + Redis)     │   │
│  │  • Superhuman EQ (micro-expressions, breath sync)       │   │
│  │  • Handoff Orchestration                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│              ┌─────────────┼─────────────┐                     │
│              │             │             │                     │
│              ▼             ▼             ▼                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│  │    Maya     │ │    Alex     │ │   Jordan    │              │
│  │  (Habits)   │ │  (Comms)    │ │ (Planning)  │              │
│  └─────────────┘ └─────────────┘ └─────────────┘              │
│              │             │             │                     │
│              └─────────────┼─────────────┘                     │
│                            │                                    │
│              ┌─────────────┼─────────────┐                     │
│              ▼             ▼             ▼                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│  │   Peter     │ │   Nayan     │ │   Future    │              │
│  │ (Research)  │ │  (Wisdom)   │ │   Agents    │              │
│  └─────────────┘ └─────────────┘ └─────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Voice Pipeline

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│   User     │───▶│  Gemini    │───▶│  Agent     │───▶│  Cartesia  │
│   Speaks   │    │  Live STT  │    │  (LLM)     │    │    TTS     │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
      │                                    │
      │                                    │
      ▼                                    ▼
┌────────────┐                      ┌────────────┐
│   sox      │                      │  LiveKit   │
│ (capture)  │                      │  (WebRTC)  │
└────────────┘                      └────────────┘
```

### Handoff Flow

```
1. User: "I need help building a morning routine"

2. Ferni (CEO): "That sounds like a habit-building goal!
   Let me bring in Maya, our Habits Coach."

3. [HANDOFF EVENT]
   ├── Ferni saves conversation context
   ├── Maya loads context + her persona
   └── Seamless transition

4. Maya (Habits): "Hi! Ferni mentioned you want to build
   a morning routine. Tell me about your current mornings..."

5. [CONVERSATION CONTINUES WITH MAYA]

6. User: "Thanks Maya! I also need to plan my week."

7. Maya (Habits): "Perfect timing! Let me get Jordan,
   our Life Planner, to help with that."

8. [HANDOFF TO JORDAN]
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Memory System                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Firestore  │  │  Postgres   │  │    Redis    │             │
│  │ (Real-time) │  │ (Embeddings)│  │  (Session)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│        │                 │                │                     │
│        └─────────────────┼────────────────┘                     │
│                          │                                      │
│                          ▼                                      │
│                 ┌─────────────────┐                             │
│                 │ Context Builders │                            │
│                 │   (70+ types)    │                            │
│                 └─────────────────┘                             │
│                          │                                      │
│                          ▼                                      │
│                 ┌─────────────────┐                             │
│                 │   Agent LLM     │                             │
│                 └─────────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## CEO Capabilities

### What a CEO Needs

| Capability | Implementation |
|------------|----------------|
| **Vision & Strategy** | Long-term user profile, goals tracking, life direction |
| **Team Management** | Handoff orchestration, context sharing, delegation |
| **Communication** | Superhuman EQ, micro-expressions, active listening |
| **Decision Making** | Context synthesis, recommendation engine |
| **Memory** | Persistent memory across all interactions |
| **Trust Building** | Relationship tracking, vulnerability moments |
| **Crisis Management** | Detect distress, adjust tone, escalate when needed |

### Ferni's Unique Powers

1. **The Big Picture**: Ferni sees everything - habits, relationships, goals, struggles - and connects the dots.

2. **Knowing When to Delegate**: Ferni recognizes when you need a specialist and smoothly brings them in.

3. **Continuity**: Unlike chat histories that reset, Ferni remembers your journey.

4. **Genuine Care**: Superhuman emotional intelligence that makes you feel truly heard.

5. **Strategic Thinking**: Not just reactive - proactively suggests what you should focus on.

---

## Client Interfaces

### Current Clients

| Client | Platform | Status |
|--------|----------|--------|
| **Ferni CLI** | macOS/Linux/Windows | Production |
| **Web App** | Browser | Production |
| **macOS Menubar** | macOS | Beta |

### CLI Features

```bash
# The main command
ferni voice

# Output
╔════════════════════════════════════════════════════════════════════╗
║  🌿 FERNI AI - Your Personal CEO                                   ║
║     One Agent to Lead Them All                                     ║
╚════════════════════════════════════════════════════════════════════╝

Starting with: 🌿 Ferni (CEO & Life Coach)

Platform capabilities:
  • 6 specialized team members
  • 70+ context builders
  • Persistent memory
  • Live handoffs between agents
  • Gemini Live STT + Cartesia TTS
```

### Team Roster Display

```bash
ferni voice --team

# Output
╔══════════════════════════════════════════════════════════════════╗
║                    🌿 FERNI'S LEADERSHIP TEAM                    ║
╚══════════════════════════════════════════════════════════════════╝

  ● 🌿 Ferni - CEO & Life Coach
      Leadership, life direction, bringing in the right expert

  ○ 🦋 Maya - Habits Coach
      Building habits, breaking bad ones, behavior change

  ○ 💬 Alex - Communications Coach
      Difficult conversations, relationships, conflict resolution

  ○ 📋 Jordan - Life Planner
      Goals, planning, productivity, time management

  ○ 🔬 Peter - Research Analyst
      Deep research, analysis, finding answers

  ○ 🧘 Nayan - Wisdom Sage
      Philosophy, mindfulness, deeper meaning

Ask Ferni to bring in any team member, or say "Let me talk to Maya"
```

---

## API Reference

### Token Server

```bash
# Get a token for voice session
GET /token?room=<room>&username=<user>&persona_id=<persona>

# Response
{
  "token": "eyJ...",
  "url": "wss://livekit.example.com",
  "room": "cli-voice-1234567890"
}
```

### Health Endpoints

```bash
# Token server health
GET /health

# Agent health
GET /health

# Agent readiness (workers initialized)
GET /health/ready
```

### Data Channel Messages (Handoffs)

```json
// Handoff initiated
{
  "type": "handoff_start",
  "targetPersona": "maya",
  "reason": "User needs help with habits"
}

// Handoff complete
{
  "type": "handoff_complete",
  "persona": "maya"
}

// Persona changed
{
  "type": "persona_changed",
  "persona_id": "maya"
}
```

---

## Development

### Running Locally

```bash
# Terminal 1: Token Server
node token-server.js

# Terminal 2: Agent
pnpm agent:dev

# Terminal 3: CLI
ferni voice
```

### Testing Handoffs

1. Start voice session: `ferni voice`
2. Say: "Let me talk to Maya"
3. Observe the handoff transition
4. Type: `who` to confirm
5. Say: "Take me back to Ferni"

### Adding New Agents

1. Create persona bundle in `src/personas/bundles/<name>/`
2. Add to TEAM constant in `voice-live.ts`
3. Register handoff handlers
4. Add to documentation

---

## Philosophy

> **"A CEO doesn't do everything - a CEO ensures the right things get done by the right people."**

Ferni isn't trying to be a know-it-all generalist. He's a trusted leader who:

- **Listens First**: Understands what you actually need
- **Delegates Wisely**: Knows which specialist can help
- **Maintains Context**: Ensures nothing falls through the cracks
- **Cares Genuinely**: Builds a real relationship over time

This is the future of AI assistants: not a single overwhelming agent, but a well-coordinated team led by someone you trust.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12 | Initial team: Ferni, Maya, Alex, Jordan, Peter, Nayan |
| 1.1.0 | TBD | CLI team display, handoff visualization |
| 2.0.0 | TBD | New hires: Riley, Morgan, Casey |

---

*Ferni AI - Your Personal CEO*
