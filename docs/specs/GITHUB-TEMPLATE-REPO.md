# GitHub Template Repository

> **Specification for a "Use this template" starter repo for Ferni agents.**

---

## Repository: `ferni-ai/agent-starter`

### Description
```
🎙️ Starter template for building Ferni voice AI agents. Create your own voice agent in minutes.
```

### Topics
`voice-ai` `ai-agent` `ferni` `voice-assistant` `template` `starter`

---

## File Structure

```
ferni-agent-starter/
├── .github/
│   ├── workflows/
│   │   ├── deploy.yml           # Auto-deploy on push to main
│   │   └── validate.yml         # PR validation
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       └── feature_request.md
├── src/
│   └── personas/
│       └── bundles/
│           └── my-agent/        # The starter agent
│               ├── persona.manifest.json
│               ├── identity/
│               │   ├── system-prompt.md
│               │   └── biography.md
│               ├── content/
│               │   └── behaviors/
│               │       ├── greetings.json
│               │       └── catchphrases.json
│               └── brand/
│                   └── brand.json
├── .env.example                 # Environment variables template
├── .gitignore
├── package.json
├── README.md                    # Main documentation
├── CUSTOMIZING.md               # How to customize
├── DEPLOYING.md                 # Deployment guide
└── LICENSE                      # MIT
```

---

## README.md

```markdown
# 🎙️ Ferni Agent Starter

> Build your own voice AI agent in minutes.

[![Deploy to Ferni](https://img.shields.io/badge/Deploy-Ferni-green)](https://developers.ferni.ai/deploy?repo=your-username/your-repo)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Quick Start

### 1. Use This Template

Click "Use this template" above, or:

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

### 4. Customize

Edit these files:

| File | What it controls |
|------|------------------|
| `persona.manifest.json` | Name, voice, personality |
| `identity/system-prompt.md` | What your agent knows and does |
| `content/behaviors/greetings.json` | How it says hello |
| `brand/brand.json` | Colors and theme |

### 5. Deploy

```bash
ferni agent publish my-agent
```

Your agent is live at `https://my-agent.agents.ferni.ai` 🚀

## Customization Guide

See [CUSTOMIZING.md](CUSTOMIZING.md) for detailed instructions.

## Examples

| Agent Type | Customize For |
|------------|---------------|
| Career Coach | Job interviews, salary negotiation |
| Tutor | Any subject matter |
| Customer Support | Your product/service |
| Personal Mentor | Life advice, motivation |

## Documentation

- [Full CLI Reference](https://developers.ferni.ai/cli)
- [Agent Recipes](https://developers.ferni.ai/recipes)
- [API Documentation](https://developers.ferni.ai/api)

## Community

- [Discord](https://discord.gg/ferni)
- [Twitter](https://twitter.com/ferni_ai)
- [GitHub Discussions](https://github.com/ferni-ai/agent-starter/discussions)

## License

MIT
```

---

## CUSTOMIZING.md

```markdown
# Customizing Your Agent

## Step 1: Agent Identity

Edit `persona.manifest.json`:

```json
{
  "identity": {
    "id": "your-agent-id",           // URL-safe, lowercase
    "name": "Your Agent Name",        // Display name
    "description": "What your agent does"
  }
}
```

## Step 2: Personality

Adjust these values (0-1 scale):

```json
{
  "personality": {
    "warmth": 0.8,      // 0 = cold/formal, 1 = warm/friendly
    "directness": 0.6,  // 0 = gentle hints, 1 = blunt advice
    "energy": 0.6,      // 0 = calm/steady, 1 = enthusiastic
    "humor_level": 0.4  // 0 = serious, 1 = playful
  }
}
```

## Step 3: Voice

Choose from available voices:

| Voice | ID | Best For |
|-------|-----|----------|
| Warm Female | `c2ac25f9-ecc0-43f4-aaf5-e0f482e5f478` | Friendly, approachable |
| Calm British Man | `bf991597-aacf-4b1a-96fe-4c0cb7fecf96` | Professional, composed |
| Energetic Coach | `41534e16-2966-4c6b-9670-111411def906` | Motivating, upbeat |

Update `voice.voice_id` in manifest.

## Step 4: System Prompt

Edit `identity/system-prompt.md`. This is your agent's brain:

```markdown
# Agent Name

> One-line tagline

You are [role description].

## Your Style
- How you communicate
- Your tone and approach

## What You Do
- Your capabilities
- Your expertise areas

## What You Don't Do
- Clear boundaries
- Limitations
```

## Step 5: Greetings

Edit `content/behaviors/greetings.json`:

```json
{
  "new_user": [
    "Hey! I'm [Name]. What's on your mind?",
    "Hi there! [Name] here. How can I help?"
  ],
  "returning_user": [
    "Welcome back! What's going on today?",
    "Good to see you again! What's up?"
  ]
}
```

## Step 6: Brand Colors

Edit `brand/brand.json`:

```json
{
  "primary": "#2980B9",    // Main brand color
  "secondary": "#1A5276", // Darker shade
  "theme": "light"         // "light" or "dark"
}
```

## Testing Changes

```bash
# Hot reload - changes apply instantly
ferni agent preview my-agent
```

## Next Steps

- [Add domain knowledge](https://developers.ferni.ai/guides/knowledge)
- [Enable tools](https://developers.ferni.ai/guides/tools)
- [Custom landing page](https://developers.ferni.ai/guides/branding)
```

---

## DEPLOYING.md

```markdown
# Deploying Your Agent

## Option 1: Ferni Hosting (Recommended)

```bash
ferni agent publish my-agent
```

This deploys to `https://my-agent.agents.ferni.ai`.

### Custom Domain

```bash
ferni agent publish my-agent --domain agent.yourdomain.com
```

Add a CNAME record pointing to `agents.ferni.ai`.

## Option 2: GitHub Actions (Auto-Deploy)

This repo includes a GitHub Action that deploys on push to main.

1. Add these secrets to your repo:
   - `FERNI_API_KEY` - Get from [dashboard](https://dashboard.ferni.ai/api-keys)
   
2. Push to main branch

3. Check Actions tab for deploy status

## Option 3: Self-Hosting

```bash
# Build container
ferni agent build my-agent

# Run locally
docker run -p 8080:8080 my-agent:latest

# Deploy to your cloud (example: Cloud Run)
gcloud run deploy my-agent --image my-agent:latest
```

## Environment Variables

Required for deployment:
- `FERNI_API_KEY` - Your Ferni API key
- `LIVEKIT_URL` - LiveKit server URL (provided)
- `LIVEKIT_API_KEY` - LiveKit API key (provided)

## Monitoring

View agent analytics at:
https://dashboard.ferni.ai/agents/my-agent

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Deploy failed | Check `ferni agent validate my-agent` |
| Voice not working | Verify voice ID is valid |
| Slow responses | Check LLM API quota |

[Full troubleshooting guide](https://developers.ferni.ai/troubleshooting)
```

---

## GitHub Actions

### .github/workflows/validate.yml

```yaml
name: Validate Agent

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install Ferni CLI
        run: npm install -g @ferni/cli
      
      - name: Validate Agent
        run: ferni agent validate my-agent
      
      - name: Check manifest schema
        run: ferni agent validate my-agent --strict
```

### .github/workflows/deploy.yml

```yaml
name: Deploy Agent

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install Ferni CLI
        run: npm install -g @ferni/cli
      
      - name: Validate
        run: ferni agent validate my-agent
      
      - name: Deploy
        run: ferni agent publish my-agent
        env:
          FERNI_API_KEY: ${{ secrets.FERNI_API_KEY }}
      
      - name: Comment on commit
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.repos.createCommitComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              commit_sha: context.sha,
              body: '🚀 Deployed to https://my-agent.agents.ferni.ai'
            })
```

---

## Package.json

```json
{
  "name": "my-ferni-agent",
  "version": "1.0.0",
  "description": "My custom voice AI agent",
  "scripts": {
    "preview": "ferni agent preview my-agent",
    "validate": "ferni agent validate my-agent",
    "deploy": "ferni agent publish my-agent"
  },
  "keywords": ["ferni", "voice-ai", "agent"],
  "license": "MIT"
}
```

---

## Template Repository Settings

### GitHub Settings
- [x] Template repository
- [x] Include all branches: No
- [x] Automatically delete head branches
- [x] Allow squash merging
- [x] Discussions enabled
- [x] Issues enabled

### Topics
`ferni` `voice-ai` `agent` `template` `starter` `ai`

### Social Preview
1200x630 image with:
- Ferni logo
- "Voice AI Agent Starter"
- Code snippet visual

---

## Launch Checklist

- [ ] Create repo at `ferni-ai/agent-starter`
- [ ] Mark as template repository
- [ ] Add all documentation files
- [ ] Test "Use this template" flow
- [ ] Add to Ferni docs as quickstart path
- [ ] Announce on social media
- [ ] Add to awesome-ferni list

---

*This template should be the fastest path from "I want to try Ferni" to "I have a running agent"*
