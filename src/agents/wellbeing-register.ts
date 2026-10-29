/**
 * Registers the after-call wellbeing snapshot (services/wellbeing-tracking/after-call.ts).
 * WELLBEING_AFTER_CALL=on turns it on; off, the task returns before any model call.
 * Imported for its side effect by agents/after-call-register.ts.
 *
 * @module agents/wellbeing-register
 */
import { registerAfterCallTask } from '../services/session/after-call-tasks.js';
import {
  WELLBEING_TASK,
  recordWellbeingAfterCall,
} from '../services/wellbeing-tracking/after-call.js';

// One model call (20 s timeout) and one store write.
registerAfterCallTask(WELLBEING_TASK, (ctx) => recordWellbeingAfterCall(ctx), {
  timeoutMs: 30_000,
});
