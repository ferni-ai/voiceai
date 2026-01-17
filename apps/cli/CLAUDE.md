# Ferni CLI

> **We believe in making AI human, and the decisions we make will reflect that.**

The Ferni CLI (`ferni`) is the command-line interface for managing the Ferni platform. It handles deployments, builds, code generation, and operational tasks.

---

## Installation

```bash
# Install globally
npm install -g @ferni/cli

# Or use via npx
npx ferni <command>

# Or use pnpm script
pnpm ferni <command>
```

---

## Directory Structure

```
apps/cli/
├── src/
│   ├── index.ts                    # CLI entry point
│   └── commands/
│       ├── agent/                  # Agent E2E commands (NEW!)
│       │   ├── agent-init.ts       # ferni agent init (wizard)
│       │   ├── agent-preview.ts    # ferni agent preview (local dev)
│       │   ├── agent-publish.ts    # ferni agent publish (deploy)
│       │   ├── agent-create.ts     # Cloud-based agent creation
│       │   └── agent-*.ts          # Other agent commands
│       ├── agents/                 # Legacy agent management
│       │   └── agent-builder.ts    # Build custom agents
│       ├── auth/                   # Authentication
│       │   └── spotify-auth.ts     # Spotify OAuth
│       ├── build/                  # Build commands
│       │   ├── build.ts            # Main build
│       │   ├── build-fast.ts       # esbuild (fast)
│       │   ├── build-bundle.ts     # Bundle for deploy
│       │   └── bundle-agent.ts     # Bundle agent
│       ├── deploy/                 # Deployment
│       │   ├── deploy.ts           # Main deploy command
│       │   ├── deploy-gce.ts       # GCE deployment
│       │   └── rollout.ts          # Rolling updates
│       ├── generate/               # Code generation
│       │   ├── generate.ts         # Main generate
│       │   └── *.ts                # Various generators
│       ├── jobs/                   # Background jobs
│       ├── ops/                    # Operations
│       │   ├── cleanup-gce.ts      # Disk cleanup
│       │   └── cleanup-zombies.ts  # Zombie revision cleanup
│       ├── quality/                # Code quality
│       ├── runtime/                # Runtime management
│       ├── tokens/                 # Design token management
│       └── watch/                  # File watching
├── package.json
└── tsconfig.json
```

---

## Key Commands

### Agent E2E Workflow (NEW!)

Create, preview, and deploy custom AI agents in minutes:

```bash
# Create a new agent with interactive wizard
ferni agent init my-advisor

# Preview locally with hot reload
ferni agent preview my-advisor

# Deploy to production
ferni agent publish my-advisor
```

**Full E2E docs:** `docs/architecture/AGENT-E2E-DEVELOPER-EXPERIENCE.md`

### Agent Management

```bash
# Interactive agent creation wizard
ferni agent init <agent-id>
ferni agent init my-coach --template mentor
ferni agent init quick-agent --quick

# Local development server with hot reload
ferni agent preview <agent-id>
ferni agent preview my-agent --port 4000

# One-command production deployment
ferni agent publish <agent-id>
ferni agent publish my-agent --dry-run
ferni agent publish my-agent --subdomain custom-name

# Other agent commands
ferni agent list              # List all agents
ferni agent show <agent-id>   # Show agent details
ferni agent test <agent-id>   # Run tests
```

### Deployment

```bash
# Deploy to GCE (voice agent) - RECOMMENDED
ferni deploy gce

# Deploy to GCE with MIG auto-scaling
ferni deploy gce --mig

# Deploy UI backend to Cloud Run
ferni deploy ui

# Deploy frontend to Firebase
ferni deploy frontend

# Deploy everything
ferni deploy all

# Dry run (preview)
ferni deploy gce --dry-run
```

### Build

```bash
# Fast build with esbuild
ferni build fast

# Build with type declarations
ferni build fast --types

# Traditional tsc build
ferni build
```

### Design Tokens

```bash
# Sync design tokens
ferni tokens sync

# Check for drift
ferni tokens check

# Bump version
ferni tokens version patch "Fixed colors"

# Watch for changes
ferni tokens watch
```

### Operations

```bash
# Check disk usage on GCE
ferni disk

# Clean up disk space
ferni disk clean

# Aggressive cleanup
ferni disk clean --aggressive

# Check for zombie revisions
ferni ops zombies

# Fix zombie revisions
ferni ops zombies --fix
```

### Code Generation

```bash
# Generate API documentation
ferni generate api-docs

# Generate OpenAPI spec
ferni generate openapi

# Generate frontend persona types
ferni generate frontend-personas
```

### Runtime

```bash
# Watch logs in real-time
ferni runtime watch

# Check runtime status
ferni runtime status
```

---

## Adding New Commands

### 1. Create Command File

```typescript
// src/commands/my-feature/my-command.ts
import { Command } from 'commander';

export function registerMyCommand(program: Command): void {
  program
    .command('my-command')
    .description('Does something useful')
    .option('-n, --name <name>', 'Name option')
    .option('--dry-run', 'Preview changes')
    .action(async (options) => {
      if (options.dryRun) {
        console.log('Would do:', options.name);
        return;
      }
      await doSomething(options.name);
    });
}
```

### 2. Register in Main

```typescript
// src/index.ts
import { registerMyCommand } from './commands/my-feature/my-command.js';

registerMyCommand(program);
```

---

## Deploy Command Details

### GCE Deployment (`deploy gce`)

Uses blue-green deployment on single VM:

1. Build Docker image (Cloud Build or local)
2. SSH to GCE VM
3. Pull new image
4. Start green container on alternate port
5. Health check green
6. Stop blue, promote green

### GCE MIG Deployment (`deploy gce --mig`)

Uses managed instance group with rolling updates:

1. Build Docker image
2. Create new instance template
3. Trigger rolling update
4. Wait for all instances healthy
5. Clean up old templates

### Cloud Run Deployment (`deploy ui`)

Uses Cloud Run with traffic shifting:

1. Build with Cloud Build
2. Deploy new revision (no traffic)
3. Health check
4. Shift traffic to new revision
5. Clean up old revisions

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | GCP project (default: johnb-2025) |
| `GCP_REGION` | GCP region (default: us-central1) |
| `GCE_INSTANCE` | GCE instance name |
| `GCE_IP` | GCE static IP |

---

## Testing

```bash
# Test CLI commands
pnpm vitest run apps/cli/src/__tests__/
```

---

## Rules

### Do
- Use `--dry-run` for destructive operations
- Log progress with clear step indicators
- Handle errors gracefully with rollback
- Use colors for output (`chalk`)

### Don't
- Skip health checks on deploy
- Delete resources without confirmation
- Hard-code secrets (use Secret Manager)
- Ignore exit codes

---

## Agent E2E Developer Experience

The new `ferni agent` commands provide a streamlined E2E experience for creating custom agents:

### Workflow Comparison

| Before (Manual) | After (CLI) |
|-----------------|-------------|
| 7+ steps, 2-4 hours | 3 commands, 15-30 min |
| Copy template, edit 10+ files | Interactive wizard |
| Manual deployment scripts | One-command deploy |
| No local preview | Hot-reload dev server |

### File Structure Created by `ferni agent init`

```
src/personas/bundles/<agent-id>/
├── persona.manifest.json         # Configuration (enhanced v3)
├── identity/
│   ├── system-prompt.md          # LLM instructions
│   └── biography.md              # Background story
├── content/
│   ├── behaviors/
│   │   ├── greetings.json
│   │   ├── catchphrases.json
│   │   └── backchannels.json
│   └── knowledge/
│       └── _index.json
├── brand/
│   └── brand.json                # Colors, theme
└── README.md
```

### Templates Available

| Template | Description | Personality |
|----------|-------------|-------------|
| `advisor` | Business/finance expert | Analytical, direct |
| `mentor` | Life guidance | Warm, patient |
| `coach` | Accountability partner | Energetic, motivating |
| `wellness` | Mindfulness guide | Calm, gentle |
| `creative` | Creativity catalyst | Playful, curious |
| `custom` | Build from scratch | Customizable |

### Voice Library

The wizard includes a curated voice library from Cartesia. You can also:
- Enter a custom voice ID
- Clone voices (via Cartesia dashboard)

---

*Last updated: January 2026*
