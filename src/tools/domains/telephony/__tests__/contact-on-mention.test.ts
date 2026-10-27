/**
 * A number the owner gives while asking Ferni to call someone is saved at the read-back, before
 * any yes, so the next session finds it (contact-on-mention.ts, CONTACT_SAVE_ON_MENTION).
 *
 * Prod 2026-10-26: at 18:47 the owner gave his dad's number with callOnBehalf; the call was
 * read back but never placed, and saving only happened when a confirmed call was placed. At
 * 22:20 Ferni said it had no number for him.
 *
 * PR #2949 review (round 2): a changed number must land in the store it was found in (the
 * entity store wins the next lookup), and a number shared with another contact (a home
 * landline) must never change that contact: the read-back asks, and a yes saves a new one.
 *
 * Drives the real gated callOnBehalf tool (read-back, the caller's words, dial), the real
 * contact store over a fake Firestore that keeps documents, and the real entity-store
 * telephony half (telephony-contact.ts) over fake entity storage, so "next session" drops the
 * process cache and reads back what was persisted. Mocked only at the edges: LiveKit (what
 * rings a phone), fetch, entity storage, the profile store, the user_contacts fallback search,
 * the semantic-index hooks and (for the MINOR_CARE case) the hold check. All numbers are fake.
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
/** entity_store/{uid}/entities as storage.ts would keep it: `${uid}/${id}` → entity. */
const entities = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../../../memory/entity-store/storage.js', () => {
  const key = (uid: string, id: string) => `${uid}/${id}`;
  const get = async (uid: string, id: string) =>
    structuredClone(entities.get(key(uid, id))) ?? null;
  return {
    findEntityByAlias: async (uid: string, q: string) =>
      [...entities.values()].find(
        (e) =>
          e.userId === uid && (e.aliases as string[]).includes(q.toLowerCase().replace(/^my /, ''))
      ) ?? null,
    searchEntities: async () => [],
    getEntity: get,
    updateEntity: async (uid: string, id: string, updates: Record<string, unknown>) => {
      const e = entities.get(key(uid, id));
      if (!e) return null;
      entities.set(key(uid, id), { ...e, ...structuredClone(updates) });
      return get(uid, id);
    },
  };
});
// integration.ts's telephony entry points are thin wrappers over telephony-contact.ts (real here)
vi.mock('../../../../memory/entity-store/integration.js', async () => {
  const t = await vi.importActual<
    typeof import('../../../../memory/entity-store/telephony-contact.js')
  >('../../../../memory/entity-store/telephony-contact.js');
  return {
    isEntityStoreReady: () => true,
    findContactForTelephony: t.lookUpTelephonyContact,
    setPersonPhone: t.setPersonPhone,
  };
});
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
  entities.clear();
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
});

describe('who and what is never saved', () => {
  const ask = { contactQuery: 'dad', phoneNumber: '801-555-0142', purpose: 'check in' };

  it('never from an on-behalf session, even when a call there runs the tool', async () => {
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    const userId = 'onbehalf:onbehalf_1_abc';
    const tool = createCallOnBehalfTool({ userId, agentId: 'ferni', agentDisplayName: 'Ferni' });
    await tool.execute(ask, { toolCallId: 'x', ctx: {} } as never);
    const found = null;
    expect(
      await rememberNumberGiven({ userId, contactQuery: 'dad', phone: DAD, found })
    ).toMatchObject({ outcome: 'refused' });
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
      expect(await rememberNumberGiven({ ...given, phone })).toMatchObject({ outcome: 'invalid' });
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

const OLD = '+18015550199';
/** Dad in the entity store, his number in the migration shape or the captured shape. */
function seedEntityDad(shape: 'contact' | 'attributes', phone = OLD, userId = USER) {
  entities.set(`${userId}/dad-entity`, {
    id: 'dad-entity',
    userId,
    type: 'person',
    canonicalName: 'Dad',
    aliases: ['dad', 'father'],
    specificRelation: 'dad',
    attributes: {
      _type: 'person',
      relationship: 'father',
      ...(shape === 'attributes' && { phone }),
    },
    ...(shape === 'contact' && { contact: { phone } }),
  });
}
const entityPhones = () => {
  const e = entities.get(`${USER}/dad-entity`) as {
    contact?: { phone?: string };
    attributes: { phone?: string };
  };
  return { contact: e.contact?.phone, attributes: e.attributes.phone };
};
const settle = () =>
  new Promise((r) => {
    setTimeout(r, 30);
  });
const dialed = () => sip.createSipParticipant.mock.calls.map((c) => String(c[1]));

describe('a changed number lands where the next lookup reads it (entity store first)', () => {
  it.each([
    ['contact', false],
    ['contact', true],
    ['attributes', false],
    ['attributes', true],
  ] as const)(
    "Dad's old number in entity %s.phone (legacy twin row: %s): a yes, and the next session dials the new one",
    async (shape, legacyTwin) => {
      seedEntityDad(shape);
      if (legacyTwin) await seed([['Dad', OLD, "User's dad", 'family']]);
      nextSession();
      expect(await rings('dad')).toBe(`Dad|${OLD}`);

      const call = liveCall();
      const ask = { contactQuery: 'dad', phoneNumber: '801-555-0142', purpose: 'check in' };
      expect(await call.call(ask, 'c1')).toContain(
        "change Dad's saved number (now ending in 0199)"
      );
      call.caller('Yes.');
      expect(await call.call(ask, 'c2')).toContain('calling Dad');
      await settle();

      nextSession();
      expect(entityPhones()).toEqual({ contact: DAD, attributes: DAD });
      expect(storedPhones()).toEqual(legacyTwin ? [`Dad|${DAD}`] : []); // never a second Dad
      expect(await rings('dad')).toBe(`Dad|${DAD}`);
      const next = liveCall();
      await next.call({ contactQuery: 'dad', purpose: 'check in' }, 'n1');
      next.caller('Yes.');
      await next.call({ contactQuery: 'dad', purpose: 'check in' }, 'n2');
      expect(dialed()).toEqual([DAD, DAD]);
    }
  );

  it('a number captured in conversation (attributes.phone) is found by a call', async () => {
    seedEntityDad('attributes', DAD);
    expect(await rings('dad')).toBe(`Dad|${DAD}`);
    vi.stubEnv('CONTACT_SAVE_ON_MENTION', 'off'); // as on main: only contact.phone was read
    expect(await rings('dad')).toBeNull();
  });
});

describe('a number shared with another contact never changes that contact', () => {
  const HOME = '+18015550177';
  const CELL = '+18015550188';
  const callWithYes = async (contactQuery: string, phoneNumber: string, id: string) => {
    const call = liveCall();
    const ask = { contactQuery, phoneNumber, purpose: 'check in' };
    const preview = await call.call(ask, `${id}1`);
    call.caller('Yes.');
    return { preview, placed: await call.call(ask, `${id}2`) };
  };

  it.each([
    ['Doug', ''],
    ['Doug', 'on'],
    ['dad', ''],
    ['dad', 'on'],
  ])(
    'Mom at home; "call %s at home", then at a cell; "call mom" (CONTACT_PICK_V2=%s)',
    async (who, v2) => {
      vi.stubEnv('CONTACT_PICK_V2', v2);
      await seed([['Mom', HOME, "User's mom", 'family']]);
      const mom = () => [...docs.values()].find((d) => d.name === 'Mom');
      const before = structuredClone(mom());

      const home = await callWithYes(who, '801-555-0177', 'h');
      const them = who === 'dad' ? 'your dad' : who;
      expect(home.preview).toContain(
        `(that's the number I have for Mom: is ${them} at the same number?)`
      );
      expect(home.preview).not.toContain("change Mom's");
      await settle();
      nextSession();
      expect(mom()).toEqual(before);
      expect(await rings('mom')).toBe(`Mom|${HOME}`);
      const saved = who === 'dad' ? 'Dad' : 'Doug';
      // The default lookup's "dad" returns Mom when she is saved first (main, pinned in
      // contact-pick.fixtures.ts; CONTACT_PICK_V2 fixes it): here the same home number
      const mainDadBug = who === 'dad' && v2 === '';
      expect(await rings(who)).toBe(mainDadBug ? `Mom|${HOME}` : `${saved}|${HOME}`);

      const cell = await callWithYes(who, '801-555-0188', 'c');
      expect(cell.preview).toContain(`change ${saved}'s saved number (now ending in 0177)`);
      expect(cell.preview).not.toContain('Mom');
      await settle();
      nextSession();
      expect(mom()).toEqual(before);
      expect(await rings('mom')).toBe(`Mom|${HOME}`);
      expect(await rings(who)).toBe(mainDadBug ? `Mom|${HOME}` : `${saved}|${CELL}`);
      expect(dialed()).toEqual([HOME, CELL]); // each confirmed call rang what was read back
      expect(storedPhones().sort()).toEqual([`${saved}|${CELL}`, `Mom|${HOME}`]);
    }
  );

  it('with no yes to "is Doug at the same number?", nothing is saved for Doug', async () => {
    await seed([['Dad', DAD, "User's dad", 'family']]);
    const ask = { contactQuery: 'Doug', phoneNumber: '801 555 0142', purpose: 'check in' };
    expect(await liveCall().call(ask, 'c1')).toContain("that's the number I have for Dad");
    nextSession();
    expect(storedPhones()).toEqual([`Dad|${DAD}`]);
    expect(await rings('Doug')).toBeNull();
  });

  it('the owner\'s own words tie a name to a relation: "my dad, Doug" adds Doug to Dad', async () => {
    await seed([['Dad', DAD, "User's dad", 'family']]);
    const ask = { contactQuery: 'my dad, Doug', phoneNumber: '801 555 0142', purpose: 'check in' };
    const preview = await liveCall().call(ask, 'c1');
    expect(preview).not.toContain("that's the number I have");
    nextSession();
    expect(storedPhones()).toEqual([`Dad|${DAD}`]);
    expect(await rings('Doug')).toBe(`Dad|${DAD}`);
  });
});
