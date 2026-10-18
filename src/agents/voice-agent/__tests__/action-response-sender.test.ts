import { EventEmitter } from 'node:events';
import { ParticipantKind } from '@livekit/rtc-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  const quiet = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { ...actual, log: () => quiet };
});

const trust = vi.hoisted(() => ({ resolvePendingAction: vi.fn() }));
vi.mock('../../../services/automation/trust-level-system.js', () => trust);
vi.mock('../../realtime/action-event-dispatcher.js', () => ({
  dispatchActionApproved: vi.fn(),
  dispatchActionRejected: vi.fn(),
}));

const { setupDataChannelHandler } = await import('../data-channel-handler.js');
const { fromSessionUser } = await import('../data-sender.js');
const { callerChecks, rememberCallerRecognition, rememberDispatchIdentity } =
  await import('../../voice-agent-entry/caller-recognition.js');
type Ctx = Parameters<typeof setupDataChannelHandler>[0];

const OWNER = 'uid-owner';
let seq = 0;

interface CallOptions {
  verified?: boolean;
  phoneOnly?: boolean;
  noChecks?: boolean;
  ownerKind?: ParticipantKind;
}

function makeCall(opts: CallOptions = {}) {
  const sessionId = `action-sender-${++seq}`;
  if (opts.verified !== false) rememberDispatchIdentity(sessionId, 'web_auth', '{}');
  if (opts.phoneOnly)
    rememberCallerRecognition(sessionId, { status: 'known', attestation: 'A', userId: OWNER });
  const room = Object.assign(new EventEmitter(), {
    localParticipant: { identity: 'agent', setAttributes: vi.fn(), publishData: vi.fn() },
    remoteParticipants: new Map([
      [OWNER, { kind: opts.ownerKind ?? ParticipantKind.STANDARD }],
      ['uid-someone-else', { kind: ParticipantKind.STANDARD }],
    ]),
  });
  const ctx = {
    room,
    session: { agentState: 'listening' },
    sessionId,
    userId: OWNER,
    sessionPersona: { id: 'ferni' },
    callerChecks: opts.noChecks ? undefined : callerChecks,
  } as unknown as Ctx;
  const { cleanup } = setupDataChannelHandler(ctx);
  return { room, cleanup };
}

async function approve(room: EventEmitter, from: string) {
  const payload = JSON.stringify({ type: 'action_response', actionId: 'a1', approved: true });
  room.emit('dataReceived', new TextEncoder().encode(payload), { identity: from });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('action_response over the data channel', () => {
  beforeEach(() => {
    trust.resolvePendingAction.mockReset().mockResolvedValue(null);
  });

  it("resolves the action for the session's own verified user", async () => {
    const { room, cleanup } = makeCall();
    await approve(room, OWNER);
    expect(trust.resolvePendingAction).toHaveBeenCalledWith(OWNER, 'a1', true);
    cleanup();
  });

  it('ignores another participant', async () => {
    const { room, cleanup } = makeCall();
    await approve(room, 'uid-someone-else');
    expect(trust.resolvePendingAction).not.toHaveBeenCalled();
    cleanup();
  });

  it.each([ParticipantKind.SIP, ParticipantKind.AGENT])(
    "ignores a participant of kind %s even with the user's identity",
    async (kind) => {
      const { room, cleanup } = makeCall({ ownerKind: kind });
      await approve(room, OWNER);
      expect(trust.resolvePendingAction).not.toHaveBeenCalled();
      cleanup();
    }
  );

  it('ignores it when the session user was never verified', async () => {
    const { room, cleanup } = makeCall({ verified: false });
    await approve(room, OWNER);
    expect(trust.resolvePendingAction).not.toHaveBeenCalled();
    cleanup();
  });

  it('ignores it on a call known only by its phone number', async () => {
    const { room, cleanup } = makeCall({ phoneOnly: true });
    await approve(room, OWNER);
    expect(trust.resolvePendingAction).not.toHaveBeenCalled();
    cleanup();
  });

  it('ignores it when the entrypoint passed no caller checks', async () => {
    const { room, cleanup } = makeCall({ noChecks: true });
    await approve(room, OWNER);
    expect(trust.resolvePendingAction).not.toHaveBeenCalled();
    cleanup();
  });

  it('fromSessionUser is false, not a throw, without caller checks', () => {
    const room = { remoteParticipants: new Map([[OWNER, { kind: ParticipantKind.STANDARD }]]) };
    expect(fromSessionUser(room, OWNER, { userId: OWNER, sessionId: 's' })).toBe(false);
  });
});
