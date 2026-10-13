/**
 * Registers the post-call check-in text (after-call-checkin.ts) as an
 * after-call task. Imported for its side effect by agents/after-call-register.ts.
 *
 * @module services/outreach/after-call-checkin-register
 */
import { registerAfterCallTask } from '../session/after-call-tasks.js';
import { runAfterCallCheckin } from './after-call-checkin.js';

registerAfterCallTask(
  'after-call-checkin',
  async (ctx) => {
    await runAfterCallCheckin(ctx);
  },
  { timeoutMs: 15_000 }
);
