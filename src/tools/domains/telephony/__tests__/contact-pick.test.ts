/**
 * "call my mom" rings the saved contact that HAS a number (phone-calls audit 2026-10-25, rows 1-2).
 *
 * Before: two "Mom" rows, the older one with no number stored first. The lookup took
 * results[0], saw no phone and said "no number saved", every time; "my mom" never matched at
 * all (no "my " strip). The read-back used the same lookup.
 *
 * Drives the real contact store (in memory: Firestore unavailable), the real lookup, and the
 * real gated tool (read-back, yes, dial). Mocked only at the edges: the LiveKit SDK (what rings
 * a phone), fetch, the entity store and the profile store. All numbers are fake.
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
  searchContacts,
  upsertContact,
} from '../../../../services/contacts/contact-relationship-service.js';
import { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { resolveContact } from '../call-on-behalf.js';
import { normalizeContactQuery, pickContact, roleOf } from '../contact-pick.js';
import { getTelephonyToolDefinitions } from '../index.js';

const USER = 'user-pick';
const fetchSpy = vi.fn(async () => new Response('{}'));

/** The owner's real shape: an older phoneless "Mom" stored first, a newer one with the number. */
async function seedTwoMoms(): Promise<void> {
  vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));
  await upsertContact(USER, { name: 'Mom', contactId: 'mom-jan', relationship: 'family' });
  vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  await upsertContact(USER, {
    name: 'Mom',
    contactId: 'phone_8015550163',
    phone: '8015550163',
    relationship: 'family',
    notes: "User's mom",
  });
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
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
  vi.useFakeTimers({ toFake: ['Date'] });
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
    CONTACT_PICK_V2: '',
  }))
    vi.stubEnv(k, v);
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearCache();
});

describe('the contact "call my mom" rings', () => {
  it('skips a phoneless older Mom and resolves to the Mom with a number', async () => {
    await seedTwoMoms();
    // Pre-state: the store's own search lists the phoneless row first (the prod bug's shape)
    const raw = await searchContacts(USER, 'mom');
    expect(raw.map((c) => c.phone ?? null)).toEqual([null, '8015550163']);

    for (const flag of ['off', 'on']) {
      vi.stubEnv('CONTACT_PICK_V2', flag);
      for (const query of ['my mom', 'mom', 'My Mum', 'mother']) {
        const contact = await resolveContact(query, USER);
        expect(contact, `${query} (CONTACT_PICK_V2=${flag})`).toMatchObject({
          name: 'Mom',
          phone: '8015550163',
        });
      }
    }
  });

  it('"my dad" with no Dad saved asks for the number instead of ringing Mom', async () => {
    await seedTwoMoms();
    // Pre-state: the store's family-alias search hands back Mom rows for "dad"
    expect((await searchContacts(USER, 'dad')).some((c) => c.phone === '8015550163')).toBe(true);

    expect(await resolveContact('my dad', USER)).toBeNull();
    const out = await liveCall().call({ contactQuery: 'my dad', purpose: 'say hi' }, 'c1');
    expect(out).toContain("I don't have a number for my dad");
    expect(sip.createSipParticipant).not.toHaveBeenCalled();
  });

  it('the read-back and the dial use the same contact and number', async () => {
    await seedTwoMoms();
    const call = liveCall();
    const preview = await call.call({ contactQuery: 'my mom', purpose: 'say hi' }, 'c1');
    expect(preview).toContain('NOT SENT YET');
    expect(preview).toContain('Mom at 801-555-0163');
    call.caller('Yes, call her.');
    const placed = await call.call({ contactQuery: 'my mom', purpose: 'say hi' }, 'c2');
    expect(placed).toContain('calling Mom');
    expect(sip.createSipParticipant).toHaveBeenCalledTimes(1);
    expect(sip.createSipParticipant.mock.calls[0][1]).toBe('+18015550163');
  });
});

describe('a number given during the call', () => {
  it('is saved under the relationship asked for ("Dad"), and found next time', async () => {
    expect(await getContacts(USER)).toEqual([]);
    const call = liveCall();
    const ask = { contactQuery: 'my dad', phoneNumber: '(801) 555-0142', purpose: 'say hi' };
    expect(await call.call(ask, 'c1')).toContain('NOT SENT YET');
    call.caller('Yes.');
    expect(await call.call(ask, 'c2')).toContain('calling my dad');
    await vi.waitFor(async () => expect(await getContacts(USER)).toHaveLength(1));

    const [saved] = await getContacts(USER);
    expect(saved).toMatchObject({ name: 'Dad', relationship: 'family', notes: "User's dad" });
    expect((await getContacts(USER)).some((c) => c.name === 'Contact')).toBe(false);
    // The next "call my dad" reads back the saved number instead of asking for it
    const next = await liveCall().call({ contactQuery: 'my dad', purpose: 'say hi' }, 'c3');
    expect(next).toContain('Dad at 801-555-0142');
  });

  it('"my father" and "the mum" are saved under the role name, not the words said', async () => {
    for (const [contactQuery, name] of [
      ['my father', 'Dad'],
      ['the mum', 'Mom'],
    ]) {
      clearCache();
      const call = liveCall();
      const ask = { contactQuery, phoneNumber: '(801) 555-0177', purpose: 'say hi' };
      await call.call(ask, 'c1');
      call.caller('Yes.');
      await call.call(ask, 'c2');
      await vi.waitFor(async () => expect(await getContacts(USER)).toHaveLength(1));
      expect((await getContacts(USER))[0].name).toBe(name);
    }
  });
});

describe('pickContact', () => {
  const at = (iso: string) => new Date(iso);
  const older = { name: 'Mom', phone: '8015550101', updatedAt: at('2026-03-01T00:00:00Z') };
  const newer = { name: 'Mom', phone: '8015550102', updatedAt: at('2026-10-01T00:00:00Z') };

  it('normalises the query and maps role words to the saved name', () => {
    expect(normalizeContactQuery('  My Mom ')).toBe('mom');
    expect(normalizeContactQuery('our sister')).toBe('sister');
    expect(roleOf('the mum')).toBe('Mom');
    expect(roleOf('papa')).toBe('Dad');
    expect(roleOf('sis')).toBe('Sister');
    expect(roleOf('bro')).toBe('Brother');
    expect(roleOf('Dr. Lee')).toBeUndefined();
  });

  it('CONTACT_PICK_V2 off keeps stored order among rows with numbers; on prefers the newest exact match', () => {
    const loose = { name: 'Mom Smith', phone: '8015550103', updatedAt: at('2026-10-20T00:00:00Z') };
    vi.stubEnv('CONTACT_PICK_V2', 'off');
    expect(pickContact([older, loose, newer], 'my mom')).toBe(older);
    vi.stubEnv('CONTACT_PICK_V2', 'on');
    expect(pickContact([older, loose, newer], 'my mom')).toBe(newer);
  });

  it('never picks a row of another role, or one with a blank number', () => {
    const sister = { name: 'Ann', phone: '8015550104', notes: "User's sister" };
    expect(pickContact([sister], 'mom')).toBeNull();
    expect(pickContact([{ name: 'Mom', phone: '  ' }], 'mom')).toBeNull();
    expect(pickContact([sister], 'my sis')).toBe(sister);
  });
});
