# Website Portals

Collection of Eleventy-based websites deployed to Firebase Hosting.

## Portals

| Portal | URL | Purpose | Theme |
|--------|-----|---------|-------|
| **ferni-website** | ferni.ai | Main marketing site | Light (Zen Garden) |
| **developers-portal** | developers.ferni.ai | API docs, developer console | Dark (Cedar Night) |
| **design-system-portal** | design.ferni.ai | Design system documentation | Dark (Cedar Night) |
| **marketplace-portal** | marketplace.ferni.ai | Browse and install personas | Light (Zen Garden) |

## Structure

```
apps/website/
├── ferni-website/          # Main marketing site
│   ├── src/                # Eleventy source
│   ├── _site/              # Build output
│   ├── css/                # Stylesheets
│   ├── js/                 # JavaScript
│   ├── images/             # Images
│   ├── .eleventy.js        # Eleventy config
│   └── firebase.json       # Firebase config
│
├── developers-portal/      # Developer docs
│   ├── src/
│   ├── _site/
│   └── README.md
│
├── design-system-portal/   # Design system docs
│   ├── src/
│   ├── _site/
│   └── README.md
│
├── marketplace-portal/     # Persona marketplace
│   ├── src/
│   ├── _site/
│   └── README.md
│
└── ferni-landing-page.html # Standalone landing page
```

## Development

```bash
# Each portal has its own dev server

# Main website (port 8080)
cd apps/website/ferni-website
npm install
npm run dev

# Developers portal (port 8081)
cd apps/website/developers-portal
npm run dev

# Design system portal (port 8083)
cd apps/website/design-system-portal
npm run dev

# Marketplace portal (port 8082)
cd apps/website/marketplace-portal
npm run dev
```

## Deployment

```bash
# Via Ferni CLI (recommended)
ferni deploy landing          # Main website
ferni deploy developers       # Developers portal
ferni deploy design-system    # Design system portal
ferni deploy marketplace      # Marketplace portal

# Or manually
cd apps/website/ferni-website
npm run build
firebase deploy --only hosting:ferni-website
```

## Design Tokens

All portals share design tokens from `design-system/tokens/`. Sync with:

```bash
# From monorepo root
pnpm tokens:sync
```

This updates:
- `apps/website/design-system-portal/src/css/tokens.css`
- `apps/website/developers-portal/src/css/tokens.css`
- `apps/website/marketplace-portal/src/css/tokens.css`
- `apps/website/ferni-website/css/design-tokens.css`

## Firebase Hosting

| Site ID | Domain |
|---------|--------|
| `ferni-website` | ferni.ai |
| `ferni-developers` | developers.ferni.ai |
| `ferni-design-system` | design.ferni.ai |
| `ferni-marketplace` | marketplace.ferni.ai |

## Theme Reference

### Zen Garden (Light)
- Primary: #faf8f5 (Warm Paper)
- Accent: #3D5A45 (Ferni Sage)

### Cedar Night (Dark)
- Primary: #584840 (Cedar)
- Accent: #d4a84a (Gold)

## Related Docs

- Individual portal READMEs in each subdirectory
- `design-system/README.md` - Design system documentation
- `docs/architecture/DESIGN-SYSTEM.md` - Token architecture
