/**
 * "How's the dentist thing?" finds the call Ferni placed about it
 * (CALL_STATUS_BY_PURPOSE, services/outreach/call-purpose.ts), and never as a
 * call to whoever the words name: "did you call Jessica?" is "not yet" first,
 * then the clinic call that mentions her (verifier held-out set, #3159). Run through the
 * real tool path: the telephony domain in a ToolRegistry, the real callStatus,
 * the real records reader and recall adapter. Mocked only at the edges:
 * Firestore (per-uid documents) and the contact store. Synthetic fixtures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const fs = vi.hoisted(() => ({ users: {} as Record<string, Record<string, Doc[]>> }));

vi.mock('../../../../services/superhuman/firestore-utils.js', () => {
  const query = (docs: Doc[]): unknown => ({
    where: () => query(docs),
    get: async () => ({ docs: docs.map((d) => ({ id: String(d.callId), data: () => d })) }),
  });
  const db = {
    collection: () => ({
      doc: (uid: string) => ({ collection: (sub: string) => query(fs.users[uid]?.[sub] ?? []) }),
    }),
  };
  return { getFirestoreDb: () => db };
});
const CONTACTS = [
  { id: 'c-kit', name: 'Kit', phone: '(555) 555-0109', relationship: 'friend' },
  { id: 'c-jordan', name: 'Jordan', relationship: 'friend' }, // saved with no number
];
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async (_uid: string, q: string) =>
    CONTACTS.filter((c) => c.name.toLowerCase() === q.toLowerCase())
  ),
  getContacts: vi.fn(async () => CONTACTS),
  upsertContact: vi.fn(async () => undefined),
  default: {}, // the contacts index (callStatus's contact check) imports it
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

import { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { getTelephonyToolDefinitions } from '../index.js';
import { setCallRecallPort } from '../call-status-tool.js';
import { installCallRecallPort } from '../../../../services/outreach/call-recall.js';
import { purposeWords } from '../../../../services/outreach/call-purpose.js';
import { getHonestyInjection } from '../../../../intelligence/context-builders/safety/honesty-guardrail.js';

const OWNER = 'u7Qm2Zp9LkX4vN1sB8cRw3Ty'; // synthetic
const ASKED = Date.parse('2026-10-29T18:00:00Z');

const result = (id: string, at: string, request: Doc, summary = 'All set.'): Doc => ({
  callId: id,
  capturedAt: at,
  request,
  outcome: { status: 'completed', transcriptSummary: summary },
});
/** A completed call to a place: who, why, and when ("2026-10-28T15"), synthetic 555 numbers. */
const to = (place: string, purpose: string, hour: string, more: Doc = {}): Doc =>
  result(`call_${place}_${hour}`, `${hour}:00:00.000Z`, {
    contactQuery: place,
    contactName: place,
    purpose,
    ...more,
  });
const cleaning = result(
  'call_cleaning',
  '2026-10-29T15:00:00.000Z',
  {
    contactQuery: 'Bright Smile',
    contactName: 'Bright Smile',
    contactPhone: '+15555550101',
    purpose: 'book a cleaning at the dentist',
    objective: 'new_appointment',
  },
  'They booked a cleaning for Tuesday at 10.'
);
const xrays = to('Oak Street Clinic', 'ask the old dentist to send my x-rays over', '2026-10-28T15', { contactPhone: '+15555550103' }); // prettier-ignore
const tableHeld: Doc = {
  callId: 'held_table',
  kind: 'on_behalf',
  status: 'pending',
  scheduledFor: '2026-10-30T16:00:00.000Z',
  timezone: 'America/New_York',
  createdAt: '2026-10-29T17:00:00.000Z',
  request: {
    contactQuery: 'Luigi',
    resolvedContact: { name: 'Luigi Trattoria', phone: '+15555550102' },
    purpose: 'reserve a table for four at the restaurant on Friday',
    objective: 'reservation',
  },
};

function liveCall(owner: (() => boolean) | null = () => true) {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = { userId: OWNER, agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  outreachConfirmListeners(session, owner ?? undefined);
  return {
    tool: (): ToolShape => registry.get('callStatus')!.create(ctx),
    call: async (id: string, args: Record<string, unknown>, callId = 's1') =>
      String(
        await registry.get(id)!.create(ctx).execute(args, { ctx: { session }, toolCallId: callId })
      ),
  };
}
type ToolShape = {
  description: string;
  parameters: { shape: { contactQuery: { description?: string } } };
};
const ask = (contactQuery: string, owner?: (() => boolean) | null) =>
  liveCall(owner).call('callStatus', { contactQuery });
const none = (who: string) =>
  `No call to ${who} in the last 30 days: Ferni hasn't called them. Say "not yet" plainly; offer to call only if the caller wants it.`;

/** A call found by purpose: the person's own "not yet" verbatim, then the place, never "Ferni called". */
function placeReply(out: string, who: string, place: string, about: string): string {
  expect(out.startsWith(`${none(who)}\nSeparately, one call Ferni made mentions those words: `)).toBe(true); // prettier-ignore
  expect(out).toContain(`the call to ${place}, about "${about}".`);
  expect(out).toContain(`That call was to ${place}, not to ${who}.`);
  expect(out).not.toContain('Ferni called');
  return out;
}

describe('callStatus by purpose (CALL_STATUS_BY_PURPOSE)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ASKED);
    vi.stubEnv('CALL_HOURS_GUARD', 'off');
    vi.stubEnv('OUTBOUND_CONFIRM', '');
    fs.users = { [OWNER]: { on_behalf_calls: [cleaning], deferred_calls: [tableHeld] } };
    installCallRecallPort();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    setCallRecallPort(undefined);
  });

  it('1. a purpose word finds the result or the held request, told as the place called', async () => {
    expect(await ask('the dentist thing')).toBe(none('the dentist thing'));
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    const dentist = await ask('the dentist thing');
    placeReply(dentist, 'the dentist thing', 'Bright Smile', 'book a cleaning at the dentist');
    expect(dentist).toContain('It went through about 3 hours ago: they answered.');
    expect(dentist).toContain('They booked a cleaning for Tuesday at 10.');
    // Held for calling hours: found by purpose ("restaurant") and by objective ("reservation").
    const about = 'reserve a table for four at the restaurant on Friday';
    for (const q of ['did the restaurant get back', 'what happened with the reservation'])
      expect(placeReply(await ask(q), q, 'Luigi Trattoria', about)).toContain(
        "It hasn't happened yet: it is set for "
      );
  });

  it('2. person words are unchanged and win over purpose words', async () => {
    const leeOlder = to('Dr. Lee', 'confirm the time', '2026-10-27T15', { contactQuery: 'my dentist', contactPhone: '+15555550104' }); // prettier-ignore
    fs.users[OWNER]!.on_behalf_calls = [cleaning, leeOlder];
    const off = await ask('dentist');
    expect(off).toMatch(/^Ferni called Dr\. Lee 2 days ago/);
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    // The newer cleaning call fits the purpose, but the person match answers, as before.
    expect(await ask('dentist')).toBe(off);
    expect(await ask('Bright Smile')).toMatch(/^Ferni called Bright Smile/);
  });

  it('3. filler never matches alone, whole words only, and "ring" is a purpose word', async () => {
    const about = 'call the plumber about that thing, it is the stuff about the accident';
    const filler = to('Ace', about, '2026-10-29T16');
    const ring = to('Gold Jewelers', 'resize the ring', '2026-10-28T16');
    fs.users[OWNER] = { on_behalf_calls: [filler, ring] };
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    // The record is findable by its real words, so the misses below are the matcher's doing.
    placeReply(await ask('the plumber'), 'the plumber', 'Ace', about);
    placeReply(await ask('the accident'), 'the accident', 'Ace', about);
    placeReply(await ask('the ring'), 'the ring', 'Gold Jewelers', 'resize the ring');
    for (const word of ['thing', 'call', 'the', 'that', 'stuff', 'it', 'update', 'that thing'])
      expect(await ask(word)).toBe(none(word));
    expect(await ask('dent')).toBe(none('dent'));
    expect(purposeWords('how is the dentist thing going?')).toEqual(['dentist']);
    expect(purposeWords('the call, that stuff, it, an update')).toEqual([]);
  });

  it('4. calls to two places that fit: both named with what each was about, asked which', async () => {
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    fs.users[OWNER] = { on_behalf_calls: [cleaning] };
    placeReply(await ask('the dentist'), 'the dentist', 'Bright Smile', 'book a cleaning at the dentist'); // prettier-ignore
    fs.users[OWNER] = { on_behalf_calls: [cleaning, xrays] };
    const which = await ask('the dentist');
    expect(which).toBe(
      `${none('the dentist')}\nSeparately, calls Ferni made to other places mention those words: ` +
        'to Bright Smile (about "book a cleaning at the dentist") or Oak Street Clinic (about ' +
        '"ask the old dentist to send my x-rays over"). None of them was a call to the dentist.\n' +
        "If the caller asked whether you called, reached or heard from the dentist: you haven't, " +
        "so say that first. If they meant one of those calls, ask which one; don't guess, and " +
        "don't offer a new call."
    );
    // Two calls to the same place are one errand: the newest answers, both purposes told.
    const again = result('call_cleaning_2', '2026-10-29T17:00:00.000Z', {
      ...(cleaning.request as Doc),
      purpose: 'move the dentist cleaning to Wednesday',
    });
    fs.users[OWNER] = { on_behalf_calls: [cleaning, again] };
    const both = 'book a cleaning at the dentist"; and "move the dentist cleaning to Wednesday';
    expect(placeReply(await ask('the dentist'), 'the dentist', 'Bright Smile', both)).toContain(
      'It went through about an hour ago'
    );
  });

  it('5. flag off (unset or off): replies and the tool definition are as on main', async () => {
    const mainDescription =
      'Check whether you already called someone for the caller and how it went: not yet ' +
      '(waiting for their yes, or set for a later hour), under way, done (answered, ' +
      'voicemail, no answer, and what they said), or failed. Use it whenever the caller ' +
      'asks "did you call my dad?", "how did the call go?" or "what did she say?". Read-only: ' +
      'it never calls anyone. Never use callOnBehalf to answer such a question.';
    const mainParam = 'Who: a name or relationship, e.g. "dad" or "Sam"';
    fs.users[OWNER]!.on_behalf_calls = [cleaning, PEOPLE_CALLS[0]!];
    for (const value of [undefined, 'off']) {
      if (value) vi.stubEnv('CALL_STATUS_BY_PURPOSE', value);
      const tool = liveCall().tool();
      expect(tool.description).toBe(mainDescription);
      expect(tool.parameters.shape.contactQuery.description).toBe(mainParam);
      for (const q of ['the dentist thing', 'the reservation', 'my girlfriend', 'Jordan'])
        expect(await ask(q)).toBe(none(q));
      expect(await ask('Bright Smile')).toMatch(/^Ferni called Bright Smile/);
    }
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    const on = liveCall().tool();
    expect(on.description.startsWith(mainDescription)).toBe(true);
    expect(on.description).toContain("how's the dentist thing?");
  });

  it('6. the owner gate and the honesty note still apply', async () => {
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    const deny = /^Nothing to report: only the account owner/;
    expect(await ask('the dentist thing')).toContain('the call to Bright Smile');
    expect(await ask('the dentist thing', () => false)).toMatch(deny);
    expect(await ask('the dentist thing', null)).toMatch(deny);
    const note = getHonestyInjection('fresh-session', 'Did you call the dentist?') ?? '';
    expect(note).toContain('Call callStatus for');
    expect(note).not.toMatch(/No, I haven't called/);
  });

  // Verifier held-out failures (11 of 50 at 2d7bfe1d4) and fresh ones: a person only mentioned
  // in a call to a place. [asked, place, purpose]; each purpose names who is asked about.
  const PEOPLE: [string, string, string][] = [
    ['my girlfriend', 'Spotless Cleaners', "pick up my girlfriend's dry cleaning"],
    ['did you call my grandson', 'Sweet Bakery', "order a cake for my grandson's party"],
    ['my fiancee', 'Gold Jewelers', "resize my fiancee's ring"],
    ['my stepson', 'Lincoln Elementary', "ask about my stepson's bus pickup"],
    ['did you call my doctor', 'Corner Pharmacy', 'pick up what my doctor prescribed'],
    ['my parents', 'Party Palace', "rent tables for my parents' anniversary and Maria's shower"],
    ['Maria', 'Party Palace', "rent tables for my parents' anniversary and Maria's shower"],
    ['did you call Jessica', 'Sunrise Clinic', 'ask for a referral for Jessica'],
    ['Jessica', 'Sunrise Clinic', 'ask for a referral for Jessica'],
    ['Biscuit', 'City Vet', "reschedule Biscuit's checkup"],
    ['did you reach my nephew', 'Riverside Pool', 'sign my nephew up for swim lessons'],
    ['have you talked to Priya', 'Hilltop Florist', 'send flowers to Priya for her recital'],
    ['did my boss hear from you', 'Copy Corner', "print my boss's slides for Monday"],
  ];
  const PEOPLE_CALLS = PEOPLE.map(([, place, about], i) =>
    to(place, about, `2026-10-2${i % 9}T15`)
  );

  it('7. a person only mentioned in a call: "not yet" first, then that call as the place', async () => {
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    for (const [who, place, about] of PEOPLE) {
      fs.users[OWNER] = { on_behalf_calls: PEOPLE_CALLS.filter((d) => (d.request as Doc).purpose === about) }; // prettier-ignore
      placeReply(await ask(who), who, place, about);
    }
    // Saved contacts are people, with or without a number: plain "not yet", nothing else.
    const party = 'rent tables for the restaurant party, Jordan and Kit helping';
    const jordan = to('Party Palace', party, '2026-10-28T15');
    fs.users[OWNER] = { on_behalf_calls: [jordan], deferred_calls: [{ ...tableHeld, kind: 'proactive' }] }; // prettier-ignore
    expect(await ask('Jordan')).toBe(none('Jordan'));
    expect(await ask('Kit')).toBe(none('Kit'));
    // A held proactive call (Ferni calling the owner) is never a second place to ask about.
    placeReply(await ask('the tables'), 'the tables', 'Party Palace', party);
    placeReply(await ask('the restaurant'), 'the restaurant', 'Party Palace', party);
  });

  it('a new call is not held up by another call whose purpose names that person', async () => {
    const aboutKit = to('Mom', 'tell her Kit says happy birthday', '2026-10-29T17', { contactPhone: '+15555550105' }); // prettier-ignore
    fs.users[OWNER] = { on_behalf_calls: [aboutKit] };
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    const args = { contactQuery: 'Kit', purpose: 'check in', recordingConsent: true };
    expect(await liveCall().call('callOnBehalf', args, 'c1')).toContain('NOT SENT YET');
  });
});
