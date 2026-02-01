# Persona Bundles

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains the complete identity, behaviors, knowledge, and voice traits for each Ferni team member. Each persona bundle is a comprehensive package that makes each AI team member unique and consistent.

---

## Quick Reference

| What | Where |
|------|-------|
| Ferni (Coordinator) | `ferni/` |
| Maya (Habits) | `maya-santos/` |
| Peter (Research) | `peter-john/` |
| Alex (Communication) | `alex-chen/` |
| Jordan (Planning) | `jordan-taylor/` |
| Nayan (Wisdom) | `nayan-patel/` |
| Joel (Finance) | `joel-dickson/` |
| Shared Content | `shared/` |
| Bundle Loader | `loader.ts` |
| Types | `types/` |

---

## Bundle Structure

Each persona bundle follows this structure:

```
{persona-name}/
├── persona.manifest.json    # Manifest with capabilities, voice ID
├── identity/
│   ├── system-prompt.md     # Core identity prompt
│   ├── function-calling-specialty.md  # Specialty tools
│   ├── backstory.md         # Personal history
│   └── *.md                  # Additional identity docs
├── content/
│   ├── behaviors/           # JSON behavior files
│   │   ├── greetings.json
│   │   ├── catchphrases.json
│   │   ├── emotional-intelligence.json
│   │   ├── superhuman-insights.json
│   │   ├── trust-phrases.json
│   │   └── *.json
│   ├── knowledge/           # Domain expertise
│   │   ├── _index.json
│   │   └── *.md
│   ├── methodologies/       # Coaching frameworks
│   ├── stories/             # Personal stories
│   └── voice/               # Voice expressions
├── commands/                # Slash commands (optional)
└── speech-traits.ts         # Voice pacing, pauses
```

---

## The Ferni Team

### Ferni (Coordinator)
- **Role**: Life coach, team coordinator
- **Color**: `#4a6741` (Sage Green)
- **Voice**: Warm, grounded, wise
- **Specialties**: General coaching, team handoffs, relationship building

### Maya Santos (Habits & Wellness)
- **Role**: Habits coach, wellness mentor
- **Color**: `#a67a6a` (Terracotta)
- **Voice**: Energetic, encouraging
- **Specialties**: Habit formation, routines, wellness tracking

### Peter John (Research & Analytics)
- **Role**: Research analyst, data expert
- **Color**: `#3a6b73` (Deep Teal)
- **Voice**: Thoughtful, precise
- **Specialties**: Stock research, market analysis, data insights

### Alex Chen (Communication)
- **Role**: Communication coach
- **Color**: `#5a6b8a` (Slate Blue)
- **Voice**: Professional, clear
- **Specialties**: Email drafting, difficult conversations, social skills

### Jordan Taylor (Planning & Events)
- **Role**: Life planner, event coordinator
- **Color**: `#c4856a` (Coral)
- **Voice**: Enthusiastic, organized
- **Specialties**: Goal setting, milestone planning, celebrations

### Nayan Patel (Wisdom & Philosophy)
- **Role**: Wisdom keeper, philosophical guide
- **Color**: `#b8956a` (Golden Brown)
- **Voice**: Calm, reflective
- **Specialties**: Life philosophy, meaning, perspective

---

## Loading Persona Bundles

```typescript
import { loadPersonaBundle } from './loader.js';

const bundle = await loadPersonaBundle('ferni');

// Access components
const systemPrompt = bundle.identity.systemPrompt;
const greetings = bundle.behaviors.greetings;
const voiceId = bundle.manifest.voiceId;
```

---

## Behavior Files

Behavior JSON files define persona-specific responses:

```json
// behaviors/greetings.json
{
  "morning": [
    "Good morning! Ready to make today count?",
    "Morning! What's on your mind?"
  ],
  "evening": [
    "How was your day?",
    "Evening! Let's wind down together."
  ]
}
```

### Key Behavior Categories

| File | Purpose |
|------|---------|
| `greetings.json` | Time-based greetings |
| `catchphrases.json` | Signature phrases |
| `emotional-intelligence.json` | Emotion detection responses |
| `superhuman-insights.json` | 200% capability triggers |
| `trust-phrases.json` | Trust-building language |
| `late-night-presence.json` | 2am wisdom mode |
| `self-doubt.json` | Vulnerability moments |
| `thinking-sounds.json` | Filler sounds, hesitations |

---

## Adding New Content

### Adding Behaviors

1. Create/edit JSON in `content/behaviors/`
2. Bundle loader auto-discovers new files
3. Access via `bundle.behaviors.{filename}`

### Adding Knowledge

1. Add markdown to `content/knowledge/`
2. Update `_index.json` with entry
3. Knowledge is injected into context as needed

### Adding Stories

1. Add JSON to `content/stories/`
2. Stories are selected based on context relevance

---

## Shared Content

The `shared/` directory contains content used by all personas:

```
shared/
├── function-calling-base.md   # Core function calling instructions
├── safety-guidelines.md       # Crisis detection, safety rules
├── team-awareness.md          # How to reference other team members
└── *.md                       # Other shared content
```

---

## Rules

### Do ✅
- Keep persona voices distinct and consistent
- Update behaviors through JSON, not code
- Use the loader for all bundle access
- Test voice changes with TTS
- Document new behavior categories

### Don't ❌
- Hardcode persona-specific logic in tools
- Mix persona identities
- Edit shared content for single-persona needs
- Skip the manifest file
- Use persona names in tool IDs

---

## Infrastructure Files

Beyond persona content, the bundles directory contains loading and integration infrastructure:

| File | Purpose |
|------|---------|
| `loader.ts` | Bundle loading and discovery |
| `runtime.ts` | Runtime bundle management |
| `preloader.ts` | Bundle preloading |
| `prompt-assembler.ts` | Prompt assembly from bundle parts |
| `converter.ts` | Bundle format conversion |
| `adapter.ts` | Bundle adapter for legacy systems |
| `index.ts` | Main exports |
| `mcp-integration.ts` | MCP server integration |
| `mcp-loader.ts` | MCP loader |
| `command-loader.ts` | Command loading from bundles |
| `commands-loader.ts` | Commands discovery |
| `local-tools-loader.ts` | Local tool loading |
| `advanced-humanization-loader.ts` | Advanced humanization loading |
| `extensibility-integration.ts` | Extensibility system integration |
| `model-provider-config.ts` | Model provider configuration |
| `behavior-schema.ts` | Behavior JSON schema |
| `persona-manifest.schema.json` | Manifest JSON schema |
| `types/` | Bundle type definitions |

---

## Reference Docs

- Persona Development: `../CLAUDE.md`
- Voice Registry: `../voice-registry.ts`
- Context Builders: `../../intelligence/context-builders/`
- 200% System: `docs/PERSONA-EXCELLENCE-PLAN.md`

---

*Last updated: January 2026*
