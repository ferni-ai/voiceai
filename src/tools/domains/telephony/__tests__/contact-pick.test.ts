/**
 * The default contact pick (CONTACT_PICK_V2 off) is main's, row for row, with one fix
 * (phone-calls audit 2026-10-25, rows 1-2): a phoneless first match yields to a later row
 * with the same name and a number. Before, the owner's two "Mom" rows (the older one with no
 * number stored first) made every "call mom" say "no number saved".
 *
 * Drives the real contact store (in memory), the real lookup and the real gated tool.
 * Mocked only at the edges: LiveKit (what rings a phone), fetch, the entity store, the
 * profile store, and the user_contacts fallback search. All numbers are fake.
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

import { CONTACT_PICK_V2 } from '../../../../config/flags/CONTACT_PICK_V2.js';
import {
  clearCache,
  getContacts,
} from '../../../../services/contacts/contact-relationship-service.js';
import { findContact } from '../call-on-behalf.js';
import { pickFirstOrDuplicate } from '../contact-pick.js';
import {
  BARE_DUPLICATE_MOMS,
  DEFAULT_PATH_FIXES,
  PROD_SHAPE_MOMS,
  SAME_NUMBER_TWICE,
  SCENARIOS,
  THREE_MOMS,
  TWO_JOHN_SMITHS,
} from './contact-pick.fixtures.js';
import { liveCall, rings, seed, stubCallEnv, USER } from './contact-pick.harness.js';

const fetchSpy = vi.fn(async () => new Response('{}'));

beforeEach(() => {
  clearCache();
  stubCallEnv();
  vi.stubEnv('CONTACT_PICK_V2', '');
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearCache();
});

describe('CONTACT_PICK_V2 off: main, row for row, plus the duplicate-row rescue', () => {
  it('ships off', () => {
    expect(CONTACT_PICK_V2.default).toBe('off');
  });

  for (const scenario of SCENARIOS) {
    it(scenario.title, async () => {
      await seed(scenario.contacts);
      for (const [said, main] of scenario.rows) {
        const key = `${scenario.title}|${said}`;
        const expected = key in DEFAULT_PATH_FIXES ? DEFAULT_PATH_FIXES[key] : main;
        // eslint-disable-next-line no-await-in-loop -- one probe at a time, like a caller
        expect(await rings(said), `"${said}"`).toBe(expected);
      }
    });
  }
});

describe('the duplicate-row rescue', () => {
  const JOHN_ASK =
    'Nothing was dialed: more than one contact is named John Smith. Ask the caller: "Which John Smith: the plumber, ending 0701, or the old coworker?"';

  it('rescues only one number, from rows plausibly one person', () => {
    const phoned = {
      name: 'mom',
      phone: '8015550163',
      notes: "User's mom",
      relationship: 'family',
    };
    // Pre-state: main's rule (results[0] if it has a number, else nothing) finds no one here
    const mainRule = (rows: Array<{ name: string; phone?: string }>) =>
      rows[0]?.phone ? rows[0] : null;
    expect(mainRule([{ name: 'Mom' }, phoned])).toBeNull();
    // No notes and no relationship ("other" is the store default): one person
    expect(pickFirstOrDuplicate([{ name: 'Mom', relationship: 'other' }, phoned])).toEqual({
      contact: phoned,
    });
    // Same relationship, notes naming the same owner relation ("mother" / "User's mom")
    const mother = { name: 'Mom', notes: 'mother', relationship: 'family' };
    expect(pickFirstOrDuplicate([mother, phoned])).toEqual({ contact: phoned });
    // Same notes but another relationship, or other notes: a question, never a dial
    expect(pickFirstOrDuplicate([{ ...mother, relationship: 'friend' }, phoned])).toMatchObject({
      choices: [phoned],
    });
    expect(pickFirstOrDuplicate([{ name: 'Mom', relationship: 'family' }, phoned])).toHaveProperty(
      'ask'
    );
    expect(pickFirstOrDuplicate([{ name: 'Mom' }, { name: 'Grandma', phone: '1' }])).toBeNull();
    expect(pickFirstOrDuplicate([{ name: 'Grandma', phone: '1' }, phoned])).toEqual({
      contact: { name: 'Grandma', phone: '1' },
    });
    expect(pickFirstOrDuplicate([])).toBeNull();
  });

  it('two John Smiths ask "Which John Smith: the plumber, ending 0701, or the old coworker?"', async () => {
    await seed(TWO_JOHN_SMITHS);
    expect(await rings('John Smith')).toBe('ASK');
    const out = await liveCall().call({ contactQuery: 'John Smith', purpose: 'say hi' }, 'c1');
    expect(out).toBe(JOHN_ASK);
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
  });

  it('a phoneless Mom with no notes or relationship is rescued; so is the prod shape', async () => {
    for (const rows of [BARE_DUPLICATE_MOMS, PROD_SHAPE_MOMS]) {
      clearCache();
      // eslint-disable-next-line no-await-in-loop -- one list at a time
      await seed(rows);
      // eslint-disable-next-line no-await-in-loop -- one list at a time
      expect(await rings('mom')).toBe('Mom|8015550163');
    }
  });

  it('three Moms with two numbers ask; the same number stored twice is one', async () => {
    await seed(THREE_MOMS);
    const found = await findContact('mom', USER);
    expect(found && 'ask' in found && found.ask).toContain(
      "Which Mom: the User's mom, ending 0604, the User's mom, ending 0605, or the one with no number?"
    );
    clearCache();
    await seed(SAME_NUMBER_TWICE);
    expect(await rings('mom')).toBe('Mom|8015550163');
  });

  it('the read-back and the dial use the rescued Mom and her number', async () => {
    await seed(PROD_SHAPE_MOMS);
    const call = liveCall();
    const preview = await call.call({ contactQuery: 'mom', purpose: 'say hi' }, 'c1');
    expect(preview).toContain('NOT SENT YET');
    expect(preview).toContain('Mom at 801-555-0163');
    call.caller('Yes, call her.');
    expect(await call.call({ contactQuery: 'mom', purpose: 'say hi' }, 'c2')).toContain(
      'calling Mom'
    );
    expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550163');
  });

  it('flipping CONTACT_PICK_V2 on changes "my mom" (so the default above is really off)', async () => {
    await seed(PROD_SHAPE_MOMS);
    expect(await rings('my mom')).toBeNull();
    vi.stubEnv('CONTACT_PICK_V2', 'on');
    expect(await rings('my mom')).toBe('Mom|8015550163');
  });
});

describe('saving a number given during the call, as before', () => {
  it('"my dad" is saved as "Dad", as main does', async () => {
    const call = liveCall();
    const ask = { contactQuery: 'my dad', phoneNumber: '(801) 555-0142', purpose: 'say hi' };
    await call.call(ask, 'c1');
    call.caller('Yes.');
    expect(await call.call(ask, 'c2')).toContain('calling my dad');
    await vi.waitFor(async () => expect(await getContacts(USER)).toHaveLength(1));
    expect((await getContacts(USER))[0]).toMatchObject({ name: 'Dad', notes: "User's dad" });
  });
});
