/**
 * The end of a call's call-type work, on every exit path.
 *
 * finishOnce runs the call report (on-behalf outcome, family check-in stop);
 * callTypeEnd pairs it with releasing the call's context, so per-call context
 * is released at call end and never outlives the call in a long-lived worker.
 *
 * @module agents/voice-agent-entry/call-end
 */

/**
 * Runs `finish` once, from whichever comes first: the entrypoint's own exit
 * path, or LiveKit's shutdown callbacks. The job gives the entrypoint only 15 s
 * after the room closes (ENTRYPOINT_SHUTDOWN_TIMEOUT in @livekit/agents) and
 * then exits the process, but it awaits its shutdown callbacks first. Without
 * this, a call report still running at the end of a slow cleanup (the LLM read
 * of the call, the requester's push and records) was dropped with no log line.
 */
function finishOnce(
  ctx: { addShutdownCallback: (callback: () => Promise<void>) => void },
  finish: () => Promise<void>
): () => Promise<void> {
  let running: Promise<void> | undefined;
  const once = (): Promise<void> => (running ??= finish());
  ctx.addShutdownCallback(once);
  return once;
}

/**
 * A call's two end steps, each run once from whichever comes first: the
 * entrypoint's exit paths or LiveKit's shutdown callbacks, which run in
 * parallel. `release` waits for `finish`, because the call report reads the
 * context `release` drops.
 */
export function callTypeEnd(
  ctx: { addShutdownCallback: (callback: () => Promise<void>) => void },
  finish: () => Promise<void>,
  release: () => Promise<void>
): { finish: () => Promise<void>; release: () => Promise<void> } {
  const finishCall = finishOnce(ctx, finish);
  const releaseCall = finishOnce(ctx, async () => {
    await finishCall().catch(() => undefined); // its own shutdown callback reports the failure
    await release();
  });
  return { finish: finishCall, release: releaseCall };
}

/**
 * Release this call's context (inbound caller, outbound call, proactive
 * reason) from every store, under every key setupCallTypeContexts wrote.
 *
 * Call it only once the agent session is closed. The outbound context is how
 * every in-call read knows a third party is on the line; dropped while a turn
 * can still run, that person would be treated as the account owner.
 *
 * A room key is removed only while it still holds this session's context, so a
 * later call in the same room keeps its own.
 */
export async function releaseCallTypeContexts(
  metadata: Record<string, unknown>,
  sessionId: string,
  roomName: string | undefined
): Promise<void> {
  const [inbound, outbound, proactive] = await Promise.all([
    import('../../intelligence/context-builders/external/inbound-call-context.js'),
    import('../../intelligence/context-builders/external/outbound-call-context.js'),
    import('../../intelligence/context-builders/external/proactive-session-context.js'),
  ]);
  const roomKey = roomKeyOf(metadata, roomName);
  releaseFromStore(
    inbound.getInboundCallContext,
    inbound.clearInboundCallContext,
    sessionId,
    roomKey
  );
  releaseFromStore(
    outbound.getOutboundCallContext,
    outbound.clearOutboundCallContext,
    sessionId,
    roomKey
  );
  releaseFromStore(
    proactive.getProactiveSessionContext,
    proactive.clearProactiveSessionContext,
    sessionId,
    roomKey
  );
}

function releaseFromStore(
  get: (key: string) => unknown,
  clear: (key: string) => void,
  sessionId: string,
  roomKey: string
): void {
  const own = get(sessionId);
  if (own === undefined) return;
  clear(sessionId);
  if (get(roomKey) === own) clear(roomKey);
}

/** The second key a call's context is stored under: its room, or `call-<callId>` without one. */
export function roomKeyOf(metadata: Record<string, unknown>, roomName: string | undefined): string {
  return roomName || `call-${metadata.callId}`;
}
