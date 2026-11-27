/**
 * A finished on-behalf call's follow-up fields, as the server sends them (#4468). With
 * CALLBACK_MEANS_ASKED on, `callbackRequired` is only the person's own ask, and a call nobody
 * asked to be returned carries `retryOffered`; the While You Were Away card reads both.
 */
export interface CallFollowUp {
  callbackRequired: boolean;
  /** Nobody asked for a call back; Ferni can try again (CALLBACK_MEANS_ASKED, #4468). */
  retryOffered?: boolean;
}

/** The two fields the ferni:call-complete event carries on; `retryOffered` always a boolean. */
export function callFollowUpOf(event: CallFollowUp): Required<CallFollowUp> {
  return { callbackRequired: event.callbackRequired, retryOffered: event.retryOffered === true };
}
