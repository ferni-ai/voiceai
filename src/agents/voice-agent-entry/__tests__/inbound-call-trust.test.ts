/**
 * An inbound call's account fields (userId, familyUserId, sponsoredIdentityId,
 * isKnownCaller, the caller's name and number) came from a caller-ID lookup,
 * and caller ID can be spoofed. The agent honours them only on a dispatch our
 * server signed, the same gate as on-behalf calls; unsigned, the caller is a
 * stranger. Before, an unsigned dispatch naming Rose's account opened that
 * account's memory and had Ferni greet "Rose".
 *
 * Runs the job metadata exactly as dispatched through the real parser and the
 * real inbound context builder.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { setupCallTypeContexts } = await import('../metadata-parser.js');
const { getInboundCallContext, inboundCallContextBuilder } =
  await import('../../../intelligence/context-builders/external/inbound-call-context.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');

const SECRET = 'test-livekit-secret';
const ROSE_PHONE = '+15557654321';

/** What the inbound webhook used to put in the job metadata for Rose. */
const roseDispatch = (): Record<string, unknown> => ({
  type: 'inbound_call',
  callSid: 'CA-rose',
  callerPhone: ROSE_PHONE,
  callerName: 'Rose',
  userId: 'sponsored-rose',
  sponsoredIdentityId: 'sponsored-rose',
  sponsorUserId: 'alice',
  familyUserId: 'family-rose-memory',
  isKnownCaller: true,
  isVoiceEnrolled: true,
  relationship: "Alice's mom",
});

let priorSecret: string | undefined;
beforeAll(() => {
  priorSecret = process.env.LIVEKIT_API_SECRET;
  process.env.LIVEKIT_API_SECRET = SECRET;
});
afterAll(() => {
  process.env.LIVEKIT_API_SECRET = priorSecret;
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Parse `raw` as the agent does, run it through setupCallTypeContexts, return the metadata. */
async function dispatch(sessionId: string, raw: string): Promise<Record<string, unknown>> {
  const metadata = JSON.parse(raw) as Record<string, unknown>;
  await setupCallTypeContexts(metadata, 'inbound_call', sessionId, `room-${sessionId}`, raw);
  return metadata;
}

async function promptFor(sessionId: string): Promise<string> {
  const injections = await inboundCallContextBuilder.build({ services: { sessionId } } as never);
  return injections.map((i) => i.content).join('\n');
}

describe('inbound call dispatch', () => {
  it('treats an unsigned dispatch naming an account as a stranger', async () => {
    const metadata = await dispatch('in-unsigned', JSON.stringify(roseDispatch()));

    expect(metadata.user_id).toBeUndefined();
    expect(metadata.isKnownCaller).toBeUndefined();
    const context = getInboundCallContext('in-unsigned');
    expect(context).toMatchObject({ callSid: 'CA-rose', callerPhone: '', isKnownCaller: false });
    expect(context?.userId).toBeUndefined();
    expect(context?.sponsoredIdentityId).toBeUndefined();
    expect(context?.callerName).toBeUndefined();
    const prompt = await promptFor('in-unsigned');
    expect(prompt).toContain('UNKNOWN number');
    expect(prompt).not.toContain('Rose');
  });

  it('treats a signed dispatch altered after signing as unsigned', async () => {
    const signed = signDispatch(roseDispatch(), SECRET);
    const altered = { ...signed, familyUserId: 'someone-elses-memory' };

    const metadata = await dispatch('in-altered', JSON.stringify(altered));

    expect(metadata.user_id).toBeUndefined();
    expect(getInboundCallContext('in-altered')?.isKnownCaller).toBe(false);
  });

  it('honours a signed dispatch as before', async () => {
    const metadata = await dispatch(
      'in-signed',
      JSON.stringify(signDispatch(roseDispatch(), SECRET))
    );

    expect(metadata.user_id).toBe('family-rose-memory');
    expect(getInboundCallContext('in-signed')).toMatchObject({
      callerPhone: ROSE_PHONE,
      callerName: 'Rose',
      userId: 'sponsored-rose',
      sponsoredIdentityId: 'sponsored-rose',
      isKnownCaller: true,
    });
    expect(await promptFor('in-signed')).toContain('phone call from Rose');
  });

  it('logs the caller only as a masked number, with no name or memory id', async () => {
    const written: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });

    await dispatch('in-logged', JSON.stringify(signDispatch(roseDispatch(), SECRET)));

    const log = written.join('');
    expect(log).toContain('"callerPhone":"**21"');
    expect(log).not.toContain('5557654321');
    expect(log).not.toContain('Rose');
    expect(log).not.toContain('family-rose-memory');
  });
});
