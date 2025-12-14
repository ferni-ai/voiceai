# Ferni Design System - Feature Overview

> **"Better Than Human"** - A comprehensive design system for superhuman emotional intelligence.

---

## 🚀 New Features (v2.0)

This document outlines the major enhancements to the Ferni Design System.

---

## 📚 Token Libraries

### Content Templates (`tokens/content-templates.json`)

Brand voice patterns codified as reusable templates:

```typescript
import contentTemplates from '@ferni/design-system/content-templates';

// Get a greeting
const greeting = contentTemplates.greetings.casual[0]; // "Hey."

// Get a celebration phrase
const celebration = contentTemplates.celebrations.bigWin[0]; // "This is huge."

// Get an error message
const error = contentTemplates.errors.unknown;
// "Hmm. Something's not working right. (That's on me, not you.)"
```

**Categories:**

- `greetings` - Casual, returning, time-aware greetings
- `acknowledgments` - Understanding, empathy, validation phrases
- `celebrations` - Small wins, big wins, streaks
- `support` - Distress, holding, setbacks
- `coaching` - Goal setting, reflection, encouragement
- `errorStates` - Connection, microphone, unknown errors
- `emptyStates` - No data messaging
- `personaIntroductions` - Per-persona welcome phrases

---

### Brand Guardrails (`tokens/brand-guardrails.json`)

Machine-readable brand rules for AI/linting:

```typescript
import { brandRules, checkBrandCompliance } from '@ferni/design-system/brand-rules';

// Check text for violations
const result = checkBrandCompliance('Our AI chatbot utilizes NLP...');
// { compliant: false, violations: [...], score: 60 }

// Get forbidden words
console.log(brandRules.forbiddenWords.critical);
// ['chatbot', 'bot', 'AI assistant', ...]

// Check if color is approved
const approved = isColorApproved('#4a6741'); // true (Ferni green)
const bad = isColorApproved('#800080'); // false (purple)
```

---

### Persona Design Kits (`tokens/persona-kits.json`)

Complete design specifications for each persona:

```typescript
import personaKits from '@ferni/design-system/persona-kits';

const ferni = personaKits.personas.ferni;

// Colors
ferni.colors.primary; // "#4a6741"
ferni.colors.glow; // "rgba(74, 103, 65, 0.4)"

// Animation
ferni.animation.timingMultiplier; // 1.0
ferni.animation.breathRate; // 5000ms

// Voice
ferni.voice.greetings; // ["Hey.", "Hi there.", ...]
ferni.voice.tone; // "warm"

// Sonic
ferni.sonic.entranceSound; // "handoff-to-ferni"
ferni.sonic.musicalKey; // "C major"
```

---

### Motion Sequences (`tokens/sequences.json`)

Choreographed multi-step animations:

```typescript
import sequences from '@ferni/design-system/sequences';

const onboarding = sequences.sequences.onboarding_reveal;

// Total duration
onboarding.totalDuration; // 4500ms

// Animation steps
onboarding.steps.forEach((step) => {
  console.log(`${step.element}: ${step.animation} at ${step.delay}ms`);
});
// backdrop: fadeIn at 0ms
// avatar: breatheIn at 400ms
// greeting: typewriter at 1600ms
// ...
```

**Available Sequences:**

- `onboarding_reveal` - First-time user experience
- `connection_establishing` - Voice connection in progress
- `connection_success` - Successfully connected
- `handoff_transition` - Switching between personas
- `celebration_small` - Quick win acknowledgment
- `celebration_big` - Major achievement
- `streak_milestone` - Consistency celebration
- `deep_moment` - Emotional breakthrough
- `session_end` - Graceful goodbye
- `team_unlock` - New persona available
- `error_recovery` - Recovering from error

---

### Responsive Patterns (`tokens/responsive.json`)

Systematic responsive design:

```typescript
import responsive from '@ferni/design-system/responsive';

// Breakpoints
responsive.breakpoints.mobile; // { max: 767, columns: 4, gutter: 16 }
responsive.breakpoints.desktop; // { min: 1024, columns: 12, gutter: 24 }

// Typography scale by breakpoint
responsive.typography.scale.displayXL.mobile; // { size: 48, lineHeight: 1.1 }
responsive.typography.scale.displayXL.desktop; // { size: 96, lineHeight: 1.0 }

// Component behaviors
responsive.components.modal.mobile; // { position: "bottom", animation: "slideUp" }
responsive.components.modal.desktop; // { position: "center", animation: "scaleFade" }
```

---

### Internationalization (`tokens/i18n.json`)

Locale-specific design adjustments:

```typescript
import i18n from '@ferni/design-system/i18n';

// Supported locales
i18n.supportedLocales['ja']; // { direction: "ltr", dateFormat: "YYYY年M月D日", ... }
i18n.supportedLocales['ar']; // { direction: "rtl", ... }

// RTL support
i18n.rtl.cssLogicalProperties.mappings; // { "margin-left": "margin-inline-start", ... }

// CJK typography adjustments
i18n.typography.cjk.adjustments; // { lineHeight: "1.8", letterSpacing: "0.02em" }

// Text expansion factors
i18n.content.textExpansion.expansionFactors.de; // 1.35 (German is 35% longer)
```

---

## 🛠️ Tools & Dashboard

### Design System Health Dashboard

```bash
# Run health check
npm run health

# Output:
# ╔═══════════════════════════════════════════════════════════╗
# ║     🌿 FERNI DESIGN SYSTEM HEALTH REPORT 🌿              ║
# ╠═══════════════════════════════════════════════════════════╣
# ║  OVERALL SCORE: 87/100 (B) ✨                            ║
# ╚═══════════════════════════════════════════════════════════╝
#
# 📊 TOKEN COVERAGE: 92%
# 🎨 BRAND COMPLIANCE: 95/100
# ♿ ACCESSIBILITY: 100/100
# 🧩 COMPONENT ADOPTION: 88%

# JSON output for CI
npm run health:json
```

---

### Token Usage Analytics

```bash
# Analyze token usage
npm run tokens:analyze

# Output:
# 🎨 FERNI TOKEN USAGE ANALYTICS
#
# SUMMARY
# Total Tokens:    156
# Used Tokens:     134
# Usage Rate:      85.9%
#
# 🏆 TOP 10 MOST USED TOKENS
# 1. --color-text-primary     847 uses
# 2. --space-4                623 uses
# ...

# List unused tokens
npm run tokens:unused
```

---

### Interactive Playground

```bash
# Start playground server
npm run playground
# Open http://localhost:3333

# Features:
# - Persona color switcher
# - Animation preview with hover
# - Motion lab (customize duration/easing)
# - Contrast checker (WCAG validation)
# - Copy-to-clipboard for all tokens
```

---

## 📖 Documentation

### Component Decision Trees (`brand/COMPONENT-DECISION-TREES.md`)

Helps developers choose the right component:

```
Do you need to show a persona?
│
├─ In a conversation?
│  └─ ✅ Avatar (full size, with breathing + glow)
│
├─ In a list/selection?
│  └─ ✅ PersonaCard (compact)
│
└─ In profile view?
   └─ ✅ PersonaDetail (expanded)
```

Decision trees for:

- Showing personas
- Celebrating achievements
- Displaying errors/empty states
- Getting user input
- Showing progress
- Modal/overlay content
- Navigation patterns
- Feedback/notifications

---

## 🔌 API Integration

### Brand Rules API

```typescript
import {
  brandRules,
  checkBrandCompliance,
  isColorApproved,
  getRandomPhrase,
  applyBrandReplacements,
  checkContrastRatio,
} from '@ferni/design-system/brand-rules';

// In an AI assistant context
const userCopy = 'Our chatbot utilizes machine learning';
const result = checkBrandCompliance(userCopy);

if (!result.compliant) {
  console.log('Brand violations found:');
  result.violations.forEach((v) => {
    console.log(`- ${v.message}`);
    if (v.suggestion) console.log(`  Suggestion: ${v.suggestion}`);
  });
}

// Auto-fix replacements
const fixed = applyBrandReplacements('User utilizes the platform');
// "you use the platform"

// Get brand-approved phrase
const greeting = getRandomPhrase('greetings', 'casual');
// "Hey." or "Hi there." etc.
```

---

## 🧩 Component Library

### Avatar Component

Living, breathing persona representation with Ferni EQ:

```typescript
import { Avatar, createAvatar } from '@ferni/design-system/components';

// Create avatar
const avatar = createAvatar('#avatar-container', {
  persona: 'ferni',
  size: 200,
  breathing: true,
  glow: true,
  microExpressions: true,
  activeListening: true,
});

// Change state
avatar.setState('listening');
avatar.setState('speaking');
avatar.setState('celebrating');

// Micro-expressions (subliminal 40-150ms)
avatar.playMicroExpression('recognition');
avatar.playMicroExpression('delightFlash');

// Active listening (nodding)
avatar.nod('subtle');

// Special animations
avatar.playJoyBounce();
avatar.curiousTilt();
```

---

### Toast Component

Brand-compliant centered pill notifications:

```typescript
import { toast } from '@ferni/design-system/components';

// Simple usage
toast.success('Saved!');
toast.info('Updated');
toast.warning('Check your input');
toast.error('Something went wrong');

// With options
toast.show({
  message: 'Meeting scheduled!',
  type: 'success',
  duration: 3000,
  dismissible: true,
});

// Dismiss all
toast.dismissAll();
```

---

### Dialog Component

Centered modal dialogs with backdrop blur:

```typescript
import { Dialog, openDialog, confirmDialog } from '@ferni/design-system/components';

// Quick dialog
openDialog({
  eyebrow: 'YOUR SESSION',
  title: 'Time for a break?',
  content: "<p>You've been chatting for 45 minutes.</p>",
  primaryAction: 'Take a break',
  secondaryAction: 'Keep going',
  onPrimaryAction: () => console.log('Break time!'),
});

// Confirmation dialog
const confirmed = await confirmDialog({
  title: 'End session?',
  message: 'Are you sure you want to end this session?',
  confirmText: 'End session',
  cancelText: 'Stay',
  destructive: true,
});
```

---

### Celebration Component

Achievement celebrations with confetti and haptics:

```typescript
import { celebration } from '@ferni/design-system/components';

// Quick celebrations
celebration.smallWin('Nice!');
celebration.bigWin('You did it!');
celebration.streak(7); // "7 day streak!"

// Team unlock
celebration.teamUnlock('peter', 'Peter');

// Deep moment (subtle, no confetti)
celebration.deepMoment();

// Custom celebration
celebration.celebrate({
  type: 'big_win',
  message: 'First week complete!',
  confetti: true,
  sound: true,
  haptic: true,
  personaId: 'ferni',
});
```

---

## 📦 New Package Exports

```typescript
// Core tokens
import '@ferni/design-system/tokens.css'

// TypeScript utilities
import { ... } from '@ferni/design-system/tokens'

// Components (new in v2.0)
import {
  Avatar, createAvatar,
  toast,
  Dialog, openDialog, confirmDialog,
  celebration,
  initFerniComponents,
} from '@ferni/design-system/components'

// Token utilities (new in v2.0)
import {
  getRandomPhrase,
  getTimeAwareGreeting,
  getPersonaIntro,
  getStreakCelebration,
} from '@ferni/design-system/content-utils'

import {
  getPersonaKit,
  getPersonaColors,
  getPersonaDuration,
} from '@ferni/design-system/persona-utils'

import {
  getSequence,
  getSequenceSteps,
  getReducedMotionSequence,
} from '@ferni/design-system/sequence-utils'

import {
  getCurrentBreakpoint,
  getFluidTypography,
  isMobile,
} from '@ferni/design-system/responsive-utils'

// Raw JSON tokens
import brandRules from '@ferni/design-system/brand-rules'
import contentTemplates from '@ferni/design-system/content-templates'
import personaKits from '@ferni/design-system/persona-kits'
import sequences from '@ferni/design-system/sequences'
import responsive from '@ferni/design-system/responsive'
import i18n from '@ferni/design-system/i18n'
```

---

## 🚀 CI/CD Integration

The design system automatically validates on every PR:

```yaml
# .github/workflows/design-system.yml

jobs:
  tokens:
    # Checks for token drift between JSON and generated files

  health:
    # Runs design system health check
    # Fails if score < 70%

  token-analytics:
    # Analyzes token usage across codebase
    # Reports unused tokens

  compliance:
    # Checks for brand violations (forbidden words, colors)

  accessibility:
    # WCAG AA compliance checks
```

---

## 🌐 Documentation Site

Deploy the design system documentation site:

```bash
# Build the site
npm run site:build

# Preview locally
npm run site:dev
# Open http://localhost:3334

# Deploy to Firebase
npm run deploy:design-system
```

**Site Features:**

- Beautiful landing page showcasing the design system
- Interactive playground
- Persona showcase with colors and animations
- Getting started guide
- Token documentation

---

## 🏃 Quick Start

```bash
# Install
npm install @ferni/design-system

# Run health check
npm run health

# Start playground
npm run playground

# Analyze tokens
npm run tokens:analyze

# Build TypeScript utilities
npm run build:tokens

# Preview site
npm run site:dev

# Full validation
npm run validate
```

---

## 📁 New File Structure

```
design-system/
├── tokens/
│   ├── content-templates.json   # 🆕 Brand voice templates
│   ├── brand-guardrails.json    # 🆕 Machine-readable rules
│   ├── persona-kits.json        # 🆕 Complete persona specs
│   ├── sequences.json           # 🆕 Animation choreography
│   ├── responsive.json          # 🆕 Responsive patterns
│   ├── i18n.json               # 🆕 Internationalization
│   └── ... (existing tokens)
├── components/                  # 🆕 Component library
│   ├── index.ts                # Main exports
│   ├── Avatar.ts               # Living avatar with EQ
│   ├── Toast.ts                # Centered pill notifications
│   ├── Dialog.ts               # Modal dialogs
│   └── Celebration.ts          # Achievement celebrations
├── api/
│   └── brand-rules.ts          # 🆕 TypeScript API
├── dashboard/
│   ├── health-metrics.ts       # 🆕 Health dashboard
│   └── token-analytics.ts      # 🆕 Usage analytics
├── dist/                       # 🆕 Generated TypeScript
│   ├── content-templates.ts
│   ├── content-utils.ts
│   ├── persona-kits.ts
│   ├── persona-utils.ts
│   ├── sequences.ts
│   ├── sequence-utils.ts
│   ├── responsive.ts
│   └── responsive-utils.ts
├── playground/
│   └── index.html              # 🆕 Interactive playground
├── site/
│   └── index.html              # 🆕 Documentation site
├── brand/
│   └── COMPONENT-DECISION-TREES.md  # 🆕 Component guide
├── generate-new-tokens.js      # 🆕 Token generator script
├── build-site.js               # 🆕 Site build script
├── firebase.json               # 🆕 Firebase hosting config
└── ...
```

---

## 🎯 Mission Alignment

Every new feature supports our core mission:

> **"We believe in making AI human, and the decisions we make will reflect that."**

| Feature             | How It Supports the Mission               |
| ------------------- | ----------------------------------------- |
| Content Templates   | Ensures warm, human brand voice           |
| Brand Guardrails    | Prevents cold, corporate language         |
| Persona Kits        | Each persona feels like a real friend     |
| Motion Sequences    | Pixar-quality emotional storytelling      |
| Responsive Patterns | Great experience on every device          |
| i18n Tokens         | Human connection across cultures          |
| Health Dashboard    | Keeps us accountable to brand quality     |
| Avatar Component    | Living, breathing presence with Ferni EQ  |
| Toast Component     | Human-friendly notifications (not alerts) |
| Dialog Component    | Centered, calm conversations              |
| Celebration         | Joy when users achieve things             |
| CI/CD Pipeline      | Quality gates on every commit             |
| Doc Site            | Team adoption & understanding             |

---

_"Better than human" means getting these details right._
