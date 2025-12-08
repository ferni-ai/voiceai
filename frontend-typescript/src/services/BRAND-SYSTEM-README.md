# 🌟 Ferni Brand System

> "We believe in making AI human, and every pixel, sound, and touch should reflect that."

The Ferni Brand System is a comprehensive, multi-sensory experience layer that creates emotional connections through coordinated audio, haptics, visuals, and ritual moments.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Brand System Entry                         │
│                    (brand-system.ts)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Audio     │  │   Haptics    │  │     Glow     │          │
│  │   Engine     │  │   Service    │  │  Controller  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                    ┌──────┴───────┐                            │
│                    │   Ritual     │                            │
│                    │   Engine     │                            │
│                    └──────┬───────┘                            │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                 │                   │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐          │
│  │ Celebration  │  │ Empty State  │  │   Toast      │          │
│  │     UI       │  │     UI       │  │     UI       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { initializeBrandSystem, triggerRitual } from './services/brand-system.js';

// Initialize after first user interaction (required for audio)
document.addEventListener('click', async () => {
  await initializeBrandSystem({
    attachGlowTo: document.querySelector('.avatar-container'),
    autoWireLifecycle: true,
  });
}, { once: true });

// Trigger rituals manually
await triggerRitual('small_win', { message: 'Great job!' });
```

## Services

### 🔊 Audio Engine (`ferni-audio.service.ts`)

Full-featured audio playback with preloading, ducking, and category-based volume control.

```typescript
import { getFerniAudioEngine } from './services/ferni-audio.service.js';

const audio = getFerniAudioEngine();
await audio.initialize();

// Play a sound
await audio.play('celebration.small');

// Category volumes
audio.setCategoryVolume('ambient', 0.5);

// Ducking for speech
audio.duck();    // Reduce ambient
audio.unduck();  // Restore ambient
```

**Sound Categories:**
- `system` - App sounds (startup, connection)
- `celebration` - Wins and milestones
- `notification` - Gentle alerts
- `error` - Graceful error sounds
- `ui` - Button presses, toggles
- `handoff` - Persona transitions
- `persona` - Character entrance themes
- `ambient` - Background atmosphere

### 📳 Haptics Service (`haptics.service.ts`)

Touch feedback vocabulary for emotional connection.

```typescript
import { HapticsService } from './services/haptics.service.js';

const haptics = HapticsService.getInstance();

// Basic patterns
haptics.play('tap');
haptics.play('doubleTap');
haptics.play('celebration');

// Persona-specific
haptics.playPersonaSignature('ferni');

// Emotion-responsive
haptics.playForEmotion('happy');
haptics.playForEmotion('thoughtful');
```

**Available Patterns:**
- Basic: `tap`, `softTap`, `doubleTap`, `press`, `bump`
- Emotional: `warmWelcome`, `empathy`, `encouragement`, `celebration`
- System: `success`, `error`, `notification`, `thinking`
- Persona: `ferniBreath`, `presence`, `sparkle`, `milestone`

### ✨ Glow Controller (`glow-controller.service.ts`)

Organic, breathing glow effects that make Ferni feel alive.

```typescript
import { getGlowController } from './services/glow-controller.service.js';

const glow = getGlowController();
glow.attach(avatarElement);

// Modes
glow.startBreathing();
glow.setSpeaking(true);
glow.setListening(true);
glow.setThinking(true);

// Persona colors
glow.switchPersona('ferni');
glow.switchPersona('jack');

// Voice sync
glow.updateVoiceAmplitude(0.7);

// Celebration pulse
glow.celebrate(800);
```

### 🎭 Ritual Engine (`ritual-engine.service.ts`)

Orchestrates multi-sensory brand moments.

```typescript
import { getRitualEngine, wireRitualEngineToApp } from './services/ritual-engine.service.js';

const ritual = getRitualEngine();
await ritual.initialize();

// Wire to app lifecycle (automatic triggers)
wireRitualEngineToApp();

// Manual triggers
await ritual.appWake();
await ritual.connectionStart();
await ritual.personaEntrance('ferni', 'Ferni');
await ritual.smallWin('You did it!');
await ritual.bigWin('Major milestone!');
await ritual.milestone('First Week Complete');
await ritual.streak(7);
await ritual.teamUnlock('maya', 'Maya Santos');
await ritual.deepMoment('grateful');
```

**Ritual Types:**
| Type | Description | Includes |
|------|-------------|----------|
| `app_wake` | First open of the day | Glow + Audio + Haptic |
| `connection_start` | LiveKit connected | Audio + Glow pulse + Haptic |
| `connection_end` | Session ending | Audio + Haptic + Glow fade |
| `persona_entrance` | Persona arrives | Glow switch + Audio + Haptic |
| `persona_handoff` | Transition | Full sequence |
| `small_win` | Quick achievement | Audio + Haptic + Glow + Visual |
| `big_win` | Major achievement | Audio + Haptic + Glow + Confetti |
| `milestone` | Progress marker | Audio + Haptic + Glow + Visual |
| `streak` | Consistency | Audio + Haptic + Glow + Visual |
| `team_unlock` | New persona | Audio + Haptic + Glow + Confetti |
| `deep_moment` | Breakthrough | Haptic + Glow pulse + Audio |

## UI Components

### 🎉 Celebration UI (`celebration.ui.ts`)

Beautiful celebration moments with confetti.

```typescript
import { getCelebrationUI, celebrate } from './ui/celebration.ui.js';

// Full config
await celebrate({
  type: 'big_win',
  title: 'Amazing!',
  subtitle: 'You completed your first week',
  showConfetti: true,
});

// Quick helpers
const ui = getCelebrationUI();
await ui.smallWin('Nice!');
await ui.bigWin('Incredible!', 'Keep going');
await ui.milestone('100 Conversations');
await ui.streak(30);
await ui.teamUnlock('Maya Santos');
```

### 🌱 Empty State UI (`empty-state.ui.ts`)

Warm, human empty states that feel like invitations.

```typescript
import { getEmptyStateUI } from './ui/empty-state.ui.js';

const ui = getEmptyStateUI();

// In a container
ui.showIn(container, {
  type: 'no_conversations',
  onAction: () => startConversation(),
});

// Quick helpers
const element = ui.noConversations(() => start());
const loading = ui.loading('Preparing your experience...');
const error = ui.error(() => retry(), () => getHelp());
const offline = ui.offline(() => checkConnection());
```

**State Types:**
- `no_conversations` - Fresh start
- `no_history` - Journey begins
- `no_goals` - Goal setting invitation
- `no_team` - Team growing
- `loading` - Breathing loader
- `search_empty` - No results
- `offline` - Connection lost
- `error` - Graceful recovery
- `permission_needed` - Microphone access
- `coming_soon` - Future feature

## App Lifecycle Events

The ritual engine listens for these custom events:

```typescript
// Connection
document.dispatchEvent(new CustomEvent('ferni:connected'));
document.dispatchEvent(new CustomEvent('ferni:disconnected'));

// Personas
document.dispatchEvent(new CustomEvent('ferni:switch-persona', {
  detail: { personaId: 'maya', personaName: 'Maya Santos' }
}));

document.dispatchEvent(new CustomEvent('ferni:handoff', {
  detail: { from: 'ferni', to: 'jack', toName: 'Jack' }
}));

// Celebrations
document.dispatchEvent(new CustomEvent('ferni:small-win', {
  detail: { message: 'Great answer!' }
}));

document.dispatchEvent(new CustomEvent('ferni:big-win', {
  detail: { message: 'Week complete!' }
}));

document.dispatchEvent(new CustomEvent('ferni:milestone', {
  detail: { name: '50 Conversations' }
}));

document.dispatchEvent(new CustomEvent('ferni:streak', {
  detail: { count: 7 }
}));

document.dispatchEvent(new CustomEvent('ferni:team-unlock', {
  detail: { personaId: 'peter', personaName: 'Peter John' }
}));

document.dispatchEvent(new CustomEvent('ferni:deep-moment', {
  detail: { emotion: 'grateful' }
}));

document.dispatchEvent(new CustomEvent('ferni:thinking-of-you'));
```

## Design Tokens

The brand system uses CSS variables from `design-system/tokens/`:

```css
/* Persona colors */
--persona-primary
--persona-secondary
--persona-glow
--persona-tint

/* Animation */
--duration-fast: 100ms
--duration-normal: 200ms
--duration-slow: 300ms
--duration-celebration: 800ms

/* Easing */
--ease-spring
--ease-gentle
--ease-standard
```

## Adding New Rituals

1. Add the ritual type to `RitualType` union
2. Create the sequence in `RITUAL_SEQUENCES`
3. Add a helper method if commonly used
4. Wire to a custom event if needed

```typescript
// In ritual-engine.service.ts

// 1. Add type
export type RitualType = 
  | ... existing ...
  | 'new_ritual';

// 2. Add sequence
const RITUAL_SEQUENCES = {
  ...existing,
  new_ritual: {
    id: 'new_ritual',
    name: 'New Ritual',
    description: 'What it does',
    steps: [
      { type: 'audio', action: 'sound.id' },
      { type: 'haptic', action: 'pattern' },
      { type: 'glow', action: 'celebrate' },
    ],
  },
};

// 3. Add helper
async newRitual(context?: RitualContext): Promise<void> {
  await this.trigger('new_ritual', context);
}

// 4. Wire event in wireRitualEngineToApp()
document.addEventListener('ferni:new-ritual', () => {
  engine.newRitual();
});
```

## Accessibility

- All animations respect `prefers-reduced-motion`
- Haptics can be disabled via config
- Audio has category-based volume control
- Empty states include ARIA attributes
- Celebration cards are announced via `aria-live`

## Testing

```typescript
// In dev panel or tests
import { triggerRitual } from './services/brand-system.js';

// Test all rituals
await triggerRitual('app_wake');
await triggerRitual('small_win');
await triggerRitual('big_win');
await triggerRitual('milestone');
// etc.
```

---

Built with ❤️ by the Ferni team

