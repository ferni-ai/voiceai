/**
 * Per-call context is released at call end. setupCallTypeContexts stores each
 * call's context (the inbound caller, the outbound call, the proactive reason)
 * under its session id and its room. A worker serves call after call, so a
 * context no end path removes would outlive its call, and a later call in the
 * same room could read it under the room key.
 *
 * Runs the real setup, release and end wiring on fictional calls.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const { setupCallTypeContexts, finishCallTypeContexts } = await import('../metadata-parser.js');
const { callTypeEnd, releaseCallTypeContexts } = await import('../call-end.js');
const inbound =
  await import('../../../intelligence/context-builders/external/inbound-call-context.js');
const outbound =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const proactive =
  await import('../../../intelligence/context-builders/external/proactive-session-context.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');

const SECRET = 'test-livekit-secret';
/** The stores' cap (call-context-cap.ts): about 1,000 calls at two keys each. */
const CALL_CONTEXT_MAX_KEYS = 2_000;

const WREN = {
  phone: '+15550100111',
  name: 'Wren Okafor',
  notes: 'Prefers mornings; ask about the garden.',
};

const inboundCall = (who = WREN): Record<string, unknown> => ({
  type: 'inbound_call',
  callSid: `CA-${who.name}`,
  callerPhone: who.phone,
  callerName: who.name,
  userId: 'sponsored-wren',
  sponsoredIdentityId: 'sponsored-wren',
  sponsorUserId: 'sponsor-ada',
  isKnownCaller: true,
  isVoiceEnrolled: false,
  relationship: "Ada's aunt",
  notes: who.notes,
});
const onBehalfCall = (): Record<string, unknown> => ({
  type: 'on_behalf_call',
  callId: 'ob-test-1',
  contact: { name: 'Dr. Pell', phone: '+15550100222' },
  purpose: 'Move the Tuesday appointment',
  script: 'Ask for Thursday morning.',
});
const familyCheckin = (): Record<string, unknown> => ({
  type: 'family_checkin',
  callId: 'fc-test-1',
  familyMemberName: 'Wren Okafor',
  sponsorName: 'Ada',
  sponsorUserId: 'sponsor-ada',
  systemPrompt: 'Check in warmly.',
});
const proactiveCall = (): Record<string, unknown> => ({
  type: 'proactive_outreach',
  triggerType: 'mood_concern',
  triggerReason: 'Sounded tired last time',
  lastMood: 'tired',
  lastSessionSummary: 'Talked about a long week.',
  openerStyle: 'gentle',
});

/** Every getter a call's context is read through, for one key. */
function contextsUnder(key: string): unknown[] {
  return [
    inbound.getInboundCallContext(key),
    outbound.getOutboundCallContext(key),
    proactive.getProactiveSessionContext(key),
    proactive.isProactiveSession(key) || undefined,
  ].filter((c) => c !== undefined);
}

/** Set up a call exactly as the agent does: signed job metadata, through the real parser. */
async function startCall(
  dispatch: Record<string, unknown>,
  sessionId: string,
  room: string | undefined,
  signed = true
): Promise<Record<string, unknown>> {
  const raw = JSON.stringify(signed ? signDispatch(dispatch, SECRET) : dispatch);
  const metadata = JSON.parse(raw) as Record<string, unknown>;
  await setupCallTypeContexts(metadata, dispatch.type as string, sessionId, room, raw);
  return metadata;
}

const usedKeys = new Set<string>();
const key = (k: string): string => (usedKeys.add(k), k);

let priorSecret: string | undefined;
beforeAll(() => {
  priorSecret = process.env.LIVEKIT_API_SECRET;
  process.env.LIVEKIT_API_SECRET = SECRET;
});
afterAll(() => {
  process.env.LIVEKIT_API_SECRET = priorSecret;
});
afterEach(() => {
  for (const k of usedKeys) {
    inbound.clearInboundCallContext(k);
    outbound.clearOutboundCallContext(k);
    proactive.clearProactiveSessionContext(k);
  }
  usedKeys.clear();
});

describe('releaseCallTypeContexts', () => {
  it.each([
    ['inbound', inboundCall, true],
    ['on-behalf', onBehalfCall, false], // unsigned: the context is set without starting call state
    ['family check-in', familyCheckin, true],
    ['proactive outreach', proactiveCall, true],
  ] as const)(
    'releases a %s call under its session id and its room',
    async (kind, make, signed) => {
      const sessionId = key(`s-${kind}`);
      const room = key(`room-${kind}`);
      const metadata = await startCall(make(), sessionId, room, signed);
      expect(contextsUnder(sessionId)).not.toHaveLength(0);
      expect(contextsUnder(room)).not.toHaveLength(0);

      await releaseCallTypeContexts(metadata, sessionId, room);

      expect(contextsUnder(sessionId)).toEqual([]);
      expect(contextsUnder(room)).toEqual([]);
    }
  );

  it('releases an on-behalf call with no room under its call-<callId> key', async () => {
    const sessionId = key('s-ob-roomless');
    key('call-ob-test-1');
    const metadata = await startCall(onBehalfCall(), sessionId, undefined, false);
    expect(outbound.getOutboundCallContext('call-ob-test-1')).toBeDefined();

    await releaseCallTypeContexts(metadata, sessionId, undefined);

    expect(contextsUnder('call-ob-test-1')).toEqual([]);
    expect(contextsUnder(sessionId)).toEqual([]);
  });

  it("a later call in the same room never sees the earlier caller's context", async () => {
    const room = key('room-reused');
    const first = await startCall(inboundCall(), key('s-first'), room);
    await releaseCallTypeContexts(first, 's-first', room); // the first call ends

    // An app call in the same room sets no call-type context of its own.
    await setupCallTypeContexts({}, undefined, key('s-app'), room);
    const seen = JSON.stringify([...contextsUnder('s-app'), ...contextsUnder(room)]);
    for (const detail of Object.values(WREN)) expect(seen).not.toContain(detail);

    // A new inbound caller in that room gets their own context, not the first one.
    const juno = { phone: '+15550100333', name: 'Juno Marsh', notes: 'New caller.' };
    await startCall(inboundCall(juno), key('s-next'), room);
    expect(inbound.getInboundCallContext(room)?.callerName).toBe('Juno Marsh');
    expect(JSON.stringify(contextsUnder(room))).not.toContain(WREN.notes);
  });

  it("a late release from an earlier call keeps the room's newer context", async () => {
    const room = key('room-overlap');
    const first = await startCall(inboundCall(), key('s-early'), room);
    const juno = { phone: '+15550100333', name: 'Juno Marsh', notes: 'New caller.' };
    await startCall(inboundCall(juno), key('s-late'), room); // same room, before the first call's end ran

    await releaseCallTypeContexts(first, 's-early', room);

    expect(inbound.getInboundCallContext('s-early')).toBeUndefined();
    expect(inbound.getInboundCallContext(room)?.callerName).toBe('Juno Marsh');
    expect(inbound.getInboundCallContext('s-late')?.callerName).toBe('Juno Marsh');
  });
});

describe('callTypeEnd', () => {
  it('on shutdown, releases only after the call report has read the context', async () => {
    const callbacks: Array<() => Promise<void>> = [];
    const sessionId = key('s-report');
    const room = key('room-report');
    const metadata = await startCall(onBehalfCall(), sessionId, room, false);
    let reportSaw: unknown = 'not run';
    callTypeEnd(
      { addShutdownCallback: (cb) => void callbacks.push(cb) },
      async () => {
        await new Promise((r) => {
          setTimeout(r, 20);
        }); // the report's own reads take time
        reportSaw = outbound.getOutboundCallContext(sessionId)?.callId;
      },
      () => releaseCallTypeContexts(metadata, sessionId, room)
    );

    await Promise.all(callbacks.map((cb) => cb())); // LiveKit runs shutdown callbacks in parallel

    expect(reportSaw).toBe('ob-test-1');
    expect(contextsUnder(sessionId)).toEqual([]);
    expect(contextsUnder(room)).toEqual([]);
  });
});

describe('voice entry exit paths', () => {
  const entry = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8').split(
    '\n'
  );
  const lineOf = (pattern: RegExp, from = 0): number => {
    const i = entry.findIndex((line, n) => n >= from && pattern.test(line));
    if (i < 0) throw new Error(`index.ts: no line matches ${pattern}`);
    return i;
  };
  const multiStart = lineOf(/Multi-agent session returned/);
  const multiEnd = lineOf(/unregisterSession\(sessionId, 'multi_agent_exit'\)/);
  const cleanStart = lineOf(/= await runUntilCallEnds\(/); // it closes the agent session
  const cleanEnd = lineOf(/unregisterSession\(sessionId, 'clean_exit'\)/);
  const crashStart = lineOf(/^ {2}\} catch \(error\) \{/, cleanEnd);
  const crashEnd = lineOf(/unregisterSession\(sessionId, `crash_in_/, crashStart);

  /** The order of finish, session close and release on one exit path, read from index.ts. */
  function stepsOf(from: number, to: number): string[] {
    return entry.slice(from, to + 1).flatMap((line) => {
      if (/^\s*\/\//.test(line)) return [];
      if (/await (finishCallType)(\?\.)?\(\)/.test(line)) return ['finish'];
      if (/await releaseCallType(\?\.)?\(\)/.test(line)) return ['release'];
      if (/await closeAgentSession\(|= await runUntilCallEnds\(/.test(line)) return ['close'];
      return [];
    });
  }

  it.each([
    ['multi_agent_exit', multiStart, multiEnd],
    ['clean_exit', cleanStart, cleanEnd],
    ['crash', crashStart, crashEnd],
  ] as const)(
    '%s: a turn before the session closes still sees the third party on the line',
    async (path, from, to) => {
      const steps = stepsOf(from, to);
      expect([...steps].sort()).toEqual(['close', 'finish', 'release']);

      const { outboundPartiesFor } = await import('../../shared/outbound-opener.js');
      const sessionId = key(`s-path-${path}`);
      const room = key(`room-path-${path}`);
      const metadata = await startCall(onBehalfCall(), sessionId, room, false);
      const end = callTypeEnd(
        { addShutdownCallback: () => undefined },
        async () =>
          finishCallTypeContexts(metadata, 'on_behalf_call', sessionId, 60_000, undefined),
        async () => releaseCallTypeContexts(metadata, sessionId, room)
      );
      let closed = false;
      for (const step of steps) {
        // Until the session closes, a turn can still run and ask who is on the line.
        if (!closed) expect(outboundPartiesFor(sessionId), `before ${step}`).toBeDefined();
        // eslint-disable-next-line no-await-in-loop -- the steps run in the path's order
        if (step === 'finish') await end.finish();
        // eslint-disable-next-line no-await-in-loop -- the steps run in the path's order
        if (step === 'release') await end.release();
        if (step === 'close') closed = true;
      }
      expect(contextsUnder(sessionId)).toEqual([]);
      expect(contextsUnder(room)).toEqual([]);
    }
  );

  it('the crash path finishes before it closes the session, and releases after', () => {
    expect(stepsOf(crashStart, crashEnd)).toEqual(['finish', 'close', 'release']);
  });

  it('every exit path releases right before it unregisters the session', () => {
    for (const end of [multiEnd, cleanEnd, crashEnd]) {
      expect(entry.slice(end - 3, end).join('\n'), `before line ${end + 1}`).toMatch(
        /await releaseCallType(\?\.)?\(\)/
      );
    }
  });
});

describe('call context stores are capped', () => {
  it.each([
    [
      'inbound',
      (k: string) => inbound.setInboundCallContext(k, inboundCall() as never),
      inbound.getInboundCallContext,
    ],
    [
      'outbound',
      (k: string) => outbound.setOutboundCallContext(k, onBehalfCall() as never),
      outbound.getOutboundCallContext,
    ],
    [
      'proactive',
      (k: string) => proactive.setProactiveSessionContext(k, proactiveCall() as never),
      proactive.getProactiveSessionContext,
    ],
  ] as const)('the %s store drops its oldest key past the cap', (_store, set, get) => {
    for (let i = 0; i < CALL_CONTEXT_MAX_KEYS; i++) set(key(`cap-${i}`));
    set('cap-0'); // set again: now the newest
    set(key('cap-over'));

    expect(get('cap-0')).toBeDefined();
    expect(get('cap-1')).toBeUndefined();
    expect(get('cap-2')).toBeDefined();
    expect(get('cap-over')).toBeDefined();
  });
});
