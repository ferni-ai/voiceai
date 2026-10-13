/**
 * Replay of the 2026-10-11 dev call through the real session-state handler
 * (character mode): the caller goes quiet ~28 s after their last turn, Ferni's
 * long-silence remark goes out, the caller says "I'm still here", talks for
 * ~2 min, and goes quiet again. The model always proposes "Mm? You still
 * there?". The mocked safeGenerateReply stands in for the gateway and
 * PersonaVoiceAgent.llmNode: it streams the model's words through
 * filterSilenceReply, exactly as llmNode does, and counts what would be spoken.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';

import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { safeGenerateReply } = vi.hoisted(() => ({ safeGenerateReply: vi.fn() }));

vi.mock('../../shared/safe-generate-reply.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/safe-generate-reply.js')>()),
  safeGenerateReply,
}));
vi.mock('../silence-response-blockers.js', () => ({ silenceResponseBlocked: () => false }));

import { filterSilenceReply, NO_PRESENCE_CHECK_NOTE } from '../presence-check.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

const MODEL_SAYS = 'Mm? You still there?';
const SEC = 1000;

function callerRoom() {
  const pubs = new Map<string, unknown>([['TR_mic', { kind: 1, muted: false }]]);
  return Object.assign(new EventEmitter(), {
    remoteParticipants: new Map<string, unknown>([
      ['caller', { identity: 'caller', trackPublications: pubs }],
    ]),
    pubs,
  });
}

function setup(room = callerRoom()) {
  const spoken: string[] = [];
  const asked: string[] = [];
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const session = {
    agentState: 'listening',
    userState: 'listening',
    on: (evt: string, h: (e: unknown) => void) => {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt)?.add(h);
    },
    off: (evt: string, h: (e: unknown) => void) => handlers.get(evt)?.delete(h),
    interrupt: () => undefined,
  };
  safeGenerateReply.mockImplementation(
    async (s: object, opts: { instructions: string; fallbackMessage?: string }) => {
      asked.push(opts.instructions);
      const reply = new ReadableStream<object>({
        start(controller) {
          controller.enqueue({ id: 'c', delta: { role: 'assistant', content: MODEL_SAYS } });
          controller.close();
        },
      });
      let text = '';
      for await (const c of filterSilenceReply(s, reply) as unknown as AsyncIterable<{
        delta?: { content?: string };
      }>)
        text += c.delta?.content ?? '';
      if (text) spoken.push(text);
      else if (opts.fallbackMessage) spoken.push(opts.fallbackMessage);
      return { success: true, usedFallback: false };
    }
  );
  const emit = (evt: string, e: unknown) => {
    for (const h of [...(handlers.get(evt) ?? [])]) {
      try {
        h(e);
      } catch {
        // Later, unrelated work in the handler may need a live session; not under test.
      }
    }
  };
  const result = setupSessionStateHandlers({
    session,
    sessionPersona: { id: 'ferni', name: 'Ferni' },
    conversationManager: {
      isAgentSpeaking: () => false,
      handleUserFinishedSpeaking: () => undefined,
      handleAgentStartedSpeaking: () => undefined,
    },
    userData: {},
    sessionId: `presence-replay-${Math.random().toString(36).slice(2)}`,
    room,
  } as unknown as SessionStateContext);
  const userState = (newState: string, oldState: string) =>
    emit(voice.AgentSessionEventTypes.UserStateChanged, { newState, oldState });
  /** The caller says something that takes `talkMs`. */
  const callerTurn = async (talkMs = 2 * SEC) => {
    userState('speaking', 'listening');
    await vi.advanceTimersByTimeAsync(talkMs);
    userState('listening', 'speaking');
  };
  /** The caller stays quiet for `ms`, then LiveKit marks them away. */
  const quiet = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    userState('away', 'listening');
    await vi.advanceTimersByTimeAsync(SEC); // the remark is fire-and-forget
  };
  return { spoken, asked, result, callerTurn, quiet, room };
}

/** The 2026-10-11 timeline; `gapSec` is how long the caller talks between the two silences. */
async function replay(t: ReturnType<typeof setup>, gapSec = 150) {
  await t.callerTurn(); // the caller's last turn before going quiet
  await t.quiet(26 * SEC); // ~28 s after they started speaking: remark 1
  await t.callerTurn(); // "I'm still here."
  for (let s = 0; s < gapSec - 30; s += 20) {
    await t.callerTurn(3 * SEC); // the conversation goes on
    await vi.advanceTimersByTimeAsync(17 * SEC);
  }
  await t.callerTurn();
  await t.quiet(26 * SEC); // quiet again: remark 2
}

const presenceChecks = (spoken: string[]) => spoken.filter((s) => s === MODEL_SAYS).length;

describe('2026-10-11 replay: "you still there?" into a quiet caller', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.PROMPT_MODE = 'character';
    delete process.env.PRESENCE_CHECK_CAP;
    delete process.env.PRESENCE_CHECK_MIN_GAP_MS;
    delete process.env.SILENCE_INTERVALS;
    safeGenerateReply.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...saved };
  });

  it('flag off (before): both silences get a presence check, as on the call', async () => {
    const t = setup();
    await replay(t);
    t.result.clearTimers();
    expect(t.asked).toHaveLength(2);
    expect(presenceChecks(t.spoken)).toBe(2);
    expect(t.asked.some((i) => i.includes(NO_PRESENCE_CHECK_NOTE))).toBe(false);
  });

  it('flag on (after): the second check, 2.5 min after the first, is blocked', async () => {
    process.env.PRESENCE_CHECK_CAP = 'on';
    const t = setup();
    await replay(t);
    t.result.clearTimers();
    expect(t.asked).toHaveLength(2); // the silence path still ran twice
    expect(presenceChecks(t.spoken)).toBe(1);
    expect(t.asked[0]).not.toContain(NO_PRESENCE_CHECK_NOTE);
    expect(t.asked[1]).toContain(NO_PRESENCE_CHECK_NOTE);
  });

  it('flag on: with more than 3 minutes between the silences, the second check is allowed', async () => {
    process.env.PRESENCE_CHECK_CAP = 'on';
    const t = setup();
    await replay(t, 200);
    t.result.clearTimers();
    expect(presenceChecks(t.spoken)).toBe(2);
  });

  it("flag on: when the caller's microphone track drops, the second check goes out", async () => {
    process.env.PRESENCE_CHECK_CAP = 'on';
    const t = setup();
    await t.callerTurn();
    await t.quiet(26 * SEC);
    await t.callerTurn();
    t.room.pubs.clear(); // the caller's audio track is unpublished
    await t.quiet(40 * SEC);
    t.result.clearTimers();
    expect(presenceChecks(t.spoken)).toBe(2);
  });

  it('flag on: a poor-connection event from the caller also allows it', async () => {
    process.env.PRESENCE_CHECK_CAP = 'on';
    const t = setup();
    await t.callerTurn();
    await t.quiet(26 * SEC);
    await t.callerTurn();
    t.room.emit('connectionQualityChanged', 0, { identity: 'caller' });
    await t.quiet(40 * SEC);
    t.result.clearTimers();
    expect(presenceChecks(t.spoken)).toBe(2);
  });
});
