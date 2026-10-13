/**
 * Replay of Seth's prod call 2026-10-12 (AJ_4NnxgzjEHHX8) through the real
 * session-state handler and the real silence blockers. Each step is one quiet
 * spell after a caller turn, with whether his music was playing and what the
 * model proposed into that silence on the call. The mocked safeGenerateReply
 * streams the proposal through filterSilenceReply, as PersonaVoiceAgent.llmNode
 * does, and records what would be spoken.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';

import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { safeGenerateReply, dj } = vi.hoisted(() => ({
  safeGenerateReply: vi.fn(),
  dj: { active: false },
}));

vi.mock('../../shared/safe-generate-reply.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/safe-generate-reply.js')>()),
  safeGenerateReply,
}));
vi.mock('../../../audio/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../audio/index.js')>()),
  getDJController: () => ({ isMusicActive: () => dj.active, getState: () => ({}) }),
}));

import { filterSilenceReply, isBarePresenceCheck, isPresenceCheck } from '../presence-check.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

const SEC = 1000;

/** [seconds of quiet before LiveKit marks him away, music playing?, what the model proposed] */
type Step = [quietSec: number, music: boolean, proposal: string];

/** The unprompted lines on the call, in order (times are when Ferni spoke). */
const CALL: Step[] = [
  [16, false, "You, uh, called me Freddy. [laughter] Who's Freddy?"], // 09:48:02
  [16, true, 'Mm?'], // 09:48:40, acoustic guitar playing
  [17, true, 'You still there, or did the music put you to sleep too?'], // 09:51:53
  [18, true, 'You there?'], // 09:52:33
  [16, true, 'Yeah?'], // 09:52:55
  [17, true, 'I am just, uh, sipping some cold coffee and watching the light change. it is quiet.'], // 09:53:21
  [16, true, 'Yeah? You there?'], // 09:54:15
  [16, false, 'Mm?'], // 09:54:44, after the last preview ended
  [17, false, 'Yeah?'], // 09:55:32
];

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
  let asked = 0;
  let proposal = '';
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
  safeGenerateReply.mockImplementation(async (s: object, opts: { fallbackMessage?: string }) => {
    asked++;
    const says = proposal;
    const reply = new ReadableStream<object>({
      start(controller) {
        controller.enqueue({ id: 'c', delta: { role: 'assistant', content: says } });
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
  });
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
    sessionId: `remark-replay-${Math.random().toString(36).slice(2)}`,
    room,
  } as unknown as SessionStateContext);
  const userState = (newState: string, oldState: string) =>
    emit(voice.AgentSessionEventTypes.UserStateChanged, { newState, oldState });
  /** He says a word or two, goes quiet, LiveKit marks him away, Ferni may remark. */
  const step = async ([quietSec, music, says]: Step) => {
    userState('speaking', 'listening');
    await vi.advanceTimersByTimeAsync(2 * SEC);
    userState('listening', 'speaking');
    dj.active = music;
    proposal = says;
    await vi.advanceTimersByTimeAsync(quietSec * SEC);
    userState('away', 'listening');
    await vi.advanceTimersByTimeAsync(SEC); // the remark is fire-and-forget
  };
  return { spoken, asked: () => asked, result, step, room };
}

const checks = (spoken: string[]) =>
  spoken.filter((s) => isPresenceCheck(s) || isBarePresenceCheck(s)).length;

describe('2026-10-12 prod replay: remarks into a quiet caller', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.PROMPT_MODE = 'character';
    delete process.env.PRESENCE_CHECK_CAP;
    delete process.env.SILENCE_REMARK_GUARD;
    delete process.env.SILENCE_INTERVALS;
    safeGenerateReply.mockReset();
    dj.active = false;
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...saved };
  });

  it('flags off (before): all nine go out, seven of them checks, as on the call', async () => {
    const t = setup();
    for (const s of CALL) await t.step(s);
    t.result.clearTimers();
    expect(t.spoken).toHaveLength(9);
    expect(checks(t.spoken)).toBe(7);
  });

  it('PRESENCE_CHECK_CAP alone (#1022) still lets the bare "Mm?" / "Yeah?" through', async () => {
    process.env.PRESENCE_CHECK_CAP = 'on';
    const t = setup();
    for (const s of CALL) await t.step(s);
    t.result.clearTimers();
    expect(t.spoken).toContain('Mm?');
    expect(t.spoken).toContain('Yeah?');
  });

  it('SILENCE_REMARK_GUARD on (after): nothing over the music, no bare check, one remark a minute', async () => {
    process.env.SILENCE_REMARK_GUARD = 'on';
    process.env.PRESENCE_CHECK_CAP = 'on';
    const t = setup();
    for (const s of CALL) await t.step(s);
    t.result.clearTimers();
    // Only the Freddy remark (before the music) is spoken.
    expect(t.spoken).toEqual([CALL[0][2]]);
    expect(checks(t.spoken)).toBe(0);
    // Asked: the Freddy remark and the "Mm?" at 09:54:44 (dropped); the music
    // blocked six, and the "Yeah?" 50 s after that "Mm?" was held.
    expect(t.asked()).toBe(2);
  });

  it('one remark a minute: a second silence 30 s later is held, 70 s later it goes out', async () => {
    process.env.SILENCE_REMARK_GUARD = 'on';
    const say = 'Barnaby just knocked the spoon off the counter.';
    const t = setup();
    await t.step([16, false, say]);
    await t.step([16, false, say]); // ~19 s later: held
    await t.step([50, false, say]); // ~53 s after that, 72 s after the first: goes out
    t.result.clearTimers();
    expect(t.spoken).toEqual([say, say]);
    expect(t.asked()).toBe(2);
  });

  it('guard on: when the caller\'s microphone drops, a bare "You there?" goes out', async () => {
    process.env.SILENCE_REMARK_GUARD = 'on';
    const t = setup();
    t.room.pubs.clear(); // his audio track is unpublished
    await t.step([16, false, 'You there?']);
    t.result.clearTimers();
    expect(t.spoken).toEqual(['You there?']);
  });
});
