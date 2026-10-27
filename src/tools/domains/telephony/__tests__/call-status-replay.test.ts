/**
 * Replays of the owner's own calls through the real tool path: the telephony
 * domain registered into a ToolRegistry (the gate applied, as the live agent
 * gets it), the real callStatus and callOnBehalf, the real records reader.
 * Mocked only at the edges: Firestore (per-uid documents), the contact store.
 *
 * - 2026-10-26 21:46 UTC, "I don't know. Did you call my dad?": Ferni ran
 *   callOnBehalf and read back a fresh call (Doug, ***6112, "check in on him
 *   after his stroke"). It had read that call back at 18:48 and never got a yes.
 * - 2026-10-25 15:54 and 2026-10-26 18:46, "Did you call my mom?": her call
 *   had been answered at about 15:01 on the 25th (onbehalf_1792940418192_6vrey,
 *   marked delivered at context build), and Ferni said it hadn't placed it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const fs = vi.hoisted(() => ({ users: {} as Record<string, Record<string, Doc[]>> }));

vi.mock('../../../../services/superhuman/firestore-utils.js', () => {
  type Filter = [string, string, unknown];
  const keep = (d: Doc, [f, op, v]: Filter): boolean =>
    op === '==' ? d[f] === v : op === '>=' ? String(d[f] ?? '') >= String(v) : true;
  const query = (docs: Doc[], filters: Filter[]): unknown => ({
    where: (f: string, op: string, v: unknown) => query(docs, [...filters, [f, op, v]]),
    get: async () => ({
      docs: docs
        .filter((d) => filters.every((x) => keep(d, x)))
        .map((d, i) => ({ id: String(d.callId ?? `doc${i}`), data: () => d })),
    }),
  });
  const db = {
    collection: () => ({
      doc: (uid: string) => ({
        collection: (sub: string) => query(fs.users[uid]?.[sub] ?? [], []),
      }),
    }),
  };
  return { getFirestoreDb: () => db };
});
const CONTACTS = [
  { id: 'c-doug', name: 'Doug', phone: '(801) 661-6112', relationship: 'father' },
  { id: 'c-mom', name: 'Mom', phone: '(801) 555-3303', relationship: 'mother' },
];
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async (_uid: string, q: string) => {
    const w = q.toLowerCase().replace(/^my\s+/, '');
    const rel: Record<string, string> = { dad: 'father', mom: 'mother' };
    return CONTACTS.filter((c) => c.name.toLowerCase() === w || c.relationship === (rel[w] ?? w));
  }),
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
import { setConfirmThreadPort } from '../../communication/outreach/confirm-thread.js';
import { getTelephonyToolDefinitions } from '../index.js';
import { callStatusReply, setCallRecallPort } from '../call-status-tool.js';
import { installCallRecallPort } from '../../../../services/outreach/call-recall.js';
import { noteLiveSession } from '../../../registry/live-session.js';
import { LEAN_ALWAYS_ON_TOOLS } from '../../../../config/same-turn-tools-config.js';
import { callOutcomeUnheard } from '../../../../agents/personas/call-narration.js';
import { getHonestyInjection } from '../../../../intelligence/context-builders/safety/honesty-guardrail.js';
import { telephonyExecutor } from '../../../../agents/shared/tool-executors/telephony-executor.js';

const SETH = 'vdSfkCCXaiXpnVCvgKxHMYrNFr72';
const ASKED_DAD = Date.parse('2026-10-26T21:46:05Z');
// Seth's 21:46 callOnBehalf, as the model sent it (the number is the one he gave at 18:47).
const DAD_CALL = {
  contactQuery: 'Doug',
  phoneNumber: '801 661 6112',
  purpose: 'check in on him after his stroke',
  recordingConsent: true,
};
const DAD_REQUEST = { contactQuery: 'Doug', contactName: 'Doug', contactPhone: '+18016616112' };
const dadAnswered = {
  callId: 'call_dad_1850',
  capturedAt: '2026-10-26T18:50:00.000Z',
  request: DAD_REQUEST,
  outcome: { status: 'completed', transcriptSummary: "He's resting after the stroke and says hi." },
};
const momAnswered = {
  callId: 'onbehalf_1792940418192_6vrey',
  capturedAt: '2026-10-25T15:01:40.000Z',
  delivered: true,
  request: { contactQuery: 'Mom', contactName: 'Mom', contactPhone: '+18015553303' },
  outcome: { status: 'completed', message: 'She misses you and hopes to see you at church.' },
};
const dadHeld = {
  kind: 'on_behalf',
  status: 'pending',
  scheduledFor: '2026-10-27T15:00:00.000Z',
  timezone: 'America/Denver',
  createdAt: '2026-10-26T21:40:00.000Z',
  request: { contactQuery: 'dad', resolvedContact: { name: 'Doug', phone: '+18016616112' } },
};

/** A live call; `owner` is its speaker check (live-call-behaviors.ts), null when none ran. */
function liveCall(userId = SETH, owner: (() => boolean) | null = () => true) {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = { userId, agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session, owner ?? undefined);
  return {
    session,
    registry,
    call: async (id: string, args: Record<string, unknown>, callId: string) => {
      const out = await registry
        .get(id)!
        .create(ctx)
        .execute(args, { ctx: { session }, toolCallId: callId });
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

describe('"Did you call my dad?" (2026-10-26 21:46) and "my mom" (10-25, 10-26)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ASKED_DAD);
    vi.stubEnv('CALL_HOURS_GUARD', 'off');
    vi.stubEnv('OUTBOUND_CONFIRM', '');
    fs.users = {};
    installCallRecallPort(); // as live-call-behaviors.ts does on every call
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    setConfirmThreadPort(undefined);
    setCallRecallPort(undefined);
  });

  it('callStatus is registered in the always-available telephony domain and the lean always-on set', () => {
    const { registry } = liveCall();
    expect(registry.get('callStatus')?.domain).toBe('telephony');
    expect(LEAN_ALWAYS_ON_TOOLS.callStatus).toBe('telephony');
  });

  it('a completed dad call: status from callStatus, and callOnBehalf tells it instead of a new read-back', async () => {
    fs.users[SETH] = { on_behalf_calls: [dadAnswered] };
    const call = liveCall();
    call.caller("I don't know. Did you call my dad?");
    const status = await call.call('callStatus', { contactQuery: 'dad' }, 's1');
    expect(status).toMatch(/^Ferni called Doug about 3 hours ago, and they answered\./);
    expect(status).toContain("> He's resting after the stroke and says hi.");
    // The 21:46 turn exactly: the model reached for callOnBehalf.
    const out = await call.call('callOnBehalf', DAD_CALL, 'c1');
    expect(out).not.toContain('NOT SENT YET');
    expect(out).toMatch(
      /^Nothing new was read back\. Ferni called Doug about 3 hours ago, and they answered\./
    );
    // Told once: if he really wants another call, the next request reads it back.
    expect(await call.call('callOnBehalf', DAD_CALL, 'c2')).toContain('NOT SENT YET');
  });

  it('a dad call read back at 18:48 and never confirmed: "not yet, waiting for your yes"', async () => {
    const live = vi.fn(async () => [
      {
        text: 'Call Doug',
        createdAt: '2026-10-26T18:48:18.000Z',
        source: { store: 'outreach_confirm', ref: 'r1' },
        action: { tool: 'callOnBehalf', waitingOn: 'you' },
      },
    ]);
    setConfirmThreadPort({
      store: () => ({ live }) as never,
      zoneOf: async () => 'America/Denver',
    });
    const call = liveCall();
    const status = await call.call('callStatus', { contactQuery: 'dad' }, 's1');
    expect(status).toMatch(
      /^Not called: Ferni read back a call to Doug about 3 hours ago and never got the caller's yes/
    );
    const out = await call.call('callOnBehalf', DAD_CALL, 'c1');
    expect(out).toMatch(/^Nothing new was read back\. Not called:/);
    expect(live).toHaveBeenCalledWith(SETH);
  });

  it("a read-back still waiting on this call's yes is told by callStatus as waiting", async () => {
    const call = liveCall();
    expect(await call.call('callOnBehalf', DAD_CALL, 'c1')).toContain('NOT SENT YET');
    call.caller('Did you call my dad?');
    expect(await call.call('callStatus', { contactQuery: 'my dad' }, 's1')).toMatch(
      /^Not called: Ferni read back a call to Doug just now and never got the caller's yes/
    );
  });

  it('a dad call held for calling hours: set for 9 AM their time, no new read-back', async () => {
    fs.users[SETH] = { deferred_calls: [dadHeld] };
    const call = liveCall();
    expect(await call.call('callStatus', { contactQuery: 'dad' }, 's1')).toMatch(
      /^Not called yet: the call to Doug is set for tomorrow at 9:00\sAM their time/
    );
    expect(await call.call('callOnBehalf', DAD_CALL, 'c1')).toMatch(/already set for/);
  });

  it.each([
    ['2026-10-25T15:54:30Z', /^Ferni called Mom 53 minutes ago, and they answered\./],
    ['2026-10-26T18:46:30Z', /^Ferni called Mom yesterday, and they answered\./],
  ])('mom, answered and already "delivered", asked at %s: never denied', async (at, line) => {
    vi.setSystemTime(Date.parse(at));
    fs.users[SETH] = { on_behalf_calls: [momAnswered] };
    const status = await liveCall().call('callStatus', { contactQuery: 'mom' }, 's1');
    expect(status).toMatch(line);
    expect(status).toContain('> She misses you and hopes to see you at church.');
    expect(status).not.toMatch(/haven't|not yet/i);
  });

  it("another owner's calls are never read, and a 31-day-old call is not on record", async () => {
    fs.users[SETH] = { on_behalf_calls: [momAnswered] };
    expect(
      await liveCall('someone-else-uid').call('callStatus', { contactQuery: 'mom' }, 's1')
    ).toMatch(/^No call to mom in the last 30 days/);
    vi.setSystemTime(Date.parse('2026-11-25T16:00:00Z'));
    expect(await liveCall().call('callStatus', { contactQuery: 'mom' }, 's2')).toMatch(
      /^No call to mom/
    );
  });

  it('never for the callee on an onbehalf: session, nor with the kill switch off', async () => {
    fs.users[SETH] = { on_behalf_calls: [momAnswered] };
    const callee = 'onbehalf:onbehalf_1792940418192_6vrey';
    expect(await liveCall(callee).call('callStatus', { contactQuery: 'mom' }, 's1')).toMatch(
      /^Nothing to report/
    );
    vi.stubEnv('CALL_STATUS_RECALL', 'off');
    expect(await liveCall().call('callStatus', { contactQuery: 'mom' }, 's2')).toMatch(
      /can't check/
    );
    expect(await liveCall().call('callOnBehalf', { ...DAD_CALL }, 'c1')).toContain('NOT SENT YET');
  });

  it('call_history (FTIS) answers the status, not "voicemail isn\'t set up"', async () => {
    fs.users[SETH] = { on_behalf_calls: [momAnswered] };
    vi.setSystemTime(Date.parse('2026-10-26T18:46:30Z'));
    const { session } = liveCall();
    const release = noteLiveSession(session, 'session-seth');
    const ask = (sessionId?: string) =>
      telephonyExecutor.execute(
        'call_history',
        { contactQuery: 'mom' },
        { userId: SETH, sessionId }
      );
    expect(String(await ask('session-seth'))).toMatch(/^Ferni called Mom yesterday/);
    release();
    // No live call to prove the owner (chat, a job): fails closed.
    expect(String(await ask('session-seth'))).toMatch(/^Nothing to report/);
    expect(String(await ask(undefined))).toMatch(/^Nothing to report/);
  });

  it('with no records side installed (no live call in this process) it says it cannot check', async () => {
    fs.users[SETH] = { on_behalf_calls: [momAnswered] };
    setCallRecallPort(undefined);
    expect(await liveCall().call('callStatus', { contactQuery: 'mom' }, 's1')).toMatch(
      /can't check/
    );
    expect(await liveCall().call('callOnBehalf', DAD_CALL, 'c1')).toContain('NOT SENT YET');
  });

  it('fails closed: no session, a speaker who is not the owner, or one never checked', async () => {
    fs.users[SETH] = { on_behalf_calls: [momAnswered] };
    vi.setSystemTime(Date.parse('2026-10-26T18:46:30Z'));
    const deny = /^Nothing to report: only the account owner/;
    expect(await callStatusReply(SETH, 'mom')).toMatch(deny);
    expect(
      await liveCall(SETH, () => false).call('callStatus', { contactQuery: 'mom' }, 's1')
    ).toMatch(deny);
    expect(await liveCall(SETH, null).call('callStatus', { contactQuery: 'mom' }, 's2')).toMatch(
      deny
    );
    expect(await liveCall(SETH).call('callStatus', { contactQuery: 'mom' }, 's3')).toMatch(
      /^Ferni called Mom/
    );
    // callOnBehalf's status before a read-back follows the same rule: an unproven speaker hears none.
    fs.users[SETH] = { on_behalf_calls: [dadAnswered] };
    vi.setSystemTime(ASKED_DAD);
    expect(await liveCall(SETH, null).call('callOnBehalf', DAD_CALL, 'c1')).toContain(
      'NOT SENT YET'
    );
  });

  it('the honesty note sends a call question to callStatus instead of "no, I haven\'t"', () => {
    const note = getHonestyInjection('fresh-session', 'Did you call my mom?') ?? '';
    expect(note).toContain('Call callStatus for mom');
    expect(note).not.toMatch(/No, I haven't called/);
    vi.stubEnv('CALL_STATUS_RECALL', 'off');
    const off = getHonestyInjection('fresh-session', 'Did you call my mom?') ?? '';
    expect(off).toContain('HONESTY CHECK');
    expect(off).not.toContain('callStatus');
  });

  it('after callStatus found the result, telling how the call went is not dropped', () => {
    const items = [
      { type: 'message', role: 'user', content: ['Did you call my mom?'] },
      {
        type: 'function_call_output',
        name: 'callStatus',
        output: 'Ferni called Mom yesterday, and they answered.',
      },
    ];
    expect(callOutcomeUnheard({ items }, false)).toBeNull();
    expect(callOutcomeUnheard({ items: items.slice(0, 1) }, false)).not.toBeNull();
  });
});
