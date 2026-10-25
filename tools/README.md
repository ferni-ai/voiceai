# 🛠 Developer Tools

> **Automation and tooling for the Ferni ecosystem.**

---

## Overview

| Tool | Status | Description |
|------|--------|-------------|
| **Discord Bot** | 🔨 Scaffold | Manage agents from Discord |
| **CLI Launch Commands** | ✅ Ready | Automated launch workflows |

---

## Discord Bot

Manage Ferni agents directly from Discord.

### Setup

1. Create Discord application at [discord.com/developers](https://discord.com/developers)
2. Add bot to your server
3. Configure environment variables:

```bash
DISCORD_BOT_TOKEN=your-token
DISCORD_CLIENT_ID=your-client-id
FERNI_API_ENDPOINT=https://api.ferni.ai
```

### Development

```bash
cd tools/discord-bot
npm install
npm run dev
```

### Commands
| Command | Description |
|---------|-------------|
| `/ferni init <name>` | Create new agent |
| `/ferni list` | List your agents |
| `/ferni deploy <agent>` | Deploy to production |
| `/ferni status <agent>` | Agent status |
| `/ferni preview <agent>` | Generate preview link |
| `/ferni logs <agent>` | View recent logs |

---

## CLI Launch Commands

Automated workflows for product launches.

### Available Commands

```bash
# Interactive launch menu
ferni launch

# Pre-launch checklist
ferni launch checklist

# Execute launch day sequence
ferni launch day

# Schedule social media posts
ferni launch schedule

# View analytics dashboard
ferni launch analytics

# Generate marketing content
ferni launch content

# Record demo GIFs
ferni launch gifs

# Post to social media
ferni launch post twitter
ferni launch post linkedin
ferni launch post discord
ferni launch post all
```

### Configuration

Create `.social-config.json` for API credentials:

```json
{
  "twitter": {
    "apiKey": "...",
    "apiSecret": "...",
    "accessToken": "...",
    "accessSecret": "..."
  },
  "linkedin": {
    "accessToken": "...",
    "organizationId": "..."
  },
  "discord": {
    "webhookUrl": "..."
  }
}
```

⚠️ Add `.social-config.json` to `.gitignore`!

---

## GitHub Workflows

### Template Sync

Automatically syncs the agent starter template to the public repo.

**File:** `.github/workflows/sync-template-repo.yml`

**Triggers:**
- Push to main with template file changes
- Manual dispatch

**What it does:**
1. Extracts template files from this repo
2. Updates `ferni-ai/agent-starter` repo
3. Creates a PR if there are changes

---

## Development

### Adding a New Tool

1. Create directory: `tools/new-tool/`
2. Add `package.json` with scripts
3. Add entry to this README
4. Consider if it needs CI/CD integration

### Tool Standards

- Use TypeScript
- Include README with setup instructions
- Document all commands/features
- Add tests where appropriate

---

## File Structure

```
tools/
├── README.md                 # This file
├── discord-bot/
│   ├── src/
│   │   └── index.ts          # Bot implementation
│   └── package.json
└── scripts/                  # Automation scripts
    └── (coming soon)
```

---

## Related Documentation

- **Discord Bot Spec:** `docs/specs/DISCORD-BOT.md`
- **Live Playground Spec:** `docs/specs/LIVE-PLAYGROUND.md`
- **GitHub Template Spec:** `docs/specs/GITHUB-TEMPLATE-REPO.md`

---

*Tools to make developers productive with Ferni.*
