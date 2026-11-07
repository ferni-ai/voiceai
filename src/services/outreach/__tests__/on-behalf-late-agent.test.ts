/**
 * An agent that reaches an on-behalf call's room after the wait gave up
 * (agent-join.ts) finds no one: nothing was dialled. Closing the room ends its
 * session, and its job reported that as a missed call. The no_answer overwrote
 * the stored "couldn't connect" result, and with CALL_FOLLOWTHROUGH on it
 * scheduled a next-day retry of a call that never rang.
 *
 * These run the real orchestrator against a fake LiveKit. The agent connects
 * about 100 ms before the watchdog closes the room, too late for the room
 * read. Closing the room ends its session, which runs the real lifecycle
 * (completeOnBehalfCall) with the dispatch the orchestrator sent. The call
 * result store is a map shared by both, as Firestore is across the two
 * processes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallOutcome } from '../../../tools/domains/telephony/types.js';

const lk = vi.hoisted(() => ({
  agentVisible: false,
  dispatch: null as Record<string, unknown> | null,
  connected: false,
  lateJob: null as Promise<unknown> | null,
}));
const stored = vi.hoisted(() => new Map<string, { userId: string; outcome: CallOutcome }>());
const logged = vi.hoisted(() => [] as Array<{ fields: unknown; message: unknown }>);
const scheduleRetry = vi.hoisted(() => vi.fn(async () => new Date('2026-11-07T15:00:00Z')));
const lateReport = vi.hoisted(() => vi.fn());

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = (): Record<string, unknown> => ({
    debug: () => undefined,
    info: (fields: unknown, message: unknown) => logged.push({ fields, message }),
    warn: () => undefined,
    error: () => undefined,
    child: () => logger(),
  });
  return { getLogger: logger, createLogger: logger };
});
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
    listParticipants = vi.fn(async () =>
      lk.agentVisible ? [{ identity: 'agent-AJ_1', kind: 4 }] : []
    );
    // Closing the room ends a connected agent's session: its job reports the call.
    deleteRoom = vi.fn(async () => {
      if (lk.connected) lk.lateJob = endAgentSession();
    });
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async (_room: string, _agent: string, opts: { metadata: string }) => {
      lk.dispatch = JSON.parse(opts.metadata) as Record<string, unknown>;
      // The agent connects ~100 ms before the wait gives up, after its last room read.
      setTimeout(() => (lk.connected = true), AGENT_JOIN_WAIT_MS - 100);
      return {};
    });
  },
  SipClient: class {
    createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
  },
}));
vi.mock('../call-retry.js', () => ({
  isCallOptedOut: vi.fn(async () => false),
  isCallFollowthroughEnabled: () => process.env.CALL_FOLLOWTHROUGH === 'on',
}));
vi.mock('../deferred-calls.js', () => ({ holdForCallHours: vi.fn(async () => null) }));
vi.mock('../call-result-capture.js', () => ({
  captureCallResult: vi.fn(async (callId: string, outcome: CallOutcome, request: never) => {
    stored.set(callId, { userId: (request as { userId: string }).userId, outcome });
  }),
  getCallResult: vi.fn(async (callId: string, userId: string) => {
    const row = stored.get(callId);
    return row && row.userId === userId ? { callId, ...row } : null;
  }),
}));

vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
vi.stubEnv('LIVEKIT_API_KEY', 'k');
vi.stubEnv('LIVEKIT_API_SECRET', 's');
vi.stubEnv('DISPATCH_SIGNING_SECRET', 'dispatch-secret');
vi.stubEnv('SIP_TRUNK_ID', 'ST_test');

const { getOnBehalfCallOrchestrator } = await import('../on-behalf-call-orchestrator.js');
const { AGENT_JOIN_WAIT_MS, neverPlaced } = await import('../agent-join.js');
const { completeOnBehalfCall } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { parseOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { captureCallResult } = await import('../call-result-capture.js');

/** The agent's job at session end: it heard no one, so on its own it reads as no_answer. */
function endAgentSession(): Promise<unknown> {
  const call = parseOnBehalfDispatch(lk.dispatch!)!;
  return completeOnBehalfCall(call.session_id, call, 0, true, {
    readDisposition: () => undefined,
    readTranscript: () => [],
    analyze: async () => null,
    report: async (callId, outcome, request) => {
      lateReport(outcome.status);
      await captureCallResult(callId, outcome, request);
    },
    scheduleRetry,
    neverPlaced: (c) => neverPlaced(c.callId, c.requester.userId),
  });
}

const request = () =>
  ({
    userId: 'owner-1',
    userName: 'Sam',
    contactQuery: 'my sister Ana',
    purpose: 'confirm the Saturday dinner',
    callType: 'business',
    recordingConsent: false,
    resolvedContact: { name: 'Ana', phone: '+12135550100' },
  }) as never;

async function place(): Promise<{ callId?: string; error?: unknown }> {
  const settled = getOnBehalfCallOrchestrator()
    .initiateCall(request())
    .then(
      (callId) => ({ callId }),
      (error: unknown) => ({ error })
    );
  await vi.advanceTimersByTimeAsync(AGENT_JOIN_WAIT_MS + 1_000);
  const out = await settled;
  await lk.lateJob;
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
  Object.assign(lk, { agentVisible: false, dispatch: null, connected: false, lateJob: null });
  stored.clear();
  logged.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('an agent that joins after the wait gave up', () => {
  it('leaves the "couldn\'t connect" result in place and schedules no retry', async () => {
    const { error } = await place();

    expect((error as { code?: string }).code).toBe('agent_not_joined');
    expect(lk.lateJob).not.toBeNull(); // the late agent's job really ran its report path
    expect(scheduleRetry).not.toHaveBeenCalled();
    expect(lateReport).not.toHaveBeenCalled();
    const [callId] = [...stored.keys()];
    expect(stored.get(callId!)?.outcome).toEqual({
      callId,
      status: 'failed',
      objectiveAchieved: false,
      outcome: "Ferni couldn't connect the call to Ana",
      callbackRequired: true,
      notPlaced: 'agent_not_joined',
    });
    expect(logged.map((l) => l.message)).toContain(
      'ON_BEHALF_LATE_AGENT: the call was never placed; nothing reported'
    );
  });

  it('control: a placed call nobody answered is still reported and retried', async () => {
    lk.agentVisible = true; // in time: it dials
    const { callId } = await place();
    lk.lateJob = endAgentSession();
    await lk.lateJob;

    expect(callId).toMatch(/^onbehalf_/);
    expect(scheduleRetry).toHaveBeenCalledOnce();
    expect(lateReport).toHaveBeenCalledExactlyOnceWith('no_answer');
    expect(stored.get(callId!)?.outcome.notPlaced).toBeUndefined();
  });

  it('logs how long the agent took to join when it joins', async () => {
    lk.agentVisible = true;
    const { callId } = await place();

    expect(logged).toContainEqual({
      fields: { callId, joinMs: expect.any(Number) },
      message: 'ON_BEHALF_AGENT_JOINED',
    });
  });

  it('a failed result without the marker (the Twilio dispatch path) is not "never placed"', async () => {
    stored.set('call-twilio', {
      userId: 'owner-1',
      outcome: { callId: 'call-twilio', status: 'failed', objectiveAchieved: false, outcome: '' },
    });

    expect(await neverPlaced('call-twilio', 'owner-1')).toBe(false);
    expect(await neverPlaced('call-none', 'owner-1')).toBe(false);
  });
});
