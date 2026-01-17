# LinkedIn Launch Content

> **Professional-focused content for LinkedIn.**

---

## Launch Post

```
🎙️ Big announcement: We just made voice AI accessible to every developer.

Three years ago, building a production voice AI required:
→ A team of ML engineers
→ Months of data collection
→ Complex WebRTC infrastructure
→ Significant cloud expertise

Today, it takes three commands:

ferni agent init my-advisor
ferni agent preview my-advisor
ferni agent publish my-advisor

That's it. From zero to a live voice AI agent in about 5 minutes.

Here's what you get:
✓ Real-time voice conversations (sub-200ms latency)
✓ Natural interruption handling
✓ Customizable personality and expertise
✓ Branded landing page
✓ Auto-scaling production deployment

No ML expertise required. Just describe your agent and ship it.

What are people building?
• Customer support that doesn't put you on hold
• Tutors with infinite patience
• Coaches that actually follow up
• Legacy preservation (grandparents' voices for grandchildren)

We're offering a free tier (100 minutes/month) so you can experiment.

Try it: npm install -g @ferni/cli && ferni agent init

Full documentation: developers.ferni.ai

What would you build with this?

#voiceai #devtools #buildinpublic #ai #startup
```

---

## Shorter Version (For Better Engagement)

```
I spent 3 years learning what it takes to build production voice AI.

The hard parts:
- WebRTC infrastructure
- Speech-to-text pipelines
- Natural conversation flow
- Scaling and deployment

We packaged all of it into three commands:

ferni agent init
ferni agent preview  
ferni agent publish

Now anyone can build a voice AI agent in 5 minutes.

Try it free: developers.ferni.ai

#voiceai #devtools
```

---

## Technical Post (For Developer Audience)

```
How we got voice AI latency under 200ms 🔧

When we started building real-time voice agents, the latency was painful. 
Users would wait 500ms+ for a response. It felt like talking to voicemail.

Here's what we learned:

1️⃣ Stream everything
Don't wait for the full response. Start speaking as tokens arrive.
We pipe LLM output directly to TTS, no buffering.

2️⃣ Speculative STT
Start processing speech before the user finishes.
We run Whisper on partial audio, then adjust when they stop.

3️⃣ WebRTC, not WebSockets
WebSockets add 50-100ms. WebRTC gets you <20ms transport.
LiveKit handles the hard parts.

4️⃣ Warm instances
Cold starts kill latency. We keep one instance warm per agent.
Costs ~$5/month but worth every penny.

5️⃣ Edge TTS
Cartesia gives us 50ms TTS. The voice quality is indistinguishable from human recordings now.

The result: end-to-end latency under 200ms.

That's faster than human reaction time. Conversations feel natural.

We packaged all this into a CLI: ferni.ai/developers

If you're curious about the architecture, I wrote a deep dive: [link]

#engineering #voiceai #architecture
```

---

## Announcement Post (For Company Page)

```
📢 Introducing Ferni Agent Builder

We're excited to announce the public launch of our developer platform.

Build production voice AI agents in minutes, not months.

Key features:
🎙️ Real-time voice conversations
🚀 One-command deployment
🎨 Customizable personalities
📈 Auto-scaling infrastructure

Perfect for:
→ Customer support automation
→ Educational applications
→ Personal coaching tools
→ Interactive entertainment

Free tier available. Try it at developers.ferni.ai

#voiceai #productlaunch #ai
```

---

## Thought Leadership Post

```
Voice AI is about to change everything. Here's why.

Text chat had its moment. But there's something fundamentally human about voice.

We think differently when we speak. We're more authentic. More vulnerable. More ourselves.

The problem? Building voice AI has been incredibly hard. You needed:
- ML expertise
- Infrastructure knowledge  
- Months of development time

Not anymore.

We just launched a CLI that lets any developer build a production voice AI agent in 5 minutes.

Why does this matter?

Because the best applications of voice AI will come from people close to the problems:
- Teachers who understand learning
- Therapists who understand mental health
- Parents who understand children

Not ML researchers in labs.

We're giving them the tools to build.

Try it: developers.ferni.ai

The future of AI is voice. And now anyone can build it.

#ai #voice #futureofwork
```

---

## Carousel Post (For Visual Engagement)

**Slide 1: Hook**
```
Build a Voice AI Agent
in 5 Minutes
🎙️
(No ML Required)
```

**Slide 2: The Problem**
```
Building voice AI used to require:

❌ ML engineering team
❌ Months of development
❌ Complex infrastructure
❌ $50K+ investment
```

**Slide 3: The Solution**
```
Now it takes 3 commands:

$ ferni agent init
$ ferni agent preview
$ ferni agent publish

Done. Live voice agent.
```

**Slide 4: What You Get**
```
✓ Real-time conversations
✓ <200ms latency
✓ Natural interruptions
✓ Custom personality
✓ Auto-scaling
✓ SSL & DNS included
```

**Slide 5: Use Cases**
```
What people are building:

🎓 Tutors
💼 Customer support
🏃 Coaches
👴 Legacy preservation
```

**Slide 6: CTA**
```
Try it free:

npm install -g @ferni/cli
ferni agent init

developers.ferni.ai
```

---

## Reply Templates

### For "This is cool!" comments
```
Thanks! Would love to know what you'd build with it. Any ideas?
```

### For technical questions
```
Great question! [specific answer]

We wrote more about this in our docs: [link]

Happy to chat more if you want to dig deeper.
```

### For "How is this different from X?"
```
Good question. The main differences:

1. [Key difference 1]
2. [Key difference 2]
3. [Key difference 3]

We wrote a comparison here: [link]
```

### For investor/business inquiries
```
Thanks for reaching out! I'd be happy to chat.

Shoot me a DM or email at [email] and we can schedule a call.
```

---

## Posting Strategy

### Best Times
- Tuesday-Thursday, 8-10 AM local time
- Avoid Mondays (inbox clearing) and Fridays (weekend mode)

### Frequency
- Launch week: 3 posts (Mon, Wed, Fri)
- Ongoing: 1-2 posts per week

### Engagement
- Reply to every comment within 4 hours
- Ask follow-up questions
- Thank people who share
- Connect with engaged commenters

### Hashtags
Primary: `#voiceai` `#devtools` `#ai`
Secondary: `#startup` `#buildinpublic` `#engineering`

---

## Employee Advocacy

Template for team members to share:

```
Super proud of what we shipped at Ferni today.

We've been working on this for months: a way for any developer to build production voice AI agents in minutes.

The demo blew my mind when I first saw it. Three commands and you have a live voice agent.

Check it out: developers.ferni.ai

If you're curious about voice AI, happy to chat!
```

---

## Connection Request Template

For reaching out to potential users:

```
Hi [Name],

I noticed you're working on [relevant project/role]. We just launched a tool that might be interesting – it lets developers build voice AI agents in about 5 minutes.

Would love to connect and hear your thoughts. No pressure to try it, just always looking to learn from folks building in this space.

Best,
[Your name]
```

---

*LinkedIn is best for enterprise leads and professional credibility*
