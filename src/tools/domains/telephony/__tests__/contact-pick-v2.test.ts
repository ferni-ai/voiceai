/**
 * CONTACT_PICK_V2 on: the scored contact pick (contact-pick-v2.ts), on the #2848 review's
 * probe scenarios (rounds 1 and 2) plus the round-2 blockers:
 * - B1: a relation query ("my dad") never dials a name that merely contains the word
 *   (Father Tom, Mama's Kitchen, Sister Mary); it asks the caller instead.
 * - B2: notes count only as the OWNER's relation: never "her dad is a doctor", never
 *   "not my dad, just a family friend".
 * - B3: names in any script ("李明", "Ольга Петрова", "محمد") resolve by exact name.
 *
 * Drives the real contact store (in memory), the real lookup and the real gated tool.
 * Mocked only at the edges: LiveKit, fetch, the entity store, the profile store and the
 * user_contacts fallback search. All numbers are fake.
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
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      throw new Error('no firestore in tests');
    }
  },
}));
vi.mock('../../../../services/contacts.js', () => ({ searchContacts: vi.fn(async () => []) }));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

import {
  clearCache,
  getContacts,
} from '../../../../services/contacts/contact-relationship-service.js';
import { findContact, resolveContact } from '../call-on-behalf.js';
import {
  contactScore,
  normalizeContactQuery,
  notesNameOwnerRelation,
  roleOf,
} from '../contact-pick-v2.js';
import { SCENARIOS } from './contact-pick.fixtures.js';
import { liveCall, rings, seed, stubCallEnv, USER } from './contact-pick.harness.js';

const fetchSpy = vi.fn(async () => new Response('{}'));
const scenario = (prefix: string) => SCENARIOS.find((s) => s.title.startsWith(prefix))!;

beforeEach(() => {
  clearCache();
  stubCallEnv();
  vi.stubEnv('CONTACT_PICK_V2', 'on');
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearCache();
});

describe('every review scenario, flag on', () => {
  for (const s of SCENARIOS) {
    it(s.title, async () => {
      await seed(s.contacts);
      for (const [said, , v2] of s.rows) {
        // eslint-disable-next-line no-await-in-loop -- one probe at a time, like a caller
        expect(await rings(said), `"${said}"`).toBe(v2);
      }
    });
  }
});

describe('B1: a name that only contains the relation word never dials', () => {
  it('"my dad" with only Father Tom numbered asks "Did you mean Father Tom, or …?"', async () => {
    await seed(scenario('Dad has no number; only Father Tom').contacts);
    const out = await liveCall().call({ contactQuery: 'my dad', purpose: 'say hi' }, 'c1');
    expect(out).toBe(
      "Nothing was dialed: no saved contact is your dad. Did you mean Father Tom, or what's your dad's number? Ask the caller."
    );
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
  });

  it('"mama" with only Mama\'s Kitchen numbered asks; a real Mom still wins', async () => {
    await seed(scenario("Mom has no number; only Mama's Kitchen").contacts);
    const found = await findContact('mama', USER);
    expect(found && 'ask' in found && found.ask).toContain("Did you mean Mama's Kitchen");
    clearCache();
    await seed(scenario('a realistic contact list').contacts);
    expect(await rings('mama')).toBe('Mom|8015550206');
  });
});

describe("B2: notes count only as the owner's relation", () => {
  const dad = ['dad', 'father', 'papa', 'daddy'];
  it.each([
    ["User's dad", true],
    ['my dad', true],
    ['dad', true],
    ['mom - cell', false],
    ['her dad is a doctor', false],
    ["Jenny's roommate; her dad is a doctor", false],
    ['his dad', false],
    ['their dad', false],
    ['not my dad, just a family friend', false],
    ["isn't my dad", false],
    ['no longer my dad', false],
    ["Dad's wife", false],
    ["User's dad's wife", false],
    ["Mom's cell; Dad uses it too", false],
  ])('"%s" → %s', (notes, owner) => {
    expect(notesNameOwnerRelation(notes, dad)).toBe(owner);
  });
});

describe('B3: names in any script', () => {
  it('李明, Ольга Петрова and محمد score as exact names', () => {
    for (const name of ['李明', 'Ольга Петрова', 'محمد']) {
      expect(contactScore({ name, phone: '8015550400' }, name, true), name).toBe(5);
    }
    expect(normalizeContactQuery('my Ольга')).toBe('ольга');
  });
});

describe('the prod bug and the call itself', () => {
  it('the read-back and the dial use the same Mom and number', async () => {
    await seed(scenario('the prod bug').contacts);
    const call = liveCall();
    const preview = await call.call({ contactQuery: 'my mom', purpose: 'say hi' }, 'c1');
    expect(preview).toContain('Mom at 801-555-0163');
    call.caller('Yes, call her.');
    expect(await call.call({ contactQuery: 'my mom', purpose: 'say hi' }, 'c2')).toContain(
      'calling Mom'
    );
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550163');
  });

  it('two Sarahs: asks "Sarah Lee or Sarah Kim?", dials nothing, then rings the one named', async () => {
    await seed([
      ['Sarah Lee', '8015550301'],
      ['Sarah Kim', '8015550302'],
    ]);
    const call = liveCall();
    const ask = await call.call({ contactQuery: 'Sarah', purpose: 'say hi' }, 'c1');
    expect(ask).toMatch(/^Nothing was dialed/);
    expect(ask).toContain('Sarah Lee or Sarah Kim?');
    call.caller('Yes.');
    await call.call({ contactQuery: 'Sarah', purpose: 'say hi' }, 'c2');
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
    const which = liveCall();
    expect(await which.call({ contactQuery: 'Sarah Kim', purpose: 'hi' }, 'c3')).toContain(
      'Sarah Kim at 801-555-0302'
    );
    which.caller('Yes.');
    await which.call({ contactQuery: 'Sarah Kim', purpose: 'hi' }, 'c4');
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550302');
  });

  it('two Moms with different numbers ask by number; the same number twice does not', async () => {
    await seed([
      ['Mom', '8015550101', "User's mom", 'family'],
      ['Mom', '8015550102', "User's mom", 'family'],
    ]);
    const out = await liveCall().call({ contactQuery: 'my mom', purpose: 'say hi' }, 'c1');
    expect(out).toContain('Mom (number ending 0101) or Mom (number ending 0102)?');
    clearCache();
    await seed([
      ['Mom', '8015550101', undefined, 'family'],
      ['Mom', '(801) 555-0101', "User's mom", 'family'],
    ]);
    expect(await rings('my mom')).toMatch(/^Mom\|/);
  });

  it('a number given for "Sarah" picks the Sarah with that number', async () => {
    await seed([
      ['Sarah Lee', '8015550301'],
      ['Sarah Kim', '8015550302'],
    ]);
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    const out = await liveCall().call(
      { contactQuery: 'Sarah', phoneNumber: '801-555-0301', purpose: 'say hi' },
      'c1'
    );
    expect(out).toContain('calling Sarah Lee');
  });

  it("another user's Dad is never picked", async () => {
    await seed([['Dad', '8015550199', "User's dad", 'family']], 'other-user');
    expect(await rings('my dad')).toBeNull();
    expect(await resolveContact('my dad', 'other-user')).toMatchObject({ name: 'Dad' });
  });
});

describe('a number given during the call, flag on', () => {
  it('is saved under the relation asked for ("Dad"), and found next time', async () => {
    const call = liveCall();
    const ask = { contactQuery: 'my dad', phoneNumber: '(801) 555-0142', purpose: 'say hi' };
    await call.call(ask, 'c1');
    call.caller('Yes.');
    expect(await call.call(ask, 'c2')).toContain('calling my dad');
    await vi.waitFor(async () => expect(await getContacts(USER)).toHaveLength(1));
    expect((await getContacts(USER))[0]).toMatchObject({ name: 'Dad', notes: "User's dad" });
    const next = await liveCall().call({ contactQuery: 'my dad', purpose: 'say hi' }, 'c3');
    expect(next).toContain('Dad at 801-555-0142');
  });

  it('"my father" / "the mum" save under the relation name; "them" / "contact" save nothing', async () => {
    for (const [contactQuery, name] of [
      ['my father', 'Dad'],
      ['the mum', 'Mom'],
      ['them', null],
      ['contact', null],
    ] as const) {
      clearCache();
      const call = liveCall();
      const ask = { contactQuery, phoneNumber: '(801) 555-0177', purpose: 'say hi' };
      // eslint-disable-next-line no-await-in-loop -- one call at a time
      await call.call(ask, 'c1');
      call.caller('Yes.');
      // eslint-disable-next-line no-await-in-loop -- one call at a time
      expect(await call.call(ask, 'c2')).toContain('calling');
      // eslint-disable-next-line no-await-in-loop -- let the background save land
      await new Promise((r) => {
        setTimeout(r, 20);
      });
      // eslint-disable-next-line no-await-in-loop -- one call at a time
      expect((await getContacts(USER)).map((c) => c.name)).toEqual(name ? [name] : []);
    }
  });
});

describe('query words', () => {
  it('normalises the query and maps relation words to the saved name', () => {
    expect(normalizeContactQuery('  My Mom ')).toBe('mom');
    expect(roleOf('the mum')).toBe('Mom');
    expect(roleOf('papa')).toBe('Dad');
    expect(roleOf('sis')).toBe('Sister');
    expect(roleOf('bro')).toBe('Brother');
    expect(roleOf("Mama's Kitchen")).toBeUndefined();
  });
});
