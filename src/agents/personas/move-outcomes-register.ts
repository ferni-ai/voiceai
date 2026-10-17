/**
 * Registers the move-outcome record (move-outcomes.ts) as an after-call task.
 * Imported once by agents/after-call-register.ts.
 *
 * @module agents/personas/move-outcomes-register
 */
import { registerAfterCallTask } from '../../services/session/after-call-tasks.js';
import { moveOutcomesTask } from './move-outcomes.js';

registerAfterCallTask('move-outcomes', moveOutcomesTask(), { timeoutMs: 10_000 });
