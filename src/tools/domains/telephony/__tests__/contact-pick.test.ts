/**
 * Which saved contact a call rings (phone-calls audit 2026-10-25, rows 1-2; #2848 review).
 *
 * Before: two "Mom" rows, the older one with no number stored first. The lookup took
 * results[0], saw no phone and said "no number saved", every time; "my mom" never matched.
 * Round 1 of this fix then regressed named contacts ("Dr. Patel", "O'Brien"), let titles
 * ("Father Tom") and possessive notes ("Dad's wife") pass as the owner's relation, and
 * guessed between two Sarahs. These fixtures are the review's tables, with fake numbers.
 *
 * Drives the real contact store (in memory: Firestore unavailable), the real lookup, and the
 * real gated tool (read-back, yes, dial). Mocked only at the edges: the LiveKit SDK (what
 * rings a phone), fetch, the entity store and the profile store.
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
// No Firestore: the contact store runs on its in-memory cache
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      throw new Error('no firestore in tests');
    }
  },
}));
// The user_contacts fallback the search tries when nothing matches
vi.mock('../../../../services/contacts.js', () => ({ searchContacts: vi.fn(async () => []) }));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

import {
  clearCache,
  getContacts,
  upsertContact,
} from '../../../../services/contacts/contact-relationship-service.js';
import { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { findContact, resolveContact } from '../call-on-behalf.js';
import { contactScore, normalizeContactQuery, roleOf } from '../contact-pick.js';
import { getTelephonyToolDefinitions } from '../index.js';

const USER = 'user-pick';
const fetchSpy = vi.fn(async () => new Response('{}'));

type Seed = [name: string, phone?: string, notes?: string, relationship?: string];

/** Stored in this order, so "stored first" in a fixture is first in the store. */
async function seed(rows: Seed[], userId = USER): Promise<void> {
  for (const [i, [name, phone, notes, relationship]] of rows.entries()) {
    await upsertContact(userId, {
      name,
      contactId: `c${i}_${name}`,
      phone,
      notes,
      relationship: relationship as 'family' | undefined,
    });
  }
}

/** Who "query" rings: "Name 8015550101", "ASK" (several), or null (ask for the number). */
async function rings(query: string): Promise<string | null> {
  const found = await findContact(query, USER);
  if (!found) return null;
  if ('choices' in found) return 'ASK';
  return `${found.name} ${found.phone}`;
}

function liveCall(userId = USER) {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = { userId, agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  return {
    call: async (args: Record<string, unknown>, callId: string) => {
      const tool = registry.get('callOnBehalf')!.create(ctx);
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

beforeEach(() => {
  clearCache();
  for (const [k, v] of Object.entries({
    SIP_TRUNK_ID: 'ST_test',
    LIVEKIT_URL: 'wss://livekit.test',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: 'secret',
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+15550000000',
    CALL_HOURS_GUARD: 'off',
    OUTBOUND_CONFIRM: '',
  }))
    vi.stubEnv(k, v);
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearCache();
});

describe('the prod bug: a phoneless older Mom stored first', () => {
  it('"my mom", "mom", "My Mum" and "mother" ring the Mom with a number', async () => {
    await seed([
      ['Mom', undefined, undefined, 'family'],
      ['Mom', '8015550163', "User's mom", 'family'],
    ]);
    for (const q of ['my mom', 'mom', 'My Mum', 'mother']) {
      expect(await rings(q), q).toBe('Mom 8015550163');
    }
  });

  it('the read-back and the dial use the same contact and number', async () => {
    await seed([
      ['Mom', undefined, undefined, 'family'],
      ['Mom', '8015550163', "User's mom", 'family'],
    ]);
    const call = liveCall();
    const preview = await call.call({ contactQuery: 'my mom', purpose: 'say hi' }, 'c1');
    expect(preview).toContain('NOT SENT YET');
    expect(preview).toContain('Mom at 801-555-0163');
    call.caller('Yes, call her.');
    expect(await call.call({ contactQuery: 'my mom', purpose: 'say hi' }, 'c2')).toContain(
      'calling Mom'
    );
    expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550163');
  });
});

describe('named contacts resolve exactly as on main (raw query searched too)', () => {
  const NAMED: Seed[] = [
    ['Dr. Patel', '8015550201', 'dentist', 'professional'],
    ["O'Brien", '8015550202'],
    ["Sean O'Brien", '8015550207'],
    ['Mary-Jane', '8015550208'],
    ['J.R.', '8015550209'],
    ["Mama's Kitchen", '8015550210'],
    ['Mom', '8015550101', "User's mom", 'family'],
  ];
  it.each([
    ['Dr. Patel', 'Dr. Patel 8015550201'],
    ["O'Brien", "O'Brien 8015550202"],
    ["Sean O'Brien", "Sean O'Brien 8015550207"],
    ['Mary-Jane', 'Mary-Jane 8015550208'],
    ['J.R.', 'J.R. 8015550209'],
    ["Mama's Kitchen", "Mama's Kitchen 8015550210"],
    ['my dentist', 'Dr. Patel 8015550201'],
    ['the dentist', 'Dr. Patel 8015550201'],
  ])('%s → %s', async (query, expected) => {
    await seed(NAMED);
    expect(await rings(query)).toBe(expected);
  });

  it('the read-back names the punctuated contact', async () => {
    await seed(NAMED);
    const out = await liveCall().call({ contactQuery: 'Dr. Patel', purpose: 'reschedule' }, 'c1');
    expect(out).toContain('Dr. Patel at 801-555-0201');
  });
});

describe('titles are never relations', () => {
  it('"my father" rings Dad, not Father Tom stored first', async () => {
    await seed([
      ['Father Tom', '8015550204', 'priest', 'professional'],
      ['Dad', '8015550111', "User's dad", 'family'],
    ]);
    for (const q of ['my father', 'father', 'my dad', 'papa']) {
      expect(await rings(q), q).toBe('Dad 8015550111');
    }
  });

  it('"my sister" rings the owner\'s sister, not Sister Mary stored first', async () => {
    await seed([
      ['Sister Mary', '8015550203', 'nun', 'professional'],
      ['Jenny', '8015550112', "User's sister", 'family'],
    ]);
    for (const q of ['my sister', 'sis']) expect(await rings(q), q).toBe('Jenny 8015550112');
  });

  it('a title alone is the weakest match, below any real relation', async () => {
    const said = 'my father';
    const title = contactScore({ name: 'Father Tom', phone: '1' }, said, true);
    const owners = contactScore({ name: 'Bob', phone: '1', notes: "User's father" }, said, true);
    const named = contactScore({ name: 'Dad', phone: '1' }, said, true);
    expect([title, owners, named]).toEqual([2, 3, 4]);
  });
});

describe("possessive notes never make someone the owner's relation", () => {
  it('"my dad": Carol "Dad\'s wife" and Pat "User\'s dad\'s wife" → ask for the number', async () => {
    await seed([
      ['Dad', undefined, "User's dad", 'family'],
      ['Carol', '8015550106', "Dad's wife", 'family'],
      ['Pat', '8015550108', "User's dad's wife", 'family'],
    ]);
    for (const q of ['my dad', 'dad', 'father']) expect(await rings(q), q).toBeNull();
    const out = await liveCall().call({ contactQuery: 'my dad', purpose: 'say hi' }, 'c1');
    expect(out).toContain("I don't have a number for my dad");
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
  });

  it('"my mom": Grandma "Mom\'s mom" → ask for the number', async () => {
    await seed([
      ['Mom', undefined, undefined, 'family'],
      ['Grandma', '8015550105', "Mom's mom", 'family'],
    ]);
    for (const q of ['my mom', 'mom']) expect(await rings(q), q).toBeNull();
  });

  it('"my dad" never rings Mom\'s shared cell ("Mom\'s cell; Dad uses it too")', async () => {
    await seed([['Mom', '8015550101', "Mom's cell; Dad uses it too", 'family']]);
    expect(await rings('my dad')).toBeNull();
    expect(await rings('my mom')).toBe('Mom 8015550101');
  });

  it('Linda "Dad\'s girlfriend", stored after Dad, never outranks Dad', async () => {
    await seed([
      ['Dad', '8015550111', "User's dad", 'family'],
      ['Linda', '8015550107', "Dad's girlfriend", 'family'],
    ]);
    for (const q of ['dad', 'my dad', 'papa', 'father', 'my father']) {
      expect(await rings(q), q).toBe('Dad 8015550111');
    }
  });

  it('"mom" no longer rings any family member: Susan (family, no notes) → ask', async () => {
    await seed([['Susan', '8015550110', undefined, 'family']]);
    expect(await rings('mom')).toBeNull();
  });

  it('"dad"/"papa"/"sis"/"bro" never ring the only Mom', async () => {
    await seed([['Mom', '8015550101', "User's mom", 'family']]);
    for (const q of ['dad', 'papa', 'sis', 'bro']) expect(await rings(q), q).toBeNull();
  });
});

describe('a tie on top asks which one and dials nothing', () => {
  const SARAHS: Seed[] = [
    ['Sarah Lee', '8015550301'],
    ['Sarah Kim', '8015550302'],
  ];

  it('two Sarahs: the read-back asks "Sarah Lee or Sarah Kim?", then rings the one named', async () => {
    await seed(SARAHS);
    const call = liveCall();
    const ask = await call.call({ contactQuery: 'Sarah', purpose: 'say hi' }, 'c1');
    expect(ask).toMatch(/^Nothing was dialed/);
    expect(ask).toContain('Sarah Lee or Sarah Kim?');
    call.caller('Yes.');
    await call.call({ contactQuery: 'Sarah', purpose: 'say hi' }, 'c2');
    expect(sip.createSipParticipant).not.toHaveBeenCalled();

    const which = liveCall();
    expect(await which.call({ contactQuery: 'Sarah Kim', purpose: 'say hi' }, 'c3')).toContain(
      'Sarah Kim at 801-555-0302'
    );
    which.caller('Yes.');
    await which.call({ contactQuery: 'Sarah Kim', purpose: 'say hi' }, 'c4');
    expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
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
    expect(await rings('my mom')).toMatch(/^Mom /);
  });

  it('a number given for "Sarah" picks the Sarah with that number', async () => {
    await seed(SARAHS);
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    const out = await liveCall().call(
      { contactQuery: 'Sarah', phoneNumber: '801-555-0301', purpose: 'say hi' },
      'c1'
    );
    expect(out).toContain('calling Sarah Lee');
  });
});

describe('a number given during the call', () => {
  it('is saved under the relation asked for ("Dad"), and found next time', async () => {
    expect(await getContacts(USER)).toEqual([]);
    const call = liveCall();
    const ask = { contactQuery: 'my dad', phoneNumber: '(801) 555-0142', purpose: 'say hi' };
    expect(await call.call(ask, 'c1')).toContain('NOT SENT YET');
    call.caller('Yes.');
    expect(await call.call(ask, 'c2')).toContain('calling my dad');
    await vi.waitFor(async () => expect(await getContacts(USER)).toHaveLength(1));
    expect((await getContacts(USER))[0]).toMatchObject({
      name: 'Dad',
      relationship: 'family',
      notes: "User's dad",
    });
    const next = await liveCall().call({ contactQuery: 'my dad', purpose: 'say hi' }, 'c3');
    expect(next).toContain('Dad at 801-555-0142');
  });

  it('"my father" and "the mum" save under the relation name; "them"/"contact" save nothing', async () => {
    for (const [contactQuery, name] of [
      ['my father', 'Dad'],
      ['the mum', 'Mom'],
      ['them', null],
      ['contact', null],
    ] as const) {
      clearCache();
      const call = liveCall();
      const ask = { contactQuery, phoneNumber: '(801) 555-0177', purpose: 'say hi' };
      await call.call(ask, 'c1');
      call.caller('Yes.');
      expect(await call.call(ask, 'c2')).toContain('calling');
      // eslint-disable-next-line no-await-in-loop -- let the background save land
      await new Promise((r) => {
        setTimeout(r, 20);
      });
      expect((await getContacts(USER)).map((c) => c.name)).toEqual(name ? [name] : []);
    }
  });

  it("another user's Dad is never picked", async () => {
    await seed([['Dad', '8015550199', "User's dad", 'family']], 'other-user');
    expect(await rings('my dad')).toBeNull();
    expect(await resolveContact('my dad', 'other-user')).toMatchObject({ name: 'Dad' });
  });
});

describe('query words', () => {
  it('normalises the query and maps relation words to the saved name', () => {
    expect(normalizeContactQuery('  My Mom ')).toBe('mom');
    expect(normalizeContactQuery('our sister')).toBe('sister');
    expect(roleOf('the mum')).toBe('Mom');
    expect(roleOf('papa')).toBe('Dad');
    expect(roleOf('sis')).toBe('Sister');
    expect(roleOf('bro')).toBe('Brother');
    expect(roleOf("Mama's Kitchen")).toBeUndefined();
    expect(roleOf('Dr. Lee')).toBeUndefined();
  });
});
