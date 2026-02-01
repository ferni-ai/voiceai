# Marketplace Agents

Community and premium agent bundles for the Ferni Voice AI platform.

## Purpose

Repository of installable AI persona bundles that extend Ferni. Each agent is a complete persona bundle with system prompts, behaviors, and configuration.

## Structure

```
apps/marketplace-agents/
├── agents/                      # Agent bundles
│   ├── moxie-accountability/   # Accountability partner
│   ├── river-grief-companion/  # Grief companion
│   ├── zen-presence-guide/     # Mindfulness guide
│   ├── luna-sleep-guide/       # Sleep guide
│   ├── atlas-career-navigator/ # Career navigator
│   ├── spark-creativity-catalyst/ # Creativity catalyst
│   ├── sage-relationship-navigator/ # Relationship guide
│   └── pixel-tech-translator/  # Tech translator
├── registry.json               # Agent registry for discovery
├── CONTRIBUTING.md             # How to contribute agents
├── AGENT-RECOMMENDATIONS.md    # Recommended agents by use case
├── SHOWCASE.md                 # Agent showcase
└── docs/                       # Documentation
    ├── AGENT-DEVELOPMENT-GUIDE.md
    ├── CUSTOM-TOOLS-ARCHITECTURE.md
    └── phases/                 # Phased rollout plan
```

## Available Agents

| Agent | Type | Description |
|-------|------|-------------|
| **Moxie** | Premium | Ride-or-die accountability partner |
| **River** | Premium | Compassionate grief companion |
| **Zen** | Premium | Presence and mindfulness guide |
| **Luna** | Premium | Soft voice for sleepless nights |
| **Atlas** | Premium | Strategic career navigator |
| **Spark** | Premium | Creativity catalyst |
| **Sage** | Premium | Relationship guide |
| **Pixel** | Premium | Tech translator (no jargon) |
| **Amara Osei** | Premium | Chronic illness companion |
| **Carmen Reyes** | Premium | Parenting support |
| **Eli Brennan** | Premium | ADHD/executive function coach |
| **Kenji Mori** | Premium | Sleep and anxiety support |
| **Marcus Webb** | Premium | Recovery and sobriety companion |
| **Ray Chen** | Premium | Career burnout and layoff support |
| **Sasha Kim** | Premium | Creative identity and imposter syndrome |

## Installation

```bash
# From voiceai project directory
npm run agents install moxie-accountability --from github:sethdford/voiceai-agents

# Or manual copy
cp -r voiceai-agents/agents/moxie-accountability src/personas/bundles/

# Validate
npm run agents validate moxie-accountability

# Run
PERSONA_ID=moxie-accountability npm run dev
```

## Creating Agents

```bash
# Create new agent from template
npm run agents create my-advisor --template sage

# Test locally
PERSONA_ID=my-advisor npm run dev

# Submit PR to this repo
cp -r src/personas/bundles/my-advisor agents/
```

## Registry Format

```json
{
  "agents": [
    {
      "id": "moxie-accountability",
      "name": "Moxie",
      "version": "1.0.0",
      "description": "Your ride-or-die accountability partner",
      "path": "agents/moxie-accountability"
    }
  ]
}
```

## Agent Bundle Structure

Each agent follows the standard persona bundle format:

```
agent-name/
├── identity/
│   └── system-prompt.md         # Core personality
├── content/
│   └── behaviors/
│       ├── superhuman-insights.json
│       ├── trust-phrases.json
│       └── ...
└── persona.manifest.json        # Config (voice_id, colors)
```

## License

- **Open Agents**: MIT License
- **Premium Agents**: See individual agent licenses
