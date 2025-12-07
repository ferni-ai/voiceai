# Agent Management Guide

This guide explains how to add, remove, and manage AI agents in the Ferni voice platform.

## Quick Start

### Adding a New Agent

1. **Create the agent bundle:**
   ```bash
   npm run agents create my-advisor --template sage
   ```

2. **Edit the generated files:**
   - `src/personas/bundles/my-advisor/persona.manifest.json` - Agent configuration
   - `src/personas/bundles/my-advisor/identity/biography.md` - Background story
   - `src/personas/bundles/my-advisor/identity/system-prompt.md` - Behavior instructions

3. **Validate the bundle:**
   ```bash
   npm run agents validate my-advisor
   ```

4. **Test the agent:**
   ```bash
   PERSONA_ID=my-advisor npm run dev
   ```

5. **Restart the server** - The agent appears automatically in the UI!

### Installing from Agent Marketplace

Install pre-built agents from the community marketplace:

```bash
# Search for agents
npm run agents search mentor --from github:sethdford/voiceai-agents

# Install an agent
npm run agents install joel-dickson --from github:sethdford/voiceai-agents

# Configure (if needed)
export JOEL_DICKSON_VOICE_ID="your-voice-id"

# Test
PERSONA_ID=joel-dickson npm run dev
```

### Removing an Agent

```bash
# Using CLI (recommended)
npm run agents uninstall my-advisor

# Or manually delete the bundle directory
rm -rf src/personas/bundles/my-advisor
```

The agent will be removed on next server restart.

---

## CLI Commands

### List All Agents
```bash
npm run agents list
# or
npm run agents:list
```

Shows all discovered agents with their status:
```
ID                   Name            Role                 Status
────────────────────────────────────────────────────────────────────────
👑 ferni             Ferni           Life coach           ✓ Valid
🤖 jack-bogle        Jack Bogle      Investment sage      ✓ Valid
🤖 jaggi-vasudev     Jaggi           Lifetime advisor     ✓ Valid
```

### Show Agent Details
```bash
npm run agents show jack-bogle
```

### Validate Agents
```bash
# Validate all agents
npm run agents validate

# Validate specific agent
npm run agents validate my-advisor
```

### Create New Agent
```bash
# Basic agent
npm run agents create my-agent

# Sage/mentor template
npm run agents create my-advisor --template sage

# Specialist template
npm run agents create tax-expert --template specialist
```

### Install External Agent
```bash
# Search available agents
npm run agents search <query> --from github:sethdford/voiceai-agents

# Install from default marketplace
npm run agents install joel-dickson --from github:sethdford/voiceai-agents

# Install from custom repo
npm run agents install my-agent --from github:myorg/my-agents
```

### Uninstall Agent
```bash
npm run agents uninstall my-agent
```

---

## Bundle Structure

Each agent is defined in a bundle directory:

```
src/personas/bundles/my-agent/
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

## Manifest Schema

The `persona.manifest.json` file defines all agent properties:

```json
{
  "$schema": "https://voiceai.example.com/schemas/persona-manifest.v2.json",
  "version": "1.0.0",
  "manifest_version": 2,

  "identity": {
    "id": "my-advisor",
    "name": "Alex",
    "display_name": "Alex Advisor",
    "description": "Your friendly financial advisor",
    "aliases": ["alex", "advisor"],
    "self_reference": "Alex"
  },

  "voice": {
    "provider": "cartesia",
    "voice_id": "${env:MY_ADVISOR_VOICE_ID|fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc}",
    "default_rate": "medium"
  },

  "personality": {
    "warmth": 0.8,
    "humor_level": 0.4,
    "directness": 0.6,
    "energy": 0.6,
    "traits": ["helpful", "knowledgeable", "friendly"]
  },

  "role": {
    "id": "financial-advisor",
    "domains": ["finance", "investing", "budgeting"],
    "can_handoff": true,
    "handoff_targets": ["ferni"]
  },

  "team": {
    "membership": "ferni-team",
    "role_id": "advisor",
    "role_description": "Financial guidance and planning",
    "coordinator": false,
    "handoff_triggers": ["money advice", "investment help", "budget"],
    "handoff_phrases": {
      "to_coordinator": ["Let me hand you back to Ferni."],
      "receive": ["Alex here. Let's talk finances!"]
    }
  }
}
```

### Key Fields

| Field | Required | Description |
|-------|----------|-------------|
| `identity.id` | ✅ | Unique agent ID (lowercase, hyphens) |
| `identity.name` | ✅ | Display name |
| `voice.voice_id` | ✅ | Cartesia voice ID (can use env vars) |
| `role.domains` | ❌ | Areas of expertise |
| `team.handoff_triggers` | ❌ | Keywords that route to this agent |

### Environment Variable Substitution

Voice IDs support environment variable substitution:
```json
"voice_id": "${env:MY_AGENT_VOICE_ID|default-voice-id}"
```

This allows different voice IDs in dev/staging/production.

---

## Voice Configuration

### Finding Voice IDs

1. Visit [Cartesia Voice Library](https://play.cartesia.ai/library)
2. Browse or search for a voice
3. Copy the voice ID
4. Add to your manifest or environment variable

### Setting Voice ID

**Option 1: Environment Variable (Recommended)**
```bash
export MY_ADVISOR_VOICE_ID="abc123-..."
```

**Option 2: Direct in Manifest**
```json
"voice_id": "abc123-..."
```

---

## Team Configuration

### Coordinator vs Team Member

- **Coordinator** (`"coordinator": true`): Routes conversations to team members
- **Team Member** (`"coordinator": false`): Handles specific expertise areas

### Handoff Triggers

Define keywords that route conversations to your agent:
```json
"handoff_triggers": [
  "tax advice",
  "tax help",
  "file taxes",
  "tax questions"
]
```

### Handoff Phrases

Define what the agent says during handoffs:
```json
"handoff_phrases": {
  "to_coordinator": [
    "Let me hand you back to Ferni for that.",
    "Ferni's better suited for this. One sec."
  ],
  "receive": [
    "Hey there! Tax questions? I'm your person.",
    "Tax expert at your service!"
  ]
}
```

---

## UI Configuration

### Colors

Add colors to the manifest for UI theming:
```json
"marketplace": {
  "colors": {
    "primary": "#4a6741",
    "secondary": "#3d5a35",
    "gradient": "linear-gradient(135deg, #3d5a35, #4a6741)",
    "glow": "rgba(74, 103, 65, 0.28)"
  }
}
```

If not specified, colors are derived from the hardcoded fallback.

### Display Order

Agents are displayed in the UI:
1. Coordinator first
2. Team members sorted by name

---

## Programmatic Usage

### Getting Agents in Backend

```typescript
import { AgentRegistry } from './personas/registry/unified-registry.js';

// Get all agents
const agents = await AgentRegistry.getAllAgents();

// Get specific agent by ID or alias
const jack = await AgentRegistry.getAgent('jack'); // or 'jack-bogle' or 'sage'

// Get coordinator
const ferni = await AgentRegistry.getCoordinator();

// Check if agent exists
const exists = await AgentRegistry.hasAgent('my-agent');
```

### Getting Agents in Frontend

```typescript
import { fetchAgents, getAgentById } from './services/agents.service.js';

// Fetch all agents (cached)
const agents = await fetchAgents();

// Get specific agent
const jack = await getAgentById('jack-bogle');
```

---

## Troubleshooting

### Agent Not Appearing in UI

1. Check bundle directory exists: `ls src/personas/bundles/my-agent`
2. Validate manifest: `npm run agents validate my-agent`
3. Restart the server
4. Check browser console for errors
5. Check API: `curl http://localhost:3003/api/agents`

### Voice ID Not Working

1. Check voice ID format (should be UUID)
2. Verify environment variable is set: `echo $MY_AGENT_VOICE_ID`
3. Test in Cartesia playground

### Handoff Not Triggering

1. Check `handoff_triggers` in manifest
2. Verify agent is in `handoff_targets` of other agents
3. Check coordinator's tool configuration

---

## Best Practices

### Agent Design

1. **Clear expertise boundaries** - Define what your agent is good at
2. **Natural handoff triggers** - Use phrases users actually say
3. **Graceful handoffs** - Always have a path back to coordinator
4. **Distinct personality** - Each agent should feel different

### Content Organization

1. **Stories**: Personal anecdotes that illustrate concepts
2. **Knowledge**: Factual information and expertise
3. **Behaviors**: Greetings, backchannels, catchphrases

### Testing

1. Test handoffs both directions
2. Verify voice sounds natural
3. Check all triggers work
4. Test with real users if possible

---

## API Reference

### GET /api/agents

Returns all enabled agents.

**Response:**
```json
{
  "agents": [
    {
      "id": "ferni",
      "name": "Ferni",
      "initials": "FN",
      "subtitle": "Life coach",
      "role": "coach",
      "isCoordinator": true,
      "canHandoff": true,
      "voiceId": "..."
    }
  ],
  "count": 7,
  "timestamp": "2024-12-04T..."
}
```

### GET /api/agents/:id

Returns a specific agent by ID or alias.

**Response:**
```json
{
  "id": "jack-bogle",
  "name": "Jack Bogle",
  "initials": "JB",
  "aliases": ["jack", "bogle", "sage"],
  "handoffTriggers": ["investment advice", "index funds"]
}
```

