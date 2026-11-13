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

const { setupCallTypeContexts } = await import('../metadata-parser.js');
const { callEndFor } = await import('../call-end.js');
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

interface Call {
  sessionId: string;
  /** The call's end as the entrypoint wires it: the real report, then the real release. */
  end: (steps?: { finish?: () => Promise<void> }) => ReturnType<typeof callEndFor>;
  /** Shutdown callbacks the call's end registered, as LiveKit holds them. */
  shutdown: () => Promise<unknown>;
}

/** Set up a call exactly as the agent does: signed job metadata, through the real parser. */
async function startCall(
  dispatch: Record<string, unknown>,
  sessionId: string,
  room: string | undefined,
  signed = true
): Promise<Call> {
  const raw = JSON.stringify(signed ? signDispatch(dispatch, SECRET) : dispatch);
  const metadata = JSON.parse(raw) as Record<string, unknown>;
  const callType = dispatch.type as string | undefined;
  await setupCallTypeContexts(metadata, callType, sessionId, room, raw);
  const callbacks: Array<() => Promise<void>> = [];
  const ctx = {
    addShutdownCallback: (cb: () => Promise<void>) => void callbacks.push(cb),
    job: { metadata: raw, room: room === undefined ? undefined : { name: room } },
  };
  return {
    sessionId,
    end: (steps) =>
      callEndFor(ctx, { metadata, callType, sessionId, startTime: Date.now() - 60_000 }, steps),
    shutdown: () => Promise.all(callbacks.map((cb) => cb())), // LiveKit runs them in parallel
  };
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

describe('call end releases the call context', () => {
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
      const call = await startCall(make(), sessionId, room, signed);
      expect(contextsUnder(sessionId)).not.toHaveLength(0);
      expect(contextsUnder(room)).not.toHaveLength(0);

      await call.end().end();

      expect(contextsUnder(sessionId)).toEqual([]);
      expect(contextsUnder(room)).toEqual([]);
    }
  );

  it('releases an on-behalf call with no room under its call-<callId> key', async () => {
    const sessionId = key('s-ob-roomless');
    key('call-ob-test-1');
    const call = await startCall(onBehalfCall(), sessionId, undefined, false);
    expect(outbound.getOutboundCallContext('call-ob-test-1')).toBeDefined();

    await call.end().end();

    expect(contextsUnder('call-ob-test-1')).toEqual([]);
    expect(contextsUnder(sessionId)).toEqual([]);
  });

  it("a later call in the same room never sees the earlier caller's context", async () => {
    const room = key('room-reused');
    const first = await startCall(inboundCall(), key('s-first'), room);
    await first.end().end(); // the first call ends

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

    await first.end().end();

    expect(inbound.getInboundCallContext('s-early')).toBeUndefined();
    expect(inbound.getInboundCallContext(room)?.callerName).toBe('Juno Marsh');
    expect(inbound.getInboundCallContext('s-late')?.callerName).toBe('Juno Marsh');
  });
});

describe('callEndFor', () => {
  it('on shutdown, releases only after the call report has read the context', async () => {
    const sessionId = key('s-report');
    const room = key('room-report');
    const call = await startCall(onBehalfCall(), sessionId, room, false);
    let reportSaw: unknown = 'not run';
    call.end({
      finish: async () => {
        await new Promise((r) => {
          setTimeout(r, 20);
        }); // the report's own reads take time
        reportSaw = outbound.getOutboundCallContext(sessionId)?.callId;
      },
    });

    await call.shutdown();

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
  const range = (from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // From the context setup on, every line each exit path can run, in order.
  const setup = lineOf(/await setupCallTypeContexts\(/);
  const multiBranch = lineOf(/if \(multiAgentActivatedEarly \|\| roomClosedEarly/, setup);
  const multiEnd = lineOf(/unregisterSession\(sessionId, 'multi_agent_exit'\)/, multiBranch);
  const multiReturn = lineOf(/^\s*return;/, multiEnd);
  const cleanEnd = lineOf(/unregisterSession\(sessionId, 'clean_exit'\)/, multiReturn);
  const crashStart = lineOf(/^ {2}\} catch \(error\) \{/, cleanEnd);
  const crashEnd = lineOf(/unregisterSession\(sessionId, `crash_in_/, crashStart);
  const paths = [
    ['multi_agent_exit', range(setup, multiEnd)],
    ['clean_exit', [...range(setup, multiBranch - 1), ...range(multiReturn + 1, cleanEnd)]],
    ['crash', range(crashStart, crashEnd)],
  ] as const;

  /** The order of the call report, session close and call end on one exit path, read from index.ts. */
  function stepsOf(lines: readonly number[], withUntimed = false): string[] {
    return lines.flatMap((n) => {
      const line = entry[n];
      if (/^\s*\/\//.test(line)) return [];
      if (/callEnd\??\.end\(/.test(line)) return ['end'];
      if (/callEnd\??\.report\(/.test(line)) return ['report'];
      if (/await closeAgentSession\(|= await runUntilCallEnds\(/.test(line)) return ['close'];
      // The crash path's steps with no timeout of their own.
      if (withUntimed && /analyzeFailure\(|await runSessionCleanup\(|cleanupHandlers\)/.test(line))
        return ['untimed'];
      return [];
    });
  }

  it.each(paths.slice(0, 2))(
    '%s: the call ends once, after the agent session is closed',
    (_path, lines) => {
      expect(stepsOf(lines)).toEqual(['close', 'end']);
    }
  );

  it('crash: reports first, before every step with no timeout, and releases after the close', () => {
    const [, , [, crash]] = paths;
    expect(stepsOf(crash, true)).toEqual([
      'report',
      'untimed', // analyzeFailure (the diagnosis model call)
      'untimed', // runSessionCleanup
      'untimed', // the cleanupHandlers loop
      'close',
      'end',
    ]);
  });

  it.each(paths)(
    '%s: a turn before the session closes still sees the third party on the line',
    async (path, lines) => {
      const { outboundPartiesFor } = await import('../../shared/outbound-opener.js');
      const sessionId = key(`s-path-${path}`);
      const room = key(`room-path-${path}`);
      const call = (await startCall(onBehalfCall(), sessionId, room, false)).end();
      let closed = false;
      for (const step of stepsOf(lines)) {
        // Until the session closes, a turn can still run and ask who is on the line.
        if (!closed) expect(outboundPartiesFor(sessionId), `before ${step}`).toBeDefined();
        // eslint-disable-next-line no-await-in-loop -- the steps run in the path's order
        if (step === 'end') await call.end();
        // eslint-disable-next-line no-await-in-loop -- the steps run in the path's order
        if (step === 'report') await call.report();
        if (step === 'close') closed = true;
      }
      expect(contextsUnder(sessionId)).toEqual([]);
      expect(contextsUnder(room)).toEqual([]);
    }
  );
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
