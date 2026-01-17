# Ferni Agent Cheatsheet 📋

> **Keep this handy while building agents.**

---

## CLI Commands

| Command | What it does |
|---------|--------------|
| `ferni agent init <id>` | Create new agent with wizard |
| `ferni agent init <id> --template mentor` | Start from template |
| `ferni agent init <id> --quick` | Minimal prompts |
| `ferni agent preview <id>` | Local dev server with hot reload |
| `ferni agent preview <id> --port 4000` | Custom port |
| `ferni agent publish <id>` | Deploy to production |
| `ferni agent publish <id> --dry-run` | Preview deployment |
| `ferni agent list` | List all agents |
| `ferni agent show <id>` | Agent details |

---

## Templates

| Template | Best for | Personality |
|----------|----------|-------------|
| `advisor` | Finance, business, consulting | Analytical, direct |
| `mentor` | Life guidance, coaching | Warm, patient |
| `coach` | Accountability, fitness | Energetic, motivating |
| `wellness` | Meditation, mental health | Calm, gentle |
| `creative` | Brainstorming, ideas | Playful, curious |
| `custom` | Anything else | You decide |

---

## File Structure

```
src/personas/bundles/<agent-id>/
├── persona.manifest.json    # Configuration
├── identity/
│   ├── system-prompt.md     # ⭐ Agent's brain
│   └── biography.md         # Background story
├── content/
│   └── behaviors/
│       ├── greetings.json   # Hello messages
│       ├── catchphrases.json
│       └── backchannels.json
├── brand/
│   └── brand.json           # Colors
└── README.md
```

---

## Personality Settings

| Setting | 0 (Low) | 1 (High) |
|---------|---------|----------|
| `warmth` | Professional, reserved | Nurturing, affectionate |
| `humor_level` | Serious, focused | Playful, witty |
| `directness` | Gentle, indirect | Blunt, straightforward |
| `energy` | Calm, measured | Enthusiastic, dynamic |

### Quick Presets

**Warm Coach:** warmth 0.9, humor 0.3, directness 0.5, energy 0.5  
**Direct Expert:** warmth 0.6, humor 0.2, directness 0.9, energy 0.7  
**Calm Guide:** warmth 0.85, humor 0.1, directness 0.3, energy 0.2  
**Hype Coach:** warmth 0.75, humor 0.5, directness 0.85, energy 0.9

---

## Popular Voice IDs

| Voice | ID | Style |
|-------|-----|-------|
| Sarah | `c2ac25f9-ecc4-4f56-9095-651354df60c0` | Friendly, warm |
| Calm British Man | `bf991597-6c13-47e4-8411-91ec2de5c466` | Composed, trustworthy |
| Confident British Man | `ed81fd13-2016-4a49-8fe3-c0d2761695fc` | Authoritative |
| Wise Man | `79a125e8-cd45-4c13-8a67-188112f4dd22` | Experienced, thoughtful |
| Warm Woman | `fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc` | Nurturing, supportive |
| Energetic Coach | `41534e16-2966-4c6b-9670-111411def906` | Motivating |

---

## System Prompt Template

```markdown
# {Name}

> {Tagline}

## Core Approach
[How you help people]

## Communication Style
[How you talk]

## What You Do
- [Capability 1]
- [Capability 2]

## What You Don't Do
- [Boundary 1]
- [Boundary 2]
```

---

## Greetings Template

```json
{
  "new_user": [
    "Hey! I'm {name}. What's on your mind?",
    "Hi there! What brings you here today?"
  ],
  "returning_user": [
    "Welcome back! How are things?",
    "Good to see you again. What's happening?"
  ]
}
```

---

## Tools You Can Enable

| Tool | Domain | What it does |
|------|--------|--------------|
| `searchWeb` | research | Search the internet |
| `getNews` | information | Get news headlines |
| `getWeather` | information | Weather forecasts |
| `getStockQuote` | finance | Stock prices |
| `getMarketSummary` | finance | Market overview |
| `playMusic` | entertainment | Play music |

Enable in `persona.manifest.json`:
```json
{
  "tools": {
    "domains": ["research", "finance"],
    "optional": ["searchWeb", "getStockQuote"]
  }
}
```

---

## Color Themes

| Theme | Primary | Use for |
|-------|---------|---------|
| Ferni | `#4a6741` | Coaching, life guidance |
| Professional | `#2C3E50` | Business, finance |
| Ocean | `#2980B9` | Tech, calm |
| Forest | `#27AE60` | Wellness, growth |
| Sunset | `#E74C3C` | Energy, action |
| Earth | `#795548` | Grounded, warm |

---

## Deployment Settings

```json
{
  "deployment": {
    "subdomain": "my-agent",
    "min_instances": 0,    // 0 for dev, 1 for prod
    "max_instances": 5,
    "memory": "1Gi",
    "cpu": "0.5",
    "region": "us-central1"
  }
}
```

---

## Quick Fixes

### "Token server not running"
```bash
node token-server.js  # Terminal 1
pnpm dev              # Terminal 2
```

### "Voice ID not valid"
Use format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### "Deployment failed"
```bash
gcloud auth login
gcloud config set project ferni-ai
```

### "Hot reload not working"
Check you're editing files in `src/personas/bundles/<id>/`

---

## Resources

- **Quickstart**: `docs/guides/AGENT-QUICKSTART.md`
- **Recipes**: `docs/guides/AGENT-RECIPES.md`
- **Showcase**: `apps/marketplace-agents/SHOWCASE.md`
- **Discord**: discord.gg/ferni

---

*Print this! Keep it by your keyboard.*
