/**
 * "How's the dentist thing?" finds the call Ferni placed about it
 * (CALL_STATUS_BY_PURPOSE, services/outreach/call-purpose.ts). Run through the
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
const CONTACTS = [{ id: 'c-kit', name: 'Kit', phone: '(555) 555-0109', relationship: 'friend' }];
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async (_uid: string, q: string) =>
    CONTACTS.filter((c) => c.name.toLowerCase() === q.toLowerCase())
  ),
  getContacts: vi.fn(async () => CONTACTS),
  upsertContact: vi.fn(async () => undefined),
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
const xrays = result('call_xrays', '2026-10-28T15:00:00.000Z', {
  contactQuery: 'Oak Street Clinic',
  contactName: 'Oak Street Clinic',
  contactPhone: '+15555550103',
  purpose: 'ask the old dentist to send my x-rays over',
  objective: 'inquiry',
});
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

  it('1. a purpose word finds the on_behalf_calls result and the held deferred_calls request', async () => {
    expect(await ask('the dentist thing')).toBe(none('the dentist thing'));
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    const dentist = await ask('the dentist thing');
    expect(dentist).toMatch(/^Ferni called Bright Smile about 3 hours ago, and they answered\./);
    expect(dentist).toContain('They booked a cleaning for Tuesday at 10.');
    // Held for calling hours: found by purpose ("restaurant") and by objective ("reservation").
    const held = /^Not called yet: the call to Luigi Trattoria is set for /;
    expect(await ask('did the restaurant get back')).toMatch(held);
    expect(await ask('what happened with the reservation')).toMatch(held);
  });

  it('2. person words are unchanged and win over purpose words', async () => {
    const leeOlder = result('call_lee', '2026-10-27T15:00:00.000Z', {
      contactQuery: 'my dentist',
      contactName: 'Dr. Lee',
      contactPhone: '+15555550104',
      purpose: 'confirm the time',
    });
    fs.users[OWNER]!.on_behalf_calls = [cleaning, leeOlder];
    const off = await ask('dentist');
    expect(off).toMatch(/^Ferni called Dr\. Lee 2 days ago/);
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    // The newer cleaning call fits the purpose, but the person match answers, as before.
    expect(await ask('dentist')).toBe(off);
    expect(await ask('Bright Smile')).toMatch(/^Ferni called Bright Smile/);
  });

  it('3. filler never matches alone, and only whole words match ("dent" is not "accident")', async () => {
    const filler = result('call_filler', '2026-10-29T16:00:00.000Z', {
      contactQuery: 'Ace',
      contactName: 'Ace',
      purpose:
        'call the plumber and get an update on that thing, it is the stuff about the accident',
    });
    fs.users[OWNER] = { on_behalf_calls: [filler] };
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    // The record is findable by its real words, so the misses below are the matcher's doing.
    expect(await ask('the plumber')).toMatch(/^Ferni called Ace/);
    expect(await ask('the accident')).toMatch(/^Ferni called Ace/);
    for (const word of ['thing', 'call', 'the', 'that', 'stuff', 'it', 'update', 'that thing'])
      expect(await ask(word)).toBe(none(word));
    expect(await ask('dent')).toBe(none('dent'));
    expect(purposeWords('how is the dentist thing going?')).toEqual(['dentist']);
    expect(purposeWords('the call, that stuff, it, an update')).toEqual([]);
  });

  it('4. calls to two people that fit the purpose: both named and the caller asked which', async () => {
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    fs.users[OWNER] = { on_behalf_calls: [cleaning] };
    expect(await ask('the dentist')).toMatch(/^Ferni called Bright Smile/);
    fs.users[OWNER] = { on_behalf_calls: [cleaning, xrays] };
    expect(await ask('the dentist')).toBe(
      'More than one call Ferni made fits that: to Bright Smile or Oak Street Clinic. Ask the ' +
        "caller which one they mean; don't guess, and don't offer a new call."
    );
    // Two calls to the same place are one errand: the newest answers.
    const again = result('call_cleaning_2', '2026-10-29T17:00:00.000Z', {
      ...(cleaning.request as Doc),
      purpose: 'move the dentist cleaning to Wednesday',
    });
    fs.users[OWNER] = { on_behalf_calls: [cleaning, again] };
    expect(await ask('the dentist')).toMatch(/^Ferni called Bright Smile about an hour ago/);
  });

  it('5. flag off (unset or off): replies and the tool definition are as on main', async () => {
    const mainDescription =
      'Check whether you already called someone for the caller and how it went: not yet ' +
      '(waiting for their yes, or set for a later hour), under way, done (answered, ' +
      'voicemail, no answer, and what they said), or failed. Use it whenever the caller ' +
      'asks "did you call my dad?", "how did the call go?" or "what did she say?". Read-only: ' +
      'it never calls anyone. Never use callOnBehalf to answer such a question.';
    const mainParam = 'Who: a name or relationship, e.g. "dad" or "Sam"';
    for (const value of [undefined, 'off']) {
      if (value) vi.stubEnv('CALL_STATUS_BY_PURPOSE', value);
      const tool = liveCall().tool();
      expect(tool.description).toBe(mainDescription);
      expect(tool.parameters.shape.contactQuery.description).toBe(mainParam);
      expect(await ask('the dentist thing')).toBe(none('the dentist thing'));
      expect(await ask('the reservation')).toBe(none('the reservation'));
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
    expect(await ask('the dentist thing')).toMatch(/^Ferni called Bright Smile/);
    expect(await ask('the dentist thing', () => false)).toMatch(deny);
    expect(await ask('the dentist thing', null)).toMatch(deny);
    const note = getHonestyInjection('fresh-session', 'Did you call the dentist?') ?? '';
    expect(note).toContain('Call callStatus for');
    expect(note).not.toMatch(/No, I haven't called/);
  });

  it('a person with no call of their own is "not yet", never a call whose purpose names them', async () => {
    const refill = result('call_refill', '2026-10-29T16:00:00.000Z', {
      contactQuery: 'Corner Pharmacy',
      contactName: 'Corner Pharmacy',
      purpose: "ask about dad's prescription refill, and Kit's too",
    });
    const proactive: Doc = { ...tableHeld, callId: 'held_proactive', kind: 'proactive' };
    const blueDoor = result('call_blue', '2026-10-28T16:00:00.000Z', {
      contactQuery: 'Blue Door',
      contactName: 'Blue Door',
      contactPhone: '+15555550106',
      purpose: 'ask the restaurant about a private room',
    });
    fs.users[OWNER] = { on_behalf_calls: [refill, blueDoor], deferred_calls: [proactive] };
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    expect(await ask('the prescription')).toMatch(/^Ferni called Corner Pharmacy/);
    expect(await ask('my dad')).toBe(none('my dad'));
    // Kit is a saved contact: named, so a person, even though a purpose mentions Kit.
    expect(await ask('Kit')).toBe(none('Kit'));
    // A held proactive call (Ferni calling the owner) is not a second place to ask about.
    expect(await ask('the restaurant')).toMatch(/^Ferni called Blue Door/);
  });

  it('a new call is not held up by another call whose purpose names that person', async () => {
    const aboutKit = result('call_mom', '2026-10-29T17:30:00.000Z', {
      contactQuery: 'Mom',
      contactName: 'Mom',
      contactPhone: '+15555550105',
      purpose: 'tell her Kit says happy birthday',
    });
    fs.users[OWNER] = { on_behalf_calls: [aboutKit] };
    vi.stubEnv('CALL_STATUS_BY_PURPOSE', 'on');
    const args = { contactQuery: 'Kit', purpose: 'check in', recordingConsent: true };
    expect(await liveCall().call('callOnBehalf', args, 'c1')).toContain('NOT SENT YET');
  });
});
