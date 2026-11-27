/**
 * A request that must go to the main model, never the fast lane (fast-lane.ts).
 *
 * The router sees only the request, not the call, and reads the caller's words. A crisis turn
 * can read as chit-chat there while the crisis gate knows the call is at risk (dev, fast lane
 * on: flash-lite answered most crisis-guided turns). The gate decides (crisis-gate.ts
 * gatedReply); llmNode marks the request it sends (withLane, ferni-agent.ts), and the router
 * and the turn receipt read the mark. Kept by object, so a mark lives exactly as long as its
 * request.
 *
 * It also keeps the gate that sent a request, for the dev model trial (trial-lane.ts): the
 * trial reads the call's crisis state when the request reaches the model. A request the gate did
 * not send (around llmNode) has none, and the trial sends it to today's model.
 *
 * @module agents/model-provider/lane-request
 */

/** How the crisis gate asks for one reply (gatedReply's model). */
export interface ReplyLane {
  mainLane: boolean;
  /** The call's session, for the dev model trial's crisis clearance (trial-lane.ts). */
  session?: object;
  /** The classifier verdict this turn's reply is held on, and the caller words it reads. */
  held?: HeldVerdict;
}

/** A reply held until this turn's own classifier verdict settles (crisis-gate-hold.ts). */
export interface HeldVerdict {
  verdict: Promise<unknown>;
  latest: string;
}

/** The gate that sent a request: its call's session and the verdict holding its reply. */
export interface SentBy {
  session: object;
  held?: HeldVerdict;
}

const marked = new WeakSet<object>();
const senders = new WeakMap<object, SentBy>();

/** The request, marked for the main model when the gate asked for it, with the gate's session. */
export function withLane<T extends object>(request: T, lane: ReplyLane | undefined): T {
  if (lane?.mainLane) marked.add(request);
  if (lane?.session) senders.set(request, { session: lane.session, held: lane.held });
  return request;
}

/** The gate that sent this request, if any. */
export function sentBy(request: object): SentBy | undefined {
  return senders.get(request);
}

/** Whether this request was marked for the main model. */
export function mainLaneRequired(request: object): boolean {
  return marked.has(request);
}
