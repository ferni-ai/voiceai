# Blog Post: Dev.to / Hashnode

> **Ready to publish. Copy-paste into editor.**

---

# Build a Production Voice AI Agent in 5 Minutes (No ML Required)

![Cover Image](https://ferni.ai/og-developer.png)

**Tags:** `#ai` `#voice` `#tutorial` `#webdev`

---

I used to think building voice AI required:
- A team of ML engineers
- Months of training data collection
- Complex speech-to-text pipelines
- WebRTC infrastructure expertise

Turns out, it takes three commands.

```bash
ferni agent init my-advisor
ferni agent preview my-advisor
ferni agent publish my-advisor
```

Let me show you how.

---

## What We're Building

A voice AI agent that:
- Has real-time voice conversations (sub-200ms latency)
- Has its own personality and expertise
- Runs on a branded landing page
- Auto-scales in production
- Costs ~$5/month for light usage

All in about 5 minutes of actual work.

---

## Prerequisites

- Node.js 18+
- A terminal
- That's it

```bash
npm install -g @ferni/cli
```

---

## Step 1: Create Your Agent

Run the wizard:

```bash
ferni agent init career-coach
```

You'll see an interactive prompt:

```
┌  🚀 Create AI Agent
│
◆  What type of agent?
│  ○ 💼 Professional Advisor
│  ● 🎓 Personal Mentor
│  ○ 🏃 Accountability Coach
│  ○ 🧘 Wellness Guide
│
◆  What's your agent's name?
│  Alex Rivera
│
◆  One-line tagline:
│  Career Coach for Tech Professionals
│
◆  Choose a voice:
│  ● 👨 Calm British Man - Composed, trustworthy
│
◆  Brand colors:
│  ● Ocean - #2980B9
│
✓  Created: src/personas/bundles/career-coach/
```

That's it. You now have a complete agent bundle.

---

## Step 2: Understand What Got Created

```
src/personas/bundles/career-coach/
├── persona.manifest.json    # Configuration
├── identity/
│   ├── system-prompt.md     # The agent's "brain"
│   └── biography.md         # Background story
├── content/
│   └── behaviors/
│       ├── greetings.json   # How it says hello
│       └── catchphrases.json
└── brand/
    └── brand.json           # Colors, theme
```

The most important file is `system-prompt.md`. This is where you define your agent's personality and expertise:

```markdown
# Alex Rivera

> Career Coach for Tech Professionals

You help engineers and designers navigate career growth,
salary negotiations, and leadership transitions.

## Your Style
- Ask questions before giving advice
- Use frameworks, not platitudes
- Celebrate small wins

## What You Do
- Career strategy and planning
- Salary negotiation coaching
- Leadership development
- Job search support

## What You Don't Do
- Make specific outcome promises
- Provide legal or financial advice
- Recruit for specific companies
```

---

## Step 3: Test Locally

Start the preview server:

```bash
ferni agent preview career-coach
```

```
┌  🛠️ Agent Preview
│
│  ✓ Token Server     localhost:3001  running
│  ✓ Voice Agent      localhost:8080  running
│
│  → http://localhost:3333
│
│  Press: o → open | r → reload | q → quit
```

Open your browser and start talking. Yes, actually talking. Out loud. To your computer.

The magic? **Hot reload**. Edit any file, and the agent updates instantly. No restart needed.

---

## Step 4: Deploy to Production

When you're happy:

```bash
ferni agent publish career-coach
```

```
┌  🚀 Publish Agent
│
◇  Validating...  ✓ All checks passed
◇  Generating landing page...  ✓ 98KB
◇  Deploying to Cloud Run...  ✓
│
│  🌐 https://career-coach.agents.ferni.ai
│
└  Alex Rivera is live! 🎉
```

That URL is real. Share it with anyone. They can talk to your agent immediately.

---

## What Just Happened?

Behind the scenes, that one command:

1. **Validated** your agent configuration
2. **Generated** a branded landing page
3. **Built** a Docker container
4. **Deployed** to Google Cloud Run
5. **Configured** SSL and DNS
6. **Set up** auto-scaling (0 to 5 instances)

You didn't have to think about any of it.

---

## Customize Your Agent

### Change the Personality

Edit `persona.manifest.json`:

```json
{
  "personality": {
    "warmth": 0.8,      // 0 = cold, 1 = warm
    "directness": 0.7,   // 0 = gentle, 1 = blunt
    "energy": 0.6,       // 0 = calm, 1 = energetic
    "humor_level": 0.4   // 0 = serious, 1 = playful
  }
}
```

### Change the Voice

Pick from the voice library:

| Voice | ID | Style |
|-------|-----|-------|
| Sarah | `c2ac25f9-...` | Friendly, warm |
| Calm British Man | `bf991597-...` | Composed |
| Energetic Coach | `41534e16-...` | Motivating |

### Add Tools

Enable web search, weather, news:

```json
{
  "tools": {
    "optional": ["searchWeb", "getWeather", "getNews"]
  }
}
```

---

## Real Use Cases

I've seen developers build:

- **Customer support agents** that replace hold music
- **Tutoring bots** that explain concepts patiently
- **Meditation guides** with soothing voices
- **Accountability coaches** that check in daily
- **Legacy preservation** - grandparents' voices for grandchildren

---

## Pricing

- **Free:** 100 minutes/month, 1 agent
- **Pro ($49/mo):** 1,000 minutes, unlimited agents, custom domains
- **Enterprise:** Unlimited, on-prem options

For most side projects, free tier is plenty.

---

## Tips for Great Agents

### 1. Be Specific

❌ "I help with career stuff"  
✅ "I help senior engineers negotiate compensation packages"

### 2. Set Boundaries

Always define what your agent **won't** do:

```markdown
## What I Don't Do
- Give legal or financial advice
- Make promises about outcomes
- Replace professional therapy
```

### 3. Sound Human

❌ "How may I assist you today?"  
✅ "Hey! What's going on?"

### 4. Test with Real Conversations

The preview server is your best friend. Talk to your agent. A lot. Refine based on how conversations actually go.

---

## What's Next?

- [Full documentation](https://developers.ferni.ai)
- [Agent recipes](https://developers.ferni.ai/recipes) - copy-paste patterns
- [Showcase](https://developers.ferni.ai/showcase) - examples to clone
- [Discord](https://discord.gg/ferni) - community help

---

## Try It Now

```bash
npm install -g @ferni/cli
ferni agent init my-first-agent
```

Build something. Ship it. Share it.

If you make something cool, I'd love to see it. Find me on Twitter [@sethdford](https://twitter.com/sethdford).

---

*Built with [Ferni](https://ferni.ai) - Voice AI for developers*

---

## Engagement Prompts (for comments)

1. "What would you build with this?"
2. "Any questions about voice AI I can answer?"
3. "What features would you want to see next?"

---

## Cross-Post Checklist

- [ ] Dev.to (primary)
- [ ] Hashnode
- [ ] Medium (if audience there)
- [ ] Personal blog
- [ ] LinkedIn article
- [ ] Reddit r/programming (link, not full post)
