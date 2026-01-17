# @ferni/react

React components with emotional intelligence built in. Part of the Ferni Design System.

## Installation

```bash
npm install @ferni/react
# or
pnpm add @ferni/react
```

## Quick Start

```tsx
import { Avatar, Button, FerniProvider } from '@ferni/react';

function App() {
  return (
    <FerniProvider>
      <Avatar persona="ferni" size={200} breathing glow />
      <Button>Hello World</Button>
    </FerniProvider>
  );
}
```

## Components

### Avatar
The heart of Ferni - animated persona representations with Luxo-style eyes.

```tsx
import { Avatar } from '@ferni/react';

<Avatar 
  persona="ferni"     // ferni | peter | alex | maya | jordan | nayan
  size={200}          // pixels
  state="speaking"    // idle | speaking | listening | thinking | celebrating
  expression="happy"  // neutral | happy | curious | concerned | thinking | excited
  breathing           // enable breathing animation
  glow                // enable presence ring
/>
```

### Button
Haptic-enabled button with brand-compliant styling.

```tsx
import { Button } from '@ferni/react';

<Button 
  variant="primary"   // primary | secondary | ghost | destructive
  size="md"           // sm | md | lg
  loading             // show loading state
>
  Click me
</Button>
```

### Toast
Human-friendly notifications.

```tsx
import { Toaster, toast } from '@ferni/react';

// Add Toaster to your app root
<Toaster />

// Show toasts
toast.success('Saved!');
toast.info('Just a moment...');
toast.warning('Add a name first');
toast.error("Couldn't connect. Try again?");
```

### Dialog
Centered modal with backdrop blur.

```tsx
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button } from '@ferni/react';

<Dialog open={isOpen} onClose={() => setOpen(false)}>
  <DialogHeader>
    <h2>Title</h2>
  </DialogHeader>
  <DialogBody>
    Content goes here
  </DialogBody>
  <DialogFooter>
    <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
    <Button onClick={handleConfirm}>Confirm</Button>
  </DialogFooter>
</Dialog>
```

### Celebration
Particle effects for achievements.

```tsx
import { Celebration, useCelebration } from '@ferni/react';

// Using the hook
const { trigger, celebrate } = useCelebration();

<Button onClick={() => celebrate('bigWin')}>Celebrate!</Button>
<Celebration type="bigWin" trigger={trigger} />

// Available types: smallWin | bigWin | milestone | streak | teamUnlock
```

### Waveform
Audio visualization with persona colors.

```tsx
import { Waveform, useAudioIntensity } from '@ferni/react';

<Waveform 
  persona="ferni"
  state="speaking"    // idle | listening | speaking | thinking
  intensity={0.7}     // 0-1
  height={60}
/>
```

## Hooks

### usePersona
Get persona configuration.

```tsx
import { usePersona, useAllPersonas } from '@ferni/react';

const persona = usePersona('ferni');
// persona.color.primary === '#4a6741'
// persona.animation.timingMultiplier === 1.0

const allPersonas = useAllPersonas();
// Array of all 6 personas
```

### useAnimation
Animation values with reduced motion support.

```tsx
import { useAnimation, useAnimationPreset, DURATION, EASING } from '@ferni/react';

const { duration, easing, animate } = useAnimation('normal', 'spring');
const celebration = useAnimationPreset('celebration');

// Use directly
element.animate(keyframes, {
  duration: animate ? DURATION.slow : 0,
  easing: EASING.spring,
});
```

### useCircadian
Time-of-day design adaptation.

```tsx
import { useCircadian, useGreeting } from '@ferni/react';

const { period, warmth, brightness, isNight } = useCircadian();
// period: 'morning' | 'afternoon' | 'evening' | 'night' | ...
// warmth: 0-1 (higher at night)
// isNight: boolean (8pm-7am)

const greeting = useGreeting();
// "Good morning" | "Good afternoon" | "Good evening" | ...
```

## Tokens

All design tokens are exported for direct use:

```tsx
import { 
  personas,           // All 6 persona configs
  colors,             // Semantic colors
  duration,           // Animation durations
  easing,             // CSS easing functions
  spacing,            // Spacing scale
  typography,         // Font families, sizes, weights
  shadow,             // Box shadows
  radius,             // Border radii
  microExpressions,   // Ferni EQ timing
  activeListening,    // Nod parameters
  celebrationColors,  // Particle colors by type
} from '@ferni/react';
```

## Brand Guidelines

This library implements the Ferni brand guidelines:

- **Luxo-style eyes**: White orbs with NO pupils - expression comes from lid position
- **Warm palette**: Earthy greens, terracotta, gold - no purple or neon
- **Human language**: Toasts use contractions, no "please" or "successfully"
- **Gentle motion**: Spring easings, Pixar-inspired timing

## License

MIT © Ferni AI
