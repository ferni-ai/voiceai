# Ferni AI Voice Agent

> **We believe in making AI human, and the decisions we make will reflect that.**

See `CORE-PRINCIPLES.md` for our complete philosophy. Every architecture decision, feature, and line of code should make AI feel more human, serve relationships over transactions, and support gentle growth.

---

## Quick Reference

```bash
# Quality checks
pnpm quality         # Typecheck + lint + format + test (run before commits)
pnpm quality:check   # Code quality metrics (as any, console.log, file size)
pnpm quality:arch    # Architecture layer validation
pnpm quality:full    # All checks combined
pnpm typecheck       # TypeScript only
pnpm lint:fix        # Auto-fix lint issues
pnpm test            # Vitest (60% coverage required)

# Fast builds (esbuild - 12x faster!)
pnpm build:fast      # Build with esbuild (~0.9s for 1400 files)
pnpm build:fast:types # Build + generate .d.ts files
pnpm build:fast:watch # Watch mode for development
pnpm build           # Traditional tsc build (slower, but full type checking)
```

## 📦 Package Manager: pnpm (Preferred)

We use **pnpm** for faster installs and better caching. npm still works but is slower.

```bash
# Install dependencies (~4x faster than npm)
pnpm install

# Run any script
pnpm <script>        # e.g., pnpm dev, pnpm build:fast, pnpm test

# Add a dependency
pnpm add <package>   # Runtime dependency
pnpm add -D <package> # Dev dependency
pnpm add -w <package> # Add to workspace root
```

**First time setup?** Run `./scripts/migrate-to-pnpm.sh` to generate `pnpm-lock.yaml`.

## Automated Quality Gates

Pre-commit hooks validate both backend and frontend code. CI enforces all quality gates.

| Check                    | Threshold  | Script                            |
| ------------------------ | ---------- | --------------------------------- |
| TypeScript errors        | 0          | `pnpm typecheck`                  |
| ESLint errors            | 0          | `pnpm lint`                       |
| `as any` assertions      | ≤30        | `pnpm quality:check`              |
| `console.*` usage        | ≤100       | `pnpm quality:check`              |
| File size                | ≤500 lines | `pnpm quality:check`              |
| Layer violations         | 0          | `pnpm quality:arch`               |
| Design tokens (frontend) | 0          | `cd apps/web && pnpm lint:tokens` |

## 🚀 Development Servers (MUST RUN ALL 4)

For full development, you need 4 servers running:

| Server | Port | Purpose |
|--------|------|---------|
| **Token Server** | 3001 | LiveKit tokens, Spotify OAuth, subscriptions |
| **UI Server** | 3002 | APIs, engagement routes, agent registry |
| **Vite Frontend** | 3004 | Frontend with HMR |
| **Voice Agent** | LiveKit | Voice agent (connects to dev LiveKit project) |

### For Cursor AI Agents (Recommended)

Start each server in a **separate background terminal** so logs can be watched:

```bash
# Terminal 1: Token Server (port 3001)
pnpm token-server

# Terminal 2: UI Server (port 3002)
pnpm ui-server

# Terminal 3: Vite Frontend (port 3004)
cd apps/web && pnpm dev

# Terminal 4: Voice Agent (LiveKit worker)
LOG_FULL_RESPONSES=true pnpm dev
```

Run `ferni dev cursor` for a quick reference of these commands.

### Health Check

```bash
curl -s http://localhost:3001/health  # Token server
curl -s http://localhost:3002/health  # UI server
curl -s http://localhost:3004/ | head -c 100  # Vite
```

### Stop All Servers

```bash
ferni dev stop
```

**Why 4 servers?** Vite proxies API calls: `/api/*` → UI Server (3002), `/token`, `/spotify/*`, `/subscription/*` → Token Server (3001). The Voice Agent connects directly to LiveKit.

## 🔑 LiveKit Configuration (Dev vs Production)

**CRITICAL:** We have TWO separate LiveKit projects to prevent local dev workers from stealing production jobs!

| Environment     | LiveKit Project              | URL                                 | Agent Name        |
| --------------- | ---------------------------- | ----------------------------------- | ----------------- |
| **Development** | `ferni-dev` (p_1gcwootg9al)  | `wss://dev-8sm1ba0z.livekit.cloud`  | `voice-agent-dev` |
| **Production**  | Main project (test-rvg91u1z) | `wss://test-rvg91u1z.livekit.cloud` | `voice-agent`     |

### Local Development Setup

Create a `.env` file in the project root:

```bash
# .env (for local development)
NODE_ENV=development

# DEVELOPMENT LiveKit (ferni-dev project)
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud
LIVEKIT_API_KEY=<your-dev-key>
LIVEKIT_API_SECRET=<your-dev-secret>
AGENT_NAME=voice-agent-dev

# Other required keys
GOOGLE_API_KEY=your-google-api-key
CARTESIA_API_KEY=your-cartesia-api-key
```

Get dev credentials from: https://cloud.livekit.io/projects/p_1gcwootg9al/settings/keys

### Why Two Projects?

LiveKit dispatches jobs to ALL registered workers. If local dev and GCE production both connect to the same project, they compete for incoming calls, causing:

- Random job failures ("runner initialization timed out")
- Calls going to wrong environment
- Debugging nightmares

With separate projects, your local dev is completely isolated from production.

## 🔐 Critical Environment Variables (MANDATORY)

The GCE voice agent **requires** these environment variables. Missing any will cause immediate startup failure with clear error messages:

| Variable | Purpose | Required In |
|----------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Firestore persistence | Production |
| `LIVEKIT_URL` | Voice agent connection | All |
| `LIVEKIT_API_KEY` | LiveKit authentication | All |
| `LIVEKIT_API_SECRET` | LiveKit authentication | All |
| `OPENAI_API_KEY` | LLM for conversations | All |
| `CARTESIA_API_KEY` | Text-to-speech | All |

### How These Are Set

- **Deploy script**: `ferni deploy gce` automatically fetches secrets from GCP Secret Manager and adds `GOOGLE_CLOUD_PROJECT`
- **Container startup**: Fast-fail validation at the very start if any critical var is missing
- **Post-deploy check**: Verifies the running container has the right env vars before promoting to production

### If You See "Missing GOOGLE_CLOUD_PROJECT"

This means the container was started manually without all required env vars. Fix with:

```bash
ferni deploy gce  # Redeploy with all env vars
```

**NEVER** start containers manually with `docker run`. Always use `ferni deploy gce`.

## 🌐 Production Deployment (Blue-Green)

**⚠️ ALWAYS use the Ferni CLI** - it's intelligent and handles blue-green deployment with health checks:

```bash
# Use the Ferni CLI for ALL deployments
ferni deploy            # Interactive menu
ferni deploy gce        # Voice agent to GCE (WebRTC/UDP) ← PREFERRED for voice
ferni deploy ui         # UI backend to Cloud Run
ferni deploy frontend   # Frontend to Firebase
ferni deploy all        # Deploy everything

# Options
ferni deploy gce --dry-run    # Preview what would happen

# Monitor progress
tail -f .deploy-logs/*.log
```

### Zero-Downtime Deployment Flow

1. Build container image
2. Deploy new revision with `--no-traffic` (green)
3. **Liveness check** - server is responding (`/health`)
4. **Readiness check** - workers can accept calls (`/health/ready`) ← NEW!
5. **Only shift traffic when workers signal ready**
6. Zero-downtime guaranteed - no "runner initialization timed out" errors!
7. Keep old revision running if any check fails

### Worker Readiness System

Traffic is **never shifted** until LiveKit workers signal they're ready:

| Check     | Endpoint        | What it verifies                     |
| --------- | --------------- | ------------------------------------ |
| Liveness  | `/health`       | Server process is running            |
| Readiness | `/health/ready` | Workers initialized, accepting calls |

**Auto-scaling configuration:**

- `min-instances: 1` - Always one warm instance ready
- `max-instances: 50` - Scale up for traffic spikes
- `concurrency: 10` - Max 10 concurrent calls per instance

### ⛔ NEVER DO

| Wrong                             | Right                     |
| --------------------------------- | ------------------------- |
| `gcloud run deploy voiceai-agent` | `ferni deploy gce`        |
| `ssh vm && docker run`            | `ferni deploy gce`        |
| `pnpm deploy:*` scripts directly  | `ferni deploy <target>`   |
| Direct `gcloud` deploy commands   | Always use `ferni deploy` |

**Why?** Direct deploys skip readiness checks and can cause connection failures. Ferni CLI is intelligent and handles health checks, blue-green strategy, and cleanup automatically.

| Deploy Command          | What it deploys         | Blue-Green?              |
| ----------------------- | ----------------------- | ------------------------ |
| `ferni deploy gce`      | Voice agent to GCE      | ✅ Yes                   |
| `ferni deploy ui`       | UI backend to Cloud Run | ✅ Yes                   |
| `ferni deploy frontend` | Firebase Hosting        | ✅ Yes (preview channel) |
| `ferni deploy landing`  | Landing page            | ✅ Yes (preview channel) |

**Key files:** `apps/cli/src/commands/deploy/deploy.ts`, `cloudbuild.yaml`, `cloudbuild-ui.yaml`

### 🧟 Zombie Revision Prevention (for Cloud Run services)

**Note:** Voice agent now runs on GCE, so this only applies to `john-bogle-ui` and other Cloud Run services.

**The Problem:** Old Cloud Run revisions with `min-instances>0` keep running even with 0% HTTP traffic.

**The Solution:** The deploy script automatically cleans up old revisions after successful deployment.

```bash
# Check for zombie revisions
pnpm ops:zombies

# Fix zombie revisions (delete them)
pnpm ops:zombies:fix

# Quick diagnostic dashboard (disconnects, quality, crashes)
pnpm ops:diagnose
```

**Key files:** `apps/cli/src/commands/ops/cleanup-zombies.ts`, `apps/cli/src/commands/deploy/deploy.ts`

### 📊 Monitoring & Diagnostics

The voice agent container runs automated monitoring:

- **Ops Orchestrator**: Service health, cost, latency, error rates (every 30-60s)
- **Call Quality Monitor**: Connection success, disconnect patterns (every 60s)
- **Container Watchdog**: Disk, memory, auto-cleanup

Quick diagnostics from outside the container:

```bash
# Full diagnostic dashboard
pnpm ops:diagnose

# Check voice agent health
curl http://34.134.186.63:8080/health/ready

# Check call quality metrics
curl http://34.134.186.63:8080/api/observability | jq '.callQuality'

# Check crash analytics
curl http://34.134.186.63:8080/api/crash-analytics

# View recent logs
pnpm ops:logs

# View error logs only
pnpm ops:logs:errors
```

**Disconnect debugging guide:** `docs/runbooks/DISCONNECT-DEBUGGING.md`

### 🧠 Semantic Data Store Deployment

The semantic data store provides superhuman memory. Deploy and manage with:

```bash
# Full automated deployment (recommended)
pnpm ops:semantic-deploy            # Deploy, backfill, cleanup - interactive
pnpm ops:semantic-deploy:dry-run    # Preview what would happen

# Manual operations
pnpm ops:semantic-backfill          # Run backfill only
pnpm ops:semantic-backfill:dry-run  # Preview backfill
pnpm ops:semantic-health            # Check health endpoint

# Skip code deployment (backfill only)
pnpm ops:semantic-deploy:skip-deploy
```

**Options:**
| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without changes |
| `--skip-deploy` | Skip code deployment |
| `--skip-backfill` | Skip data backfill |
| `--force` | Skip confirmation prompts |
| `--batch-size <n>` | Backfill batch size (default: 50) |
| `--domain <name>` | Only backfill one domain |
| `--rollback` | Emergency disable instructions |

**Health endpoints:**

- `GET /api/semantic-store/health` - Health status
- `GET /api/semantic-store/metrics` - Prometheus metrics
- `POST /api/semantic-store/cleanup` - Trigger TTL cleanup

### 🔔 External Health Monitoring (GCP Cloud Scheduler)

Set up GCP Cloud Monitoring uptime checks to alert when services are down:

```bash
# Set up external monitoring (one-time)
pnpm ops:setup-scheduler

# Preview what would be created
pnpm ops:setup-scheduler --dry-run
```

This creates uptime checks that ping from OUTSIDE the container (catches container death).

## 🖥️ GCE Voice Agent Deployment (PRIMARY)

**Why GCE instead of Cloud Run?**

- WebRTC requires **UDP** for real-time voice (Cloud Run only supports TCP)
- LiveKit workers need persistent connections
- Better audio quality with direct UDP transport
- No "choppy audio" issues that occur with Cloud Run

### GCE Blue-Green Deployment

```bash
# Deploy voice agent to GCE (always use Ferni CLI!)
ferni deploy gce

# Preview what would happen
ferni deploy gce --dry-run
```

### Blue-Green Strategy

1. **Build & Push** - Docker image to Container Registry
2. **Deploy to Inactive Slot** - Start new container on alternate port (green)
3. **Health Check** - Verify `/health` endpoint responds
4. **Promote** - Stop old container (blue), new one takes over
5. **Rollback** - If health check fails, old container keeps running

### GCE Configuration

| Setting    | Value           | Notes              |
| ---------- | --------------- | ------------------ |
| Instance   | `voiceai-agent` | GCE VM name        |
| IP         | `34.134.186.63` | Static external IP |
| Zone       | `us-central1-a` | -                  |
| Blue Port  | `8080`          | Primary slot       |
| Green Port | `8081`          | Secondary slot     |

### GCE vs Cloud Run Decision Matrix

| Requirement            | GCE         | Cloud Run         |
| ---------------------- | ----------- | ----------------- |
| WebRTC/UDP voice       | ✅ Required | ❌ TCP only       |
| Auto-scaling           | Manual      | ✅ Automatic      |
| Cost at low traffic    | Higher      | ✅ Pay-per-use    |
| Persistent connections | ✅ Yes      | ❌ Timeout limits |

**Voice Agent → Always use GCE** (`ferni deploy gce`)
**UI/API backends → Use Cloud Run** (`ferni deploy ui`)

**Key files:** `apps/cli/src/commands/deploy/deploy-gce.ts`, `apps/cli/src/commands/deploy/deploy.ts`

### 💽 GCE Disk Management (Auto-Cleanup)

The GCE instance can run out of disk space from old Docker images, logs, and build cache. Cleanup now runs **automatically on every deploy**, but you can also run it manually:

```bash
# Check disk status
ferni disk                    # or: pnpm ops:disk
pnpm ops:disk

# Run cleanup (removes old images, truncates logs)
ferni disk clean              # or: pnpm ops:disk:clean
pnpm ops:disk:clean

# Aggressive cleanup (also removes volumes, apt cache)
ferni disk clean:aggressive   # or: pnpm ops:disk:clean:aggressive

# Preview what would be cleaned
pnpm ops:disk:clean:dry-run

# Set up automatic daily cleanup (cron at 3 AM)
ferni disk setup-cron         # or: pnpm ops:disk:setup-cron
```

**What gets cleaned on each deploy:**

- Stopped containers
- Dangling (untagged) images
- Old deployment images (keeps last 3 for rollback)
- Docker build cache (keeps 2GB)
- Truncates container logs

**Key files:** `apps/cli/src/commands/ops/cleanup-gce.ts`, `apps/cli/src/commands/deploy/deploy-gce.ts`

### 🏃 GitHub Actions Self-Hosted Runner

We use a **self-hosted GitHub Actions runner** on GCE to reduce CI billing and speed up builds through caching.

| Property | Value |
|----------|-------|
| **VM Name** | `github-runner` |
| **IP** | `34.171.8.182` |
| **Machine Type** | `e2-medium` (~$25/mo) |
| **Zone** | `us-central1-a` |
| **Runner Labels** | `self-hosted`, `Linux`, `X64`, `gce` |

**Pre-installed tools:** Docker 29.x, Node.js 20.x, pnpm 10.x, gcloud CLI

**Cost Savings:** ~$25/mo fixed vs variable per-minute GitHub Actions billing (~$0.008/min).

#### Runner Management Commands

```bash
# Check runner status
ferni runner status              # Full status with GCE info
ferni runner status --json       # JSON output

# Restart the runner service
ferni runner restart             # Graceful restart
ferni runner restart --force     # Force stop + start

# View logs
ferni runner logs                # Last 50 lines
ferni runner logs --follow       # Stream in real-time
ferni runner logs --lines 100    # Last 100 lines

# SSH into the runner
ferni runner ssh
```

#### Workflows Using Self-Hosted Runner

The following workflows run on the self-hosted runner:
- `ci.yml` - All CI jobs (lint, test, build)
- `deploy-gce.yml` - GCE deployments

To use in a workflow:
```yaml
jobs:
  build:
    runs-on: [self-hosted, Linux, X64, gce]
```

#### Security Considerations

- The runner executes code from PRs - **restrict to protected branches** if you accept external PRs
- Runner service auto-starts on boot via systemd
- Consider adding more runners for parallel job execution

**Key files:** `apps/cli/src/commands/runner/`, `.github/workflows/ci.yml`

## ⚡ Build Optimization (pnpm + esbuild)

We use **esbuild** for fast TypeScript compilation and **pnpm** for fast dependency installs.

### Build Time Comparison

| Build Method    | Time     | Files | Speedup         |
| --------------- | -------- | ----- | --------------- |
| `tsc` (old)     | 9.5s     | 1,400 | baseline        |
| `esbuild` (new) | **0.9s** | 1,400 | **~12x faster** |
| `npm ci` (old)  | ~45s     | -     | baseline        |
| `pnpm install`  | ~11s     | -     | **~4x faster**  |

### Docker Build Times

| Service     | Before    | After       | Savings |
| ----------- | --------- | ----------- | ------- |
| Voice Agent | 15-20 min | **2-4 min** | ~80%    |
| UI Server   | 8-12 min  | 3-5 min     | ~60%    |

### How It Works

1. **Kaniko** in Cloud Build provides aggressive layer caching (1 week TTL)
2. **pnpm** uses content-addressable storage for faster installs
3. **esbuild** transpiles TypeScript without type checking (use `build:fast`)
4. Type declarations (`.d.ts`) are optional - skip them in Docker builds

### When to Use Each

| Command                 | Use Case                                   |
| ----------------------- | ------------------------------------------ |
| `pnpm build:fast`       | Development, Docker builds (fastest)       |
| `pnpm build:fast:types` | When you need .d.ts files                  |
| `pnpm build`            | Full tsc build (for debugging type errors) |
| `pnpm typecheck`        | Type checking without emitting files       |

**Docs:** See `docs/deployment/BUILD-OPTIMIZATIONS.md` for full details.

## 🎨 Design System (SINGLE SOURCE OF TRUTH)

All design tokens live in `design-system/tokens/*.json`. **Never edit generated files directly.**

### Quick Commands

```bash
# Via pnpm scripts
pnpm tokens:sync       # Build & sync all tokens (run after editing JSON)
pnpm tokens:check      # Validate no drift (runs in pre-commit & CI)

# Via Ferni CLI (recommended)
ferni tokens sync                        # Build & sync all tokens
ferni tokens check                       # Validate no drift
ferni tokens version                     # Show current token version
ferni tokens version patch "Fixed X"     # Bump patch version with changelog
ferni tokens watch                       # Watch for changes during development
ferni tokens brand                       # Check brand color alignment
```

### What Gets Generated

| Source                  | Generated                          | Used By             |
| ----------------------- | ---------------------------------- | ------------------- |
| `tokens/colors.json`    | `dist/tokens.css`                  | Frontend app        |
| `tokens/animation.json` | `animation-constants.generated.ts` | Frontend animations |
| `tokens/colors.json`    | `tailwind.config.generated.js`     | Promo website       |
| `tokens/*.json`         | `promo/css/design-tokens.css`      | Landing page        |

### Adding a New Persona Color

1. Edit `design-system/tokens/colors.json` → add to `personas` object
2. Edit `design-system/tokens/personas.json` → add full persona profile
3. Run `pnpm tokens:sync`
4. Commit all generated files

### Adding a New Animation

1. Edit `design-system/tokens/animation.json`
2. Run `pnpm build:animation-constants`
3. Import from `animation-constants.generated.ts`

### Pre-commit Hook

Token drift is checked automatically. If you see drift warnings:

```bash
pnpm tokens:sync
git add -A
```

### CI/CD

GitHub Actions runs `tokens:check` on every PR touching design tokens. Drift = failed build.

**Key files:** `design-system/tokens/`, `design-system/*.js`, `.github/workflows/token-check.yml`

### Brand Alignment (Automated)

Brand colors are validated against `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md`:

```bash
pnpm brand:check    # Validate tokens match brand guidelines
pnpm tokens:check   # Validate generated files match source
```

### Critical Brand Colors (Never Change Without Design Review)

| Name             | Hex       | Usage                           |
| ---------------- | --------- | ------------------------------- |
| **Accent (CTA)** | `#3D5A45` | Buttons, links, primary actions |
| **Ferni**        | `#4a6741` | Ferni persona avatar            |
| **Natural Ink**  | `#2C2520` | Primary text                    |

### Color Rules for AI Agents

**ALWAYS use CSS variables** - never hardcode hex values:

```css
/* CORRECT */
color: var(--color-ferni);
background: var(--color-accent);

/* WRONG - will fail brand:check */
color: #4a6741;
background: #3d5a45;
```

**ESLint enforces design tokens** in `apps/web/src/ui/**/*.ts`:

- 🎨 Hardcoded hex colors → Use `var(--color-*)` or `var(--persona-*)`
- 🎨 Hardcoded rgba() → Use `var(--backdrop-*)` or `var(--persona-tint)`
- 📝 Hardcoded font-family → Use `var(--font-body)` or `var(--font-display)`
- 💨 Hardcoded blur values → Use `var(--glass-blur-subtle)` or `var(--glass-blur-heavy)`
- ⏱️ Hardcoded durations → Use `DURATION.SLOW`, `DURATION.NORMAL` from animation-constants
- 🌫️ Hardcoded box-shadow → Use `var(--shadow-sm)`, `var(--shadow-md)`, etc.

**In Tailwind configs**, use CSS variable references:

```javascript
// CORRECT - single source of truth
ferni: {
  DEFAULT: 'var(--color-ferni)';
}

// WRONG - causes drift
ferni: {
  DEFAULT: '#4a6741';
}
```

**Before modifying any color**, check the brand guidelines:

1. Read `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md`
2. Modify `design-system/tokens/colors.json` (source of truth)
3. Run `pnpm tokens:sync`
4. Run `pnpm brand:check`

## 📝 Developer Blog (developers.ferni.ai/blog)

Content management for the developer-facing blog. All posts live in `apps/website/ferni-website/src/dev-blog/`.

### Quick Commands

```bash
# Content generation
pnpm devblog:changelog          # Generate changelog post from git release
pnpm devblog:changelog:dry      # Preview changelog (don't create file)

# Image generation
pnpm devblog:image              # Generate single OG image (interactive)
pnpm devblog:images:batch       # Generate OG images for all posts

# Newsletter & Social
pnpm devblog:newsletter         # Generate weekly digest newsletter
pnpm devblog:newsletter:preview # Preview newsletter without saving
pnpm devblog:social             # Generate social snippets for recent posts
pnpm devblog:social:batch       # Generate snippets for all posts
```

### Via Ferni CLI

```bash
ferni devblog changelog v1.2.3  # Generate changelog for version
ferni devblog images            # Batch generate OG images
ferni devblog newsletter        # Generate weekly newsletter
ferni devblog social            # Generate social snippets
```

### File Structure

| Path | Purpose |
|------|---------|
| `apps/website/ferni-website/src/dev-blog/*.md` | Blog posts (frontmatter + markdown) |
| `apps/website/ferni-website/images/dev-blog/*.png` | OG images (1200x630) |
| `apps/website/ferni-website/social-snippets/*.json` | Social media snippets |
| `apps/website/ferni-website/newsletters/*.html` | Generated newsletters |
| `brand/docs/DEVELOPER-BLOG-365-PLAN.md` | Content strategy & calendar |
| `brand/docs/CONTENT-CALENDAR-TEMPLATE.md` | Weekly planning template |

### Adding a New Post

1. Create `apps/website/ferni-website/src/dev-blog/your-post.md` with frontmatter:

```yaml
---
title: "Your Post Title"
excerpt: "Brief description for cards and SEO"
author: "Your Name"
authorInitials: "YN"
authorColor: "#38bdf8"
date: 2026-01-12
category: "Tutorial"
image: "your-post.png"
readTime: 5
---
```

2. Generate OG image: `pnpm devblog:image --title "Your Post Title" --category tutorial`

3. Build site: `cd apps/website/ferni-website && npx @11ty/eleventy`

### Categories

| Category | Color | Use For |
|----------|-------|---------|
| Tutorial | Cyan | Step-by-step guides |
| Changelog | Emerald | Release notes |
| Deep Dive | Violet | Architecture, internals |
| Case Study | Amber | Customer stories |
| Community | Pink | Community spotlights |
| Quick Tip | Blue | Short tips, snippets |

### RSS Feeds

- Atom: `https://developers.ferni.ai/developers/blog/feed.xml`
- JSON: `https://developers.ferni.ai/developers/blog/feed.json`

### GitHub Action (Automated Changelog)

The `.github/workflows/dev-blog-changelog.yml` action automatically:
1. Generates a changelog post when a release is published
2. Creates an OG image for the release
3. Commits and pushes the new post
4. Posts to Slack (if configured)

## 🔌 Agent Extensibility System

Extend personas with custom commands, hooks, MCP servers, and embeddable widgets. **All extensions are opt-in and per-persona.**

| Feature         | Location                                          | Purpose                    |
| --------------- | ------------------------------------------------- | -------------------------- |
| **Commands**    | `src/personas/bundles/{persona}/commands/*.md`    | Slash commands in UI       |
| **Shell Hooks** | `src/personas/bundles/{persona}/hooks/*.sh`       | Pre/post execution scripts |
| **MCP Servers** | `src/personas/bundles/{persona}/mcp/servers.json` | Model Context Protocol     |
| **Widget SDK**  | `src/api/widget-routes.ts`                        | Embed on external websites |

### Adding Commands to a Persona

```bash
# Create commands folder
mkdir -p src/personas/bundles/ferni/commands

# Add a command (markdown with frontmatter)
cat > src/personas/bundles/ferni/commands/morning-ritual.md << 'EOF'
---
title: Morning Ritual
description: Start your day with intention
category: rituals
---
Guide me through a morning ritual to set intentions for today.
EOF
```

### Embedding Widget on External Sites

```html
<script
  src="https://your-domain.com/api/widget/embed.js"
  data-widget-id="widget_abc123"
  async
></script>
```

**Full documentation:** `docs/architecture/AGENT-EXTENSIBILITY.md`

## Dev Mode (Testing Subscription & Team Unlocks)

```bash
# Enable dev mode
http://localhost:3004/?dev    # URL parameter
# OR
localStorage.setItem('ferni_dev_mode', 'true')  # Browser console

# Keyboard shortcuts (when dev mode active)
Cmd/Ctrl+Shift+D  # Toggle dev panel
Cmd/Ctrl+Shift+U  # Quick unlock all team members
Cmd/Ctrl+Shift+R  # Reset to free tier
```

## 🍞 Toast Guidelines (MANDATORY)

Toasts are Ferni's brief voice in UI feedback. **Never** use enterprise software patterns - keep them warm, human, and SHORT.

### Toast Rules

| Rule                    | Wrong                                     | Right                                   |
| ----------------------- | ----------------------------------------- | --------------------------------------- |
| **Keep short**          | "Payment failed. Please try again."       | "Payment didn't go through. Try again?" |
| **Use contractions**    | "Failed to save changes"                  | "Couldn't save that"                    |
| **Avoid "Please"**      | "Please enter a valid email"              | "Enter a valid email"                   |
| **Drop "successfully"** | "Voice enrollment complete successfully!" | "Got it! I'll know your voice now."     |
| **Human tone**          | "Error: Connection timeout"               | "Lost connection. Retry?"               |
| **Consistent errors**   | "Failed to X"                             | "Couldn't X"                            |

### Toast Types

| Type              | Duration | Use For        | Example                        |
| ----------------- | -------- | -------------- | ------------------------------ |
| `toast.success()` | 2.5s     | Confirmations  | "Saved!"                       |
| `toast.info()`    | 2.5s     | Status updates | "Just a moment..."             |
| `toast.warning()` | 2.5s     | Soft alerts    | "Add a name first"             |
| `toast.error()`   | 4s       | Failures       | "Couldn't connect. Try again?" |

### Pattern Templates

```typescript
// ✅ Success - celebrate briefly
toast.success('Saved!');
toast.success(`${name} added!`);

// ✅ Info - minimal status
toast.info('Just a moment...');
toast.info('Checking...');

// ✅ Warning - guide action
toast.warning('Add a name first');
toast.warning('Your voice profile needs a refresh');

// ✅ Error - acknowledge + offer retry
toast.error("Couldn't save that. Try again?");
toast.error("That didn't work. Retry?");
```

### Anti-patterns (NEVER USE)

```typescript
// ❌ Too formal
toast.error('Failed to process your request. Please try again later.');

// ❌ Too technical
toast.error('Error: API_TIMEOUT_EXCEPTION');

// ❌ Too long
toast.info('Your upgrade is processing. It may take a moment to reflect everywhere.');

// ❌ Missing warmth
toast.success('Operation completed successfully');
```

### Admin vs User Toasts

- **User-facing**: Warm, human, supportive
- **Admin-facing**: Can be slightly more technical, but still concise

## Read First

- **Architecture**: `docs/architecture/CLEAN-ARCHITECTURE.md`
- **Tool Loading**: `docs/architecture/TOOL-LOADING-SYSTEM.md` (how tools get to Gemini, config files, debugging)
- **Memory Management**: `docs/architecture/MEMORY-MANAGEMENT.md` (stateless Node, caching, cleanup)
- **Dynamic Memory**: `src/memory/dynamic/CLAUDE.md` (L1/L2/L3 memory, fast capture, deep extraction)
- **Pre-STT Audio Enhancement**: `docs/architecture/PRE-STT-AUDIO-ENHANCEMENT.md` (Rust DSP, AGC, noise suppression, bandwidth extension)
- **DJ/Music System**: `src/audio/CLAUDE.md` (DJController state machine, decision/speech/timing engines)
- **Tool/Persona patterns**: `docs/architecture/AGENT-AGNOSTIC-ARCHITECTURE.md`
- **Agent Extensibility**: `docs/architecture/AGENT-EXTENSIBILITY.md` (commands, hooks, MCP, widgets)
- **Cross-Persona Intelligence**: `docs/architecture/CROSS-PERSONA-INTELLIGENCE.md` (team coordination, superhuman services)
- **Superhuman Services**: `src/services/superhuman/README.md` (10 "Better than Human" capabilities)
- **Monetization & Team Unlocks**: `docs/architecture/MONETIZATION-SYSTEM.md`
- **Full coding standards**: `.cursorrules` (22KB comprehensive guide)
- **Design System**: `design-system/README.md` (tokens, animations, colors)
- **Design System Audit**: `docs/audits/DESIGN-SYSTEM-AUDIT.md` (consolidation status)
- **Emotional Intelligence**: `design-system/docs/brand/BETTER-THAN-HUMAN.md`

## 🧠 Dynamic Memory System (January 2026)

Three-layer memory architecture for "Better than Human" memory:

```
User Speech → fastCapture() → STM Buffer (L1) → onSessionEnd() → Firestore (L2)
                    │                                                    │
                    └→ AsyncEvents → DeepExtractionWorker → Firestore ───┤
                                                                         │
                                                              Background Sync
                                                                         │
                                                              Spanner Graph (L3)
```

| Layer | Storage | Latency | Purpose |
|-------|---------|---------|---------|
| **L1: STM** | In-memory | < 1ms | Current session context, entity frequency |
| **L2: Working** | Firestore | 50-150ms | Recent entities, facts, relationships |
| **L3: Long-Term** | Spanner | 100-200ms | Relationship graph, cross-session patterns |

### Quick Commands

```bash
# View dynamic memory metrics
curl http://localhost:8080/api/observability/dynamic-memory

# Run dynamic memory tests
pnpm vitest run src/memory/dynamic/__tests__/ src/tests/synthetic/dynamic-memory-e2e.test.ts

# Run with Firestore emulator
firebase emulators:start --only firestore &

# Memory scheduler management
ferni ops memory:deploy-scheduler    # Deploy all memory scheduler jobs
ferni ops memory:scheduler-status    # Show scheduler job status
ferni ops memory:trigger <job>       # Manually trigger a job
ferni ops memory:list                # List available jobs
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/tests/integration/
```

### Key Files

| File | Purpose |
|------|---------|
| `src/memory/dynamic/fast-capture.ts` | Real-time extraction (< 50ms) |
| `src/memory/dynamic/stm-buffer.ts` | In-memory session context |
| `src/memory/dynamic/deep-extraction-worker.ts` | Async LLM extraction (Gemini 1.5 Flash) |
| `src/memory/dynamic/stm-promotion.ts` | Session-end promotion to Firestore |
| `src/memory/dynamic/firestore-spanner-sync.ts` | Background sync to Spanner |
| `src/memory/dynamic/metrics.ts` | Observability metrics |

### Integration Points

| Component | How It Uses Dynamic Memory |
|-----------|---------------------------|
| `turn-handler.ts` | Calls `fastCapture()` + `recordTurn()` |
| `turn-processor.ts` | Calls `fastCapture()` + `recordTurn()` |
| `transcript-handler.ts` | Calls `fastCapture()` + `recordTurn()` |
| `end-session.ts` | Calls `onSessionEnd()` for STM promotion |
| `gce-voice-worker.ts` | Starts deep extraction worker + sync service |
| `dynamic-memory-context.ts` | Context builder retrieves from Firestore |

### Test Coverage

| Suite | Tests |
|-------|-------|
| Unit tests | 35 |
| E2E tests | 76 |
| Integration tests | 11 |
| **Total** | **122** |

### Memory Maintenance Jobs (Cloud Scheduler)

The memory system runs scheduled maintenance jobs via Cloud Scheduler:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `memory-consolidation` | Weekly (Sun 3am PT) | Merge related memories, reduce storage |
| `memory-decay` | Daily (4am PT) | Graceful forgetting, decay old memories |
| `memory-deduplication` | Weekly (Sat 2am PT) | LSH-based duplicate cleanup |
| `memory-health-check` | Every 4 hours | Monitor system health, send alerts |
| `knowledge-graph-insights` | Daily (2am PT) | Generate insights from entity patterns |
| `knowledge-graph-consolidation` | Weekly (Mon 3am PT) | Merge duplicate entities |
| `knowledge-graph-thread-maintenance` | Daily (4am PT) | Mark dormant threads, cleanup expired |
| `knowledge-graph-entity-decay` | Daily (5am PT) | Apply importance decay to entities |

**Deployment:**
```bash
# Deploy all memory scheduler jobs
ferni ops memory:deploy-scheduler

# Check job status
ferni ops memory:scheduler-status

# Manually trigger a job
ferni ops memory:trigger memory-health-check
```

**Key Files:**
- API handlers: `src/api/scheduled-jobs.routes.ts`
- Job classes: `src/tasks/scheduled/memory-jobs.ts`, `knowledge-graph-jobs.ts`
- Scheduler YAML: `infra/cloud-scheduler-memory.yaml`, `cloud-scheduler-knowledge-graph.yaml`
- CLI: `apps/cli/src/commands/ops/memory-scheduler.ts`

## 🚀 Ferni EQ - Superhuman Emotional Intelligence

Ferni's avatar implements **superhuman emotional intelligence** - this is core to our "Better than Human" brand promise.

### Five Capabilities (All Required for Avatar Code)

| Capability            | What                                  | Why                                |
| --------------------- | ------------------------------------- | ---------------------------------- |
| **Micro-Expressions** | 40-150ms subliminal emotional flashes | Builds trust unconsciously         |
| **Active Listening**  | Micro-nods during user speech         | Shows moment-to-moment presence    |
| **Breath Sync**       | Sync breathing with user rhythm       | Neural mirroring builds connection |
| **Concern Detection** | Detect distress from voice/content    | Show care before user asks         |
| **Anticipation**      | Show emotion before user finishes     | "They understand me" feeling       |

### Implementation Rules

```typescript
// ✅ ALWAYS - Initialize Ferni EQ system
import { initFerniEQ, ferni } from './ui/better-than-human.ui.js';

// ✅ ALWAYS - Micro-expressions are subliminal (40-150ms)
ferni.playMicroExpression('recognition'); // 80ms

// ✅ ALWAYS - Active listening during user speech
onUserSpeechStart() { ferni.startActiveListening(); }
onUserSpeechPause(duration) { ferni.onUserSpeechPause(duration); }

// ✅ ALWAYS - Enable breath synchronization
ferni.setBreathSyncEnabled(true);

// ✅ ALWAYS - Analyze for concern signals
ferni.analyzeConcern({ transcript, voiceStrain });

// ✅ ALWAYS - Anticipate from partial input
ferni.anticipateEmotion({ transcript: partial, tone });
```

### Avatar Expression Rules

| Wrong                                 | Right                         |
| ------------------------------------- | ----------------------------- |
| Static avatar during user speech      | Active listening micro-nods   |
| React only after message complete     | Anticipate from partial input |
| Expression duration > 150ms for micro | Subliminal: 40-150ms          |
| Ignore user breathing patterns        | Sync breathing gradually      |
| Wait for explicit "I'm sad"           | Detect distress signals early |

**Reference:** `design-system/docs/brand/BETTER-THAN-HUMAN.md` for full documentation.

### Backend → Frontend Integration

The backend detects emotions and dispatches events to the frontend EQ system:

```
Backend (voice-agent)              Frontend (better-than-human.ui.ts)
─────────────────────              ─────────────────────────────────
turn-handler.ts
     │
     ▼
emotion-event-dispatcher.ts
     │
     ├─→ humanization_signal ─────→ handleBetterThanHumanSignal()
     │   (concern_detected,            │
     │    voice_state_detected,        ▼
     │    emotional_trajectory)    playMicroExpression()
     │                             analyzeConcern()
     └─→ mood (existing) ─────────→ emotionState.update()
```

**Key files:**

- Backend: `src/agents/realtime/emotion-event-dispatcher.ts`
- Frontend: `apps/web/src/ui/better-than-human.ui.ts`

## 🤝 Cross-Persona Intelligence System

The team collaborates like real experts - sharing insights, coordinating handoffs, providing unified support.

### Quick Reference

| Component               | Location                                          | Purpose                             |
| ----------------------- | ------------------------------------------------- | ----------------------------------- |
| **Persona Builders**    | `src/intelligence/context-builders/*-insights.ts` | Deep briefings for each persona     |
| **Superhuman Services** | `src/services/superhuman/`                        | 10 "Better than Human" capabilities |
| **Insights Service**    | `src/services/cross-persona-insights.ts`          | Central insight management          |
| **WebSocket Server**    | `src/services/insights-websocket.ts`              | Real-time streaming                 |
| **Debug Panel**         | `apps/web/src/ui/insights-debug-panel.ui.ts`      | Debug tools                         |

### Persona Context Builders

Each persona has a specialized builder that activates on entry/handoff:

| Builder                          | What It Provides                                            |
| -------------------------------- | ----------------------------------------------------------- |
| `peter-research-insights.ts`     | Cross-team data, financial patterns, proactive triggers     |
| `maya-coaching-insights.ts`      | Habit health, Four Tendencies, mood correlations            |
| `jordan-milestone-insights.ts`   | Planning velocity, celebration readiness, seasonal patterns |
| `alex-communication-insights.ts` | Calendar density, response velocity, delegation clarity     |
| `nayan-wisdom-insights.ts`       | Life synthesis, values alignment, existential context       |
| `ferni-coordinator-insights.ts`  | Smart handoff suggestions from team insights                |

### 10 Superhuman Services

| Service                 | Human Limitation It Overcomes  |
| ----------------------- | ------------------------------ |
| Commitment Keeper       | Friends forget promises        |
| Predictive Coaching     | Can't see patterns objectively |
| Life Narrative          | Hard to maintain perspective   |
| Values Alignment        | Friends avoid confrontation    |
| Emotional First Aid     | Takes time to respond          |
| Relationship Network    | Can't track everyone           |
| Capacity Guardian       | Often too late for burnout     |
| Dream Keeper            | Dreams get buried              |
| Relationship Milestones | Forgets anniversaries          |
| Seasonal Awareness      | Doesn't track cycles           |

### Caching (Performance Critical)

Tiered caching with different TTLs:

| Tier   | TTL    | Capabilities                       |
| ------ | ------ | ---------------------------------- |
| STABLE | 5 min  | seasonal, narrative, values        |
| NORMAL | 2 min  | network, dreams, milestones        |
| FRESH  | 30 sec | commitments, predictions, capacity |

```typescript
// Pre-warm cache on session start
await warmupSuperhumanCache(userId);

// Get performance stats
const stats = getPerformanceStats();
```

### WebSocket Real-Time Updates

High-priority insights stream to frontend via `/ws/insights`:

```typescript
// Frontend
initCrossTeamNotifications(userId);

// Backend broadcasts automatically
addCrossPersonaInsight(userId, { priority: 'high', ... });
```

### Testing

```bash
# Unit tests
pnpm vitest run src/tests/cross-persona

# Firestore integration (requires emulator)
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run superhuman-firestore
```

**Full docs:** `docs/architecture/CROSS-PERSONA-INTELLIGENCE.md`

## 🦸 200% Persona System - Superhuman Capabilities

Every persona has "200% capabilities" that go beyond normal conversation - superhuman insights that no human friend could consistently provide.

### Architecture Overview

```
Persona Bundle (src/personas/bundles/{persona}/)
├── identity/
│   └── system-prompt.md         # Core identity
├── content/
│   └── behaviors/
│       ├── superhuman-insights.json   # 200% pattern surfacing
│       ├── trust-phrases.json         # Persona-voiced trust outputs
│       ├── i-notice-power.json        # "I notice" statements
│       ├── late-night-presence.json   # 2am wisdom
│       ├── emotional-intelligence.json # Emotion detection patterns
│       ├── self-doubt.json            # Vulnerability moments
│       ├── secret-fears.json          # Deeper vulnerabilities
│       └── mortality-awareness.json   # Death/legacy reflections
└── persona.manifest.json        # Config and capabilities
```

### Context Builders (src/intelligence/context-builders/)

| Builder                    | JSON Source                                                        | What It Injects                                              |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `superhuman-insights.ts`   | `superhuman-insights.json`, `i-notice-power.json`                  | Pattern surfacing, "The Mirror", anticipatory cues           |
| `trust-context.ts`         | `trust-phrases.json`                                               | Reading between lines, boundary awareness, growth reflection |
| `physical-presence.ts`     | `late-night-presence.json`                                         | Late night wisdom, grounding exercises                       |
| `persona-vulnerability.ts` | `self-doubt.json`, `secret-fears.json`, `mortality-awareness.json` | Vulnerability moments                                        |
| `emotional.ts`             | `emotional-intelligence.json`                                      | Persona-specific emotional responses                         |
| `tool-humanization.ts`     | Persona cognitive profiles                                         | Natural tool usage framing (no "querying database")          |

### Content Loading (src/services/persona-content-loader.ts)

```typescript
// ✅ ALWAYS load content for the active persona
import { loadTrustPhrases, loadSuperhumanInsights } from '../services/persona-content-loader.js';

// Load persona-specific content (NOT hardcoded to Ferni!)
const trustPhrases = await loadTrustPhrases(persona.id); // ✅ Persona-aware
const insights = await loadSuperhumanInsights(persona.id); // ✅ Persona-aware

// ❌ NEVER hardcode persona IDs
const trustPhrases = await loadTrustPhrases('ferni'); // ❌ Wrong!
```

### Adding 200% Capabilities to a New Persona

1. Create JSON behavior files in `src/personas/bundles/{persona}/content/behaviors/`:
   - `superhuman-insights.json` - Domain-specific pattern surfacing
   - `trust-phrases.json` - Persona-voiced trust outputs
   - `i-notice-power.json` - "I notice" statements for their domain
   - `late-night-presence.json` - Late night wisdom
   - `self-doubt.json` - Vulnerability about their expertise
   - `secret-fears.json` - Deeper fears
   - `mortality-awareness.json` - Legacy reflections

2. The bundle loader (`src/personas/bundles/loader.ts`) automatically loads these files.

3. Context builders automatically use `persona.id` to load the correct content.

### Testing 200% Capabilities

```bash
# Run all persona E2E tests
pnpm vitest run persona-e2e

# Run context injection integration tests
pnpm vitest run context-injection-integration
```

### Key Implementation Rules

| Wrong                                            | Right                            |
| ------------------------------------------------ | -------------------------------- |
| Hardcode `'ferni'` in context builders           | Use `persona.id` dynamically     |
| Load content once globally                       | Load per-persona with caching    |
| Generic trust phrases                            | Persona-voiced phrases from JSON |
| Check `if (persona.id !== 'ferni')` return early | Support ALL personas             |

**Reference:** `docs/PERSONA-EXCELLENCE-PLAN.md` for the full implementation plan.

## 🎙️ LLM Selection: OpenAI Realtime vs Gemini Live

Ferni supports two real-time LLM backends. **OpenAI Realtime is recommended** for production due to reliable native function calling.

### Toggle Between LLMs

```bash
# .env configuration
USE_OPENAI_REALTIME=true   # OpenAI Realtime (recommended)
USE_OPENAI_REALTIME=false  # Gemini Live
```

### Comparison

| Feature              | OpenAI Realtime                     | Gemini Live                                 |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| **Function Calling** | ✅ Native (protocol-level)          | ⚠️ JSON workaround (unreliable)             |
| **TTS Integration**  | Cartesia (text mode)                | Cartesia (text mode)                        |
| **Turn Detection**   | `server_vad`                        | `realtime_llm`                              |
| **Pricing**          | ~$0.06/min input, ~$0.24/min output | ~$0.035/min                                 |
| **Reliability**      | ✅ Consistent tool execution        | ⚠️ Sometimes chats instead of calling tools |

### Architecture

Both LLMs use **text-only mode** with Cartesia TTS for persona voices:

```
User Speech → OpenAI/Gemini (text) → Cartesia TTS (persona voice) → Audio
```

### Key Files

| File                                    | Purpose                                 |
| --------------------------------------- | --------------------------------------- |
| `src/agents/multi-agent/agent-setup.ts` | LLM selection logic (multi-agent mode)  |
| `src/agents/voice-agent-entry.ts`       | LLM selection logic (single-agent mode) |
| `.env` → `USE_OPENAI_REALTIME`          | Feature flag                            |

### Log Signatures

```bash
# OpenAI Realtime active:
🔮 Creating OpenAI Realtime model (text-only → Cartesia TTS)
"type": "function_call"           # Native function call
"type": "function_call_output"    # Tool result

# Gemini Live active:
🤖 Using model: gemini-2.0-flash-exp
🎯 JSON function call detected    # Workaround intercept
```

## 🔧 Function Calling System (Gemini Only - CRITICAL)

**NOTE:** This section only applies when using Gemini Live (`USE_OPENAI_REALTIME=false`). OpenAI Realtime has native function calling that doesn't need this workaround.

Ferni uses a **custom JSON-based function calling workaround** because Gemini Live API's native function calling is unreliable. This is a fragile system that has been carefully tuned.

**Full documentation:** `docs/architecture/FUNCTION-CALLING-SYSTEM.md`
**Tool Loading Pipeline:** `docs/architecture/TOOL-LOADING-SYSTEM.md` (config files, when tools load, debugging)

### The JSON Format (Single Source of Truth)

```json
{ "fn": "toolName", "args": { "key": "value" } }
```

### Key Files (ALL must stay in sync)

| File                                                                    | Purpose                                    |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| `src/personas/bundles/shared/function-calling-base.md`                  | Prompt instructions for JSON format        |
| `src/personas/bundles/{persona}/identity/function-calling-specialty.md` | Per-persona specialty tools                |
| `src/agents/shared/tool-call-sanitizer.ts`                              | Intercepts JSON from TTS stream            |
| `src/agents/shared/json-function-executor.ts`                           | Routes JSON to actual tool implementations |
| `src/agents/shared/function-call-format.ts`                             | TypeScript types and registered tools      |

### When Adding a New Tool (ALL STEPS REQUIRED)

1. Add to `function-calling-base.md` OR `function-calling-specialty.md`
2. Add tool name to `tool-call-sanitizer.ts` → `TOOL_NAME_PATTERNS`
3. Add route to `json-function-executor.ts` → `routeToTool()`
4. Add to `function-call-format.ts` → `REGISTERED_TOOLS`
5. Test with voice: say the trigger phrase, verify tool executes

### ⛔ NEVER DO (Will Break Voice Agent)

| Wrong                                         | Why It Breaks                              |
| --------------------------------------------- | ------------------------------------------ |
| Change JSON format without updating ALL files | Sanitizer won't detect calls               |
| Add tool only to prompt (skip sanitizer)      | LLM outputs "toolName query xyz" as speech |
| Add tool only to executor (skip prompt)       | LLM won't know to output JSON for it       |
| "Clean up" or "refactor" these files          | System is tuned through trial and error    |
| Change `fn`/`args` key names                  | Regex patterns won't match                 |

### Debugging Tool Calls

```bash
# Watch for these logs:
🎯 JSON function call detected    # Good - JSON intercepted
🔧 Executing JSON function call   # Good - tool running
🚨 TOOL CALL LEAKAGE DETECTED     # Bad - LLM spoke instead of calling
```

### Full Response Logging (Debug Mode)

By default, long responses (LLM output, TTS text, tool results) are **truncated in logs** to keep output manageable. To see **full, untruncated responses**:

```bash
# Enable full response logging (WARNING: produces large log output!)
LOG_FULL_RESPONSES=true pnpm dev
```

| Env Variable | Default | Effect |
|--------------|---------|--------|
| `LOG_FULL_RESPONSES` | `false` | When `true`, disables truncation of LLM responses, TTS text, and tool results in logs |

**Use this when:**
- Debugging why speech sounds wrong (e.g., SSML tags being spoken)
- Tracing tool call arguments and results
- Investigating conversation flow issues

**Key log traces affected:**
- `E2E_LLM_OUTPUT` - Raw LLM response
- `E2E_TTS_OUTPUT` - Final text sent to TTS
- `E2E_USER_INPUT` - User transcript
- `E2E_TOOL_SUCCESS` - Tool execution results

### Quick Validation

```bash
# Test with voice agent
pnpm dev

# Say these and verify tools execute:
"Play some jazz"                  # → music should play
"What's the weather?"             # → should get weather data
"Transfer me to Maya"             # → should handoff
```

### Tool Selection Architecture (How Tools Become Voice-Callable)

Ferni has **tools across 118 domains**. The system uses semantic selection to pick the right tools per conversation turn.

#### Config: `data/model-config.json`

```json
{
  "toolDefaults": {
    "enabledDomains": [],     // Empty = ALL domains available (semantic selection decides)
    "maxTools": 60,           // Max tools sent to LLM per turn
    "includedTools": [...]    // Always-include tools (music, weather, etc.)
  }
}
```

| Setting                               | Value         | Effect                                                             |
| ------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `enabledDomains: []`                  | Empty array   | **All 118 domains available** - semantic router picks relevant ones |
| `enabledDomains: ["grief", "career"]` | Specific list | Only those domains available                                       |
| `maxTools: 60`                        | Number        | Cap on tools sent to LLM (prevents context bloat)                  |
| `includedTools`                       | Array         | Always included regardless of semantic match                       |

#### How Tool Selection Works

```
User: "Help me process grief"
         ↓
1. unified-tool-orchestrator.ts receives request
         ↓
2. detectToolIntent() → { domains: ["grief"], confidence: 0.9 }
         ↓
3. getToolsForDomains(["grief"]) lazy-loads grief domain
         ↓
4. Semantic router scores tools by relevance
         ↓
5. Top 60 tools sent to LLM as native functions
         ↓
6. LLM calls processGrief() → tool executes
```

#### Key Files

| File                                                  | Purpose                                 |
| ----------------------------------------------------- | --------------------------------------- |
| `data/model-config.json`                              | Admin config (enabledDomains, maxTools) |
| `src/tools/orchestrator/unified-tool-orchestrator.ts` | Per-turn tool selection                 |
| `src/tools/dynamic-tool-router.ts`                    | Intent → domain mapping                 |
| `src/tools/semantic-router/`                          | Semantic matching engine                |
| `src/tools/domains/*/index.ts`                        | Domain tool definitions                 |

#### Adding a New Tool

1. Create tool in `src/tools/domains/{domain}/index.ts`
2. Export via `getToolDefinitions()` or `definitions` array
3. **Done!** Orchestrator auto-discovers and semantic router matches it

No manual wiring needed - the semantic router handles discovery.

## Critical Rules

### Never Do

| Wrong                             | Right                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `console.log()`                   | `createLogger()` from `utils/logger.js`                |
| `any` type                        | `unknown` + type narrowing                             |
| Files > 500 lines                 | Split into modules                                     |
| `as any` casts                    | Proper typing or `as unknown as T` with comment        |
| `.catch(() => {})`                | `.catch((e) => log.error({ error: e }, 'context'))`    |
| Persona-specific tool names       | Domain names: `habit-coaching.ts` not `maya-habits.ts` |
| Hardcoded colors `#4a6741`        | CSS variables: `var(--color-ferni)`                    |
| Hardcoded durations `300`         | Constants: `DURATION.SLOW`, `EASING.SPRING`            |
| Edit `*.generated.ts` files       | Edit source JSON in `design-system/tokens/`            |
| Edit `design-tokens.css` directly | Run `pnpm tokens:sync` after editing JSON              |

### Always Do

- Await all promises OR handle with proper `.catch()` logging
- Use `Result<T, E>` for expected failures, `throw` for bugs
- Register tools/builders via registry pattern (not direct exports)
- Write tests for new features (`src/tests/`, Vitest)
- Use `readonly` for data that shouldn't change
- Validate at boundaries (user input, API responses)
- Run `pnpm tokens:sync` after editing `design-system/tokens/*.json`

## File Naming

| Type    | Pattern                | Example             |
| ------- | ---------------------- | ------------------- |
| Modules | `kebab-case.ts`        | `user-profile.ts`   |
| Classes | `PascalCase.ts`        | `SessionManager.ts` |
| Tests   | `*.test.ts`            | `memory.test.ts`    |
| Types   | `*.types.ts` or inline | `user.types.ts`     |

## Variable Naming

| Type                | Pattern                 | Example                            |
| ------------------- | ----------------------- | ---------------------------------- |
| Functions/variables | `camelCase`             | `handleSilence`, `isReturningUser` |
| Classes/Types       | `PascalCase`            | `SessionServices`, `UserProfile`   |
| Constants           | `SCREAMING_SNAKE`       | `MAX_RETRY_ATTEMPTS`               |
| Booleans            | `is`/`has`/`can` prefix | `isActive`, `hasPermission`        |

## Module Suffix Conventions

When naming TypeScript modules, use consistent suffixes based on the module's responsibility:

| Suffix | Use When | Examples |
|--------|----------|----------|
| `-service.ts` | Stateless business logic, CRUD operations, external API integrations | `calendar-service.ts`, `auth-service.ts` |
| `-manager.ts` | Stateful resource management, lifecycle control, registry patterns | `session-manager.ts`, `cache-manager.ts` |
| `-handler.ts` | Reactive event/request processing, webhooks, message handling | `webhook-handler.ts`, `error-handler.ts` |
| `-engine.ts` | Complex algorithms, core domain logic, decision-making | `recommendation-engine.ts`, `humanization-engine.ts` |
| `-executor.ts` | Proactive task/job execution, scheduled work | `job-executor.ts`, `tool-executor.ts` |
| `-orchestrator.ts` | Multi-component coordination, workflow management | `multi-agent-orchestrator.ts`, `session-orchestrator.ts` |
| `-controller.ts` | **DEPRECATED** - Use `-handler.ts` for request/response handling |

### Rules

- **Don't mix patterns**: A module should be either a service OR a manager, not both
- **Same name, different layers is OK**: `utils/rate-limiter.ts` (generic) and `tools/rate-limiter.ts` (specialized) can coexist
- **Apply to new files only**: Don't mass-rename existing files (too risky)

## Architecture Layers

Import rules: Lower layers CANNOT import from higher layers (enforced by `pnpm quality:arch`).

```
Level 100 (Application):
  agents/           → Voice agent implementations
  api/              → API routes
  cli/              → CLI tools

Level 70 (Domain - peers can import each other):
  personas/         → Persona bundles + cognitive profiles
  intelligence/     → Context builders (emotion, memory, topics)
  tools/            → 118 tool domains (semantic selection)
  conversation/     → Conversation state, quality tracking
  speech/           → Audio prosody, emotion detection, SSML

Level 60 (Service):
  services/         → Business logic, DI container, session mgmt

Level 10-30 (Infrastructure):
  memory/           → Storage: Firestore, Postgres, Redis, embeddings
  config/           → Configuration
  utils/            → Shared utilities
  types/            → Type definitions
```

## 🎧 DJ/Music Architecture (January 2026 Refactor)

The DJ system uses a **state machine architecture** with single source of truth:

```
┌─────────────────────┐
│    DJController     │  ← Single source of truth for ALL DJ state
│   (State Machine)   │
└─────────────────────┘
          │
   ┌──────┼──────┐
   ▼      ▼      ▼
┌─────┐ ┌─────┐ ┌─────┐
│Decn │ │Spch │ │Time │   ← Pure function engines
│Engn │ │Engn │ │Engn │
└─────┘ └─────┘ └─────┘
          │
          ▼
┌─────────────────────┐
│    MusicPlayer      │  ← Low-level playback only
└─────────────────────┘
```

| Component | File | Purpose |
|-----------|------|---------|
| **DJController** | `src/audio/dj-controller.ts` | State machine (idle→playing→ducking→fading→stopped) |
| **DecisionEngine** | `src/audio/dj-decision-engine.ts` | Pure functions: when to duck, speak, interject |
| **SpeechEngine** | `src/audio/dj-speech-engine.ts` | What to say: phrases, intros, outros |
| **TimingEngine** | `src/audio/dj-timing-engine.ts` | Timer management for scheduled moments |
| **MusicPlayer** | `src/audio/music-player.ts` | Low-level playback (LiveKit/Spotify) |

### Usage

```typescript
// Get controller (singleton)
import { getDJController } from './audio/dj-controller.js';
const controller = getDJController();

// Dispatch commands (the ONLY way to change state)
controller.dispatch({ type: 'PLAY_TRACK', track, isAmbient: false });
controller.dispatch({ type: 'AGENT_SPEAKING_START' }); // Auto-ducks
controller.dispatch({ type: 'AGENT_SPEAKING_END' });   // Auto-unducks

// Query state
const isActive = controller.isMusicActive();
```

### Legacy Files (DELETED - Don't Import!)

- `dj-booth.ts` → Use `dj-controller.ts`
- `dj-enhancements.ts` → Logic in decision/speech engines
- `dj-integration.ts` → Logic in `music-handler.ts`

See `src/audio/CLAUDE.md` for full documentation.

## Before Creating New Files

1. **Search first**: Does this functionality exist? (`grep -r "functionName"`)
2. **Extend existing**: Can it go in an existing module?
3. **Follow patterns**: Look at sibling files in the directory
4. **Max 500 lines**: Plan to split if larger

## Error Handling Pattern

```typescript
// Expected failures: Result type
function parseConfig(input: string): Result<Config, ParseError> {
  if (!input) return err(new ParseError('empty input'));
  return ok(JSON.parse(input));
}

// Bugs/unexpected: throw
function assertNonNull<T>(value: T | null): T {
  if (value === null) throw new Error('Unexpected null');
  return value;
}
```

## Logging Pattern

```typescript
import { createLogger } from '../utils/logger.js';

const log = createLogger('ModuleName');

log.debug({ userId }, 'Processing request');
log.info({ result }, 'Operation completed');
log.warn({ attempt }, 'Retry needed');
log.error({ error: String(err) }, 'Operation failed');
```

## Module Organization Principles

When modules grow large (>500 lines), split into domain-focused submodules:

```
src/tools/habit-coaching.ts (monolith)  →  src/tools/habit-coaching/
                                              ├── types.ts       # Interfaces/types only
                                              ├── constants.ts   # Static data, enums
                                              ├── templates.ts   # Habit templates
                                              ├── bundles.ts     # Habit bundles
                                              ├── helpers.ts     # Utility functions
                                              ├── storage.ts     # Persistence layer
                                              └── index.ts       # Re-exports for backward compatibility
```

**Key patterns:**

- **Types first**: Extract interfaces to `types.ts`, import everywhere else
- **Index re-exports**: `index.ts` re-exports everything for backward-compatible imports
- **Data separate from logic**: Constants/templates in dedicated files, tools in main file
- **No circular imports**: Types → Constants → Data → Helpers → Main

## Behavior Science Integration

Habit coaching uses evidence-based methodologies:

| Concept          | Implementation                                          | Source             |
| ---------------- | ------------------------------------------------------- | ------------------ |
| Glidepath Levels | 5-level progression from tiny (2 min) to full lifestyle | Tiny Habits        |
| Habit Loops      | cue → routine → reward structure                        | The Power of Habit |
| Habit Stacking   | "After [CURRENT], I will [NEW]"                         | Atomic Habits      |
| Keystone Habits  | High-ripple habits that cascade changes                 | The Power of Habit |
| Four Tendencies  | Upholder/Questioner/Obliger/Rebel strategies            | Gretchen Rubin     |

Templates include: `tinyVersion`, `miniVersion`, `fullVersion`, `habitLoop`, `stacksWellWith`, `keystonePotential`

## 🛡️ Agent Guardrails (PREVENT MISTAKES)

**Before making changes, ALWAYS:**

1. Run `pnpm typecheck` - catches type errors immediately
2. Run `pnpm lint` - catches code style issues
3. Run `pnpm tokens:check` - catches design system drift

**Before suggesting deployment:**

1. Run `pnpm quality` - full quality check
2. Test the feature in browser if it's UI
3. Verify no regressions in related functionality

**Common Agent Mistakes to Avoid:**
| Mistake | Prevention |
|---------|------------|
| Breaking types | Run `pnpm typecheck` after EVERY edit |
| Hardcoded colors | Use `var(--color-*)` ALWAYS |
| console.log | Use `createLogger('Module')` |
| Editing generated files | Check filename for `.generated.` |
| Wrong deploy target | Check table in Deployment section |
| Forgetting to sync tokens | Run `pnpm tokens:sync` after token edits |
| Direct `gcloud run deploy` | **NEVER** - use `ferni deploy` (see below) |

**If pre-commit fails:**

```bash
pnpm lint:fix      # Auto-fix lint issues
pnpm format        # Auto-fix formatting
pnpm tokens:sync   # Fix token drift
```

## 🚨 DEPLOYMENT RULES (CRITICAL - READ BEFORE DEPLOYING)

### ⛔ FORBIDDEN DEPLOYMENT COMMANDS

These commands will be **BLOCKED by pre-commit hooks**:

```bash
# ❌ NEVER USE - Direct cloud commands skip health checks!
gcloud run deploy voiceai-agent ...
gcloud run deploy john-bogle-ui ...
gcloud compute ssh ... docker run ...
firebase deploy --only hosting
docker push gcr.io/...
```

### ✅ ALWAYS USE FERNI CLI

```bash
# ✅ CORRECT - Ferni CLI handles blue-green, health checks, cleanup
ferni deploy gce           # Voice agent to GCE
ferni deploy ui            # UI backend to Cloud Run
ferni deploy frontend      # Frontend to Firebase
ferni deploy landing       # Landing page
ferni deploy all           # Everything

# ✅ CORRECT - npm script aliases (also use Ferni CLI)
pnpm deploy:agent          # Voice agent
pnpm deploy:ui             # UI backend
```

### Why Ferni CLI?

| Direct gcloud        | Ferni CLI                     |
| -------------------- | ----------------------------- |
| ❌ No health checks  | ✅ Waits for `/health/ready`  |
| ❌ No rollback       | ✅ Auto-rollback on failure   |
| ❌ Zombie revisions  | ✅ Auto-cleanup old revisions |
| ❌ Choppy audio      | ✅ Zero-downtime blue-green   |
| ❌ Manual everything | ✅ One command                |

### Deployment Safety Enforcement

1. **Pre-commit hook** - Blocks commits with direct cloud commands
2. **CI/CD pipeline** - Uses Ferni CLI internally
3. **Code review** - `pnpm quality:deploy` scans for unsafe patterns

```bash
# Check for unsafe deployment patterns
pnpm quality:deploy
```

### Emergency Bypass (NEVER in normal circumstances)

```bash
# Only if systems are completely down and Ferni CLI broken
git commit --no-verify -m "EMERGENCY: ..."
# Then IMMEDIATELY fix and redeploy properly
```

## 🧬 Experiments & A/B Testing System (NEW!)

Autonomous experimentation system for data-driven decisions.

### Experiment Types

| Type | Algorithm | Use Case |
|------|-----------|----------|
| `ab` | Z-test significance | Classic A/B testing |
| `bandit` | Thompson Sampling | Dynamic traffic optimization |
| `rollout` | Stage-based (2%→10%→25%→50%→100%) | Safe feature rollouts |

### Quick Commands

```bash
ferni experiments list              # List all experiments
ferni experiments status            # Show experiment summary
ferni experiments show <id>         # Show experiment details
ferni experiments health <id>       # Show experiment health
ferni experiments start <id>        # Start an experiment
ferni experiments promote <id>      # Check and promote winner
```

### Key Files

| File | Purpose |
|------|---------|
| `src/tools/intelligence/learning/experiment-manager.ts` | Central orchestrator |
| `src/tools/intelligence/learning/auto-rollout.ts` | Auto-escalating rollout |
| `src/tools/intelligence/learning/bandit.ts` | Thompson Sampling MAB |
| `src/tools/intelligence/learning/sequential-test.ts` | SPRT early stopping |
| `src/api/experiment-routes.ts` | REST API |
| `apps/cli/src/commands/experiments/` | CLI commands |

**Full docs:** `src/tools/intelligence/learning/CLAUDE.md`

---

## 🤖 CEO Automation Roadmap

The CLI is evolving from a developer tool to an **autonomous business operations platform**.

| Level | Capability | Status |
|-------|------------|--------|
| **L1: Developer Tool** | Deploy, build, test | ✅ Complete |
| **L2: Operations Platform** | Monitor, alert, auto-remediate | ⚠️ In Progress |
| **L3: Business Intelligence** | Metrics, insights, recommendations | 🔴 Planned |
| **L4: Autonomous CEO** | Decide, execute, report | 🔴 Roadmap |

**Full roadmap:** `docs/CEO-AUTOMATION-ROADMAP.md`
**CLI reference:** `docs/CLI-COMMAND-REFERENCE.md`

---

## 🎯 Complete CLI Reference

The Ferni CLI (`ferni`) provides comprehensive access to all development, deployment, and operations workflows. Run `ferni help` for full details.

### Development Commands

| Command | Description | Key Subcommands |
|---------|-------------|-----------------|
| `ferni dev` | Development workflow | start, stop, restart, status, ports |
| `ferni deploy` | Deploy services | gce, ui, frontend, landing, all |
| `ferni build` | Build applications | frontend, electron, ios, android |
| `ferni test` | Run test suites | unit, e2e, storage, quick, all |
| `ferni setup` | Configure environment | local, icons, firestore, secrets |
| `ferni quality` | Code quality checks | all, typecheck, lint, test, audit |
| `ferni pr` | Pull request workflow | create, check, list, merge |
| `ferni release` | Release management | create, changelog, tag, notes |
| `ferni migrate` | Database migrations | status, run, rollback, create |
| `ferni deps` | Dependency management | audit, outdated, update, cleanup |
| `ferni devblog` | Developer blog | new, preview, publish, validate |
| `ferni icons` | Generate icons | favicons, smile-gif, app-icons, all |

### Operations Commands

| Command | Description | Key Subcommands |
|---------|-------------|-----------------|
| `ferni status` | Deployment status | services, revisions, traffic |
| `ferni logs` | View & analyze logs | agent, ui, errors, analyze, gce |
| `ferni doctor` | System diagnostics | all, apis, quotas, billing, env |
| `ferni db` | Database operations | status, backup, migrate, query |
| `ferni env` | Environment variables | list, diff, check, sync, secrets |
| `ferni ops` | Operational tasks | zombies, health, semantic, scheduler, memory |
| `ferni users` | User data management | list, show, dump, cleanup, grant |
| `ferni data` | Data analysis | profiles, behaviors, tools, contacts |
| `ferni waitlist` | Manage waitlist | list, approve, stats, export |
| `ferni disk` | GCE disk management | status, clean, setup-cron |
| `ferni runner` | GitHub Actions runner | status, restart, logs, ssh |
| `ferni secrets` | Secret management | list, check, rotate, sync, audit |

### Quality & Agents Commands

| Command | Description | Key Subcommands |
|---------|-------------|-----------------|
| `ferni agents` | Manage AI agents | new, list, show, validate, install |
| `ferni agent` | Custom agents | create, list, voice, memory, deploy |
| `ferni personas` | Manage personas | list, show, validate, generate |
| `ferni tools` | LLM tools | list, show, validate, stats, test |
| `ferni voices` | Voice/TTS management | list, preview, validate |
| `ferni validate` | Validation checks | voices, humanization, integrations |
| `ferni audit` | Architecture audits | quality, architecture, bth, tools |
| `ferni smoke` | Smoke tests | api, livekit, gemini, tools, all |
| `ferni tokens` | Design tokens | sync, check, version, brand |

### Platform Oversight Commands

| Command | Description | Key Subcommands |
|---------|-------------|-----------------|
| `ferni rollback` | Rollback deploys | gce, agent, ui, status |
| `ferni metrics` | Platform metrics | live, latency, errors, throughput |
| `ferni sessions` | Session analytics | active, history, stats, users |
| `ferni traffic` | Traffic management | status, canary, split, rollout |
| `ferni alerts` | Alert management | list, active, silence, acknowledge |
| `ferni oncall` | On-call rotation | who, schedule, handoff, escalate |
| `ferni calls` | Test phone calls | test, status, family, invite |
| `ferni runtime` | Container diagnostics | status, memory, sessions, health |

### CEO Features (Personal Assistant)

| Command | Description | Key Subcommands |
|---------|-------------|-----------------|
| `ferni goals` | Track your goals | list, add, complete, progress |
| `ferni roster` | Leadership team info | show, maya, alex, jordan, peter |
| `ferni remember` | Add notes for Ferni | (just the text) |
| `ferni brain` | What Ferni knows | show, summary, delete |
| `ferni briefing` | Morning briefing | today, tomorrow, week |
| `ferni focus` | Start a focus session | start, stop, status, history |
| `ferni reflect` | End-of-day reflection | today, prompts, history |
| `ferni weekly` | Weekly review | review, plan, last |
| `ferni wins` | Log achievements | add, list, today, week, celebrate |
| `ferni habits` | Track habits | add, list, check, streak, delete |
| `ferni energy` | Log energy levels | log, today, week, history |
| `ferni journal` | Quick journal entries | add, list, today, week |
| `ferni gratitude` | Gratitude logging | add, list, today, week |
| `ferni decisions` | Track decisions | add, list, pending, outcome |
| `ferni priorities` | Manage priorities | list, add, reorder, complete, clear |
| `ferni blockers` | Track blockers | add, list, resolve, active |
| `ferni ideas` | Capture ideas | add, list, tag, random |
| `ferni ask` | Ask Ferni anything | (just ask your question) |
| `ferni coach` | AI coaching | career, relationship, mindset, health |
| `ferni meetings` | Meeting notes | add, list, today, week, search |

### Quick Examples

```bash
# Development
ferni dev start           # Start local dev servers
ferni deploy gce          # Deploy voice agent to GCE
ferni test quick          # Run quick test suite
ferni quality             # Full quality check

# Operations
ferni logs agent --tail   # Stream agent logs
ferni ops zombies         # Check for zombie revisions
ferni audit bth           # Audit Better Than Human features

# Platform
ferni status              # Check all services
ferni oncall who          # Who's on call?
ferni traffic canary 10   # Canary 10% traffic

# CEO Features - Daily Workflow
ferni briefing            # Morning briefing with calendar & priorities
ferni focus start 90      # Start a 90-minute focus session
ferni reflect             # End-of-day reflection prompts
ferni weekly              # Weekly review and planning

# CEO Features - Personal Tracking
ferni goals               # View your goals
ferni wins "Shipped v2!"  # Log an achievement
ferni habits check sleep  # Mark a habit as done
ferni energy 8            # Log your energy level (1-10)
ferni journal "Great day" # Quick journal entry
ferni gratitude "Sunshine"# Log something you're grateful for

# CEO Features - Decision Support
ferni brain               # What does Ferni know about you?
ferni decisions add "..."  # Track a decision
ferni priorities          # View your current priorities
ferni blockers add "..."  # Track a blocker
ferni ideas "New feature" # Capture an idea

# CEO Features - AI Coaching
ferni ask "How do I..."   # Ask Ferni anything
ferni coach career        # Career coaching session
```

## Subdirectory CLAUDE.md Files

**Core Modules:**
- `src/agents/CLAUDE.md` - Voice agent development
- `src/conversation/CLAUDE.md` - Humanization subsystem (26K+ lines)
- `src/audio/CLAUDE.md` - DJ Controller architecture, music player, preference learning
- `src/tasks/CLAUDE.md` - Task system, emotion-aware execution
- `src/servers/CLAUDE.md` - Token server, OAuth, API routes

**Domain Modules:**
- `src/tools/CLAUDE.md` - How to create tools (118 domains)
- `src/tools/semantic-router/CLAUDE.md` - Semantic tool routing (<50ms latency)
- `src/tools/habit-coaching/CLAUDE.md` - Habit coaching module
- `src/personas/CLAUDE.md` - How to create personas (6 AI team members)
- `src/intelligence/CLAUDE.md` - Context builder patterns
- `src/intelligence/context-builders/CLAUDE.md` - Builder implementation
- `src/tasks/scheduled/CLAUDE.md` - Scheduled jobs (Cloud Scheduler)

**Infrastructure:**
- `src/services/CLAUDE.md` - Services layer patterns
- `src/memory/CLAUDE.md` - Memory and persistence (three-layer L1/L2/L3)
- `src/memory/dynamic/CLAUDE.md` - Real-time memory capture (STM, deep extraction)
- `src/memory/knowledge-graph/CLAUDE.md` - Entity relationship graph
- `src/personality/CLAUDE.md` - Personality emergence, timing intelligence
- `src/context/CLAUDE.md` - ContextManager, session context
- `src/handoff/CLAUDE.md` - Persona transitions, cameo system
- `src/marketplace/CLAUDE.md` - Tool registry, sandboxed execution

**Frontend/Brand:**
- `apps/web/CLAUDE.md` - Frontend/design system rules
- `brand/CLAUDE.md` - Brand library rules (LUXO-STYLE EYES: opaque white, NO pupils)

**Applications:**
- `apps/CLAUDE.md` - Navigation index for all platform apps
- `apps/ml-training/CLAUDE.md` - ML training pipeline (Qwen 2.5 router model)

---

## CI/CD & DevOps

### Key Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| **CI/CD Charter** | `docs/devops/00-charter.md` | Canonical CI contract for agents |
| **Current State** | `docs/devops/01-current-state.md` | Workflow inventory, cost analysis |
| CI Inventory | `docs/ci/ci-inventory.md` | All workflows, triggers, durations |
| Minute Usage | `docs/ci/minute-usage-analysis.md` | Cost analysis, optimizations |
| CI Backlog | `docs/ci/ci-backlog.md` | Prioritized improvements |
| Monorepo Structure | `docs/monorepo/structure.md` | Package layout, dependencies |
| Nx Evaluation | `docs/monorepo/nx-evaluation.md` | Build tool decision |
| Observability | `docs/devops-observability/overview.md` | Metrics, alerting |

### Key Workflows

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `ci.yml` | Lint, test, build | Push/PR (with path filters) |
| `deploy-production.yml` | Production deploy | Push to main |
| `ci-metrics.yml` | Weekly CI metrics | Monday 9 AM UTC |
| `design-system.yml` | Token validation | Push to design-system/* |

### Composite Action

All workflows use `.github/actions/setup-node-pnpm` for consistent setup:

```yaml
- uses: ./.github/actions/setup-node-pnpm
  with:
    node-version: '20'      # Optional
    pnpm-version: '10'      # Optional
    frozen-lockfile: 'true' # Optional
```

### CI Commands

```bash
# Run CI locally
pnpm quality              # Full quality check (typecheck + lint + test)
pnpm typecheck            # TypeScript only
pnpm test                 # Unit tests
pnpm build:fast           # Fast esbuild

# View CI metrics
npx tsx scripts/devops/collect_ci_metrics.ts

# Trigger workflows
gh workflow run ci.yml
gh workflow run ci-metrics.yml --field notify_slack=true

# Check workflow status
gh run list --workflow=ci.yml
```

### Optimizations Applied (January 2026)

| Optimization | Impact |
|--------------|--------|
| Path filters on ci.yml | 70% fewer runs |
| Concurrency control | No parallel waste |
| Composite action | DRY setup |
| pnpm v10 standardization | No version drift |

### Budget

- **Limit:** 3,000 minutes/month
- **Before optimization:** ~5,400 min/month (180% of budget)
- **After optimization:** ~2,200 min/month (73% of budget)

### Agent CI Rules (MANDATORY)

**Before committing code**, agents MUST run:

```bash
pnpm quality          # Typecheck + lint + test - REQUIRED
```

**Additional checks based on what changed:**

| If You Changed | Also Run |
|----------------|----------|
| Design tokens (`design-system/tokens/`) | `pnpm tokens:sync && pnpm tokens:check` |
| Frontend (`apps/web/`) | `cd apps/web && pnpm lint:tokens` |
| Tool definitions | `pnpm tools:schemas:validate` |
| Rust code | `cd apps/rust-* && cargo test` |

**Interpreting CI failures:**

| Failure | Agent Action |
|---------|--------------|
| TypeScript error | Fix the type; never use `as any` to silence |
| Lint error | Run `pnpm lint:fix`, review changes |
| Test failure | Read error, fix logic or update test |
| Flaky test | Re-run once; if still fails, fix or quarantine |

**Definition of "green"**: All these must pass for a change to be mergeable:
- `pnpm typecheck` (0 errors)
- `pnpm lint` (0 errors)
- `pnpm test:unit` (all pass)
- `pnpm ci:quality-gates` (thresholds met)

**Full CI/CD charter**: `docs/devops/00-charter.md`

---

## Documentation Stats (January 2026)

| Category | Count |
|----------|-------|
| CLAUDE.md files | 80 |
| Architecture docs | 94 |
| Audit docs | 79 |
| Plan docs | 51 |
| Tool domains | 118 |
| AI personas | 6 |
| Superhuman services | 45 |

---

## 🎯 Seth's Preferences

- **Always start local dev servers** when beginning a coding session
- Start all 4 servers in **separate background terminals** so logs can be watched individually

### Cursor AI Agent: Starting Dev Servers

When starting a dev session, run each command in a separate background shell so terminal logs are watchable:

```bash
# Terminal 1: Token Server (port 3001)
pnpm token-server

# Terminal 2: UI Server (port 3002)
pnpm ui-server

# Terminal 3: Vite Frontend (port 3004)
cd apps/web && pnpm dev

# Terminal 4: Voice Agent (LiveKit worker)
LOG_FULL_RESPONSES=true pnpm dev
```

**Quick reference:** `ferni dev cursor` prints these commands.

**Verify all running:**
```bash
curl -s http://localhost:3001/health && curl -s http://localhost:3002/health && curl -s http://localhost:3004/ | head -c 50
```

**Stop all:** `ferni dev stop`
