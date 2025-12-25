# Agent Development Guide

How to build, maintain, and extend marketplace agents for Ferni.

---

## Current Status (December 2025)

### ✅ Completed Agents (9 Active)

| Agent | ID | Category | Icon | Files |
|-------|-----|----------|------|-------|
| **Jack Bogle** | `jack-bogle` | Mentoring | 🧓 | ~25 |
| **River** | `river-grief-companion` | Lifestyle | 🕊️ | ~20 |
| **Zen** | `zen-presence-guide` | Health | 🧘 | ~20 |
| **Moxie** | `moxie-accountability` | Productivity | 🔥 | ~45 |
| **Luna** | `luna-sleep-guide` | Health | 🌙 | ~35 |
| **Atlas** | `atlas-career-navigator` | Productivity | 🧭 | ~27 |
| **Spark** | `spark-creativity-catalyst` | Entertainment | ✨ | ~31 |
| **Sage** | `sage-relationship-navigator` | Lifestyle | 💜 | ~28 |
| **Pixel** | `pixel-tech-translator` | Education | 🤖 | ~24 |

### 🗄️ Archived Agents (Available to Restore)

| Agent | ID | Reason | Files Location |
|-------|-----|--------|----------------|
| **Joel Dickson** | `joel-dickson` | Paused for later | `agents/joel-dickson/` |

### 📋 Recommended Phase 2 Agents (Not Started)

See `AGENT-RECOMMENDATIONS.md` for full details on these:

| Agent | Category | Focus |
|-------|----------|-------|
| **Nova** | Parenting | Evidence-based parenting, ages 0-18 |
| **Harbor** | Life Transitions | Major life changes, identity shifts |
| **Ember** | Motivation | Getting started, activation energy |
| **Scout** | Research | Deep dives, learning new topics |
| **Compass** | Decision Making | Frameworks, values clarification |

---

## Directory Structure

```
marketplace-agents/
├── registry.json              # Master list of active agents
├── AGENT-RECOMMENDATIONS.md   # Ideas for future agents
├── docs/
│   ├── AGENT-DEVELOPMENT-GUIDE.md  # This file
│   └── CUSTOM-TOOLS-ARCHITECTURE.md # Future tools integration
└── agents/
    └── {agent-id}/
        ├── persona.manifest.json    # Core configuration
        ├── identity/
        │   ├── biography.md         # Agent's backstory
        │   └── system-prompt.md     # Voice & behavior instructions
        └── content/
            ├── behaviors/           # JSON files for specific behaviors
            ├── knowledge/           # Markdown knowledge base
            ├── stories/             # JSON narrative content
            └── voice/
                └── expressions.json # Voice modulation settings
```

---

## How to Build a New Agent

### Step 1: Plan the Agent

Before coding, define:
- **Name & ID**: e.g., "Nova" / `nova-parenting-guide`
- **Core purpose**: What problem does this solve?
- **Personality**: Warmth, humor, directness, energy (0-1 scale)
- **Voice**: How do they speak? What phrases are signature?
- **Differentiator**: Why this agent vs. generic AI?

### Step 2: Create Directory Structure

```bash
mkdir -p marketplace-agents/agents/{agent-id}/{identity,content/{behaviors,knowledge,stories,voice}}
```

### Step 3: Create Core Files

#### 3a. `persona.manifest.json`
The master configuration. Key sections:
- `identity`: ID, name, description, aliases
- `voice`: Provider, voice_id, rate, tone
- `personality`: Warmth, humor, directness, energy, traits
- `role`: Domains, handoff targets
- `team`: Membership, triggers, phrases
- `marketplace`: Display info, tags, category, icon
- `emotional`: Emotion detection, contextual tones
- `humanization`: Disfluency, hedging, active listening settings

#### 3b. `identity/biography.md`
The agent's backstory:
- Origin story (how they came to this expertise)
- Key beliefs/philosophy
- What they offer
- What they're NOT
- The vibe of talking to them

#### 3c. `identity/system-prompt.md`
Instructions for the AI:
- Core identity summary
- Voice & style guidelines
- Language examples (❌ bad vs ✅ good)
- Core behaviors (numbered list)
- Specific scenario handling
- Sample interactions

### Step 4: Create Behavior Files

Standard behavior files (in `content/behaviors/`):

| File | Purpose |
|------|---------|
| `greetings.json` | Welcome messages by context |
| `goodbyes.json` | Farewell messages by context |
| `catchphrases.json` | Signature phrases |
| `backchannels.json` | Active listening sounds |
| `thinking-sounds.json` | Processing/thinking sounds |
| `vulnerability.json` | Personal stories to share |
| `quirks.json` | Personality traits, pet peeves |

Plus domain-specific behaviors:
- Moxie: `accountability-patterns.json`, `streak-responses.json`
- Luna: `breathing-exercises.json`, `bedtime-stories.json`
- Atlas: `negotiation-coaching.json`, `interview-coaching.json`
- etc.

### Step 5: Create Knowledge Files

In `content/knowledge/`:
- Markdown files with domain expertise
- `_index.json` cataloging all knowledge files
- Each file should include when to use it

### Step 6: Create Story Files

In `content/stories/`:
- JSON files with narrative content
- Personal anecdotes the agent can share
- `_index.json` cataloging stories with triggers

### Step 7: Create Voice Expressions

`content/voice/expressions.json`:
- Base style (energy, warmth, pace)
- Emotional expressions with modifiers
- Contextual modulation
- Signature patterns

### Step 8: Add to Registry

Add entry to `registry.json`:
```json
{
  "id": "agent-id",
  "name": "Agent Name",
  "display_name": "Agent Name — Subtitle",
  "description": "Full description...",
  "short_description": "One line summary.",
  "category": "category",
  "tags": ["tag1", "tag2"],
  "icon": "🎯",
  "version": "1.0.0",
  "author": "VoiceAI Team",
  "license": "premium",
  "colors": {
    "primary": "#hexcode",
    "secondary": "#hexcode",
    "gradient": "linear-gradient(135deg, #secondary, #primary)",
    "glow": "rgba(r, g, b, 0.3)"
  },
  "downloads": 0,
  "rating": 5.0
}
```

---

## File Count Guidelines

A well-developed agent typically has:
- **Minimal**: ~15-20 files (basic agent)
- **Standard**: ~25-30 files (full-featured)
- **Comprehensive**: ~35-50 files (deeply developed)

Distribution:
- 1 manifest
- 2 identity files
- 10-15 behavior files
- 4-8 knowledge files
- 4-8 story files
- 1 voice file

---

## Agent Personality Scales

Use these 0-1 scales in `personality`:

| Trait | Low (0) | High (1) |
|-------|---------|----------|
| **Warmth** | Professional, reserved | Affectionate, nurturing |
| **Humor** | Serious, focused | Playful, witty |
| **Directness** | Gentle, indirect | Blunt, straightforward |
| **Energy** | Calm, measured | Enthusiastic, dynamic |

Example profiles:
- **Luna** (Sleep): warmth 0.95, humor 0.1, directness 0.3, energy 0.2
- **Moxie** (Accountability): warmth 0.85, humor 0.5, directness 0.75, energy 0.8
- **Sage** (Relationships): warmth 0.95, humor 0.25, directness 0.55, energy 0.5

---

## Category Options

- `productivity` - Habits, goals, accountability, career
- `health` - Sleep, mindfulness, wellness
- `lifestyle` - Relationships, grief, life transitions
- `finance` - Investing, money management
- `entertainment` - Creativity, play, hobbies
- `education` - Learning, tech literacy, skills
- `mentoring` - Wisdom, life guidance

---

## Color Palette Guidelines

Each agent needs:
- `primary`: Main brand color
- `secondary`: Darker shade for gradients
- `gradient`: CSS gradient using both
- `glow`: RGBA with ~0.3 alpha for effects

Use earthy, warm tones per Ferni brand guidelines. Avoid:
- Pure purple (not a Ferni color)
- Neon/bright colors
- Cool grays

---

## Restoring an Archived Agent

To bring back Joel Dickson or other archived agents:

1. Check that files exist in `agents/{agent-id}/`
2. Add entry back to `registry.json`
3. Test handoff triggers

---

## Testing Agents

Before marking complete:
- [ ] Manifest validates (JSON syntax)
- [ ] All referenced directories exist
- [ ] Identity files have clear voice examples
- [ ] Behaviors cover common scenarios
- [ ] Knowledge is accurate and useful
- [ ] Stories are relatable and on-brand
- [ ] Voice expressions match personality
- [ ] Registry entry is complete
- [ ] Handoff triggers make sense

---

## Questions?

Refer to existing agents as examples:
- **Moxie** - Most comprehensive, good behavior reference
- **Luna** - Good for calm/gentle voice style
- **Spark** - Good for playful/energetic voice style
- **Atlas** - Good for professional/strategic tone
- **Sage** - Good for balanced, wise tone

