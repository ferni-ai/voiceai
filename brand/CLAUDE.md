# Ferni Brand Library

**Interactive brand showcase** with HTML galleries, expression demos, and visual references.

> **Full doc index**: See `INDEX.md` for complete navigation of all 80+ brand docs

## Quick Links

| Need | Go To |
|------|-------|
| **Brand guidelines** | `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md` |
| **Better Than Human spec** | `design-system/docs/brand/BETTER-THAN-HUMAN.md` |
| **UI/screen standards** | `design-system/docs/brand/FERNI-SCREEN-GUIDELINES.md` |
| **Voice/tone** | `design-system/docs/brand/BRAND-VOICE-GUIDE.md` |
| **Design tokens (JSON)** | `design-system/tokens/` |
| **Growth strategy** | `brand/evolution/README.md` (16 docs) |
| **All docs map** | `brand/INDEX.md` |

## Critical Design Rules

### LUXO-STYLE EYES (MANDATORY)

**ALL Ferni avatar eyes MUST be opaque white with NO pupils.**

This is inspired by Pixar's Luxo Jr. lamp character. The eyes are solid white ellipses - expression comes entirely from the eye SHAPE (scaleX, scaleY transforms), NOT from pupils.

```svg
<!-- CORRECT: Luxo-style opaque white eyes -->
<ellipse cx="36" cy="48" rx="7" ry="9" fill="white"/>
<ellipse cx="64" cy="48" rx="7" ry="9" fill="white"/>

<!-- WRONG: Never add pupils -->
<ellipse cx="36" cy="50" rx="3.5" ry="4.5" fill="#2c2520"/>  <!-- DELETE THIS -->
<circle cx="70" cy="92" r="10" fill="#2c2520"/>              <!-- DELETE THIS -->
```

**Why this matters:**
- Creates a distinctive, memorable character design
- Matches the Pixar Luxo Jr. lamp that inspired Ferni
- Emotions are conveyed through eye shape transforms, not pupil position
- Keeps the design clean and non-creepy

**When creating or modifying avatars:**
1. Eyes are ONLY white ellipses
2. Add comment `<!-- LUXO STYLE: opaque white eyes, no pupils -->`
3. Remove any circles or ellipses with `fill="#2c2520"` inside eyes
4. Expression animation uses CSS transforms on the eye shape

### Design Token Source of Truth

All colors, spacing, and typography come from `master-tokens.css`. Never hardcode values.

```html
<!-- CORRECT -->
<link rel="stylesheet" href="master-tokens.css">
color: var(--color-ferni);

<!-- WRONG -->
color: #4a6741;
```

### Persona Colors

| Persona | Variable | Hex |
|---------|----------|-----|
| Ferni | `--color-ferni` | #4a6741 |
| Maya | `--color-maya` | #a67a6a |
| Peter | `--color-peter` | #3a6b73 |
| Jordan | `--color-jordan` | #c4856a |
| Alex | `--color-alex` | #5a6b8a |
| Nayan | `--color-nayan` | #b8956a |

## File Structure

```
brand/                         # Interactive showcases (this folder)
├── INDEX.md                   # Complete documentation index (START HERE)
├── CLAUDE.md                  # AI agent design rules (LUXO eyes!)
├── README.md                  # Quick start
│
├── characters/                # Per-persona expression galleries (6 personas)
│   ├── ferni/expressions.html
│   ├── maya/expressions.html
│   └── ... (alex, jordan, peter, nayan)
│
├── evolution/                 # Growth & strategy docs (16 docs, ~7K lines)
│   ├── README.md              # Categorized navigation
│   ├── BETTER-THAN-HUMAN-MANIFESTO.md
│   ├── COMMUNITY-PLAYBOOK.md
│   └── ... (14 more)
│
├── visualizations/            # Data visualization system
│   ├── components/            # 12 viz components
│   └── mock-data/             # Sample data templates
│
├── motion/                    # Animation system
├── marketing/                 # Marketing pages & templates
├── investor/                  # Investor materials
├── capabilities/              # 19 superhuman capabilities
├── docs/                      # Content strategy (blog, calendar)
└── specs/                     # Technical specifications

design-system/                 # Source of truth
├── tokens/                    # JSON design tokens (EDIT THESE)
├── assets/                    # Consolidated logos, icons
└── docs/brand/                # Canonical brand DOCUMENTATION (28 docs)
```

## Quick Reference

| Resource | Location |
|----------|----------|
| Expression Gallery | `characters/ferni/expressions.html` |
| Motion Demo | `motion/demo.html` |
| Capabilities | `capabilities/index.html` |
| Universe Bible | `design-system/docs/brand/FERNI-UNIVERSE-BIBLE.md` |
| Full Doc Index | `INDEX.md` |

## Documentation by Category

| Category | Count | Location |
|----------|-------|----------|
| Core Brand | 5 | `design-system/docs/brand/` |
| Design System | 5 | `design-system/docs/brand/` |
| Superhuman Experience | 5 | Split across both |
| Sensory Design | 6 | `design-system/docs/brand/` |
| Visual Guidelines | 5 | `design-system/docs/brand/` |
| Motion & Animation | 3 | `brand/motion/` |
| Growth & Strategy | 16 | `brand/evolution/` |
| Data Visualization | 6 | `brand/visualizations/` |
| Marketing | 6 | Split across both |
| Technical Specs | 4 | Split across both |
| **Total** | **~80** | See `INDEX.md` for full map |
