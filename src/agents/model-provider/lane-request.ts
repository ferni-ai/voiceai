/**
 * A request that must go to the main model, never the fast lane (fast-lane.ts).
 *
 * The router sees only the request, not the call, and reads the caller's words. A crisis turn
 * can read as chit-chat there while the crisis gate knows the call is at risk (dev, fast lane
 * on: flash-lite answered most crisis-guided turns). The gate decides (crisis-gate.ts
 * gatedReply); llmNode marks the request it sends (ferni-agent.ts), and the router and the
 * turn receipt read the mark. Kept by object, so a mark lives exactly as long as its request.
 *
 * @module agents/model-provider/lane-request
 */

/** How the crisis gate asks for one reply (gatedReply's model). */
export interface ReplyLane {
  mainLane: boolean;
}

const marked = new WeakSet<object>();

/** This request goes to the main model. */
export function requireMainLane(request: object): void {
  marked.add(request);
}

/** Whether this request was marked for the main model. */
export function mainLaneRequired(request: object): boolean {
  return marked.has(request);
}
