# Ferni Voice AI Agent Marketplace

Community and premium agent bundles for the [Ferni Voice AI Platform](https://github.com/sethdford/voiceai).

## 🎯 Available Agents

| Agent | Type | Description |
|-------|------|-------------|
| **[Moxie](./agents/moxie-accountability/)** | Premium | 🔥 Your ride-or-die accountability partner. Celebrates wins, calls out excuses, helps you show up. |
| **[River](./agents/river-grief-companion/)** | Premium | 🕊️ Compassionate companion for grief, loss, and life's hardest moments. |
| **[Zen](./agents/zen-presence-guide/)** | Premium | 🧘 Ground yourself, slow down, and rediscover presence, play, and joy. |
| **[Luna](./agents/luna-sleep-guide/)** | Premium | 🌙 Soft voice for sleepless nights. Wind down, breathe, and find rest. |
| **[Atlas](./agents/atlas-career-navigator/)** | Premium | 🧭 Strategic career partner for negotiations, transitions, and playing the long game. |
| **[Spark](./agents/spark-creativity-catalyst/)** | Premium | ✨ Playful partner for brainstorming, creative blocks, and rediscovering joy in making. |
| **[Sage](./agents/sage-relationship-navigator/)** | Premium | 💜 Thoughtful guide for communication, boundaries, and deeper connection. |
| **[Pixel](./agents/pixel-tech-translator/)** | Premium | 🤖 Explains technology in plain language. No jargon, no judgment. |

## 🚀 Quick Install

Install any agent into your Ferni project:

```bash
# From your voiceai project directory
npm run agents install moxie-accountability --from github:sethdford/voiceai-agents

# Or install from URL
npm run agents install luna-sleep-guide --from https://github.com/sethdford/voiceai-agents
```

## 📦 Manual Installation

1. **Download the agent bundle:**
   ```bash
   git clone https://github.com/sethdford/voiceai-agents.git
   ```

2. **Copy to your project:**
   ```bash
   cp -r voiceai-agents/agents/moxie-accountability /path/to/voiceai/src/personas/bundles/
   ```

3. **Set required environment variables:**
   ```bash
   # Add to your .env (check the agent's persona.manifest.json for voice_id)
   MOXIE_VOICE_ID=your-cartesia-voice-id
   ```

4. **Validate and run:**
   ```bash
   npm run agents validate moxie-accountability
   PERSONA_ID=moxie-accountability npm run dev
   ```

## 🏗️ Repository Structure

```
voiceai-agents/
├── README.md                    # This file
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
└── CONTRIBUTING.md             # How to contribute agents
```

## 📋 Registry

The `registry.json` file enables agent discovery:

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

## 🎨 Creating Your Own Agents

Want to publish an agent? See [CONTRIBUTING.md](./CONTRIBUTING.md).

### Quick Start

```bash
# In your voiceai project, create a new agent
npm run agents create my-advisor --template sage

# Test it locally
PERSONA_ID=my-advisor npm run dev

# When ready, copy to this repo and submit a PR
cp -r src/personas/bundles/my-advisor /path/to/voiceai-agents/agents/
```

## 📜 License

- **Open Agents**: MIT License
- **Premium Agents**: See individual agent licenses

## 🔗 Links

- [Ferni Voice AI Platform](https://github.com/sethdford/voiceai)
- [Developer Documentation](https://ferni.ai/developers)
- [Agent Management Guide](https://github.com/sethdford/voiceai/blob/main/docs/AGENT-MANAGEMENT.md)
