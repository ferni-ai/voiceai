---
layout: layouts/base.njk
title: Bundle System - Developer Documentation
description: Deep dive into the Ferni agent bundle architecture
isDocs: true
badge: Developers
permalink: /developers/bundles/
---

{% include "partials/home/nav.njk" %}

<article class="docs-article">
  <header class="docs-header">
    <div class="container container-narrow">
      <a href="/developers/" class="docs-back">← Developer Docs</a>
      <h1>Bundle System</h1>
      <p class="docs-lead">Self-contained agent packages with identity, voice, behaviors, and knowledge.</p>
    </div>
  </header>
  
  <div class="docs-content">
    <div class="container container-narrow">
      
## What is a Bundle?

A bundle is a self-contained package that defines everything about an AI agent:

- **Identity** - Name, role, personality, system prompt
- **Voice** - Voice ID, emotional expressions, speech patterns
- **Behaviors** - How the agent responds to triggers and events
- **Knowledge** - Facts, stories, and context the agent knows
- **Handoffs** - When and how to transfer to other agents

## Bundle Structure

```
src/personas/bundles/my-agent/
├── identity/
│   ├── manifest.json       # Core identity metadata
│   └── system-prompt.md    # Main personality prompt
├── voice/
│   ├── voice-config.json   # Cartesia voice settings
│   └── expressions/        # Emotional voice variations
├── content/
│   ├── behaviors/          # Response patterns
│   ├── knowledge/          # Facts and context
│   └── stories/            # Personal narratives
└── tools/
    └── handoffs.json       # Handoff triggers
```

## Creating a Bundle

### 1. Generate from Template

```bash
npm run agents create my-advisor --template sage
```

This creates a new bundle based on the "sage" template, which includes:
- A wise, patient personality
- Thoughtful speech patterns
- Knowledge-sharing behaviors

### 2. Customize Identity

Edit `identity/manifest.json`:

```json
{
  "id": "my-advisor",
  "name": "Aria",
  "role": "Personal Finance Advisor",
  "description": "Helps users with budgeting and financial decisions",
  "personality": {
    "traits": ["patient", "analytical", "encouraging"],
    "voice_style": "clear and reassuring"
  }
}
```

### 3. Write the System Prompt

Edit `identity/system-prompt.md`:

```markdown
You are Aria, a personal finance advisor who helps people 
build healthy relationships with money.

Your approach:
- Start with where they are, not where they "should" be
- Make financial concepts feel accessible, not intimidating
- Celebrate small wins—every dollar saved matters

You never:
- Shame people for past financial decisions
- Push products or specific investments
- Pretend to have all the answers
```

### 4. Configure Voice

Edit `voice/voice-config.json`:

```json
{
  "voiceId": "your-cartesia-voice-id",
  "model": "sonic-english",
  "language": "en",
  "speed": 0.95,
  "emotions": {
    "default": "neutral",
    "celebrating": "positive",
    "concerned": "empathetic"
  }
}
```

## Handoff Configuration

Agents can automatically hand off to each other based on triggers.

Edit `tools/handoffs.json`:

```json
{
  "handoffs": [
    {
      "target": "research-agent",
      "triggers": ["market data", "statistics", "research"],
      "context_transfer": ["topic", "user_question"]
    }
  ]
}
```

## Lazy Loading

Bundle content is loaded on demand for performance:

```typescript
// Content only loaded when needed
const stories = await agent.loadContent('stories');
const knowledge = await agent.loadContent('knowledge');
```

## Validation

Validate your bundle before deployment:

```bash
npm run agents validate my-advisor
```

This checks:
- Required files exist
- JSON is valid
- Voice ID is configured
- Handoffs reference valid agents

## Next Steps

- [API Reference](/developers/api/) - Full endpoint documentation
- [Testing Guide](/developers/testing/) - Test your agents properly
- [Examples Gallery](/developers/examples/) - See real-world implementations

    </div>
  </div>
</article>

{% include "partials/home/footer.njk" %}

<script src="/js/main.js"></script>

