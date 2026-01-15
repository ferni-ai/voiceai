# Frontend UI Components

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains all UI components for the Ferni web app. Our UI should feel warm, human, and delightful - never cold or corporate.

---

## Quick Reference

| What | Where |
|------|-------|
| Design System | `design-system-integration.ts` |
| Color System | `color/` |
| Typography | `typography/` |
| Visualizations | `visualizations/` |
| Storytelling | `storytelling/` |

---

## Directory Structure

```
ui/
├── color/                    # Color intelligence system
├── typography/               # Typography system
├── visualizations/           # Data visualizations
│   └── voice-reactive/       # Voice-reactive visuals
├── storytelling/             # Narrative UI
├── admin/                    # Admin UI
├── dev-panel/                # Developer tools
├── marketplace/              # Agent marketplace UI
├── trust-journey/            # Trust progression UI
├── voice-journal/            # Voice journaling UI
├── creative-you/             # Creative features
├── ferni-care/               # Care features
├── founders-journey/         # Founder experience
├── icons/                    # Icon components
├── journey/                  # Journey views
├── music-dashboard/          # Music controls
├── wizard/                   # Setup wizards
└── *.ui.ts                   # Individual components
```

---

## UI Component Pattern

Components follow a consistent pattern:

```typescript
// my-feature.ui.ts
import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING } from '../../config/animation-constants.js';

const log = createLogger('MyFeatureUI');

export class MyFeatureUI {
  private container: HTMLElement | null = null;
  
  constructor() {
    this.cleanupOrphanedElements(); // HMR protection
    this.create();
  }
  
  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.my-feature').forEach(el => el.remove());
  }
  
  private create(): void {
    this.container = document.createElement('div');
    this.container.className = 'my-feature';
    // Use CSS variables, not hardcoded values
    this.container.style.background = 'var(--color-background-elevated)';
    document.body.appendChild(this.container);
  }
  
  destroy(): void {
    this.container?.remove();
    this.container = null;
  }
}
```

---

## Key Components

### Avatar & Expression
| Component | Purpose |
|-----------|---------|
| `avatar-soul.ui.ts` | Main avatar rendering |
| `avatar-feedback.ui.ts` | Avatar feedback states |
| `avatar-tap-reactions.ui.ts` | Tap interactions |
| `expressive-eyes.ui.ts` | Eye expressions |
| `breathing-guide.ui.ts` | Breathing animation |

### Conversation
| Component | Purpose |
|-----------|---------|
| `transcript.ui.ts` | Conversation transcript |
| `message.ui.ts` | Individual messages |
| `thinking.ui.ts` | Thinking indicator |
| `speaking-system.ui.ts` | Speaking states |

### Team & Personas
| Component | Purpose |
|-----------|---------|
| `team.ui.ts` | Team view |
| `team-intro.ui.ts` | Team introductions |
| `persona-intro.ui.ts` | Persona introduction |
| `persona-transition.ui.ts` | Handoff transitions |
| `cameo-roster.ui.ts` | Cameo appearances |

### Features
| Component | Purpose |
|-----------|---------|
| `engagement.ui.ts` | Engagement features |
| `celebrations.ui.ts` | Celebration effects |
| `predictions.ui.ts` | Prediction displays |
| `insight-cards.ui.ts` | Insight cards |

### Settings
| Component | Purpose |
|-----------|---------|
| `spotify.ui.ts` | Spotify controls |
| `calendar-view.ui.ts` | Calendar integration |
| `manage-subscription.ui.ts` | Subscription management |
| `video-settings.ui.ts` | Video settings |

---

## Design System Integration

### Colors (NEVER hardcode!)

```typescript
// ❌ WRONG
element.style.background = '#4a6741';

// ✅ CORRECT
element.style.background = 'var(--color-ferni)';
element.style.background = 'var(--persona-primary)';
```

### Animation Constants

```typescript
import { DURATION, EASING } from '../../config/animation-constants.js';

element.animate(keyframes, {
  duration: DURATION.SLOW,      // 300ms
  easing: EASING.SPRING,        // Bounce effect
});
```

### Typography

```typescript
element.style.fontFamily = 'var(--font-body)';
element.style.fontSize = 'var(--text-base)';
```

---

## HMR Protection (Required!)

Every UI class MUST handle Hot Module Replacement:

```typescript
class MyUI {
  constructor() {
    this.cleanupOrphanedElements(); // REQUIRED!
    this.create();
  }
  
  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.my-ui-class').forEach(el => el.remove());
  }
}
```

---

## Modal Pattern

All modals should be centered with backdrop blur:

```typescript
const modal = document.createElement('div');
modal.className = 'ferni-modal';
modal.innerHTML = `
  <div class="modal-backdrop"></div>
  <div class="modal-card">
    <header>
      <span class="eyebrow">SECTION</span>
      <h2>Title</h2>
      <button class="close-btn" aria-label="Close">×</button>
    </header>
    <div class="content">...</div>
  </div>
`;
```

---

## Rules

### Do ✅
- Use CSS variables for all colors
- Use animation constants
- Include HMR cleanup
- Use semantic HTML
- Add ARIA labels
- Use `createLogger()` for logging

### Don't ❌
- Hardcode hex colors
- Hardcode animation durations
- Use `console.log`
- Skip HMR protection
- Use inline styles for theming
- Create side-panel modals (use centered)

---

## Subdirectory Docs

- Color System: `color/CLAUDE.md`
- Typography: `typography/CLAUDE.md`
- Visualizations: `visualizations/CLAUDE.md`
- Voice-Reactive: `visualizations/voice-reactive/CLAUDE.md`
- Storytelling: `storytelling/CLAUDE.md`

---

## Reference Docs

- Frontend: `../../CLAUDE.md`
- Design System: `design-system/CLAUDE.md`
- Animation Constants: `config/animation-constants.ts`
- Brand Guidelines: `design-system/docs/brand/`

---

*Last updated: January 2026*
