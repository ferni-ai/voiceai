# Build Your First AI Agent in 5 Minutes

> **Go from zero to live voice agent in three commands.**

This guide gets you up and running fast. For deeper customization, see the [full documentation](../architecture/AGENT-E2E-DEVELOPER-EXPERIENCE.md).

---

## Prerequisites

- Node.js 18+
- Ferni CLI: `npm install -g @ferni/cli`
- GCP account (for deployment)

---

## The Three Commands

```bash
# 1. Create your agent
ferni agent init my-advisor

# 2. Test it locally
ferni agent preview my-advisor

# 3. Ship it
ferni agent publish my-advisor
```

That's it. Your agent is live at `https://my-advisor.agents.ferni.ai` 🎉

---

## Step-by-Step Walkthrough

### Step 1: Create Your Agent

Run the wizard:

```bash
ferni agent init my-advisor
```

You'll be asked:

```
┌  🚀 Create AI Agent
│
◆  What type of agent?
│  ○ 💼 Professional Advisor
│  ● 🎓 Personal Mentor
│  ○ 🏃 Accountability Coach
│  ○ 🧘 Wellness Guide
│  ○ ✨ Creative Catalyst
│  ○ 🎭 Custom
│
◆  What's your agent's name?
│  Sarah Mitchell
│
◆  One-line tagline:
│  Career Coach for Tech Professionals
│
◆  Choose a voice:
│  ● 👩 Sarah - Friendly, warm, conversational
│
◆  Choose brand colors:
│  ● Ocean - #2980B9
│
✓  Created agent at: src/personas/bundles/my-advisor/
```

**Time: ~2 minutes**

### Step 2: Preview Locally

Start the dev server:

```bash
ferni agent preview my-advisor
```

```
┌  🛠️ Agent Preview
│
│  ✓ Token Server      localhost:3001  running
│  ✓ Voice Agent       localhost:8080  running
│
│  → http://localhost:3333
│
│  Press: o → open browser | r → reload | q → quit
```

Open your browser and talk to your agent! Changes to files hot-reload automatically.

**Time: ~30 seconds**

### Step 3: Deploy to Production

When you're happy with your agent:

```bash
ferni agent publish my-advisor
```

```
┌  🚀 Publish Agent
│
◇  Validating...  ✓ All checks passed
◇  Generating landing page...  ✓ 98KB
◇  Building container...  ✓ voiceai-agent:latest
◇  Deploying to Cloud Run...  ✓
◇  Configuring subdomain...  ✓
│
│  🌐 Live: https://my-advisor.agents.ferni.ai
│
└  Sarah Mitchell is live! 🎉
```

**Time: ~2 minutes**

---

## What Got Created

```
src/personas/bundles/my-advisor/
├── persona.manifest.json    # Agent configuration
├── identity/
│   ├── system-prompt.md     # 🔧 Customize this!
│   └── biography.md         # Agent backstory
├── content/
│   └── behaviors/
│       ├── greetings.json   # How it says hello
│       ├── catchphrases.json
│       └── backchannels.json
├── brand/
│   └── brand.json           # Colors, theme
└── README.md
```

---

## Customize Your Agent

### The Most Important File: `system-prompt.md`

This is your agent's brain. Edit it to define personality and expertise:

```markdown
# Sarah Mitchell

> Career Coach for Tech Professionals

You are Sarah Mitchell, a career coach who helps tech professionals
navigate career transitions, salary negotiations, and leadership growth.

## Your Approach
- Ask questions before giving advice
- Share frameworks, not just answers
- Celebrate wins, however small

## What You Do
- Help with career strategy and planning
- Coach on salary negotiations
- Guide leadership development
- Support job search strategies

## What You Don't Do
- Make specific promises about outcomes
- Provide legal or financial advice
- Recruit or refer to specific companies
```

### Add Greetings

Edit `content/behaviors/greetings.json`:

```json
{
  "new_user": [
    "Hey! I'm Sarah. What's going on in your career right now?",
    "Hi there! Ready to talk about your career goals?"
  ],
  "returning_user": [
    "Welcome back! How did that conversation go?",
    "Good to see you again. What's on your mind?"
  ]
}
```

### Change the Voice

In `persona.manifest.json`, update the voice ID:

```json
{
  "voice": {
    "provider": "cartesia",
    "voice_id": "c2ac25f9-ecc4-4f56-9095-651354df60c0"
  }
}
```

Browse voices at [cartesia.ai](https://cartesia.ai) or use the wizard's built-in library.

---

## Quick Tips

### Make It Human

❌ **Don't:** "How may I assist you today?"
✅ **Do:** "Hey! What's going on?"

❌ **Don't:** "I understand your concern about..."
✅ **Do:** "That sounds frustrating."

### Be Specific

❌ **Don't:** "I help with career stuff"
✅ **Do:** "I help tech professionals negotiate salaries and plan promotions"

### Set Boundaries

Always define what your agent **doesn't** do:

```markdown
## What I Don't Do
- Give legal or financial advice
- Make promises about outcomes
- Replace professional therapy
```

---

## Examples to Clone

| Agent | Template | Use Case |
|-------|----------|----------|
| Joel Dickson | `advisor` | Investment strategy expert |
| Moxie | `coach` | Accountability partner |
| Luna | `wellness` | Sleep and relaxation guide |
| Spark | `creative` | Creativity catalyst |

Clone an example:

```bash
# Start from a template
ferni agent init my-coach --template coach

# Or copy an existing agent
cp -r src/personas/bundles/joel-dickson src/personas/bundles/my-version
```

---

## Troubleshooting

### "Token server not running"

Start the dev servers:

```bash
# Terminal 1
node token-server.js

# Terminal 2
pnpm dev

# Terminal 3
ferni agent preview my-advisor
```

### "Voice ID not valid"

Make sure it's a valid Cartesia UUID:

```
✓ 3ebcd114-d280-4eed-a238-b9323a6b8e52
✗ some-random-string
```

### "Deployment failed"

Check you're authenticated:

```bash
gcloud auth login
gcloud config set project ferni-ai
```

---

## What's Next?

1. **Add Knowledge**: Create markdown files in `content/knowledge/` for domain expertise
2. **Custom Tools**: Enable tools in `persona.manifest.json` under `tools.optional`
3. **Analytics**: View usage at `https://ferni.ai/agents/my-advisor`
4. **Custom Domain**: Add `deployment.custom_domain` in manifest

---

## Get Help

- **Discord**: [discord.gg/ferni](https://discord.gg/ferni)
- **Docs**: [developers.ferni.ai](https://developers.ferni.ai)
- **Examples**: [github.com/sethdford/voiceai-agents](https://github.com/sethdford/voiceai-agents)

---

*Built something cool? Share it on Twitter/X with #BuiltWithFerni*
