# Ferni Marketplace Portal

**URL:** https://marketplace.ferni.ai

Browse and add AI personas to your team. Light theme (Zen Garden) designed for consumers.

## Features

- **Home Page** - Featured carousel, category chips, persona grid
- **Categories** - Browse by category (Health, Life, Career, Creative, etc.)
- **Persona Detail** - Voice samples, personality traits, reviews, Add to Team
- **My Team** - Manage installed personas (requires auth)

## Personas

Currently features 7 marketplace personas:

| Persona | Specialty            | Color   |
| ------- | -------------------- | ------- |
| Eli     | ADHD Coach           | #6B5B95 |
| Marcus  | Sobriety Companion   | #2D5A4A |
| Kenji   | Sleep Guide          | #2C3E50 |
| Carmen  | Parenting Partner    | #D4A373 |
| Amara   | Chronic Illness Ally | #7B6BA8 |
| Sasha   | Creative Catalyst    | #E07B53 |
| Ray     | Career Architect     | #4A5568 |

## Development

```bash
# Install dependencies
npm install

# Start dev server (port 8082)
npm run dev

# Build for production
npm run build
```

## Deployment

From the root of the monorepo:

```bash
npm run deploy:marketplace
```

Or manually:

```bash
npm run build
firebase deploy --only hosting:ferni-marketplace
```

## Design System

- **Theme:** Zen Garden (Light)
- **Primary:** #faf8f5 (Warm Paper)
- **Accent:** #3D5A45 (Ferni Sage)
- **Font:** Plus Jakarta Sans (headings), Inter (body)

## Firebase Hosting

- **Site ID:** ferni-marketplace
- **Domain:** marketplace.ferni.ai
