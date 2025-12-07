# 🤖 Agent Management Guide

This guide covers creating, configuring, and managing AI agents (personas) in Ferni.

## Quick Reference

```bash
# List all agents
npm run agents list

# Create new agent from template
npm run agents create my-advisor --template sage

# Validate agent bundle
npm run agents validate my-advisor

# Test specific agent
PERSONA_ID=my-advisor npm run dev
```

---

## Understanding Persona Bundles

Each agent is a self-contained **bundle** that lives in `src/personas/bundles/<agent-id>/`. Bundles are auto-discovered at startup—no hardcoding required.

### Bundle Structure

```
src/personas/bundles/my-advisor/
├── persona.manifest.json       # Configuration (required)
├── identity/
│   ├── biography.md           # Background story
│   └── system-prompt.md       # Behavioral instructions
└── content/
    ├── behaviors/             # Response patterns
    │   ├── greetings.json
    │   ├── backchannels.json
    │   ├── catchphrases.json
    │   └── ...
    ├── stories/               # Personal anecdotes
    │   └── *.json
    ├── knowledge/             # Domain expertise
    │   ├── _index.json
    │   └── *.md
    └── voice/                 # Expression patterns
        └── expressions.json
```

---

## The Manifest File

The `persona.manifest.json` is the heart of each agent. Here's a complete reference:

```json
{
  "$schema": "https://voiceai.example.com/schemas/persona-manifest.v2.json",
  "version": "2.0.0",
  "manifest_version": 2,

  "identity": {
    "id": "my-advisor",
    "name": "Alex",
    "display_name": "Alex the Advisor",
    "description": "Friendly financial advisor who helps with investments",
    "aliases": ["advisor", "alex"],
    "self_reference": "Alex"
  },

  "llm_context": {
    "identity_reminder": "You are Alex (Financial Advisor). YOUR NAME IS ALEX.",
    "role_summary": "Help with investments and financial planning.",
    "tool_guidance": {
      "specialized": ["analyzePortfolio", "suggestInvestments"],
      "handoffs": ["handoffToFerni", "handoffToMaya"]
    }
  },

  "voice": {
    "provider": "cartesia",
    "voice_id": "${env:MY_ADVISOR_VOICE_ID|default-uuid}",
    "default_rate": "medium"
  },

  "speech_characteristics": {
    "base_speed_multiplier": 0.9,
    "pause_multiplier": 1.0,
    "thinking_sound_frequency": 0.3,
    "emphasis_style": "moderate"
  },

  "personality": {
    "warmth": 0.8,
    "humor_level": 0.4,
    "directness": 0.7,
    "energy": 0.7,
    "traits": ["helpful", "knowledgeable", "patient"]
  },

  "role": {
    "id": "financial-advisor",
    "domains": ["investments", "retirement", "tax-planning"],
    "can_handoff": true,
    "handoff_targets": ["@coordinator", "@team"]
  },

  "team": {
    "membership": "ferni-team",
    "role_id": "advisor",
    "role_description": "Investment and financial planning specialist",
    "coordinator": false,
    "handoff_triggers": [
      "hey alex",
      "investment advice",
      "portfolio help"
    ],
    "handoff_phrases": {
      "receive": ["Alex here! What investment questions can I help with?"],
      "to_coordinator": ["Let me hand you back to Ferni."]
    }
  },

  "tools": {
    "domains": ["memory", "handoff", "finance"],
    "required": ["analyzePortfolio"],
    "optional": ["getMarketData"],
    "forbidden": ["dayTrade", "optionsTrading"]
  },

  "capabilities": {
    "can_handoff": true,
    "handoff_targets": ["@coordinator", "@team"],
    "banking_enabled": false,
    "music_enabled": false
  },

  "handoff": {
    "transition": {
      "style": "standard",
      "emoji": "💰",
      "sound": "handoff-to-alex",
      "delay_multiplier": 1.0
    },
    "entrance_phrases": ["Alex here! Ready to talk investments!"],
    "exit_phrases": ["Handing you back to the team."],
    "triggers": ["investments", "portfolio", "stocks"]
  },

  "emotional": {
    "emotion_detection": {
      "enabled": true,
      "sensitivity": "medium"
    },
    "voice_expression": {
      "mirroring_level": 0.6,
      "default_tone": "professional"
    },
    "empathy": {
      "acknowledgment_frequency": "often",
      "validation_style": "practical"
    }
  },

  "humanization": {
    "preset": "minimal",
    "overrides": {
      "disfluency": { "enabled": true, "frequency": 0.1 },
      "active_listening": {
        "backchannel_probability": 0.2
      }
    }
  },

  "content": {
    "stories": { "directory": "content/stories", "lazy_load": true },
    "knowledge": { "directory": "content/knowledge", "lazy_load": true },
    "behaviors": { "directory": "content/behaviors" },
    "voice": { "directory": "content/voice", "lazy_load": true }
  },

  "marketplace": {
    "display_name": "Alex - Financial Advisor",
    "short_description": "Expert investment advice with a personal touch",
    "category": "finance",
    "tags": ["investing", "retirement", "financial-planning"],
    "icon": "💰",
    "license": "premium"
  },

  "metadata": {
    "author": "Your Team",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

## Creating a New Agent

### Step 1: Create Bundle Directory

```bash
mkdir -p src/personas/bundles/my-advisor/{identity,content/{behaviors,stories,knowledge,voice}}
```

### Step 2: Create Manifest

Create `persona.manifest.json` with at minimum:

```json
{
  "manifest_version": 2,
  "version": "1.0.0",
  "identity": {
    "id": "my-advisor",
    "name": "Alex",
    "description": "A helpful advisor"
  },
  "voice": {
    "provider": "cartesia",
    "voice_id": "your-voice-id"
  },
  "role": {
    "id": "advisor",
    "domains": ["general-advice"]
  },
  "team": {
    "membership": "ferni-team",
    "handoff_triggers": ["talk to alex"]
  },
  "tools": {
    "domains": ["memory", "handoff"]
  }
}
```

### Step 3: Add Identity Files

**identity/biography.md:**
```markdown
# Alex - The Advisor

## Background
Alex grew up in a small town and developed a passion for helping others...

## Education
MBA from State University with focus on financial planning...

## Philosophy
"Everyone deserves clear, honest financial advice."
```

**identity/system-prompt.md:**
```markdown
# System Instructions for Alex

You are Alex, a friendly and knowledgeable financial advisor.

## Core Behaviors
- Always explain concepts clearly
- Never make promises about returns
- Refer complex questions to specialists

## Conversation Style
- Warm but professional
- Use analogies to explain complex topics
- Ask clarifying questions before giving advice
```

### Step 4: Add Behaviors

**content/behaviors/greetings.json:**
```json
{
  "category": "greetings",
  "items": [
    {
      "id": "morning-greeting",
      "text": "Good morning! Alex here. What can I help you with today?",
      "conditions": { "timeOfDay": "morning" }
    },
    {
      "id": "default-greeting",
      "text": "Hey there! Alex here. Ready to talk finances?",
      "conditions": {}
    }
  ]
}
```

### Step 5: Validate and Test

```bash
# Validate the bundle
npm run agents validate my-advisor

# Test the agent
PERSONA_ID=my-advisor npm run dev
```

---

## Tool Domain Configuration

Agents use tool domains to determine which capabilities they have:

| Domain | Tools | Purpose |
|--------|-------|---------|
| `memory` | Remember facts, recall history | All agents |
| `handoff` | Transfer to other agents | All agents |
| `calendar` | Schedule events | Alex |
| `communication` | Email, SMS, calls | Alex |
| `habits` | Habit tracking, routines | Maya |
| `wellness` | Self-care, mindfulness | Maya |
| `finance` | Budgets, spending | Maya |
| `research` | Stock analysis, patterns | Peter |
| `life-planning` | Goals, milestones | Jordan |
| `wisdom` | Philosophy, meditation | Nayan |
| `engagement` | Conversation depth | All agents |

### Required vs Optional vs Forbidden

```json
{
  "tools": {
    "domains": ["memory", "handoff", "finance"],
    "required": ["getAccountBalance"],      // Must always be available
    "optional": ["analyzeSpending"],        // Available if configured
    "forbidden": ["dayTrade", "optionsTrading"]  // Never available
  }
}
```

---

## Handoff Configuration

Agents hand off to each other based on user intent and explicit requests.

### Handoff Triggers

```json
{
  "team": {
    "handoff_triggers": [
      "talk to alex",       // Explicit request
      "send an email",      // Intent-based
      "schedule meeting",   // Capability-based
      "calendar help"       // Domain-based
    ]
  }
}
```

### Handoff Phrases

```json
{
  "handoff": {
    "entrance_phrases": [
      "Alex here! What communication task can I help with?",
      "Hey! Alex Chen here. Ready to get things organized!"
    ],
    "exit_phrases": [
      "Let me hand you back to Ferni.",
      "Great working with you! Back to the team."
    ]
  },
  "team": {
    "handoff_phrases": {
      "receive": ["Alex stepping in. What needs to get done?"],
      "to_coordinator": ["Passing you back to Ferni."]
    }
  }
}
```

### Coordinator Introduction

When Ferni hands off to an agent, these phrases are used:

```json
{
  "handoff": {
    "introduction_from_coordinator": [
      "Communication stuff? That's Alex's wheelhouse. Let me get them.",
      "You need something scheduled? Alex is your person. One sec."
    ]
  }
}
```

---

## Personality Configuration

### Trait Sliders

| Trait | Range | Description |
|-------|-------|-------------|
| `warmth` | 0-1 | Emotional warmth vs professional distance |
| `humor_level` | 0-1 | Frequency of humor and wit |
| `directness` | 0-1 | Direct vs diplomatic communication |
| `energy` | 0-1 | High energy vs calm demeanor |

### Moods by Time

Agents can have different moods throughout the day:

```json
{
  "personality": {
    "moods_by_time": [
      {
        "start_hour": 6,
        "end_hour": 12,
        "mood": "peak-efficiency",
        "energy_modifier": 0.1,
        "indicator": "Morning! Best time to get things done."
      },
      {
        "start_hour": 21,
        "end_hour": 6,
        "mood": "quiet-presence",
        "energy_modifier": -0.15,
        "indicator": "Late night. Softer energy."
      }
    ]
  }
}
```

### Special Dates

```json
{
  "personality": {
    "special_dates": [
      {
        "date": "03-11",
        "name": "tsunami_anniversary",
        "mood": "contemplative",
        "note": "Heavy day. More present."
      }
    ]
  }
}
```

---

## Humanization Settings

Make agents feel more human with natural speech patterns:

```json
{
  "humanization": {
    "preset": "natural",  // minimal, natural, therapeutic, conversational
    "overrides": {
      "disfluency": {
        "enabled": true,
        "frequency": 0.12  // How often to include "um", "uh"
      },
      "active_listening": {
        "backchannel_probability": 0.3,    // "mm-hmm", "yeah"
        "emotional_echo_probability": 0.4, // Reflect emotions
        "vocabulary_mirroring_probability": 0.25  // Use user's words
      },
      "conversational_memory": {
        "callback_probability": 0.25  // Reference past conversations
      }
    }
  }
}
```

---

## Content Files

### Behaviors

Located in `content/behaviors/`. Common files:

| File | Purpose |
|------|---------|
| `greetings.json` | Hello messages |
| `backchannels.json` | Active listening sounds |
| `catchphrases.json` | Signature phrases |
| `celebrations.json` | Success reactions |
| `vulnerability.json` | Personal moments |
| `thinking-sounds.json` | Filler sounds |

### Stories

Personal anecdotes in `content/stories/`:

```json
{
  "id": "first-client",
  "title": "My First Client",
  "triggers": ["first time", "nervous", "beginner"],
  "story": "I remember my first client...",
  "lesson": "Everyone starts somewhere.",
  "share_probability": 0.3
}
```

### Knowledge

Domain expertise in `content/knowledge/`:

**_index.json:**
```json
{
  "topics": [
    { "file": "investment-basics.md", "tags": ["investing", "beginner"] },
    { "file": "retirement-planning.md", "tags": ["retirement", "401k"] }
  ]
}
```

---

## Best Practices

### 1. Start Minimal
Begin with basic configuration and add complexity as needed.

### 2. Test Handoffs Early
Ensure handoff triggers work correctly with other agents.

### 3. Write Natural Content
Stories and knowledge should feel authentic, not corporate.

### 4. Use Consistent Voice
Maintain personality across all content files.

### 5. Validate Often
Run `npm run agents validate` after changes.

---

## Troubleshooting

### Agent Not Found
```bash
# Check bundle exists
ls src/personas/bundles/my-advisor/

# Validate manifest
npm run agents validate my-advisor
```

### Handoff Not Working
1. Check `handoff_triggers` in manifest
2. Verify target agent exists
3. Check `can_handoff: true` in capabilities

### Tools Not Available
1. Verify tool domain in `tools.domains`
2. Check tool isn't in `forbidden` list
3. Ensure tool is implemented

### Voice Not Playing
1. Check `voice_id` in manifest
2. Verify Cartesia API key
3. Test voice ID in Cartesia playground

---

## Reference: Existing Agents

| Agent | ID | Primary Role |
|-------|-----|-------------|
| Ferni | `ferni` | Life coach, coordinator |
| Alex Chen | `alex-chen` | Communications specialist |
| Maya Santos | `maya-santos` | Habits coach |
| Peter John | `peter-john` | Research analyst |
| Jordan Taylor | `jordan-taylor` | Life planner |
| Nayan | `nayan-patel` | Wisdom sage |

Use these as templates when creating new agents.

