/**
 * Whether an on-behalf call request already dialled: the phone is ringing.
 *
 * A call-now that replaces a held call claims it (pending → superseded) before
 * it dials, and puts it back to pending if the dial fails, so the held call
 * still rings (held-call-replace.ts). #2849 verifier note: if a step AFTER a
 * successful dial threw out of the dial path, that restore would re-arm a call
 * that already rang, and it would ring the person again at the held hour.
 *
 * The orchestrator marks the request the moment its dial is accepted
 * (LiveKit createSipParticipant returned, or Twilio accepted the call); the
 * restore reads the mark and never re-arms a call that rang. Kept per request
 * object, in memory: the dial and the restore run in the same call to
 * placeOrHold (deferred-calls.ts).
 *
 * @module services/outreach/dial-marker
 */

const dialled = new WeakSet<object>();

/** The dial went out for this request: its phone is ringing. */
export function noteDialled(request: object): void {
  dialled.add(request);
}

/** Whether this request's dial went out, whatever failed after it. */
export function wasDialled(request: object): boolean {
  return dialled.has(request);
}
