# 🎯 Remediation Quick Reference Checklist

> **Use this checklist daily to track progress on the comprehensive remediation plan.**

---

## 📊 Current Status Dashboard

Run `npm run audit:health` to get current metrics.

| Metric             | Baseline | Target | Current     | Status |
| ------------------ | -------- | ------ | ----------- | ------ |
| `any` usages       | 1,118    | <100   | _run audit_ | ⏳     |
| Console violations | 1,086    | 0      | _run audit_ | ⏳     |
| TODO/FIXME markers | 308      | <50    | _run audit_ | ⏳     |
| Skipped tests      | 134      | <10    | _run audit_ | ⏳     |

---

## ✅ Phase 1: Critical Bugs (Weeks 1-2)

### Week 1: Session State Contamination

- [ ] **Handoff State Bugs #1-4** (`src/tools/handoff-state.ts`)
  - [ ] Verify `createHandoffState()` called for each session
  - [ ] Add session ID validation to all state operations
  - [ ] Create concurrent session isolation test
  - [ ] Run: `npm test -- handoff-session`

- [ ] **Session Manager Bugs #5-20** (`src/services/session-manager.ts`)
  - [ ] Audit all `FIX BUG` comments (11 documented)
  - [ ] Add regression test for each bug number
  - [ ] Run: `npm test -- session-manager`

### Week 2: Silent Failures

- [ ] **Vector Store Hardening** (`src/memory/firestore-vector-store.ts`)
  - [ ] Add startup health check
  - [ ] Emit metric when falling back
  - [ ] Add periodic retry logic
  - [ ] Create `/health/vector-store` endpoint

- [ ] **Circuit Breaker Audit** (`src/utils/circuit-breaker.ts`)
  - [ ] Audit all usages
  - [ ] Verify thresholds per service
  - [ ] Add metrics for open/close events

---

## ✅ Phase 2: Type Safety & Logging (Weeks 3-4)

### Week 3: Type Safety Sprint

**Priority Files (by `any` count):**

| File                                            | `any` Count | Owner | Status |
| ----------------------------------------------- | ----------- | ----- | ------ |
| `src/agents/__tests__/mocks/services-mock.ts`   | 22          |       | [ ]    |
| `src/tests/better-than-phd-integration.test.ts` | 16          |       | [ ]    |
| `src/tools/gamification.ts`                     | 15          |       | [ ]    |
| `src/tools/financial-habits.ts`                 | 14          |       | [ ]    |
| `src/tasks/agent-task.ts`                       | 13          |       | [ ]    |
| `src/agents/voice-agent-entry.ts`               | 11          |       | [ ]    |

**Daily Goal**: Fix 10 `any` usages per day = 50 per week

### Week 4: Logging Migration

**Priority Files (by console violations):**

| File                                                    | Violations | Status |
| ------------------------------------------------------- | ---------- | ------ |
| `src/cli/tools-report.ts`                               | 292        | [ ]    |
| `src/cli/experiments-cli.ts`                            | 75         | [ ]    |
| `src/cli/agent-manager.ts`                              | 62         | [ ]    |
| `src/intelligence/context-builders/humanizing-debug.ts` | 50         | [ ]    |

**Pattern to use:**

```typescript
// Replace:
console.log('message', data);

// With:
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'ModuleName' });
log.info({ data }, 'message');
```

---

## ✅ Phase 3: Test Coverage (Weeks 5-6)

### Week 5: Enable Skipped Tests

**Files with most skipped tests:**

| File                                                     | Skipped | Status |
| -------------------------------------------------------- | ------- | ------ |
| `src/tests/speech-modules.test.ts`                       | 43      | [ ]    |
| `src/tasks/__tests__/transitions.test.ts`                | 13      | [ ]    |
| `src/agents/__tests__/voice-agent-integration.test.ts`   | 7       | [ ]    |
| `src/tests/integrations/google-places-e2e.test.ts`       | 6       | [ ]    |
| `src/tests/awareness-system.test.ts`                     | 6       | [ ]    |
| `src/agents/processors/__tests__/turn-processor.test.ts` | 6       | [ ]    |

**Action for each skipped test:**

1. Determine why it's skipped
2. If broken → fix it
3. If slow → move to e2e suite
4. If deprecated → delete it
5. If intentional → add `// Reason: ...` comment

### Week 6: E2E Coverage

**New E2E tests to create:**

- [ ] `src/tests/e2e/voice-agent-lifecycle.test.ts`
- [ ] `src/tests/e2e/memory-persistence.test.ts`
- [ ] `src/tests/e2e/handoff-isolation.test.ts`
- [ ] `src/tests/e2e/subscription-flow.test.ts`

---

## ✅ Phase 4: Performance & Polish (Weeks 7-8)

### Week 7: Performance

- [ ] Profile context builders (target: all <50ms)
- [ ] Optimize voice agent startup (target: <2s cold)
- [ ] Add latency metrics to all critical paths
- [ ] Create performance baseline report

### Week 8: Observability

- [ ] Deploy metrics dashboard
- [ ] Configure alerting rules
- [ ] Update documentation
- [ ] Final audit run

---

## 🔁 Daily Routine

### Before Starting Work

```bash
# 1. Check current health
npm run audit:health

# 2. Check for regressions
npm run typecheck
npm run lint

# 3. Run relevant tests
npm test -- --watch
```

### When Fixing Files

```bash
# After fixing a file:
npm run typecheck              # No new type errors
npm run lint -- path/to/file   # No lint errors
npm test -- path/to/file       # Tests pass
```

### Before Committing

```bash
# Pre-commit checklist:
npm run typecheck
npm run lint
npm test
npm run audit:health  # Metrics should improve or stay same
```

---

## 📈 Weekly Progress Report Template

```markdown
## Week N Progress Report

### Metrics

- `any` usages: X → Y (Δ -Z)
- Console violations: X → Y (Δ -Z)
- TODO/FIXME: X → Y (Δ -Z)
- Skipped tests: X → Y (Δ -Z)

### Completed

- [ ] Task 1
- [ ] Task 2

### Blockers

- Issue 1: Description

### Next Week

- [ ] Planned task 1
- [ ] Planned task 2
```

---

## 🚨 Escalation Triggers

**Escalate immediately if:**

- [ ] Session contamination detected in production
- [ ] Vector store enters fallback mode
- [ ] Circuit breaker opens on critical path
- [ ] Test coverage drops below 60%
- [ ] P99 latency exceeds 1000ms

---

## 📚 Reference Links

- [Full Remediation Plan](./COMPREHENSIVE-REMEDIATION-PLAN.md)
- [Code Quality Standards](../../.cursorrules)
- [Core Principles](../../CORE-PRINCIPLES.md)
- [Architecture Docs](../architecture/)

---

_Last updated: December 14, 2024_
