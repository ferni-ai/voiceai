# ⚛️ @ferni/react Component Library

> **Specification for the official Ferni React component library.**

**Version**: Planning  
**Created**: January 2026  
**Status**: RFC (Request for Comments)

---

## Vision

A React component library that:
1. **Embodies Ferni** - Every component feels alive and warm
2. **Is production-ready** - Type-safe, accessible, tested
3. **Integrates seamlessly** - Works with any React framework
4. **Scales beautifully** - From single component to full app

### Design Principles

1. **Emotion-first** - Components express, not just display
2. **Composable** - Combine primitives into complex UIs
3. **Accessible** - WCAG AA compliant by default
4. **Performant** - No unnecessary re-renders
5. **Type-safe** - Full TypeScript coverage

---

## Package Structure

```
packages/ferni-react/
├── src/
│   ├── components/
│   │   ├── Avatar/
│   │   │   ├── Avatar.tsx
│   │   │   ├── Avatar.stories.tsx
│   │   │   ├── Avatar.test.tsx
│   │   │   ├── Avatar.styles.ts
│   │   │   └── index.ts
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── Dialog/
│   │   ├── Toast/
│   │   ├── Celebration/
│   │   ├── Input/
│   │   ├── Waveform/
│   │   └── ... (more components)
│   │
│   ├── hooks/
│   │   ├── useFerniTheme.ts
│   │   ├── usePersona.ts
│   │   ├── useCircadian.ts
│   │   ├── useRelationshipDepth.ts
│   │   ├── useAnimation.ts
│   │   ├── useHaptics.ts
│   │   ├── useSound.ts
│   │   └── index.ts
│   │
│   ├── providers/
│   │   ├── FerniProvider.tsx
│   │   ├── ThemeProvider.tsx
│   │   └── index.ts
│   │
│   ├── tokens/
│   │   ├── colors.ts (generated)
│   │   ├── animation.ts (generated)
│   │   ├── typography.ts (generated)
│   │   └── index.ts
│   │
│   ├── utils/
│   │   ├── cn.ts (class name helper)
│   │   ├── motion.ts
│   │   └── accessibility.ts
│   │
│   └── index.ts
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── CHANGELOG.md
```

---

## Core Components

### Avatar

The heart of Ferni - animated persona representation.

```tsx
import { Avatar } from '@ferni/react';

// Basic usage
<Avatar persona="ferni" />

// With all options
<Avatar
  persona="ferni"
  size={200}
  state="listening"
  breathing={true}
  glow={true}
  expression="curious"
  onClick={() => {}}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `persona` | `PersonaId` | `'ferni'` | Which team member |
| `size` | `number` | `200` | Size in pixels |
| `state` | `AvatarState` | `'idle'` | Current state |
| `breathing` | `boolean` | `true` | Enable breathing animation |
| `glow` | `boolean` | `true` | Enable glow ring |
| `expression` | `Expression` | `'neutral'` | Facial expression |
| `onClick` | `() => void` | - | Click handler |
| `className` | `string` | - | Additional classes |

#### States

```typescript
type AvatarState = 
  | 'idle'
  | 'speaking'
  | 'listening'
  | 'thinking'
  | 'celebrating'
  | 'concerned';
```

#### Expressions

```typescript
type Expression =
  | 'neutral'
  | 'happy'
  | 'curious'
  | 'concerned'
  | 'thinking'
  | 'excited'
  | 'sleepy'
  | 'surprised'
  | 'warm';
```

---

### Button

Warm, tactile button with haptic feedback.

```tsx
import { Button } from '@ferni/react';

// Variants
<Button>Default</Button>
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// With icon
<Button icon={<HeartIcon />}>With Icon</Button>

// Loading
<Button loading>Processing...</Button>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'primary' \| 'secondary' \| 'ghost'` | `'default'` | Visual variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size |
| `icon` | `ReactNode` | - | Leading icon |
| `iconRight` | `ReactNode` | - | Trailing icon |
| `loading` | `boolean` | `false` | Loading state |
| `disabled` | `boolean` | `false` | Disabled state |
| `haptic` | `boolean` | `true` | Enable haptic feedback |
| `sound` | `boolean` | `false` | Enable click sound |

---

### Toast

Warm, human notification toast.

```tsx
import { toast, Toaster } from '@ferni/react';

// Add toaster to app root
<Toaster />

// Trigger toasts
toast('Saved!');
toast.success('Done!');
toast.error("Couldn't save that");
toast.info('Processing...');

// With options
toast('Custom toast', {
  duration: 3000,
  persona: 'maya',
  action: {
    label: 'Undo',
    onClick: () => {}
  }
});
```

#### Toaster Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `'top' \| 'bottom'` | `'bottom'` | Position |
| `offset` | `number` | `80` | Distance from edge |
| `maxToasts` | `number` | `3` | Max visible |

---

### Dialog

Centered modal dialog with Ferni's warmth.

```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter } from '@ferni/react';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Action</DialogTitle>
      <DialogDescription>
        Are you sure you want to continue?
      </DialogDescription>
    </DialogHeader>
    
    <DialogBody>
      {/* Content */}
    </DialogBody>
    
    <DialogFooter>
      <Button variant="ghost">Cancel</Button>
      <Button variant="primary">Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### Celebration

Trigger celebrations for wins and milestones.

```tsx
import { Celebration, useCelebration } from '@ferni/react';

// Declarative
<Celebration
  type="smallWin"
  trigger={showCelebration}
  onComplete={() => setShowCelebration(false)}
/>

// Imperative hook
const { celebrate } = useCelebration();

celebrate('smallWin');
celebrate('bigWin');
celebrate('milestone', { streakCount: 7 });
```

#### Types

```typescript
type CelebrationType =
  | 'smallWin'
  | 'bigWin'
  | 'milestone'
  | 'streak'
  | 'teamUnlock';
```

---

### Waveform

Audio visualization for speaking/listening.

```tsx
import { Waveform } from '@ferni/react';

<Waveform
  persona="ferni"
  state="speaking"
  intensity={0.7}
  height={60}
/>
```

---

## Hooks

### useFerniTheme

Access and modify the current theme.

```tsx
import { useFerniTheme } from '@ferni/react';

function Component() {
  const { theme, setTheme, persona, setPersona } = useFerniTheme();
  
  return (
    <div style={{ color: theme.colors.primary }}>
      Current persona: {persona}
    </div>
  );
}
```

### usePersona

Get persona-specific styles and behaviors.

```tsx
import { usePersona } from '@ferni/react';

function Component() {
  const { color, animation, voice } = usePersona('peter');
  
  return (
    <div style={{ 
      backgroundColor: color.primary,
      transition: `all ${animation.duration}ms ${animation.easing}`
    }}>
      Peter's content
    </div>
  );
}
```

### useCircadian

Adapt to time of day.

```tsx
import { useCircadian } from '@ferni/react';

function Component() {
  const { period, warmth, brightness, isNight } = useCircadian();
  
  // period: 'morning' | 'midday' | 'evening' | 'night' | etc.
  // warmth: 0-1 (higher at night)
  // brightness: 0-1 (lower at night)
  
  return (
    <div style={{
      filter: `brightness(${brightness}) sepia(${warmth * 0.1})`
    }}>
      {isNight && <SleepyMode />}
    </div>
  );
}
```

### useRelationshipDepth

Adapt UI based on relationship stage.

```tsx
import { useRelationshipDepth } from '@ferni/react';

function Component() {
  const { 
    stage,           // 1-5
    conversationCount,
    unlockedPersonas,
    showAdvancedFeatures,
    showCallbacks
  } = useRelationshipDepth();
  
  return (
    <div>
      {stage >= 3 && <InsideJokes />}
      {showAdvancedFeatures && <AdvancedSettings />}
    </div>
  );
}
```

### useAnimation

Get animation values and respect motion preferences.

```tsx
import { useAnimation } from '@ferni/react';

function Component() {
  const { 
    duration,
    easing,
    prefersReducedMotion,
    animate
  } = useAnimation();
  
  return (
    <motion.div
      animate={animate ? { scale: 1.1 } : {}}
      transition={{ duration, easing }}
    />
  );
}
```

### useHaptics

Trigger haptic feedback.

```tsx
import { useHaptics } from '@ferni/react';

function Component() {
  const { trigger, isSupported } = useHaptics();
  
  const handleClick = () => {
    trigger('buttonPress');
    // ... handle click
  };
  
  return <button onClick={handleClick}>Click me</button>;
}
```

### useSound

Play sounds from the sonic identity.

```tsx
import { useSound } from '@ferni/react';

function Component() {
  const { play, stop, isPlaying } = useSound();
  
  const handleSuccess = () => {
    play('celebrationSmall');
  };
  
  return <button onClick={handleSuccess}>Complete</button>;
}
```

---

## Provider

Wrap your app with FerniProvider for full functionality.

```tsx
import { FerniProvider } from '@ferni/react';

function App() {
  return (
    <FerniProvider
      userId="user-123"
      initialPersona="ferni"
      enableHaptics={true}
      enableSound={true}
      enableCircadian={true}
    >
      <YourApp />
    </FerniProvider>
  );
}
```

### Provider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `userId` | `string` | - | For relationship tracking |
| `initialPersona` | `PersonaId` | `'ferni'` | Starting persona |
| `enableHaptics` | `boolean` | `true` | Enable haptic feedback |
| `enableSound` | `boolean` | `true` | Enable sounds |
| `enableCircadian` | `boolean` | `true` | Enable time-aware theming |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Color theme |

---

## Styling Approach

### CSS-in-JS with CSS Variables

Components use CSS variables for theming:

```tsx
// Internal component styles
const styles = {
  button: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-text-inverse)',
    borderRadius: 'var(--radius-full)',
    padding: 'var(--space-3) var(--space-6)',
    transition: `all var(--duration-normal) var(--easing-spring)`,
  }
};
```

### Customization via CSS Variables

```css
:root {
  /* Override Ferni defaults */
  --color-ferni: #custom-color;
  --duration-normal: 300ms;
}
```

### className Support

All components accept className for additional styling:

```tsx
<Avatar className="my-custom-avatar" />
```

### Tailwind Compatibility

Works with Tailwind CSS:

```tsx
<Button className="hover:scale-105 shadow-lg" />
```

---

## Bundle Size Goals

| Component | Target Size |
|-----------|-------------|
| Avatar | < 15KB |
| Button | < 3KB |
| Toast | < 5KB |
| Dialog | < 8KB |
| Full library | < 50KB |

### Tree Shaking

Full tree-shaking support:

```tsx
// Only imports Avatar, not entire library
import { Avatar } from '@ferni/react';
```

---

## Testing

### Unit Tests

```tsx
import { render, screen } from '@testing-library/react';
import { Avatar } from '@ferni/react';

test('renders avatar with correct persona', () => {
  render(<Avatar persona="ferni" />);
  expect(screen.getByRole('img')).toHaveAttribute('data-persona', 'ferni');
});
```

### Accessibility Tests

```tsx
import { axe } from 'jest-axe';

test('has no accessibility violations', async () => {
  const { container } = render(<Button>Click me</Button>);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

## Storybook

Every component has stories:

```tsx
// Avatar.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Avatar } from './Avatar';

const meta: Meta<typeof Avatar> = {
  title: 'Components/Avatar',
  component: Avatar,
  argTypes: {
    persona: {
      control: 'select',
      options: ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'],
    },
  },
};

export default meta;

export const Default: StoryObj<typeof Avatar> = {
  args: {
    persona: 'ferni',
    size: 200,
  },
};

export const AllPersonas: StoryObj<typeof Avatar> = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      {['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'].map(p => (
        <Avatar key={p} persona={p} size={80} />
      ))}
    </div>
  ),
};

export const States: StoryObj<typeof Avatar> = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      {['idle', 'speaking', 'listening', 'thinking', 'celebrating'].map(s => (
        <Avatar key={s} persona="ferni" state={s} size={100} />
      ))}
    </div>
  ),
};
```

---

## Distribution

### NPM Package

```bash
npm install @ferni/react

# Or
pnpm add @ferni/react
```

### CDN (UMD)

```html
<script src="https://unpkg.com/@ferni/react"></script>
```

### Package.json

```json
{
  "name": "@ferni/react",
  "version": "1.0.0",
  "description": "Ferni Design System for React",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./styles.css": "./dist/styles.css"
  },
  "files": ["dist"],
  "sideEffects": ["*.css"],
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  }
}
```

---

## Roadmap

### v1.0.0 (MVP)

- [ ] Avatar component
- [ ] Button component
- [ ] Toast component
- [ ] Dialog component
- [ ] FerniProvider
- [ ] Basic hooks (usePersona, useAnimation)
- [ ] Storybook documentation
- [ ] 100% TypeScript coverage
- [ ] Accessibility audit

### v1.1.0

- [ ] Celebration component
- [ ] Waveform component
- [ ] Input component
- [ ] Card component
- [ ] useHaptics, useSound hooks
- [ ] useCircadian hook

### v1.2.0

- [ ] Full component library
- [ ] useRelationshipDepth hook
- [ ] Server component support
- [ ] React Native (web) compatibility

---

**© 2026 Ferni. Components with soul.**

*"A component library isn't just code. It's the embodiment of a brand's promise."*
