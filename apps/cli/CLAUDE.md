# Ferni CLI

> **We believe in making AI human, and the decisions we make will reflect that.**

The Ferni CLI (`ferni`) is the command-line interface for **autonomous business operations**. Beyond deployments and builds, it's evolving into the "CEO" - capable of running experiments, making data-driven decisions, and automating end-to-end business processes.

---

## Vision: CLI as Autonomous CEO

The CLI is being elevated from a developer tool to a full business automation platform:

| Level | Capability | Status |
|-------|------------|--------|
| **L1: Developer Tool** | Deploy, build, test | ✅ Complete |
| **L2: Operations Platform** | Monitor, alert, auto-remediate | ⚠️ In Progress |
| **L3: Business Intelligence** | Metrics, insights, recommendations | 🔴 Planned |
| **L4: Autonomous CEO** | Decide, execute, report | 🔴 Roadmap |

**Full roadmap:** `docs/CEO-AUTOMATION-ROADMAP.md`
**Implementation plan:** `docs/plans/CLI-IMPLEMENTATION-PLAN.md` (all 73 incomplete commands)
**Command reference:** `docs/CLI-COMMAND-REFERENCE.md`

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
│       ├── experiments/            # A/B Testing & Experiments (NEW!)
│       │   ├── index.ts            # Module exports
│       │   └── experiments.ts      # All experiment commands
│       ├── generate/               # Code generation
│       │   ├── generate.ts         # Main generate
│       │   └── *.ts                # Various generators
│       ├── jobs/                   # Background jobs
│       ├── ops/                    # Operations
│       │   ├── cleanup-gce.ts      # Disk cleanup
│       │   └── cleanup-zombies.ts  # Zombie revision cleanup
│       ├── runner/                 # GitHub Actions Runner
│       │   ├── runner.ts           # Main command entry
│       │   ├── runner-status.ts    # Status command
│       │   ├── runner-restart.ts   # Restart command
│       │   └── runner-logs.ts      # Logs command
│       ├── ceo/                    # CEO Strategic Operations
│       │   ├── ceo.ts              # Main command entry
│       │   ├── ceo-dashboard.ts    # Company health dashboard
│       │   ├── ceo-metrics.ts      # Cross-department KPIs
│       │   └── ...                 # decisions, board-prep, investor-update, okrs
│       ├── cto/                    # CTO Technical Leadership
│       │   ├── cto.ts              # Main command entry
│       │   ├── cto-health.ts       # Architecture health
│       │   └── ...                 # debt, incidents, security, dependencies, performance
│       ├── cio/                    # CIO Information Governance
│       │   ├── cio.ts              # Main command entry
│       │   └── ...                 # compliance, data-catalog, access-review, risk, vendors
│       ├── cpo/                    # CPO Product Intelligence
│       │   ├── cpo.ts              # Main command entry
│       │   └── ...                 # roadmap, feedback, experiments, prioritize, personas, churn
│       ├── cmo/                    # CMO Marketing Intelligence
│       │   ├── cmo.ts              # Main command entry
│       │   └── ...                 # campaigns, content, seo, social, attribution, competitors
│       ├── csco/                   # CSCO Operations Intelligence
│       │   ├── csco.ts             # Main command entry
│       │   └── ...                 # costs, vendors, slas, capacity, automation
│       ├── quality/                # Code quality
│       ├── validate/               # Validation checks
│       ├── setup/                  # Environment setup
│       ├── tools/                  # LLM tool management
│       └── ...                     # 40+ command directories total
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

### Phone Calls

Initiate outbound calls through Ferni. Requires authentication (`ferni auth login`).

```bash
# Call someone by name (looks up in contacts) or phone number
ferni call "Jordan"
ferni call +14845551234

# Add context for the call
ferni call "Jordan" --reason "checking in about the snowstorm"
ferni call mom --message "Hi mom, just calling to say hi!"

# Use a different persona
ferni call "Jordan" --persona maya

# Check call status
ferni calls status <callId>

# List active calls
ferni calls list
```

### Natural Language Chat

Text-based interface that routes through the same tool system as voice. Great for testing the platform.

```bash
# Single message
ferni chat "play some jazz music"
ferni chat "what's on my calendar today?"

# Interactive conversation mode
ferni chat --interactive
ferni chat -i --persona maya

# List available tools
ferni chat --tools
ferni chat --tools music

# Execute a tool directly
ferni chat --exec playMusic '{"query":"jazz"}'
```

### Music Control

```bash
ferni music play "relaxing piano"    # Play music
ferni music pause                    # Pause playback
ferni music resume                   # Resume playback
ferni music stop                     # Stop playback
ferni music skip                     # Skip track
ferni music volume 70                # Set volume (0-100)
ferni music status                   # What's playing
ferni music suggest "focused work"   # Suggest music for mood
```

### Contacts Management

```bash
ferni contacts list                  # List all contacts
ferni contacts search "mom"          # Search contacts
ferni contacts show "Jordan"         # Show contact details
ferni contacts groups                # List contact groups
ferni contacts needing-attention     # Contacts needing outreach
```

### Scheduling

```bash
ferni schedule call "Jordan" "tomorrow 3pm" --reason "birthday"
ferni schedule message "mom" "8am" --message "Good morning!"
ferni schedule reminder "Take vitamins" "every day 9am"
ferni schedule list                  # List scheduled items
ferni schedule cancel <id>           # Cancel scheduled item
```

### Email Intelligence

```bash
ferni email summary                  # Inbox overview
ferni email followups                # Emails needing follow-up
ferni email important                # High-priority emails
ferni email unread                   # Unread summary
ferni email from "John"              # Emails from a person
ferni email search "project"         # Search emails
```

### Family Check-ins

```bash
ferni family checkin                 # Start check-in round
ferni family checkin mom             # Check in on specific member
ferni family status                  # View pending check-ins
ferni family summary                 # Family wellness summary
ferni family message "mom" "Hi!"     # Send message
ferni family members                 # List family members
```

### Memory/Brain

Search and manage what Ferni knows about you.

```bash
ferni brain                          # Summary of what Ferni knows
ferni brain search "birthday"        # Search memories
ferni brain about "Jordan"           # What Ferni knows about someone
ferni brain remember "My dog Max"    # Teach Ferni something
ferni brain insights                 # Personalized insights
ferni brain stats                    # Memory system stats
ferni brain recent                   # Recently learned facts
```

### Experiments & A/B Testing (NEW!)

The autonomous experimentation system supports A/B tests, multi-armed bandits, and auto-escalating rollouts.

```bash
# List and manage experiments
ferni experiments list              # List all experiments
ferni experiments status            # Show experiment summary
ferni experiments show <id>         # Show experiment details
ferni experiments health <id>       # Show experiment health

# Lifecycle management
ferni experiments start <id>        # Start an experiment
ferni experiments pause <id>        # Pause an experiment
ferni experiments resume <id>       # Resume an experiment
ferni experiments complete <id>     # Complete an experiment

# Winner management
ferni experiments promote <id>      # Check and promote winner
ferni experiments delete <id> -f    # Delete an experiment
```

**Experiment Types:**
| Type | Algorithm | Use Case |
|------|-----------|----------|
| `ab` | Z-test significance | Classic A/B testing |
| `bandit` | Thompson Sampling | Dynamic traffic optimization |
| `rollout` | Stage-based (2%→10%→25%→50%→100%) | Safe feature rollouts |

**Full docs:** `src/tools/experiments/CLAUDE.md`

### GitHub Actions Runner

```bash
# Check runner status
ferni runner status
ferni runner status --json

# Restart runner service
ferni runner restart
ferni runner restart --force

# View runner logs
ferni runner logs
ferni runner logs --follow
ferni runner logs --lines 100

# SSH into runner VM
ferni runner ssh
```

### Executive Suite - Autonomous Company Operations

Six executive-level command suites for autonomous company intelligence:

#### CEO - Strategic Operations
```bash
ferni ceo dashboard          # Real-time company health metrics
ferni ceo metrics --period weekly  # KPIs across all departments
ferni ceo decisions --pending      # Decision log with outcomes
ferni ceo board-prep         # Board deck data generation
ferni ceo investor-update    # Draft investor communications
ferni ceo okrs --q1          # OKR tracking and scoring
```

#### CTO - Technical Leadership
```bash
ferni cto health             # Architecture health score
ferni cto debt --prioritize  # Tech debt inventory
ferni cto incidents --recent # Incident tracking & postmortems
ferni cto security --scan    # Security vulnerability scan
ferni cto dependencies       # Dependency health report
ferni cto performance        # System performance by service
```

#### CIO - Information Governance
```bash
ferni cio compliance --soc2  # SOC2/GDPR/HIPAA status
ferni cio data-catalog --pii # Data lineage & PII inventory
ferni cio access-review --stale  # Permission audits
ferni cio risk --matrix      # Risk register with mitigations
ferni cio vendors --expiring # Vendor security assessments
```

#### CPO - Product Intelligence
```bash
ferni cpo roadmap --auto     # AI-generated roadmap from signals
ferni cpo feedback --sentiment  # Aggregate user feedback
ferni cpo experiments --winners # A/B test results
ferni cpo prioritize --rice  # Feature scoring (RICE method)
ferni cpo personas --journeys   # User persona insights
ferni cpo churn --at-risk    # Churn prediction & interventions
```

#### CMO - Marketing Intelligence
```bash
ferni cmo campaigns --active # Campaign performance & ROAS
ferni cmo content --calendar # Content calendar & AI generation
ferni cmo seo --audit        # SEO health & keyword opportunities
ferni cmo social --analytics # Social media metrics
ferni cmo attribution --model linear  # Multi-touch attribution
ferni cmo competitors --track   # Competitive intelligence
```

#### CSCO - Operations Intelligence
```bash
ferni csco costs --optimize  # Cost optimization opportunities
ferni csco vendors --audit   # Vendor performance tracking
ferni csco slas --status     # SLA monitoring & breach alerts
ferni csco capacity --forecast  # Infrastructure capacity planning
ferni csco automation --opportunities  # Process automation ROI
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
