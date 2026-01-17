# 🎨 Ferni Design System Figma Plugin

> **Specification for a Figma plugin that brings Ferni's design tokens and components to designers.**

**Version**: Planning  
**Created**: January 2026  
**Status**: RFC (Request for Comments)

---

## Vision

A Figma plugin that:
1. **Syncs tokens** - Design tokens always up to date with code
2. **Enforces consistency** - Prevents off-brand designs
3. **Previews motion** - See animations before implementation
4. **Exports correctly** - Generate code-ready specifications

### Why a Plugin?

| Problem | Solution |
|---------|----------|
| Token drift between design and code | Real-time sync from JSON source |
| Inconsistent color usage | Color validation and suggestions |
| Hard to communicate motion | Animation previews |
| Manual handoff errors | Automatic spec generation |

---

## Features Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Ferni Design System                              [⚙️] [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [🎨 Tokens] [👤 Personas] [✨ Motion] [📐 Export] [🔍 Lint]│
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TOKENS TAB:                                                │
│                                                             │
│  Colors                                                     │
│  ├─ Persona Colors                                          │
│  │   ├─ Ferni    #4a6741  [Apply]                          │
│  │   ├─ Peter    #3a6b73  [Apply]                          │
│  │   └─ ...                                                 │
│  ├─ Semantic Colors                                         │
│  │   ├─ Text Primary   #2C2520  [Apply]                    │
│  │   └─ ...                                                 │
│  └─ Background Colors                                       │
│                                                             │
│  Typography                                                 │
│  ├─ Display Large  [Apply]                                  │
│  ├─ Body           [Apply]                                  │
│  └─ ...                                                     │
│                                                             │
│  Spacing                                                    │
│  ├─ space-1 (4px)  [Apply]                                  │
│  └─ ...                                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Tab 1: Tokens

### Token Browser

Browse and apply design tokens directly to selections.

```
TOKENS
├─ Colors
│   ├─ Persona Colors
│   │   ├─ Ferni      #4a6741  [🎨] [📋]
│   │   ├─ Peter      #3a6b73  [🎨] [📋]
│   │   ├─ Alex       #5a6b8a  [🎨] [📋]
│   │   ├─ Maya       #a67a6a  [🎨] [📋]
│   │   ├─ Jordan     #c4856a  [🎨] [📋]
│   │   └─ Nayan      #b8956a  [🎨] [📋]
│   ├─ Semantic
│   │   ├─ Text Primary    #2C2520
│   │   ├─ Text Secondary  #5C544A
│   │   ├─ Text Muted      #8A847A
│   │   └─ ...
│   ├─ Background
│   │   ├─ Background      #FFFCF8
│   │   ├─ Elevated        #FFFFFF
│   │   └─ Overlay         rgba(44,37,32,0.4)
│   └─ Status
│       ├─ Success
│       ├─ Warning
│       └─ Error
│
├─ Typography
│   ├─ Display Large   Plus Jakarta Sans / 48 / Bold
│   ├─ Display Medium  Plus Jakarta Sans / 36 / Bold
│   ├─ Body           Inter / 16 / Regular
│   ├─ Body Large     Inter / 18 / Regular
│   └─ Label          Inter / 14 / Medium
│
├─ Spacing
│   ├─ space-1    4px
│   ├─ space-2    8px
│   ├─ space-3    12px
│   ├─ space-4    16px
│   ├─ space-6    24px
│   └─ ...
│
└─ Radius
    ├─ radius-sm   4px
    ├─ radius-md   8px
    ├─ radius-lg   16px
    └─ radius-full 9999px
```

### Actions

- **[🎨]** Apply as fill/stroke to selection
- **[📋]** Copy token name to clipboard
- **[Apply]** Apply typography style to text
- **Search** Filter tokens by name

### Token Sync

```
┌─────────────────────────────────────────────────────────────┐
│  Token Sync Status                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ Tokens synced                                           │
│  Last updated: 2 hours ago                                  │
│  Source: design-system/tokens/*.json                        │
│                                                             │
│  [↻ Sync Now]    [⚙️ Configure Source]                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Tab 2: Personas

### Persona Switcher

Apply complete persona themes to frames.

```
┌─────────────────────────────────────────────────────────────┐
│  PERSONAS                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ╭──────────╮  ╭──────────╮  ╭──────────╮                  │
│  │   🟢     │  │   🟦     │  │   🟪     │                  │
│  │  Ferni   │  │  Peter   │  │   Alex   │                  │
│  │ Selected │  │          │  │          │                  │
│  ╰──────────╯  ╰──────────╯  ╰──────────╯                  │
│                                                             │
│  ╭──────────╮  ╭──────────╮  ╭──────────╮                  │
│  │   🟫     │  │   🟧     │  │   🟤     │                  │
│  │   Maya   │  │  Jordan  │  │  Nayan   │                  │
│  │          │  │          │  │          │                  │
│  ╰──────────╯  ╰──────────╯  ╰──────────╯                  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  PERSONA DETAILS: Ferni                                     │
│                                                             │
│  Primary:    #4a6741                                        │
│  Secondary:  #3d5a35                                        │
│  Glow:       rgba(74, 103, 65, 0.4)                         │
│                                                             │
│  Animation Timing:  1.0x                                    │
│  Easing:            spring                                  │
│  Voice:             Warm, curious                           │
│                                                             │
│  [Apply to Selection]   [Create Persona Frame]              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Apply Persona

Applies persona colors to:
- Selected frame backgrounds
- Text colors
- Button fills
- Glow effects

### Create Persona Frame

Creates a new frame with:
- Persona-colored background gradient
- Avatar placeholder
- Correctly styled text layers

---

## Tab 3: Motion

### Animation Preview

Preview animations before implementation.

```
┌─────────────────────────────────────────────────────────────┐
│  MOTION                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  EASING CURVES                                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                      │  │
│  │      ╭────────────────╮                              │  │
│  │     ╱                  ╲                             │  │
│  │    ╱                    ╲───────────────             │  │
│  │───╱                                                  │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ● spring       ○ bounce      ○ gentle                     │
│  ○ elastic      ○ standard    ○ anticipate                 │
│                                                             │
│  Duration: [300ms ▼]                                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  PREVIEW                                                    │
│                                                             │
│  [■ Start] ──────────────────────────── [■ End]            │
│                                                             │
│  [▶ Play]   [🔄 Loop]                                       │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  PRESETS                                                    │
│                                                             │
│  ├─ buttonPress      [Preview]                              │
│  ├─ buttonHover      [Preview]                              │
│  ├─ modalEnter       [Preview]                              │
│  ├─ modalExit        [Preview]                              │
│  ├─ celebration      [Preview]                              │
│  ├─ avatarBreathe    [Preview]                              │
│  └─ handoff          [Preview]                              │
│                                                             │
│  [Apply to Smart Animate]                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Easing Curve Editor

- Interactive curve visualization
- Drag control points
- Preview motion in real-time
- Copy CSS/JSON values

### Animation Presets

Pre-defined animation specifications:
- Button interactions
- Modal transitions
- Avatar states
- Celebration effects

### Apply to Smart Animate

Generates prototype connections with correct timing.

---

## Tab 4: Export

### Spec Export

Export design specifications for developers.

```
┌─────────────────────────────────────────────────────────────┐
│  EXPORT                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SELECTION: Frame "Conversation Screen"                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  EXPORT FORMAT                                              │
│                                                             │
│  ○ CSS Variables                                            │
│  ● JSON Tokens                                              │
│  ○ Swift (iOS)                                              │
│  ○ Kotlin (Android)                                         │
│  ○ React Component                                          │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  PREVIEW                                                    │
│                                                             │
│  ```json                                                    │
│  {                                                          │
│    "component": "ConversationScreen",                       │
│    "tokens": {                                              │
│      "background": "var(--color-background)",               │
│      "avatar": {                                            │
│        "persona": "ferni",                                  │
│        "size": 200,                                         │
│        "state": "idle"                                      │
│      },                                                     │
│      "spacing": {                                           │
│        "padding": "var(--space-4)"                          │
│      }                                                      │
│    }                                                        │
│  }                                                          │
│  ```                                                        │
│                                                             │
│  [📋 Copy]   [💾 Download]   [📤 Send to Dev]               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Export Formats

| Format | Use Case |
|--------|----------|
| CSS Variables | Web development |
| JSON Tokens | Universal |
| Swift | iOS development |
| Kotlin | Android development |
| React Component | Direct code generation |

---

## Tab 5: Lint

### Design Linter

Check designs against brand guidelines.

```
┌─────────────────────────────────────────────────────────────┐
│  LINT                                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Run Lint on Selection]   [Run Lint on Page]               │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  RESULTS (3 issues found)                                   │
│                                                             │
│  ❌ ERROR: Off-brand color                                  │
│     Layer: "Button/Fill"                                    │
│     Found: #7B68EE (purple)                                 │
│     Expected: Ferni palette color                           │
│     [Fix] [Ignore]                                          │
│                                                             │
│  ⚠️ WARNING: Non-standard font                              │
│     Layer: "Title"                                          │
│     Found: Helvetica                                        │
│     Expected: Plus Jakarta Sans or Inter                    │
│     [Fix] [Ignore]                                          │
│                                                             │
│  ⚠️ WARNING: Non-standard spacing                           │
│     Layer: "Card"                                           │
│     Found: 15px padding                                     │
│     Nearest token: space-4 (16px)                           │
│     [Fix] [Ignore]                                          │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ✅ Passed: 47 checks                                       │
│                                                             │
│  [Fix All]   [Export Report]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Lint Rules

| Rule | Severity | Description |
|------|----------|-------------|
| Off-brand color | Error | Color not in Ferni palette |
| Non-standard font | Warning | Font not in typography system |
| Non-standard spacing | Warning | Spacing not a design token |
| Missing contrast | Error | Text contrast < 4.5:1 |
| Oversized file | Warning | Image > 500KB |
| Missing alt text | Warning | Image without description |

### Auto-fix

One-click fixes for common issues:
- Snap colors to nearest token
- Apply typography styles
- Round spacing to tokens

---

## Technical Implementation

### Plugin Architecture

```typescript
// Main plugin entry
figma.showUI(__html__, { width: 320, height: 600 });

// Listen for messages from UI
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'apply-color':
      applyColor(msg.tokenName, msg.color);
      break;
    case 'apply-typography':
      applyTypography(msg.style);
      break;
    case 'run-lint':
      const results = await runLint();
      figma.ui.postMessage({ type: 'lint-results', results });
      break;
    case 'export-spec':
      const spec = generateSpec(figma.currentPage.selection);
      figma.ui.postMessage({ type: 'spec-generated', spec });
      break;
  }
};
```

### Token Sync

```typescript
// Fetch tokens from design-system repo
async function syncTokens() {
  const response = await fetch(
    'https://raw.githubusercontent.com/ferni/design-system/main/tokens/colors.json'
  );
  const tokens = await response.json();
  await figma.clientStorage.setAsync('tokens', tokens);
  return tokens;
}
```

### Lint Engine

```typescript
interface LintResult {
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  node: SceneNode;
  suggestion?: string;
  autoFix?: () => void;
}

async function runLint(): Promise<LintResult[]> {
  const results: LintResult[] = [];
  const selection = figma.currentPage.selection;
  
  for (const node of selection) {
    // Check colors
    results.push(...checkColors(node));
    // Check typography
    results.push(...checkTypography(node));
    // Check spacing
    results.push(...checkSpacing(node));
    // Check accessibility
    results.push(...checkAccessibility(node));
  }
  
  return results;
}
```

---

## Distribution

### Figma Community

1. Submit to Figma Community
2. Public listing for discoverability
3. Free for all users

### Organization Install

For Ferni team:
1. Admin installs for organization
2. Auto-updates enabled
3. Private token sync URL

---

## Roadmap

### v1.0.0 (MVP)

- [ ] Token browser (colors, typography, spacing)
- [ ] Apply tokens to selection
- [ ] Basic export (CSS, JSON)
- [ ] Sync from GitHub
- [ ] Figma Community listing

### v1.1.0

- [ ] Persona switcher
- [ ] Animation preview
- [ ] Design linter
- [ ] Auto-fix suggestions

### v1.2.0

- [ ] Component library integration
- [ ] Spec export (all formats)
- [ ] Team analytics
- [ ] Slack integration

---

## Usage Guide

### Installing

1. Open Figma
2. Plugins → Browse plugins
3. Search "Ferni Design System"
4. Install

### First Run

1. Open plugin: Plugins → Ferni Design System
2. Plugin will sync tokens automatically
3. Select any layer to start applying tokens

### Daily Workflow

1. **Design** - Use token browser to apply colors/typography
2. **Review** - Run lint to check brand compliance
3. **Export** - Generate specs for developers

---

**© 2026 Ferni. Design tools for emotional intelligence.**

*"Great plugins don't just save time. They enforce quality."*
