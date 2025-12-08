# 🎬 Ferni Narrative System

> "Every frame, every sound, every touch tells a story."

The Narrative System is Ferni's cinematic brain - it coordinates all animation, audio, haptic, and visual systems to create cohesive emotional journeys.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     NARRATIVE DIRECTOR                              │
│              (The Pixar Story Department)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │
│  │   Story     │   │  Narrative  │   │    Beat     │               │
│  │    Arcs     │──▶│   Context   │──▶│   History   │               │
│  └─────────────┘   └─────────────┘   └─────────────┘               │
│         │                │                                          │
│         ▼                ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    BEAT ORCHESTRATION                        │   │
│  │  (Coordinates all subsystems for each story beat)           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ├──────────────┬──────────────┬──────────────┐             │
│         ▼              ▼              ▼              ▼             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │  Emotion  │  │  Ferni    │  │  Pixar    │  │  Ritual   │       │
│  │   State   │  │  Moments  │  │  Reaction │  │  Engine   │       │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘       │
│         │              │              │              │             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │   Glow    │  │  Kinetic  │  │  Persona  │  │   Audio   │       │
│  │Controller │  │Typography │  │   Magic   │  │  Engine   │       │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘       │
│         │              │              │              │             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │  Haptics  │  │  Weather  │  │  Living   │  │  Avatar   │       │
│  │  Service  │  │  Effects  │  │   Logo    │  │  Feedback │       │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Story Beats

A **story beat** is a meaningful moment in the user journey. Each beat triggers a coordinated response across all systems.

```typescript
import { playBeat } from './narrative/index.js';

// Play a story beat
await playBeat('connected');
await playBeat('small_win');
await playBeat('breakthrough');
await playBeat('empathy_moment');
```

**Available Beats:**

| Category | Beats |
|----------|-------|
| **Journey** | `first_launch`, `welcome_back`, `daily_return`, `streak_continues`, `streak_broken` |
| **Connection** | `connecting`, `connected`, `connection_lost`, `reconnected` |
| **Conversation** | `user_starts_speaking`, `user_stops_speaking`, `ferni_starts_speaking`, `ferni_stops_speaking`, `thinking`, `long_pause`, `deep_thought` |
| **Emotional** | `user_vulnerable`, `user_frustrated`, `user_excited`, `user_sad`, `breakthrough`, `empathy_moment` |
| **Achievement** | `small_win`, `big_win`, `milestone_reached`, `goal_completed`, `skill_improved` |
| **Team** | `persona_introduced`, `persona_handoff`, `team_unlock`, `team_huddle_start` |
| **Time** | `morning_greeting`, `evening_wind_down`, `late_night`, `weekend_mode` |
| **Special** | `birthday`, `anniversary`, `holiday`, `custom_moment` |

### Story Arcs

A **story arc** is a sequence of beats that tells a complete micro-narrative.

```typescript
import { getNarrativeDirector, BREAKTHROUGH_ARC } from './narrative/index.js';

const director = getNarrativeDirector();

// Start an arc
director.startArc({
  id: 'my_breakthrough',
  name: 'User Breakthrough',
  beats: BREAKTHROUGH_ARC.beats,
});

// Or use pre-defined arcs
import { getSuggestedArc } from './narrative/index.js';

const arc = getSuggestedArc({
  conversations: 10,
  streak: 5,
  timeOfDay: 'morning',
  isFirstLaunch: false,
});
```

**Pre-defined Arcs:**

- `first_launch` - Welcome new users
- `welcome_back` - Greet returning users
- `deep_conversation` - Handle vulnerable moments
- `breakthrough` - Celebrate realizations
- `goal_completion` - Celebrate completed goals
- `meet_team_member` - Introduce new personas
- `persona_handoff` - Smooth persona transitions
- `morning_greeting` / `evening_wind_down` / `late_night` - Time-aware greetings
- `birthday` / `anniversary` - Special celebrations
- `frustration_support` / `sadness_support` - Emotional support

### Narrative Context

The context informs how beats are orchestrated.

```typescript
import { updateNarrativeContext, getNarrativeDirector } from './narrative/index.js';

// Update context
updateNarrativeContext({
  personaId: 'maya',
  userEmotion: 'excited',
  conversationDepth: 0.7,
  streakCount: 14,
  totalConversations: 50,
});

// Context-aware greeting
const director = getNarrativeDirector();
await director.greeting(); // Picks appropriate beat based on context
```

## Beat Orchestration

Each beat triggers a coordinated response:

```typescript
// What happens when 'breakthrough' is played:
{
  emotion: 'excited',           // Set character emotion
  moment: 'lightbulb',          // Trigger Ferni moment (💡 appears)
  reaction: 'celebrate',        // Pixar reaction animation
  glow: 'celebrate',            // Glow controller pulse
  haptic: 'milestone',          // Haptic feedback
  ritual: 'big_win',            // Full ritual (audio + visual + haptic)
}
```

## Integration with Existing Systems

### Animation Orchestrator

```typescript
import { playPixarReaction, animatePersonaTransition } from '../ui/animation-orchestrator.ui.js';

// Called automatically by narrative beats
// But can also be triggered directly
playPixarReaction('celebrate');
```

### Ferni Moments

```typescript
import { triggerMoment } from '../ui/ferni-moments.ui.js';

// 50+ moment types available
triggerMoment('lightbulb');    // 💡 Idea
triggerMoment('hearts');       // ❤️ Love
triggerMoment('coffee');       // ☕ Morning
triggerMoment('streakFire');   // 🔥 Streak
```

### Emotion State

```typescript
import { transitionEmotion, setEmotion } from '../emotion/emotion-state.js';

// Smooth transition
transitionEmotion('excited', { duration: 0.3 });

// Immediate set
setEmotion('calm');
```

### Ritual Engine

```typescript
import { triggerRitual } from '../services/ritual-engine.service.js';

// Multi-sensory orchestrated moment
await triggerRitual('big_win', { 
  message: 'You did it!',
  personaId: 'ferni',
});
```

### Glow Controller

```typescript
import { getGlowController } from '../services/glow-controller.service.js';

const glow = getGlowController();
glow.startBreathing();
glow.celebrate(800);
glow.switchPersona('maya');
```

## Example: Full User Journey

```typescript
import { getNarrativeDirector, updateNarrativeContext } from './narrative/index.js';

const director = getNarrativeDirector();

// User opens app in the morning
updateNarrativeContext({
  totalConversations: 25,
  streakCount: 7,
  timeOfDay: 'morning',
});

// Play context-aware greeting
await director.greeting(); // Plays 'streak_continues' + celebration

// User starts talking
await director.userStartsSpeaking();

// User shares something vulnerable
await director.playBeat('user_vulnerable');

// Ferni responds with empathy
await director.empathyMoment();

// User has a breakthrough!
await director.breakthrough();

// Session ends with a win
await director.smallWin('Great session today!');
```

## Best Practices

### 1. Let Context Drive Beats

```typescript
// ✅ Good - context determines response
await director.greeting();

// ❌ Avoid - hardcoded regardless of context
await director.playBeat('morning_greeting');
```

### 2. Don't Over-Celebrate

```typescript
// ✅ Good - proportional response
if (isMinorAchievement) {
  await director.smallWin();
} else {
  await director.bigWin();
}

// ❌ Avoid - everything is EPIC
await director.bigWin(); // for every little thing
```

### 3. Respect Emotional State

```typescript
// ✅ Good - empathy first
if (context.userEmotion === 'sad') {
  await director.playBeat('user_sad');
  await director.empathyMoment();
}

// ❌ Avoid - ignore emotions
await director.playBeat('celebration'); // when user is sad
```

### 4. Use Arcs for Sequences

```typescript
// ✅ Good - cohesive sequence
director.startArc(DEEP_CONVERSATION_ARC);

// ❌ Avoid - random beats
await director.playBeat('user_vulnerable');
await director.playBeat('celebration'); // jarring!
await director.playBeat('thinking');
```

## Adding New Beats

1. Add to `StoryBeat` type in `narrative-director.ts`
2. Add orchestration to `BEAT_ORCHESTRATIONS`
3. Optionally add to relevant story arcs

```typescript
// 1. Add type
export type StoryBeat = 
  | ... existing ...
  | 'my_new_beat';

// 2. Add orchestration
const BEAT_ORCHESTRATIONS = {
  ...existing,
  my_new_beat: {
    emotion: 'happy',
    moment: 'sparkle',
    glow: 'pulse',
    haptic: 'success',
  },
};
```

## Performance Considerations

- Beats are **non-blocking by default** (parallel execution)
- Use `blocking: true` for sequences that must complete
- Animation budget is managed by `animation-orchestrator.ui.ts`
- Reduced motion is respected throughout

---

*"The details are not the details. They make the design."* — Charles Eames

