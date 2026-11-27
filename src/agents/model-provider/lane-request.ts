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
 * It also keeps the gate's crisis clearance for a request, for the dev model trial
 * (trial-lane.ts): the gate builds it (agents/safety/crisis-trial-clearance.ts) and the trial
 * asks it when the request reaches the model. A request the gate did not send (around llmNode)
 * has none, and the trial sends it to today's model.
 *
 * @module agents/model-provider/lane-request
 */

/** How the crisis gate asks for one reply (gatedReply's model). */
export interface ReplyLane {
  mainLane: boolean;
  /** The gate's crisis clearance for the dev model trial (trial-lane.ts); none: today's model. */
  trial?: TrialClearance;
}

/** What the dev model trial asks the gate about one request, when it reaches the model. */
export interface TrialClearance {
  /** The call's id, undefined with no call. Throws when the call's session can't be read. */
  callId(): string | undefined;
  /** Whether the request is clear of crisis handling now (the trial lane checks the mark). */
  clear(env: Record<string, string | undefined>): boolean;
  /** The trial model is writing the reply this request's verdict holds (if any). */
  noteTrialWrote(): void;
}

const marked = new WeakSet<object>();
const clearances = new WeakMap<object, TrialClearance>();

/** The request, marked for the main model when the gate asked for it, with the gate's clearance. */
export function withLane<T extends object>(request: T, lane: ReplyLane | undefined): T {
  if (lane?.mainLane) marked.add(request);
  if (lane?.trial) clearances.set(request, lane.trial);
  return request;
}

/** The gate's trial clearance for this request, if the gate sent it. */
export function trialClearanceOf(request: object): TrialClearance | undefined {
  return clearances.get(request);
}

/** Whether this request was marked for the main model. */
export function mainLaneRequired(request: object): boolean {
  return marked.has(request);
}
