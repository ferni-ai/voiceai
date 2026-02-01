# TODO Triage - January 2026

> **Summary:** 964 total TODOs. Most are documentation NOTEs, not work items.

---

## Statistics

| Category | Count | Status |
|----------|-------|--------|
| Total TODOs | 964 | - |
| Fresh (<30 days) | 468 | Active development |
| Stale (30-90 days) | 496 | Review needed |
| Ancient (>90 days) | 0 | Clean! |

### By Type

| Type | Count | Assessment |
|------|-------|------------|
| NOTE | 766 | Documentation - keep as context |
| TODO | 167 | Mix of work items and notes |
| BUG | 16 | Actually fix documentation, not open bugs |
| REVIEW | 9 | Code review reminders |
| OPTIMIZE | 6 | Performance opportunities |

---

## Key Findings

### 1. "BUG" Comments Are Actually Fix Documentation

All 16 "BUG" items are comments explaining **why a fix was made**, not open bugs:

```typescript
// BUG FIX: This was missing for handoff agents! Without it, transcript/tools don't work.
// BUG FIX: Use display name instead of persona ID for natural speech
```

**Action:** No action needed. These are valuable context.

---

### 2. "NOTE" Comments Are Documentation

766 of 964 items are NOTEs explaining design decisions:

```typescript
// NOTE: Jack Bogle (sage-mentor) moved to Agent Marketplace
// NOTE: Main personas (peter-john, alex-chen, maya-santos, ...)
// NOTE: Path is relative from tools/domains/handoff/ to tools/handoff/
```

**Action:** Keep as documentation. Consider converting some to JSDoc.

---

### 3. Outdated Migration Notes (Can Be Removed)

Several TODOs are migration notes that are now stale:

| File | Note | Action |
|------|------|--------|
| `personas/team/team-config.ts` | Jack Bogle moved to Marketplace | Remove after 90 days |
| `agents/handlers/index.ts` | Handoff handling moved | Remove |
| `tools/handoff/index.ts` | Phrase exports removed | Remove |

---

### 4. Actual Work Items

Real TODO items that need attention:

| File | TODO | Priority |
|------|------|----------|
| `telephony/telephony.ts:124` | Actual LiveKit SIP implementation | Medium |
| `memory-management.ts:693` | Need to implement deleteSummary | Low |
| `semantic-router/benchmarks.ts` | Refactor to align with TurnRouterResult API | Low |

---

## Recommendations

### Immediate Actions (This Week)

1. **Remove 5-10 outdated migration notes** (team-config.ts, handlers/index.ts)
2. **Keep BUG fix comments** - they're valuable context

### Ongoing Practice

1. Use `TODO:` for actual work items
2. Use `NOTE:` for context/documentation
3. Use `FIXME:` for bugs that need fixing
4. Use `BUG FIX:` prefix for explaining completed fixes

### Threshold Monitoring

Current: 964 total, 16 "critical"
Target: Keep under 1000, reduce "critical" to 0 real bugs

---

## Commands

```bash
# View all stale TODOs
pnpm audit:todos:stale

# View only critical (BUG/FIXME)
pnpm audit:todos:critical

# Full TODO report
pnpm audit:todos
```

---

## Conclusion

The codebase is in good shape for TODOs:
- No ancient (>90 day) items
- "Critical" items are actually fix documentation
- NOTEs provide valuable context

**No major cleanup needed.** Consider removing 5-10 stale migration notes over time.
