---
title: "Community Spotlight: Building Voice AI for Mental Health Support"
excerpt: "How Sarah Chen built a voice-first therapy companion that's helping thousands of users practice mindfulness."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#38bdf8"
date: 2026-01-15
category: "Community"
image: "community-healthtech.png"
readTime: 8
---

*This is the first in our Community Spotlight series, featuring developers building remarkable things with Ferni.*

---

Meet Sarah Chen, a developer who left her role at a major tech company to build MindfulMoments - a voice-first therapy companion that's now helping over 10,000 users practice mindfulness and manage anxiety.

We sat down with Sarah to learn how she built it.

## The Problem

"I was in therapy for years," Sarah explains. "My therapist was amazing, but I only saw her once a week. The other 167 hours? I was on my own."

Sarah noticed she'd forget the techniques between sessions. "I'd be in the middle of an anxiety spiral at 2 AM, and I couldn't remember what my therapist told me to do."

## Why Voice?

"Typing during a panic attack is nearly impossible," Sarah says. "Your hands shake. You can't think clearly. But talking? Talking feels natural. Even at your worst, you can usually talk."

She tried building a chatbot first. "It helped, but something was missing. The interaction felt clinical, not supportive. Then I discovered Ferni."

## The Technical Journey

### Starting Simple

Sarah's first version was minimal:

```typescript
import { FerniClient } from '@ferni/sdk';

const client = new FerniClient({
  apiKey: process.env.FERNI_API_KEY,
  persona: 'maya',  // Calm, supportive coaching persona
});

client.registerTool({
  name: 'guided_breathing',
  description: 'Start a breathing exercise',
  handler: async ({ duration }) => {
    return {
      type: 'breathing_exercise',
      pattern: '4-7-8',  // Inhale 4s, hold 7s, exhale 8s
      duration,
    };
  },
});
```

"That first version could do guided breathing and basic grounding exercises. Nothing fancy. But users loved it."

### Adding Emotional Intelligence

The breakthrough came when Sarah started using Ferni's emotion detection:

```typescript
client.on('emotion_detected', async (emotion, context) => {
  if (emotion.anxiety > 0.7) {
    // User is highly anxious - switch to grounding mode
    return {
      response: "I can hear you're feeling overwhelmed right now. " +
                "Let's pause together. Can you tell me five things you can see?",
      mode: 'grounding',
      technique: '5-4-3-2-1',
    };
  }
});
```

"The first time MindfulMoments detected my anxiety before I explicitly said anything, I cried. It felt like someone actually understood."

### Context That Remembers

Users don't want to re-explain their situation every session:

```typescript
// Store therapeutic context
client.registerTool({
  name: 'update_context',
  handler: async ({ key, value }, context) => {
    await context.memory.store({
      category: 'therapeutic_context',
      key,
      value,
      // Never auto-expire therapeutic insights
      ttl: null,
    });
  },
});

// Use context in responses
client.on('session_start', async (context) => {
  const recentTriggers = await context.memory.get('recent_triggers');
  const copingStrategies = await context.memory.get('effective_strategies');

  return {
    systemContext: `
      User's recent anxiety triggers: ${recentTriggers}
      Strategies that have worked for them: ${copingStrategies}
      Approach: Validate feelings, then gently suggest proven strategies
    `,
  };
});
```

## Results

After 6 months:

| Metric | Result |
|--------|--------|
| Daily active users | 10,000+ |
| Average session length | 12 minutes |
| Sessions at 2-6 AM | 34% |
| User-reported anxiety reduction | 47% (self-reported) |
| Retention (30-day) | 62% |

"That 2-6 AM stat hit me hard," Sarah says. "These are people who can't sleep because of anxiety. And they're getting help at the moment they need it most."

## Lessons Learned

### 1. Voice Changes Everything

"Users tell me things they'd never type. There's something about speaking that bypasses the inner critic. People open up in ways that surprise them."

### 2. Silence is Powerful

```typescript
// Don't fill every pause
client.configure({
  silenceHandling: {
    // Wait 5 seconds before speaking during exercises
    exerciseMode: 5000,
    // 3 seconds for normal conversation
    conversationMode: 3000,
    // Longer pauses are okay during emotional moments
    emotionalMode: 8000,
  },
});
```

"In therapy, silence is healing. I had to teach MindfulMoments that not every pause needs to be filled."

### 3. Escalation Paths Matter

```typescript
client.on('crisis_detected', async (context) => {
  // This is critical - know your limits
  return {
    response: "I'm really glad you shared that with me. " +
              "What you're going through sounds serious, and I think " +
              "it would help to talk to a crisis counselor. " +
              "Can I connect you with someone right now?",
    action: 'offer_crisis_resources',
    resources: [
      { name: '988 Suicide & Crisis Lifeline', phone: '988' },
      { name: 'Crisis Text Line', text: 'HOME to 741741' },
    ],
  };
});
```

"I'm not a replacement for therapy. I'm a complement. Knowing when to escalate is the most important feature I built."

## What's Next

Sarah is working on:

1. **Therapist Integration** - Let licensed therapists review session summaries (with user consent)
2. **Group Sessions** - Guided group meditations with voice AI facilitation
3. **Research Partnerships** - Academic studies on voice AI for mental health

## Try It

MindfulMoments is available at [mindfulmoments.app](https://mindfulmoments.app).

## Build Your Own

Inspired to build something similar? Here's how to start:

1. [Ferni Quick Start](/developers/getting-started/)
2. [Emotion Detection API](/developers/docs/emotion/)
3. [Building Wellness Apps](/developers/guides/wellness/)

---

*Want to be featured in a future Community Spotlight? [Let us know](https://discord.gg/ferni) what you're building.*
