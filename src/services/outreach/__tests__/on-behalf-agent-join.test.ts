/**
 * An on-behalf call dials only once Ferni's agent is in the room (agent-join.ts).
 *
 * A dispatch LiveKit accepted reached no worker. The orchestrator dialled about
 * 40 ms later anyway, so the contact picked up to silence. With no agent, no
 * result was captured either, so the owner was never told. These run the real
 * orchestrator against a fake LiveKit: the room shows an agent participant from
 * `agentJoinsAfterMs` after the dispatch, or never.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantInfo_Kind } from '@livekit/protocol';

const lk = vi.hoisted(() => ({
  agentJoinsAfterMs: 0 as number | null,
  failReads: false,
  dispatchedAt: 0,
  order: [] as string[],
}));
const createDispatch = vi.hoisted(() =>
  vi.fn(async () => {
    lk.dispatchedAt = Date.now();
    lk.order.push('dispatch');
    return {};
  })
);
const listParticipants = vi.hoisted(() =>
  vi.fn(async () => {
    if (lk.failReads) throw new Error('livekit 503');
    const after = lk.agentJoinsAfterMs;
    const joined = after !== null && Date.now() - lk.dispatchedAt >= after;
    return joined ? [{ identity: 'agent-AJ_1', kind: 4 }] : [{ identity: 'observer', kind: 0 }];
  })
);
const deleteRoom = vi.hoisted(() => vi.fn(async () => undefined));
const createSipParticipant = vi.hoisted(() =>
  vi.fn(async () => {
    lk.order.push('dial');
    return { participantId: 'PA_1' };
  })
);
const captureCallResult = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
    listParticipants = listParticipants;
    deleteRoom = deleteRoom;
  },
  AgentDispatchClient: class {
    createDispatch = createDispatch;
  },
  SipClient: class {
    createSipParticipant = createSipParticipant;
  },
}));
vi.mock('../call-retry.js', () => ({ isCallOptedOut: vi.fn(async () => false) }));
vi.mock('../deferred-calls.js', () => ({ holdForCallHours: vi.fn(async () => null) }));
vi.mock('../call-result-capture.js', () => ({ captureCallResult }));

vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
vi.stubEnv('LIVEKIT_API_KEY', 'k');
vi.stubEnv('LIVEKIT_API_SECRET', 's');
vi.stubEnv('DISPATCH_SIGNING_SECRET', 'dispatch-secret');
vi.stubEnv('SIP_TRUNK_ID', 'ST_test');

const { getOnBehalfCallOrchestrator } = await import('../on-behalf-call-orchestrator.js');
const { AGENT_JOIN_WAIT_MS, isAgentNotJoined } = await import('../agent-join.js');

const request = () =>
  ({
    userId: 'owner-1',
    userName: 'Sam',
    contactQuery: 'my sister Ana',
    purpose: 'confirm the Saturday dinner',
    callType: 'business', // no message enrichment: the test stays off the model
    recordingConsent: false,
    resolvedContact: { name: 'Ana', phone: '+12135550100' },
  }) as never;

/** Start the call, run the fake clock past the longest wait, then settle it. */
async function place(): Promise<{ callId?: string; error?: unknown }> {
  const settled = getOnBehalfCallOrchestrator()
    .initiateCall(request())
    .then(
      (callId) => ({ callId }),
      (error: unknown) => ({ error })
    );
  await vi.advanceTimersByTimeAsync(AGENT_JOIN_WAIT_MS + 1_000);
  return settled;
}

beforeEach(() => {
  vi.useFakeTimers();
  lk.agentJoinsAfterMs = 0;
  lk.failReads = false;
  lk.order = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('an on-behalf call and its agent', () => {
  it('the fake marks the agent with the SDK agent kind', () => {
    expect(ParticipantInfo_Kind.AGENT).toBe(4); // the `kind: 4` above is the real enum value
  });

  it('dials once the agent has joined, exactly as before the wait', async () => {
    const initiated = vi.fn();
    getOnBehalfCallOrchestrator().once('call-initiated', initiated);

    const { callId, error } = await place();

    expect(error).toBeUndefined();
    expect(callId).toMatch(/^onbehalf_\d+_[a-z0-9]+$/);
    expect(lk.order).toEqual(['dispatch', 'dial']);
    // The dial main made, argument for argument.
    expect(createSipParticipant).toHaveBeenCalledExactlyOnceWith(
      'ST_test',
      '+12135550100',
      `onbehalf-${callId}`,
      {
        participantIdentity: `phone_${callId}`,
        participantName: 'Ana',
        playDialtone: false,
        hidePhoneNumber: false,
      }
    );
    expect(initiated).toHaveBeenCalledWith(
      expect.objectContaining({ id: callId, status: 'ringing', twilioCallSid: 'PA_1' })
    );
    expect(getOnBehalfCallOrchestrator().getActiveCall(callId!)?.status).toBe('ringing');
    expect(deleteRoom).not.toHaveBeenCalled();
    expect(captureCallResult).not.toHaveBeenCalled();
  });

  it('with no agent: no dial, the room closed, the call recorded failed with the reason', async () => {
    lk.agentJoinsAfterMs = null;
    const failed = vi.fn();
    getOnBehalfCallOrchestrator().once('call-failed', failed);

    const { callId, error } = await place();

    expect(callId).toBeUndefined();
    expect(isAgentNotJoined(error)).toBe(true);
    expect(listParticipants.mock.calls.length).toBeGreaterThan(1); // it waited, not one look
    expect(createSipParticipant).not.toHaveBeenCalled();
    const [failedCall] = failed.mock.calls[0] as [{ id: string; status: string }];
    expect(failedCall.status).toBe('failed');
    expect(deleteRoom).toHaveBeenCalledExactlyOnceWith(`onbehalf-${failedCall.id}`);
    expect(captureCallResult).toHaveBeenCalledExactlyOnceWith(
      failedCall.id,
      {
        callId: failedCall.id,
        status: 'failed',
        objectiveAchieved: false,
        outcome: "Ferni couldn't connect the call to Ana",
        callbackRequired: true,
        notPlaced: 'agent_not_joined', // a late agent's job reads this (on-behalf-late-agent.test.ts)
      },
      expect.objectContaining({ userId: 'owner-1' })
    );
  });

  it('an agent joining at 4.9 s is in time: it dials', async () => {
    lk.agentJoinsAfterMs = 4_900;
    const { callId } = await place();

    expect(callId).toMatch(/^onbehalf_/);
    expect(createSipParticipant).toHaveBeenCalledOnce();
    expect(captureCallResult).not.toHaveBeenCalled();
  });

  it('an agent joining at 5.1 s is too late: no dial', async () => {
    lk.agentJoinsAfterMs = 5_100;
    const { error } = await place();

    expect(isAgentNotJoined(error)).toBe(true);
    expect(createSipParticipant).not.toHaveBeenCalled();
    expect(captureCallResult).toHaveBeenCalledOnce();
  });

  it('a room read that fails counts as "not yet", never as joined', async () => {
    lk.failReads = true; // the agent is in (agentJoinsAfterMs 0), but no read can see it

    const { error } = await place();

    expect(isAgentNotJoined(error)).toBe(true);
    expect(createSipParticipant).not.toHaveBeenCalled();
  });
});
