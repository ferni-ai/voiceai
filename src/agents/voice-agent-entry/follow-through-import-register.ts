/**
 * Registers the follow-through import (agents/follow-through-import.ts) as an
 * after-call task, with this layer's answer to "is the caller the account's
 * proven owner". FOLLOW_THROUGH_IMPORT=on turns it on; off, the task returns
 * at once. Imported for its side effect by gce/job-executor.ts, next to
 * after-call-register.ts: the owner check lives here (caller-recognition.ts),
 * a layer above that file.
 *
 * @module agents/voice-agent-entry/follow-through-import-register
 */
import { isLightTopic } from '../../api/home/light-topic.js';
import { registerAfterCallTask } from '../../services/session/after-call-tasks.js';
import { FOLLOW_THROUGH_IMPORT_TASK, importFollowUpsAfterCall } from '../follow-through-import.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { sessionIsVerifiedOwner } from './caller-recognition.js';

/** A signed-in app call or a recognised phone caller, and not a call Ferni placed to someone. */
export function ownerOnTheLine(sessionId: string): boolean {
  return sessionIsVerifiedOwner(sessionId) && !outboundPartiesFor(sessionId);
}

/** Bookends: the Home Screen's heavy-topic test (light-topic.ts), handed down a layer. */
const isHeavy = (text: string): boolean => !isLightTopic(text);

// Four reads (forgotten topics, reminders, commitments, summaries) and one transaction per item.
registerAfterCallTask(
  FOLLOW_THROUGH_IMPORT_TASK,
  async (ctx) => {
    await importFollowUpsAfterCall(ctx, { verifiedOwner: ownerOnTheLine, heavy: isHeavy });
  },
  { timeoutMs: 20_000 }
);
