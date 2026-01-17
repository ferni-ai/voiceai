# 🎙️ Ferni Agent Starter

> Build your own voice AI agent in minutes.

[![Deploy to Ferni](https://img.shields.io/badge/Deploy-Ferni-4a6741)](https://developers.ferni.ai/deploy)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Quick Start

### 1. Use This Template

Click **"Use this template"** above, or clone directly:

```bash
gh repo create my-agent --template ferni-ai/agent-starter
cd my-agent
```

### 2. Install CLI

```bash
npm install -g @ferni/cli
```

### 3. Preview Locally

```bash
ferni agent preview my-agent
```

Open http://localhost:3333 and start talking to your agent!

### 4. Customize

Edit these files to make the agent your own:

| File | What it controls |
|------|------------------|
| `src/personas/bundles/my-agent/persona.manifest.json` | Name, voice, personality |
| `src/personas/bundles/my-agent/identity/system-prompt.md` | What your agent knows and does |
| `src/personas/bundles/my-agent/content/behaviors/greetings.json` | How it says hello |
| `src/personas/bundles/my-agent/brand/brand.json` | Colors and theme |

### 5. Deploy

```bash
ferni agent publish my-agent
```

Your agent is live at `https://my-agent.agents.ferni.ai` 🚀

---

## Project Structure

```
src/personas/bundles/my-agent/
├── persona.manifest.json   # Agent configuration
├── identity/
│   ├── system-prompt.md    # The agent's "brain"
│   └── biography.md        # Background story
├── content/
│   └── behaviors/
│       ├── greetings.json  # Hello messages
│       └── catchphrases.json
└── brand/
    └── brand.json          # Colors, theme
```

## Customization Guide

### Change the Personality

Edit `persona.manifest.json`:

```json
{
  "personality": {
    "warmth": 0.8,       // 0 = cold, 1 = warm
    "directness": 0.6,   // 0 = gentle, 1 = blunt
    "energy": 0.6,       // 0 = calm, 1 = energetic
    "humor_level": 0.4   // 0 = serious, 1 = playful
  }
}
```

### Change the Voice

Available voices:

| Voice | ID | Style |
|-------|----|-------|
| Warm Female | `c2ac25f9-ecc0-43f4-aaf5-e0f482e5f478` | Friendly |
| Calm British Man | `bf991597-aacf-4b1a-96fe-4c0cb7fecf96` | Professional |
| Energetic Coach | `41534e16-2966-4c6b-9670-111411def906` | Motivating |

Update `voice.voice_id` in the manifest.

### Add Tools

Enable built-in capabilities:

```json
{
  "tools": {
    "optional": ["searchWeb", "getWeather", "getNews"]
  }
}
```

## Deployment Options

### Option 1: Ferni Hosting (Recommended)

```bash
ferni agent publish my-agent
```

### Option 2: GitHub Actions (Auto-Deploy)

This repo includes a GitHub Action that deploys on push to main.

1. Add secret: `FERNI_API_KEY` (get from [dashboard](https://dashboard.ferni.ai))
2. Push to main
3. Check Actions tab

### Option 3: Self-Hosting

```bash
ferni agent build my-agent
docker run -p 8080:8080 my-agent:latest
```

## Resources

- 📚 [Full Documentation](https://developers.ferni.ai)
- 🍳 [Agent Recipes](https://developers.ferni.ai/recipes)
- 💬 [Discord Community](https://discord.gg/ferni)
- 🐛 [Report Issues](https://github.com/ferni-ai/agent-starter/issues)

## FAQ

**Q: How much does it cost?**
- Free: 100 min/month
- Pro ($49/mo): 1,000 min/month
- Enterprise: Unlimited

**Q: Can I use my own LLM?**
Yes! Configure in manifest: OpenAI, Gemini, Claude, or custom.

**Q: What about privacy?**
Voice isn't stored by default. Opt-in for conversation history.

## License

MIT - do whatever you want with it.

---

Built with ❤️ by [Ferni](https://ferni.ai)
