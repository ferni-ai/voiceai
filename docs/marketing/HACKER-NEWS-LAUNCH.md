# Hacker News Launch

> **Show HN post and comment strategy.**

---

## Show HN Title

```
Show HN: Open-source CLI to build and deploy voice AI agents in 3 commands
```

**Alternative titles:**
- `Show HN: Heroku for voice AI agents – deploy in 5 minutes`
- `Show HN: Build production voice AI without ML expertise`
- `Show HN: We made voice AI as easy as "npm create"`

---

## Post Body

```
Hey HN,

I've been building voice AI for 3 years. The tech has gotten incredible – sub-200ms latency, natural interruptions, emotional awareness. But deploying it? Still a nightmare of WebRTC, speech pipelines, and cloud config.

So we built this:

    ferni agent init my-advisor
    ferni agent preview my-advisor
    ferni agent publish my-advisor

That's it. From zero to a production voice agent in ~5 minutes.

**What happens:**

1. `init` runs an interactive wizard – pick a template, choose a voice, set personality
2. `preview` starts a local dev server with hot reload
3. `publish` deploys to Cloud Run with auto-scaling, SSL, and a subdomain

**The output:**

A URL where anyone can have a real voice conversation with your agent. Not text chat. Actual speech, with natural back-and-forth and sub-200ms latency.

**How it works:**

- LiveKit for WebRTC voice transport
- Cartesia for text-to-speech (surprisingly good these days)
- Your choice of LLM (OpenAI, Gemini, Claude)
- Cloud Run for auto-scaling (pay only when in use)

**What we're seeing people build:**

- Customer support that doesn't require hold music
- Tutoring bots with infinite patience
- Coaching apps that actually follow up
- Legacy preservation (grandparent's voice for grandchildren)

**Pricing:**

Free tier: 100 min/month. Pro: $49/mo for 1,000 min. Self-hosting is an option for the paranoid (no judgment).

**Try it:**

    npm install -g @ferni/cli
    ferni agent init hello-world
    ferni agent preview hello-world

Docs: https://developers.ferni.ai
Repo: https://github.com/ferni-ai/agent-builder (open source CLI)

Happy to answer questions about voice AI, the architecture, or what we've learned building this.
```

---

## Expected Questions & Answers

### Q: Why not just use OpenAI's voice API?

```
OpenAI's Realtime API is great for demos, but production deployment is still on you. You need to handle:

- WebRTC infrastructure
- Session management
- Scaling
- Landing pages
- Custom domains

We handle all of that. Think of it as "Vercel for voice AI" – you focus on the agent, we handle the infra.

Also, we're model-agnostic. You can use GPT-4, Gemini, Claude, or roll your own.
```

### Q: What's the latency like?

```
Sub-200ms end-to-end, which is faster than human reaction time. 

The stack:
- LiveKit handles WebRTC (they're incredibly optimized for this)
- Cartesia has ~50ms TTS
- We stream everything, so you hear the response starting before it's done generating

It genuinely feels like talking to someone, not waiting for a response.
```

### Q: How does this compare to Dialogflow, Amazon Lex, etc.?

```
Those are essentially phone tree builders. Good for "press 1 for sales."

Ferni agents are more like... having a conversation with a knowledgeable friend. They can:
- Handle interruptions naturally
- Maintain context across a long conversation
- Express personality (humor, warmth, directness)
- Use tools (search, APIs, etc.)

Different use cases. If you need rigid call flows, use Dialogflow. If you want genuine conversation, try this.
```

### Q: What about privacy? Where does the data go?

```
Voice audio is processed in real-time and not stored by default. Transcripts can be stored for conversation continuity (opt-in).

For enterprise, we have:
- SOC 2 certification (in progress)
- On-prem deployment option
- Data residency controls

The CLI itself is open source, so you can audit exactly what it sends.
```

### Q: Is this open source?

```
The CLI is open source: github.com/ferni-ai/agent-builder

The hosted platform (what `publish` deploys to) is not. But you can self-host the entire stack if you prefer – we provide the Docker images and deployment scripts.
```

### Q: How do you handle edge cases like accents, background noise?

```
Honestly, better than you'd expect. Modern speech recognition has come a long way.

We use:
- Whisper for speech-to-text
- Noise suppression in the audio pipeline
- Automatic gain control

Not perfect in very noisy environments, but works well for typical use cases (office, home, quiet cafe).
```

### Q: What happens when my agent says something wrong/harmful?

```
A few safeguards:
1. System prompts include "what not to do" instructions
2. We have content filtering on the LLM side
3. Enterprise plans can add custom filters

Ultimately, you're responsible for your agent's behavior. We provide guardrails, not guarantees.
```

### Q: Cool project! What's your business model?

```
Thanks! Freemium SaaS:
- Free: 100 min/mo, great for testing
- Pro ($49/mo): 1,000 min, custom domains, analytics
- Enterprise: Unlimited, on-prem, support

We've been profitable on the hosted platform; this CLI is our developer acquisition channel.
```

---

## HN Comment Etiquette

### Do:
- Answer questions directly and technically
- Acknowledge limitations honestly
- Provide code examples
- Link to specific docs
- Thank people for feedback

### Don't:
- Be defensive about criticism
- Over-promise capabilities
- Use marketing speak
- Argue with trolls
- Ask for upvotes (instant ban)

---

## Timing

Best times to post on HN (Pacific Time):
- **Tuesday-Thursday**: 6-8 AM PT
- Avoid weekends and holidays
- Avoid major news days

---

## Monitoring

Set up alerts for:
- [ ] HN post mentions
- [ ] GitHub repo stars
- [ ] npm install counts
- [ ] Twitter mentions

Tools:
- HN RSS for your post
- `f5bot.com` for keyword alerts
- Google Alerts for "Ferni"

---

## Follow-Up Posts

After initial Show HN, consider:

**1 month later:**
```
Show HN: Ferni Agent Builder – We shipped X features based on HN feedback
```

**Notable milestone:**
```
Ask HN: We crossed 10K agent deployments – what should we build next?
```

**Deep technical:**
```
Show HN: How we reduced voice AI latency from 500ms to <200ms
```

---

*Target: Front page, 100+ points*
