/**
 * A number the owner gives while asking Ferni to call someone is saved at the read-back, before
 * any yes, so the next session finds it (contact-on-mention.ts, CONTACT_SAVE_ON_MENTION).
 *
 * Prod 2026-10-26: at 18:47 the owner gave his dad's number with callOnBehalf; the call was
 * read back but never placed, and saving only happened when a confirmed call was placed. At
 * 22:20 Ferni said it had no number for him.
 *
 * Drives the real gated callOnBehalf tool (read-back, the caller's words, dial) and the real
 * contact store over a fake Firestore that keeps documents, so "next session" drops the
 * process cache and reads back what was persisted. Mocked only at the edges: LiveKit (what
 * rings a phone), fetch, the entity store, the profile store, the user_contacts fallback
 * search, the semantic-index hooks and (for the MINOR_CARE case) the hold check. All numbers
 * are fake (555-01xx).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sip = vi.hoisted(() => ({
  createSipParticipant: vi.fn(async (..._args: unknown[]) => ({ participantId: 'PA_test' })),
  createRoom: vi.fn(async () => ({})),
  createDispatch: vi.fn(async () => ({})),
}));
vi.mock('livekit-server-sdk', () => ({
  SipClient: class {
    createSipParticipant = sip.createSipParticipant;
  },
  RoomServiceClient: class {
    createRoom = sip.createRoom;
  },
  AgentDispatchClient: class {
    createDispatch = sip.createDispatch;
  },
}));

/** contact_relationships as Firestore would keep it: doc id → document. */
const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return {
        where: (_f: string, _op: string, userId: string) => ({
          get: async () => ({
            docs: [...docs.values()]
              .filter((d) => d.userId === userId)
              .map((d) => ({ data: () => structuredClone(d) })),
          }),
        }),
        doc: (id: string) => ({
          set: async (data: Record<string, unknown>) => void docs.set(id, structuredClone(data)),
        }),
      };
    }
  },
}));
vi.mock('../../../../services/contacts.js', () => ({ searchContacts: vi.fn(async () => []) }));
vi.mock('../../../../services/data-layer/hooks/contacts-hooks.js', () => ({
  onContactChange: async () => undefined,
  onContactInteractionChange: async () => undefined,
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));
const held = vi.hoisted(() => new Set<string>());
vi.mock('../../../../utils/minor-care.js', async (orig) => ({
  ...(await orig<object>()),
  writeHeld: (userId: string) => held.has(userId),
}));

import { CONTACT_SAVE_ON_MENTION } from '../../../../config/flags/CONTACT_SAVE_ON_MENTION.js';
import {
  clearCache,
  getContacts,
} from '../../../../services/contacts/contact-relationship-service.js';
import { createCallOnBehalfTool } from '../call-on-behalf.js';
import { rememberNumberGiven } from '../contact-on-mention.js';
import { liveCall, rings, seed, stubCallEnv, USER } from './contact-pick.harness.js';

const fetchSpy = vi.fn(async () => new Response('{}'));
const DAD = '+18015550142';
const dials = () => sip.createSipParticipant.mock.calls.length + fetchSpy.mock.calls.length;
/** A new session: this process forgets what it cached and reads the store again. */
const nextSession = () => clearCache();
const storedPhones = (userId = USER) =>
  [...docs.values()].filter((d) => d.userId === userId).map((d) => `${d.name}|${d.phone ?? ''}`);

beforeEach(() => {
  docs.clear();
  held.clear();
  clearCache();
  stubCallEnv();
  vi.stubEnv('CONTACT_PICK_V2', '');
  vi.stubEnv('CONTACT_SAVE_ON_MENTION', '');
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearCache();
});

describe('a number given for a call is saved at the read-back', () => {
  it('ships on (a kill switch)', () => {
    expect(CONTACT_SAVE_ON_MENTION).toMatchObject({ default: 'on', kind: 'kill-switch' });
  });

  it('"call my dad, his number is …", no yes, session ends: the next session finds it', async () => {
    expect(await rings('dad')).toBeNull();
    expect(storedPhones()).toEqual([]);

    const call = liveCall();
    const ask = { contactQuery: 'my dad', phoneNumber: '+1 801 555 0142', purpose: 'check in' };
    expect(await call.call(ask, 'c1')).toContain('NOT SENT YET');
    // The session ends here: no yes, nothing rang.
    expect(dials()).toBe(0);

    nextSession();
    expect(storedPhones()).toEqual([`Dad|${DAD}`]);
    expect(await rings('dad')).toBe(`Dad|${DAD}`);
    const next = await liveCall().call({ contactQuery: 'dad', purpose: 'check in' }, 'c2');
    expect(next).toContain('Dad at 801-555-0142');
    expect(dials()).toBe(0);
  });

  it('a saved "Dad" with no number gets the number filled in, not a second Dad', async () => {
    await seed([['Dad', undefined, "User's dad", 'family']]);
    nextSession();
    expect(await rings('dad')).toBeNull();
    expect(storedPhones()).toEqual(['Dad|']);

    const ask = { contactQuery: 'dad', phoneNumber: '(801) 555-0142', purpose: 'check in' };
    expect(await liveCall().call(ask, 'c1')).toContain('NOT SENT YET');

    nextSession();
    expect(storedPhones()).toEqual([`Dad|${DAD}`]);
    const next = await liveCall().call({ contactQuery: 'dad', purpose: 'check in' }, 'c2');
    expect(next).toContain('Dad at 801-555-0142');
  });

  it('a saved "Dad" with a different number is kept, and the read-back asks to change it', async () => {
    await seed([['Dad', '+18015550199', "User's dad", 'family']]);
    const ask = { contactQuery: 'dad', phoneNumber: '801-555-0142', purpose: 'check in' };
    const preview = await liveCall().call(ask, 'c1');
    expect(preview).toContain('a call to dad at 801-555-0142');
    expect(preview).toContain("change Dad's saved number (now ending in 0199) to this one");

    // No yes: the stored number stays, in this session and the next.
    nextSession();
    expect(storedPhones()).toEqual(['Dad|+18015550199']);
    const next = await liveCall().call({ contactQuery: 'dad', purpose: 'check in' }, 'c2');
    expect(next).toContain('Dad at 801-555-0199');
    expect(dials()).toBe(0);
  });

  it('a yes to that read-back rings the new number and replaces the saved one', async () => {
    await seed([['Dad', '+18015550199', "User's dad", 'family']]);
    const call = liveCall();
    const ask = { contactQuery: 'dad', phoneNumber: '801-555-0142', purpose: 'check in' };
    await call.call(ask, 'c1');
    call.caller('Yes.');
    expect(await call.call(ask, 'c2')).toContain('calling Dad');
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe(DAD);
    await vi.waitFor(() => expect(storedPhones()).toEqual([`Dad|${DAD}`]));
  });

  it('a confirmed call that never read back a change keeps the saved number', async () => {
    await seed([['Dad', '+18015550199', "User's dad", 'family']]);
    vi.stubEnv('OUTBOUND_CONFIRM', 'off'); // tests only: execute runs with no read-back
    const tool = createCallOnBehalfTool({
      userId: USER,
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
    });
    const ask = { contactQuery: 'dad', phoneNumber: '801-555-0142', purpose: 'check in' };
    expect(String(await tool.execute(ask, { toolCallId: 'x', ctx: {} } as never))).toContain(
      'calling Dad'
    );
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe(DAD); // this call rings what was given
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    nextSession();
    expect(storedPhones()).toEqual(['Dad|+18015550199']);
  });

  it('the same number under another name: found by both ("Dad", also called Doug)', async () => {
    await seed([['Dad', DAD, "User's dad", 'family']]);
    expect(await rings('Doug')).toBeNull();
    const ask = { contactQuery: 'Doug', phoneNumber: '801 555 0142', purpose: 'check in' };
    expect(await liveCall().call(ask, 'c1')).toContain('NOT SENT YET');
    nextSession();
    expect(storedPhones()).toEqual([`Dad|${DAD}`]);
    expect(await rings('Doug')).toBe(`Dad|${DAD}`);
    expect(await rings('dad')).toBe(`Dad|${DAD}`);
  });
});

describe('who and what is never saved', () => {
  const ask = { contactQuery: 'dad', phoneNumber: '801-555-0142', purpose: 'check in' };

  it('never from an on-behalf session, even when a call there runs the tool', async () => {
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    const userId = 'onbehalf:onbehalf_1_abc';
    const tool = createCallOnBehalfTool({ userId, agentId: 'ferni', agentDisplayName: 'Ferni' });
    await tool.execute(ask, { toolCallId: 'x', ctx: {} } as never);
    const found = null;
    expect(await rememberNumberGiven({ userId, contactQuery: 'dad', phone: DAD, found })).toBe(
      'refused'
    );
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    expect(docs.size).toBe(0);
    expect(await getContacts(userId)).toEqual([]);
  });

  it('never for a caller MINOR_CARE holds', async () => {
    held.add(USER);
    expect(await liveCall().call(ask, 'c1')).toContain('NOT SENT YET');
    expect(docs.size).toBe(0);
    held.clear();
    expect(await liveCall().call(ask, 'c2')).toContain('NOT SENT YET');
    expect(storedPhones()).toEqual([`Dad|${DAD}`]); // the same call saves for anyone else
  });

  it("never junk, a +1 555 test number or one of Ferni's own lines", async () => {
    vi.stubEnv('SIP_TRUNK_NUMBER', '+18015550100');
    const given = { userId: USER, contactQuery: 'dad', found: null };
    for (const phone of ['12345', '+1 555 123 4567', '(801) 555-0100']) {
      // eslint-disable-next-line no-await-in-loop -- one at a time
      expect(await rememberNumberGiven({ ...given, phone })).toBe('invalid');
    }
    expect(await liveCall().call({ ...ask, phoneNumber: '12345' }, 'c1')).toMatch(/^Nothing/);
    expect(docs.size).toBe(0);
  });

  it('CONTACT_SAVE_ON_MENTION=off: saved only once a confirmed call is placed, as before', async () => {
    vi.stubEnv('CONTACT_SAVE_ON_MENTION', 'off');
    const call = liveCall();
    await call.call(ask, 'c1');
    expect(docs.size).toBe(0);
    call.caller('Yes.');
    expect(await call.call(ask, 'c2')).toContain('calling dad');
    await vi.waitFor(() => expect(storedPhones()).toEqual([`Dad|${DAD}`]));
  });
});
