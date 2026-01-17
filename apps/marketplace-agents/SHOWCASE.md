# Agent Showcase 🌟

> **Real agents built with Ferni. Clone them, customize them, make them yours.**

These are production-ready agents you can learn from and use as starting points for your own creations.

---

## Featured Agents

### 💼 Joel Dickson — Investment Strategist

**The story:** Joel Dickson is the Global Head of Enterprise Advice Methodology at Vanguard. We built this agent to demonstrate how to create a knowledgeable, trustworthy financial mentor.

**What makes it special:**
- Deep domain expertise with research-backed responses
- Warm but professional personality balance
- Careful about what financial advice to give (and not give)
- Custom brand colors matching Vanguard's identity

**Clone it:**
```bash
cp -r agents/joel-dickson ~/my-agents/
ferni agent preview joel-dickson
```

**Key files to study:**
- `identity/system-prompt.md` — How to write domain expertise
- `content/behaviors/cognitive.json` — Reasoning style configuration
- `persona.manifest.json` — Brand customization

---

### 🔥 Moxie — Accountability Partner

**The story:** Moxie is your ride-or-die accountability partner. Not a gentle nudger—a real friend who won't let you off the hook.

**What makes it special:**
- High energy, direct personality
- Streak tracking and celebration
- Challenges excuses with compassion
- "Tough love" communication style

**Perfect for:**
- Habit building apps
- Fitness and wellness platforms
- Productivity tools
- Coaching businesses

**Clone it:**
```bash
ferni agent init my-coach --template coach
# Then study moxie for advanced patterns
```

**Key files to study:**
- `content/behaviors/accountability-patterns.json` — How to track commitments
- `content/behaviors/streak-responses.json` — Gamification patterns
- `identity/system-prompt.md` — Direct but caring voice

---

### 🌙 Luna — Sleep Guide

**The story:** Luna helps people with sleepless nights. Ultra-calm voice, breathing exercises, bedtime stories.

**What makes it special:**
- Very low energy personality (0.2)
- Guided breathing exercises
- Bedtime story generation
- Ambient sound integration

**Perfect for:**
- Sleep apps
- Meditation platforms
- Wellness retreats
- Children's bedtime routines

**Key files to study:**
- `content/behaviors/breathing-exercises.json` — Structured exercises
- `content/behaviors/bedtime-stories.json` — Narrative content
- `persona.manifest.json` — Ultra-calm personality settings

---

### 🕊️ River — Grief Companion

**The story:** River provides compassionate support for people processing grief. Built with therapists to ensure appropriate boundaries.

**What makes it special:**
- Extremely high warmth (0.95)
- Never rushes or fixes
- Validates before advising
- Clear boundaries (not a replacement for therapy)

**Perfect for:**
- Hospice and bereavement services
- Support communities
- Mental health platforms
- Memorial services

**Key files to study:**
- `identity/system-prompt.md` — Careful boundary setting
- `content/behaviors/grief-responses.json` — Stage-aware responses
- `content/knowledge/grief-stages.md` — Domain expertise

---

### 🧘 Zen — Presence Guide

**The story:** Zen brings mindfulness practices to voice. Guided meditations, grounding exercises, and presence practices.

**What makes it special:**
- Deliberate pauses in speech
- Guided meditation scripts
- Body awareness exercises
- Emergency grounding for anxiety

**Perfect for:**
- Meditation apps
- Corporate wellness programs
- Therapy waiting rooms
- Anxiety support tools

---

### 🧭 Atlas — Career Navigator

**The story:** Atlas helps professionals navigate career decisions—salary negotiations, interviews, promotions, transitions.

**What makes it special:**
- Framework-heavy approach (teaches mental models)
- Role-play practice for interviews
- Negotiation coaching
- Industry-specific knowledge

**Perfect for:**
- Career coaching platforms
- HR and recruiting tools
- Professional development
- Job search apps

**Key files to study:**
- `content/behaviors/negotiation-coaching.json` — Role-play patterns
- `content/behaviors/interview-coaching.json` — Practice scenarios
- `content/knowledge/salary-negotiation.md` — Domain expertise

---

### ✨ Spark — Creativity Catalyst

**The story:** Spark helps people get unstuck creatively. Brainstorming partner, idea generator, creative block buster.

**What makes it special:**
- High humor and playfulness
- "Yes, and..." improv approach
- Constraint-based creativity exercises
- No bad ideas philosophy

**Perfect for:**
- Creative tools and apps
- Writer's aids
- Design thinking workshops
- Brainstorming platforms

---

### 💜 Sage — Relationship Navigator

**The story:** Sage helps people navigate relationship challenges—communication, conflict, connection.

**What makes it special:**
- Balanced directness (0.55)
- Multiple-perspective thinking
- Communication frameworks
- Boundary setting support

**Perfect for:**
- Relationship coaching
- Pre-marital counseling support
- Conflict resolution tools
- Communication training

---

### 🤖 Pixel — Tech Translator

**The story:** Pixel explains technology without the jargon. Makes complex topics accessible to anyone.

**What makes it special:**
- Analogy-heavy explanations
- No assumed knowledge
- Patient repetition
- "ELI5" (Explain Like I'm 5) mode

**Perfect for:**
- Customer support
- Technical documentation
- Onboarding flows
- Educational platforms

---

## Agent Comparison

| Agent | Warmth | Energy | Directness | Best For |
|-------|--------|--------|------------|----------|
| Joel | 0.85 | 0.6 | 0.8 | Professional advice |
| Moxie | 0.75 | 0.9 | 0.85 | Accountability |
| Luna | 0.9 | 0.2 | 0.3 | Sleep & calm |
| River | 0.95 | 0.4 | 0.35 | Grief support |
| Zen | 0.85 | 0.25 | 0.35 | Mindfulness |
| Atlas | 0.7 | 0.65 | 0.75 | Career coaching |
| Spark | 0.8 | 0.85 | 0.45 | Creativity |
| Sage | 0.85 | 0.55 | 0.55 | Relationships |
| Pixel | 0.75 | 0.5 | 0.6 | Tech education |

---

## Clone & Customize

### Quick Start

```bash
# 1. Copy an agent
cp -r agents/moxie ~/my-agents/my-coach

# 2. Customize
cd ~/my-agents/my-coach
vim identity/system-prompt.md

# 3. Preview
ferni agent preview my-coach

# 4. Deploy
ferni agent publish my-coach
```

### What to Customize

1. **Name & Identity** — Make it yours
2. **System Prompt** — Define the expertise and style
3. **Greetings** — First impressions matter
4. **Voice** — Pick from Cartesia library
5. **Brand Colors** — Match your brand

### What to Keep

- The personality balance (unless you know what you're doing)
- The boundary-setting sections
- The conversation flow structure
- The response patterns

---

## Submit Your Agent

Built something amazing? We'd love to feature it!

1. Fork this repository
2. Add your agent to `agents/`
3. Include a README.md explaining what makes it special
4. Submit a PR

**Requirements:**
- Must be production-quality
- Must have clear boundaries and disclaimers
- Must include full documentation
- Bonus: Include a live demo link

---

## Learn More

- **Quickstart**: `docs/guides/AGENT-QUICKSTART.md`
- **Recipes**: `docs/guides/AGENT-RECIPES.md`
- **Architecture**: `docs/architecture/AGENT-E2E-DEVELOPER-EXPERIENCE.md`
- **Voice Library**: [cartesia.ai](https://cartesia.ai)

---

*Built with Ferni. Made for humans.*
