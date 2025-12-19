# Legacy Agent Files

> **⚠️ ARCHIVED - Do not use in production**

These files were moved here during the December 2024 architecture cleanup. They are kept for historical reference but are **not used in production**.

## Production Architecture (GCE)

The canonical entry points are:
- `../worker.ts` → GCE voice worker (primary entry point)
- `../voice-agent-entry.ts` → Session lifecycle management

## Archived Files

| File | Original Purpose | Why Archived |
|------|------------------|--------------|
| `voice-agent.ts` | Monolithic 3920-line agent | Replaced by modular `voice-agent-entry.ts` + handlers |
| `voice-worker-single-process.ts` | Cloud Run single-process mode | GCE doesn't need this (uses multi-process) |
| `voice-agent-child.ts` | Child process agent definition | Replaced by `voice-agent-entry.ts` |
| `in-process-executor.ts` | Cloud Run in-process execution | Not used on GCE |

## Why Keep These?

1. **Historical reference** - Understand past architecture decisions
2. **Rollback capability** - In case of critical issues with new architecture
3. **Migration guide** - See how code was refactored

## Migration Path

If you need to restore any of this code:
1. Check the git history for context
2. Verify the code still works with current dependencies
3. Update imports to match current module structure
4. Add tests before reintegrating

---

*Archived: December 2024*
*Reason: Clean architecture refactoring - see docs/architecture/CLEAN-ARCHITECTURE.md*

