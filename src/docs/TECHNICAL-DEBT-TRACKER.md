# Technical Debt Tracker

> Categorized technical debt items for prioritized cleanup.

**Last Updated:** January 2026

---

## Summary

| Category | Count | Priority |
|----------|-------|----------|
| Migration TODOs | 5 | HIGH |
| Incomplete Features | 8 | MEDIUM |
| Test Skips | 25+ | LOW |
| `as any` Casts | ~48 | THRESHOLD |
| Console Usage | ~1000+ | LOW |

---

## 🔴 HIGH Priority (Migration/Critical)

These TODOs block future refactoring or represent incomplete migrations.

| Location | Issue | Action |
|----------|-------|--------|
| `services/memory/cognitive-persistence.ts:7` | Migrate to unified-memory-service | Complete migration, delete file |
| `services/memory/cognitive-memory.ts:8` | Migrate to unified-memory-service | Complete migration, delete file |
| `services/memory/learned-memories.ts:7` | Migrate to unified-memory-service | Complete migration, delete file |
| `memory/orchestrator.ts:393` | Entity store migration incomplete | Complete migration, remove TODO |
| `intelligence/data-capture/index.ts:348` | Post-migration cleanup | Remove legacy code path |

---

## 🟡 MEDIUM Priority (Incomplete Features)

Nice-to-have improvements that would enhance functionality.

| Location | Issue | Impact |
|----------|-------|--------|
| `api/routes/memories.ts:533` | Pagination not implemented | Large memory lists not pageable |
| `tools/orchestrator/unified-tool-orchestrator.ts:1670-1672` | Missing complexity/urgency/audio params | Reduced tool selection quality |
| `memory/spanner-graph/graph-expansion.ts:602,611` | Spanner Enterprise features | Can't use GQL-based expansion |
| `tools/intelligence/router/inference/router-model.ts:176` | No batched inference | Lower throughput |
| `services/outreach/delivery/email-delivery.ts:491` | validatedSubject unused | Potential email subject issues |
| `api/custom-agent-features.routes.ts:675` | Async task processing | Tasks not truly async |
| `services/workflows/workflow-engine.ts:124` | No full cron parser | Limited scheduling options |
| `services/family/family-context-sharing.ts:298` | Analysis not implemented | Placeholder context |

---

## 🟢 LOW Priority (Informational/Deferred)

TODOs that are informational or can be deferred indefinitely.

| Location | Issue | Notes |
|----------|-------|-------|
| `servers/api/index.ts:563` | Express router pattern note | Technical debt documentation only |
| `intelligence/tracking/preferences.ts:7` | Full NLP implementation | Future enhancement |
| `services/data-layer/health.ts:70` | Hourly error tracking | Nice-to-have metric |
| `services/data-layer/domain-signals.ts:7` | Integration note | Documentation |
| `audio/intelligent-music-transitions.ts:1164` | Topic detection | Placeholder value works |

---

## 📊 Placeholder Values (LOW)

TODOs for placeholder data that should be calculated:

| Location | Placeholder | Actual Source Needed |
|----------|-------------|---------------------|
| `services/admin/daily-report.ts:163` | `newUsers: 0` | User creation dates |
| `services/workflows/jobs/redis-job-queue.ts:560` | `throughput: 0` | Time series calc |
| `services/outreach/automated-scheduler.ts:200` | `conversationCount: 0` | Actual count |
| `memory/unified-store/facade.ts:790` | `linksStrengthened: 0` | Link tracking |

---

## 🧪 Skipped Tests (Technical Debt)

~25 tests are skipped due to:
1. **Module moves/deletes** - Old imports reference moved files
2. **Mock limitations** - Firestore mock too simple
3. **Test isolation** - Module-level caching issues

**Recommendation:** Create issue to update test imports and improve mocks.

---

## 📝 `as any` Analysis

**Current Count (Production):** ~22 actual casts (threshold: ≤30) ✅ **WITHIN THRESHOLD**

### Breakdown by Category

| Category | Count | Acceptable? |
|----------|-------|-------------|
| Google Generative AI types | 4 | ✅ Yes - Library types incomplete |
| Firestore dynamic data | 5 | ✅ Yes - Runtime data |
| LiveKit/Cartesia types | 3 | ✅ Yes - Library types |
| Tool orchestration | 2 | ⚠️ Review - Type mismatch workaround |
| Stub contexts | 2 | ✅ Yes - Internal routing |
| Express mock | 3 | ⚠️ Test-like patterns in prod |
| Cloud Monitoring import | 2 | ✅ Yes - Dynamic import |
| Vision response | 1 | ✅ Yes - Runtime API response |

### Specific Files Needing Attention

| File | Issue | Recommendation |
|------|-------|----------------|
| `agents/multi-agent/agent-setup.ts:1382` | `tools: orchestratorTools as any` | Create proper ToolSet type |
| `servers/api/index.ts:575` | `mockApp(req as any, res as any)` | Move mock to test file |

### Guidelines

**Rules:**
1. Document WHY the cast is necessary with a comment
2. Prefer `as unknown as Type` over `as any`
3. Adding new `as any` requires removing one elsewhere
4. Create ticket for proper typing when possible

**Acceptable Uses:**
- Third-party library type mismatches (Google AI, LiveKit)
- Dynamic runtime data from Firestore (`doc.data() as any`)
- Dynamic imports (`await import(...) as any`)

**Unacceptable Uses:**
- Avoiding type errors during development
- Lazy typing of internal code
- Bypassing strict null checks

---

## 📝 Console Usage Guidelines

**Current Count:** ~1000+ (threshold: ≤100)

Most console usage is in:
- Test files (acceptable)
- Debug statements (should use createLogger)
- Startup logging (acceptable - before logger init)

**Rule:** New code should use `createLogger({ module: 'name' })` pattern.

---

## Cleanup Schedule

### Phase 1 (This Sprint)
- [ ] Complete memory service migration (3 files)
- [ ] Fix validatedSubject usage in email-delivery

### Phase 2 (Next Sprint)
- [ ] Add pagination to memories API
- [ ] Update skipped tests to new module paths

### Phase 3 (Backlog)
- [ ] Implement batched inference
- [ ] Add Spanner Enterprise detection
- [ ] Reduce `as any` count to ≤30

---

*This file is part of the technical debt tracking system. Update counts quarterly.*
