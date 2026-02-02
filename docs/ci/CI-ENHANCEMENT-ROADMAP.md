# CI Visualization Enhancement Roadmap

> Future enhancements for the `ferni ci` command suite based on senior expert review.

**Created:** 2026-02-02
**Status:** Planning
**Related PR:** #52

---

## Overview

The CI visualization system (`apps/cli/src/commands/ci/`) provides both agent and human views of CI/CD state. This roadmap outlines enhancements to make it more performant, real-time, and intelligent.

---

## Enhancement Priorities

### Priority 1: High Impact, Medium Effort

#### 1.1 Parallel API Calls

**Problem:** Sequential `gh` API calls for 20 workflows = 20+ round trips, potentially 10+ minutes worst case.

**Solution:**
```typescript
// Current: Sequential
for (const run of runs) {
  const jobsJson = ghCommand(`run view ${run.databaseId}...`);
}

// Proposed: Parallel with batching
const BATCH_SIZE = 5;
for (let i = 0; i < runs.length; i += BATCH_SIZE) {
  const batch = runs.slice(i, i + BATCH_SIZE);
  const results = await Promise.all(
    batch.map(run => ghCommandAsync(`run view ${run.databaseId}...`))
  );
}
```

**Files to modify:**
- `ci-state-collector.ts` - Add `ghCommandAsync()`, refactor `collectWorkflowStates()`

**Estimated effort:** 2-4 hours

---

#### 1.2 Agent Collaboration Protocol

**Problem:** Multiple agents watching CI could execute the same action simultaneously (duplicate reruns).

**Solution:** Add action claiming/locking mechanism:

```typescript
interface AgentMessage {
  type: 'CI_STATE_UPDATE' | 'ACTION_CLAIM' | 'ACTION_COMPLETE' | 'ACTION_RELEASE';
  agentId: string;
  timestamp: string;
  payload: CIState | { actionId: string; result?: 'success' | 'failure' };
}

interface ActionLock {
  actionId: string;
  claimedBy: string;
  claimedAt: string;
  expiresAt: string;  // Auto-release after 5 minutes
}
```

**Implementation:**
1. Store locks in Redis or Firestore
2. Before executing action, claim it with TTL
3. On completion/failure, release lock
4. Other agents skip claimed actions

**Files to create:**
- `ci-action-coordinator.ts` - Lock management
- `ci-types.ts` - Add `AgentMessage`, `ActionLock` types

**Estimated effort:** 4-6 hours

---

#### 1.3 Rate Limit Protection

**Problem:** GitHub API has 5,000 requests/hour. Multiple agents in watch mode could exhaust this.

**Solution:**
```typescript
interface RateLimitState {
  remaining: number;
  resetAt: string;
  lastChecked: string;
}

// Exponential backoff when approaching limit
function getPollingInterval(rateLimitState: RateLimitState): number {
  const remaining = rateLimitState.remaining;
  if (remaining > 1000) return 30;   // Normal: 30s
  if (remaining > 500) return 60;    // Cautious: 60s
  if (remaining > 100) return 120;   // Conservative: 2min
  return 300;                        // Critical: 5min
}
```

**Files to modify:**
- `ci-state-collector.ts` - Add rate limit tracking from response headers
- `ci.ts` - Dynamic interval in watch mode

**Estimated effort:** 2-3 hours

---

### Priority 2: Medium Impact, Medium Effort

#### 2.1 WebSocket Real-Time Updates

**Problem:** Polling is inefficient; agents react to stale data.

**Solution:** Connect to GitHub webhooks for instant updates:

```
GitHub Webhook → Ferni Server → WebSocket → CLI Clients
```

**Implementation:**
1. Add webhook endpoint: `POST /api/webhooks/github`
2. Validate webhook signatures
3. Broadcast to connected WebSocket clients
4. CLI connects to `ws://localhost:8080/ws/ci`

**Files to create:**
- `src/api/ci-webhook-routes.ts` - Webhook receiver
- `apps/cli/src/commands/ci/ci-websocket.ts` - WebSocket client

**Estimated effort:** 6-8 hours

---

#### 2.2 Cost Attribution Dashboard

**Problem:** No visibility into which workflows consume the most runner minutes.

**Solution:**
```typescript
interface CostMetrics {
  workflowName: string;
  runsLast7d: number;
  totalMinutesLast7d: number;
  avgMinutesPerRun: number;
  estimatedMonthlyCost: number;  // At $0.008/min
  trend: 'increasing' | 'stable' | 'decreasing';
  topCostJobs: Array<{
    name: string;
    avgDuration: number;
    runCount: number;
  }>;
}
```

**New command:** `ferni ci costs`

**Files to create:**
- `ci-cost-analyzer.ts` - Cost calculation logic
- Update `ci.ts` - Add `costs` subcommand

**Estimated effort:** 4-6 hours

---

#### 2.3 Slack/Discord Notifications

**Problem:** Circuit breaker state changes go unnoticed until someone checks.

**Solution:**
```typescript
// When circuit breaker opens
if (newState === 'open' && previousState !== 'open') {
  await notifySlack({
    channel: '#ci-alerts',
    text: `🔴 CI Circuit Breaker OPEN`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reason:* ${circuitBreaker.reason}\n*Failed workflows:* ${circuitBreaker.failureCount}\n*Action:* \`ferni ci actions\``
        }
      }
    ]
  });
}
```

**Files to create:**
- `ci-notifier.ts` - Slack/Discord integration
- Add `--notify` flag to watch mode

**Estimated effort:** 3-4 hours

---

### Priority 3: Lower Impact, Higher Effort

#### 3.1 Interactive TUI Dashboard

**Problem:** ASCII dashboard is static; no keyboard interaction.

**Solution:** Use `blessed` or `ink` for interactive terminal UI:

- Arrow keys to navigate between jobs
- Enter to drill into job logs
- `r` to rerun selected job
- `c` to cancel selected run
- Real-time updating without screen flicker

**Files to create:**
- `ci-tui/` directory with blessed components
- `ci-tui-dashboard.ts` - Main TUI entry

**Estimated effort:** 8-12 hours

---

#### 3.2 Predictive Failure Detection

**Problem:** We only react to failures, never predict them.

**Solution:** Track historical patterns and surface predictions:

```typescript
interface JobHealthScore {
  jobName: string;
  successRate7d: number;
  successRate30d: number;
  avgDuration: number;
  durationTrend: 'increasing' | 'stable' | 'decreasing';
  lastNOutcomes: ('success' | 'failure')[];
  prediction: {
    nextOutcome: 'likely_pass' | 'likely_fail' | 'uncertain';
    confidence: number;
    reasoning: string;
  };
}

// Example output:
// "test-integration has failed 3 of last 5 runs (60% failure rate).
//  Duration trending up 15%. Predicted: likely_fail (72% confidence)"
```

**Files to create:**
- `ci-predictor.ts` - Historical analysis and prediction
- Store history in Firestore for persistence

**Estimated effort:** 12-16 hours

---

#### 3.3 GitHub Check Run Integration

**Problem:** CI health isn't visible in GitHub UI.

**Solution:** Post CI health as a GitHub Check:

```typescript
await octokit.checks.create({
  owner: 'ferni-ai',
  repo: 'voiceai',
  name: 'CI Health Dashboard',
  head_sha: latestCommit,
  status: 'completed',
  conclusion: circuitBreaker.state === 'closed' ? 'success' : 'failure',
  output: {
    title: `CI Health: ${circuitBreaker.state.toUpperCase()}`,
    summary: renderMinimal(state),
    text: renderMermaid(state),
  },
});
```

**Files to create:**
- `ci-github-check.ts` - Check run posting
- GitHub App setup for check permissions

**Estimated effort:** 4-6 hours

---

## Implementation Order

| Phase | Enhancements | Total Effort |
|-------|--------------|--------------|
| **Phase 1** | Parallel API, Rate Limits | 4-7 hours |
| **Phase 2** | Agent Collaboration, Cost Attribution | 8-12 hours |
| **Phase 3** | Slack Notifications, GitHub Checks | 7-10 hours |
| **Phase 4** | WebSocket Real-Time | 6-8 hours |
| **Phase 5** | TUI Dashboard, Predictive | 20-28 hours |

**Total estimated effort:** 45-65 hours

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| API calls per status check | 20+ | 5 (batched) |
| Time to detect failure | 30s (polling) | <5s (webhook) |
| Duplicate action executions | Unknown | 0 (with locks) |
| Rate limit incidents | Unknown | 0 |
| MTTR (Mean Time To Recovery) | Manual | <5 min (automated) |

---

## Related Documentation

- `docs/ci/CI-VISUALIZATION-DESIGN.md` - Original design document
- `docs/ci/CI-OPTIMIZATION-PLAN.md` - CI optimization work
- `docs/devops/00-charter.md` - CI/CD charter

---

*Last updated: 2026-02-02*
