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
  const exits = entry.flatMap((line, i) => (/unregisterSession\(sessionId,/.test(line) ? [i] : []));

  it('every exit path releases the call context before it unregisters the session', () => {
    expect(exits).toHaveLength(3); // multi-agent, clean, crash
    for (const i of exits) {
      expect(entry.slice(i - 3, i).join('\n'), `before line ${i + 1}`).toMatch(
        /await releaseCallType(\?\.)?\(\)/
      );
    }
  });

  it('the crash path releases only after it closes the agent session', () => {
    const crash = exits[exits.length - 1];
    const before = entry.slice(crash - 3, crash).join('\n');
    const close = before.indexOf('closeAgentSession(');
    expect(close).not.toBe(-1);
    expect(before.indexOf('releaseCallType')).toBeGreaterThan(close);
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
