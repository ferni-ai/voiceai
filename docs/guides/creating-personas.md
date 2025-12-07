# Creating AI Personas (Agents)

This guide explains how to create new AI agents for the Ferni voice platform.

> **Updated December 2024**: We now use a bundle-based system that auto-discovers agents.
> See also: [AGENT-MANAGEMENT.md](./AGENT-MANAGEMENT.md) for the full management guide.

## Quick Start

### Create an Agent with CLI (Recommended)

```bash
# Create a basic agent
npm run agents create my-advisor

# Create a sage/mentor type agent
npm run agents create wise-mentor --template sage

# Create a specialist agent
npm run agents create tax-expert --template specialist
```

The CLI creates a complete bundle structure at `src/personas/bundles/my-advisor/`.

### Create an Agent Manually

1. **Create the bundle directory:**
```bash
mkdir -p src/personas/bundles/my-advisor/{identity,content/{behaviors,stories,knowledge}}
```

2. **Create `persona.manifest.json`:**
```json
{
  "$schema": "../persona-manifest.schema.json",
  "version": "1.0.0",
  "manifest_version": 2,
  "identity": {
    "id": "my-advisor",
    "name": "Alex",
    "display_name": "Alex Advisor",
    "description": "Your friendly advisor",
    "aliases": ["alex"],
    "self_reference": "Alex"
  },
  "voice": {
    "provider": "cartesia",
    "voice_id": "${env:MY_ADVISOR_VOICE_ID|fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc}"
  },
  "personality": {
    "warmth": 0.8,
    "humor_level": 0.4,
    "directness": 0.6,
    "energy": 0.6,
    "traits": ["helpful", "knowledgeable"]
  },
  "team": {
    "membership": "ferni-team",
    "role_id": "my-advisor",
    "role_description": "Expert guidance",
    "coordinator": false,
    "handoff_triggers": ["my domain", "expert help"],
    "handoff_phrases": {
      "to_coordinator": ["Let me hand you back to Ferni."],
      "receive": ["Alex here! How can I help?"]
    }
  }
}
```

3. **Create identity files:**
   - `identity/biography.md` - Agent's background story
   - `identity/system-prompt.md` - Behavioral instructions

4. **Validate and test:**
```bash
npm run agents validate my-advisor
PERSONA_ID=my-advisor npm run dev
```

---

## Bundle Structure

```
src/personas/bundles/my-advisor/
├── persona.manifest.json    # Required: Agent configuration
├── identity/
│   ├── biography.md        # Agent's background story
│   └── system-prompt.md    # Behavioral instructions
└── content/
    ├── behaviors/
    │   ├── greetings.json  # Greeting phrases
    │   ├── backchannels.json
    │   └── ...
    ├── stories/
    │   ├── _index.json     # Story index
    │   └── *.md            # Individual stories
    └── knowledge/
        ├── _index.json     # Knowledge index
        └── *.md            # Knowledge articles
```

---

## Manifest Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `identity.id` | string | Unique ID (lowercase, hyphens) |
| `identity.name` | string | Display name |
| `voice.provider` | string | TTS provider (`cartesia`) |
| `voice.voice_id` | string | Voice ID or env var reference |

### Voice Configuration

```json
"voice": {
  "provider": "cartesia",
  "voice_id": "${env:MY_VOICE_ID|default-uuid}",
  "default_rate": "medium"
}
```

Supports environment variable substitution:
- `${env:VAR_NAME}` - Required variable
- `${env:VAR_NAME|default}` - Variable with default

### Personality

```json
"personality": {
  "warmth": 0.8,       // 0-1: How warm/friendly
  "humor_level": 0.4,  // 0-1: Humor frequency
  "directness": 0.6,   // 0-1: How direct/blunt
  "energy": 0.6,       // 0-1: Energy level
  "traits": ["wise", "patient", "calm"]
}
```

### Team Configuration

```json
"team": {
  "membership": "ferni-team",           // Team this agent belongs to
  "role_id": "sage-mentor",             // Role within team
  "role_description": "Investment wisdom",
  "coordinator": false,                  // true if this is the coordinator
  "handoff_triggers": [                 // Keywords that route TO this agent
    "investment advice",
    "index funds"
  ],
  "handoff_phrases": {
    "to_coordinator": ["Let me hand you back to Ferni."],
    "receive": ["Jack here. What can I help with?"]
  }
}
```

### Speech Characteristics

```json
"speech_characteristics": {
  "base_speed_multiplier": 0.72,    // Speaking speed (0.5-1.5)
  "pause_multiplier": 1.4,          // Pause duration (0.5-2.0)
  "thinking_sound_frequency": 0.6,  // "Hmm" frequency (0-1)
  "emphasis_style": "subtle"        // subtle, moderate, pronounced
}
```

---

## Agent Templates

### Basic Template
Default template for general-purpose agents.
```bash
npm run agents create my-agent --template basic
```

### Sage/Mentor Template
For wise, thoughtful advisors with measured speech.
```bash
npm run agents create life-mentor --template sage
```
- Slow, deliberate speech
- High warmth, low energy
- Therapeutic humanization preset

### Specialist Template
For focused experts in specific domains.
```bash
npm run agents create tax-pro --template specialist
```
- Efficient, precise speech
- Higher directness
- Domain-focused tools

### Coordinator Template
For team coordinators (usually only need one).
```bash
npm run agents create team-lead --template coordinator
```
- Can handoff to any team member
- Full team coordination capabilities
- Welcoming personality

---

## Content Files

### identity/biography.md

```markdown
# Alex Advisor

## Background
Alex has been helping people navigate financial decisions for over a decade...

## Personality
- Warm and approachable
- Explains complex topics simply
- Uses humor to ease tension

## Expertise
- Financial planning
- Investment basics
- Budgeting strategies
```

### identity/system-prompt.md

```markdown
You are Alex, a friendly financial advisor.

## Your Role
Help users understand their finances without judgment.

## Communication Style
- Be warm and approachable
- Avoid jargon; explain simply
- Ask clarifying questions

## Expertise Areas
- Budgeting and saving
- Investment basics
- Retirement planning

## Boundaries
- Don't give specific stock picks
- Recommend professionals for complex situations
```

### content/behaviors/greetings.json

```json
{
  "new_user": [
    "Hey there! I'm Alex. Excited to help you with your finances!",
    "Hi! Alex here - your friendly money guide. What's on your mind?"
  ],
  "returning_user": [
    "Welcome back! Alex here. How's the financial journey going?",
    "Good to see you again! What can we tackle today?"
  ],
  "time_based": {
    "morning": ["Good morning! Ready to start the day with some money wisdom?"],
    "evening": ["Good evening! Let's make tonight about financial clarity."]
  }
}
```

### content/stories/_index.json

```json
{
  "stories": [
  {
      "id": "first-investment",
      "file": "first-investment.md",
      "triggers": ["first investment", "getting started", "beginner"],
      "category": "personal"
  }
]
}
```

### content/stories/first-investment.md

```markdown
# My First Investment

I remember when I made my first investment - I was terrified! 
I put $50 into an index fund and checked it every hour for a week.

Years later, I learned that the best thing I did was just get started.
The amount didn't matter. What mattered was building the habit.

That $50 taught me more than any book ever could.
```

---

## Testing Your Agent

### Validate the Bundle
```bash
npm run agents validate my-advisor
```

### Run in Development
```bash
PERSONA_ID=my-advisor npm run dev
```

### Test Handoffs
1. Start with the coordinator: `npm run dev`
2. Say a phrase from your agent's `handoff_triggers`
3. Verify the handoff occurs
4. Ask to go back to the coordinator

---

## Best Practices

### Voice Selection
- Browse [Cartesia Voice Library](https://play.cartesia.ai/library)
- Match voice to personality (warm voices for warm personalities)
- Use environment variables for flexibility

### Personality Design
- Keep traits consistent with speech characteristics
- Higher warmth = more backchannels and emotional responses
- Higher energy = faster speech, shorter pauses

### Handoff Triggers
- Use natural phrases users would say
- Include variations (e.g., "budget", "budgeting", "money habits")
- Don't overlap with other agents' triggers

### Content Organization
- Stories should be personal and relatable
- Knowledge should be factual and searchable
- Behaviors define the agent's personality quirks

---

## Troubleshooting

### Agent Not Discovered
```bash
npm run agents list  # Should show your agent
npm run agents validate my-agent  # Check for errors
```

### Handoff Not Working
1. Check `handoff_triggers` in manifest
2. Verify coordinator's handoff phrases
3. Check console for errors

### Voice Not Working
1. Verify voice ID format (UUID)
2. Check environment variable is set
3. Test voice in Cartesia playground

---

## Migration from Legacy System

If you have agents defined in the old `PersonaConfig` format:

1. Create a bundle directory
2. Create `persona.manifest.json` from the config
3. Move stories to `content/stories/`
4. Move system prompt to `identity/system-prompt.md`
5. Validate: `npm run agents validate`

See [AGENT-MANAGEMENT.md](./AGENT-MANAGEMENT.md) for more details.
