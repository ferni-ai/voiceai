/**
 * The per-turn learners write only under an id owner data may be stored under (#4293).
 *
 * recordAllLearningData ran every learner with the session's raw id. For a try-first visitor
 * (`device:demo_…`, told nothing is kept) no profile is ever loaded or saved, but the learners
 * still wrote under that id: bogle_users/device:demo_… got a record holding only their
 * time-of-day pattern, and corrections, preferences, shared moments and trust data were kept
 * too. ownerWriteId is the gate process-turn and transcript-handler already use: undefined for a
 * try-first visitor and, while ONBEHALF_WRITE_GATE is on, for an on-behalf call.
 *
 * Behind LEARNING_OWNER_GATE, default off: off, the context is returned unchanged.
 *
 * @module voice-agent/learning-owner
 */

import { flagOn } from '../../config/env-flag.js';
import { ownerWriteId } from '../../services/identity/owner-write-gate.js';

/** The turn's learning context, with no user id when nothing may be stored under it. */
export function ownerLearningContext<C extends { userId: string | null }>(ctx: C): C {
  if (!flagOn('LEARNING_OWNER_GATE')) return ctx;
  return { ...ctx, userId: ownerWriteId(ctx.userId) ?? null };
}
