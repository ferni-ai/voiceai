# Ferni Brand Assets

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains Ferni's complete brand guidelines and design system documentation.

---

## Quick Reference

### Primary Colors

| Name | Hex | Use |
|------|-----|-----|
| Ferni Sage | `#4a6741` | Primary brand, Ferni persona |
| Cedar Brown | `#9a7b5a` | Secondary, grounding |
| Ocean Teal | `#3a6b73` | Peter (research) |
| Slate Blue | `#5a6b8a` | Alex (communications) |
| Rose | `#a67a6a` | Maya (wellness) |
| Coral | `#c4856a` | Jordan (celebrations) |
| Warm Gray | `#8a7a6a` | Nayan (wisdom) |

### Typography

- **Display**: Playfair Display (headings, quotes)
- **Body**: Inter (UI, body text)

### Voice & Tone

- Warm, not corporate
- Confident, not arrogant
- Supportive, not pushy
- Personal, not clinical

---

## Documentation Index

### Core Brand

| Doc | Size | Description |
|-----|------|-------------|
| [FERNI-BRAND-GUIDELINES.md](./FERNI-BRAND-GUIDELINES.md) | 18KB | Core brand identity, colors, typography |
| [FERNI-UNIVERSE-BIBLE.md](./FERNI-UNIVERSE-BIBLE.md) | 28KB | Brand universe, personality, storytelling |
| [BRAND-VOICE-GUIDE.md](./BRAND-VOICE-GUIDE.md) | 7KB | Voice, tone, writing style |
| [BRAND-POSITIONING-EXPLORATION.md](./BRAND-POSITIONING-EXPLORATION.md) | 8KB | Market positioning research |

### Design System

| Doc | Size | Description |
|-----|------|-------------|
| [FERNI-SCREEN-GUIDELINES.md](./FERNI-SCREEN-GUIDELINES.md) | 40KB | Complete UI/screen design standards |
| [FERNI-DESIGN-OPS.md](./FERNI-DESIGN-OPS.md) | 22KB | Design operations workflow |
| [FERNI-2025-DESIGN-DIRECTION.md](./FERNI-2025-DESIGN-DIRECTION.md) | 6KB | 2025 design direction |

### Specialized Systems

| Doc | Size | Description |
|-----|------|-------------|
| [BETTER-THAN-HUMAN.md](./BETTER-THAN-HUMAN.md) | 10KB | Superhuman EQ specification |
| [FERNI-SONIC-IDENTITY.md](./FERNI-SONIC-IDENTITY.md) | 20KB | Sound design, audio branding |
| [FERNI-HAPTICS.md](./FERNI-HAPTICS.md) | 17KB | Haptic feedback design |
| [FERNI-SYNESTHESIA.md](./FERNI-SYNESTHESIA.md) | 16KB | Cross-sensory design approach |
| [FERNI-RITUALS.md](./FERNI-RITUALS.md) | 16KB | Brand rituals, ceremonies |

### Visual Guidelines

| Doc | Size | Description |
|-----|------|-------------|
| [FERNI-ILLUSTRATION-SYSTEM.md](./FERNI-ILLUSTRATION-SYSTEM.md) | 16KB | Illustration style guide |
| [FERNI-IMAGERY-GUIDELINES.md](./FERNI-IMAGERY-GUIDELINES.md) | 11KB | Photography, image curation |
| [FERNI-DATA-VISUALIZATION.md](./FERNI-DATA-VISUALIZATION.md) | 18KB | Charts, graphs, data display |
| [FERNI-EMPTY-ERROR-STATES.md](./FERNI-EMPTY-ERROR-STATES.md) | 16KB | Error and empty state design |

### Assets

| Doc | Description |
|-----|-------------|
| [SOUND-ASSET-MANIFEST.md](./SOUND-ASSET-MANIFEST.md) | Sound file inventory |
| [ferni-design-tokens.css](./ferni-design-tokens.css) | CSS design tokens |
| [brand-book.html](./brand-book.html) | Interactive brand book |
| `logos/` | Logo files (SVG, PNG) |
| `icons/` | App and UI icons |
| `favicons/` | Browser favicons |

---

## Usage

### In Frontend Code

Design tokens are available via CSS variables:

```css
color: var(--ferni-sage);
background: var(--color-bg-primary);
font-family: var(--font-display);
```

### In Design Tools

Export assets from `logos/` and `icons/` directories. Use the brand book for color/typography reference.

---

## Related Documentation

| Doc | Location |
|-----|----------|
| Frontend design standards | [`frontend-typescript/CLAUDE.md`](../frontend-typescript/CLAUDE.md) |
| Design system architecture | [`docs/architecture/CINEMATIC-DESIGN-SYSTEM.md`](../docs/architecture/CINEMATIC-DESIGN-SYSTEM.md) |
| Emotion system | [`docs/architecture/FERNI-EMOTION-SYSTEM.md`](../docs/architecture/FERNI-EMOTION-SYSTEM.md) |

---

*Total brand documentation: ~250KB across 18 files*
