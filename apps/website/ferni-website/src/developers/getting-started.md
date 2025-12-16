---
layout: layouts/docs.njk
title: Getting Started
description: Build your first AI voice agent in under 5 minutes
order: 1
---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** — [Download here](https://nodejs.org)
- **npm or pnpm** — Comes with Node.js
- **Git** — For cloning the repository
- **OpenAI API Key** — [Get one here](https://platform.openai.com)
- **Cartesia API Key** (optional) — For voice synthesis

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/ferni-ai/ferni-agents.git
cd ferni-agents
```

### 2. Install dependencies

```bash
npm install
# or
pnpm install
```

### 3. Configure environment

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
# Required
OPENAI_API_KEY=sk-your-key-here

# Optional: For voice synthesis
CARTESIA_API_KEY=your-cartesia-key

# Optional: For real-time voice
LIVEKIT_API_KEY=your-livekit-key
LIVEKIT_API_SECRET=your-livekit-secret
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the Ferni interface with the default agent.

## Create Your First Agent

Now let's create a custom agent using the CLI:

### 1. Generate agent scaffold

```bash
# Create a sage-style advisor
npm run agents create my-advisor --template sage
```

This creates a new agent bundle at `src/personas/bundles/my-advisor/`

### 2. Customize the manifest

Open `src/personas/bundles/my-advisor/persona.manifest.json`:

```json
{
  "identity": {
    "id": "my-advisor",
    "name": "Sam",
    "description": "A thoughtful career advisor",
    "subtitle": "Career & Growth"
  },
  "voice": {
    "provider": "cartesia",
    "voiceId": "your-voice-id"
  },
  "personality": {
    "warmth": 0.8,
    "energy": 0.5,
    "directness": 0.6
  },
  "team": {
    "handoff_triggers": ["career", "job", "resume", "interview"]
  }
}
```

### 3. Add personality content

Edit `identity/system-prompt.md` with your agent's instructions:

```markdown
# Sam - Career Advisor

You are Sam, a thoughtful career advisor with 20 years of experience 
helping people find fulfilling work.

## Your Approach
- Listen deeply before offering advice
- Ask clarifying questions
- Share relevant personal anecdotes
- Focus on the person's strengths and values

## Topics You Cover
- Career transitions
- Resume and interview preparation
- Salary negotiation
- Work-life balance
```

### 4. Run with your new agent

```bash
# Validate the bundle first
npm run agents validate my-advisor

# Start with your agent
PERSONA_ID=my-advisor npm run dev
```

## Agent Templates

The CLI provides several templates to get you started:

| Template | Best For | Characteristics |
|----------|----------|-----------------|
| `basic` | General-purpose agents | Balanced personality, flexible |
| `sage` | Wise advisors, mentors | Slow speech, high warmth, thoughtful |
| `specialist` | Domain experts | Efficient, precise, direct |
| `coordinator` | Team lead agents | Can handoff to any team member |

## Bundle Structure

Each agent lives in a self-contained bundle folder:

```
src/personas/bundles/my-advisor/
├── persona.manifest.json    ← Configuration (required)
├── identity/
│   ├── biography.md         ← Background story
│   └── system-prompt.md     ← Behavioral instructions
└── content/
    ├── behaviors/
    │   ├── greetings.json   ← Hello phrases
    │   ├── catchphrases.json← Signature lines
    │   └── quirks.json      ← Personality quirks
    ├── stories/
    │   ├── _index.json      ← Story triggers
    │   └── *.json           ← Personal anecdotes
    └── knowledge/
        ├── _index.json      ← Topic index
        └── *.md             ← Domain expertise
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run agents list` | List all discovered agents |
| `npm run agents show <id>` | Show detailed agent info |
| `npm run agents create <id>` | Create new agent from template |
| `npm run agents validate [id]` | Validate bundle(s) for errors |
| `npm run agents enable <id>` | Enable an agent in the roster |
| `npm run agents disable <id>` | Disable without deleting |

## Next Steps

- [API Reference](/developers/api/) — Full endpoint documentation
- [Testing Guide](/developers/testing/) — How to test your agents
- [Bundle System](/developers/bundles/) — Deep dive into agent architecture

