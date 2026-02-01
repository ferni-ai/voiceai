# Scheduled Jobs

> **Background jobs that maintain the "Better Than Human" memory promise**

The scheduled jobs system provides background processing for memory maintenance, proactive outreach, and system health. Jobs are triggered via Cloud Scheduler and run on a configurable schedule.

---

## Job Files

| File | Purpose | Schedule |
|------|---------|----------|
| `base-job.ts` | Abstract base class for all jobs | - |
| `memory-jobs.ts` | Memory consolidation, decay, deduplication | Daily/Weekly |
| `knowledge-graph-jobs.ts` | Entity consolidation, thread maintenance, decay | Daily/Weekly |
| `superhuman-memory-jobs.ts` | User memory indexing, insight generation | Daily |
| `calendar-jobs.ts` | Calendar sync, reminders | Hourly |
| `calendar-briefing-job.ts` | Morning briefing generation | Daily 6am |
| `proactive-outreach-job.ts` | Proactive user engagement | Varies |
| `better-than-human-outreach.ts` | Superhuman-level outreach timing | Varies |
| `wellbeing-jobs.ts` | Wellbeing check-ins, mood tracking | Daily |
| `marketplace-billing-jobs.ts` | Subscription billing, usage tracking | Daily/Monthly |
| `deep-analysis-job.ts` | Deep analysis processing | Varies |

---

## Architecture

### Base Job Pattern

All jobs extend `ScheduledJob<Config, Result>`:

```typescript
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

interface MyJobConfig extends BaseJobConfig {
  batchSize: number;
}

interface MyJobResult extends BaseJobResult {
  itemsProcessed: number;
}

class MyJob extends ScheduledJob<MyJobConfig, MyJobResult> {
  name = 'MyJob';

  protected async execute(ctx: JobContext): Promise<Partial<MyJobResult>> {
    ctx.log.info('Starting job...');

    // Process items
    for (const item of items) {
      if (ctx.isDryRun) {
        ctx.log.debug({ item }, 'Would process (dry run)');
        ctx.counters.skipped++;
        continue;
      }

      await processItem(item);
      ctx.counters.success++;
    }

    return {
      itemsProcessed: ctx.counters.success,
    };
  }
}
```

### Job Context

Every job receives a `JobContext`:

```typescript
interface JobContext {
  startedAt: Date;
  log: Logger;           // Scoped logger for this execution
  isDryRun: boolean;     // If true, log but don't modify
  counters: {
    processed: number;
    success: number;
    skipped: number;
    errors: number;
  };
}
```

### Base Result

Every job returns `BaseJobResult`:

```typescript
interface BaseJobResult {
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  wasDryRun: boolean;
  itemsProcessed: number;
  successCount: number;
  skippedCount: number;
  errorCount: number;
}
```

---

## Memory Jobs (`memory-jobs.ts`)

### MemoryConsolidationJob

Compresses related memories for long-term users.

| Config | Default | Description |
|--------|---------|-------------|
| `batchSize` | 100 | Users per batch |
| `maxMemoriesPerUser` | 1000 | Max memories to process |
| `consolidationThreshold` | 0.85 | Similarity threshold |

**Schedule:** Weekly (Sunday 3am PT)

### MemoryDecayJob

Applies graceful forgetting with configurable decay curves.

| Config | Default | Description |
|--------|---------|-------------|
| `decayCurve` | 'exponential' | Decay algorithm |
| `halfLife` | 30 | Days to half importance |
| `minScore` | 0.1 | Minimum score before removal |

**Schedule:** Daily (4am PT)

### MemoryDeduplicationJob

Removes redundant memories using LSH (Locality Sensitive Hashing).

| Config | Default | Description |
|--------|---------|-------------|
| `similarityThreshold` | 0.95 | Duplicate threshold |
| `useRust` | true | Use Rust-accelerated LSH |

**Schedule:** Weekly (Saturday 2am PT)

### TranscriptCleanupJob

Removes old transcripts and summaries per retention policy.

| Constant | Value | Description |
|----------|-------|-------------|
| `TRANSCRIPT_RETENTION_DAYS` | 30 | Keep transcripts 30 days |
| `SUMMARY_RETENTION_DAYS` | 90 | Keep summaries 90 days |
| `GROUP_TRANSCRIPT_RETENTION_DAYS` | 7 | Keep group transcripts 7 days |

**Schedule:** Daily (5am PT)

---

## Knowledge Graph Jobs (`knowledge-graph-jobs.ts`)

### KnowledgeGraphConsolidationJob

Merges duplicate entities in the knowledge graph.

**Schedule:** Weekly (Monday 3am PT)

### KnowledgeGraphThreadMaintenanceJob

Marks dormant threads, cleans up expired.

**Schedule:** Daily (4am PT)

### KnowledgeGraphEntityDecayJob

Applies importance decay to entities.

**Schedule:** Daily (5am PT)

---

## Calendar Jobs (`calendar-jobs.ts`)

### CalendarSyncJob

Syncs calendar events from Google Calendar.

**Schedule:** Every 15 minutes

### CalendarReminderJob

Generates upcoming event reminders.

**Schedule:** Hourly

### CalendarBriefingJob (`calendar-briefing-job.ts`)

Generates personalized morning briefings.

**Schedule:** Daily 6am (user timezone)

---

## Proactive Outreach (`proactive-outreach-job.ts`)

### ProactiveOutreachJob

Identifies users who would benefit from proactive contact.

**Triggers:**
- Haven't talked in 3+ days
- Upcoming commitments/events
- Detected life event patterns
- Low mood trajectory

**Schedule:** Every 4 hours

### BetterThanHumanOutreachJob (`better-than-human-outreach.ts`)

Superhuman-level timing for outreach.

**Features:**
- Time zone awareness
- Work schedule detection
- Mood pattern analysis
- Event correlation

**Schedule:** Every 2 hours

---

## Cloud Scheduler Integration

Jobs are triggered via HTTP endpoints:

```yaml
# infra/cloud-scheduler-memory.yaml
- name: memory-consolidation
  schedule: "0 3 * * 0"  # Sunday 3am
  endpoint: /api/scheduled/memory-consolidation
  method: POST
  body:
    dryRun: false
    batchSize: 100

- name: memory-decay
  schedule: "0 4 * * *"  # Daily 4am
  endpoint: /api/scheduled/memory-decay
  method: POST
```

### API Handler

```typescript
// src/api/scheduled-jobs.routes.ts
router.post('/memory-consolidation', async (req, res) => {
  const job = new MemoryConsolidationJob(req.body);
  const result = await job.run();
  res.json(result);
});
```

---

## CLI Commands

```bash
# Deploy all memory scheduler jobs
ferni ops memory:deploy-scheduler

# Check job status
ferni ops memory:scheduler-status

# Manually trigger a job
ferni ops memory:trigger memory-consolidation

# List available jobs
ferni ops memory:list
```

---

## Creating a New Job

1. **Extend `ScheduledJob`:**

```typescript
// my-new-job.ts
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

interface MyJobConfig extends BaseJobConfig {
  myOption: string;
}

interface MyJobResult {
  customMetric: number;
}

export class MyNewJob extends ScheduledJob<MyJobConfig, MyJobResult> {
  name = 'MyNewJob';

  protected async execute(ctx: JobContext): Promise<Partial<MyJobResult>> {
    // Implementation
    return { customMetric: 42 };
  }
}
```

2. **Add API route:**

```typescript
// src/api/scheduled-jobs.routes.ts
router.post('/my-new-job', async (req, res) => {
  const job = new MyNewJob(req.body);
  const result = await job.run();
  res.json(result);
});
```

3. **Add to Cloud Scheduler:**

```yaml
# infra/cloud-scheduler-custom.yaml
- name: my-new-job
  schedule: "0 6 * * *"
  endpoint: /api/scheduled/my-new-job
  method: POST
```

4. **Deploy:**

```bash
ferni ops memory:deploy-scheduler
```

---

## Dry Run Mode

All jobs support dry run mode for testing:

```bash
# Via API
curl -X POST http://localhost:8080/api/scheduled/memory-consolidation \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Via CLI
ferni ops memory:trigger memory-consolidation --dry-run
```

In dry run mode:
- Jobs log what they **would** do
- No data is modified
- Counters track `skipped` instead of `success`

---

## Monitoring

Jobs emit metrics to the observability system:

```typescript
// Automatic metrics from base job
{
  job_name: 'MemoryConsolidationJob',
  duration_ms: 12345,
  items_processed: 500,
  success_count: 480,
  error_count: 2,
  skipped_count: 18,
  was_dry_run: false
}
```

### Alerts

The `MemoryHealthCheckJob` sends alerts when:
- Memory usage exceeds threshold
- Duplicate rate is too high
- Consolidation backlog is growing
- Error rate exceeds 5%

---

## Testing

```bash
# Run scheduled job tests
pnpm vitest run src/tasks/scheduled/__tests__/

# Test with emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/tasks/scheduled/
```

---

## Related Files

- `../CLAUDE.md` - Tasks module overview
- `src/api/scheduled-jobs.routes.ts` - API handlers
- `infra/cloud-scheduler-memory.yaml` - Memory job schedules
- `infra/cloud-scheduler-knowledge-graph.yaml` - Knowledge graph schedules
- `apps/cli/src/commands/ops/memory-scheduler.ts` - CLI commands

---

*Last updated: January 2026*
