# Ferni Design System Portal

**URL:** https://design.ferni.ai

The official documentation site for the Ferni Design System. Browse tokens, components, and patterns for building human-centered AI experiences.

## Features

- **Foundations** - Colors, typography, spacing, animation tokens
- **Personas** - Color palettes for each AI persona (Ferni, Peter, Maya, Alex, Jordan, Nayan)
- **Components** - Buttons, cards, glass surfaces, avatars, toasts
- **Guidelines** - Accessibility, tone of voice, motion principles

## Development

```bash
# Install dependencies
npm install

# Start dev server (port 8083)
npm run dev

# Build for production
npm run build
```

## Deployment

From the root of the monorepo:

```bash
ferni deploy design-system
```

Or manually:

```bash
npm run build
firebase deploy --only hosting:ferni-design-system
```

## Design System Integration

CSS tokens are auto-generated from `design-system/tokens/`. To update:

```bash
# From monorepo root
pnpm tokens:sync
```

This syncs tokens to all portals:
- `apps/website/design-system-portal/src/css/tokens.css`
- `apps/website/developers-portal/src/css/tokens.css`
- `apps/website/marketplace-portal/src/css/tokens.css`
- `apps/website/ferni-website/css/design-tokens.css`

## Theme

- **Theme:** Cedar Night (Midnight) - Dark mode for developers
- **Primary:** #584840 (Cedar)
- **Accent:** #d4a84a (Gold)
- **Font:** Plus Jakarta Sans (headings), Inter (body), JetBrains Mono (code)

## Firebase Hosting

- **Site ID:** ferni-design-system
- **Domain:** design.ferni.ai

## Directory Structure

```
design-system-portal/
├── src/
│   ├── _includes/
│   │   └── layouts/
│   │       └── base.njk          # Base layout template
│   ├── _data/                    # Eleventy data files
│   ├── css/
│   │   ├── tokens.css            # Design tokens (auto-generated)
│   │   ├── components.css        # Component styles
│   │   └── docs.css              # Documentation styles
│   ├── pages/
│   │   ├── colors.njk
│   │   ├── typography.njk
│   │   ├── spacing.njk
│   │   ├── animation.njk
│   │   └── personas.njk
│   └── index.njk                 # Home page
├── _site/                        # Build output
├── .eleventy.js                  # Eleventy config
├── firebase.json                 # Firebase hosting config
├── .firebaserc                   # Firebase project config
├── package.json
└── README.md
```
