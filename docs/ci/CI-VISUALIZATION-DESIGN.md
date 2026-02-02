# CI/CD Visualization Design

> **Two views for two audiences: Agents need structure, Humans need stories**

---

## Philosophy: Agent vs Human Views

| Aspect | Agent View | Human Orchestrator View |
|--------|------------|------------------------|
| **Format** | JSON/structured data | Visual/interactive |
| **Detail** | Complete, exhaustive | Curated, highlights |
| **Actions** | Programmatic commands | Clickable buttons |
| **Context** | Minimal (agents infer) | Rich narrative |
| **Updates** | Polling/webhooks | Real-time streaming |
| **Errors** | Exit codes + structured errors | Human-readable messages |

---

## Part 1: Workflow Dependency Map

### CI.yml Job Graph

```
                              ┌─────────────────────────────────────────────────────────────┐
                              │                        CI WORKFLOW                          │
                              │            Trigger: push/PR to main/develop                 │
                              │          Concurrency: ci-{workflow}-{ref}                   │
                              └─────────────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                              ┌─────────────────────────────────────────────────────────────┐
                              │                         SETUP                               │
                              │  • Checkout code                                            │
                              │  • Fix local dependencies (sed LiveKit → 1.0.35)           │
                              │  • Setup Node.js + pnpm                                     │
                              │  • Install & cache dependencies                             │
                              │  Duration: ~3 min │ Runner: self-hosted                     │
                              └─────────────────────────────────────────────────────────────┘
                                                          │
               ┌──────────────┬──────────────┬────────────┼────────────┬──────────────┬─────────────┐
               │              │              │            │            │              │             │
               ▼              ▼              ▼            ▼            ▼              ▼             ▼
        ┌───────────┐  ┌───────────┐  ┌───────────┐ ┌──────────┐ ┌──────────┐  ┌───────────┐ ┌──────────┐
        │   LINT    │  │TEST-UNIT  │  │TEST-INTEG │ │TEST-AGI  │ │ SECURITY │  │CODE-QUAL  │ │FRONT-END │
        │           │  │           │  │           │ │ FEATURES │ │   SCAN   │  │  AUDIT    │ │ QUALITY  │
        │ ESLint    │  │ Vitest    │  │ Firestore │ │ E2E      │ │ npm audit│  │ as any    │ │ tokens   │
        │ Prettier  │  │ Coverage  │  │ emulator  │ │ Gemini   │ │ trivy    │  │ console   │ │ lint     │
        │           │  │           │  │           │ │          │ │          │  │ file size │ │          │
        │ ~5 min    │  │ ~8 min    │  │ ~10 min   │ │ ~15 min  │ │ ~3 min   │  │ ~2 min    │ │ ~3 min   │
        └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ └────┬─────┘ └────┬─────┘  └─────┬─────┘ └────┬─────┘
              │              │              │            │            │              │             │
              └──────────────┴──────────────┴────────────┼────────────┴──────────────┴─────────────┘
                                                         │
                                                         ▼
                              ┌─────────────────────────────────────────────────────────────┐
                              │                         BUILD                               │
                              │  • Needs: setup, lint, test-unit, test-integration,        │
                              │           test-agi-features                                 │
                              │  • pnpm build:fast (esbuild)                               │
                              │  • Duration: ~5 min │ Memory: 4GB heap                     │
                              └─────────────────────────────────────────────────────────────┘
```

### Parallel Workflow Execution

```
TIME ──────────────────────────────────────────────────────────────────────────────▶

     ┌─────┐
     │setup│ ─────┬─────┬─────┬─────┬─────┬─────┬─────┐
     └─────┘      │     │     │     │     │     │     │
                  ▼     ▼     ▼     ▼     ▼     ▼     ▼
              ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
              │lint │test │test │test │sec  │qual │front│  ← PARALLEL
              │     │unit │int  │agi  │     │     │end  │    (fan-out)
              └──┬──┴──┬──┴──┬──┴──┬──┴─────┴─────┴─────┘
                 │     │     │     │
                 └─────┴─────┴─────┼─────────────────────┐
                                   │                     │
                                   ▼                     │
                               ┌───────┐                 │
                               │ BUILD │  ← GATE         │
                               └───────┘    (fan-in)     │
                                                         │
                              All security/quality jobs  │
                              continue in parallel ──────┘
```

---

## Part 2: Concurrency Model

### Concurrency Groups

| Workflow | Concurrency Group | Cancel In-Progress |
|----------|-------------------|-------------------|
| CI | `ci-{workflow}-{ref}` | Yes |
| Deploy Production | `deploy-prod` | No |
| Deploy GCE | `deploy-gce` | No |
| Brand Compliance | `brand-{ref}` | Yes |
| Security Scan | `security-{ref}` | Yes |

### Visualization

```
CONCURRENCY: ci-CI-refs/pull/52

  Run #1 (commit a1b2c3) ────────────▶ CANCELLED
                                       │
  Run #2 (commit d4e5f6) ──────────────┼──────────▶ CANCELLED
                                       │            │
  Run #3 (commit g7h8i9) ──────────────┴────────────┼───────────▶ RUNNING
                                                    │
                     New push cancels in-progress ──┘

CONCURRENCY: deploy-prod (no cancel)

  Run #1 (main) ─────────────────────────────────────────────────▶ COMPLETE
                                                                   │
  Run #2 (main) ─────────────────────────────── QUEUED ────────────┴───────▶ STARTS

                     New runs wait for previous to complete
```

---

## Part 3: Circuit Breaker Pattern

### Self-Hosted Runner Circuit

```
                    ┌─────────────────────────────────────────┐
                    │         CIRCUIT BREAKER STATE           │
                    └─────────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
          ▼                             ▼                             ▼
    ┌───────────┐               ┌───────────────┐              ┌───────────┐
    │  CLOSED   │               │   HALF-OPEN   │              │   OPEN    │
    │  (Normal) │               │   (Testing)   │              │ (Failing) │
    └───────────┘               └───────────────┘              └───────────┘
          │                             │                             │
          │ 3 consecutive               │ Success                     │
          │ failures                    │                             │
          ├─────────────────────────────┼─────────────────────────────┤
          │                             │                             │
          │                             ▼                             │
          │                     ┌───────────────┐                     │
          │                     │ Try 1 request │                     │
          │                     └───────┬───────┘                     │
          │                             │                             │
          │                    ┌────────┴────────┐                    │
          │                    │                 │                    │
          │                    ▼ Success         ▼ Failure            │
          │              ┌───────────┐    ┌───────────┐              │
          └──────────────│  CLOSED   │    │   OPEN    │──────────────┘
                         └───────────┘    └───────────┘
                                                │
                                                │ Wait 5 min
                                                │ then retry
                                                ▼
                                        ┌───────────────┐
                                        │   HALF-OPEN   │
                                        └───────────────┘
```

### Runner Health Indicators

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RUNNER HEALTH DASHBOARD                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  RUNNER: github-runner (34.171.8.182)                                      │
│                                                                             │
│  ┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐ │
│  │     STATUS      │    LAST SEEN    │   JOBS TODAY    │    DISK FREE    │ │
│  ├─────────────────┼─────────────────┼─────────────────┼─────────────────┤ │
│  │   🔴 OFFLINE    │   4 hours ago   │      0 / 12     │      N/A        │ │
│  └─────────────────┴─────────────────┴─────────────────┴─────────────────┘ │
│                                                                             │
│  QUEUE DEPTH: ████████████████████████░░░░░░░░ 24 jobs waiting             │
│                                                                             │
│  CIRCUIT BREAKER: 🔓 OPEN (runner unreachable)                             │
│                                                                             │
│  RECOMMENDED ACTIONS:                                                       │
│  1. Check GCE instance status: gcloud compute instances describe           │
│  2. Restart runner service: ferni runner restart                           │
│  3. Check runner logs: ferni runner logs --lines 100                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Agent View (Machine-Readable)

### Schema: `ci-state.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "timestamp": { "type": "string", "format": "date-time" },
    "runner": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "status": { "enum": ["online", "offline", "busy"] },
        "last_heartbeat": { "type": "string", "format": "date-time" },
        "circuit_breaker": { "enum": ["closed", "half-open", "open"] },
        "queue_depth": { "type": "integer" },
        "capacity": { "type": "integer" }
      }
    },
    "workflows": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "status": { "enum": ["queued", "in_progress", "completed", "failed", "cancelled"] },
          "run_id": { "type": "integer" },
          "conclusion": { "type": "string" },
          "jobs": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "status": { "type": "string" },
                "depends_on": { "type": "array", "items": { "type": "string" } }
              }
            }
          }
        }
      }
    },
    "actions": {
      "type": "array",
      "description": "Recommended actions for agents to take",
      "items": {
        "type": "object",
        "properties": {
          "priority": { "enum": ["critical", "high", "medium", "low"] },
          "action": { "type": "string" },
          "command": { "type": "string" },
          "reason": { "type": "string" }
        }
      }
    }
  }
}
```

### Example Agent Response

```json
{
  "timestamp": "2026-02-01T17:30:00Z",
  "runner": {
    "id": "github-runner-gce",
    "status": "offline",
    "last_heartbeat": "2026-02-01T13:23:00Z",
    "circuit_breaker": "open",
    "queue_depth": 24,
    "capacity": 1
  },
  "workflows": [
    {
      "name": "CI",
      "status": "queued",
      "run_id": 21563619201,
      "jobs": [
        { "name": "setup", "status": "queued", "depends_on": [] },
        { "name": "lint", "status": "pending", "depends_on": ["setup"] },
        { "name": "test-unit", "status": "pending", "depends_on": ["setup"] },
        { "name": "build", "status": "pending", "depends_on": ["lint", "test-unit", "test-integration", "test-agi-features"] }
      ]
    }
  ],
  "actions": [
    {
      "priority": "critical",
      "action": "restart_runner",
      "command": "ferni runner restart",
      "reason": "Runner offline for 4+ hours, 24 jobs queued"
    },
    {
      "priority": "high",
      "action": "check_runner_health",
      "command": "gcloud compute instances describe github-runner --zone=us-central1-a",
      "reason": "Verify GCE instance is running"
    }
  ]
}
```

### Agent CLI Commands

```bash
# Get structured CI state (for agent consumption)
ferni ci status --json

# Get recommended actions
ferni ci actions --json

# Execute recommended action by index
ferni ci action 0

# Watch for state changes (webhook mode)
ferni ci watch --webhook http://localhost:8080/ci-events
```

---

## Part 5: Human Orchestrator View

### Interactive Dashboard Features

1. **Live Workflow Graph**: Mermaid.js visualization with click-to-expand
2. **Status Stream**: Real-time log output with filtering
3. **Action Buttons**: One-click restart, re-run, cancel
4. **Health Gauges**: Visual indicators with thresholds
5. **Timeline**: Historical view with annotations

### ASCII Dashboard (CLI)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         🚀 FERNI CI/CD ORCHESTRATOR                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  SYSTEM HEALTH                                    QUICK ACTIONS                │
│  ─────────────                                    ─────────────                │
│                                                                                 │
│  Runner:    🔴 OFFLINE (4h)                       [R] Restart Runner           │
│  Circuit:   🔓 OPEN                               [C] Cancel Queued            │
│  Queue:     ████████████░░░░ 24/30                [F] Force Re-run             │
│  Budget:    ████████░░░░░░░░ 73%                  [D] Deploy Override          │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ACTIVE WORKFLOWS                                                              │
│  ────────────────                                                              │
│                                                                                 │
│  PR #52: fix/ci-agents-js-all-workflows                                        │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ setup ────┬─ lint ─────┬─────────────────┐                               │  │
│  │    ⏳     │    ⏳      │                 │                               │  │
│  │           ├─ test-unit ┤                 │                               │  │
│  │           │    ⏳      │                 │                               │  │
│  │           ├─ test-int ─┼───── build ─────┤                               │  │
│  │           │    ⏳      │       ⏳        │                               │  │
│  │           └─ test-agi ─┘                 │                               │  │
│  │               ⏳                         │                               │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│  Status: QUEUED for 4h3m │ Waiting for runner                                  │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│  LOGS (last 10 lines)                                           [V] View Full  │
│  ─────────────────────                                                         │
│  17:30:01 │ CI    │ Run 21563619201 queued, waiting for runner                │
│  17:30:00 │ ALERT │ Runner circuit breaker OPEN - unreachable                  │
│  13:23:15 │ CI    │ Run 21563619201 setup job started                          │
│  13:23:13 │ CI    │ Workflow triggered by push (be98fd83)                      │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
  [Q] Quit   [H] Help   [↑↓] Navigate   [Enter] Select   [Space] Toggle
```

---

## Part 6: Implementation Plan

### Phase 1: Core Data Model (Immediate)

```typescript
// apps/cli/src/commands/ci/ci-types.ts
interface CIState {
  runner: RunnerState;
  workflows: WorkflowState[];
  concurrency: ConcurrencyState[];
  circuitBreaker: CircuitBreakerState;
  actions: RecommendedAction[];
}

interface RunnerState {
  id: string;
  status: 'online' | 'offline' | 'busy';
  lastHeartbeat: Date;
  queueDepth: number;
  capacity: number;
}

interface RecommendedAction {
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  command: string;
  reason: string;
  automated: boolean; // Can agents auto-execute?
}
```

### Phase 2: Agent Commands

```bash
# New commands for agents
ferni ci status --json           # Full state dump
ferni ci graph --format mermaid  # Workflow graph
ferni ci actions                 # Recommended actions
ferni ci execute <action-id>     # Execute action
ferni ci watch --interval 30s    # Poll for changes
```

### Phase 3: Human Dashboard

```bash
# Interactive TUI dashboard
ferni ci dashboard               # Launch interactive mode
ferni ci dashboard --web         # Open in browser
ferni ci dashboard --simple      # ASCII-only mode
```

### Phase 4: Integration

- **Slack notifications**: Alert on circuit breaker state changes
- **PagerDuty**: Escalate runner failures
- **Webhook**: Push state to external systems

---

## Design Principles

### For Agents

1. **Structured Output**: Always JSON, always typed
2. **Actionable**: Every problem has a command to fix it
3. **Idempotent**: Safe to run actions multiple times
4. **Observable**: Clear success/failure signals

### For Humans

1. **Glanceable**: Status visible in < 1 second
2. **Actionable**: One-click/key to fix issues
3. **Contextual**: Show history and trends
4. **Forgiving**: Confirm destructive actions

---

*Created: 2026-02-01*
