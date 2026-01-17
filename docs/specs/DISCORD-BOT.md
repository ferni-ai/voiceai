# Discord Bot Specification

> **A Discord bot that lets developers manage Ferni agents from Discord.**

---

## Overview

### Bot Name
`Ferni Bot`

### Description
Manage your Ferni voice AI agents directly from Discord. Create, preview, deploy, and monitor agents without leaving your server.

### Invite URL
`https://discord.com/api/oauth2/authorize?client_id=XXX&permissions=XXX&scope=bot%20applications.commands`

---

## Commands

### `/ferni init`

Create a new agent interactively.

```
/ferni init career-coach

┌─ 🚀 Create Agent: career-coach
│
│ What type of agent?
│ [Mentor] [Coach] [Advisor] [Support]
│
│ What's the name?
│ [Text input]
│
│ Choose a voice:
│ [🔊 Preview] Calm British Man
│ [🔊 Preview] Warm Female
│ [🔊 Preview] Energetic Coach
│
└─ [Create Agent]
```

**Interaction:** Uses buttons and modals for input.

---

### `/ferni list`

List your agents.

```
/ferni list

📋 Your Agents
────────────────────────────────
✅ career-coach    live    12 sessions
⏸️ wellness-guide  draft   0 sessions
✅ tutor-bot       live    47 sessions
────────────────────────────────
Total: 3 agents
```

---

### `/ferni status <agent>`

Get detailed status of an agent.

```
/ferni status career-coach

📊 career-coach
────────────────────────────────
Status:     ✅ Live
URL:        https://career-coach.agents.ferni.ai
Sessions:   12 today / 89 this week
Avg Length: 4m 32s
Errors:     0

Last deployed: 2 hours ago
Version: 1.2.0
────────────────────────────────
[Open URL] [View Logs] [Redeploy]
```

---

### `/ferni deploy <agent>`

Deploy an agent to production.

```
/ferni deploy career-coach

🚀 Deploying career-coach...

◇ Validating...  ✓
◇ Building...    ███████░░░ 70%
◇ Deploying...   
◇ DNS...         

[Cancel]
```

**On completion:**

```
✅ Deployed career-coach

🌐 https://career-coach.agents.ferni.ai

[Open URL] [View Logs]
```

---

### `/ferni preview <agent>`

Generate a preview link.

```
/ferni preview career-coach

🔗 Preview Link (expires in 1 hour)
https://preview.ferni.ai/career-coach/abc123

[Open in Browser] [Generate New Link]
```

---

### `/ferni logs <agent>`

View recent logs.

```
/ferni logs career-coach

📜 Recent Logs: career-coach
────────────────────────────────
12:34:01 INFO  Session started: user_abc123
12:34:15 INFO  Tool called: searchWeb
12:34:22 INFO  Session ended (2m 34s)
12:35:01 WARN  High latency: 450ms
────────────────────────────────
[Refresh] [Full Logs]
```

---

### `/ferni validate <agent>`

Run validation checks.

```
/ferni validate career-coach

🔍 Validating career-coach...

✅ Manifest schema valid
✅ Voice ID verified
✅ System prompt present
✅ Greetings configured
⚠️ biography.md is empty (optional)

Result: Ready to deploy
────────────────────────────────
[Deploy Now]
```

---

### `/ferni voice <text>`

Preview how text sounds with the default voice.

```
/ferni voice "Hey! What's on your mind today?"

🔊 Voice Preview
[Play Audio] [Change Voice]
```

---

### `/ferni help`

Show available commands.

```
/ferni help

🎙️ Ferni Bot Commands
────────────────────────────────
/ferni init <name>     Create new agent
/ferni list            List your agents
/ferni status <agent>  Agent status
/ferni deploy <agent>  Deploy to production
/ferni preview <agent> Generate preview link
/ferni logs <agent>    View recent logs
/ferni validate <agent> Run validation
/ferni voice <text>    Preview voice
/ferni settings        Bot settings
/ferni help            This message

Docs: developers.ferni.ai
────────────────────────────────
```

---

## Event Notifications

### Channel Setup

```
/ferni settings notifications #ferni-alerts

✅ Notifications will be sent to #ferni-alerts
```

### Notification Types

**Deploy Success:**
```
✅ Deploy Successful

Agent: career-coach
Version: 1.2.0
URL: https://career-coach.agents.ferni.ai
Deployed by: @seth

[View Agent]
```

**Deploy Failed:**
```
❌ Deploy Failed

Agent: wellness-guide
Error: Invalid voice ID "xyz123"

[View Details] [Fix Now]
```

**Error Alert:**
```
⚠️ Error Rate Alert

Agent: tutor-bot
Errors: 5 in last 10 minutes
Most common: "LLM timeout"

[View Logs] [Restart Agent]
```

**Usage Alert:**
```
📊 Usage Update

You've used 80% of your monthly minutes.
Upgrade to Pro for more.

[View Usage] [Upgrade]
```

---

## Embeds & Rich Messages

All responses use Discord embeds for better formatting:

```javascript
{
  title: "📊 career-coach",
  color: 0x3d5a45,  // Ferni green
  fields: [
    { name: "Status", value: "✅ Live", inline: true },
    { name: "Sessions", value: "12 today", inline: true },
    { name: "URL", value: "[Open](https://...)", inline: false }
  ],
  footer: { text: "Last updated: 2 minutes ago" }
}
```

---

## Authentication

### Linking Discord to Ferni

```
/ferni login

🔐 Link Your Ferni Account

Click the button below to connect your Discord
account to Ferni.

[Connect Account]
```

Opens OAuth flow in browser, returns to Discord on success.

---

## Implementation

### Tech Stack
- discord.js v14
- Node.js 20
- @ferni/cli (for operations)
- REST API for Ferni platform

### Bot Permissions
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands
- Attach Files (for voice previews)

### Rate Limits
- 1 deploy per minute per user
- 10 status checks per minute
- Voice previews: 5 per minute

---

## Slash Command Registration

```javascript
const commands = [
  new SlashCommandBuilder()
    .setName('ferni')
    .setDescription('Manage Ferni agents')
    .addSubcommand(sub =>
      sub.setName('init')
        .setDescription('Create a new agent')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Agent name')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List your agents')
    )
    // ... more subcommands
];
```

---

## Server Setup

### Recommended Channel Structure

```
📁 FERNI
├── #ferni-agents     (general discussion)
├── #ferni-alerts     (bot notifications)
├── #ferni-showcase   (share your agents)
└── #ferni-help       (support)
```

### Welcome Message

```
👋 Welcome to the Ferni Discord!

Get started:
1. /ferni login - Connect your account
2. /ferni init my-agent - Create an agent
3. /ferni deploy my-agent - Go live!

Need help? Post in #ferni-help
```

---

## Moderation

### Abuse Prevention
- Rate limits per user
- Require account verification
- Log all commands

### Auto-Moderation
- Don't respond to banned users
- Ignore commands in DMs (server only)
- Alert admins on unusual activity

---

## Analytics

Track:
- Commands used (by type)
- Deploy success/failure rate
- Active users per day
- Most common errors

---

## Development Phases

### Phase 1: MVP (2 weeks)
- [ ] `/ferni list`
- [ ] `/ferni status`
- [ ] `/ferni deploy`
- [ ] `/ferni login`
- [ ] Basic notifications

### Phase 2: Full Features (2 weeks)
- [ ] `/ferni init` with wizard
- [ ] `/ferni preview`
- [ ] `/ferni logs`
- [ ] `/ferni voice`
- [ ] Rich notifications

### Phase 3: Polish (1 week)
- [ ] Analytics tracking
- [ ] Admin commands
- [ ] Documentation
- [ ] Public launch

---

## Marketing

### Bot Description (Discord)
```
🎙️ Ferni Bot - Build Voice AI Agents

Create, deploy, and manage voice AI agents directly from Discord.

Commands:
• /ferni init - Create agent
• /ferni deploy - Ship to production
• /ferni status - Monitor agents

Docs: developers.ferni.ai
```

### Announcement
```
We're on Discord! 🎉

Manage your Ferni agents without leaving your server:
→ Create agents with /ferni init
→ Deploy with /ferni deploy
→ Get alerts in real-time

Add the bot: [link]
```

---

*Launch alongside VS Code extension for comprehensive developer tooling*
