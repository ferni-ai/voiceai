# Developer Landing Page Content

> **Content for developers.ferni.ai**

---

## Hero Section

### Headline
**Build Voice AI Agents in Minutes, Not Months**

### Subheadline
Three commands. One voice agent. Zero infrastructure headaches.

### CTA
`Get Started Free →`

### Code Preview (Animated Terminal)
```bash
$ ferni agent init my-advisor

✓ Created agent: my-advisor
  → identity/system-prompt.md
  → content/behaviors/greetings.json
  → persona.manifest.json

$ ferni agent preview my-advisor

🎙️ Preview running at http://localhost:3333
   Hot reload enabled • Press Space to talk

$ ferni agent publish my-advisor

🚀 Deployed to https://my-advisor.agents.ferni.ai
```

---

## Value Props

### ⚡ From Zero to Live in 15 Minutes

No ML expertise required. No infrastructure to manage. Just describe your agent's personality and expertise, pick a voice, and deploy.

```bash
ferni agent init → ferni agent preview → ferni agent publish
```

### 🎙️ Real Voice, Real Conversations

Not text-to-speech on a chatbot. Actual real-time voice conversations powered by WebRTC. Sub-200ms latency. Indistinguishable from a phone call.

### 🎨 Your Brand, Your Voice

Choose from our voice library or clone any voice. Customize colors, landing pages, and domains. Your agent, your brand.

### 📈 Built to Scale

Start free, scale to millions. Cloud Run auto-scaling. Pay only for what you use. From prototype to production without changing code.

---

## How It Works

### Step 1: Define Your Agent

Tell us who your agent is. Our wizard guides you through personality, expertise, and voice selection.

```markdown
# Sarah Mitchell

> Career Coach for Tech Professionals

You help engineers and designers navigate career growth,
salary negotiations, and leadership transitions.

## Your Style
- Ask before advising
- Use frameworks, not platitudes  
- Celebrate small wins
```

### Step 2: Test Locally

Our preview server gives you hot-reload development with real voice testing. Change a file, hear it immediately.

```bash
ferni agent preview sarah-mitchell

🎙️ Listening... "Hey Sarah, I got a job offer but—"
💬 Sarah: "That's exciting! Tell me about it."
```

### Step 3: Deploy

One command puts your agent live with a branded landing page, SSL, and auto-scaling. Share the link.

```bash
ferni agent publish sarah-mitchell

✓ https://sarah-mitchell.agents.ferni.ai
```

---

## Use Cases

### 👩‍💼 Customer Support
Replace hold music with an AI agent that actually helps. Answers questions, routes issues, never sleeps.

### 🎓 Education & Tutoring
Create personalized tutors for any subject. Patient, available 24/7, scales to unlimited students.

### 🏥 Healthcare Companions
Medication reminders, symptom checking, appointment prep. Compliant, careful, always available.

### 💼 Sales & Onboarding
Product demos that talk back. Onboarding flows that adapt. Sales assistants that never get tired.

### 🧘 Wellness & Coaching
Meditation guides, therapy supplements, accountability partners. Warm, present, infinitely patient.

### 👴 Legacy Preservation
Preserve the voice and wisdom of loved ones. Grandparents who are always available to tell their stories.

---

## What Developers Say

> "I built a customer support agent in an afternoon. Usually this would take a team of three a month."
> 
> — **Marcus Chen**, Founder @ TechFlow

> "The voice quality is incredible. Our users can't tell it's not a human."
>
> — **Sarah Park**, CTO @ HealthFirst

> "Finally, an AI platform that doesn't require a PhD to use."
>
> — **James Wilson**, Indie Developer

---

## Pricing

### Free Tier
- 100 minutes/month
- 1 agent
- Community support
- `*.agents.ferni.ai` subdomain

`Start Free →`

### Pro — $49/month
- 1,000 minutes/month
- Unlimited agents
- Priority support
- Custom domains
- Analytics dashboard
- Voice cloning

`Start Pro Trial →`

### Enterprise — Custom
- Unlimited minutes
- Dedicated infrastructure
- SLA guarantee
- On-prem option
- Custom integrations
- Dedicated support

`Contact Sales →`

---

## Frequently Asked Questions

### Do I need AI/ML experience?
No. If you can write Markdown and JSON, you can build an agent.

### How does voice work?
We use Cartesia for text-to-speech and LiveKit for real-time voice. You just pick a voice and we handle the rest.

### Can I use my own voice?
Yes! Clone any voice through Cartesia's voice cloning. Upload 30 seconds of audio.

### What about latency?
Sub-200ms end-to-end. Faster than human reaction time.

### Is it secure?
Yes. All conversations are encrypted in transit. We're SOC 2 compliant. Enterprise plans offer on-prem options.

### Can I integrate with my app?
Yes. Every agent exposes a REST API and WebSocket endpoint. Embed the widget or build custom UIs.

### What happens if my agent goes viral?
Cloud Run auto-scales to handle traffic. You only pay for what you use.

---

## Quick Links

- [Quickstart Guide](/docs/quickstart) — 5-minute tutorial
- [Agent Recipes](/docs/recipes) — Copy-paste patterns
- [Showcase](/showcase) — Example agents to clone
- [API Reference](/api) — Full API documentation
- [Discord Community](https://discord.gg/ferni) — Get help, share projects

---

## Footer CTA

### Ready to Build?

```bash
npm install -g @ferni/cli
ferni agent init my-first-agent
```

`Get Started Free →`

---

## Meta Tags

```html
<title>Ferni for Developers — Build Voice AI Agents in Minutes</title>
<meta name="description" content="Three commands to create, test, and deploy production voice AI agents. No ML expertise required.">
<meta property="og:title" content="Ferni for Developers">
<meta property="og:description" content="Build Voice AI Agents in Minutes, Not Months">
<meta property="og:image" content="https://developers.ferni.ai/og-image.png">
<meta name="twitter:card" content="summary_large_image">
```

---

## SEO Keywords

- voice ai platform
- build voice agent
- conversational ai development
- voice assistant api
- create ai chatbot
- voice ai sdk
- real-time voice ai
- custom voice assistant
- ai agent builder
- voice ai development platform

---

*Content last updated: January 2026*
