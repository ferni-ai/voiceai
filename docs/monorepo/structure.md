# Monorepo Structure

This document describes the Ferni monorepo structure and workspace configuration.

## Overview

The Ferni codebase is a pnpm workspace monorepo containing:
- Backend voice agent (Node.js/TypeScript)
- Frontend web application (Vite/TypeScript)
- Design system and component libraries
- CLI tools
- Mobile apps (iOS, Android)
- VS Code extension
- Figma plugin

## Directory Structure

```
voiceai/
├── src/                    # Backend source code
│   ├── agents/             # Voice agent implementations
│   ├── api/                # API routes
│   ├── audio/              # Audio processing, DJ system
│   ├── config/             # Configuration
│   ├── conversation/       # Conversation handling
│   ├── handoff/            # Persona transitions
│   ├── intelligence/       # Context builders
│   ├── memory/             # Storage and persistence
│   ├── personas/           # Persona bundles
│   ├── services/           # Business logic
│   ├── speech/             # Audio prosody, SSML
│   ├── tools/              # 118 tool domains
│   └── utils/              # Shared utilities
│
├── apps/                   # Application packages
│   ├── web/                # Frontend web app (Vite)
│   ├── cli/                # Ferni CLI
│   ├── ios-native/         # iOS native app
│   ├── android/            # Android app
│   ├── electron/           # Desktop app
│   ├── rust-audio/         # Rust audio processing
│   ├── vscode-extension/   # VS Code extension
│   └── figma-plugin/       # Figma plugin
│
├── packages/               # Shared packages
│   └── ferni-react/        # React component library
│
├── design-system/          # Design tokens and theming
│   ├── tokens/             # Source JSON tokens
│   ├── dist/               # Built CSS/JS
│   ├── docs/               # Design documentation
│   └── stories/            # Storybook stories
│
├── .github/                # GitHub configuration
│   ├── workflows/          # GitHub Actions workflows
│   └── actions/            # Composite actions
│
├── docs/                   # Documentation
│   ├── architecture/       # Architecture docs
│   ├── ci/                 # CI/CD documentation
│   ├── monorepo/           # Monorepo documentation
│   └── runbooks/           # Operational runbooks
│
├── scripts/                # Build and dev scripts
│   ├── devops/             # DevOps tooling
│   └── ...
│
└── promo/                  # Marketing website
    └── ferni-website/      # Landing page (11ty)
```

## Workspace Configuration

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Package Dependencies

```
┌─────────────────┐
│   apps/web      │ ──────► packages/ferni-react
└─────────────────┘              │
        │                        │
        ▼                        ▼
┌─────────────────┐     ┌─────────────────┐
│  design-system  │     │      src/       │
│    (tokens)     │     │   (backend)     │
└─────────────────┘     └─────────────────┘
```

## Package Inventory

| Package | Type | Location | Build |
|---------|------|----------|-------|
| @ferni/web | app | apps/web | vite |
| @ferni/cli | app | apps/cli | tsc |
| @ferni/react | lib | packages/ferni-react | tsc |
| design-system | tokens | design-system | node |
| backend | app | src | esbuild |

## Build Order

Due to dependencies, packages must build in this order:

1. `design-system` - Generate tokens CSS/JS
2. `packages/ferni-react` - Build React components
3. `src` (backend) - Build voice agent
4. `apps/web` - Build frontend
5. `apps/cli` - Build CLI (can be parallel with web)

## Common Commands

### Install dependencies
```bash
pnpm install              # Install all workspaces
pnpm -F @ferni/web add X  # Add dep to specific workspace
```

### Build
```bash
pnpm build                # Build all
pnpm build:fast           # Fast esbuild (12x faster)
pnpm build:design-system  # Build tokens only
```

### Test
```bash
pnpm test                 # All tests
pnpm test:unit            # Unit tests only
pnpm -F @ferni/web test   # Test specific workspace
```

### Run
```bash
pnpm dev                  # Start all dev servers
pnpm -F @ferni/web dev    # Start frontend only
```

## Workspace Filtering

Use `-F` or `--filter` to run commands in specific workspaces:

```bash
pnpm -F @ferni/web build         # Build web only
pnpm -F './apps/*' test          # Test all apps
pnpm -F '!./apps/ios-native' lint # Lint all except iOS
```

## Adding a New Package

1. Create directory under `apps/` or `packages/`
2. Add `package.json` with unique name
3. Run `pnpm install` to link
4. Update CI if needed for path filters

## Known Issues

### Local file: Dependencies

The repo uses local forks of LiveKit packages:

```json
"@livekit/agents": "file:../agents-js/agents"
```

CI automatically replaces these with npm versions. See composite action.

### Design System Drift

Generated files can drift from source tokens. Always run:

```bash
pnpm tokens:sync    # After editing tokens
pnpm tokens:check   # To verify no drift
```
