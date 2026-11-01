/**
 * Registers the summary inside-joke sweep (memory/storage/summary-joke-retention.ts) as an
 * after-call task: once a call's summary is saved, bits from summaries more than a year old
 * leave them (Seth, 2026-10-26). Always on: it's retention, not a feature. Imported for its side
 * effect by agents/after-call-register.ts.
 *
 * @module agents/summary-joke-retention-register
 */
import { registerAfterCallTask } from '../services/session/after-call-tasks.js';
import { dropExpiredSummaryJokes } from '../memory/storage/summary-joke-retention.js';

// One query and at most one batch write.
registerAfterCallTask(
  'summary-joke-retention',
  async (ctx) => {
    await dropExpiredSummaryJokes(ctx.userId);
  },
  { timeoutMs: 15_000 }
);
