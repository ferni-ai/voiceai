/**
 * Only the account owner's yes may confirm a text, call or email
 * (outreach-confirm.ts), and the owner must be proven: a recognition-'known'
 * phone caller, or an account named by an authenticated app dispatch. The
 * inbound webhook's caller-ID lookup can be spoofed, so it proves nothing, and
 * on calls where Ferni rang someone else the person on the line isn't the owner.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

const { identifyFromMetadata } = vi.hoisted(() => ({ identifyFromMetadata: vi.fn() }));
vi.mock('../../../services/identity/user-identification.js', () => ({ identifyFromMetadata }));
vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({
  prefetchUserCommitments: vi.fn(async () => {}),
}));
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({
  onSessionStart: vi.fn(async () => ({})),
}));
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({
  getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }),
}));

const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const { rememberCallerRecognition, rememberDispatchIdentity } =
  await import('../../voice-agent-entry/caller-recognition.js');
const { identifyUser } = await import('../../voice-agent/user-identification-handler.js');
const { speakerIsAccountOwner } = await import('../live-call-behaviors.js');
const { outreachConfirmListeners, withOutreachConfirmation } =
  await import('../../../tools/domains/communication/outreach/outreach-confirm.js');

const outboundCall = (kind: 'on_behalf' | 'family_checkin') =>
  ({ callId: 'c', recipientName: 'Grandma', userName: 'Sam', callType: 'personal', kind }) as never;

/** Identify a session the way the job entry does, from its dispatch metadata. */
async function identify(sessionId: string, source: string, metadata: object): Promise<void> {
  identifyFromMetadata.mockResolvedValue({ userId: 'owner-uid', source: { type: source } });
  await identifyUser({ jobMetadata: JSON.stringify(metadata), room: {} as Room, sessionId });
}

describe('speakerIsAccountOwner', () => {
  it('is true when a signed-in app dispatch named the account', async () => {
    await identify('app-session', 'web_auth', { userId: 'owner-uid' });
    rememberDispatchIdentity('firebase-session', 'firebase', undefined);

    expect(speakerIsAccountOwner('app-session')).toBe(true);
    expect(speakerIsAccountOwner('firebase-session')).toBe(true);
  });

  it('fails closed without proof: no record, an inbound call, or a metadata lookup', async () => {
    await identify('inbound-session', 'web_auth', { type: 'inbound_call', userId: 'owner-uid' });
    await identify('lookup-session', 'metadata', { userId: 'owner-uid' });

    expect(speakerIsAccountOwner('no-record-session')).toBe(false);
    expect(speakerIsAccountOwner('inbound-session')).toBe(false);
    expect(speakerIsAccountOwner('lookup-session')).toBe(false);
  });

  it('is false on on-behalf and family check-in calls, even for a named account', () => {
    rememberDispatchIdentity('on-behalf-session', 'sponsored', undefined);
    setOutboundCallContext('on-behalf-session', outboundCall('on_behalf'));
    setOutboundCallContext('checkin-session', outboundCall('family_checkin'));

    expect(speakerIsAccountOwner('on-behalf-session')).toBe(false);
    expect(speakerIsAccountOwner('checkin-session')).toBe(false);
  });

  it('is true for a recognition-known phone caller, false for maybe or stranger', () => {
    rememberCallerRecognition('maybe-session', { status: 'maybe', attestation: 'none' });
    rememberCallerRecognition('stranger-session', { status: 'stranger', attestation: 'none' });
    rememberCallerRecognition('known-session', { status: 'known', attestation: 'none' } as never);

    expect(speakerIsAccountOwner('maybe-session')).toBe(false);
    expect(speakerIsAccountOwner('stranger-session')).toBe(false);
    expect(speakerIsAccountOwner('known-session')).toBe(true);
  });

  it('an inbound phone call with recognition off: the caller says yes and nothing is sent', async () => {
    vi.stubEnv('OUTREACH_CONFIRM', 'on');
    await identify('sip-session', 'metadata', { type: 'inbound_call', userId: 'owner-uid' });
    const send = vi.fn(async () => 'sent');
    const def = withOutreachConfirmation(
      {
        id: 'reachOut',
        name: 'Reach Out',
        description: '',
        domain: 'communication',
        create: () => ({ description: '', execute: send }) as never,
      },
      { prepare: async (args) => ({ args, readBack: 'a text to Mom saying "hi"' }) }
    );
    const session = { agentState: 'listening' };
    const listeners = outreachConfirmListeners(session, () => speakerIsAccountOwner('sip-session'));
    const tool = def.create({ userId: 'owner-uid', agentId: 'ferni', agentDisplayName: 'Ferni' });

    await tool.execute({ contact: 'Mom' }, { ctx: { session }, toolCallId: 'c1' });
    listeners.onToolsExecuted({ functionCalls: [{ callId: 'c1' }] });
    listeners.onTranscript({ transcript: 'yes', isFinal: true });
    const out = await tool.execute({ contact: 'Mom' }, { ctx: { session }, toolCallId: 'c2' });

    expect(send).not.toHaveBeenCalled();
    expect(String(out)).toContain('only the account owner can confirm');
    vi.unstubAllEnvs();
  });
});
