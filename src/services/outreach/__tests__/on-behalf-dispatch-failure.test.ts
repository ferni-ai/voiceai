/**
 * When the on-behalf agent can't be dispatched into the room, the call is not
 * placed. The dispatch failure used to be logged as a warning and swallowed:
 * the SIP call still went out, the contact picked up to an empty room, and
 * the tool told the user "I'm calling them now". Now initiateCall rejects
 * before dialling, so callOnBehalf, call-retry and the deferred-calls job all
 * report that the call wasn't placed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const createDispatch = vi.hoisted(() => vi.fn(async () => ({})));
const createSipParticipant = vi.hoisted(() => vi.fn(async () => ({ participantId: 'PA_1' })));

vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
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

vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
vi.stubEnv('LIVEKIT_API_KEY', 'k');
vi.stubEnv('LIVEKIT_API_SECRET', 's');
vi.stubEnv('DISPATCH_SIGNING_SECRET', 'dispatch-secret');
vi.stubEnv('SIP_TRUNK_ID', 'ST_test');

const { getOnBehalfCallOrchestrator } = await import('../on-behalf-call-orchestrator.js');

const request = () =>
  ({
    userId: 'owner-1',
    userName: 'Seth',
    purpose: 'confirm the Saturday appointment',
    callType: 'business',
    recordingConsent: false,
    resolvedContact: { name: 'Front desk', phone: '+12135550100' },
  }) as never;

describe('on-behalf agent dispatch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fails the call and never dials when the agent dispatch throws', async () => {
    createDispatch.mockRejectedValueOnce(new Error('livekit 503'));

    await expect(getOnBehalfCallOrchestrator().initiateCall(request())).rejects.toThrow(
      'livekit 503'
    );
    expect(createDispatch).toHaveBeenCalledOnce();
    expect(createSipParticipant).not.toHaveBeenCalled();
  });

  it('dials once the agent is dispatched (control)', async () => {
    await expect(getOnBehalfCallOrchestrator().initiateCall(request())).resolves.toMatch(
      /^onbehalf_/
    );
    expect(createDispatch).toHaveBeenCalledOnce();
    expect(createSipParticipant).toHaveBeenCalledOnce();
  });
});
