/**
 * Which While You Were Away updates are the owner's to decide (#4468). With
 * CALLBACK_MEANS_ASKED on, `callbackRequired` / `requiresCallback` mean only that the person on
 * the call asked for a call back; a missed call Ferni can try again carries `retryOffered`, and
 * both still need the owner ("Action needed", high priority).
 */

/** A ferni:call-complete detail: its person asked for a call back, or Ferni can try again. */
export function callNeedsOwner(detail: {
  callbackRequired?: boolean;
  retryOffered?: boolean;
}): boolean {
  return Boolean(detail.callbackRequired || detail.retryOffered);
}

/**
 * A background result: its person asked for a call back, or it is a call the server ranked high,
 * which is how a result carries "Ferni can try again" (requiresCallback is only the ask).
 */
export function resultNeedsOwner(detail: {
  requiresCallback?: boolean;
  resultType?: string;
  priority?: string;
}): boolean {
  return Boolean(
    detail.requiresCallback ||
    (detail.resultType === 'on_behalf_call' && detail.priority === 'high')
  );
}
