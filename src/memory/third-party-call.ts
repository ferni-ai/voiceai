/**
 * Who the memory pipeline never remembers: the person on the other end of a
 * call Ferni places for a user.
 *
 * An on-behalf call session runs under the pseudo-user `onbehalf:<callId>`
 * (on-behalf-dispatch.ts gives it that session id, so the requester's account
 * is never the session's). The person who picks up is not our user and never
 * agreed to be remembered: their words go to the call transcript, which is
 * reported to the requester and attached to the requester's call record, and
 * nowhere else. Prod 2026-10-18: fact capture, the short-term buffer and
 * knowledge capture all ran under `onbehalf:...`, storing a relative's words as
 * if she were a user.
 *
 * @module memory/third-party-call
 */

import type { FastCaptureResult } from './dynamic/fast-capture.js';

/** The session id prefix every on-behalf call session carries. */
export const ON_BEHALF_USER_PREFIX = 'onbehalf:';

/** True for the pseudo-user of an on-behalf call session: nothing is remembered for it. */
export function isThirdPartyCallUser(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith(ON_BEHALF_USER_PREFIX);
}

/** What fast capture returns for a third party: nothing found, nothing queued. */
export function noCapture(): FastCaptureResult {
  return {
    mentionedEntities: [],
    emotionSignals: [],
    topicHints: [],
    dateSignals: [],
    relationshipSignals: [],
    linkingSignals: [],
    asyncJobId: null,
    captureTimeMs: 0,
  };
}
