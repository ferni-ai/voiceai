# Ferni CLI Command Reference

> **The Ferni CLI (`ferni`) is the command-line interface for autonomous business operations.**

This document provides a comprehensive reference for all CLI commands, their implementation status, and integration points.

## Command Summary

| Category | Commands | Status |
|----------|----------|--------|
| **Development & Build** | 25+ | ✅ Complete |
| **Deployment & Infrastructure** | 20+ | ✅ Complete |
| **Experiments & A/B Testing** | 10+ | 🧬 New |
| **Agent & Persona Management** | 15+ | ✅ Complete |
| **Operations & Observability** | 15+ | ✅ Complete |
| **Data & User Management** | 35+ | ✅ Complete |
| **Platform Monitoring** | 30+ | ✅ Complete |
| **Tools & Validation** | 15+ | ✅ Complete |
| **CEO Features** | 80+ | ⚠️ Partial |
| **C-Suite Features** | 30+ | 🔴 Planned |
| **Release & Git** | 6 | ✅ Complete |
| **Design System** | 5 | ✅ Complete |
| **Developer Blog** | 4 | ✅ Complete |
| **TOTAL** | **290+ commands** | **~60% Complete** |

---

## Quick Start

```bash
# Install globally
pnpm add -g @ferni/cli

# Or use via pnpm
pnpm ferni <command>

# Get help
ferni help
ferni <command> --help
```

---

## Command Status Legend

| Status | Meaning |
|--------|---------|
| ✅ | Fully implemented and tested |
| ⚠️ | Partially implemented |
| 🔴 | Stub/placeholder (coming soon) |
| 🧬 | New (recently added) |

---

## 1. Development & Build

### Build Commands

| Command | Status | Description |
|---------|--------|-------------|
| `ferni build` | ✅ | Traditional tsc build |
| `ferni build fast` | ✅ | esbuild (12x faster) |
| `ferni build fast --types` | ✅ | esbuild + .d.ts generation |
| `ferni build frontend` | ✅ | Build web frontend |
| `ferni build electron` | ✅ | Build desktop app |

### Development Servers

| Command | Status | Description |
|---------|--------|-------------|
| `ferni dev` | ✅ | Interactive server menu |
| `ferni dev start` | ✅ | Start all dev servers |
| `ferni dev stop` | ✅ | Stop all dev servers |
| `ferni dev status` | ✅ | Show server status |
| `ferni dev cursor` | ✅ | Show commands for Cursor AI |

### Quality & Testing

| Command | Status | Description |
|---------|--------|-------------|
| `ferni quality` | ✅ | Run all quality checks |
| `ferni quality:check` | ✅ | Code metrics (as any, console.log) |
| `ferni quality:arch` | ✅ | Architecture layer validation |
| `ferni typecheck` | ✅ | TypeScript type checking |
| `ferni lint` | ✅ | ESLint checking |
| `ferni lint:fix` | ✅ | Auto-fix lint issues |
| `ferni test` | ✅ | Run Vitest test suite |
| `ferni test quick` | ✅ | Quick test subset |
| `ferni test e2e` | ✅ | End-to-end tests |
| `ferni smoke` | ✅ | Smoke tests (api, livekit, gemini) |

---

## 2. Deployment & Infrastructure

### Deployment (Always Use These!)

| Command | Status | Description |
|---------|--------|-------------|
| `ferni deploy` | ✅ | Interactive deployment menu |
| `ferni deploy gce` | ✅ | Voice agent to GCE (blue-green) |
| `ferni deploy ui` | ✅ | UI backend to Cloud Run |
| `ferni deploy frontend` | ✅ | Frontend to Firebase |
| `ferni deploy landing` | ✅ | Landing page to Firebase |
| `ferni deploy all` | ✅ | Deploy everything |
| `ferni deploy gce --dry-run` | ✅ | Preview deployment |

### GCE Operations

| Command | Status | Description |
|---------|--------|-------------|
| `ferni disk` | ✅ | Check GCE disk status |
| `ferni disk clean` | ✅ | Clean up disk space |
| `ferni disk clean:aggressive` | ✅ | Aggressive cleanup |
| `ferni disk setup-cron` | ✅ | Setup daily cleanup cron |

### GitHub Actions Runner

| Command | Status | Description |
|---------|--------|-------------|
| `ferni runner status` | ✅ | Check runner status |
| `ferni runner restart` | ✅ | Restart runner service |
| `ferni runner logs` | ✅ | View runner logs |
| `ferni runner logs --follow` | ✅ | Stream logs in real-time |
| `ferni runner ssh` | ✅ | SSH into runner VM |

### Rollback & Recovery

| Command | Status | Description |
|---------|--------|-------------|
| `ferni rollback gce` | ✅ | Rollback voice agent |
| `ferni rollback ui` | ✅ | Rollback UI server |
| `ferni rollback status` | ✅ | Show rollback status |

---

## 3. Experiments & A/B Testing 🧬

**NEW!** Autonomous experimentation system with bandits and auto-rollout.

### Experiment Management

| Command | Status | Description |
|---------|--------|-------------|
| `ferni experiments list` | 🧬 ✅ | List all experiments |
| `ferni experiments status` | 🧬 ✅ | Show experiment summary |
| `ferni experiments show <id>` | 🧬 ✅ | Show experiment details |
| `ferni experiments health <id>` | 🧬 ✅ | Show experiment health |
| `ferni experiments create` | 🧬 ✅ | Create new experiment (shows help) |
| `ferni experiments start <id>` | 🧬 ✅ | Start an experiment |
| `ferni experiments pause <id>` | 🧬 ✅ | Pause an experiment |
| `ferni experiments resume <id>` | 🧬 ✅ | Resume an experiment |
| `ferni experiments complete <id>` | 🧬 ✅ | Complete an experiment |
| `ferni experiments promote <id>` | 🧬 ✅ | Check and promote winner |
| `ferni experiments delete <id> -f` | 🧬 ✅ | Delete an experiment |

### Experiment Types

| Type | Description | Algorithm |
|------|-------------|-----------|
| `ab` | Classic A/B test | Z-test for significance |
| `bandit` | Multi-armed bandit | Thompson Sampling (Beta distributions) |
| `rollout` | Auto-escalating rollout | Stage-based (2%→10%→25%→50%→100%) |

### API Endpoints

```
GET  /api/experiments              - List all experiments
GET  /api/experiments/summary      - Get experiment summary
GET  /api/experiments/:id          - Get experiment details
GET  /api/experiments/:id/health   - Get experiment health
POST /api/experiments              - Create new experiment
POST /api/experiments/:id/start    - Start experiment
POST /api/experiments/:id/pause    - Pause experiment
POST /api/experiments/:id/resume   - Resume experiment
POST /api/experiments/:id/complete - Complete experiment
POST /api/experiments/:id/promote  - Promote winner
POST /api/experiments/:id/rollback - Force rollback
DELETE /api/experiments/:id        - Delete experiment
```

---

## 4. Agent & Persona Management

### Agent Commands

| Command | Status | Description |
|---------|--------|-------------|
| `ferni agent init <id>` | ✅ | Create new agent (wizard) |
| `ferni agent preview <id>` | ✅ | Local dev with hot reload |
| `ferni agent publish <id>` | ✅ | Deploy to production |
| `ferni agent list` | ✅ | List all agents |
| `ferni agent show <id>` | ✅ | Show agent details |
| `ferni agent test <id>` | ✅ | Run agent tests |

### Persona Commands

| Command | Status | Description |
|---------|--------|-------------|
| `ferni personas list` | ✅ | List all personas |
| `ferni personas show <id>` | ✅ | Show persona details |
| `ferni personas validate` | ✅ | Validate persona bundles |

### Voice Commands

| Command | Status | Description |
|---------|--------|-------------|
| `ferni voices list` | ✅ | List available voices |
| `ferni voices preview <id>` | ✅ | Preview a voice |
| `ferni voices validate` | ✅ | Validate voice configs |

---

## 5. Operations & Observability

### Health & Diagnostics

| Command | Status | Description |
|---------|--------|-------------|
| `ferni status` | ✅ | Check all service status |
| `ferni ops diagnose` | ✅ | Quick diagnostic dashboard |
| `ferni ops health` | ✅ | Full health check |
| `ferni ops zombies` | ✅ | Check for zombie revisions |
| `ferni ops zombies --fix` | ✅ | Fix zombie revisions |

### Logs & Monitoring

| Command | Status | Description |
|---------|--------|-------------|
| `ferni logs agent` | ✅ | Voice agent logs |
| `ferni logs ui` | ✅ | UI server logs |
| `ferni logs errors` | ✅ | Error logs only |
| `ferni logs --follow` | ✅ | Stream logs |
| `ferni metrics live` | ⚠️ | Live metrics dashboard |

### Semantic Data Store

| Command | Status | Description |
|---------|--------|-------------|
| `ferni ops semantic-deploy` | ✅ | Deploy semantic store |
| `ferni ops semantic-backfill` | ✅ | Run data backfill |
| `ferni ops semantic-health` | ✅ | Check store health |

---

## 6. Data & User Management

### User Management

| Command | Status | Description |
|---------|--------|-------------|
| `ferni users list` | ✅ | List all users |
| `ferni users show <id>` | ✅ | Show user details |
| `ferni users dump <id>` | ✅ | Export user data |
| `ferni users cleanup` | ✅ | Cleanup inactive users |
| `ferni users grant <id> <role>` | ✅ | Grant user permissions |

### Data Analysis

| Command | Status | Description |
|---------|--------|-------------|
| `ferni data profiles` | ✅ | Analyze user profiles |
| `ferni data behaviors` | ✅ | Analyze user behaviors |
| `ferni data tools` | ✅ | Tool usage analytics |
| `ferni data contacts` | ✅ | Contact analytics |

### Waitlist Management

| Command | Status | Description |
|---------|--------|-------------|
| `ferni waitlist list` | ✅ | List waitlist entries |
| `ferni waitlist approve <email>` | ✅ | Approve a user |
| `ferni waitlist stats` | ✅ | Waitlist statistics |
| `ferni waitlist export` | ✅ | Export waitlist |

### Database Operations

| Command | Status | Description |
|---------|--------|-------------|
| `ferni db status` | ✅ | Check database status |
| `ferni db backup` | ✅ | Create database backup |
| `ferni db migrate` | ✅ | Run migrations |
| `ferni db query "<sql>"` | ✅ | Execute SQL query |

### Environment & Secrets

| Command | Status | Description |
|---------|--------|-------------|
| `ferni env list` | ✅ | List environment variables |
| `ferni env diff` | ✅ | Compare environments |
| `ferni env check` | ✅ | Validate required vars |
| `ferni env sync` | ✅ | Sync from Secret Manager |
| `ferni secrets list` | ✅ | List all secrets |
| `ferni secrets check` | ✅ | Validate secrets |
| `ferni secrets rotate <name>` | ✅ | Rotate a secret |
| `ferni secrets sync` | ✅ | Sync to Secret Manager |
| `ferni secrets audit` | ✅ | Audit secret access |

### Dependencies & Setup

| Command | Status | Description |
|---------|--------|-------------|
| `ferni deps audit` | ✅ | Audit dependencies |
| `ferni deps outdated` | ✅ | Check outdated deps |
| `ferni deps update` | ✅ | Update dependencies |
| `ferni deps cleanup` | ✅ | Remove unused deps |
| `ferni setup local` | ✅ | Setup local environment |
| `ferni setup icons` | ✅ | Generate icons |
| `ferni setup firestore` | ✅ | Setup Firestore emulator |
| `ferni setup secrets` | ✅ | Setup secrets locally |
| `ferni migrate status` | ✅ | Migration status |
| `ferni migrate run` | ✅ | Run pending migrations |
| `ferni migrate rollback` | ✅ | Rollback last migration |
| `ferni migrate create <name>` | ✅ | Create new migration |

---

## 7. Platform Monitoring & Metrics

### Platform Metrics

| Command | Status | Description |
|---------|--------|-------------|
| `ferni metrics live` | ✅ | Live metrics dashboard |
| `ferni metrics latency` | ✅ | Latency metrics |
| `ferni metrics errors` | ✅ | Error rates |
| `ferni metrics throughput` | ✅ | Request throughput |

### Session Analytics

| Command | Status | Description |
|---------|--------|-------------|
| `ferni sessions active` | ✅ | Active sessions |
| `ferni sessions history` | ✅ | Session history |
| `ferni sessions stats` | ✅ | Session statistics |
| `ferni sessions users` | ✅ | Users by session |

### Traffic Management

| Command | Status | Description |
|---------|--------|-------------|
| `ferni traffic status` | ✅ | Traffic distribution |
| `ferni traffic canary <pct>` | ✅ | Canary deployment |
| `ferni traffic split` | ✅ | A/B traffic split |
| `ferni traffic rollout` | ✅ | Gradual rollout |

### Alerts & On-Call

| Command | Status | Description |
|---------|--------|-------------|
| `ferni alerts list` | ✅ | List all alerts |
| `ferni alerts active` | ✅ | Active alerts only |
| `ferni alerts silence <id>` | ✅ | Silence an alert |
| `ferni alerts acknowledge <id>` | ✅ | Acknowledge alert |
| `ferni oncall who` | ✅ | Who's on call? |
| `ferni oncall schedule` | ✅ | On-call schedule |
| `ferni oncall handoff` | ✅ | Handoff to next |
| `ferni oncall escalate` | ✅ | Escalate incident |

### Voice Agent Testing

| Command | Status | Description |
|---------|--------|-------------|
| `ferni calls test` | ✅ | Test voice call |
| `ferni calls status` | ✅ | Call status |
| `ferni calls family` | ✅ | Test with family |
| `ferni calls invite <phone>` | ✅ | Invite to test |

### Runtime Diagnostics

| Command | Status | Description |
|---------|--------|-------------|
| `ferni runtime status` | ✅ | Container status |
| `ferni runtime memory` | ✅ | Memory usage |
| `ferni runtime sessions` | ✅ | Active sessions |
| `ferni runtime health` | ✅ | Health checks |

---

## 8. Tools & Validation

### Tool Management

| Command | Status | Description |
|---------|--------|-------------|
| `ferni tools list` | ✅ | List all tools |
| `ferni tools show <id>` | ✅ | Show tool details |
| `ferni tools validate` | ✅ | Validate tool configs |
| `ferni tools stats` | ✅ | Tool usage statistics |
| `ferni tools test <id>` | ✅ | Test a tool |

### Validation Commands

| Command | Status | Description |
|---------|--------|-------------|
| `ferni validate voices` | ✅ | Validate voice configs |
| `ferni validate humanization` | ✅ | Validate humanization |
| `ferni validate integrations` | ✅ | Validate integrations |

### Architecture Audits

| Command | Status | Description |
|---------|--------|-------------|
| `ferni audit quality` | ✅ | Code quality audit |
| `ferni audit architecture` | ✅ | Architecture audit |
| `ferni audit bth` | ✅ | Better Than Human audit |
| `ferni audit tools` | ✅ | Tool architecture audit |

---

## 9. Executive Suite (CEO Features)

### Personal Productivity

| Command | Status | Description |
|---------|--------|-------------|
| `ferni goals` | ⚠️ | Track your goals |
| `ferni goals list` | ⚠️ | List all goals |
| `ferni goals add "..."` | ⚠️ | Add a goal |
| `ferni goals complete <id>` | ⚠️ | Mark goal complete |
| `ferni goals progress` | ⚠️ | View progress |
| `ferni brain` | ⚠️ | What Ferni knows about you |
| `ferni brain show` | ⚠️ | Show all memories |
| `ferni brain summary` | ⚠️ | Memory summary |
| `ferni brain delete <id>` | ⚠️ | Delete a memory |
| `ferni remember "..."` | ⚠️ | Add a note for Ferni |
| `ferni briefing` | ⚠️ | Morning briefing |
| `ferni briefing today` | ⚠️ | Today's briefing |
| `ferni briefing tomorrow` | ⚠️ | Tomorrow's briefing |
| `ferni briefing week` | ⚠️ | Week ahead |
| `ferni focus start <mins>` | ⚠️ | Start focus session |
| `ferni focus stop` | ⚠️ | Stop focus session |
| `ferni focus status` | ⚠️ | Current focus status |
| `ferni focus history` | ⚠️ | Focus history |
| `ferni reflect` | ⚠️ | End-of-day reflection |
| `ferni reflect today` | ⚠️ | Today's reflection |
| `ferni reflect prompts` | ⚠️ | Reflection prompts |
| `ferni reflect history` | ⚠️ | Past reflections |
| `ferni weekly` | ⚠️ | Weekly review |
| `ferni weekly review` | ⚠️ | This week's review |
| `ferni weekly plan` | ⚠️ | Plan next week |
| `ferni weekly last` | ⚠️ | Last week's review |

### Tracking & Logging

| Command | Status | Description |
|---------|--------|-------------|
| `ferni wins "..."` | ⚠️ | Log an achievement |
| `ferni wins add "..."` | ⚠️ | Add a win |
| `ferni wins list` | ⚠️ | List all wins |
| `ferni wins today` | ⚠️ | Today's wins |
| `ferni wins week` | ⚠️ | This week's wins |
| `ferni wins celebrate` | ⚠️ | Celebrate wins |
| `ferni habits add <habit>` | ⚠️ | Add a habit |
| `ferni habits list` | ⚠️ | List all habits |
| `ferni habits check <habit>` | ⚠️ | Mark habit done |
| `ferni habits streak <habit>` | ⚠️ | Show streak |
| `ferni habits delete <habit>` | ⚠️ | Delete a habit |
| `ferni energy log <1-10>` | ⚠️ | Log energy level |
| `ferni energy today` | ⚠️ | Today's energy |
| `ferni energy week` | ⚠️ | Week's energy |
| `ferni energy history` | ⚠️ | Energy history |
| `ferni journal "..."` | ⚠️ | Quick journal entry |
| `ferni journal add "..."` | ⚠️ | Add entry |
| `ferni journal list` | ⚠️ | List entries |
| `ferni journal today` | ⚠️ | Today's entries |
| `ferni journal week` | ⚠️ | Week's entries |
| `ferni gratitude "..."` | ⚠️ | Log gratitude |
| `ferni gratitude add "..."` | ⚠️ | Add gratitude |
| `ferni gratitude list` | ⚠️ | List all |
| `ferni gratitude today` | ⚠️ | Today's gratitude |
| `ferni gratitude week` | ⚠️ | Week's gratitude |
| `ferni decisions add "..."` | ⚠️ | Track a decision |
| `ferni decisions list` | ⚠️ | List decisions |
| `ferni decisions pending` | ⚠️ | Pending decisions |
| `ferni decisions outcome <id>` | ⚠️ | Log outcome |
| `ferni priorities` | ⚠️ | View priorities |
| `ferni priorities list` | ⚠️ | List all |
| `ferni priorities add "..."` | ⚠️ | Add priority |
| `ferni priorities reorder` | ⚠️ | Reorder priorities |
| `ferni priorities complete <id>` | ⚠️ | Mark complete |
| `ferni priorities clear` | ⚠️ | Clear all |
| `ferni blockers add "..."` | ⚠️ | Track a blocker |
| `ferni blockers list` | ⚠️ | List blockers |
| `ferni blockers resolve <id>` | ⚠️ | Resolve blocker |
| `ferni blockers active` | ⚠️ | Active blockers |
| `ferni ideas "..."` | ⚠️ | Capture an idea |
| `ferni ideas add "..."` | ⚠️ | Add idea |
| `ferni ideas list` | ⚠️ | List ideas |
| `ferni ideas tag <id> <tag>` | ⚠️ | Tag an idea |
| `ferni ideas random` | ⚠️ | Random idea |

### Team & Meetings

| Command | Status | Description |
|---------|--------|-------------|
| `ferni roster` | ⚠️ | Leadership team info |
| `ferni roster show` | ⚠️ | Show all |
| `ferni roster maya` | ⚠️ | Maya's profile |
| `ferni roster alex` | ⚠️ | Alex's profile |
| `ferni roster jordan` | ⚠️ | Jordan's profile |
| `ferni roster peter` | ⚠️ | Peter's profile |
| `ferni meetings add "..."` | ⚠️ | Add meeting notes |
| `ferni meetings list` | ⚠️ | List meetings |
| `ferni meetings today` | ⚠️ | Today's meetings |
| `ferni meetings week` | ⚠️ | Week's meetings |
| `ferni meetings search <q>` | ⚠️ | Search meetings |

### AI Coaching

| Command | Status | Description |
|---------|--------|-------------|
| `ferni ask "..."` | ⚠️ | Ask Ferni anything |
| `ferni coach career` | ⚠️ | Career coaching |
| `ferni coach relationship` | 🔴 | Relationship coaching |
| `ferni coach mindset` | 🔴 | Mindset coaching |
| `ferni coach health` | 🔴 | Health coaching |

---

## 10. C-Suite Commands (Planned)

### CTO - Technical Leadership

| Command | Status | Description |
|---------|--------|-------------|
| `ferni cto health` | 🔴 | Architecture health score |
| `ferni cto debt` | 🔴 | Tech debt inventory |
| `ferni cto incidents` | 🔴 | Incident tracking |
| `ferni cto security` | 🔴 | Security scan |
| `ferni cto dependencies` | 🔴 | Dependency health |
| `ferni cto performance` | 🔴 | System performance |

### CIO - Information Governance

| Command | Status | Description |
|---------|--------|-------------|
| `ferni cio compliance` | 🔴 | SOC2/GDPR/HIPAA status |
| `ferni cio data-catalog` | 🔴 | Data lineage & PII |
| `ferni cio access-review` | 🔴 | Permission audits |
| `ferni cio risk` | 🔴 | Risk register |
| `ferni cio vendors` | 🔴 | Vendor assessments |

### CPO - Product Intelligence

| Command | Status | Description |
|---------|--------|-------------|
| `ferni cpo roadmap` | 🔴 | AI-generated roadmap |
| `ferni cpo feedback` | 🔴 | User feedback sentiment |
| `ferni cpo experiments` | 🔴 | A/B test results |
| `ferni cpo prioritize` | 🔴 | Feature scoring (RICE) |
| `ferni cpo personas` | 🔴 | User persona insights |
| `ferni cpo churn` | 🔴 | Churn prediction |

### CMO - Marketing Intelligence

| Command | Status | Description |
|---------|--------|-------------|
| `ferni cmo campaigns` | 🔴 | Campaign performance |
| `ferni cmo content` | 🔴 | Content calendar |
| `ferni cmo seo` | 🔴 | SEO health |
| `ferni cmo social` | 🔴 | Social analytics |
| `ferni cmo attribution` | 🔴 | Multi-touch attribution |
| `ferni cmo competitors` | 🔴 | Competitive intelligence |

### CSCO - Operations Intelligence

| Command | Status | Description |
|---------|--------|-------------|
| `ferni csco costs` | 🔴 | Cost optimization |
| `ferni csco vendors` | 🔴 | Vendor performance |
| `ferni csco slas` | 🔴 | SLA monitoring |
| `ferni csco capacity` | 🔴 | Capacity planning |
| `ferni csco automation` | 🔴 | Process automation ROI |

---

## 11. Release & Git Workflow

| Command | Status | Description |
|---------|--------|-------------|
| `ferni release create` | ✅ | Create a release |
| `ferni release changelog` | ✅ | Generate changelog |
| `ferni release tag` | ✅ | Tag a release |
| `ferni pr create` | ✅ | Create a PR |
| `ferni pr check` | ✅ | Check PR status |
| `ferni pr merge` | ✅ | Merge a PR |

---

## 12. Design System & Tokens

| Command | Status | Description |
|---------|--------|-------------|
| `ferni tokens sync` | ✅ | Build & sync tokens |
| `ferni tokens check` | ✅ | Validate no drift |
| `ferni tokens version` | ✅ | Show token version |
| `ferni tokens version patch "msg"` | ✅ | Bump version |
| `ferni tokens brand` | ✅ | Check brand alignment |

---

## 13. Developer Blog

| Command | Status | Description |
|---------|--------|-------------|
| `ferni devblog changelog v1.2.3` | ✅ | Generate changelog post |
| `ferni devblog images` | ✅ | Batch generate OG images |
| `ferni devblog newsletter` | ✅ | Generate newsletter |
| `ferni devblog social` | ✅ | Generate social snippets |

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | Production |
| `LIVEKIT_URL` | LiveKit server URL | All |
| `LIVEKIT_API_KEY` | LiveKit API key | All |
| `LIVEKIT_API_SECRET` | LiveKit API secret | All |
| `OPENAI_API_KEY` | OpenAI API key | All |
| `CARTESIA_API_KEY` | Cartesia TTS key | All |

---

## Integration Points

### Services the CLI Connects To

| Service | Port | Purpose |
|---------|------|---------|
| Token Server | 3001 | LiveKit tokens, Spotify OAuth |
| UI Server | 3002 | API routes, experiments, engagement |
| Vite Frontend | 3004 | Frontend dev server |
| Voice Agent | LiveKit | Voice agent (LiveKit Cloud) |

### API Base URLs

| Environment | API Base |
|-------------|----------|
| Development | `http://localhost:3002` |
| Production | `https://api.ferni.ai` |

---

## Best Practices

### Always Use Ferni CLI for Deployments

```bash
# ✅ CORRECT
ferni deploy gce
ferni deploy ui

# ❌ NEVER DO (skips health checks!)
gcloud run deploy ...
docker push ...
```

### Run Quality Checks Before Commits

```bash
ferni quality          # Full check
ferni typecheck        # TypeScript only
ferni lint:fix         # Auto-fix issues
```

### Use Dry Run for Preview

```bash
ferni deploy gce --dry-run
ferni experiments create --dry-run
```

---

## Troubleshooting

### "Failed to connect to API"

The UI server isn't running:
```bash
pnpm ui-server
```

### "Experiment not found"

Verify the experiment exists:
```bash
ferni experiments list
```

### TypeScript Errors

```bash
pnpm typecheck
pnpm lint:fix
```

---

## Related Documentation

- `CLAUDE.md` - Project overview
- `apps/cli/CLAUDE.md` - CLI development guide
- `docs/architecture/CLEAN-ARCHITECTURE.md` - Architecture overview
- `docs/CEO-AUTOMATION-ROADMAP.md` - CEO automation strategy
- `docs/plans/CLI-IMPLEMENTATION-PLAN.md` - **Detailed implementation plan for all 73 incomplete commands**

---

## Quick Navigation

- [Development & Build](#1-development--build)
- [Deployment & Infrastructure](#2-deployment--infrastructure)
- [Experiments & A/B Testing](#3-experiments--ab-testing-)
- [Agent & Persona Management](#4-agent--persona-management)
- [Operations & Observability](#5-operations--observability)
- [Data & User Management](#6-data--user-management)
- [Platform Monitoring & Metrics](#7-platform-monitoring--metrics)
- [Tools & Validation](#8-tools--validation)
- [CEO Features](#9-executive-suite-ceo-features)
- [C-Suite Commands](#10-c-suite-commands-planned)
- [Release & Git](#11-release--git-workflow)
- [Design System](#12-design-system--tokens)
- [Developer Blog](#13-developer-blog)

---

*Last updated: February 2026*
