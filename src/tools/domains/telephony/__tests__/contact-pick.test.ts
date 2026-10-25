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
import { pickFirstOrDuplicate } from '../contact-pick.js';
import { DEFAULT_PATH_FIXES, SCENARIOS } from './contact-pick.fixtures.js';
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
  const TWO_MOMS = SCENARIOS.find((s) => s.title.startsWith('the prod bug'))!;

  it('a phoneless first "Mom" yields to the same-named row with a number, and only that', () => {
    const phoneless = { name: 'Mom' };
    const phoned = { name: 'mom', phone: '8015550163' };
    const other = { name: 'Grandma', phone: '8015550105' };
    // Pre-state: main's rule (results[0] if it has a number, else nothing) finds no one here
    const mainRule = (rows: Array<{ name: string; phone?: string }>) =>
      rows[0]?.phone ? rows[0] : null;
    expect(mainRule([phoneless, phoned])).toBeNull();
    expect(pickFirstOrDuplicate([phoneless, phoned])).toBe(phoned);
    expect(pickFirstOrDuplicate([phoneless, other])).toBeNull();
    expect(pickFirstOrDuplicate([other, phoned])).toBe(other);
    expect(pickFirstOrDuplicate([])).toBeNull();
  });

  it('the read-back and the dial use the rescued Mom and her number', async () => {
    await seed(TWO_MOMS.contacts);
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
    await seed(TWO_MOMS.contacts);
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
