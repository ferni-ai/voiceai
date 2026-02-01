# Persona Development

> **We believe in making AI human, and the decisions we make will reflect that.**

Personas are the heart of Ferni's human AI experience. Each persona should feel like a real person with genuine character, not a corporate chatbot. See `../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## Reference Docs
- Full guide: `docs/creating-personas.md`
- Cognitive profiles: `docs/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md`
- Example bundles: `bundles/ferni/`, `bundles/maya-santos/`

## Bundle Structure
```
bundles/{persona-id}/
├── persona.manifest.json      # Required: configuration
├── identity/
│   ├── biography.md           # Background story, experiences
│   └── system-prompt.md       # Core personality prompt
└── content/
    ├── behaviors/
    │   ├── greetings.json     # Opening lines
    │   └── backchannels.json  # "mm-hmm", "I see"
    ├── stories/
    │   └── anecdotes.json     # Personal stories to share
    └── knowledge/
        └── expertise.json     # Domain knowledge
```

## Manifest Required Fields
```json
{
  "identity": {
    "id": "persona-id",          // kebab-case, unique
    "name": "Display Name",
    "tagline": "Brief description"
  },
  "voice": {
    "provider": "cartesia",
    "voice_id": "voice-uuid-here"
  },
  "personality": {
    "warmth": 0.8,               // 0-1 scale
    "humor_level": 0.4,
    "formality": 0.3,
    "traits": ["empathetic", "curious", "grounded"]
  },
  "knowledge": {
    "domains": ["wellness", "productivity"],
    "outOfScopeTopics": ["medical-diagnosis", "legal-advice"]
  },
  "cognitive": {
    "profile": "analytical"      // See cognitive-profiles.ts
  }
}
```

## Cognitive Profiles
Defined in `src/personas/cognitive-profiles.ts`:
- `narrative` - Story-driven reasoning (Ferni)
- `analytical` - Data-driven, pattern recognition (Peter)
- `systematic` - Process-oriented, structured (Alex)
- `empathetic` - Emotion-first, relationship-focused (Maya)
- `pragmatic` - Action-oriented, solution-focused (Jordan)
- `intuitive` - Wisdom-based, contemplative (Nayan)

## Rules

### Do
- Use manifest.json for all configuration
- Create rich backstory in biography.md
- Define clear domain boundaries
- Test persona with multiple conversation flows
- Add to persona registry after creation

### Don't
- Create persona-specific tools (tools are agent-agnostic)
- Hardcode persona logic in services
- Skip cognitive profile (affects reasoning style)
- Duplicate content from other personas
- Use generic/bland personality traits

## Persona Colors (Brand)
| Persona | Primary | CSS Variable |
|---------|---------|--------------|
| Ferni | `#4a6741` | `--color-ferni` |
| Peter | `#3a6b73` | `--color-peter` |
| Alex | `#5a6b8a` | `--color-alex` |
| Maya | `#a67a6a` | `--color-maya` |
| Jordan | `#c4856a` | `--color-jordan` |
| Nayan | `#b8956a` | `--color-nayan` |

> **Note:** `--color-jack` (`#9a7b5a`, "Warm Cedar") is a legacy brand color still used in some UI components. It's not a persona color.

## Handoff Transition Config
```json
"handoff": {
  "transition": {
    "style": "warm",    // warm | standard | dramatic | subtle
    "emoji": "",        // Empty = auto-derive from role/domains
    "sound": "connect", // Sound file for handoff
    "delay_multiplier": 1.0
  }
}
```

**Emoji derivation:** When `emoji` is empty (`""`), the `agent-directory.ts` derives it:
- Coordinator → 🎯
- Research/invest domains → 📈
- Wisdom/philosophy → 🧘
- Communication/email → 📧
- Budget/habits → 💰
- Planning/milestone → 🎉
- Default → ✨

## Module Structure

Beyond bundles, the personas module contains supporting infrastructure:

```
personas/
├── bundles/                      # Persona content bundles (see bundles/CLAUDE.md)
├── registry/                     # Persona registry
│   └── persona-registry-impl.ts  # Registry implementation
├── shared/                       # Shared persona utilities
│   ├── persona-turn-personality.ts
│   └── team-chemistry.ts
├── __tests__/                    # 6+ test files
├── cognitive-advanced/           # Advanced cognitive module
│
├── # Core Files
├── index.ts                      # Main exports
├── types.ts                      # Persona type definitions
├── persona-ids.ts                # Persona ID constants
├── agent-directory.ts            # Agent directory for handoffs
├── voice-registry.ts             # Voice registry
├── id-mapping.ts                 # ID mapping utilities
│
├── # Cognitive System (8 files)
├── cognitive-profiles.ts         # Base cognitive profiles
├── cognitive-types.ts            # Cognitive type definitions
├── cognitive-index.ts            # Cognitive index
├── cognitive-intelligence.ts     # Cognitive intelligence engine
├── cognitive-persistence.ts      # Cognitive data persistence
├── cognitive-differentiation.ts  # Cognitive differentiation
├── cognitive-quirks.ts           # Personality quirks
├── cognitive-advanced.ts         # Advanced cognitive features
├── collaborative-cognition.ts    # Multi-persona cognitive collaboration
│
├── # Behaviors & Greetings
├── greetings.ts                  # Greeting generation
├── compositional-greetings.ts    # Compositional greeting builder
├── alive-entrances.ts            # Dynamic entrance behaviors
├── voice-emotion-entrances.ts    # Emotion-driven entrances
├── behaviors.ts                  # Behavior system
├── dynamic-responses.ts          # Dynamic response generation
├── easter-eggs.ts                # Easter egg behaviors
├── theatrical.ts                 # Theatrical moments
│
├── # Moment & Silence
├── meaningful-silence/           # Meaningful silence detection
├── meaningful-silence.ts         # Silence interpretation
├── moment-detection.ts           # Moment detection engine
├── unified-moment-detection.ts   # Unified moment detection
│
├── # Team & Support
├── team/                         # Team coordination
├── generic-advisor/              # Generic advisor persona
├── wellness-coach/               # Wellness coach persona
├── base-identity.ts              # Base identity template
└── _archived/                    # Archived files
```

## Adding a New Persona

1. Create bundle directory: `bundles/{persona-id}/`
2. Create `persona.manifest.json` with required fields
3. Write `identity/biography.md` and `identity/system-prompt.md`
4. Add voice ID to `src/config/voice-ids.ts`
5. Register in `src/personas/registry/persona-registry-impl.ts`
6. Add color to design tokens if needed
7. Test with: `pnpm dev -- --persona={persona-id}`

---

*Last updated: January 2026*
