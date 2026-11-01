/**
 * Cancel and move in "When I'll Reach Out". Off by default.
 *
 * The server says which items can be cancelled or moved, and only with its own
 * REACH_OUT_ACTIONS on (services/outreach/upcoming-outreach-actions.ts). This is
 * the web half: while off, no item shows a Cancel or Reschedule button, whatever
 * the server sends. Turn it on with `VITE_REACH_OUT_ACTIONS=true`.
 */
export function isReachOutActionsOn(): boolean {
  return import.meta.env.VITE_REACH_OUT_ACTIONS === 'true';
}
