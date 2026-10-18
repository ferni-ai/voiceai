/**
 * Registers dates that matter (intelligence/world-model/dates/after-call.ts)
 * as an after-call task. DATES_THAT_MATTER=on turns it on; off, the task
 * returns before any model call. Imported for its side effect by
 * agents/after-call-register.ts.
 *
 * @module agents/dates-register
 */
import { isMemberCall } from '../services/outreach/after-call-checkin.js';
import { registerAfterCallTask } from '../services/session/after-call-tasks.js';
import { DATES_TASK, extractDatesAfterCall } from '../intelligence/world-model/dates/after-call.js';

// One model call (20 s timeout) and one store write.
registerAfterCallTask(DATES_TASK, (ctx) => extractDatesAfterCall(ctx, { isMember: isMemberCall }), {
  timeoutMs: 30_000,
});
