# Ferni Developer Portal

**URL:** https://developers.ferni.ai

Premium developer documentation portal built with Eleventy. Dark theme (Cedar Night) optimized for developers.

## Features

- **Home Page** - Hero with animated terminal demo
- **Getting Started** - Interactive 5-minute quickstart guide
- **API Reference** - Complete REST API documentation
- **Developer Console** - API key management (requires auth)

## Development

```bash
# Install dependencies
npm install

# Start dev server (port 8081)
npm run dev

# Build for production
npm run build
```

## Deployment

From the root of the monorepo:

```bash
npm run deploy:developers
```

Or manually:

```bash
npm run build
firebase deploy --only hosting:ferni-developers
```

## Design System

- **Theme:** Cedar Night (Dark)
- **Primary:** #584840 (Cedar)
- **Accent:** #d4a84a (Gold)
- **Font:** JetBrains Mono (code), Plus Jakarta Sans (headings), Inter (body)

## Firebase Hosting

- **Site ID:** ferni-developers
- **Domain:** developers.ferni.ai
