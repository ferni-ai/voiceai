/**
 * Registers the common-ground writer (common-ground-after-call.ts) as an
 * after-call task. Imported by agents/after-call-register.ts. With
 * COMMON_GROUND off the task returns before any read or model call.
 *
 * @module agents/personas/common-ground-register
 */

import { registerAfterCallTask } from '../../services/session/after-call-tasks.js';
import { updateCommonGroundAfterCall } from './common-ground-after-call.js';

registerAfterCallTask(
  'common-ground',
  async (ctx) => {
    // The transcript labels his lines FERNI; another persona's call isn't his ground.
    if (ctx.personaId && ctx.personaId !== 'ferni') return;
    await updateCommonGroundAfterCall({ userId: ctx.userId, turns: ctx.turns });
  },
  { timeoutMs: 20_000 }
);
