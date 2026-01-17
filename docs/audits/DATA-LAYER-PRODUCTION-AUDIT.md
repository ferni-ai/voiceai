# Unified Data Layer - Production Audit Checklist

> **Pre-deployment checklist for the unified data layer architecture.**

Last updated: December 2024

---

## Quick Validation

```bash
# Run automated validation
npx tsx scripts/validate-data-layer.ts

# Run tests
pnpm vitest run src/tests/data-layer/

# Check for lint errors
pnpm lint src/services/data-layer/
```

---

## Architecture Checklist

### ✅ Store Integration

- [ ] **financial-store.ts** - Hooks wired for:
  - [ ] `setBudget()` calls `onBudgetChange()`
  - [ ] `setSavingsGoal()` calls `onSavingsGoalChange()`
  - [ ] `setSubscription()` calls `onSubscriptionChange()`

- [ ] **productivity-store.ts** - Hooks wired for:
  - [ ] `setHabit()` calls `onHabitChange()`
  - [ ] `setTask()` calls `onTaskChange()`
  - [ ] `setRoutine()` calls `onRoutineChange()`

- [ ] **life-data-store.ts** - Hooks wired for:
  - [ ] `saveMilestone()` calls `onMilestoneChange()`
  - [ ] `saveGoal()` calls `onLifeGoalChange()`

### ✅ Indexing Policy

- [ ] All 16 entity types have policies defined
- [ ] `note` is set to `never` (too noisy)
- [ ] Active-only entities filter correctly
- [ ] Important-only entities filter correctly
- [ ] TTL values are reasonable (0 for permanent, 30-365 for ephemeral)

### ✅ Query Router

- [ ] Bill/task/habit queries route to `structured`
- [ ] "How am I doing" queries route to `semantic`
- [ ] Keyword-based queries route to `hybrid`
- [ ] Confidence scores are reasonable (>0.5)

### ✅ Session Integration

- [ ] `onSessionStart()` warms cache
- [ ] `onSessionEnd()` flushes pending changes
- [ ] `registerShutdownHandler()` called at startup
- [ ] Graceful shutdown flushes all sessions

### ✅ Health Checks

- [ ] `isHealthy()` returns boolean
- [ ] `getDataLayerHealth()` includes all components
- [ ] `getDiagnostics()` provides recommendations
- [ ] Metrics track cache hits, latency, errors

---

## Performance Checklist

| Metric | Target | How to Measure |
|--------|--------|----------------|
| `getUnifiedContext()` | < 50ms | Time the call, check logs |
| `searchUserContext()` | < 200ms | Time the call |
| Cache hit rate | > 70% | `getQueryMetrics().cacheHitRate` |
| Indexing errors | 0 | `getIndexingMetrics().errorCount` |
| Pending changes | < 10 | `getIndexingMetrics().pendingCount` |

---

## Security Checklist

- [ ] User IDs are validated before queries
- [ ] Cross-user data access is prevented
- [ ] No PII in logs (check structured logging)
- [ ] Firestore security rules are in place

---

## Observability Checklist

- [ ] Structured logging with `createLogger()` 
- [ ] Health endpoint returns correct status
- [ ] Metrics exported for monitoring
- [ ] Error rates tracked

---

## Integration Checklist

### Context Builder

- [ ] `unified-data-context.ts` is registered
- [ ] Runs on each turn with correct priority
- [ ] Returns formatted context for LLM

### Voice Agent

- [ ] Session start calls `onSessionStart()`
- [ ] Session end calls `onSessionEnd()`
- [ ] Shutdown handler registered

### API Endpoints

- [ ] `/health` includes data layer status
- [ ] `/api/observability` includes data layer metrics

---

## Rollback Plan

If issues arise after deployment:

1. **Feature flag** - Disable auto-indexing:
   ```typescript
   // In store-hooks.ts
   const INDEXING_ENABLED = process.env.DATA_LAYER_INDEXING !== 'false';
   ```

2. **Clear bad indexes** - If incorrect data indexed:
   ```typescript
   // Clear semantic memory for user
   await vectorStore.deleteByFilter({ userId: 'affected-user' });
   ```

3. **Fallback to direct stores** - If unified layer fails:
   ```typescript
   // Bypass unified layer, query stores directly
   const data = await getProductivityStore().loadUserData(userId);
   ```

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Reviewer | | | |
| QA | | | |

---

## Notes

Add any deployment-specific notes here:

- 
- 
- 

---

*This checklist should be completed before each production deployment involving the data layer.*
