/**
 * Sign a voice-eval call's job metadata the way our server signs a dispatch.
 *
 * Since #1212 the agent acts on `user_id` only from a dispatch signed with the
 * LiveKit API secret (services/identity/signed-dispatch-identity.ts). run.sh
 * used to send it unsigned, so every eval caller arrived as a new anonymous
 * user and returning-caller evals (EVAL_SEED) tested a stranger. Signing with
 * the same signer the server uses keeps that check exactly as it is.
 *
 * Only voice-eval-* users are signed: the eval never vouches for a real account.
 */
import { signDispatch } from '../../src/services/outreach/on-behalf-dispatch.js';

import { EVAL_PREFIX } from './eval-users.js';

/** The metadata with signedAt and requesterSignature added; throws for a non-eval user. */
export function signEvalMeta(
  meta: Record<string, unknown>,
  secret: string,
  now: number = Date.now()
): Record<string, unknown> {
  const uid = meta.user_id;
  if (typeof uid !== 'string' || !uid.startsWith(EVAL_PREFIX) || uid.length <= EVAL_PREFIX.length) {
    throw new Error(`only ${EVAL_PREFIX}* users are signed (got: ${String(uid)})`);
  }
  if (!secret) throw new Error('no dispatch secret');
  return signDispatch(meta, secret, now);
}
