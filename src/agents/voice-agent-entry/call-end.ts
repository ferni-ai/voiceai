/**
 * The end of a call's call-type work, on every exit path: report the call
 * (on-behalf outcome, family check-in stop), then release its context, so
 * per-call context never outlives the call in a long-lived worker.
 *
 * @module agents/voice-agent-entry/call-end
 */

import { finishCallTypeContexts, roomKeyOf } from './metadata-parser.js';
import { createLogger } from '../../utils/safe-logger.js';
import { errorClass } from '../../utils/error-class.js';

const log = createLogger({ module: 'call-end' });

/** What callEndFor needs from the LiveKit job. */
interface CallEndJob {
  addShutdownCallback: (callback: () => Promise<void>) => void;
  job: { metadata: string; room?: { name: string } };
}

/** The call being ended, as the entrypoint parsed it. */
interface CallEndCall {
  metadata: Record<string, unknown>;
  callType: string | undefined;
  sessionId: string;
  /** When the entrypoint started (ms epoch); the report gives the call's length. */
  startTime: number;
}

export interface CallEnd {
  /**
   * Report the call, then release its context. Run it once the agent session
   * is closed: the outbound context is how every in-call read knows a third
   * party is on the line, and dropped while a turn can still run, that person
   * would be treated as the account owner. Never throws; a failure is logged
   * by error class only.
   */
  end(): Promise<void>;
}

/**
 * The call's end, run once from whichever comes first: an entrypoint exit
 * path, or LiveKit's shutdown callbacks (which run in parallel).
 *
 * `steps` replaces the report or the release, for tests.
 */
export function callEndFor(
  ctx: CallEndJob,
  call: CallEndCall,
  steps: { finish?: () => Promise<void>; release?: () => Promise<void> } = {}
): CallEnd {
  const { metadata, callType, sessionId, startTime } = call;
  const report = (): Promise<void> => {
    const durationMs = Date.now() - startTime;
    return finishCallTypeContexts(metadata, callType, sessionId, durationMs, ctx.job.metadata);
  };
  const finish = once(ctx, steps.finish ?? report);
  const releaseStep =
    steps.release ?? (() => releaseCallTypeContexts(metadata, sessionId, ctx.job.room?.name));
  const release = once(ctx, async () => {
    await finish().catch(() => undefined); // the report reads the context release drops
    await releaseStep();
  });
  return {
    async end() {
      await finish().catch((error) =>
        log.error({ errorClass: errorClass(error) }, 'Call report failed at call end')
      );
      await release().catch((error) =>
        log.error({ errorClass: errorClass(error) }, 'Call context not released at call end')
      );
    },
  };
}

/**
 * Runs `step` once, from whichever comes first: the entrypoint's own exit
 * path, or LiveKit's shutdown callbacks. The job gives the entrypoint only 15 s
 * after the room closes (ENTRYPOINT_SHUTDOWN_TIMEOUT in @livekit/agents) and
 * then exits the process, but it awaits its shutdown callbacks first. Without
 * this, a call report still running at the end of a slow cleanup (the LLM read
 * of the call, the requester's push and records) was dropped with no log line.
 */
function once(ctx: CallEndJob, step: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | undefined;
  const run = (): Promise<void> => (running ??= step());
  ctx.addShutdownCallback(run);
  return run;
}

/**
 * Release this call's context (inbound caller, outbound call, proactive
 * reason) from every store, under every key setupCallTypeContexts wrote.
 *
 * A room key is removed only while it still holds this session's context, so a
 * later call in the same room keeps its own.
 */
async function releaseCallTypeContexts(
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
