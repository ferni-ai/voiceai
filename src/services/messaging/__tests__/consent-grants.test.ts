/**
 * How a third party's consent becomes 'in': their YES to a consent ask, or a
 * friends-and-family owner's attestation; and the consent ask itself, the one
 * allowed first message (owner-confirmed, once per contact per 30 days).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryConsentStore } from './memory-consent.js';
import {
  claimConsentAsk,
  consentAskText,
  hasGrant,
  isConsentYes,
  mayReachForOwner,
  recordContactYes,
  recordOwnerAttestation,
  thirdPartyRefusal,
} from '../consent-grants.js';
import { sendConsentAsk } from '../consent-ask.js';
import { readConsent, recordInboundSmsConsent, writeOptOut, type ConsentDeps } from '../consent.js';
import { phoneHash, type StoredCheckin } from '../../outreach/checkin-replies.js';
import type { TextDeps, TextStore } from '../../outreach/guarded-text.js';

const PAT = '+12025550188';
const env = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
const HASH = phoneHash(PAT, env) as string;
let now = new Date('2026-10-18T16:00:00Z'); // noon in Washington: not quiet hours
const DAY = 24 * 60 * 60 * 1000;

let m: ReturnType<typeof memoryConsentStore>;
let deps: ConsentDeps;
beforeEach(() => {
  now = new Date('2026-10-18T16:00:00Z');
  m = memoryConsentStore();
  deps = { env, store: m.store, now: () => now };
});

describe('isConsentYes: exact single words', () => {
  it.each(['YES', 'yes.', 'Y', 'ok', 'Sure!', ' OK '])('%s is a yes', (b) =>
    expect(isConsentYes(b)).toBe(true)
  );
  it.each(['yes please', 'yesterday', 'okay then', 'not sure', 'y not', 'ok?? who is this'])(
    '%s is not',
    (b) => expect(isConsentYes(b)).toBe(false)
  );
});

/** Texts sent to Pat (feature_checkins), as the YES check reads them. */
let texts: StoredCheckin[] = [];
const sentToPat = (refId: string, userId: string, at = now): void => {
  texts.push({
    id: refId,
    userId,
    sessionId: refId,
    refId,
    sentAt: at.toISOString(),
    question: 'q',
    status: 'sent',
    phoneLast4: '0188',
    phoneHash: HASH,
    kind: 'on-behalf',
  });
};
/** The owner's consent ask goes out (claimed, then sent). */
const askFrom = async (owner: string): Promise<void> => {
  await claimConsentAsk(HASH, owner, deps, `ask-${owner}`);
  sentToPat(`ask-${owner}`, owner);
};
let sidN = 0;
const reply = async (body: string, sid = `SM${String(++sidN).padStart(10, '0')}`) =>
  recordContactYes(PAT, body, sid, deps, async () => texts);
beforeEach(() => {
  texts = [];
});

describe('recordContactYes', () => {
  it('a YES to an open consent ask turns texts in (contact-yes) and closes the ask', async () => {
    await askFrom('owner-1');
    expect(await reply('Yes')).toEqual(['sms']);
    expect((m.docs.get(HASH)?.grants as Record<string, unknown>)['owner-1']).toMatchObject({
      sms: { source: 'contact-yes' },
    });
    expect(await hasGrant(HASH, 'owner-1', 'sms', deps)).toBe(true);
    expect((await readConsent(HASH, deps)).sms.state).toBe('unknown'); // global: only their STOP/START
    expect(m.docs.get(HASH)?.ask).toBeUndefined();
  });

  it('a YES with no ask, or to one older than 30 days, changes nothing', async () => {
    expect(await reply('yes')).toBeNull();
    await askFrom('owner-1');
    now = new Date(now.getTime() + 31 * DAY);
    expect(await reply('yes')).toBeNull();
    expect(await hasGrant(HASH, 'owner-1', 'sms', deps)).toBe(false);
  });

  it('a YES never undoes a STOP', async () => {
    await askFrom('owner-1');
    await writeOptOut(HASH, 'sms', 'inbound-sms', deps);
    await reply('yes');
    expect((await readConsent(HASH, deps)).sms.state).toBe('opted-out');
    expect(await hasGrant(HASH, 'owner-1', 'sms', deps)).toBe(false); // nothing waits for a START
  });

  it('cross-owner "ok": after another text to Pat, a reply answers that one, not the ask', async () => {
    await askFrom('seth');
    now = new Date(now.getTime() + 60 * 60 * 1000);
    sentToPat('user-b-text', 'user-b'); // user B (granted some other way) texts Pat
    expect(await reply('ok')).toBeNull();
    expect(await hasGrant(HASH, 'seth', 'sms', deps)).toBe(false);
    expect(await hasGrant(HASH, 'user-b', 'sms', deps)).toBe(false);
  });

  it('a YES more than 48 hours after the ask changes nothing', async () => {
    await askFrom('seth');
    now = new Date(now.getTime() + 49 * 60 * 60 * 1000);
    expect(await reply('yes')).toBeNull();
    expect(await hasGrant(HASH, 'seth', 'sms', deps)).toBe(false);
  });

  it('a replayed webhook (same MessageSid) grants nothing, even to a later ask', async () => {
    await askFrom('seth');
    expect(await reply('yes', 'SMreplay000001')).toEqual(['sms']);
    now = new Date(now.getTime() + 31 * DAY);
    await askFrom('user-b');
    expect(await reply('yes', 'SMreplay000001')).toBeNull();
    expect(await hasGrant(HASH, 'user-b', 'sms', deps)).toBe(false);
  });

  it('a YES with no MessageSid is not trusted', async () => {
    await askFrom('seth');
    expect(await recordContactYes(PAT, 'yes', undefined, deps, async () => texts)).toBeNull();
  });
});

describe('recordOwnerAttestation', () => {
  it('a friends-and-family owner: recorded with source, uid and time', async () => {
    expect(await recordOwnerAttestation(PAT, 'call', 'owner-1', deps, async () => true)).toBe(true);
    expect(m.docs.get(HASH)?.grants).toEqual({
      'owner-1': { call: { source: 'owner-attested', at: now.toISOString() } },
    });
    expect(m.docs.get(HASH)?.call).toBeUndefined(); // the global record is the contact's alone
  });

  it('an owner outside friends-and-family: nothing recorded', async () => {
    expect(await recordOwnerAttestation(PAT, 'call', 'owner-2', deps, async () => false)).toBe(
      false
    );
    expect(await hasGrant(HASH, 'owner-2', 'call', deps)).toBe(false);
  });

  it('never over an opt-out', async () => {
    await writeOptOut(HASH, 'sms', 'inbound-sms', deps);
    expect(await recordOwnerAttestation(PAT, 'sms', 'owner-1', deps, async () => true)).toBe(false);
  });
});

describe('sendConsentAsk', () => {
  const send = vi.fn(async () => ({ success: true, messageSid: 'SM1' }));
  const text = (): TextDeps => ({
    env,
    store: {
      forUser: async () => [],
      forPhoneHash: async () => [],
      add: async (r: StoredCheckin) => (texts.push({ ...r, id: r.refId ?? 'x' }), 'id'),
      lock: async () => true,
      lockedAt: async () => undefined,
      unlock: async () => undefined,
      sponsoredPhone: async () => undefined,
      isOptedOut: async () => false,
      userDoc: async () => ({ displayName: 'Seth Example' }),
      legacySmsChannels: async () => undefined,
    } as unknown as TextStore,
    authPhone: async () => '+12025550100', // the owner's own number, not Pat's
    send,
    now: () => now,
  });
  const ask = { senderUserId: 'owner-1', toPhone: PAT, refId: 'ask-1', zone: 'America/New_York' };
  beforeEach(() => send.mockClear());

  it('end to end: the ask goes, Pat replies YES, owner-1 holds the grant', async () => {
    await sendConsentAsk({ ...ask, ownerConfirmed: true }, { text: text(), consent: deps });
    expect(await reply('YES')).toEqual(['sms']);
    expect(await hasGrant(HASH, 'owner-1', 'sms', deps)).toBe(true);
  });

  it('sends once, with the owner named, when the owner confirmed it', async () => {
    expect(
      await sendConsentAsk({ ...ask, ownerConfirmed: true }, { text: text(), consent: deps })
    ).toEqual({
      sent: true,
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: PAT, body: consentAskText('Seth') })
    );
  });

  it('blocked on a repeat within 30 days, allowed again after', async () => {
    const d = { text: text(), consent: deps };
    await sendConsentAsk({ ...ask, ownerConfirmed: true }, d);
    expect(await sendConsentAsk({ ...ask, ownerConfirmed: true }, d)).toEqual({
      sent: false,
      reason: 'asked-recently',
    });
    now = new Date(now.getTime() + 31 * DAY + 60 * 60 * 1000);
    expect(await sendConsentAsk({ ...ask, ownerConfirmed: true }, d)).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('blocked without the owner confirming it', async () => {
    expect(
      await sendConsentAsk({ ...ask, ownerConfirmed: false }, { text: text(), consent: deps })
    ).toEqual({
      sent: false,
      reason: 'not-confirmed',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('a third-party text that is not the ask is still held (the claim is what lets the ask through)', async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    const out = await sendOnBehalfText(
      { senderUserId: 'owner-1', toPhone: PAT, body: 'hi', refId: 'x', zone: 'America/New_York' },
      { ...text(), consent: deps }
    );
    expect(out).toEqual({ sent: false, reason: 'needs-consent' });
    const forged = await sendOnBehalfText(
      {
        senderUserId: 'owner-1',
        toPhone: PAT,
        body: 'hi',
        refId: 'y',
        zone: 'America/New_York',
        consentAskClaim: 'made-up',
      },
      { ...text(), consent: deps }
    );
    expect(forged).toEqual({ sent: false, reason: 'needs-consent' });
    expect(send).not.toHaveBeenCalled();
  });

  it('a send that does not go gives the ask back, so it can be retried', async () => {
    send.mockResolvedValueOnce({ success: false, messageSid: '' } as never);
    const d = { text: text(), consent: deps };
    expect((await sendConsentAsk({ ...ask, ownerConfirmed: true }, d)).sent).toBe(false);
    expect(await sendConsentAsk({ ...ask, ownerConfirmed: true }, d)).toEqual({ sent: true });
  });

  it('never to a number that opted out', async () => {
    await writeOptOut(HASH, 'sms', 'inbound-sms', deps);
    expect(
      await sendConsentAsk({ ...ask, ownerConfirmed: true }, { text: text(), consent: deps })
    ).toEqual({
      sent: false,
      reason: 'opted-out',
    });
  });
});

describe('consent is given for one owner, and a STOP beats it', () => {
  const textFor = (sender: string) => ({
    senderUserId: sender,
    toPhone: PAT,
    body: 'hi',
    refId: `r-${sender}`,
    zone: 'America/New_York',
  });
  const send = vi.fn(async () => ({ success: true, messageSid: 'SM1' }));
  let sent: Array<Record<string, unknown>> = [];
  const textDeps = (): TextDeps => ({
    env,
    store: {
      forUser: async () => [],
      forPhoneHash: async (h: string) => sent.filter((r) => r.phoneHash === h),
      add: async (r: Record<string, unknown>) => (sent.push(r), 'id'),
      lock: async () => true,
      lockedAt: async () => undefined,
      unlock: async () => undefined,
      sponsoredPhone: async () => undefined,
      isOptedOut: async () => false,
      consentDoc: async (h: string) => m.store.read(h),
      userDoc: async () => undefined,
      legacySmsChannels: async () => undefined,
    } as unknown as TextStore,
    authPhone: async () => '+12025550100',
    send,
    now: () => now,
    consent: deps,
  });
  const notOwn = async (): Promise<boolean> => false;
  beforeEach(() => {
    send.mockClear();
    sent = [];
  });

  it("each owner's first text to Mom carries that owner's intro; later ones are plain", async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    await recordOwnerAttestation(PAT, 'sms', 'seth', deps, async () => true);
    await recordOwnerAttestation(PAT, 'sms', 'user-b', deps, async () => true);
    const bodies = (): string[] =>
      (send.mock.calls as unknown as Array<[{ body: string }]>).map(([m]) => m.body);
    await sendOnBehalfText(textFor('seth'), textDeps());
    now = new Date(now.getTime() + 20 * 60 * 1000); // past the 10-minute gap
    await sendOnBehalfText({ ...textFor('seth'), refId: 'r-seth-2' }, textDeps());
    now = new Date(now.getTime() + 20 * 60 * 1000);
    await sendOnBehalfText(textFor('user-b'), textDeps());
    expect(bodies()).toEqual([
      expect.stringContaining('asked me to send this: hi'),
      'hi',
      expect.stringContaining('asked me to send this: hi'),
    ]);
  });

  it("Seth's attestation doesn't let user B text or call Mom; Seth's own grant works", async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    await recordOwnerAttestation(PAT, 'sms', 'seth', deps, async () => true);
    await recordOwnerAttestation(PAT, 'call', 'seth', deps, async () => true);
    expect(await sendOnBehalfText(textFor('user-b'), textDeps())).toEqual({
      sent: false,
      reason: 'needs-consent',
    });
    expect(await thirdPartyRefusal('user-b', PAT, 'call', notOwn, deps)).toBe('needs-consent');
    expect(await sendOnBehalfText(textFor('seth'), textDeps())).toEqual({ sent: true });
    expect(await thirdPartyRefusal('seth', PAT, 'call', notOwn, deps)).toBeNull();
  });

  it("Mom's YES to Seth's ask covers Seth, not user B", async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    await askFrom('seth');
    await reply('YES');
    expect(await sendOnBehalfText(textFor('user-b'), textDeps())).toEqual({
      sent: false,
      reason: 'needs-consent',
    });
    expect(await sendOnBehalfText(textFor('seth'), textDeps())).toEqual({ sent: true });
    // Their own yes to the ask already introduced Ferni: no attestation intro.
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ body: 'hi' }));
  });

  it("a real STOP from Mom (texts only) beats Seth's text AND call grants", async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    await recordOwnerAttestation(PAT, 'sms', 'seth', deps, async () => true);
    await recordOwnerAttestation(PAT, 'call', 'seth', deps, async () => true);
    // What the inbound route does with a plain "STOP": an sms opt-out only.
    expect(await recordInboundSmsConsent(PAT, 'STOP', deps)).toEqual({
      state: 'opted-out',
      channels: ['sms'],
    });
    expect((await readConsent(HASH, deps)).call.state).toBe('unknown');
    expect(await sendOnBehalfText(textFor('seth'), textDeps())).toEqual({
      sent: false,
      reason: 'opted-out',
    });
    expect(await thirdPartyRefusal('seth', PAT, 'call', notOwn, deps)).toBe('opted-out');
    expect(await mayReachForOwner('seth', PAT, 'call', notOwn, deps)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("user B can't ride on Seth's open consent ask", async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    const claim = (await claimConsentAsk(HASH, 'seth', deps)) as string;
    expect(
      await sendOnBehalfText({ ...textFor('user-b'), consentAskClaim: claim }, textDeps())
    ).toEqual({ sent: false, reason: 'needs-consent' });
  });

  it("Seth's own number is still callable after his own text STOP", async () => {
    await recordInboundSmsConsent(PAT, 'STOP', deps);
    expect(await thirdPartyRefusal('seth', PAT, 'call', async () => true, deps)).toBeNull();
  });
});
