# Jobs Module

Background jobs for system maintenance tasks.

## Purpose

Scheduled and manual batch operations that maintain system health:
- Memory maintenance (consolidation, decay, pattern detection)
- Background intelligence processing
- Data cleanup operations

## Architecture Layer

**Layer 100 (Application)** - Top-level entry points that orchestrate lower layers.

## Key Files

| File | Purpose |
|------|---------|
| `memory-maintenance.ts` | Nightly memory optimization job |

## Memory Maintenance Job

Runs periodically (nightly) to keep the memory system healthy:

| Operation | Description |
|-----------|-------------|
| **LLM Link Detection** | Find semantic connections between memories (batch process) |
| **Pattern Formation** | Detect behavioral patterns from memory clusters |
| **Memory Consolidation** | Group related memories together |
| **Decay Application** | Fade irrelevant memories over time |
| **Protection Cleanup** | Remove expired memory protections |

This is the "background intelligence" that makes memory better than human - a friend who not only remembers but also organizes and curates.

## Usage

```bash
# Run for all eligible users
npx tsx src/jobs/memory-maintenance.ts

# Run for specific user
npx tsx src/jobs/memory-maintenance.ts --user=user_123

# Dry run (no changes)
npx tsx src/jobs/memory-maintenance.ts --dry-run
```

## Configuration

```typescript
const config: MaintenanceConfig = {
  maxUsersPerRun: 100,        // Limit users per batch
  enableLlmLinks: true,        // LLM link detection (expensive)
  enablePatterns: true,        // Pattern formation
  enableConsolidation: true,   // Memory consolidation
  enableDecay: true,           // Decay old memories
  maxMemoriesForLlmLinks: 50,  // Limit for LLM processing
  minDaysSinceLastRun: 1,      // Skip recently processed users
};
```

## Programmatic Usage

```typescript
import { runUserMaintenance, runBatchMaintenance } from '../jobs/memory-maintenance.js';

// Single user
const result = await runUserMaintenance('user_123', {
  enableLlmLinks: false,  // Skip expensive LLM processing
});

// Batch all users
const batchResult = await runBatchMaintenance();
console.log(`Processed ${batchResult.usersProcessed} users`);
```

## Scheduling

Intended to run via Cloud Scheduler:
- **Frequency**: Nightly at 2-4 AM (low traffic)
- **Duration**: ~1-2 hours for full user base
- **Cost**: LLM link detection is the expensive part

## Rules for Adding New Jobs

1. **Create separate file** - One job per file in `src/jobs/`
2. **Support CLI** - Include `main()` function for command line usage
3. **Add dry-run** - Always support `--dry-run` flag
4. **Log progress** - Use structured logging with `createLogger()`
5. **Handle failures gracefully** - Continue processing other items on error
6. **Record runs** - Store last run time for rate limiting

## Integration Points

- `src/memory/` - Memory operations (graph, protection, patterns)
- `src/services/superhuman/` - Firestore for maintenance records
- Cloud Scheduler - Production job triggering
