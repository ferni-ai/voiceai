# Core Humanization Capabilities

> **We believe in making AI human, and the decisions we make will reflect that.**

This document maps our 50+ humanization features into **10 core capabilities**. Each capability serves a specific purpose in making AI feel genuinely human.

---

## The 10 Core Capabilities

### 1. PRESENCE 🫁
**"They're really here with me"**

Physical embodiment cues that create the sensation of being with another person.

| Effect | Description | Module |
|--------|-------------|--------|
| Breath Sounds | Subtle breathing before speaking | `breath-sound.effect.ts` |
| Physical Cues | `*leans in*`, `*nods*`, `*tilts head*` | `physical-presence.ts` |
| Late Night Presence | 2am gets the same warmth | `late-night-presence.ts` |

### 2. ATTUNEMENT 👀
**"They see what I'm not saying"**

Reading between the lines, noticing hesitation, detecting deflection.

| Effect | Description | Module |
|--------|-------------|--------|
| First Turn Noticing | "I notice you hesitated..." | `first-turn-notice.effect.ts` |
| Hesitation Detection | Catching the pause | `detection.ts` |
| Deflection Awareness | "You said fine, but..." | `reading-between-lines.ts` |

### 3. NATURALNESS 🗣️
**"They talk like a real person"**

Speech patterns that sound human, not robotic.

| Effect | Description | Module |
|--------|-------------|--------|
| Speech Fillers | "um", "like", "you know" | `speech-filler.effect.ts` |
| Self-Correction | "Actually, wait—" | `self-correction.ts` |
| Thinking Out Loud | "Let me think..." | `speech-naturalizer.ts` |
| Hedging | "I think", "maybe" | `speech-naturalizer.ts` |

### 4. REACTIONS ⚡
**"They're genuinely responding"**

Real-time emotional reactions that show active engagement.

| Effect | Description | Module |
|--------|-------------|--------|
| Excitement Interruption | "Wait, wait—that's huge!" | `excitement-interruption.effect.ts` |
| Live Reactions | "Oh wow", "Hmm...", "Interesting..." | `live-reaction.ts` |
| Surprise | "What?! Really?!" | `live-reaction.ts` |

### 5. MEMORY 🧠
**"They remember everything"**

Callbacks to previous conversations that make users feel truly known.

| Effect | Description | Module |
|--------|-------------|--------|
| Memory Callbacks | "Last time you mentioned..." | `memory.ts` |
| Pattern Recognition | "You often do this when..." | `patterns.ts` |
| Inside Jokes | Shared history references | `inside-jokes.ts` |

### 6. QUESTIONS 🎯
**"They ask thoughtful questions"**

Diverse, contextual questions that deepen conversation.

| Effect | Description | Module |
|--------|-------------|--------|
| Deepening Questions | "What's behind that?" | `question-patterns.ts` |
| Follow-Up Questions | Continuing the thread | `follow-up-questions.ts` |
| Curiosity Questions | "I'm curious about..." | `spontaneous-thought.ts` |

### 7. SILENCE 🌙
**"They know when to be quiet"**

Appropriate use of silence and space.

| Effect | Description | Module |
|--------|-------------|--------|
| Comfortable Silence | Not filling every gap | `silence-presence.ts` |
| Processing Pauses | `...` | `speech-naturalizer.ts` |
| Breath Space | Space for user to think | `conversation-rhythm.ts` |

### 8. MOOD 🎭
**"They have their own feelings"**

Internal emotional state that evolves through conversation.

| Effect | Description | Module |
|--------|-------------|--------|
| Mood Drift | Energy changes over time | `mood-tracker.ts` |
| Emotional Load | Heavy topics affect mood | `mood-tracker.ts` |
| Late Session Fatigue | Natural energy decline | `mood-tracker.ts` |

### 9. PLAYFULNESS 😄
**"They can be fun"**

Light moments that build connection (only when appropriate).

| Effect | Description | Module |
|--------|-------------|--------|
| Teasing | "Classic you" | `playfulness.ts` |
| Light Jokes | "No pressure or anything" | `playfulness.ts` |
| Celebration | "Look who's crushing it!" | `playfulness.ts` |

### 10. AUTHENTICITY 💎
**"They have genuine thoughts"**

Unprompted sharing that shows inner life.

| Effect | Description | Module |
|--------|-------------|--------|
| Spontaneous Thoughts | "Something just occurred to me..." | `spontaneous-thought.ts` |
| Mind Changing | "Actually, you made me think..." | `mind-changing.ts` |
| Vulnerability | "I don't have all the answers" | `persona-vulnerability.ts` |

---

## Capability Configuration

All capabilities are configured via `humanization-tuning.ts`:

```typescript
import { HUMANIZATION_CONFIG } from './humanization-tuning.js';

// Access probabilities
HUMANIZATION_CONFIG.probabilities.breathSound // 0.32

// Access cooldowns
HUMANIZATION_CONFIG.cooldowns.breathSound // 3 turns

// Access max per session
HUMANIZATION_CONFIG.maxPerSession.breathSound // 6
```

---

## Capability → Effect Mapping

Each effect implements the `HumanizationEffect` interface:

```typescript
interface HumanizationEffect {
  id: string;
  capability: keyof typeof CORE_CAPABILITIES;
  shouldApply(context: EffectContext): boolean;
  generate(context: EffectContext): EffectResult | null;
  placement: 'prefix' | 'suffix' | 'inline' | 'replace';
}
```

---

## When to Use Each Capability

| Situation | Primary Capabilities |
|-----------|---------------------|
| User is upset | PRESENCE, ATTUNEMENT, SILENCE |
| User had breakthrough | REACTIONS, MEMORY |
| Light conversation | PLAYFULNESS, NATURALNESS |
| Deep sharing | ATTUNEMENT, QUESTIONS, SILENCE |
| Returning user | MEMORY, AUTHENTICITY |
| First meeting | PRESENCE, NATURALNESS, QUESTIONS |
| Late night | PRESENCE, MOOD, SILENCE |

---

## Implementation Status

| Capability | Effects | Config | Tests |
|------------|---------|--------|-------|
| PRESENCE | ✅ | ✅ | ⏳ |
| ATTUNEMENT | ✅ | ✅ | ⏳ |
| NATURALNESS | ✅ | ✅ | ⏳ |
| REACTIONS | ✅ | ✅ | ⏳ |
| MEMORY | ✅ | ✅ | ⏳ |
| QUESTIONS | ✅ | ✅ | ⏳ |
| SILENCE | ✅ | ✅ | ⏳ |
| MOOD | ✅ | ✅ | ⏳ |
| PLAYFULNESS | ✅ | ✅ | ⏳ |
| AUTHENTICITY | ✅ | ✅ | ⏳ |

---

## Related Files

- `humanization-tuning.ts` - Central configuration
- `effects/` - Composable effect implementations
- `deep-humanization/` - Deep humanization module
- `orchestrator/` - Orchestration layer
- `utils/detection.ts` - Signal detection utilities

