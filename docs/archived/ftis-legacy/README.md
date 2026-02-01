# Archived FTIS Documentation

> **Archived: January 2026**

## What is FTIS?

FTIS (Function/Tool Intent System) was the original tool routing system. It has been replaced with:

- `tool-classifier.ts` - ML-based tool intent classification
- `tool-router.ts` - Hybrid routing (pattern matching + ML)
- `unified-router.ts` - Backend selection orchestration

## Why Archived?

These documents reference the old FTIS system which was renamed/refactored in December 2025:
- `ftis-classifier-v2.ts` → `tool-classifier.ts`
- `ftis-hybrid-router.ts` → `tool-router.ts`
- Various FTIS* files consolidated

## Current Documentation

For the current tool routing system, see:
- `docs/architecture/TOOL-LOADING-SYSTEM.md`
- `src/tools/CLAUDE.md`
- `src/tools/semantic-router/CLAUDE.md`

## Files in This Archive

| File | Original Purpose |
|------|------------------|
| `FTIS-PRODUCTION-READINESS.md` | Production readiness checklist (obsolete) |
| `FTIS-ROLLOUT-RUNBOOK.md` | Rollout procedures (obsolete) |
| `FTIS-SOTA-2026-PLAN.md` | Future plans (incorporated into roadmap) |
| `FTIS-TOOL-ID-MAPPING.md` | Tool ID mappings (now in tool-classifier.ts) |
| `FTIS-V2-E2E-AUDIT.md` | V2 audit (completed) |
| `FTIS-V2-E2E-FLOW.md` | V2 flow diagram (obsolete) |
| `FTIS-V3-INTEGRATION-AUDIT.md` | V3 audit (completed) |

---

*Do not delete this archive - it may contain historical context useful for debugging.*
