# Documentation Cleanup Plan - December 2024

> **Last Updated:** December 23, 2024
> **Status:** In Progress

## Executive Summary

This document tracks a comprehensive documentation audit and cleanup. The Ferni codebase has ~918 markdown files (excluding node_modules/dist/vendor). This cleanup focuses on the `/docs` directory and root-level documentation.

### Key Issues Identified

1. **Root-level docs clutter** - 8 docs at `/docs/` root that should be in subdirectories
2. **Completed audits not archived** - 55 audit files, many with "✅ COMPLETE" status
3. **Completed plans not archived** - Several plans marked as done
4. **Outdated status docs** - Multiple status files that need consolidation
5. **Inconsistent organization** - Similar docs in different locations

---

## Phase 1: Root-Level Cleanup ✅

Move misplaced files from `/docs/` root to proper subdirectories:

| File | Move To | Reason |
|------|---------|--------|
| `COVERAGE-IMPROVEMENT-PLAN.md` | `docs/plans/` | Implementation plan |
| `LIFE-COACHING-DOMAINS-EXPANSION.md` | `docs/plans/` | Feature expansion plan |
| `REFACTORING-PLAN.md` | `docs/refactoring/` | Refactoring work |
| `SEMANTIC-ROUTER-TRAINING-DATA.md` | `docs/guides/` | Reference/guide material |
| `SERVICES-AUDIT.md` | `docs/audits/` | Audit document |
| `SPEECH-MIGRATION-GUIDE.md` | `docs/guides/` | Migration guide |
| `STABILITY-PLAN.md` | `docs/plans/` | Implementation plan |

---

## Phase 2: Archive Completed Audits

Move completed audits to `docs/archive/completed-audits/`:

### Confirmed Complete (based on status markers)
- `ACCESSIBILITY-AUDIT-2024-12.md` - "✅ ALL DASHBOARDS PASS"
- `ALEX-CALENDAR-PHASE1-AUDIT.md` - "Phase 1 COMPLETE"
- `DASHBOARD-AUDIT.md` - "ALL PHASES COMPLETE"
- `EMOTION-ANIMATION-AUDIT.md` - "✅ ALL GAPS FIXED"
- `MENU-AUDIT-2024-12.md` - Reviewed and resolved

### Should Stay Active
- Keep audits that are ongoing or have unresolved issues
- Keep audits that serve as living reference documents

---

## Phase 3: Archive Completed Plans

Move completed plans to `docs/archive/completed-plans/`:

### Confirmed Complete
- `UNUSED-IMPORTS-IMPLEMENTATION-PLAN.md` - Analysis complete, not actionable
- `MOBILE-MIGRATION-STATUS.md` - 85%+ complete, status doc not plan
- `DASHBOARD-SPRINT-PLAN.md` - Sprint complete
- `E2E-AUDIT-PLAN.md` - Audit complete

---

## Phase 4: Consolidate Status Documents

Current `/docs/status/` has 6 files that should be consolidated:

| File | Action |
|------|--------|
| `CURRENT-STATE-SUMMARY.md` | **KEEP** - Primary status doc |
| `DETAILED-FEATURE-TODOS.md` | Merge into CURRENT-STATE-SUMMARY or archive |
| `DOCUMENTATION-STATE.md` | **KEEP** - Meta documentation |
| `PROGRESS-2024-12-13.md` | Archive - Point-in-time snapshot |
| `SYSTEM-HEALTH-REPORT.md` | **KEEP** - Ongoing health tracking |
| `TECH-DEBT.md` | **KEEP** - Auto-generated |

---

## Phase 5: Update README Index

After moves, update:
1. `/docs/README.md` - Main documentation index
2. `/docs/audits/README.md` - Audit index
3. `/docs/plans/README.md` - Plans index (create if missing)
4. `/docs/archive/README.md` - Archive index

---

## Cleanup Commands

```bash
# Phase 1: Move root-level docs
mv docs/COVERAGE-IMPROVEMENT-PLAN.md docs/plans/
mv docs/LIFE-COACHING-DOMAINS-EXPANSION.md docs/plans/
mv docs/REFACTORING-PLAN.md docs/refactoring/
mv docs/SEMANTIC-ROUTER-TRAINING-DATA.md docs/guides/
mv docs/SERVICES-AUDIT.md docs/audits/
mv docs/SPEECH-MIGRATION-GUIDE.md docs/guides/
mv docs/STABILITY-PLAN.md docs/plans/

# Phase 2-3: Create completed archive folders
mkdir -p docs/archive/completed-audits
mkdir -p docs/archive/completed-plans

# Move completed audits (selective)
# mv docs/audits/ACCESSIBILITY-AUDIT-2024-12.md docs/archive/completed-audits/
# ... etc
```

---

## Post-Cleanup Metrics

### Before
- Files at `/docs/` root: 8
- Active audits: 55
- Active plans: 38
- Status files: 6

### Target After
- Files at `/docs/` root: 1 (README.md only)
- Active audits: ~35 (ongoing)
- Active plans: ~25 (active)
- Status files: 4 (consolidated)

---

_Created: December 23, 2024_

